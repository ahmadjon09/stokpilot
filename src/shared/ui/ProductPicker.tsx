import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Package, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Product } from '../../db/db';
import { formatMoney, formatNumber } from '../lib/format';
import Sheet from './Sheet';
import { EmptyState } from './bits';
import { buzz } from '../lib/misc';

export default function ProductPicker({ onClose, onPick, title }: {
  onClose: () => void;
  onPick: (p: Product) => void;
  title: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s));
  }, [products, q]);

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="relative mb-3">
        <Search size={17} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input className="input pl-10" placeholder={t('products.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row-list card overflow-hidden">
        {filtered.length === 0 && <EmptyState icon={Package} title={t('dash.noData')} />}
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-card2"
            style={{ minHeight: 52 }}
            onClick={() => { buzz(8); onPick(p); }}
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
              <Package size={17} strokeWidth={1.5} className="text-accent" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{p.name}</span>
              <span className="block text-[12px] text-mute">{p.sku} · {t('products.stock')}: {formatNumber(p.stock)} {t('products.unit.' + p.unit)}</span>
            </span>
            <span className="tnum text-[14px] font-bold">{formatMoney(p.price)}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
