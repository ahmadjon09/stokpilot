import Dexie, { type Table, type Transaction } from 'dexie';
import { migrateV1toV2, type MigrationReport } from './migrations';

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

/**
 * Joriy sxema versiyasi. Har oshirishda:
 *  1. `DB_VERSION` ni +1 qiling;
 *  2. pastda `this.version(N).stores({...}).upgrade(...)` qo'shing;
 *  3. migrations.ts ga tegishli funksiyani yozing.
 * Dexie eski versiyalardagi `.stores()` ta'riflarini o'zi saqlab qoladi —
 * shuning uchun eski bloklarni o'chirib tashlamang.
 */
export const DB_VERSION = 2;

class StokPilotDB extends Dexie {
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  images!: Table<ImageRec, string>;
  moves!: Table<StockMove, string>;
  sales!: Table<Sale, string>;
  customers!: Table<Customer, string>;
  logs!: Table<LogRec, string>;
  snapshots!: Table<Snapshot, string>;

  /** Oxirgi migratsiya hisoboti (UI "Xotira" bo'limida ko'rsatiladi) */
  lastMigration: MigrationReport | null = null;

  constructor() {
    super('stokpilot');

    // ── v1 — boshlang'ich sxema (o'zgartirilmaydi!) ────────────────────────
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

    // ── v2 — indekslar kengaytirildi + legacy ma'lumotlar tiklanadi ──────
    // Yangi indekslar: barcode (POS tez qidiruv), moves.type / refId
    // (hisobot va chek tarixi uchun), sales.status (qaytarilganlarni filtrlash),
    // logs.action (audit filtri).
    this.version(DB_VERSION).stores({
      products: 'id, name, sku, categoryId, barcode, updatedAt',
      categories: 'id, name',
      images: 'id, productId',
      moves: 'id, productId, createdAt, type, refId',
      sales: 'id, createdAt, number, customerId, status, payType',
      customers: 'id, name, kind',
      logs: 'id, createdAt, action',
      snapshots: 'id, createdAt',
    }).upgrade(async (tx) => {
      // Upgrade ichida faqat `tx.table(...)` ishlatiladi (db.* emas!)
      this.lastMigration = await migrateV1toV2(tx);
    });
  }
}

export const db = new StokPilotDB();

/**
 * Migratsiya hisoboti — modul darajasida ham saqlanadi, chunki `lastMigration`
 * faqat upgrade sodir bo'lganda to'ladi va UI keyinroq o'qiydi.
 */
export function getMigrationReport(): MigrationReport | null {
  return db.lastMigration;
}

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

/* ---------------------------------------------------------------------- */
/*  Xavfsiz ochish: bloklangan / buzilgan baza uchun fallback              */
/* ---------------------------------------------------------------------- */

export type OpenStatus = 'ready' | 'repaired' | 'reseeded' | 'blocked';

export interface OpenResult {
  status: OpenStatus;
  /** Foydalanuvchi uchun xabar kaliti (i18n) */
  message?: 'db.repaired' | 'db.reseeded' | 'db.blocked';
  report?: MigrationReport | null;
  error?: unknown;
}

/**
 * Bazani ochadi va buzilgan bo'lsa "o'zini tiklaydi".
 *
 * Stsenariylar:
 *  - `ready`    — baza normal ochildi;
 *  - `repaired` — ochildi, lekin ba'zi yozuvlar to'g'rilandi;
 *  - `reseeded` — baza butunlay ochilmadi (DataError / VersionError). Bunday holatda
 *                 foydalanuvchi ma'lumotini yo'qotmaslik uchun avval mavjud
 *                 yozuvlarni xotirada o'qishga urinamiz; o'qib bo'lmasa baza
 *                 qayta yaratiladi (yangi bo'sh baza) — bu oxirgi chora;
 *  - `blocked`  — boshqa tab eski versiyani ushlab turibdi (VersionError).
 */
let openPromise: Promise<OpenResult> | null = null;

/**
 * Idempotent ochish: React StrictMode effektni ikki marta chaqiradi,
 * shuning uchun parallel chaqiriqlar bitta promise'ni bo'lishadi —
 * tiklash (rescue) jarayoni ikki marta ishga tushmaydi.
 */
export function openDatabase(): Promise<OpenResult> {
  if (!openPromise) {
    openPromise = (async (): Promise<OpenResult> => {
      try {
        await db.open();
        const report = getMigrationReport();
        if (report && report.total > 0) return { status: 'repaired', message: 'db.repaired', report };
        return { status: 'ready', report };
      } catch (error) {
        return recoverDatabase(error);
      }
    })();
  }
  return openPromise;
}

/**
 * Buzilgan bazadan chiqish yo'li.
 * 1) Agar xato "ClosedByAnotherTab"/"Blocked" bo'lsa — hech narsa qilmaymiz,
 *    foydalanuvchiga qayta urinishni taklif qilamiz.
 * 2) Aks holda mavjud ma'lumotni iloji boricha o'qib olishga urinamiz, keyin
 *    bazani qayta yaratamiz.
 */
async function recoverDatabase(error: unknown): Promise<OpenResult> {
  const name = (error as { name?: string } | null)?.name ?? '';
  const blocked = name === 'BlockedError' || name === 'DatabaseClosedError' || name === 'TimeoutError';
  if (blocked) return { status: 'blocked', message: 'db.blocked', error };

  // `VersionError` — baza bizdan YANGIROQ versiyada (downgrade). Bu holatda
  // hatto o'qib ham bo'lmaydi, lekin ma'lumot bor! Uni o'chirish taqiqlanadi.
  if (name === 'VersionError') return { status: 'blocked', message: 'db.blocked', error };

  // Rescue: eski bazani "tuzatishsiz" ochib, yozuvlarni xotiraga olamiz
  let rescue: Record<string, unknown[]> | null = null;
  try {
    const raw = new Dexie('stokpilot');
    raw.version(DB_VERSION).stores({
      products: 'id, name, sku, categoryId, barcode, updatedAt',
      categories: 'id, name',
      images: 'id, productId',
      moves: 'id, productId, createdAt, type, refId',
      sales: 'id, createdAt, number, customerId, status, payType',
      customers: 'id, name, kind',
      logs: 'id, createdAt, action',
      snapshots: 'id, createdAt',
    });
    // Buzilgan yozuvlar `toArray()` da xato berishi mumkin — jadval bo'yicha alohida
    const out: Record<string, unknown[]> = {};
    for (const t of ['categories', 'products', 'images', 'moves', 'sales', 'customers', 'logs', 'snapshots']) {
      try {
        out[t] = await raw.table(t).toArray();
      } catch {
        out[t] = [];
      }
    }
    rescue = out;
    raw.close();
  } catch {
    rescue = null;
  }

  // Rescue ham imkonsiz bo'lsa — bazani O'CHIRMAYMIZ. Foydalanuvchi ma'lumoti
  // joyida qoladi, "qayta urinish" tugmasi beriladi.
  if (!rescue) return { status: 'blocked', message: 'db.blocked', error };

  const rescuedRows = Object.values(rescue).reduce((s, rows) => s + rows.length, 0);
  if (rescuedRows === 0) {
    // Baza bo'sh/buzilgan va o'qiladigan yozuv yo'q — buni xotirjam qayta yaratish mumkin
    try {
      await Dexie.delete('stokpilot');
      await db.open();
      return { status: 'reseeded', message: 'db.reseeded', error };
    } catch (fatal) {
      return { status: 'blocked', message: 'db.blocked', error: fatal };
    }
  }

  // Ma'lumot bor va o'qib olindi → bazani qayta yaratib, yozuvlarni qaytaramiz
  try {
    await Dexie.delete('stokpilot');
    const fresh = new StokPilotDB();
    await fresh.open();
    for (const [table, rows] of Object.entries(rescue)) {
      if (!rows.length) continue;
      try {
        await fresh.table(table).bulkPut(rows);
      } catch {
        // Bitta buzuq yozuv butun jadvalni to'xtatmasligi kerak
        for (const row of rows) {
          try { await fresh.table(table).put(row); } catch { /* yozuvni o'tkazib yuborish */ }
        }
      }
    }
    fresh.close();
    // `db` singletonini qayta ochamiz va tiklangan yozuvlarni normallashtiramiz
    db.close();
    await db.open();
    const report = await repairDatabase();
    return { status: 'reseeded', message: 'db.reseeded', report, error };
  } catch (fatal) {
    return { status: 'blocked', message: 'db.blocked', error: fatal };
  }
}

/**
 * Foydalanuvchi boshlagan "tiklash" amali — saqlash (backup) import qilgandan keyin
 * yoki nosozlikdan keyin qo'lda ishga tushiriladi.
 * Barcha jadvallarni validatsiyadan o'tkazadi va hisobotni qaytaradi.
 */
export async function repairDatabase(): Promise<MigrationReport> {
  await db.open();
  return db.transaction(
    'rw',
    [db.products, db.categories, db.images, db.moves, db.sales, db.customers, db.logs],
    (tx: Transaction) => migrateV1toV2(tx),
  );
}
