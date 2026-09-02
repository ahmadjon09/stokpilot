import { db, uid, type Snapshot } from '../../db/db';
import { downloadBlob } from './misc';

const TABLES = ['products', 'categories', 'images', 'moves', 'sales', 'customers', 'logs'] as const;
type TableName = (typeof TABLES)[number];

export interface BackupFile {
  app: 'stokpilot';
  version: number;
  exportedAt: number;
  tables: Record<TableName, unknown[]>;
}

export async function buildBackup(): Promise<BackupFile> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) {
    tables[t] = await db.table(t).toArray();
  }
  return { app: 'stokpilot', version: 1, exportedAt: Date.now(), tables };
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

export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.categories, db.images, db.moves, db.sales, db.customers, db.logs],
    async () => {
      for (const t of TABLES) {
        await db.table(t).clear();
        const rows = data.tables[t];
        if (Array.isArray(rows) && rows.length) await db.table(t).bulkAdd(rows);
      }
    }
  );
}

export async function restoreSnapshot(s: Snapshot): Promise<void> {
  const parsed: unknown = JSON.parse(s.data);
  if (!isValidBackup(parsed)) throw new Error('bad_snapshot');
  await restoreBackup(parsed);
}
