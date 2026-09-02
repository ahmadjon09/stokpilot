import Dexie, { type Table } from 'dexie';

export type Unit = 'dona' | 'kg' | 'litr' | 'metr';

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  unit: Unit;
  cost: number;
  price: number;
  minStock: number;
  stock: number;
  barcode: string;
  note: string;
  imageIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ImageRec {
  id: string;
  productId: string;
  data: string; // base64 full size (max 1200px, q=0.8)
  thumb: string; // base64 thumbnail (200px)
  size: number; // approximate bytes
  createdAt: number;
}

export type MoveType = 'in' | 'out' | 'recount' | 'sale' | 'return';

export interface StockMove {
  id: string;
  productId: string;
  productName: string; // snapshot (audit-log uchun)
  type: MoveType;
  qty: number; // signed delta
  note: string;
  createdAt: number;
  refId?: string;
}

export type PayType = 'cash' | 'card' | 'transfer' | 'debt';

export interface SaleItem {
  productId: string;
  name: string; // snapshot
  unit: Unit;
  price: number;
  cost: number;
  qty: number;
}

export interface Sale {
  id: string;
  number: number;
  items: SaleItem[];
  subtotal: number;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  total: number;
  costTotal: number;
  payType: PayType;
  customerId: string;
  customerName: string;
  status: 'done' | 'returned';
  note: string;
  createdAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  kind: 'customer' | 'supplier';
  balance: number; // >0 — mijoz qarzdor / biz yetkazib beruvchiga qarzdormiz
  note: string;
  createdAt: number;
}

export interface LogRec {
  id: string;
  action: string;
  message: string;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  data: string;
}

class StokPilotDB extends Dexie {
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  images!: Table<ImageRec, string>;
  moves!: Table<StockMove, string>;
  sales!: Table<Sale, string>;
  customers!: Table<Customer, string>;
  logs!: Table<LogRec, string>;
  snapshots!: Table<Snapshot, string>;

  constructor() {
    super('stokpilot');
    // Versiyalangan schema: keyingi migratsiyalar this.version(2)... orqali qo'shiladi
    this.version(1).stores({
      products: 'id, name, sku, categoryId',
      categories: 'id, name',
      images: 'id, productId',
      moves: 'id, productId, createdAt',
      sales: 'id, createdAt, number, customerId',
      customers: 'id, name, kind',
      logs: 'id, createdAt',
      snapshots: 'id, createdAt',
    });
  }
}

export const db = new StokPilotDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function addLog(action: string, message: string): Promise<void> {
  await db.logs.add({ id: uid(), action, message, createdAt: Date.now() });
}

export async function nextSku(): Promise<string> {
  const count = await db.products.count();
  return 'SP-' + String(1001 + count);
}
