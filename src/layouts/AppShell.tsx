import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Boxes, ChevronLeft, HandCoins, LayoutDashboard, LineChart, Package, Plus, Settings,
  ShoppingCart, Users, WifiOff, Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  resolveBottomNav, resolveSidebarNav, useSettings, type NavKey,
} from '../store/settings';
import { ToastHost } from '../shared/ui/bits';
import { useOpenSheet } from '../shared/lib/nav';
import { buzz } from '../shared/lib/misc';

export const NAV_META: Record<NavKey, { icon: LucideIcon; labelKey: string; path: string }> = {
  dashboard: { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/' },
  products: { icon: Package, labelKey: 'nav.products', path: '/products' },
  sales: { icon: ShoppingCart, labelKey: 'nav.sales', path: '/sales' },
  stock: { icon: Boxes, labelKey: 'nav.stock', path: '/stock' },
  customers: { icon: Users, labelKey: 'nav.customers', path: '/customers' },
  debts: { icon: HandCoins, labelKey: 'nav.debts', path: '/debts' },
  reports: { icon: BarChart3, labelKey: 'nav.reports', path: '/reports' },
  stats: { icon: LineChart, labelKey: 'nav.stats', path: '/stats' },
  settings: { icon: Settings, labelKey: 'nav.settings', path: '/settings' },
};

const SIDEBAR_KEY = 'sp-sidebar-collapsed';

function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

/** Sidebar yig'ilgan holati — localStorage'da saqlanadi (mobil emas, planshet) */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };
  return [collapsed, toggle];
}

function Fab() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const openSheet = useOpenSheet();
  const [menu, setMenu] = useState(false);
  const p = location.pathname;

  useEffect(() => setMenu(false), [p]);

  let content: React.ReactNode = null;
  if (p.startsWith('/products')) {
    content = (
      <button type="button" className="fab" aria-label={t('products.new')} onClick={() => { buzz(10); openSheet('/products/new'); }}>
        <Plus size={24} strokeWidth={1.5} />
      </button>
    );
  } else if (p.startsWith('/stock')) {
    content = (
      <button type="button" className="fab" aria-label={t('stock.newMove')} onClick={() => { buzz(10); openSheet('/stock/new'); }}>
        <Plus size={24} strokeWidth={1.5} />
      </button>
    );
  } else if (p.startsWith('/customers')) {
    content = (
      <button type="button" className="fab" aria-label={t('customers.new')} onClick={() => { buzz(10); openSheet('/customers/new'); }}>
        <Plus size={24} strokeWidth={1.5} />
      </button>
    );
  } else if (p === '/') {
    content = (
      <>
        {menu && (
          <div className="fab-menu">
            <button type="button" className="fab-item" onClick={() => { buzz(8); setMenu(false); openSheet('/products/new'); }}>
              <Package size={17} strokeWidth={1.5} /> {t('products.new')}
            </button>
            <button type="button" className="fab-item" onClick={() => { buzz(8); setMenu(false); openSheet('/stock/new'); }}>
              <Boxes size={17} strokeWidth={1.5} /> {t('stock.newMove')}
            </button>
            <button type="button" className="fab-item" onClick={() => { buzz(8); setMenu(false); navigate('/sales'); }}>
              <Zap size={17} strokeWidth={1.5} /> {t('nav.sales')}
            </button>
          </div>
        )}
        <button type="button" className="fab" aria-label={t('dash.quick')} aria-expanded={menu} onClick={() => { buzz(10); setMenu((m) => !m); }}>
          <Plus size={24} strokeWidth={1.5} style={{ transform: menu ? 'rotate(45deg)' : 'none', transition: 'transform 200ms ease' }} />
        </button>
      </>
    );
  }
  return <>{content}</>;
}

export default function AppShell() {
  const { t } = useTranslation();
  const navSetting = useSettings((s) => s.nav);
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  /*
   * IKKI PANEL, BIR MANBA.
   *
   * `resolveBottomNav` — foydalanuvchi tanlovi + zaxira bilan to'ldirish
   * (hech qachon bo'sh/qisman panel bo'lmaydi).
   * `resolveSidebarNav` — tanlanganlar yuqorida, qolgan barcha bo'limlar
   * pastda. Shu tufayli sozlamalarda "yashirilgan" bo'lim ham sidebar orqali
   * ochiladi — hech narsa yo'qolmaydi.
   */
  const bottomNav = useMemo(() => resolveBottomNav(navSetting), [navSetting]);
  const sidebarNav = useMemo(() => resolveSidebarNav(navSetting), [navSetting]);
  const primary = useMemo(() => new Set(bottomNav), [bottomNav]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const titleKey: string =
    location.pathname === '/' ? 'nav.dashboard'
      : location.pathname.startsWith('/products') ? 'products.title'
        : location.pathname.startsWith('/stock') ? 'stock.title'
          : location.pathname.startsWith('/sales') ? 'sales.title'
            : location.pathname.startsWith('/customers') ? 'customers.title'
              : location.pathname.startsWith('/debts') ? 'debt.title'
                : location.pathname.startsWith('/reports') ? 'reports.title'
                  : location.pathname.startsWith('/stats') ? 'stats.title'
                    : 'settings.title';

  return (
    <div className={collapsed ? 'min-h-dvh md:pl-[76px]' : 'min-h-dvh md:pl-60'}>
      {!online && <div className="offline-banner"><WifiOff size={13} strokeWidth={2} className="mr-1 inline" />{t('common.offline')}</div>}

      {/* ── Planshet/desktop: sidebar ─────────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-card transition-[width] duration-200 md:flex"
        style={{ paddingTop: 'env(safe-area-inset-top)', width: collapsed ? 76 : 240 }}
      >
        <div className={'flex items-center gap-2.5 py-5 ' + (collapsed ? 'justify-center px-2' : 'px-5')}>
          <img src="/icon-192.png" alt="" className="h-9 w-9 flex-none rounded-xl" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-extrabold leading-tight">StokPilot</p>
              <p className="truncate text-[0.6562rem] font-medium text-mute">v1.0 · offline</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {sidebarNav.map((k) => {
            const meta = NAV_META[k];
            const Icon = meta.icon;
            const isPrimary = primary.has(k);
            return (
              <NavLink
                key={k}
                to={meta.path}
                end={meta.path === '/'}
                title={collapsed ? t(meta.labelKey) : undefined}
                aria-label={t(meta.labelKey)}
                className={({ isActive }) =>
                  'group flex min-h-[44px] items-center gap-3 rounded-xl text-[0.875rem] font-semibold transition ' +
                  (collapsed ? 'justify-center px-0 ' : 'px-3.5 ') +
                  (isActive ? 'text-accent' : 'text-mute hover:bg-card2 hover:text-ink')
                }
                style={({ isActive }) => (isActive ? { background: 'var(--accent-soft)' } : undefined)}
              >
                <Icon size={18} strokeWidth={1.5} className="flex-none" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{t(meta.labelKey)}</span>
                    {/* Pastki panelda ham bo'lgan element — kichik belgi */}
                    {isPrimary && (
                      <span
                        className="h-1.5 w-1.5 flex-none rounded-full"
                        style={{ background: 'var(--accent)', opacity: 0.7 }}
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className={'border-t border-line py-2 ' + (collapsed ? 'px-2' : 'px-3')}>
          <button
            type="button"
            className={
              'flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-[0.75rem] font-semibold text-mute transition hover:bg-card2 hover:text-ink ' +
              (collapsed ? 'justify-center' : '')
            }
            onClick={() => { buzz(6); toggleCollapsed(); }}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <ChevronLeft
              size={16}
              strokeWidth={1.5}
              className="flex-none transition-transform"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}
            />
            {!collapsed && <span className="truncate">{t('nav.collapse')}</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobil: top bar ────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-line px-4 md:hidden"
        style={{
          minHeight: 56,
          background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
          backdropFilter: 'blur(14px)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <img src="/icon-192.png" alt="" className="h-7 w-7 flex-none rounded-lg" />
          <h1 className="truncate text-[1rem] font-extrabold">{t(titleKey)}</h1>
        </div>
        <div className="flex flex-none">
          {!primary.has('customers') && (
            <button type="button" className="icon-btn" aria-label={t('nav.customers')} onClick={() => { buzz(6); navigate('/customers'); }}>
              <Users size={20} strokeWidth={1.5} />
            </button>
          )}
          {!primary.has('settings') && (
            <button type="button" className="icon-btn" aria-label={t('nav.settings')} onClick={() => { buzz(6); navigate('/settings'); }}>
              <Settings size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      {/* Kontent — pastki panel + FAB uchun joy qoldiriladi */}
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-28 pt-4 md:pb-10 md:pt-6">
        <Outlet />
      </main>

      <Fab />

      {/* ── Mobil: pastki panel (sozlamalardan boshqariladi) ──────────── */}
      <nav className="bnav md:hidden" aria-label="Main">
        {bottomNav.map((k) => {
          const meta = NAV_META[k];
          const Icon = meta.icon;
          return (
            <NavLink
              key={k}
              to={meta.path}
              end={meta.path === '/'}
              className={({ isActive }) => 'bnav-item' + (isActive ? ' bnav-on' : '')}
              onClick={() => buzz(6)}
            >
              <Icon size={21} strokeWidth={1.5} />
              <span>{t(meta.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>

      <ToastHost />
    </div>
  );
}
