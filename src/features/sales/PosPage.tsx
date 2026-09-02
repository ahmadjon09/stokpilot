import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { History, ImageOff, Minus, Package, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type PayType, type Product } from '../../db/db';
import { completeSale } from '../../db/actions';
import { formatMoney, formatNumber, round2 } from '../../shared/lib/format';
import { useSettings } from '../../store/settings';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import NumberInput from '../../shared/ui/NumberInput';
import { EmptyState, Segmented } from '../../shared/ui/bits';

const CART_KEY = 'sp-cart';

interface CartLine { productId: string; qty: number }

function loadCart(): CartLine[] {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '[]') as CartLine[]; } catch { return []; }
}

export default function PosPage() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const navigate = useNavigate();
  const vat = useSettings((s) => s.biz.vat);

  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.where('kind').equals('customer').toArray(), []) ?? [];

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [cartOpen, setCartOpen] = useState(true);
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState<number | null>(null);
  const [payType, setPayType] = useState<PayType>('cash');
  const [customerId, setCustomerId] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const grid = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) =>
      (cat === 'all' || p.categoryId === cat) &&
      (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, q, cat]);

  const lines = cart
    .map((l) => ({ ...l, product: byId.get(l.productId) }))
    .filter((l): l is CartLine & { product: Product } => Boolean(l.product));

  const subtotal = round2(lines.reduce((s, l) => s + l.product.price * l.qty, 0));
  const discount = discountType === 'percent'
    ? round2((subtotal * Math.min(Math.max(discountValue ?? 0, 0), 100)) / 100)
    : discountType === 'amount'
      ? round2(Math.min(Math.max(discountValue ?? 0, 0), subtotal))
      : 0;
  const total = round2(subtotal - discount);
  const vatPart = vat > 0 ? round2((total * vat) / (100 + vat)) : 0;

  const addToCart = (p: Product) => {
    buzz(8);
    setCart((c) => {
      const ex = c.find((l) => l.productId === p.id);
      if (ex) return c.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { productId: p.id, qty: 1 }];
    });
    setCartOpen(true);
  };

  const changeQty = (productId: string, delta: number) => {
    buzz(6);
    setCart((c) => c
      .map((l) => (l.productId === productId ? { ...l, qty: l.qty + delta } : l))
      .filter((l) => l.qty > 0));
  };

  const checkout = async () => {
    if (lines.length === 0 || checkoutBusy) return;
    if (payType === 'debt' && !customerId) { toast(t('sales.debtNeedsCustomer')); buzz(30); return; }
    setCheckoutBusy(true);
    try {
      const sale = await completeSale({
        items: lines.map((l) => ({ product: l.product, qty: l.qty })),
        discountType, discountValue: discountValue ?? 0,
        payType, customerId, note: '',
      });
      setCart([]);
      setDiscountType('none');
      setDiscountValue(null);
      setCustomerId('');
      setPayType('cash');
      buzz(20);
      navigate(`/sales/receipt/${sale.id}`, { state: { background: { pathname: '/sales', search: '' } } });
    } catch {
      toast(t('common.error'));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const cartPanel = (
    <div className="card flex flex-col overflow-hidden">
      <button type="button" className="flex items-center justify-between px-4 py-3" onClick={() => setCartOpen((o) => !o)} aria-expanded={cartOpen}>
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <ShoppingCart size={18} strokeWidth={1.5} className="text-accent" />
          {t('sales.cart')} · {lines.length}
        </span>
        <span className="flex items-center gap-2">
          <span className="tnum text-[16px] font-extrabold">{formatMoney(total)}</span>
          <span className="text-mute">{cartOpen ? <Minus size={16} strokeWidth={1.5} /> : <Plus size={16} strokeWidth={1.5} />}</span>
        </span>
      </button>

      {cartOpen && (
        <>
          <div className="row-list max-h-[220px] overflow-y-auto border-t border-line">
            {lines.length === 0 && <p className="px-4 py-5 text-center text-[13px] text-mute">{t('sales.emptyCart')}</p>}
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{l.product.name}</p>
                  <p className="tnum text-[12px] text-mute">{formatMoney(l.product.price)} × {l.qty}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button type="button" className="icon-btn" style={{ width: 36, height: 36, background: 'var(--surface2)' }} aria-label="−1" onClick={() => changeQty(l.productId, -1)}>
                    <Minus size={15} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn" style={{ width: 36, height: 36, background: 'var(--surface2)' }} aria-label="+1" onClick={() => changeQty(l.productId, 1)}>
                    <Plus size={15} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn" style={{ width: 36, height: 36, color: 'var(--bad)' }} aria-label={t('common.delete')}
                    onClick={() => { buzz(8); setCart((c) => c.filter((x) => x.productId !== l.productId)); }}>
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {lines.length > 0 && (
            <div className="space-y-3 border-t border-line p-3.5">
              <div className="grid grid-cols-2 gap-2">
                <Segmented value={discountType} onChange={(v) => { setDiscountType(v); if (v === 'none') setDiscountValue(null); }} options={[
                  { value: 'none', label: t('sales.discount.none') },
                  { value: 'percent', label: t('sales.discount.percent') },
                  { value: 'amount', label: t('sales.discount.amount') },
                ]} />
                {discountType !== 'none' ? (
                  <NumberInput value={discountValue} onChange={setDiscountValue} placeholder={discountType === 'percent' ? '0 %' : '0'} ariaLabel={t('sales.discount')} />
                ) : (
                  <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={t('sales.customer')}>
                    <option value="">{t('sales.noCustomer')}</option>
                    {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
              </div>
              {discountType !== 'none' && (
                <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={t('sales.customer')}>
                  <option value="">{t('sales.noCustomer')}</option>
                  {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
              <Segmented value={payType} onChange={setPayType} options={[
                { value: 'cash', label: t('sales.pay.cash') },
                { value: 'card', label: t('sales.pay.card') },
                { value: 'transfer', label: t('sales.pay.transfer') },
                { value: 'debt', label: t('sales.pay.debt') },
              ]} />
              <div className="space-y-1 text-[13.5px]">
                <div className="flex justify-between text-mute"><span>{t('sales.subtotal')}</span><span className="tnum">{formatMoney(subtotal)}</span></div>
                {discount > 0 && <div className="flex justify-between" style={{ color: 'var(--bad)' }}><span>{t('sales.discount')}</span><span className="tnum">−{formatMoney(discount)}</span></div>}
                {vatPart > 0 && <div className="flex justify-between text-mute"><span>{t('sales.vatIncluded')} ({formatNumber(vat)}%)</span><span className="tnum">{formatMoney(vatPart)}</span></div>}
                <div className="flex justify-between pt-1 text-[16px] font-extrabold"><span>{t('common.total')}</span><span className="tnum">{formatMoney(total)}</span></div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="icon-btn border border-line" aria-label={t('sales.clearCart')}
                  onClick={() => { buzz(10); setCart([]); }}>
                  <Trash2 size={18} strokeWidth={1.5} />
                </button>
                <button type="button" className="btn btn-primary flex-1" disabled={checkoutBusy || lines.length === 0} onClick={() => void checkout()}>
                  {t('sales.checkout')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="md:grid md:grid-cols-[1fr_360px] md:gap-5">
      <div className="space-y-3">
        <div className="hidden items-center justify-between md:flex">
          <h1 className="text-[22px] font-extrabold tracking-tight">{t('sales.title')}</h1>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSheet('/sales/history')}>
            <History size={16} strokeWidth={1.5} /> {t('sales.history')}
          </button>
        </div>

        <div className="flex gap-2 md:hidden">
          <div className="relative flex-1">
            <Search size={17} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input className="input pl-10" placeholder={t('sales.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
          </div>
          <button type="button" className="icon-btn border border-line bg-card" aria-label={t('sales.history')} onClick={() => openSheet('/sales/history')}>
            <History size={19} strokeWidth={1.5} />
          </button>
        </div>

        <div className="scroll-x">
          <button type="button" className={'chip' + (cat === 'all' ? ' chip-on' : '')} onClick={() => setCat('all')}>{t('common.all')}</button>
          {categories.map((x) => (
            <button key={x.id} type="button" className={'chip' + (cat === x.id ? ' chip-on' : '')} onClick={() => setCat(x.id)}>{x.name}</button>
          ))}
        </div>

        {grid.length === 0 ? (
          <div className="card"><EmptyState icon={Package} title={t('dash.noData')} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {grid.map((p) => {
              const out = p.stock <= 0;
              return (
                <button key={p.id} type="button" disabled={out}
                  className="card flex flex-col items-start gap-1.5 p-3 text-left transition active:scale-[0.98] disabled:opacity-45"
                  onClick={() => addToCart(p)}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                    <ImageOff size={17} strokeWidth={1.5} className="text-accent" />
                  </span>
                  <span className="line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-snug">{p.name}</span>
                  <span className="tnum text-[14px] font-extrabold">{formatMoney(p.price)}</span>
                  <span className="tnum text-[11px] text-mute">{t('products.stock')}: {formatNumber(p.stock)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Planshet: o'ng ustun; mobil: pastda panel */}
      <div className="hidden md:block">
        <div className="sticky top-6">{cartPanel}</div>
      </div>
      {lines.length > 0 && (
        <div className="fixed inset-x-0 z-40 px-3 md:hidden" style={{ bottom: 'calc(62px + env(safe-area-inset-bottom))' }}>
          {cartPanel}
        </div>
      )}
    </div>
  );
}
