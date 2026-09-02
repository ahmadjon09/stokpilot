import { useEffect } from 'react';
import { Navigate, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import DashboardPage from './features/dashboard/DashboardPage';
import ProductsPage from './features/products/ProductsPage';
import ProductFormSheet from './features/products/ProductForm';
import StockPage from './features/stock/StockPage';
import MoveFormSheet from './features/stock/MoveForm';
import PosPage from './features/sales/PosPage';
import ReceiptSheet from './features/sales/ReceiptSheet';
import SalesHistorySheet from './features/sales/HistorySheet';
import CustomersPage from './features/customers/CustomersPage';
import CustomerFormSheet from './features/customers/CustomerForm';
import ReportsPage from './features/reports/ReportsPage';
import SettingsPage from './features/settings/SettingsPage';
import StorageSheet from './features/settings/StorageSheet';
import { applyAppearance, useSettings } from './store/settings';
import i18n from './i18n';

const SHEET_ROUTES = [
  '/products/new',
  '/products/:id/edit',
  '/stock/new',
  '/customers/new',
  '/customers/:id/edit',
  '/sales/receipt/:id',
  '/sales/history',
  '/settings/storage',
];

function baseFor(path: string): string {
  if (path.startsWith('/products')) return '/products';
  if (path.startsWith('/stock')) return '/stock';
  if (path.startsWith('/sales')) return '/sales';
  if (path.startsWith('/customers')) return '/customers';
  if (path.startsWith('/settings')) return '/settings';
  if (path.startsWith('/reports')) return '/reports';
  return '/';
}

interface SheetNavState {
  background?: { pathname: string; search: string };
}

export default function App() {
  const location = useLocation();
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const radius = useSettings((s) => s.radius);
  const density = useSettings((s) => s.density);
  const font = useSettings((s) => s.font);
  const lang = useSettings((s) => s.lang);

  useEffect(() => {
    applyAppearance({ theme, accent, radius, density, font });
  }, [theme, accent, radius, density, font]);

  useEffect(() => {
    document.documentElement.lang = lang;
    void i18n.changeLanguage(lang);
  }, [lang]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance({ theme, accent, radius, density, font });
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, accent, radius, density, font]);

  const state = location.state as SheetNavState | null;
  const bg = state?.background;
  const isSheetPath = SHEET_ROUTES.some((p) => matchPath({ path: p, end: true }, location.pathname));

  // Sheet route ochiq bo'lsa, orqadagi asosiy sahifa ko'rsatiladi
  const mainPathname = bg ? bg.pathname : isSheetPath ? baseFor(location.pathname) : location.pathname;
  const mainSearch = bg ? bg.search ?? '' : location.search;

  return (
    <>
      <Routes location={{ pathname: mainPathname, search: mainSearch, hash: '', state: null, key: 'main' }}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="sales" element={<PosPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      {isSheetPath && (
        <Routes location={{ pathname: location.pathname, search: location.search, hash: '', state: location.state, key: location.key }}>
          <Route path="products/new" element={<ProductFormSheet />} />
          <Route path="products/:id/edit" element={<ProductFormSheet />} />
          <Route path="stock/new" element={<MoveFormSheet />} />
          <Route path="customers/new" element={<CustomerFormSheet />} />
          <Route path="customers/:id/edit" element={<CustomerFormSheet />} />
          <Route path="sales/receipt/:id" element={<ReceiptSheet />} />
          <Route path="sales/history" element={<SalesHistorySheet />} />
          <Route path="settings/storage" element={<StorageSheet />} />
        </Routes>
      )}
    </>
  );
}
