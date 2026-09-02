import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Brush, Eraser, HardDrive, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/db';
import { recompressDataUrl } from '../../shared/lib/img';
import { formatDateTime } from '../../shared/lib/format';
import { formatBytes } from '../../shared/ui/bits';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';
import { ConfirmDialog } from '../../shared/ui/bits';

const DAY = 86400000;

interface TableStat { name: string; count: number; bytes: number }

const TABLE_LABELS: Record<string, string> = {
  products: 'Products',
  sales: 'Sales',
  moves: 'StockMoves',
  customers: 'Customers',
  images: 'Images',
  logs: 'Logs',
  categories: 'Categories',
  snapshots: 'Snapshots',
};

export default function StorageSheet() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const hasBackground = Boolean((location.state as { background?: unknown } | null)?.background);
  const close = () => { if (hasBackground) navigate(-1); else navigate('/settings'); };

  const [stats, setStats] = useState<TableStat[]>([]);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [topImages, setTopImages] = useState<{ id: string; thumb: string; size: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRecompress, setConfirmRecompress] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const measure = useCallback(async () => {
    const names = ['products', 'sales', 'moves', 'customers', 'images', 'logs', 'categories', 'snapshots'] as const;
    const out: TableStat[] = [];
    for (const n of names) {
      const rows = await db.table(n).toArray();
      let bytes = 0;
      for (const r of rows) bytes += JSON.stringify(r).length;
      out.push({ name: n, count: rows.length, bytes });
    }
    setStats(out);
    const imgs = await db.images.toArray();
    const prodNames = new Map((await db.products.toArray()).map((p) => [p.id, p.name]));
    setTopImages(
      [...imgs].sort((a, b) => b.size - a.size).slice(0, 10)
        .map((im) => ({ id: im.id, thumb: im.thumb, size: im.size, name: prodNames.get(im.productId) ?? '—' }))
    );
    try {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => { void measure(); }, [measure]);

  const totalBytes = stats.reduce((s, x) => s + x.bytes, 0);

  const clearCache = async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    toast(t('storage.cacheCleared'));
    buzz(12);
  };

  const clearLogs = async () => {
    const old = await db.logs.filter((l) => l.createdAt < Date.now() - 30 * DAY).toArray();
    if (old.length === 0) { toast(t('storage.noOldLogs')); return; }
    await db.logs.bulkDelete(old.map((l) => l.id));
    toast(`${old.length} ${t('storage.logsCleared')}`);
    buzz(12);
    void measure();
  };

  const recompress = async () => {
    setBusy(true);
    try {
      const imgs = await db.images.toArray();
      let n = 0;
      for (const im of imgs) {
        try {
          const data = await recompressDataUrl(im.data, 1200, 0.8);
          const thumb = await recompressDataUrl(im.thumb, 200, 0.75);
          await db.images.update(im.id, { data, thumb, size: data.length + thumb.length });
          n++;
        } catch { /* rasmni o'tkazib yuborish */ }
      }
      toast(`${n} ${t('storage.recompressDone')}`);
      buzz(14);
      void measure();
    } finally {
      setBusy(false);
      setConfirmRecompress(false);
    }
  };

  return (
    <Sheet title={t('storage.title')} onClose={close} wide>
      {/* Umumiy xotira */}
      <div className="card mb-3 p-4">
        {estimate ? (
          <>
            <div className="mb-2 flex justify-between text-[0.8125rem]">
              <span className="flex items-center gap-1.5 font-bold"><HardDrive size={15} strokeWidth={1.5} /> {t('storage.used')}: {formatBytes(estimate.usage)}</span>
              <span className="text-mute">{t('storage.total')}: {formatBytes(estimate.quota)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface2)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(1, (estimate.usage / Math.max(estimate.quota, 1)) * 100)}%`, background: 'var(--accent)' }} />
            </div>
            <p className="mt-1.5 text-[0.75rem] text-mute">{t('storage.free')}: {formatBytes(Math.max(0, estimate.quota - estimate.usage))}</p>
          </>
        ) : (
          <p className="text-[0.8125rem] text-mute">{t('storage.storageUnavailable')}</p>
        )}
      </div>

      {/* Jadval bo'yicha */}
      <p className="mb-2 text-[0.8125rem] font-bold text-mute">{t('storage.byModel')}</p>
      <div className="card row-list mb-3 overflow-hidden">
        {stats.map((st) => {
          const pct = totalBytes > 0 ? (st.bytes / totalBytes) * 100 : 0;
          return (
            <div key={st.name} className="px-3.5 py-2.5">
              <div className="flex items-center justify-between text-[0.8438rem]">
                <span className="font-semibold">{TABLE_LABELS[st.name] ?? st.name}</span>
                <span className="tnum text-mute">{st.count} {t('common.records')} · {formatBytes(st.bytes)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(pct, st.bytes > 0 ? 2 : 0)}%`, background: pct > 60 ? 'var(--warn)' : 'var(--accent)' }} />
                </div>
                <span className="tnum w-11 text-right text-[0.7188rem] text-mute">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Eng katta rasmlar */}
      {topImages.length > 0 && (
        <>
          <p className="mb-2 text-[0.8125rem] font-bold text-mute">{t('storage.largestImages')}</p>
          <div className="card row-list mb-3 overflow-hidden">
            {topImages.map((im) => (
              <div key={im.id} className="flex items-center gap-3 px-3.5 py-2">
                <img src={im.thumb} alt="" className="h-10 w-10 rounded-lg border border-line object-cover" />
                <span className="min-w-0 flex-1 truncate text-[0.8438rem] font-semibold">{im.name}</span>
                <span className="tnum text-[0.7812rem] text-mute">{formatBytes(im.size)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Amallar */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => void clearCache()}>
          <Eraser size={16} strokeWidth={1.5} /> {t('storage.clearCache')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void clearLogs()}>
          <Trash2 size={16} strokeWidth={1.5} /> {t('storage.clearLogs')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirmRecompress(true)}>
          <Brush size={16} strokeWidth={1.5} /> {busy ? t('common.loading') : t('storage.recompress')}
        </button>
        <button type="button" className="btn btn-ghost" style={{ color: 'var(--bad)' }} onClick={() => setConfirmWipe(true)}>
          <Trash2 size={16} strokeWidth={1.5} /> {t('storage.wipe')}
        </button>
      </div>
      <p className="mt-2 text-center text-[0.7188rem] text-mute">{t('common.date')}: {formatDateTime(Date.now())}</p>

      {confirmRecompress && (
        <ConfirmDialog title={t('storage.recompress')} text={t('storage.recompressConfirm')}
          onConfirm={() => void recompress()} onCancel={() => setConfirmRecompress(false)} />
      )}
      {confirmWipe && (
        <ConfirmDialog title={t('storage.wipe')} text={t('settings.wipeConfirm')} danger confirmLabel={t('common.delete')}
          onConfirm={() => { void (async () => { await db.delete(); window.location.reload(); })(); }}
          onCancel={() => setConfirmWipe(false)} />
      )}
    </Sheet>
  );
}
