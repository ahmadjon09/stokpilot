import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Receipt, RotateCcw, Search, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type MoveType } from '../../db/db';
import { formatDateTime, formatMoney, formatNumber } from '../../shared/lib/format';
import { EmptyState, Segmented } from '../../shared/ui/bits';
import { useOpenSheet } from '../../shared/lib/nav';

const MOVE_ICON: Record<MoveType, typeof ArrowDownToLine> = {
  in: ArrowDownToLine,
  out: ArrowUpFromLine,
  recount: ClipboardCheck,
  sale: Receipt,
  return: RotateCcw,
};

const MOVE_COLOR: Record<MoveType, string> = {
  in: 'var(--ok)',
  out: 'var(--bad)',
  recount: 'var(--warn)',
  sale: 'var(--accent)',
  return: 'var(--warn)',
};

export default function StockPage() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const [tab, setTab] = useState<'balance' | 'moves'>('balance');
  const [q, setQ] = useState('');

  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const moves = useLiveQuery(() => db.moves.orderBy('createdAt').reverse().limit(300).toArray(), []) ?? [];

  const stats = useMemo(() => {
    const value = products.reduce((s, p) => s + p.stock * p.cost, 0);
    const low = products.filter((p) => p.stock <= p.minStock).length;
    return { value, low };
  }, [products]);

  const balances = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))
      .sort((a, b) => a.stock / Math.max(a.minStock, 1) - b.stock / Math.max(b.minStock, 1));
  }, [products, q]);

  const filteredMoves = useMemo(() => {
    const s = q.trim().toLowerCase();
    return moves.filter((m) => !s || m.productName.toLowerCase().includes(s));
  }, [moves, q]);

  return (
    <div className="space-y-3">
      <div className="hidden md:block">
        <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('stock.title')}</h1>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div className="card p-3">
          <p className="flex items-center gap-1.5 text-[0.7188rem] font-semibold text-mute"><Wallet size={13} strokeWidth={1.5} /> {t('stock.totalValue')}</p>
          <p className="tnum mt-1 text-[0.9375rem] font-extrabold">{formatMoney(stats.value)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[0.7188rem] font-semibold text-mute">{t('stock.itemsCount')}</p>
          <p className="tnum mt-1 text-[0.9375rem] font-extrabold">{products.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-[0.7188rem] font-semibold text-mute" style={{ color: stats.low > 0 ? 'var(--warn)' : undefined }}>{t('stock.lowCount')}</p>
          <p className="tnum mt-1 text-[0.9375rem] font-extrabold" style={{ color: stats.low > 0 ? 'var(--warn)' : undefined }}>{stats.low}</p>
        </div>
      </div>

      <Segmented value={tab} onChange={setTab} options={[
        { value: 'balance', label: t('stock.balance') },
        { value: 'moves', label: t('stock.moves') },
      ]} />

      <div className="relative">
        <Search size={17} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input className="input pl-10" placeholder={tab === 'balance' ? t('products.searchPh') : t('stock.searchMoves')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
      </div>

      {tab === 'balance' ? (
        balances.length === 0 ? (
          <div className="card"><EmptyState icon={Wallet} title={t('dash.noData')} /></div>
        ) : (
          <div className="card row-list overflow-hidden">
            {balances.map((p) => {
              const ratio = p.minStock > 0 ? p.stock / p.minStock : p.stock > 0 ? 2 : 0;
              const color = p.stock <= 0 ? 'var(--bad)' : ratio <= 1 ? 'var(--warn)' : 'var(--ok)';
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 56 }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9062rem] font-semibold">{p.name}</p>
                    <p className="text-[0.75rem] text-mute">{t('products.minStock')}: {formatNumber(p.minStock)}</p>
                  </div>
                  <div className="hidden w-24 flex-none sm:block">
                    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 50)}%`, background: color }} />
                    </div>
                  </div>
                  <div className="flex-none text-right">
                    <p className="tnum text-[0.9375rem] font-bold" style={{ color }}>
                      {formatNumber(p.stock)} <span className="text-[0.75rem] font-medium text-mute">{t('products.unit.' + p.unit)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredMoves.length === 0 ? (
        <div className="card"><EmptyState icon={ClipboardCheck} title={t('stock.emptyMoves')} hint={t('stock.emptyMovesHint')}
          action={<button type="button" className="btn btn-primary" onClick={() => openSheet('/stock/new')}>{t('stock.newMove')}</button>} /></div>
      ) : (
        <div className="card row-list overflow-hidden">
          {filteredMoves.map((m) => {
            const Icon = MOVE_ICON[m.type];
            return (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 54 }}>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 13%, transparent)` }}>
                  <Icon size={16} strokeWidth={1.5} style={{ color: MOVE_COLOR[m.type] }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-semibold">{m.productName}</p>
                  <p className="truncate text-[0.75rem] text-mute">
                    {t('stock.type.' + m.type)}{m.note ? ` · ${m.note}` : ''} · {formatDateTime(m.createdAt)}
                  </p>
                </div>
                <span className="tnum flex-none text-[0.9062rem] font-bold" style={{ color: m.qty >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                  {m.qty > 0 ? '+' : ''}{formatNumber(m.qty)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
