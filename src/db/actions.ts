import { db, uid, addLog, type MoveType, type PayType, type Sale, type SaleItem, type Product } from './db';
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

export interface CheckoutInput {
  items: { product: Product; qty: number }[];
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  payType: PayType;
  customerId: string;
  note: string;
}

export async function completeSale(input: CheckoutInput): Promise<Sale> {
  return db.transaction('rw', db.products, db.moves, db.sales, db.customers, db.logs, async () => {
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

    let customerName = '';
    if (input.customerId) {
      const c = await db.customers.get(input.customerId);
      customerName = c?.name ?? '';
    }

    for (const it of items) {
      const p = await db.products.get(it.productId);
      if (!p) throw new Error('product_not_found');
      await db.products.update(it.productId, { stock: round2(p.stock - it.qty), updatedAt: now });
      await db.moves.add({
        id: uid(), productId: it.productId, productName: it.name,
        type: 'sale', qty: -it.qty, note: `#${number}`, createdAt: now, refId: saleId,
      });
    }

    const sale: Sale = {
      id: saleId, number, items, subtotal,
      discountType: input.discountType, discountValue: input.discountValue,
      total, costTotal, payType: input.payType,
      customerId: input.customerId, customerName,
      status: 'done', note: input.note, createdAt: now,
    };
    await db.sales.add(sale);

    if (input.payType === 'debt' && input.customerId) {
      const c = await db.customers.get(input.customerId);
      if (c) await db.customers.update(input.customerId, { balance: round2(c.balance + total) });
    }
    await addLog('sale', `Sotuv #${number}: ${total}`);
    return sale;
  });
}

export async function returnSale(saleId: string): Promise<void> {
  await db.transaction('rw', db.products, db.moves, db.sales, db.customers, db.logs, async () => {
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
    if (sale.payType === 'debt' && sale.customerId) {
      const c = await db.customers.get(sale.customerId);
      if (c) await db.customers.update(sale.customerId, { balance: round2(c.balance - sale.total) });
    }
    await db.sales.update(saleId, { status: 'returned' });
    await addLog('return', `Qaytarish #${sale.number}`);
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
