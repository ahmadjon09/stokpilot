import { db, uid, DB_VERSION, type Snapshot } from '../../db/db';
import { normalizeDatabase } from '../../db/migrations';
import { downloadBlob } from './misc';

const TABLES = ['products', 'categories', 'images', 'moves', 'sales', 'customers', 'logs'] as const;
type TableName = (typeof TABLES)[number];

export interface BackupFile {
  app: 'stokpilot';
  /** Fayl formati versiyasi — importda migratsiya uchun ishlatiladi */
  version: number;
  exportedAt: number;
  tables: Partial<Record<TableName, unknown[]>>;
}

export async function buildBackup(): Promise<BackupFile> {
  const tables: Partial<Record<TableName, unknown[]>> = {};
  for (const t of TABLES) {
    tables[t] = await db.table(t).toArray();
  }
  return { app: 'stokpilot', version: DB_VERSION, exportedAt: Date.now(), tables };
}

export async function exportAllToFile(): Promise<void> {
  const data = await buildBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const d = new Date();
  downloadBlob(blob, `stokpilot-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`);
  await saveSnapshot(data);
}

/** Oxirgi 3 ta snapshot saqlanadi */
export async function saveSnapshot(data: BackupFile): Promise<void> {
  await db.snapshots.add({ id: uid(), createdAt: Date.now(), data: JSON.stringify(data) });
  const all = await db.snapshots.orderBy('createdAt').reverse().toArray();
  if (all.length > 3) {
    await db.snapshots.bulkDelete(all.slice(3).map((s) => s.id));
  }
}

export function isValidBackup(obj: unknown): obj is BackupFile {
  if (!obj || typeof obj !== 'object') return false;
  const b = obj as BackupFile;
  return b.app === 'stokpilot' && typeof b.tables === 'object' && b.tables !== null;
}

/**
 * Backup'ni tiklash.
 *
 * MUHIM: import qilingan yozuvlar "ko'r-ko'rona" saqlanmaydi. Ular joriy
 * sxema bo'yicha normallashtiriladi (validate.ts orqali) — shu tufayli eski
 * versiyada olingan backup ham yangi bazaga xavfsiz tushadi.
 * `db.transaction` ichida `db.*` ishlatilmaydi (faqat `tx.table`).
 */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.categories, db.images, db.moves, db.sales, db.customers, db.logs],
    async (tx) => {
      for (const t of TABLES) {
        await tx.table(t).clear();
        const rows = data.tables[t];
        if (Array.isArray(rows) && rows.length) {
          // Yaroqsiz qatorlar butun importni to'xtatmasligi kerak
          try {
            await tx.table(t).bulkAdd(rows);
          } catch {
            for (const row of rows) {
              try { await tx.table(t).add(row); } catch { /* qatorni o'tkazib yuborish */ }
            }
          }
        }
      }
      // Sxema/farq normalizatsiyasi — legacy maydonlar to'ldiriladi
      await normalizeDatabase(tx);
    }
  );
}

export async function restoreSnapshot(s: Snapshot): Promise<void> {
  const parsed: unknown = JSON.parse(s.data);
  if (!isValidBackup(parsed)) throw new Error('bad_snapshot');
  await restoreBackup(parsed);
}
