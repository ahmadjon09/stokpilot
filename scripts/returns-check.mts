/**
 * Qismli (donalab) qaytarish — business-logic testi.
 *
 * Tekshiradi:
 *  - `planReturn` matematikasi: chegirma ulushi, tiyin yo'qolmasligi,
 *    qoldiqdan oshib ketishning bloklanishi;
 *  - zaxiraning qaytarilishi va audit-harakat;
 *  - chek holati: done → partial → returned;
 *  - nasiyada qarzning faqat to'lanmagan qism doirasida kamayishi;
 *  - avans to'langan chek qaytarilganda qarz manfiyga tushmasligi;
 *  - v3 → v4 migratsiyasi: legacy "to'liq qaytarilgan" chek dalolatnoma oladi;
 *  - idempotentlik va chegirma bilan qaytarish.
 *
 * Ishga tushirish: npm run check:returns
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

(globalThis as any).window = globalThis;

/* ---------------------------------------------------------------------- */
/*  1) v3 bazani legacy ma'lumotlar bilan yaratamiz                        */
/* ---------------------------------------------------------------------- */
const legacy = new Dexie('stokpilot');
legacy.version(1).stores({
  products: 'id, name, sku, categoryId', categories: 'id, name', images: 'id, productId',
  moves: 'id, productId, createdAt', sales: 'id, createdAt, number, customerId',
  customers: 'id, name, kind', logs: 'id, createdAt', snapshots: 'id, createdAt',
});
legacy.version(2).stores({
  products: 'id, name, sku, categoryId, barcode, updatedAt', categories: 'id, name',
  images: 'id, productId', moves: 'id, productId, createdAt, type, refId',
  sales: 'id, createdAt, number, customerId, status, payType', customers: 'id, name, kind',
  logs: 'id, createdAt, action', snapshots: 'id, createdAt',
});
legacy.version(3).stores({
  products: 'id, name, sku, categoryId, barcode, updatedAt', categories: 'id, name',
  images: 'id, productId', moves: 'id, productId, createdAt, type, refId',
  sales: 'id, createdAt, number, customerId, status, payType', customers: 'id, name, kind',
  ledger: 'id, partyId, createdAt, [partyId+createdAt], partyKind, [partyKind+createdAt], saleId',
  logs: 'id, createdAt, action', snapshots: 'id, createdAt',
});
await legacy.open();

await legacy.table('products').bulkAdd([
  { id: 'p1', sku: 'SP-1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, stock: 10, minStock: 0, barcode: '', note: '', imageIds: [], createdAt: 1, updatedAt: 1 },
  { id: 'p2', sku: 'SP-2', name: 'Sut', unit: 'litr', price: 11000, cost: 9000, stock: 5, minStock: 0, barcode: '', note: '', imageIds: [], createdAt: 1, updatedAt: 1 },
]);
await legacy.table('customers').bulkAdd([
  { id: 'c1', name: 'Ali', phone: '', kind: 'customer', balance: 34000, note: '', createdAt: 1000 },
]);
await legacy.table('sales').bulkAdd([
  // Nasiya, chegirmasiz: 4×3000 + 1×11000 = 23000, avans yo'q → qarz 23000
  {
    id: 'sale1', number: 1,
    items: [
      { productId: 'p1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, qty: 4 },
      { productId: 'p2', name: 'Sut', unit: 'litr', price: 11000, cost: 9000, qty: 1 },
    ],
    subtotal: 23000, discountType: 'none', discountValue: 0, total: 23000, costTotal: 17000,
    payType: 'debt', paidAmount: 0, debtAmount: 23000,
    customerId: 'c1', customerName: 'Ali', status: 'done', note: '', createdAt: 5000,
  },
  // Legacy "butunlay qaytarilgan" chek (returnedQty yo'q, dalolatnoma yo'q)
  {
    id: 'saleLegacy', number: 2,
    items: [{ productId: 'p1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, qty: 2 }],
    subtotal: 6000, discountType: 'none', discountValue: 0, total: 6000, costTotal: 4000,
    payType: 'cash', paidAmount: 6000, debtAmount: 0,
    customerId: '', customerName: '', status: 'returned', note: '', createdAt: 6000,
  },
]);
// c1 balansi: 34000 = 23000 (sale1) + 11000 (boshqa eski qarz)
await legacy.table('ledger').bulkAdd([
  { id: 'l1', partyId: 'c1', partyKind: 'customer', direction: 'charge', source: 'opening', amount: 34000, balanceAfter: 34000, note: '', method: '', createdAt: 1000 },
]);
await legacy.close();

/* ---------------------------------------------------------------------- */
/*  2) v4 ga migratsiya                                                    */
/* ---------------------------------------------------------------------- */
const { db, openDatabase } = await import('../src/db/db.ts');
const { returnItems, returnSale } = await import('../src/db/actions.ts');
const { planReturn, remainingQty, saleStatus, returnableItems } = await import('../src/db/returns.ts');

const open = await openDatabase();
console.log(`open status: ${open.status}`);

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

// Migratsiya: legacy returned chek
const legacySale = (await db.sales.get('saleLegacy'))!;
const legacyReturns = await db.returns.where('saleId').equals('saleLegacy').toArray();
check('legacy returned chekda returnedQty to\'ldirildi', legacySale.items.every((i) => i.returnedQty === i.qty));
check('legacy chek uchun dalolatnoma yaratildi', legacyReturns.length === 1 && legacyReturns[0].migrated === true);
check('legacy dalolatnoma summasi = chek summasi', legacyReturns[0]?.amount === 6000);
check('legacy chek holati returned', legacySale.status === 'returned');

/* ---------------------------------------------------------------------- */
/*  3) planReturn — sof matematika                                         */
/* ---------------------------------------------------------------------- */
const sale1 = (await db.sales.get('sale1'))!;
check('yangi chekda returnedQty = 0', sale1.items.every((i) => i.returnedQty === 0));
check('qoldiq: Non 4, Sut 1', remainingQty(sale1.items[0]) === 4 && remainingQty(sale1.items[1]) === 1);
check('holat done', saleStatus(sale1) === 'done');
check('qaytariladigan satrlar 2 ta', returnableItems(sale1).length === 2);

// Xato holatlar
const tooMany = planReturn(sale1, { 0: 5 });
check('qoldiqdan ko\'p qaytarish bloklanadi', tooMany.errors.includes('sales.returnErrTooMany') && tooMany.lines.length === 0);
const empty = planReturn(sale1, {});
check('bo\'sh tanlov xato beradi', empty.errors.includes('sales.returnErrEmpty'));
const zero = planReturn(sale1, { 0: 0 });
check('nol miqdor — xato emas, lekin reja bo\'sh', zero.lines.length === 0);
const neg = planReturn(sale1, { 0: -3 });
check('manfiy miqdor rad etiladi', neg.lines.length === 0 && neg.errors.includes('sales.returnErrEmpty'));

// To'g'ri reja: 2 dona Non
const plan2 = planReturn(sale1, { 0: 2 });
check('reja: 1 satr, 2 dona', plan2.lines.length === 1 && plan2.lines[0].qty === 2);
check('reja summasi 6000', plan2.amount === 6000);
check('reja tannarxi 4000', plan2.cost === 4000);
check('nasiyada qarz 6000 ga kamayadi', plan2.debtReduced === 6000);
check('chek to\'liq qaytarilmaydi', plan2.willBeFullyReturned === false);

/* ---------------------------------------------------------------------- */
/*  4) returnItems — haqiqiy qaytarish                                     */
/* ---------------------------------------------------------------------- */
const stockBefore = (await db.products.get('p1'))!.stock;
const rec = await returnItems({ saleId: 'sale1', selection: { 0: 2 }, note: 'Buzilgan non' });

const afterSale1 = (await db.sales.get('sale1'))!;
const p1 = (await db.products.get('p1'))!;
const c1 = (await db.customers.get('c1'))!;

check('zaxira +2 (10 → 12)', p1.stock === stockBefore + 2);
check('satrda returnedQty = 2', afterSale1.items[0].returnedQty === 2);
check('sotilgan qty O\'ZGARMADI (4)', afterSale1.items[0].qty === 4);
check('holat partial', afterSale1.status === 'partial');
check('refundedAmount = 6000', afterSale1.refundedAmount === 6000);
check('refundedCost = 4000', afterSale1.refundedCost === 4000);
check('dalolatnoma yozildi', rec.lines.length === 1 && rec.lines[0].qty === 2 && rec.amount === 6000);
check('dalolatnomada izoh', rec.note === 'Buzilgan non');
check('mijoz qarzi 6000 ga kamaydi (34000 → 28000)', c1.balance === 28000);
check('dalolatnomada debtReduced', rec.debtReduced === 6000 && rec.settlement === 'debt');
const move = (await db.moves.where('productId').equals('p1').toArray()).filter((m) => m.type === 'return');
check('zaxira harakati (return) yozildi', move.length === 1 && move[0].qty === 2);

// Qolgan 2 dona Nonni qaytarish
await returnItems({ saleId: 'sale1', selection: { 0: 2 } });
const afterSale1b = (await db.sales.get('sale1'))!;
check('2-dan keyin Non to\'liq qaytarilgan', remainingQty(afterSale1b.items[0]) === 0);
check('holat hali partial (Sut qoldi)', afterSale1b.status === 'partial');

// Qaytarilgan satrni yana qaytarish bloklanadi
let blocked = false;
try { await returnItems({ saleId: 'sale1', selection: { 0: 1 } }); } catch (e) {
  blocked = (e as Error).message === 'sales.returnErrAlready';
}
check('allaqachon qaytarilgan satr bloklanadi', blocked);

// Qoldiqdan oshib ketish bloklanadi
let blocked2 = false;
try { await returnItems({ saleId: 'sale1', selection: { 1: 2 } }); } catch (e) {
  blocked2 = (e as Error).message === 'sales.returnErrTooMany';
}
check('qoldiqdan ko\'p miqdor bloklanadi', blocked2);

// Butun chekni qaytarish (qulaylik funksiyasi)
await returnSale('sale1', 'Mijoz voz kechdi');
const afterSale1c = (await db.sales.get('sale1'))!;
const c1b = (await db.customers.get('c1'))!;
check('butun chek qaytarildi → status returned', afterSale1c.status === 'returned');
check('barcha satrlar yopildi', afterSale1c.items.every((i) => remainingQty(i) === 0));
// sale1 bo'yicha jami qaytarilgan: 6000 + 6000 + 11000 = 23000.
// Qolgan 11000 — sale1 ga aloqasi yo'q eski qarz (opening).
check('sale1 qarzi to\'liq yopildi (34000 → 11000)', c1b.balance === 11000);
check('qaytarishlar soni 3 ta', (await db.returns.where('saleId').equals('sale1').toArray()).length === 3);

/* ---------------------------------------------------------------------- */
/*  5) Chegirma bilan qaytarish — tiyin yo'qolmaydi                        */
/* ---------------------------------------------------------------------- */
const { completeSale } = await import('../src/db/actions.ts');
const products = await db.products.toArray();
const discSale = await completeSale({
  items: [{ product: products[0], qty: 3 }], // 3 × 3000 = 9000
  discountType: 'percent', discountValue: 10,
  payType: 'cash', customerId: '', note: '',
});
check('chegirma: total 8100', discSale.total === 8100);

const discPlan = planReturn(discSale, { 0: 1 });
check('chegirmali qaytarish: 1 dona = 2700 (9000×0.9/3)', discPlan.amount === 2700);

const discRec = await returnItems({ saleId: discSale.id, selection: { 0: 2 } });
check('2 dona qaytarildi = 5400', discRec.amount === 5400);
const discAfter = (await db.sales.get(discSale.id))!;
check('qolgan summa 2700', discAfter.refundedAmount === 5400);
check('chegirmali qaytarishda holat partial', discAfter.status === 'partial');
check('naqd sotuvda qarz o\'zgarmaydi', discRec.debtReduced === 0 && discRec.settlement === 'cash');

// Tiyin aniqligi: 3 dona, 3 tiyin chegirma → qaytarishlar yig'indisi aniq total
const penny = await completeSale({
  items: [{ product: products[0], qty: 3 }],
  discountType: 'amount', discountValue: 0.01,
  payType: 'cash', customerId: '', note: '',
});
check('penny chegirma total 8999.99', penny.total === 8999.99);
const p1p = planReturn(penny, { 0: 1 });
const p2p = planReturn(penny, { 0: 2 });
check('qismli rejalar yig\'indisi = total', Math.round((p1p.amount + p2p.amount) * 100) === Math.round(penny.total * 100));

/* ---------------------------------------------------------------------- */
/*  6) Avans to'langan nasiya — qarz manfiyga tushmaydi                    */
/* ---------------------------------------------------------------------- */
const advanceSale = await completeSale({
  items: [{ product: products[1], qty: 2 }], // 2 × 11000 = 22000
  discountType: 'none', discountValue: 0,
  payType: 'debt', customerId: '',
  newCustomer: { name: 'Avans Mijoz', phone: '+998900000001' },
  paidNow: 12000, note: '',
});
const advCustomer = (await db.customers.get(advanceSale.customerId))!;
check('avansli nasiya: qarz 10000', advCustomer.balance === 10000);

const advRec = await returnItems({ saleId: advanceSale.id, selection: { 0: 1 } });
const advAfter = (await db.customers.get(advanceSale.customerId))!;
// 22 000 dan 12 000 avans (54.5%), 10 000 qarz (45.5%).
// 11 000 qaytarilsa: 5 000 qarzga, 6 000 naqdga to'g'ri keladi.
check('avans ulushi ayirildi (qarz 10000 → 5000)', advAfter.balance === 5000);
check('debtReduced = 5000 (11000 × 45.5%)', advRec.debtReduced === 5000);
check('qarz manfiy emas', advAfter.balance >= 0);

/* ---------------------------------------------------------------------- */
/*  7) Idempotentlik: repair hisobni buzmaydi                              */
/* ---------------------------------------------------------------------- */
const { repairDatabase } = await import('../src/db/db.ts');
const before = JSON.stringify({
  s: await db.sales.toArray(), r: await db.returns.toArray(), c: await db.customers.toArray(),
});
await repairDatabase();
const after = JSON.stringify({
  s: await db.sales.toArray(), r: await db.returns.toArray(), c: await db.customers.toArray(),
});
check('repair dan keyin hech narsa o\'zgarmadi', before === after);

/* ---------------------------------------------------------------------- */
/*  8) Hisobotlar: qismli qaytarilgan chek yo'qolmaydi                     */
/* ---------------------------------------------------------------------- */
const { countableSales, sumNetRevenue, sumNetProfit, itemStats: itemStatsFn } = await import(
  '../src/shared/lib/salesStats.ts'
);

const statsSale = await completeSale({
  items: [{ product: products[0], qty: 4 }], // 4 × 3000 = 12000
  discountType: 'none', discountValue: 0,
  payType: 'cash', customerId: '', note: '',
});
await returnItems({ saleId: statsSale.id, selection: { 0: 1 } });
const statsAfter = (await db.sales.get(statsSale.id))!;
check('hisobot: qismli chek hisobga olinadi', countableSales([statsAfter]).length === 1);
check('hisobot: sof tushum 9000 (12000 − 3000)', sumNetRevenue([statsAfter]) === 9000);
check('hisobot: sof foyda 3000 (9000 − 6000)', sumNetProfit([statsAfter]) === 3000);

// To'liq qaytarilgan chek hisobotdan chiqadi
const fullSale = await completeSale({
  items: [{ product: products[0], qty: 1 }],
  discountType: 'none', discountValue: 0,
  payType: 'cash', customerId: '', note: '',
});
await returnSale(fullSale.id);
const fullAfter = (await db.sales.get(fullSale.id))!;
check('hisobot: to\'liq qaytarilgan chek chiqariladi', countableSales([fullAfter]).length === 0);
check('hisobot: to\'liq qaytarilganda tushum 0', sumNetRevenue([fullAfter]) === 0);

// Mahsulot statistikasi qaytarilgan donalarni chiqarib tashlaydi
const st = itemStatsFn([statsAfter]).get(products[0].id)!;
check('mahsulot statistikasi: 3 dona (4 − 1)', st.qty === 3);
check('mahsulot statistikasi: tushum 9000', st.revenue === 9000);

/* ---------------------------------------------------------------------- */
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { failed++; console.log(`❌ ${name}`); }
}
console.log(failed === 0 ? `\n✅ Barcha ${checks.length} tekshiruv o'tdi` : `\n❌ ${failed}/${checks.length} yiqildi`);
process.exit(failed === 0 ? 0 : 1);
