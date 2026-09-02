import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Boxes, LayoutDashboard, Package, Plus, Settings,
  ShoppingCart, Users, WifiOff, Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings, type NavKey } from '../store/settings';
import { ToastHost } from '../shared/ui/bits';
import { useOpenSheet } from '../shared/lib/nav';
import { buzz } from '../shared/lib/misc';

export const NAV_META: Record<NavKey, { icon: LucideIcon; labelKey: string; path: string }> = {
  dashboard: { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/' },
  products: { icon: Package, labelKey: 'nav.products', path: '/products' },
  sales: { icon: ShoppingCart, labelKey: 'nav.sales', path: '/sales' },
  stock: { icon: Boxes, labelKey: 'nav.stock', path: '/stock' },
  customers: { icon: Users, labelKey: 'nav.customers', path: '/customers' },
  reports: { icon: BarChart3, labelKey: 'nav.reports', path: '/reports' },
  settings: { icon: Settings, labelKey: 'nav.settings', path: '/settings' },
};

const SIDEBAR_ORDER: NavKey[] = ['dashboard', 'products', 'sales', 'stock', 'customers', 'reports', 'settings'];

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
  const navKeys = useSettings((s) => s.nav);
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const titleKey: string =
    location.pathname === '/' ? 'nav.dashboard'
      : location.pathname.startsWith('/products') ? 'products.title'
        : location.pathname.startsWith('/stock') ? 'stock.title'
          : location.pathname.startsWith('/sales') ? 'sales.title'
            : location.pathname.startsWith('/customers') ? 'customers.title'
              : location.pathname.startsWith('/reports') ? 'reports.title'
                : 'settings.title';

  const inNav = (k: NavKey) => navKeys.includes(k);

  return (
    <div className="min-h-dvh md:pl-60">
      {!online && <div className="offline-banner"><WifiOff size={13} strokeWidth={2} className="mr-1 inline" />{t('common.offline')}</div>}

      {/* Planshet/desktop: sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-card md:flex" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
          <div>
            <p className="text-[0.9375rem] font-extrabold leading-tight">StokPilot</p>
            <p className="text-[0.6562rem] font-medium text-mute">v1.0 · offline</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {SIDEBAR_ORDER.map((k) => {
            const meta = NAV_META[k];
            const Icon = meta.icon;
            return (
              <NavLink
                key={k}
                to={meta.path}
                end={meta.path === '/'}
                className={({ isActive }) =>
                  'flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 text-[0.875rem] font-semibold transition ' +
                  (isActive ? 'text-accent' : 'text-mute hover:bg-card2 hover:text-ink')
                }
                style={({ isActive }) => (isActive ? { background: 'var(--accent-soft)' } : undefined)}
              >
                <Icon size={18} strokeWidth={1.5} />
                {t(meta.labelKey)}
              </NavLink>
            );
          })}
        </nav>
        <p className="px-5 pb-4 text-[0.6562rem] text-mute">{t('app.tagline')}</p>
      </aside>

      {/* Mobil: top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line px-4 md:hidden"
        style={{ minHeight: 56, background: 'color-mix(in srgb, var(--surface) 88%, transparent)', backdropFilter: 'blur(14px)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2">
          <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
          <h1 className="text-[1rem] font-extrabold">{t(titleKey)}</h1>
        </div>
        <div className="flex">
          {!inNav('customers') && (
            <button type="button" className="icon-btn" aria-label={t('nav.customers')} onClick={() => navigate('/customers')}>
              <Users size={20} strokeWidth={1.5} />
            </button>
          )}
          {!inNav('settings') && (
            <button type="button" className="icon-btn" aria-label={t('nav.settings')} onClick={() => navigate('/settings')}>
              <Settings size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      {/* Kontent */}
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-28 pt-4 md:pb-10 md:pt-6">
        <Outlet />
      </main>

      <Fab />

      {/* Mobil: bottom navigation */}
      <nav className="bnav md:hidden" aria-label="Main">
        {navKeys.slice(0, 5).map((k) => {
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
