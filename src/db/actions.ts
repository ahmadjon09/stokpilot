import {
  db, uid, addLog, type Customer, type LedgerDirection, type LedgerEntry, type LedgerSource,
  type MoveType, type PayType, type Product, type Sale, type SaleItem,
} from './db';
import { buildLedgerEntry, ledgerDelta } from './ledger';
import { round2 } from '../shared/lib/format';

/** Zaxira harakati: in(+) / out(-) / recount(mutlaq qiymat) */
export async function applyMove(params: {
  productId: string;
  type: Exclude<MoveType, 'sale' | 'return'>;
  qty: number; // 'recount' uchun — yangi mutlaq qiymat
  note: string;
}): Promise<void> {
  const { productId, type, qty, note } = params;
  await db.transaction('rw', db.products, db.moves, db.logs, async () => {
    const p = await db.products.get(productId);
    if (!p) throw new Error('product_not_found');
    let delta = 0;
    if (type === 'in') delta = Math.abs(qty);
    else if (type === 'out') delta = -Math.abs(qty);
    else if (type === 'recount') delta = round2(qty - p.stock);
    if (delta === 0) throw new Error('zero_delta');
    await db.products.update(productId, { stock: round2(p.stock + delta), updatedAt: Date.now() });
    await db.moves.add({
      id: uid(), productId, productName: p.name, type,
      qty: delta, note, createdAt: Date.now(),
    });
    await addLog('stock_move', `${p.name}: ${delta > 0 ? '+' : ''}${delta} (${type})`);
  });
}

/* ---------------------------------------------------------------------- */
/*  Qarz daftari — yagona kirish nuqtasi                                   */
/* ---------------------------------------------------------------------- */

/**
 * Kontragentga (mijoz yoki yetkazib beruvchi) bitta daftar yozuvini qo'shadi
 * va `Customer.balance` ni atomar yangilaydi.
 *
 * MUHIM: balans HECH QACHON to'g'ridan-to'g'ri `db.customers.update(...)`
 * bilan o'zgartirilmaydi — faqat shu funksiya orqali. Shu tufayli har bir
 * tiyin o'zgarishi tarixda (ledger) albatta aks etadi.
 *
 * Tranzaksiya ichida bo'lishi shart: chaqiruvchi `tx` doirasidan chiqmasin.
 */
export async function applyPartyEntry(input: {
  party: Customer;
  direction: LedgerDirection;
  amount: number;
  source?: LedgerSource;
  note?: string;
  method?: PayType | '';
  saleId?: string;
  saleNumber?: number;
  at?: number;
  /** Balansni qayta o'qish (bir tranzaksiyada ketma-ket yozuvlar uchun) */
  fresh?: Customer;
}): Promise<{ entry: LedgerEntry; party: Customer }> {
  const party = input.fresh ?? input.party;
  const amount = Math.abs(round2(input.amount));
  if (amount === 0) throw new Error('zero_amount');

  const balanceAfter = round2(party.balance + ledgerDelta(input.direction, amount, party.kind));
  const entry = buildLedgerEntry(input, uid(), balanceAfter);

  await db.ledger.add(entry);
  const next: Customer = { ...party, balance: balanceAfter };
  await db.customers.put(next);
  return { entry, party: next };
}

/** To'lov (mijoz qarzini to'ladi / biz yetkazib beruvchiga to'laymiz) */
export async function recordPayment(params: {
  partyId: string;
  amount: number;
  note?: string;
  method?: PayType | '';
  at?: number;
}): Promise<LedgerEntry> {
  const amount = Math.abs(round2(params.amount));
  if (!(amount > 0)) throw new Error('invalid_amount');

  return db.transaction('rw', db.customers, db.ledger, db.logs, async () => {
    const party = await db.customers.get(params.partyId);
    if (!party) throw new Error('party_not_found');

    const { entry } = await applyPartyEntry({
      party,
      direction: 'payment',
      amount,
      source: 'payment',
      note: params.note,
      method: params.method ?? '',
      at: params.at,
    });

    const verb = party.kind === 'supplier' ? 'yetkazib beruvchiga to\'lov' : 'qarz to\'lovi';
    await addLog('payment', `${party.name}: ${verb} ${amount}`);
    return entry;
  });
}

/**
 * Qarzni qo'lda tuzatish (masalan, eski daftardagi xatoni to'g'rilash).
 * `direction: 'charge'` — qarz oshadi, `'payment'` — kamayadi.
 */
export async function adjustDebt(params: {
  partyId: string;
  amount: number;
  direction: LedgerDirection;
  note?: string;
}): Promise<LedgerEntry> {
  const amount = Math.abs(round2(params.amount));
  if (!(amount > 0)) throw new Error('invalid_amount');

  return db.transaction('rw', db.customers, db.ledger, db.logs, async () => {
    const party = await db.customers.get(params.partyId);
    if (!party) throw new Error('party_not_found');
    const { entry } = await applyPartyEntry({
      party, direction: params.direction, amount, source: 'adjustment', note: params.note,
    });
    await addLog('debt_adjust', `${party.name}: ${params.direction} ${amount}`);
    return entry;
  });
}

/**
 * Daftar yozuvini o'chirish (xato kiritilgan to'lovni bekor qilish).
 *
 * Balans yozuvning ta'siri qadar orqaga qaytariladi, qolgan yozuvlarning
 * `balanceAfter` qiymatlari qayta hisoblanadi — shunda tarixda "uzilish"
 * bo'lmaydi.
 */
export async function deleteLedgerEntry(entryId: string): Promise<void> {
  await db.transaction('rw', db.customers, db.ledger, db.logs, async () => {
    const entry = await db.ledger.get(entryId);
    if (!entry) return;
    // Sotuvga bog'langan yozuv sotuv bilan birga yashaydi; `opening` esa
    // daftarning boshlang'ich nuqtasi — ikkalasi ham o'chirilmaydi.
    if (entry.source === 'sale') throw new Error('linked_entry');
    if (entry.source === 'opening') throw new Error('protected_entry');

    const party = await db.customers.get(entry.partyId);
    await db.ledger.delete(entryId);
    if (!party) return;

    const rest = await db.ledger.where('partyId').equals(entry.partyId).toArray();
    const ordered = rest.sort((a, b) => a.createdAt - b.createdAt);
    // Qolgan yozuvlarni noldan qayta o'tamiz
    let balance = 0;
    const patched: LedgerEntry[] = [];
    for (const e of ordered) {
      if (e.source === 'opening') {
        balance = round2(e.balanceAfter);
        continue;
      }
      balance = round2(balance + ledgerDelta(e.direction, e.amount, e.partyKind));
      if (round2(e.balanceAfter) !== balance) patched.push({ ...e, balanceAfter: balance });
    }
    if (patched.length) await db.ledger.bulkPut(patched);
    await db.customers.put({ ...party, balance });
    await addLog('ledger_delete', `${party.name}: yozuv o'chirildi (${entry.amount})`);
  });
}

/* ---------------------------------------------------------------------- */
/*  Sotuv (POS)                                                            */
/* ---------------------------------------------------------------------- */

export interface CheckoutInput {
  items: { product: Product; qty: number }[];
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  payType: PayType;
  /** Mavjud mijoz ID si (nasiyada majburiy, agar yangi mijoz yaratilmasa) */
  customerId: string;
  note: string;
  /**
   * Savat ichida yaratilgan yangi mijoz (Task 3).
   * Berilsa — sotuv tranzaksiyasi ichida yaratiladi va chek unga bog'lanadi;
   * `customerId` e'tiborga olinmaydi.
   */
  newCustomer?: { name: string; phone: string; note?: string };
  /** Nasiyada darhol to'langan qism (avans) — qolgani qarzga yoziladi */
  paidNow?: number;
}

export async function completeSale(input: CheckoutInput): Promise<Sale> {
  return db.transaction(
    'rw',
    [db.products, db.moves, db.sales, db.customers, db.ledger, db.logs],
    async () => {
      const last = await db.sales.orderBy('number').last();
      const number = (last?.number ?? 0) + 1;
      const items: SaleItem[] = input.items.map(({ product, qty }) => ({
        productId: product.id, name: product.name, unit: product.unit,
        price: product.price, cost: product.cost, qty,
      }));
      const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
      const costTotal = round2(items.reduce((s, i) => s + i.cost * i.qty, 0));
      let discount = 0;
      if (input.discountType === 'percent') discount = round2((subtotal * Math.min(Math.max(input.discountValue, 0), 100)) / 100);
      else if (input.discountType === 'amount') discount = round2(Math.min(Math.max(input.discountValue, 0), subtotal));
      const total = round2(subtotal - discount);
      const now = Date.now();
      const saleId = uid();

      /* --- 1) Nasiya: mijozni aniqlash yoki savat ichida yaratish ------- */
      let party: Customer | null = null;
      if (input.newCustomer) {
        const name = input.newCustomer.name.trim();
        if (!name) throw new Error('customer_name_required');
        party = {
          id: uid(),
          name,
          phone: (input.newCustomer.phone ?? '').trim(),
          kind: 'customer',
          balance: 0,
          note: (input.newCustomer.note ?? '').trim(),
          createdAt: now,
        };
        await db.customers.add(party);
      } else if (input.customerId) {
        party = (await db.customers.get(input.customerId)) ?? null;
      }

      if (input.payType === 'debt' && !party) throw new Error('customer_required');

      /* --- 2) Nasiya / to'lov qismlari --------------------------------- */
      // Nasiyada foydalanuvchi avans (darhol to'lov) kiritishi mumkin;
      // qolgan qism qarzga yoziladi. Avans chegarasi: 0 … total.
      const advance = round2(Math.min(Math.max(input.paidNow ?? 0, 0), total));
      const debtAmount = input.payType === 'debt' ? round2(total - advance) : 0;
      const paidAmount = round2(total - debtAmount);

      /* --- 3) Zaxira harakatlari --------------------------------------- */
      for (const it of items) {
        const p = await db.products.get(it.productId);
        if (!p) throw new Error('product_not_found');
        await db.products.update(it.productId, { stock: round2(p.stock - it.qty), updatedAt: now });
        await db.moves.add({
          id: uid(), productId: it.productId, productName: it.name,
          type: 'sale', qty: -it.qty, note: `#${number}`, createdAt: now, refId: saleId,
        });
      }

      /* --- 4) Chek ----------------------------------------------------- */
      const sale: Sale = {
        id: saleId, number, items, subtotal,
        discountType: input.discountType, discountValue: input.discountValue,
        total, costTotal, payType: input.payType,
        paidAmount, debtAmount,
        customerId: party?.id ?? '', customerName: party?.name ?? '',
        status: 'done', note: input.note, createdAt: now,
      };
      await db.sales.add(sale);

      /* --- 5) Qarz daftari: avans (payment) + qarz (charge) ------------ */
      if (party && input.payType === 'debt') {
        // Avans: darhol to'langan qism qarzni kamaytiradi... lekin qarz hali
        // yozilmagan. Shuning uchun avval to'liq qarz (charge), keyin avans
        // (payment) yoziladi — tarix "nasiyaga olindi → avans to'landi"
        // ko'rinishida bo'ladi va balans yakunda faqat qoldiq qarz bo'ladi.
        const charged = await applyPartyEntry({
          party, direction: 'charge', amount: total, source: 'sale',
          note: input.note, saleId: sale.id, saleNumber: sale.number, at: now,
        });
        if (paidAmount > 0) {
          await applyPartyEntry({
            party: charged.party, direction: 'payment', amount: paidAmount, source: 'payment',
            note: '', method: 'cash', saleId: sale.id, saleNumber: sale.number, at: now + 1,
          });
        }
      }

      await addLog('sale', `Sotuv #${number}: ${total}`);
      return sale;
    },
  );
}

export async function returnSale(saleId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.moves, db.sales, db.customers, db.ledger, db.logs],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale || sale.status === 'returned') return;
      const now = Date.now();
      for (const it of sale.items) {
        const p = await db.products.get(it.productId);
        if (p) await db.products.update(it.productId, { stock: round2(p.stock + it.qty), updatedAt: now });
        await db.moves.add({
          id: uid(), productId: it.productId, productName: it.name,
          type: 'return', qty: it.qty, note: `Qaytarish #${sale.number}`, createdAt: now, refId: sale.id,
        });
      }

      /*
       * Nasiya qaytarilsa — faqat HALI TO'LANMAGAN qism qarzdan chiqariladi.
       * Mijoz avans to'lagan bo'lsa, o'sha pul qaytarilishi kerak, lekin u
       * qarz emas — shuning uchun faqat `debtAmount` (yoki legacy uchun total)
       * teskari yoziladi. Balans manfiyga tushib ketmaydi.
       */
      if (sale.payType === 'debt' && sale.customerId) {
        const party = await db.customers.get(sale.customerId);
        if (party) {
          const outstanding = round2(Math.abs(sale.debtAmount ?? sale.total));
          const currentDebt = round2(Math.max(0, party.balance));
          const undo = round2(Math.min(outstanding, currentDebt));
          if (undo > 0) {
            await applyPartyEntry({
              party, direction: 'payment', amount: undo, source: 'return',
              note: `Chek #${sale.number} qaytarildi`, saleId: sale.id, saleNumber: sale.number, at: now,
            });
          }
        }
      }

      await db.sales.update(saleId, { status: 'returned' });
      await addLog('return', `Qaytarish #${sale.number}`);
    },
  );
}

/* ---------------------------------------------------------------------- */
/*  Kontragentlar                                                          */
/* ---------------------------------------------------------------------- */

/** Yangi kontragent — boshlang'ich qarz bo'lsa daftarga yoziladi */
export async function saveCustomer(rec: Customer): Promise<void> {
  await db.transaction('rw', db.customers, db.ledger, db.logs, async () => {
    const existing = await db.customers.get(rec.id);
    const previousBalance = round2(existing?.balance ?? 0);
    const target = round2(rec.balance);

    // Balansni faqat daftar orqali o'zgartiramiz: avval eski qiymat bilan
    // saqlaymiz, so'ng farqni yozuv sifatida qo'shamiz.
    await db.customers.put({ ...rec, balance: previousBalance });

    const diff = round2(target - previousBalance);
    if (diff !== 0) {
      if (!existing && previousBalance === 0) {
        // Yangi kontragent + boshlang'ich qarz → `opening` (mutlaq qiymat)
        const entry = buildLedgerEntry(
          { party: rec, direction: 'charge', amount: Math.abs(target), source: 'opening' },
          uid(),
          target,
        );
        await db.ledger.add(entry);
        await db.customers.put({ ...rec, balance: target });
      } else {
        // Mavjud kontragentda qo'lda tuzatish → `adjustment` (delta)
        await applyPartyEntry({
          party: { ...rec, balance: previousBalance },
          direction: diff > 0 ? 'charge' : 'payment',
          amount: Math.abs(diff),
          source: 'adjustment',
        });
      }
    }

    await addLog(existing ? 'customer_edit' : 'customer_new', rec.name);
  });
}

export async function deleteCustomer(customerId: string): Promise<void> {
  await db.transaction('rw', db.customers, db.ledger, db.logs, async () => {
    const c = await db.customers.get(customerId);
    await db.ledger.where('partyId').equals(customerId).delete();
    await db.customers.delete(customerId);
    if (c) await addLog('customer_delete', c.name);
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  await db.transaction('rw', db.products, db.images, db.moves, db.logs, async () => {
    const p = await db.products.get(productId);
    await db.images.where('productId').equals(productId).delete();
    await db.moves.where('productId').equals(productId).delete();
    await db.products.delete(productId);
    if (p) await addLog('delete_product', p.name);
  });
}
