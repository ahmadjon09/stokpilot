/**
 * Sxema migratsiyalari va ma'lumot tiklash (repair).
 *
 * MUHIM QOIDALAR
 *  1. Migratsiya hech qachon foydalanuvchi ma'lumotini o'chirmaydi — u faqat
 *     maydonlarni to'ldiradi/tiplashtiradi (validate.ts).
 *  2. Har bir qadam idempotent: yarim yo'lda uzilib qolsa, keyingi ishga
 *     tushishda xavfsiz qayta bajariladi.
 *  3. Migratsiya tranzaksiyasi ichida `db.*` ishlatilmaydi — faqat
 *     Dexie bergan `tx.table(...)`, aks holda "Transaction inactive" xatosi.
 */

import type { Transaction } from 'dexie';
import {
  validateCategory, validateCustomer, validateImage, validateLedgerEntry, validateLog, validateMove,
  validateProduct, validateReturn, validateSale,
} from './validate';
import type { Customer, ImageRec, LedgerEntry, Product, ReturnRec, Sale } from './db';
import { replayLedger } from './ledger';
import { discountFactor, returnedTotals, saleStatus } from './returns';
import { round2 } from '../shared/lib/format';

export interface MigrationReport {
  /** Jadval bo'yicha tikdan o'tgan yozuvlar soni */
  repaired: Record<string, number>;
  /** Jadval bo'yicha tashlab yuborilgan (tiklab bo'lmaydigan) yozuvlar */
  dropped: Record<string, number>;
  /** Jami o'zgargan yozuvlar */
  total: number;
}

const emptyReport = (): MigrationReport => ({ repaired: {}, dropped: {}, total: 0 });

/**
 * Bir necha migratsiya qadamining hisobotini birlashtiradi.
 *
 * Nega kerak: har bir versiya o'z `.upgrade()` ini ishga tushiradi. Agar
 * hisobot har safar QAYTA yozilsa, foydalanuvchi faqat oxirgi qadamning
 * natijasini ko'radi (masalan v1→v2 da tuzatilgan 10 ta yozuv "yo'qoladi").
 * Shuning uchun qadamlar jamlanadi.
 */
export function mergeReports(a: MigrationReport | null, b: MigrationReport): MigrationReport {
  if (!a) return b;
  const out = emptyReport();
  for (const r of [a, b]) {
    for (const k of Object.keys(r.repaired)) out.repaired[k] = (out.repaired[k] ?? 0) + r.repaired[k];
    for (const k of Object.keys(r.dropped)) out.dropped[k] = (out.dropped[k] ?? 0) + r.dropped[k];
    out.total += r.total;
  }
  return out;
}

function bump(report: MigrationReport, kind: 'repaired' | 'dropped', table: string): void {
  report[kind][table] = (report[kind][table] ?? 0) + 1;
  if (kind === 'repaired') report.total += 1;
}

/** Jadvalni umumiy qoida bo'yicha tozalaydi: valid → bulkPut, invalid → bulkDelete */
async function normalizeTable<T>(
  tx: Transaction,
  table: string,
  validate: (raw: unknown, idHint?: string) => { value: T | null; changed: boolean },
  report: MigrationReport,
): Promise<void> {
  const t = tx.table(table);
  const rows: unknown[] = await t.toArray();
  const toPut: T[] = [];
  const toDelete: string[] = [];

  for (const raw of rows) {
    const idHint = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : undefined;
    const { value, changed } = validate(raw, idHint);
    if (!value) {
      if (idHint) toDelete.push(idHint);
      bump(report, 'dropped', table);
      continue;
    }
    if (changed) {
      toPut.push(value);
      bump(report, 'repaired', table);
    }
  }

  if (toPut.length) await t.bulkPut(toPut);
  if (toDelete.length) await t.bulkDelete(toDelete);
}

/**
 * Mahsulot rasmlari ro'yxatini `images` jadvali bilan moslashtiradi.
 * - Rasmi o'chirilgan, lekin `imageIds` da qolib ketgan ID lar olib tashlanadi;
 * - `images.productId` da bor, lekin `imageIds` da yo'q rasmlar qo'shiladi
 *   (eski versiyada rasm yuklash yarim yo'lda uzilgan holatlar).
 */
async function reconcileProductImages(tx: Transaction, report: MigrationReport): Promise<void> {
  const productsTable = tx.table('products');
  const imagesTable = tx.table('images');
  const products: Product[] = await productsTable.toArray();
  const images: ImageRec[] = await imagesTable.toArray();

  const byProduct = new Map<string, string[]>();
  for (const im of images) {
    if (!im.productId) continue;
    const list = byProduct.get(im.productId) ?? [];
    list.push(im.id);
    byProduct.set(im.productId, list);
  }

  const toPut: Product[] = [];
  for (const p of products) {
    const owned = byProduct.get(p.id) ?? [];
    const ownedSet = new Set(owned);
    const current = Array.isArray(p.imageIds) ? p.imageIds : [];
    // Mavjud (images jadvalida haqiqatan bor) ID lar + rasm jadvalidan topilganlar
    const next: string[] = [];
    for (const id of current) {
      if (ownedSet.has(id) && !next.includes(id)) next.push(id);
    }
    for (const id of owned) {
      if (!next.includes(id)) next.push(id);
    }
    const same = next.length === current.length && next.every((id, i) => id === current[i]);
    if (!same) {
      toPut.push({ ...p, imageIds: next });
      bump(report, 'repaired', 'products');
    }
  }
  if (toPut.length) await productsTable.bulkPut(toPut);
}

/**
 * Chek raqamlarini yagonalashtirish.
 * Eski bazada bir vaqtda ikkita sotuv yaratilsa `number` takrorlanishi mumkin
 * edi — bu holat chek qidiruvida noto'g'ri natija beradi.
 * Mavjud unikal raqamlar saqlanadi, takroriy/bo'sh raqamlarga yangi raqam beriladi.
 */
async function reconcileSaleNumbers(tx: Transaction, report: MigrationReport): Promise<void> {
  const salesTable = tx.table('sales');
  const sales: Sale[] = await salesTable.toArray();
  if (sales.length === 0) return;

  const seen = new Set<number>();
  let maxNumber = 0;
  for (const s of sales) if (Number.isFinite(s.number) && s.number > maxNumber) maxNumber = s.number;

  const ordered = [...sales].sort((a, b) => a.createdAt - b.createdAt);
  let nextFree = maxNumber + 1;
  const toPut: Sale[] = [];

  for (const s of ordered) {
    const n = Math.trunc(s.number);
    if (n > 0 && !seen.has(n)) {
      seen.add(n);
      if (n !== s.number) toPut.push({ ...s, number: n });
      continue;
    }
    toPut.push({ ...s, number: nextFree });
    seen.add(nextFree);
    nextFree += 1;
  }

  if (toPut.length) {
    await salesTable.bulkPut(toPut);
    for (let i = 0; i < toPut.length; i++) bump(report, 'repaired', 'sales');
  }
}

/**
 * Butun bazani tekshirib chiqadigan yadro funksiyasi.
 * `tx` — Dexie tranzaksiyasi (upgrade ichida ham, oddiy repair'da ham ishlaydi).
 */
export interface NormalizeOptions {
  /**
   * `ledger` jadvalini ham tekshirish.
   * FAQAT v3 upgrade tranzaksiyasi yoki tashqi tranzaksiya ichida true bo'ladi:
   * v2 upgrade tranzaksiyasida bu jadval hali mavjud emas ("Table ledger not
   * part of transaction" xatosi chiqadi).
   */
  ledger?: boolean;
  /** `returns` jadvalini tekshirish (faqat v4 tranzaksiyasida mavjud) */
  returns?: boolean;
}

export async function normalizeDatabase(
  tx: Transaction,
  options: NormalizeOptions = {},
): Promise<MigrationReport> {
  const report = emptyReport();

  // 1) Mustaqil jadvallar — validatsiya va to'ldirish
  await normalizeTable(tx, 'categories', validateCategory, report);
  await normalizeTable(tx, 'products', validateProduct, report);
  await normalizeTable(tx, 'images', validateImage, report);
  await normalizeTable(tx, 'moves', validateMove, report);
  await normalizeTable(tx, 'sales', validateSale, report);
  await normalizeTable(tx, 'customers', validateCustomer, report);
  // `ledger` jadvali v3 da paydo bo'ldi — faqat mavjud tranzaksiyada tekshiriladi
  if (options.ledger) {
    await normalizeTable(tx, 'ledger', validateLedgerEntry, report);
  }
  if (options.returns) {
    await normalizeTable(tx, 'returns', validateReturn, report);
  }
  await normalizeTable(tx, 'logs', validateLog, report);

  // 2) Bog'lanishlarni tiklash
  await reconcileProductImages(tx, report);
  await reconcileSaleNumbers(tx, report);

  return report;
}

/** v1 → v2: indekslar kengaytirildi (barcode, type, status, action) + to'liq normalizatsiya */
export async function migrateV1toV2(tx: Transaction): Promise<MigrationReport> {
  return normalizeDatabase(tx);
}

/* ---------------------------------------------------------------------- */
/*  v2 → v3: qarz daftari (ledger) va nasiya/avans ajratmasi               */
/* ---------------------------------------------------------------------- */

/** Imzolangan balans → boshlang'ich (opening) yozuvi */
function openingEntryFor(party: Customer, id: string): LedgerEntry {
  return {
    id,
    partyId: party.id,
    partyKind: party.kind,
    // "charge" — qarz oshgan deb qaraladi; balans manfiy bo'lsa yozuv
    // `balanceAfter` orqali to'g'ri ifodalanadi (ledgerDelta emas, u
    // opening uchun ishlatilmaydi).
    direction: 'charge',
    source: 'opening',
    amount: Math.abs(round2(party.balance)),
    balanceAfter: round2(party.balance),
    note: '',
    method: '',
    createdAt: party.createdAt,
  };
}

/**
 * Bazani v3 ga o'tkazadi:
 *
 *  1. `sales.paidAmount` / `sales.debtAmount` — legacy cheklar uchun payType
 *     asosida to'ldiriladi (validateSale buni allaqachon qiladi).
 *  2. Har bir kontragent uchun `ledger` ochiladi:
 *     - balans != 0 bo'lsa — `opening` yozuvi (eski qarz tarixi saqlanadi);
 *     - nasiya sotuvlari bo'lsa — har biri uchun `sale` yozuvi, sanasi bilan
 *       (shunda tarix haqiqiy xronologiyada ko'rinadi);
 *     - yakuniy balans `Customer.balance` bilan moslashtiriladi.
 *  3. Qoldiq yozuvlar ketma-ket qayta hisoblanadi (`replayLedger`) —
 *     `balanceAfter` maydoni har doim haqiqatga mos bo'ladi.
 *
 * Funksiya IDEMPOTENT: `ledger` da allaqachon yozuv bor kontragent uchun
 * hech narsa qayta yaratilmaydi.
 */
export async function migrateV2toV3(tx: Transaction): Promise<MigrationReport> {
  // 1) Avval oddiy normalizatsiya (sales.paid/debt, customers.balance va h.k.)
  const report = await normalizeDatabase(tx, { ledger: true });

  const customersTable = tx.table('customers');
  const salesTable = tx.table('sales');
  const ledgerTable = tx.table('ledger');

  const customers: Customer[] = await customersTable.toArray();
  if (customers.length === 0) return report;

  const sales: Sale[] = await salesTable.toArray();
  const existing: LedgerEntry[] = await ledgerTable.toArray();

  const byParty = new Map<string, LedgerEntry[]>();
  for (const e of existing) {
    const list = byParty.get(e.partyId) ?? [];
    list.push(e);
    byParty.set(e.partyId, list);
  }

  const newEntries: LedgerEntry[] = [];
  const touchedParties: Customer[] = [];

  for (const party of customers) {
    const own = byParty.get(party.id) ?? [];
    if (own.length > 0) continue; // allaqachon daftar bor — tegilmaydi

    const partySales = sales
      .filter((s) => s.customerId === party.id && s.payType === 'debt' && s.status === 'done')
      .sort((a, b) => a.createdAt - b.createdAt);

    /*
     * Balansni "orqaga" hisoblaymiz: mavjud balansdan nasiya sotuvlarini
     * ayirib tashlaymiz — natija eski (qo'lda kiritilgan yoki oldingi
     * to'lovlardan qolgan) qarz bo'ladi. Shu qoldiq `opening` yozuvi bo'ladi,
     * keyin nasiya sotuvlari xronologik tartibda qo'shiladi.
     */
    const debtFromSales = round2(partySales.reduce((s, x) => s + Math.abs(x.debtAmount || x.total), 0));
    const opening = round2(party.balance - (party.kind === 'customer' ? debtFromSales : 0));

    const entries: LedgerEntry[] = [];
    if (opening !== 0) {
      const base = openingEntryFor({ ...party, balance: opening }, `open-${party.id}`);
      // Boshlang'ich qoldiq eng birinchi nasiya sotuvidan oldin bo'lishi kerak —
      // aks holda tarix lentasida tartib buziladi (legacy `createdAt` yo'q bo'lsa
      // validator uni "hozir" deb to'ldiradi).
      const firstSaleAt = partySales[0]?.createdAt;
      entries.push(
        firstSaleAt ? { ...base, createdAt: Math.min(base.createdAt, firstSaleAt - 1) } : base,
      );
    }
    for (const sale of partySales) {
      const amount = Math.abs(sale.debtAmount || sale.total);
      if (amount === 0) continue;
      entries.push({
        id: `sale-${sale.id}`,
        partyId: party.id,
        partyKind: party.kind,
        direction: 'charge',
        source: 'sale',
        amount,
        balanceAfter: 0, // quyida qayta hisoblanadi
        note: '',
        method: '',
        saleId: sale.id,
        saleNumber: sale.number,
        createdAt: sale.createdAt,
      });
    }

    if (entries.length === 0) continue;

    const replayed = replayLedger(entries, 0);
    newEntries.push(...replayed.entries);
    // Yakuniy balans o'zgarmasligi kafolatlanadi (ma'lumot yo'qolmaydi)
    if (round2(replayed.balance) !== round2(party.balance)) {
      touchedParties.push({ ...party, balance: round2(replayed.balance) });
    }
  }

  if (newEntries.length) await ledgerTable.bulkPut(newEntries);
  if (touchedParties.length) {
    await customersTable.bulkPut(touchedParties);
    for (let i = 0; i < touchedParties.length; i++) bump(report, 'repaired', 'customers');
  }
  if (newEntries.length) {
    report.repaired.ledger = (report.repaired.ledger ?? 0) + newEntries.length;
    report.total += newEntries.length;
  }

  return report;
}

/* ---------------------------------------------------------------------- */
/*  v3 → v4: donalab/qismli qaytarish                                      */
/* ---------------------------------------------------------------------- */

/**
 * v4 ga o'tkazish.
 *
 * 1) `sales.items[].returnedQty` va `refundedAmount/refundedCost` — validator
 *    tomonidan to'ldiriladi (legacy da 0).
 * 2) Eski, ya'ni v3 gacha "butunlay qaytarilgan" cheklar (`status: 'returned'`
 *    bo'lib, satrlarda `returnedQty` yo'q) uchun:
 *      - har bir satr `returnedQty = qty` qilib belgilanadi;
 *      - bitta `returns` dalolatnomasi yaratiladi (migrated: true) — shunda
 *        qaytarish tarixi bo'sh ko'rinmaydi va hisobotlar to'g'ri chiqadi;
 *      - yozuv vaqti sifatida chek vaqti ishlatiladi (tarixiy aniqlik).
 * 3) `status` qayta hisoblanadi (`saleStatus`) — 'partial' ham paydo bo'ladi.
 *
 * IDEMPOTENT: dalolatnomasi bor chekka hech narsa qo'shilmaydi.
 */
export async function migrateV3toV4(tx: Transaction): Promise<MigrationReport> {
  const report = await normalizeDatabase(tx, { ledger: true, returns: true });

  const salesTable = tx.table('sales');
  const returnsTable = tx.table('returns');

  const sales: Sale[] = await salesTable.toArray();
  if (sales.length === 0) return report;

  const existing: ReturnRec[] = await returnsTable.toArray();
  const salesWithReturns = new Set(existing.map((r) => r.saleId));

  const patchedSales: Sale[] = [];
  const newReturns: ReturnRec[] = [];

  for (const sale of sales) {
    const fullyReturnedLegacy = sale.status === 'returned';
    const hasQtyMarks = sale.items.some((it) => (it.returnedQty ?? 0) > 0);
    if (!fullyReturnedLegacy || hasQtyMarks || salesWithReturns.has(sale.id)) continue;

    // Legacy "to'liq qaytarilgan" chek → satrlar belgilanadi + dalolatnoma
    const items = sale.items.map((it) => ({ ...it, returnedQty: it.qty }));
    const totals = returnedTotals(items, discountFactor(sale));

    newReturns.push({
      id: `ret-migrated-${sale.id}`,
      saleId: sale.id,
      saleNumber: sale.number,
      lines: items.map((it, index) => ({
        index,
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        price: it.price,
        cost: it.cost,
        qty: it.qty,
        // Legacy chek to'liq qaytarilgan — summa chek summasiga teng
        refund: index === items.length - 1
          ? Math.max(0, totals.amount - items.slice(0, -1).reduce((s, x) => s + x.price * x.qty, 0))
          : Math.max(0, it.price * it.qty),
      })),
      amount: totals.amount,
      cost: totals.cost,
      debtReduced: sale.payType === 'debt' ? totals.amount : 0,
      settlement: sale.payType === 'debt' ? 'debt' : 'cash',
      note: '',
      migrated: true,
      createdAt: sale.createdAt,
    });

    patchedSales.push({
      ...sale,
      items,
      status: saleStatus({ items }),
      refundedAmount: totals.amount,
      refundedCost: totals.cost,
    });
  }

  if (newReturns.length) await returnsTable.bulkPut(newReturns);
  if (patchedSales.length) await salesTable.bulkPut(patchedSales);

  if (newReturns.length) {
    report.repaired.returns = (report.repaired.returns ?? 0) + newReturns.length;
    report.repaired.sales = (report.repaired.sales ?? 0) + patchedSales.length;
    report.total += newReturns.length + patchedSales.length;
  }

  return report;
}

/* ---------------------------------------------------------------------- */
/*  v4 → v5: yetkazib beruvchi integratsiyasi                              */
/* ---------------------------------------------------------------------- */

/**
 * v5 ga o'tkazish — faqat MAYDOONLARNI TO'LDIRADI, hech narsani o'chirmaydi.
 *
 *  1) `products.supplierId` — bo'lmasa '' (biriktirilmagan). Mahsulotni
 *     "egasiz" qoldirish xavfsiz: UI "—" ko'rsatadi va foydalanuvchi keyin
 *     biriktiradi. Ehtimoliy taxmin qilib noto'g'ri yetkazib beruvchi
 *     yozib qo'yish — auditni buzadi, shuning uchun ataylab bo'sh qoldiriladi.
 *  2) `moves.supplierId` / `moves.unitCost` — faqat mavjud bo'lsa saqlanadi.
 *  3) `moves.type` — eski qiymatlar o'zgarmaydi; 'supply' yangi tur bo'lib
 *     qo'shiladi (validator `oneOf` orqali tanidi).
 *
 * Idempotent: qayta ishga tushirilsa hech narsa o'zgarmaydi.
 */
export async function migrateV4toV5(tx: Transaction): Promise<MigrationReport> {
  const report = await normalizeDatabase(tx, { ledger: true, returns: true });

  const productsTable = tx.table('products');
  const products = await productsTable.toArray();
  const patchedProducts = products
    .filter((p) => typeof p.supplierId !== 'string')
    .map((p) => ({ ...p, supplierId: '' }));

  if (patchedProducts.length) {
    await productsTable.bulkPut(patchedProducts);
    report.repaired.products = (report.repaired.products ?? 0) + patchedProducts.length;
    report.total += patchedProducts.length;
  }

  /*
   * Kirimlar uchun `unitCost` ni mavjud mahsulot tannarxidan to'ldirish
   * noto'g'ri bo'lardi (partiya narxi tarixan boshqacha bo'lishi mumkin) —
   * shuning uchun faqat `undefined` ni qoldiramiz va UI "—" ko'rsatadi.
   */

  return report;
}
