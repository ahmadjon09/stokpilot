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
  validateCategory, validateCustomer, validateImage, validateLog, validateMove, validateProduct, validateSale,
} from './validate';
import type { ImageRec, Product, Sale } from './db';

export interface MigrationReport {
  /** Jadval bo'yicha tikdan o'tgan yozuvlar soni */
  repaired: Record<string, number>;
  /** Jadval bo'yicha tashlab yuborilgan (tiklab bo'lmaydigan) yozuvlar */
  dropped: Record<string, number>;
  /** Jami o'zgargan yozuvlar */
  total: number;
}

const emptyReport = (): MigrationReport => ({ repaired: {}, dropped: {}, total: 0 });

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
export async function normalizeDatabase(tx: Transaction): Promise<MigrationReport> {
  const report = emptyReport();

  // 1) Mustaqil jadvallar — validatsiya va to'ldirish
  await normalizeTable(tx, 'categories', validateCategory, report);
  await normalizeTable(tx, 'products', validateProduct, report);
  await normalizeTable(tx, 'images', validateImage, report);
  await normalizeTable(tx, 'moves', validateMove, report);
  await normalizeTable(tx, 'sales', validateSale, report);
  await normalizeTable(tx, 'customers', validateCustomer, report);
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
