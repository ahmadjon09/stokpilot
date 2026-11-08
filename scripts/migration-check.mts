/**
 * Migratsiya smoke-testi: v1 sxemada "legacy" (chala) yozuvlar yaratadi,
 * keyin `openDatabase()` ni ishga tushirib v2 ga o'tishni tekshiradi.
 * Ishga tushirish: npx tsx scripts/migration-check.mts
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

(globalThis as any).window = globalThis;

// 1) v1 baza — eski sxema, "chala" yozuvlar bilan
const legacy = new Dexie('stokpilot');
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
await legacy.open();

await legacy.table('products').bulkAdd([
  // imageIds yo'q, unit noto'g'ri, stock string
  { id: 'p1', sku: 'SP-1', name: 'Non', categoryId: 'c1', cost: '2 000', price: 3000, minStock: 5, stock: '12', barcode: '', note: '', createdAt: 1700000000000 },
  // butunlay buzuq — id bor, name yo'q
  { id: 'p2' },
  // rasmga havola qiladi, lekin rasm jadvali bo'sh (o'chirilgan rasm)
  { id: 'p3', name: 'Sut', sku: 'SP-2', unit: 'litr', price: 11000, imageIds: ['ghost-img', 'img1'], createdAt: 1700000100000 },
]);
await legacy.table('categories').add({ id: 'c1', name: 'Oziq-ovqat' });
await legacy.table('images').add({ id: 'img1', productId: 'p3', data: 'data:image/jpeg;base64,AAA', thumb: 'data:image/jpeg;base64,A', size: 40, createdAt: 1 });
// ikkita sotuv bir xil raqam bilan (race condition) + items yo'q chek
await legacy.table('sales').bulkAdd([
  { id: 's1', number: 1, items: [{ productId: 'p1', name: 'Non', price: 3000, qty: 2 }], total: 6000, createdAt: 1700000200000, payType: 'cash', status: 'done' },
  { id: 's2', number: 1, items: [], createdAt: 1700000300000 },
  { id: 's3', number: 0, items: [{ productId: 'p1', name: 'Non', price: 3000, qty: 1 }], subtotal: 3000, total: 3000, createdAt: 1700000400000 },
]);
await legacy.table('customers').add({ id: 'cu1', name: 'Ali', kind: 'nonsense', balance: '5000', createdAt: 5 });
await legacy.close();

// 2) Yangi kod bilan ochish
const { openDatabase, db } = await import('../src/db/db.ts');
const result = await openDatabase();
console.log('status:', result.status, '| report:', JSON.stringify(result.report));

const products = await db.products.toArray();
const sales = await db.sales.toArray();
const customers = await db.customers.toArray();

const checks: [string, boolean][] = [
  ['3 mahsulot saqlanib qoldi', products.length === 3],
  ['cost "2 000" → 2000', products.find(p => p.id === 'p1')?.cost === 2000],
  ['stock "12" → 12', products.find(p => p.id === 'p1')?.stock === 12],
  ['unit default dona', products.find(p => p.id === 'p1')?.unit === 'dona'],
  ["o'chirilgan rasm havolasi olib tashlandi", JSON.stringify(products.find(p => p.id === 'p3')?.imageIds) === '["img1"]'],
  ["yaratilgan vaqt saqlandi", products.find(p => p.id === 'p1')?.createdAt === 1700000000000],
  ['chek raqamlari unikal', new Set(sales.map(s => s.number)).size === sales.length],
  ['chek raqamlari > 0', sales.every(s => s.number > 0)],
  ["items bo'sh chek ham saqlandi", sales.length === 3],
  ['client kind validatsiyadan o\'tdi', customers[0].kind === 'customer'],
  ['balance "5000" → 5000', customers[0].balance === 5000],
  ['status repaired', result.status === 'repaired'],
];

let failed = 0;
for (const [name, ok] of checks) { if (!ok) { failed++; console.log('FAIL:', name); } }
console.log(failed === 0 ? `\n✅ Barcha ${checks.length} tekshiruv o'tdi` : `\n❌ ${failed} tekshiruv yiqildi`);

// 3) Idempotentlik — qayta repair hech narsani o'zgartirmasligi kerak
const before = JSON.stringify({ p: products, s: sales, c: customers, i: await db.images.toArray(), m: await db.moves.toArray() });
const { repairDatabase } = await import('../src/db/db.ts');
const again = await repairDatabase();
const after = JSON.stringify({ p: await db.products.toArray(), s: await db.sales.toArray(), c: await db.customers.toArray(), i: await db.images.toArray(), m: await db.moves.toArray() });
if (before !== after) {
  const A = JSON.parse(before), B = JSON.parse(after);
  for (const k of Object.keys(A)) A[k].forEach((row: any, i: number) => {
    if (JSON.stringify(row) !== JSON.stringify(B[k][i])) console.log('DIFF', k, JSON.stringify(row), '→', JSON.stringify(B[k][i]));
  });
}
console.log('qayta repair → o\'zgargan yozuvlar:', again.total, again.total === 0 ? '✅ idempotent' : '❌');
process.exit(failed === 0 && again.total === 0 ? 0 : 1);
