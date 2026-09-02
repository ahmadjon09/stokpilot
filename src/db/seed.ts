import { db, uid, type Category, type Customer, type Product, type Sale, type SaleItem, type StockMove, type Unit } from './db';

/** Deterministik RNG — demo har safar bir xil bo'ladi */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ProductDef {
  name: string;
  cat: number;
  unit: Unit;
  cost: number;
  price: number;
  stock: number; // yakuniy (sotuvlardan keyingi) qoldiq
}

const CATS = ['Ichimliklar', 'Oziq-ovqat', 'Shirinliklar', 'Maishiy kimyo', 'Elektronika'];

const PRODUCT_DEFS: ProductDef[] = [
  { name: 'Cola 1.5L', cat: 0, unit: 'dona', cost: 9000, price: 12000, stock: 64 },
  { name: 'Suv 1L', cat: 0, unit: 'dona', cost: 2000, price: 3500, stock: 118 },
  { name: 'Olma sharbati 1L', cat: 0, unit: 'dona', cost: 8000, price: 11000, stock: 41 },
  { name: 'Guruch (lazer) 1kg', cat: 1, unit: 'kg', cost: 12000, price: 16000, stock: 52 },
  { name: 'Un (oliy nav) 1kg', cat: 1, unit: 'kg', cost: 6000, price: 8000, stock: 47 },
  { name: 'Shakar 1kg', cat: 1, unit: 'kg', cost: 11000, price: 14000, stock: 38 },
  { name: 'Pishloq 1kg', cat: 1, unit: 'kg', cost: 55000, price: 70000, stock: 12 },
  { name: 'Shokolad (plitka)', cat: 2, unit: 'dona', cost: 9000, price: 13000, stock: 29 },
  { name: 'Pechenye 1kg', cat: 2, unit: 'kg', cost: 25000, price: 33000, stock: 17 },
  { name: 'Halva 1kg', cat: 2, unit: 'kg', cost: 22000, price: 30000, stock: 9 },
  { name: 'Kir kukuni 450g', cat: 3, unit: 'dona', cost: 12000, price: 16000, stock: 23 },
  { name: 'Idish yuvish geli 500ml', cat: 3, unit: 'dona', cost: 10000, price: 14500, stock: 19 },
  { name: 'Salfetka (100 dona)', cat: 3, unit: 'dona', cost: 8000, price: 11000, stock: 4 },
  { name: 'Batareya AA (4ta)', cat: 4, unit: 'dona', cost: 15000, price: 22000, stock: 3 },
  { name: 'USB kabel (Type-C)', cat: 4, unit: 'dona', cost: 18000, price: 30000, stock: 5 },
  { name: 'Quloqchin (simsiz)', cat: 4, unit: 'dona', cost: 95000, price: 150000, stock: 2 },
];

export async function seedDemo(): Promise<void> {
  const rnd = mulberry32(20260902);
  const now = Date.now();
  const dayMs = 86400000;

  const categories: Category[] = CATS.map((name) => ({ id: uid(), name }));

  const customers: Customer[] = [
    { id: uid(), name: 'Aliyev Vali', phone: '+998 90 123 45 67', kind: 'customer', balance: 0, note: '', createdAt: now - 40 * dayMs },
    { id: uid(), name: 'Malika Yusupova', phone: '+998 93 987 65 43', kind: 'customer', balance: 0, note: '', createdAt: now - 35 * dayMs },
    { id: uid(), name: "Do'kon \"Baraka\"", phone: '+998 71 200 11 22', kind: 'customer', balance: 0, note: 'Opt mijoz', createdAt: now - 30 * dayMs },
    { id: uid(), name: 'Oziq-ovqat ta\'minoti MChJ', phone: '+998 97 700 00 11', kind: 'supplier', balance: 0, note: '', createdAt: now - 60 * dayMs },
    { id: uid(), name: 'FreshDrink distributor', phone: '+998 95 555 12 34', kind: 'supplier', balance: 0, note: '', createdAt: now - 55 * dayMs },
  ];

  // Savdolar generatsiyasi (14 kun)
  const sales: Sale[] = [];
  const saleMoves: StockMove[] = [];
  const sold: number[] = PRODUCT_DEFS.map(() => 0);
  let saleNumber = 0;

  for (let d = 13; d >= 0; d--) {
    const count = 3 + Math.floor(rnd() * 6);
    for (let s = 0; s < count; s++) {
      saleNumber += 1;
      const itemCount = 1 + Math.floor(rnd() * 3);
      const chosen = new Set<number>();
      while (chosen.size < itemCount) chosen.add(Math.floor(rnd() * PRODUCT_DEFS.length));
      const items: SaleItem[] = [...chosen].map((idx) => {
        const def = PRODUCT_DEFS[idx];
        const qty = def.unit === 'kg' ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
        sold[idx] += qty;
        return {
          productId: 'p-' + idx, name: def.name, unit: def.unit,
          price: def.price, cost: def.cost, qty,
        };
      });
      const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
      const costTotal = items.reduce((sum, i) => sum + i.cost * i.qty, 0);
      const hasDisc = rnd() < 0.15;
      const discountType: Sale['discountType'] = hasDisc ? 'percent' : 'none';
      const discountValue = hasDisc ? (rnd() < 0.5 ? 5 : 10) : 0;
      const discount = Math.round((subtotal * discountValue) / 100);
      const total = subtotal - discount;
      const r = rnd();
      const payType: Sale['payType'] = r < 0.6 ? 'cash' : r < 0.85 ? 'card' : r < 0.95 ? 'transfer' : 'debt';
      const customer = payType === 'debt' ? customers[Math.floor(rnd() * 3)] : null;
      const createdAt = now - d * dayMs - Math.floor(rnd() * 10 * 3600000) - 2 * 3600000;
      const saleId = 's-' + saleNumber;
      if (customer) customer.balance += total;

      sales.push({
        id: saleId, number: saleNumber, items, subtotal,
        discountType, discountValue, total, costTotal,
        payType, customerId: customer?.id ?? '', customerName: customer?.name ?? '',
        status: 'done', note: '', createdAt,
      });
      for (const it of items) {
        saleMoves.push({
          id: uid(), productId: it.productId, productName: it.name,
          type: 'sale', qty: -it.qty, note: `#${saleNumber}`, createdAt, refId: saleId,
        });
      }
    }
  }

  // Mahsulotlar: boshlang'ich kirim = yakuniy qoldiq + sotilgan
  const products: Product[] = PRODUCT_DEFS.map((def, i) => ({
    id: 'p-' + i,
    sku: 'SP-' + String(1001 + i),
    name: def.name,
    categoryId: categories[def.cat].id,
    unit: def.unit,
    cost: def.cost,
    price: def.price,
    minStock: def.stock <= 5 ? 5 : 5,
    stock: def.stock,
    barcode: '47' + String(10000000000 + Math.floor(rnd() * 89999999999)),
    note: '',
    imageIds: [],
    createdAt: now - 45 * dayMs,
    updatedAt: now,
  }));

  const inMoves: StockMove[] = products.map((p, i) => ({
    id: uid(), productId: p.id, productName: p.name, type: 'in' as const,
    qty: p.stock + sold[i], note: 'Boshlang\'ich kirim', createdAt: now - 15 * dayMs,
  }));

  await db.transaction('rw', [db.products, db.categories, db.customers, db.sales, db.moves, db.logs, db.images], async () => {
    await Promise.all([
      db.products.clear(), db.categories.clear(), db.customers.clear(),
      db.sales.clear(), db.moves.clear(), db.logs.clear(), db.images.clear(),
    ]);
    await db.categories.bulkAdd(categories);
    await db.products.bulkAdd(products);
    await db.customers.bulkAdd(customers);
    await db.sales.bulkAdd(sales);
    await db.moves.bulkAdd([...inMoves, ...saleMoves]);
    await db.logs.add({ id: uid(), action: 'seed', message: 'Demo ma\'lumotlar yuklandi', createdAt: now });
  });
}

/** Birinchi ochilishda — agar baza bo'sh bo'lsa, demo yuklanadi */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.products.count();
  if (count === 0) await seedDemo();
}
