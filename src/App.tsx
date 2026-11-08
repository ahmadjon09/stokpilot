import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import { baseRouteFor, isSheetRoute, type SheetBackground } from './shared/lib/nav';
import i18n from './i18n';

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

  const state = location.state as { background?: SheetBackground } | null;
  const bg = state?.background;
  const sheetOpen = isSheetRoute(location.pathname);

  /**
   * Orqadagi asosiy sahifa manzili.
   *
   * Regressiya (tuzatildi): ilgari `bg` bo'lmaganda faqat `location.search`
   * olinardi, `bg` bo'lsa esa uning search'i olinardi — bu mantiq sheet
   * ustiga sheet ochilganda (masalan Savat → Sotuvlar tarixi → Chek) buzilib,
   * orqa fon `/` ga sakrab ketardi.
   *
   * Endi: `bg` faqat haqiqiy sahifa bo'lsagina ishlatiladi. Aks holda joriy
   * path sheet bo'lsa — uning bo'lim sahifasi, bo'lmasa — joriy path.
   */
  const safeBg = bg && !isSheetRoute(bg.pathname) ? bg : null;
  const mainPathname = safeBg
    ? safeBg.pathname
    : sheetOpen
      ? baseRouteFor(location.pathname)
      : location.pathname;
  const mainSearch = safeBg ? safeBg.search ?? '' : location.search;

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

      {sheetOpen && (
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
