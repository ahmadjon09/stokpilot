/**
 * Qaytarish hisob-kitobi — SOF funksiyalar.
 *
 * Bu modul bazaga tegmaydi: UI (qaytarish oynasi), `returnItems()` amali va
 * migratsiya bir xil matematikadan foydalanishi uchun ajratilgan.
 *
 * ── ASOSIY QOIDALAR ───────────────────────────────────────────────────────
 *  1. `SaleItem.qty` — SOTILGAN miqdor, hech qachon o'zgarmaydi.
 *     Qaytarilgani `returnedQty` da yig'iladi → qoldiq = qty − returnedQty.
 *     Shu tufayli "5 dona sotildi, 2 tasi qaytarildi" ma'lumoti ikkalasi ham
 *     yo'qolmasdan saqlanadi.
 *  2. Qaytarilgan summa **chegirma ulushini** hisobga oladi: agar chek 10%
 *     chegirma bilan sotilgan bo'lsa, mijoz ham 10% chegirmali summani qaytarib
 *     oladi. Aks holda qaytarish sotuvdan qimmatroqqa tushib, foyda buziladi.
 *  3. Har bir satr uchun alohida yaxlitlash + yakunda qoldiqni to'g'rilash —
 *     yig'indi har doim `orderTotal × ulush` ga aniq teng bo'ladi (1 tiyin
 *     yo'qolmaydi/ortmaydi).
 */

import type { Sale, SaleItem, SaleStatus } from './db';
import { round2 } from '../shared/lib/format';

/* ---------------------------------------------------------------------- */
/*  Qoldiqlar                                                              */
/* ---------------------------------------------------------------------- */

/** Satrdan hali qaytarilishi mumkin bo'lgan miqdor */
export function remainingQty(item: SaleItem): number {
  const total = Number.isFinite(item.qty) ? item.qty : 0;
  const done = Number.isFinite(item.returnedQty) ? item.returnedQty : 0;
  return Math.max(0, round2(total - done));
}

/** Satr to'liq qaytarilganmi? */
export function isItemFullyReturned(item: SaleItem): boolean {
  return remainingQty(item) <= 0;
}

/** Chekda qaytariladigan biror narsa qolganmi? */
export function hasReturnableItems(sale: Sale): boolean {
  return sale.items.some((it) => remainingQty(it) > 0);
}

/** Chekdagi qaytarilishi mumkin bo'lgan satrlar (bo'sh cheklar uchun xavfsiz) */
export function returnableItems(sale: Sale): { item: SaleItem; index: number; remaining: number }[] {
  return sale.items
    .map((item, index) => ({ item, index, remaining: remainingQty(item) }))
    .filter((r) => r.remaining > 0);
}

/* ---------------------------------------------------------------------- */
/*  Holat                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * Chek holatini qaytarilgan miqdorlardan hisoblaydi.
 * Hech qachon `null` qaytarmaydi — bo'sh chek 'done' hisoblanadi.
 */
export function saleStatus(sale: Pick<Sale, 'items'>): SaleStatus {
  if (sale.items.length === 0) return 'done';

  /*
   * Diqqat: "qismli" holat satrning TO'LIQ qaytarilganidan kelib chiqmaydi.
   * 4 donadan 2 tasi qaytarilsa — birorta satr to'liq yopilmagan, lekin chek
   * allaqachon qismli qaytarilgan. Shuning uchun avval UMUMIY qaytarilgan
   * miqdorga qaraymiz, keyingina "hammasi yopildimi" ni tekshiramiz.
   */
  const anyReturned = sale.items.some((it) => (it.returnedQty ?? 0) > 0);
  if (!anyReturned) return 'done';

  const allReturned = sale.items.every(isItemFullyReturned);
  return allReturned ? 'returned' : 'partial';
}

/** Chek bo'yicha qaytarilgan jami summa va tannarx */
export function returnedTotals(
  items: SaleItem[],
  discountFactor = 1,
): { amount: number; cost: number } {
  let amount = 0;
  let cost = 0;
  for (const it of items) {
    const back = Math.min(Math.max(it.returnedQty ?? 0, 0), it.qty);
    if (back <= 0) continue;
    amount = round2(amount + round2(it.price * back * discountFactor));
    cost = round2(cost + round2(it.cost * back));
  }
  return { amount, cost };
}

/* ---------------------------------------------------------------------- */
/*  Summalar                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Chekning chegirma koeffitsienti (0…1).
 * `total / subtotal` — chegirma turi (foiz/summa) muhim emas, yakuniy nisbat
 * ishlatiladi. Legacy cheklarda subtotal 0 bo'lsa — 1.
 */
export function discountFactor(sale: Pick<Sale, 'subtotal' | 'total'>): number {
  if (!(sale.subtotal > 0)) return 1;
  const f = sale.total / sale.subtotal;
  if (!Number.isFinite(f) || f <= 0) return 1;
  return Math.min(1, f);
}

export interface ReturnSelection {
  /** `Sale.items` indeksi → qaytariladigan miqdor */
  [index: number]: number;
}

export interface ReturnPlanLine {
  index: number;
  productId: string;
  name: string;
  unit: SaleItem['unit'];
  price: number;
  cost: number;
  qty: number;
  refund: number;
}

export interface ReturnPlan {
  lines: ReturnPlanLine[];
  /** Qaytariladigan jami summa (chegirma ulushi ayirilgan) */
  amount: number;
  /** Qaytariladigan tovarlar tannarxi */
  cost: number;
  /** Aynan shu amaldan keyin chekda qoladigan summa */
  remainingTotal: number;
  /** Aynan shu amaldan keyin chek to'liq qaytarilgan bo'ladimi */
  willBeFullyReturned: boolean;
  /** Nasiya bo'lsa — shu amal hisobiga kamayadigan qarz */
  debtReduced: number;
  /** Xatolar (i18n kalitlari) — UI shu ro'yxatni ko'rsatadi */
  errors: string[];
}

/**
 * Qaytarish rejasini tuzadi: qaysi satrdan qancha, qancha pul, qancha qarz.
 *
 * Funksiya HECH QACHON throw qilmaydi — yaroqsiz so'rovlar `errors` ga
 * yoziladi (UI ularni ko'rsatadi, baza esa hech narsa yozmaydi).
 */
export function planReturn(sale: Sale, selection: ReturnSelection): ReturnPlan {
  const errors: string[] = [];
  const lines: ReturnPlanLine[] = [];

  const factor = discountFactor(sale);
  // Avval chekdagi chegirma summasi (bir marta hisoblanadi)
  const totals = sale.items.map((it) => ({
    it,
    gross: round2(it.price * Math.max(0, remainingQty(it))),
  }));
  const grossRemaining = round2(totals.reduce((s, t) => s + t.gross, 0));

  let requestedGross = 0;

  for (const key of Object.keys(selection)) {
    const index = Number(key);
    const raw = selection[index];
    const item = sale.items[index];
    if (!item) { errors.push('sales.returnErrItem'); continue; }

    // Miqdorni butun songa keltiramiz, manfiy qiymatlar 0 ga tushadi
    const want = round2(Math.max(0, Number.isFinite(raw) ? raw : 0));
    if (want <= 0) continue; // 0 — "qaytarilmaydi", xato emas

    const remaining = remainingQty(item);
    if (remaining <= 0) { errors.push('sales.returnErrAlready'); continue; }
    if (want > remaining + 1e-9) { errors.push('sales.returnErrTooMany'); continue; }

    const gross = round2(item.price * want);
    requestedGross = round2(requestedGross + gross);

    lines.push({
      index,
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      price: item.price,
      cost: item.cost,
      qty: want,
      refund: 0, // quyida to'ldiriladi
    });
  }

  if (lines.length === 0 && errors.length === 0) errors.push('sales.returnErrEmpty');

  /*
   * Chegirmani satrlar bo'yicha taqsimlash.
   *
   * Muammo: har bir satrni alohida yaxlitlasak (price × qty × factor), yig'indi
   * chek summasidan bir necha tiyin farq qilishi mumkin.
   * Yechim: summani "qolgan summaga nisbatan ulush" orqali hisoblaymiz, oxirgi
   * satrga esa qoldiqni beramiz — natijada aniq mos keladi.
   *
   *   refund_i = amountToRefund × gross_i / grossRemaining
   *
   * `amountToRefund` — chekdagi hali qaytarilmagan summa. Bu usul dastlabki
   * chegirmani ham, avvalgi qismli qaytarishlarni ham avtomatik hisobga oladi.
   */
  const amountToRefund = round2(Math.max(0, sale.total - returnedTotals(sale.items, factor).amount));

  /*
   * Har bir satrning ulushi: tanlangan miqdor qoldiqdagi gross summaga
   * nisbatan. Ya'ni 23 000 lik chekdan 2/5 qism qaytarilsa — qaytariladigan
   * summaning 2/5 i (chegirma ulushi bilan birga).
   *
   * Diqqat: "oxirgi satrga butun qoldiqni berish" YAROQSIZ — bitta satr
   * tanlanganda u butun chek summasini olib qo'yardi. Shuning uchun har bir
   * satr proporsional hisoblanadi, yaxlitlash qoldig'i (bir necha tiyin)
   * esa eng katta satrga qo'shiladi — yig'indi aniq bo'lishi uchun.
   */
  const ideals = lines.map((line) =>
    grossRemaining > 0
      ? (amountToRefund * round2(line.price * line.qty)) / grossRemaining
      : round2(line.price * line.qty),
  );

  const rounded = ideals.map((v) => round2(v));
  const residue = round2(ideals.reduce((s, v) => s + v, 0) - rounded.reduce((s, v) => s + v, 0));

  if (rounded.length > 0 && residue !== 0) {
    // Eng katta summa ulushiga qo'shamiz (nisbatan sezilmas, lekin aniq)
    let biggest = 0;
    for (let i = 1; i < rounded.length; i++) if (rounded[i] > rounded[biggest]) biggest = i;
    rounded[biggest] = round2(rounded[biggest] + residue);
  }

  for (let i = 0; i < lines.length; i++) {
    // Haddan oshib ketmaslik kafolati (manfiy yoki ortiqcha summa bo'lmasin)
    lines[i].refund = Math.max(0, Math.min(rounded[i], amountToRefund));
  }

  const amount = round2(lines.reduce((s, l) => s + l.refund, 0));
  const cost = round2(lines.reduce((s, l) => s + round2(l.cost * l.qty), 0));

  // Shu amaldan keyin har bir satrning qoldig'i
  const willBeFullyReturned = sale.items.every((it, i) => {
    const extra = lines.find((l) => l.index === i)?.qty ?? 0;
    return remainingQty(it) - extra <= 0;
  });

  const remainingTotal = round2(Math.max(0, sale.total - (returnedTotals(sale.items, factor).amount + amount)));

  /*
   * Nasiya: qaytarilgan summa mijoz qarzini kamaytiradi, lekin faqat hali
   * to'lanmagan qism doirasida. Mijoz avans bergan bo'lsa — qaytarilgan pul
   * naqd qaytariladi (`settlement: 'cash'`), qarz manfiyga tushmaydi.
   */
  let debtReduced = 0;
  if (sale.payType === 'debt' && sale.customerId && amount > 0) {
    const alreadyReturned = returnedTotals(sale.items, factor);
    const paidRatio = sale.total > 0 ? Math.min(1, (sale.paidAmount || 0) / sale.total) : 0;
    // Avansga to'g'ri keladigan qism qarz emas
    const advanceShare = round2(amount * paidRatio);
    void alreadyReturned;
    debtReduced = round2(Math.max(0, amount - advanceShare));
  }

  return { lines, amount, cost, remainingTotal, willBeFullyReturned, debtReduced, errors };
}

/** Reja bo'sh emasmi (kamida bitta satr, xato yo'q) */
export function planIsValid(plan: ReturnPlan): boolean {
  return plan.errors.length === 0 && plan.lines.length > 0;
}
