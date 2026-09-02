import { db } from './db';

/** Barcha ma'lumotlarni tozalash — bazani o'chirmasdan, jadvallarni bo'shatadi.
 *  db.delete() dan farqli: ochiq ulanish saqlanadi, live query'lar darhol yangilanadi.
 *  Faqat foydalanuvchi ataylab "Hammasini o'chirish" tugmasini bosganda ishlaydi. */
export async function wipeAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.categories, db.customers, db.sales, db.moves, db.logs, db.images, db.snapshots],
    async () => {
      await Promise.all([
        db.products.clear(), db.categories.clear(), db.customers.clear(),
        db.sales.clear(), db.moves.clear(), db.logs.clear(),
        db.images.clear(), db.snapshots.clear(),
      ]);
    }
  );
  // Sessiyadagi vaqtinchalik holat (savat, qoralamalar) ham tozalanadi
  try {
    sessionStorage.removeItem('sp-cart');
    sessionStorage.removeItem('sp-draft-product-new');
    localStorage.removeItem('sp-last-category');
  } catch { /* noop */ }
}
