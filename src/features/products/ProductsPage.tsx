import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare, ImageOff, Package, PackagePlus, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Product } from '../../db/db';
import { deleteProduct } from '../../db/actions';
import { formatMoney, formatNumber } from '../../shared/lib/format';
import { ConfirmDialog, EmptyState } from '../../shared/ui/bits';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz } from '../../shared/lib/misc';

type SortKey = 'name' | 'price' | 'stock' | 'new';

function StockBadge({ p }: { p: Product }) {
  const { t } = useTranslation();
  if (p.stock <= 0) return <span className="badge badge-bad">{t('products.out')}</span>;
  if (p.stock <= p.minStock) return <span className="badge badge-warn">{t('products.low')}</span>;
  return <span className="badge badge-ok">{t('products.inStock')}</span>;
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const thumbs = useLiveQuery(async () => {
    const imgs = await db.images.toArray();
    const map = new Map<string, string>();
    for (const im of imgs) if (!map.has(im.productId)) map.set(im.productId, im.thumb);
    return map;
  }, []) ?? new Map<string, string>();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = products.filter((p) =>
      (cat === 'all' || p.categoryId === cat) &&
      (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s))
    );
    out = [...out].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price') return b.price - a.price;
      if (sort === 'stock') return a.stock - b.stock;
      return b.createdAt - a.createdAt;
    });
    return out;
  }, [products, q, cat, sort]);

  const toggleSelect = (id: string) => {
    buzz(6);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    for (const id of selected) await deleteProduct(id);
    setSelected(new Set());
    setSelectMode(false);
    setConfirmBulk(false);
  };

  return (
    <div className="space-y-3">
      <div className="hidden items-center justify-between md:flex">
        <h1 className="text-[22px] font-extrabold tracking-tight">{t('products.title')}</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => openSheet('/products/new')}>
          <PackagePlus size={16} strokeWidth={1.5} /> {t('products.new')}
        </button>
      </div>

      {/* Qidiruv + saralash */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={17} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input className="input pl-10" placeholder={t('products.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
        </div>
        <select className="input w-[130px] shrink-0" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="name">{t('products.sortName')}</option>
          <option value="price">{t('products.sortPrice')}</option>
          <option value="stock">{t('products.sortStock')}</option>
          <option value="new">{t('products.sortNew')}</option>
        </select>
        <button type="button" className="icon-btn shrink-0 border border-line bg-card" aria-label={t('products.selectMode')}
          aria-pressed={selectMode}
          onClick={() => { buzz(6); setSelectMode((m) => !m); setSelected(new Set()); }}>
          {selectMode ? <X size={19} strokeWidth={1.5} /> : <CheckSquare size={19} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Kategoriya chiplari */}
      <div className="scroll-x">
        <button type="button" className={'chip' + (cat === 'all' ? ' chip-on' : '')} onClick={() => setCat('all')}>{t('common.all')}</button>
        {categories.map((x) => (
          <button key={x.id} type="button" className={'chip' + (cat === x.id ? ' chip-on' : '')} onClick={() => setCat(x.id)}>{x.name}</button>
        ))}
      </div>

      {/* Bulk panel */}
      {selectMode && (
        <div className="card flex items-center justify-between px-4 py-2.5">
          <span className="text-[13.5px] font-semibold">{selected.size} / {list.length}</span>
          <button type="button" className="btn btn-danger btn-sm" disabled={selected.size === 0} onClick={() => setConfirmBulk(true)}>
            <Trash2 size={15} strokeWidth={1.5} /> {t('common.delete')}
          </button>
        </div>
      )}

      {/* Ro'yxat */}
      {products.length === 0 ? (
        <div className="card">
          <EmptyState icon={Package} title={t('products.empty')} hint={t('products.emptyHint')}
            action={<button type="button" className="btn btn-primary" onClick={() => openSheet('/products/new')}>{t('products.new')}</button>} />
        </div>
      ) : list.length === 0 ? (
        <div className="card"><EmptyState icon={Search} title={t('dash.noData')} /></div>
      ) : (
        <div className="card row-list overflow-hidden">
          {list.map((p) => {
            const thumb = thumbs.get(p.id);
            return (
              <div key={p.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-card2"
                style={{ minHeight: 64 }}
                onClick={() => {
                  if (selectMode) { toggleSelect(p.id); return; }
                  buzz(6);
                  openSheet(`/products/${p.id}/edit`);
                }}
              >
                {selectMode && (
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} onClick={(e) => e.stopPropagation()} aria-label={p.name} />
                )}
                {thumb ? (
                  <img src={thumb} alt="" className="h-11 w-11 flex-none rounded-lg object-cover" />
                ) : (
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                    <ImageOff size={18} strokeWidth={1.5} className="text-accent" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{p.name}</p>
                  <p className="tnum truncate text-[12px] text-mute">
                    {p.sku} · {t('products.stock')}: {formatNumber(p.stock)} {t('products.unit.' + p.unit)}
                  </p>
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  <span className="tnum text-[14.5px] font-bold">{formatMoney(p.price)}</span>
                  <StockBadge p={p} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {list.length > 0 && (
        <p className="text-center text-[12px] text-mute">{list.length} {t('products.count')}</p>
      )}

      {confirmBulk && (
        <ConfirmDialog title={t('common.delete')} text={t('products.deleteConfirm')} danger
          onConfirm={() => void bulkDelete()} onCancel={() => setConfirmBulk(false)} />
      )}
    </div>
  );
}
