/**
 * Qarz daftari (ledger) business-logic testi.
 *
 * Tekshiradi:
 *  - v2 → v3 migratsiyasi: mavjud balans va nasiya sotuvlari daftarga
 *    to'g'ri ko'chirilishi (ma'lumot yo'qolmasligi, idempotentlik);
 *  - yetkazib beruvchi bilan hisob-kitob (biz qarzdormiz → to'lov);
 *  - mijozning bo'lib to'lashi (partial payment) va qoldiq tarixi;
 *  - savat ichida yangi mijoz yaratib nasiya sotish (avans bilan);
 *  - qaytarishda faqat to'lanmagan qismning qarzdan chiqarilishi.
 *
 * Ishga tushirish: npm run check:ledger
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

(globalThis as any).window = globalThis;

const DB_NAME = 'stokpilot';

/* ---------------------------------------------------------------------- */
/*  1) v2 bazani "eski" ma'lumotlar bilan yaratamiz                        */
/* ---------------------------------------------------------------------- */
const legacy = new Dexie(DB_NAME);
legacy.version(1).stores({
  products: 'id, name, sku, categoryId',
  categories: 'id, name',
  images: 'id, productId',
  moves: 'id, productId, createdAt',
  sales: 'id, createdAt, number, customerId',
  customers: 'id, name, kind',
  logs: 'id, createdAt',
  snapshots: 'id, createdAt',
});
legacy.version(2).stores({
  products: 'id, name, sku, categoryId, barcode, updatedAt',
  categories: 'id, name',
  images: 'id, productId',
  moves: 'id, productId, createdAt, type, refId',
  sales: 'id, createdAt, number, customerId, status, payType',
  customers: 'id, name, kind',
  logs: 'id, createdAt, action',
  snapshots: 'id, createdAt',
});
await legacy.open();

await legacy.table('products').bulkAdd([
  { id: 'p1', sku: 'SP-1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, stock: 100, price2: 0, createdAt: 1, updatedAt: 1 },
  { id: 'p2', sku: 'SP-2', name: 'Sut', unit: 'litr', price: 11000, cost: 9000, stock: 50, createdAt: 1, updatedAt: 1 },
]);
await legacy.table('customers').bulkAdd([
  // mijoz: 30 000 so'm qarzi bor (eski qo'lda kiritilgan qarz)
  { id: 'c1', name: 'Ali', phone: '+998901112233', kind: 'customer', balance: 30000, note: '', createdAt: 1 },
  // yetkazib beruvchi: biz unga 100 000 so'm qarzdormiz → manfiy balans
  { id: 's1', name: 'Mega Savdo', phone: '', kind: 'supplier', balance: -100000, note: '', createdAt: 2 },
  // qarzsiz mijoz
  { id: 'c2', name: 'Vali', phone: '', kind: 'customer', balance: 0, note: '', createdAt: 3 },
  // MUHIM regressiya: createdAt YO'Q mijoz + undan ham "eski" nasiya sotuv.
  // `opening` yozuvi sotuvdan keyin sanalib qolsa yakuniy balans buzilardi.
  { id: 'c3', name: 'Eski mijoz', phone: '', kind: 'customer', balance: 20000, note: '' },
]);
await legacy.table('sales').bulkAdd([
  // c1 uchun nasiya sotuv 20 000 (legacy: paid/debt maydonlari yo'q)
  {
    id: 'sale1', number: 1, items: [{ productId: 'p1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, qty: 4 }],
    subtotal: 12000, discountType: 'none', discountValue: 0, total: 12000, costTotal: 8000,
    payType: 'debt', customerId: 'c1', customerName: 'Ali', status: 'done', note: '', createdAt: 1000,
  },
  // c3 uchun nasiya sotuv — mijoz.createdAt dan OLDIN (createdAt yo'q → validator "hozir" qo'yadi)
  {
    id: 'sale3', number: 3, items: [{ productId: 'p1', name: 'Non', unit: 'dona', price: 3000, cost: 2000, qty: 20 }],
    subtotal: 60000, discountType: 'none', discountValue: 0, total: 60000, costTotal: 40000,
    payType: 'debt', customerId: 'c3', customerName: 'Eski mijoz', status: 'done', note: '', createdAt: 500,
  },
  // naqd sotuv — daftarga tushmasligi kerak
  {
    id: 'sale2', number: 2, items: [{ productId: 'p2', name: 'Sut', unit: 'litr', price: 11000, cost: 9000, qty: 1 }],
    subtotal: 11000, discountType: 'none', discountValue: 0, total: 11000, costTotal: 9000,
    payType: 'cash', customerId: '', customerName: '', status: 'done', note: '', createdAt: 2000,
  },
]);
await legacy.close();

/* ---------------------------------------------------------------------- */
/*  2) Yangi kod bilan ochish → v3 migratsiyasi                            */
/* ---------------------------------------------------------------------- */
const { db, openDatabase } = await import('../src/db/db.ts');
const { completeSale, recordPayment, returnSale, saveCustomer } = await import('../src/db/actions.ts');
const { partyNet, ledgerStats } = await import('../src/db/ledger.ts');

const open = await openDatabase();
console.log(`open status: ${open.status}`);

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

const c1 = await db.customers.get('c1');
const s1 = await db.customers.get('s1');
const c2 = await db.customers.get('c2');

check('mijoz balansi saqlandi', c1?.balance === 30000);
check('yetkazib beruvchi balansi saqlandi', s1?.balance === -100000);

const c1Entries = await db.ledger.where('partyId').equals('c1').toArray();
check('mijoz daftari yozildi', c1Entries.length >= 1);
check('nasiya sotuv daftarga tushdi', c1Entries.some((e) => e.source === 'sale' && e.amount === 12000));
check('opening yozuvi qoldiqni saqladi', c1Entries.some((e) => e.source === 'opening' && e.balanceAfter === 18000));
check('daftar yakuni = mijoz balansi',
  c1Entries.reduce((s, e) => s + (e.source === 'opening' ? 0 : e.direction === 'charge' ? e.amount : -e.amount), 0) + 18000 === 30000);
check('eng oxirgi yozuv balansi balansga mos', c1Entries.sort((a, b) => a.createdAt - b.createdAt).at(-1)?.balanceAfter === 30000);
check('qarzsiz mijozga bo\'sh daftar yaratilmadi', (await db.ledger.where('partyId').equals('c2').toArray()).length === 0);
check('naqd sotuv daftarga tushmadi', (await db.ledger.where('partyId').equals(c2?.id ?? '').toArray()).length === 0);
check('legacy sotuv paidAmount to\'ldirildi', (await db.sales.get('sale1'))?.debtAmount === 12000);

// Regressiya: opening sotuvdan oldin bo'lishi va yakuniy balans saqlanishi
const c3 = await db.customers.get('c3');
const c3Entries = (await db.ledger.where('partyId').equals('c3').toArray()).sort((a, b) => a.createdAt - b.createdAt);
check('createdAt\'siz mijoz balansi saqlandi (20000)', c3?.balance === 20000);
check('opening yozuvi eng birinchi', c3Entries[0]?.source === 'opening');
check('opening = 20 000 − 60 000 = −40 000', c3Entries[0]?.balanceAfter === -40000);
check('tarix yakuni mijoz balansiga teng', c3Entries.at(-1)?.balanceAfter === 20000);

const supplierNet = partyNet(s1!.balance);
check('yetkazib beruvchi: biz qarzdormiz', supplierNet.theyOweUs === false && supplierNet.amount === 100000);

/* ---------------------------------------------------------------------- */
/*  3) Yetkazib beruvchiga to'lov (partial)                                */
/* ---------------------------------------------------------------------- */
await recordPayment({ partyId: 's1', amount: 40000, note: 'Birinchi to\'lov', method: 'cash' });
const s1After = (await db.customers.get('s1'))!;
check('yetkazib beruvchi qarzi 60 000 ga tushdi', s1After.balance === -60000);
const s1Entries = await db.ledger.where('partyId').equals('s1').toArray();
check('to\'lov yozuvi izohi bilan saqlandi', s1Entries.some((e) => e.direction === 'payment' && e.amount === 40000 && e.note.includes('Birinchi')));
check('to\'lovdan keyingi qoldiq yozuvda', s1Entries.sort((a, b) => a.createdAt - b.createdAt).at(-1)?.balanceAfter === -60000);

/* ---------------------------------------------------------------------- */
/*  4) Mijozning bo'lib to'lashi                                           */
/* ---------------------------------------------------------------------- */
await recordPayment({ partyId: 'c1', amount: 10000, note: 'Birinchi bo\'lak' });
await recordPayment({ partyId: 'c1', amount: 5000, note: 'Ikkinchi bo\'lak' });
const c1After = (await db.customers.get('c1'))!;
check('mijoz qarzi 30 000 → 15 000', c1After.balance === 15000);
const c1Stats = ledgerStats(await db.ledger.where('partyId').equals('c1').toArray());
check('statistika: 2 ta to\'lov, jami 15 000', c1Stats.payments === 2 && c1Stats.paid === 15000);

/* ---------------------------------------------------------------------- */
/*  5) Savatdan yangi mijoz + nasiya (avans bilan)                         */
/* ---------------------------------------------------------------------- */
const products = await db.products.toArray();
const sale = await completeSale({
  items: [
    { product: products[0], qty: 2 },   // 6 000
    { product: products[1], qty: 1 },   // 11 000
  ],
  discountType: 'none', discountValue: 0,
  payType: 'debt', customerId: '',
  note: '', newCustomer: { name: 'Yangi Mijoz', phone: '+998900000000' },
  paidNow: 5000,
});

const newCust = await db.customers.get(sale.customerId);
check('yangi mijoz yaratildi va chek unga bog\'landi', newCust?.name === 'Yangi Mijoz');
check('telefon saqlandi', newCust?.phone === '+998900000000');
check('jami 17 000', sale.total === 17000);
check('paidAmount = avans 5 000', sale.paidAmount === 5000);
check('debtAmount = 12 000', sale.debtAmount === 12000);
check('mijoz balansi = qoldiq qarz', newCust?.balance === 12000);
const newEntries = await db.ledger.where('partyId').equals(sale.customerId).toArray();
check('daftarda: nasiya (charge) yozuvi', newEntries.some((e) => e.direction === 'charge' && e.amount === 17000 && e.source === 'sale'));
check('daftarda: avans (payment) yozuvi', newEntries.some((e) => e.direction === 'payment' && e.amount === 5000));
check('sotuvga bog\'langan yozuvda saleNumber', newEntries.every((e) => e.saleNumber === sale.number));

/* ---------------------------------------------------------------------- */
/*  6) Qaytarish: faqat to'lanmagan qism qarzdan chiqadi                   */
/* ---------------------------------------------------------------------- */
await returnSale(sale.id);
const returned = (await db.customers.get(sale.customerId))!;
check('qaytarishdan keyin qarz 0 (avans qarz emas)', returned.balance === 0);

/* ---------------------------------------------------------------------- */
/*  7) Idempotentlik: qayta repair daftarni buzmaydi                       */
/* ---------------------------------------------------------------------- */
const { repairDatabase } = await import('../src/db/db.ts');
const before = JSON.stringify(await db.ledger.toArray());
await repairDatabase();
const after = JSON.stringify(await db.ledger.toArray());
check('repair daftarni o\'zgartirmadi', before === after);

/* ---------------------------------------------------------------------- */
/*  8) Yetkazib beruvchi qo'lda balans bilan yaratilishi                    */
/* ---------------------------------------------------------------------- */
await saveCustomer({
  id: 's2', name: 'Yangi Postavshik', phone: '', kind: 'supplier',
  balance: -50000, note: '', createdAt: Date.now(),
});
const s2 = await db.customers.get('s2');
const s2Entries = await db.ledger.where('partyId').equals('s2').toArray();
check('yangi yetkazib beruvchi balansi saqlandi', s2?.balance === -50000);
check('boshlang\'ich qarz opening yozuvi bilan', s2Entries.length === 1 && s2Entries[0].source === 'opening' && s2Entries[0].balanceAfter === -50000);

/* ---------------------------------------------------------------------- */
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { failed++; console.log(`❌ ${name}`); }
}
console.log(failed === 0 ? `\n✅ Barcha ${checks.length} tekshiruv o'tdi` : `\n❌ ${failed}/${checks.length} yiqildi`);
process.exit(failed === 0 ? 0 : 1);
