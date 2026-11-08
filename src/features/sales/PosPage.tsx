import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, History, ImageOff, Minus, Package, Plus, Search, ShoppingCart, Trash2, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type PayType, type Product } from '../../db/db';
import { completeSale } from '../../db/actions';
import { formatMoney, formatNumber, round2 } from '../../shared/lib/format';
import { useSettings } from '../../store/settings';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import NumberInput from '../../shared/ui/NumberInput';
import { EmptyState, Segmented } from '../../shared/ui/bits';
import QuickCustomer, { EMPTY_QUICK_CUSTOMER, type QuickCustomerValue } from './QuickCustomer';

const CART_KEY = 'sp-cart';

interface CartLine { productId: string; qty: number }

function loadCart(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validatsiya: buzilgan/yangi formatdagi qatorlar savatni yiqitmasligi kerak
    return parsed
      .filter((l): l is CartLine =>
        Boolean(l) && typeof (l as CartLine).productId === 'string' &&
        typeof (l as CartLine).qty === 'number' && (l as CartLine).qty > 0)
      .map((l) => ({ productId: l.productId, qty: Math.max(1, l.qty) }));
  } catch { return []; }
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
  /*
   * Nasiya uchun mijoz ma'lumoti. `quick` — savat ichida yangi mijoz yaratish
   * (Task 3): mijoz faqat checkout paytida bazaga yoziladi, shuning uchun
   * bekor qilinsa hech qanday "bo'sh" yozuv qolmaydi.
   */
  const [quick, setQuick] = useState<QuickCustomerValue>(EMPTY_QUICK_CUSTOMER);

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

  /** Nasiya uchun mijoz tayyormi? (mavjud tanlangan yoki yangi ism kiritilgan) */
  const debtCustomerReady = payType !== 'debt' || (
    quick.mode === 'new'
      ? quick.name.trim().length >= 2 && (!quick.phone.trim() || quick.valid)
      : Boolean(customerId)
  );

  /** Nasiyada qarzga yoziladigan qism (avans hisobga olingan holda) */
  const debtPart = payType === 'debt'
    ? round2(total - Math.min(Math.max(quick.advance ?? 0, 0), total))
    : 0;

  const checkout = async () => {
    if (lines.length === 0 || checkoutBusy) return;
    if (payType === 'debt' && !debtCustomerReady) {
      toast(t('quickCust.selectNeeded'));
      buzz(30);
      return;
    }
    setCheckoutBusy(true);
    try {
      const sale = await completeSale({
        items: lines.map((l) => ({ product: l.product, qty: l.qty })),
        discountType, discountValue: discountValue ?? 0,
        payType,
        // Yangi mijoz bo'lsa ID bo'sh qoladi — uni tranzaksiya ichida yaratamiz
        customerId: payType === 'debt' && quick.mode === 'new' ? '' : customerId,
        note: '',
        newCustomer: payType === 'debt' && quick.mode === 'new'
          ? { name: quick.name.trim(), phone: quick.phone.trim() }
          : undefined,
        paidNow: payType === 'debt' ? (quick.advance ?? 0) : undefined,
      });
      setCart([]);
      setDiscountType('none');
      setDiscountValue(null);
      setCustomerId('');
      setQuick(EMPTY_QUICK_CUSTOMER);
      setPayType('cash');
      if (payType === 'debt' && quick.mode === 'new') toast(t('quickCust.created'));
      buzz(20);
      // Chekni ochishda orqa fon sifatida JORIY (menyu bilan bir xil) holat beriladi.
      // `resolveBackground` orqali — sheet ustida yangi sheet ochilsa ham POS
      // sahifasi orqada saqlanib qoladi va "orqaga" to'g'ri ishlaydi.
      navigate(`/sales/receipt/${sale.id}`, { state: { background: { pathname: '/sales', search: '' } } });
    } catch {
      toast(t('common.error'));
    } finally {
      setCheckoutBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  SAVAT PANELI                                                       */
  /* ------------------------------------------------------------------ */
  /*
   * Layout ierarxiyasi (mobil muammoning yechimi):
   *
   *   .cart-panel (flex column, overflow hidden, max-height cheklangan)
   *     ├─ .cart-panel-head   → flex-none        (yig'ish/ochish sarlavhasi)
   *     ├─ .cart-body         → flex-1, min-h-0, overflow-y: auto
   *     │    ├─ .cart-lines   → mahsulot qatorlari (scroll)
   *     │    └─ .cart-options → chegirma / to'lov / jami (scroll)
   *     └─ .cart-foot         → flex-none, scroll'dan tashqarida (har doim ko'rinadi)
   *
   * Kalit nuqtalar:
   *  1. `min-height: 0` — flex bolasi o'z ichida scroll bo'lishi uchun SHART,
   *     aks holda kontent panelni cho'zib, tugmalarni ekrandan chiqarib yuboradi.
   *  2. `overscroll-behavior: contain` — ro'yxat tugaganda orqadagi mahsulot
   *     gridi "sakrab" ketmaydi (mobil WebView'da asosiy shikoyat shu edi).
   *  3. Amallar paneli (`cart-foot`) scroll konteyneridan TASHQARIDA — shuning
   *     uchun u hech qachon ro'yxat ostida "yo'qolib" qolmaydi va ustiga
   *     tushmaydi. Bu sticky/fixed hack'lardan ishonchliroq.
   *  4. Balandlik `dvh` bilan cheklanadi — mobil brauzer manzil satri
   *     yopilib-ochilganda panel ekrandan chiqib ketmaydi.
   */
  const cartPanel = (
    <div className="cart-panel card">
      <button
        type="button"
        className="cart-panel-head flex items-center justify-between px-4 py-3"
        onClick={() => setCartOpen((o) => !o)}
        aria-expanded={cartOpen}
        aria-controls="sp-cart-body"
      >
        <span className="flex min-w-0 items-center gap-2 text-[0.9375rem] font-bold">
          <ShoppingCart size={18} strokeWidth={1.5} className="flex-none text-accent" />
          <span className="truncate">{t('sales.cart')} · {lines.length}</span>
        </span>
        <span className="flex flex-none items-center gap-2">
          <span className="tnum text-[1rem] font-extrabold">{formatMoney(total)}</span>
          <span className="text-mute">{cartOpen ? <Minus size={16} strokeWidth={1.5} /> : <Plus size={16} strokeWidth={1.5} />}</span>
        </span>
      </button>

      {cartOpen && (
        <div id="sp-cart-body" className="cart-body">
          {lines.length === 0 ? (
            <p className="px-4 py-5 text-center text-[0.8125rem] text-mute">{t('sales.emptyCart')}</p>
          ) : (
            <>
              <div className="row-list cart-lines border-t border-line">
                {lines.map((l) => (
                  <div key={l.productId} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8438rem] font-semibold">{l.product.name}</p>
                      <p className="tnum text-[0.75rem] text-mute">{formatMoney(l.product.price)} × {l.qty}</p>
                    </div>
                    <div className="flex flex-none items-center gap-0.5">
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

              {/* Chegirma / to'lov / jami — scroll zonasida (ro'yxat bilan birga) */}
              <div className="cart-options space-y-3 border-t border-line p-3.5">
                {/* Chegirma: turi + qiymati (bir qatorda, mobil uchun ixcham) */}
                <div className="grid grid-cols-2 gap-2">
                  <Segmented value={discountType} onChange={(v) => { setDiscountType(v); if (v === 'none') setDiscountValue(null); }} options={[
                    { value: 'none', label: t('sales.discount.none') },
                    { value: 'percent', label: t('sales.discount.percent') },
                    { value: 'amount', label: t('sales.discount.amount') },
                  ]} />
                  {discountType !== 'none' ? (
                    <NumberInput value={discountValue} onChange={setDiscountValue} placeholder={discountType === 'percent' ? '0 %' : '0'} ariaLabel={t('sales.discount')} />
                  ) : (
                    /* Chegirma yo'q bo'lsa — joy bo'sh qolmasin: naqd sotuvda
                       mijozni tanlash (nasiyada bu blok pastda, QuickCustomer) */
                    payType !== 'debt' ? (
                      <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={t('sales.customer')}>
                        <option value="">{t('sales.noCustomer')}</option>
                        {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    ) : <div />
                  )}
                </div>
                <Segmented value={payType} onChange={(v) => {
                  setPayType(v);
                  // Nasiyadan chiqilsa avans holati tozalanadi
                  if (v !== 'debt') setQuick((q) => ({ ...q, advance: null }));
                }} options={[
                  { value: 'cash', label: t('sales.pay.cash') },
                  { value: 'card', label: t('sales.pay.card') },
                  { value: 'transfer', label: t('sales.pay.transfer') },
                  { value: 'debt', label: t('sales.pay.debt') },
                ]} />

                {/* ── NASIYA: savat ichida mijoz tanlash / yangi mijoz ────────
                    Nasiya tanlanganda bu blok ochiladi. Yangi mijoz faqat
                    checkout paytida bazaga yoziladi (atomar tranzaksiya). */}
                {payType === 'debt' && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[0.75rem] font-bold text-mute">
                      <UserPlus size={13} strokeWidth={1.5} /> {t('sales.customer')}
                    </p>
                    <QuickCustomer value={quick} onChange={setQuick} total={total} />
                    {!debtCustomerReady && (
                      <p className="flex items-start gap-1.5 text-[0.6875rem]" style={{ color: 'var(--warn)' }}>
                        <AlertTriangle size={12} strokeWidth={2} className="mt-0.5 flex-none" />
                        {t('quickCust.selectNeeded')}
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1 text-[0.8438rem]">
                  <div className="flex justify-between text-mute"><span>{t('sales.subtotal')}</span><span className="tnum">{formatMoney(subtotal)}</span></div>
                  {discount > 0 && <div className="flex justify-between" style={{ color: 'var(--bad)' }}><span>{t('sales.discount')}</span><span className="tnum">−{formatMoney(discount)}</span></div>}
                  {vatPart > 0 && <div className="flex justify-between text-mute"><span>{t('sales.vatIncluded')} ({formatNumber(vat)}%)</span><span className="tnum">{formatMoney(vatPart)}</span></div>}
                  {payType === 'debt' && debtPart > 0 && (
                    <div className="flex justify-between font-semibold" style={{ color: 'var(--bad)' }}>
                      <span>{t('quickCust.debtWillBe')}</span>
                      <span className="tnum">{formatMoney(debtPart)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-[1rem] font-extrabold"><span>{t('common.total')}</span><span className="tnum">{formatMoney(total)}</span></div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Amallar paneli — scroll zonasidan tashqarida: mobil'da hech qachon
          kontent ostida qolib ketmaydi. `lines.length === 0` bo'lsa ko'rsatilmaydi. */}
      {cartOpen && lines.length > 0 && (
        <div className="cart-foot">
          <button type="button" className="icon-btn border border-line" aria-label={t('sales.clearCart')}
            onClick={() => { buzz(10); setCart([]); }}>
            <Trash2 size={18} strokeWidth={1.5} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mute">{t('common.total')}</p>
            <p className="tnum truncate text-[1.0625rem] font-extrabold leading-tight">{formatMoney(total)}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={checkoutBusy || lines.length === 0 || !debtCustomerReady}
            onClick={() => void checkout()}
          >
            {t('sales.checkout')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="md:grid md:grid-cols-[1fr_360px] md:gap-5">
      <div className="space-y-3">
        <div className="hidden items-center justify-between md:flex">
          <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('sales.title')}</h1>
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
          // Savat ochiq bo'lsa — mobil'da grid pastida qo'shimcha joy, aks holda
          // dock oxirgi qator mahsulotlarini to'sib qo'yadi.
          <div className={'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4' + (lines.length > 0 ? ' pb-44 md:pb-0' : '')}>
            {grid.map((p) => {
              const out = p.stock <= 0;
              return (
                <button key={p.id} type="button" disabled={out}
                  className="card flex flex-col items-start gap-1.5 p-3 text-left transition active:scale-[0.98] disabled:opacity-45"
                  onClick={() => addToCart(p)}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                    <ImageOff size={17} strokeWidth={1.5} className="text-accent" />
                  </span>
                  <span className="line-clamp-2 w-full text-[0.8125rem] font-semibold leading-snug" style={{ minHeight: '2.4em' }}>{p.name}</span>
                  <span className="tnum w-full truncate text-[0.875rem] font-extrabold">{formatMoney(p.price)}</span>
                  <span className="tnum w-full truncate text-[0.6875rem] text-mute">
                    {t('products.stock')}: {formatNumber(p.stock)} {t('products.unit.' + p.unit)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Planshet/desktop: o'ng ustun. `max-height` = viewport - (header + padding),
          shunda savat ro'yxati o'z ichida scroll bo'ladi, sahifa emas. */}
      <div className="hidden md:block">
        <div className="sticky top-6">
          <div className="cart-desktop-wrap">{cartPanel}</div>
        </div>
      </div>

      {/* Mobil: pastda suzuvchi panel — bottom nav ustida, viewport balandligidan oshmaydi */}
      {lines.length > 0 && (
        <div className="cart-mobile-dock fixed inset-x-0 z-40 px-3 md:hidden">
          {cartPanel}
        </div>
      )}
    </div>
  );
}
