/**
 * v5 — qarzlar standarti, yetkazib beruvchi integratsiyasi va statistika.
 *
 * Tekshiradi:
 *  1. QARZLAR STANDARTI — rang/yo'nalish qoidalari va yig'ma ko'rsatkichlar
 *     barcha sahifalarda bir xil;
 *  2. YETKAZIB BERUVCHI XATOSI — manfiy sonlar bilan tahrirlash (regressiya);
 *  3. YETKAZIB BERUVCHIDAN QABUL QILISH — atomar kirim + qarz yozuvi;
 *  4. STATISTIKA — kunlik/oylik seriyalar, kalendar arifmetikasi, o'sish %;
 *  5. NAVIGATSIYA — ikki panel uchun ro'yxat yechish (zaxira, dublikat).
 *
 * Ishga tushirish: npm run check:supplier
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

(globalThis as any).window = globalThis;

/* ---------------------------------------------------------------------- */
/*  1) v4 baza — legacy ma'lumotlar bilan                                  */
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
legacy.version(4).stores({
  products: 'id, name, sku, categoryId, barcode, updatedAt', categories: 'id, name',
  images: 'id, productId', moves: 'id, productId, createdAt, type, refId',
  sales: 'id, createdAt, number, customerId, status, payType', customers: 'id, name, kind',
  ledger: 'id, partyId, createdAt, [partyId+createdAt], partyKind, [partyKind+createdAt], saleId',
  returns: 'id, saleId, createdAt, [saleId+createdAt]',
  logs: 'id, createdAt, action', snapshots: 'id, createdAt',
});
await legacy.open();
await legacy.table('products').bulkAdd([
  { id: 'p1', sku: 'SP-1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, stock: 10, minStock: 0, barcode: '', note: '', imageIds: [], createdAt: 1, updatedAt: 1 },
  { id: 'p2', sku: 'SP-2', name: 'Sut', unit: 'litr', price: 11000, cost: 9000, stock: 5, minStock: 0, barcode: '', note: '', imageIds: [], createdAt: 1, updatedAt: 1 },
]);
await legacy.table('customers').bulkAdd([
  { id: 'c1', name: 'Ali', phone: '', kind: 'customer', balance: 20000, note: '', createdAt: 1000 },
  { id: 'sup1', name: 'Oq Bulut', phone: '', kind: 'supplier', balance: -5000, note: '', createdAt: 1000 },
]);
await legacy.close();

/* ---------------------------------------------------------------------- */
const { db, openDatabase, repairDatabase } = await import('../src/db/db.ts');
const { saveCustomer, supplyFromSupplier, adjustDebt, recordPayment } = await import('../src/db/actions.ts');
const { debtView, debtTotals, resolveDebtDirection } = await import('../src/shared/lib/debt.ts');
const { partyNet, sumLedger } = await import('../src/db/ledger.ts');
const {
  addMonths, dailySeries, endOfMonth, monthComparison, monthKey, monthlySeries,
  periodStats, startOfDay, startOfMonth,
} = await import('../src/shared/lib/analytics.ts');
const { resolveBottomNav, resolveSidebarNav } = await import('../src/store/settings.ts');

const open = await openDatabase();
console.log(`open status: ${open.status}`);

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

/* ====================================================================== */
/*  1. QARZLAR STANDARTI                                                  */
/* ====================================================================== */
const custDebt = debtView(20000, 'customer');
const supDebt = debtView(-5000, 'supplier');
const settled = debtView(0, 'customer');

check('mijoz qarzi — qizil', custDebt.color === 'var(--debt-customer)');
check('mijoz qarzi — musbat belgi', custDebt.sign === '+' && custDebt.amount === 20000);
check('mijoz qarzi — "u bizga qarzdor"', custDebt.side === 'receivable' && custDebt.sideKey === 'debt.theyOwe');
check('bizning qarz — zangor', supDebt.color === 'var(--debt-supplier)');
check('bizning qarz — manfiy belgi', supDebt.sign === '−' && supDebt.amount === 5000);
check('bizning qarz — "biz qarzdormiz"', supDebt.side === 'payable' && supDebt.sideKey === 'debt.weOwe');
check('yopilgan — sokin rang', settled.settled && settled.color === 'var(--debt-settled)' && settled.sign === '');

// Ranglar partyNet bilan mos (bir xil haqiqat manbai)
for (const b of [-12345, -1, 0, 1, 12345]) {
  const v = debtView(b, 'customer');
  const n = partyNet(b);
  check(`partyNet mos: ${b}`, v.amount === n.amount && v.settled === n.settled);
}

// Turli kontragent turlari uchun bir xil balans bir xil rang beradi
check('bir xil balans → bir xil rang (tur muhim emas)',
  debtView(-7000, 'supplier').color === debtView(-7000, 'customer').color);

// Yig'ma
const totals = debtTotals([
  { balance: 20000, kind: 'customer' },
  { balance: -5000, kind: 'supplier' },
  { balance: 0, kind: 'customer' },
  { balance: 3000, kind: 'customer' },
]);
check('yig\'ma: receivable 23000', totals.receivable === 23000);
check('yig\'ma: payable 5000', totals.payable === 5000);
check('yig\'ma: net 18000', totals.net === 18000);
check('yig\'ma: 2 qarzdor, 1 kreditor', totals.debtors === 2 && totals.creditors === 1);

/* ====================================================================== */
/*  2. YETKAZIB BERUVCHI XATOSI (regressiya)                              */
/* ====================================================================== */
// Mijoz: 5000 → 3000 (kamaytirish)
await saveCustomer({ id: 'cx', name: 'Mijoz X', phone: '', kind: 'customer', balance: 5000, note: '', createdAt: 1 });
await saveCustomer({ id: 'cx', name: 'Mijoz X', phone: '', kind: 'customer', balance: 3000, note: '', createdAt: 1 });
check('mijoz 5000 → 3000', (await db.customers.get('cx'))!.balance === 3000);

// Yetkazib beruvchi: -5000 → -3000 (qarzni KAMAYTIRISH) — asl xato
await saveCustomer({ id: 'sx', name: 'Sup X', phone: '', kind: 'supplier', balance: -5000, note: '', createdAt: 1 });
await saveCustomer({ id: 'sx', name: 'Sup X', phone: '', kind: 'supplier', balance: -3000, note: '', createdAt: 1 });
check('yetkazib beruvchi −5000 → −3000 (kamaytirish)', (await db.customers.get('sx'))!.balance === -3000);

// Yetkazib beruvchi: -3000 → -8000 (qarzni OSHIRISH)
await saveCustomer({ id: 'sx', name: 'Sup X', phone: '', kind: 'supplier', balance: -8000, note: '', createdAt: 1 });
check('yetkazib beruvchi −3000 → −8000 (oshirish)', (await db.customers.get('sx'))!.balance === -8000);

// Manfiy → musbat (avans holati)
await saveCustomer({ id: 'sx', name: 'Sup X', phone: '', kind: 'supplier', balance: 2000, note: '', createdAt: 1 });
check('yetkazib beruvchi −8000 → +2000 (avans)', (await db.customers.get('sx'))!.balance === 2000);

// Daftar balans bilan mos bo'lishi shart
const sxEntries = await db.ledger.where('partyId').equals('sx').toArray();
check('yetkazib beruvchi daftari balansga mos', sumLedger(sxEntries) === 2000);

// resolveDebtDirection to'g'ridan-to'g'ri
const d1 = resolveDebtDirection(-5000, -3000, 'supplier');
check('resolve: supplier −5000→−3000 = payment', d1.direction === 'payment' && d1.amount === 2000);
const d2 = resolveDebtDirection(-5000, -8000, 'supplier');
check('resolve: supplier −5000→−8000 = charge', d2.direction === 'charge' && d2.amount === 3000);
const d3 = resolveDebtDirection(5000, 3000, 'customer');
check('resolve: customer 5000→3000 = payment', d3.direction === 'payment');
const d4 = resolveDebtDirection(5000, 8000, 'customer');
check('resolve: customer 5000→8000 = charge', d4.direction === 'charge');

// NaN / Infinity rad etilishi
let rejected = false;
try { await adjustDebt({ partyId: 'sx', amount: Number.NaN, direction: 'charge' }); } catch { rejected = true; }
check('NaN summa rad etiladi', rejected);
let rejected2 = false;
try { await adjustDebt({ partyId: 'sx', amount: Number.POSITIVE_INFINITY, direction: 'charge' }); } catch { rejected2 = true; }
check('Infinity summa rad etiladi', rejected2);
check('rad etishlardan keyin balans buzilmagan', (await db.customers.get('sx'))!.balance === 2000);

/* ====================================================================== */
/*  3. YETKAZIB BERUVCHIDAN QABUL QILISH                                  */
/* ====================================================================== */
/*
 * Balansni 0 ga keltiramiz.
 *
 * Semantika (ledger.ts dagi qoida): balans +2000 — yetkazib beruvchi BIZGA
 * qarzdor (biz avans berganmiz). Uni yopish uchun qarzni "oshirish" kerak,
 * ya'ni `charge`: supplier o'qida charge = −2000 → balans 0.
 * `payment` esa bizning qarzimizni kamaytiradi va bu yerda TESKARI tomonga
 * suradi (u yana bizga qarzdor bo'lib qoladi) — bu ham to'g'ri arifmetika,
 * shunchaki maqsadga mos emas.
 */
check('delta tekshiruvi: supplier charge −2000',
  (await (async () => (await import('../src/db/ledger.ts')).ledgerDelta('charge', 2000, 'supplier'))()) === -2000);
await adjustDebt({ partyId: 'sx', amount: 2000, direction: 'charge', note: 'avansni yopish' });
check('avans yopildi (0)', (await db.customers.get('sx'))!.balance === 0);

const p1Before = (await db.products.get('p1'))!;
const res = await supplyFromSupplier({
  productId: 'p1',
  supplierId: 'sx',
  qty: 20,
  unitCost: 2500,
  onCredit: true,
  note: 'Yangi partiya',
});
const p1After = (await db.products.get('p1'))!;
const sxAfter = (await db.customers.get('sx'))!;

check('kirim: qoldiq 10 → 30', p1After.stock === 30);
check('kirim: tannarx yangilandi (2500)', p1After.cost === 2500);
check('kirim: qarz yozildi (20 × 2500 = 50000)', sxAfter.balance === -50000);
check('kirim: daftar yozuvi ID qaytdi', res.ledgerEntryId !== null);
check('kirim: stockAfter qaytdi', res.stockAfter === 30);

const move = (await db.moves.toArray()).find((m) => m.id === res.moveId)!;
check('kirim: harakat turi supply', move.type === 'supply');
check('kirim: harakatda supplierId', move.supplierId === 'sx');
check('kirim: harakatda unitCost', move.unitCost === 2500);
check('kirim: harakatda ledgerEntryId', move.ledgerEntryId === res.ledgerEntryId);

// Naqd (qarzga emas) kirim — qarz o'zgarmaydi
const beforeCash = (await db.customers.get('sx'))!.balance;
await supplyFromSupplier({
  productId: 'p1', supplierId: 'sx', qty: 5, unitCost: 2500, onCredit: false,
});
check('naqd kirim qarzni o\'zgartirmaydi', (await db.customers.get('sx'))!.balance === beforeCash);
check('naqd kirim qoldiqni oshiradi', (await db.products.get('p1'))!.stock === 35);

// Xatolar
let noSupplier = false;
try { await supplyFromSupplier({ productId: 'p1', supplierId: '', qty: 1, onCredit: true }); } catch (e) {
  noSupplier = (e as Error).message === 'supplier_required';
}
check('yetkazib beruvchisiz kirim rad etiladi', noSupplier);
let badQty = false;
try { await supplyFromSupplier({ productId: 'p1', supplierId: 'sx', qty: 0, onCredit: true }); } catch (e) {
  badQty = (e as Error).message === 'invalid_qty';
}
check('nol miqdor rad etiladi', badQty);
let notSupplier = false;
try { await supplyFromSupplier({ productId: 'p1', supplierId: 'c1', qty: 1, onCredit: true }); } catch (e) {
  notSupplier = (e as Error).message === 'supplier_not_found';
}
check('mijozni yetkazib beruvchi sifatida ishlatib bo\'lmaydi', notSupplier);
check('xatolardan keyin qoldiq o\'zgarmagan', (await db.products.get('p1'))!.stock === 35);

/* ====================================================================== */
/*  4. STATISTIKA — kalendar arifmetikasi                                 */
/* ====================================================================== */
const NOV = new Date(2026, 10, 15, 12, 0, 0).getTime(); // 15-noyabr 2026
const som = startOfMonth(NOV);
const oct = addMonths(som, -1);
check('oy boshi 1-noyabr', new Date(som).getDate() === 1 && new Date(som).getMonth() === 10);
check('bir oy oldin = oktabr', new Date(oct).getMonth() === 9);
check('oy oxiri — oktabr 31 kun', new Date(endOfMonth(oct)).getDate() === 31);

// 31-martdan bir oy oldin → 28/29-fevral (30 kun emas)
const MAR31 = new Date(2026, 2, 31, 10, 0, 0).getTime();
const FEB = addMonths(MAR31, -1);
check('31-mart → fevral (kalendar, 30 kun emas)', new Date(FEB).getMonth() === 1);
check('mart − 1 oy = 1-fevral', new Date(FEB).getDate() === 1);

// Yil chegarasi
const JAN = new Date(2026, 0, 15).getTime();
check('yanvardan bir oy oldin = dekabr (o\'tgan yil)', new Date(addMonths(JAN, -1)).getMonth() === 11);
check('oy kaliti format', monthKey(new Date(2026, 10, 5).getTime()) === '2026-11');

/* ---- Seriyalar ---- */
const now = new Date(2026, 10, 15, 18, 0, 0).getTime();
const mkSale = (id: string, ts: number, total: number, cost: number, extra: Record<string, unknown> = {}) => ({
  id, number: Math.floor(ts / 1000), items: [{ productId: 'p1', name: 'Non', unit: 'dona', price: total, cost, qty: 1, returnedQty: 0 }],
  subtotal: total, discountType: 'none', discountValue: 0, total, costTotal: cost,
  payType: 'cash', paidAmount: total, debtAmount: 0, customerId: '', customerName: '',
  status: 'done', refundedAmount: 0, refundedCost: 0, note: '', createdAt: ts, ...extra,
} as any);

const testSales = [
  mkSale('a1', new Date(2026, 10, 15, 9).getTime(), 10000, 6000),   // bugun
  mkSale('a2', new Date(2026, 10, 15, 14).getTime(), 5000, 3000),   // bugun
  mkSale('a3', new Date(2026, 10, 14, 10).getTime(), 20000, 12000), // kecha
  mkSale('a4', new Date(2026, 9, 10, 10).getTime(), 40000, 25000),  // oktabr
  mkSale('a5', new Date(2026, 8, 10, 10).getTime(), 10000, 7000),   // sentabr
];

const todayStats = periodStats(testSales, startOfDay(now), now);
check('bugun: tushum 15000', todayStats.revenue === 15000);
check('bugun: foyda 6000', todayStats.profit === 6000);
check('bugun: 2 chek', todayStats.checks === 2);
check('bugun: o\'rtacha chek 7500', todayStats.avgCheck === 7500);
check('bugun: marja 40%', todayStats.margin === 40);

const daily = dailySeries(testSales, 3, now);
check('kunlik seriya: 3 qator', daily.length === 3);
check('kunlik seriya: bugun oxirgi', daily[2].revenue === 15000);
check('kunlik seriya: kecha 20000', daily[1].revenue === 20000);
check('kunlik seriya: kun oldin 0', daily[0].revenue === 0);

const monthly = monthlySeries(testSales, 3, now);
check('oylik seriya: 3 qator', monthly.length === 3);
check('oylik seriya: sentabr 10000', monthly[0].revenue === 10000);
check('oylik seriya: oktabr 40000', monthly[1].revenue === 40000);
check('oylik seriya: noyabr 35000', monthly[2].revenue === 35000);
check('oylik seriya: sentabrda o\'sish yo\'q (baza yo\'q)', monthly[0].growth === null);
check('oylik seriya: oktabr o\'sishi +300%', monthly[1].growth === 300);
check('oylik seriya: noyabr o\'sishi −12.5%', monthly[2].growth === -12.5);
check('oylik seriya: joriy oy belgisi', monthly[2].key === '2026-11');

const cmp = monthComparison(testSales, now);
check('taqqoslash: joriy 35000', cmp.current.revenue === 35000);
check('taqqoslash: o\'tgan 40000', cmp.previous.revenue === 40000);
check('taqqoslash: o\'zgarish −12.5%', cmp.revenueChange === -12.5);
// Joriy oy: 15-noy (2 ta) + 14-noy (1 ta) = 3 chek; o'tgan oy: 1 chek
check('taqqoslash: cheklar farqi +2', cmp.checksChange === 2);

// Bo'sh baza — nolga bo'lish yo'q
const empty = periodStats([], startOfDay(now), now);
check('bo\'sh davr: 0, xato yo\'q', empty.revenue === 0 && empty.margin === 0 && empty.avgCheck === 0);
const emptyMonthly = monthlySeries([], 2, now);
check('bo\'sh oylar: growth null', emptyMonthly.every((r) => r.growth === null));

/* ====================================================================== */
/*  5. NAVIGATSIYA — ikki panel                                           */
/* ====================================================================== */
const b1 = resolveBottomNav(['dashboard', 'sales', 'products', 'stock', 'debts']);
check('nav: 5 element saqlanadi', b1.length === 5 && b1[1] === 'sales');

const b2 = resolveBottomNav([]);
check('nav: bo\'sh sozlama → zaxira to\'ldiriladi', b2.length >= 3);
check('nav: zaxira dashboard bilan boshlanadi', b2[0] === 'dashboard');

const b3 = resolveBottomNav(['reports', 'reports', 'stats']);
check('nav: dublikatlar olib tashlanadi', b3.length === 3 && b3.filter((k) => k === 'reports').length === 1);

const b4 = resolveBottomNav(['not-a-key', 'stats', null, 42]);
check('nav: noto\'g\'ri kalitlar tashlanadi', b4.every((k) => typeof k === 'string'));
check('nav: noto\'g\'ri kalitdan keyin zaxira to\'ldiradi', b4.length >= 3);

const b5 = resolveBottomNav(['dashboard', 'sales', 'products', 'stock', 'debts', 'reports', 'stats']);
check('nav: maksimal 5 tadan oshmaydi', b5.length === 5);

const side = resolveSidebarNav(['dashboard', 'sales', 'products', 'stock', 'debts']);
check('sidebar: barcha bo\'limlar bor', side.length === 9);
check('sidebar: tanlanganlar yuqorida', side.slice(0, 5).join() === 'dashboard,sales,products,stock,debts');
check('sidebar: dublikat yo\'q', new Set(side).size === side.length);
check('sidebar: stats ham bor (yashirilmaydi)', side.includes('stats'));

/* ====================================================================== */
/*  6. Migratsiya idempotentligi                                          */
/* ====================================================================== */
const beforeStr = JSON.stringify({
  p: await db.products.toArray(),
  c: await db.customers.toArray(),
  m: await db.moves.toArray(),
  l: await db.ledger.toArray(),
});
await repairDatabase();
const afterStr = JSON.stringify({
  p: await db.products.toArray(),
  c: await db.customers.toArray(),
  m: await db.moves.toArray(),
  l: await db.ledger.toArray(),
});
check('repair idempotent (v5)', beforeStr === afterStr);
check('legacy mahsulotda supplierId to\'ldirilgan',
  (await db.products.get('p2'))!.supplierId === '');

/* ====================================================================== */
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { failed++; console.log(`❌ ${name}`); }
}
console.log(failed === 0 ? `\n✅ Barcha ${checks.length} tekshiruv o'tdi` : `\n❌ ${failed}/${checks.length} yiqildi`);
process.exit(failed === 0 ? 0 : 1);
