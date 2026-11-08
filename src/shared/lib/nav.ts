import { useCallback } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';

/**
 * Sheet (modal) route'lari — App.tsx ham, navigatsiya helper'lari ham
 * shu bitta ro'yxatdan foydalanadi. Ikki joyda takrorlanmasligi uchun
 * markazlashtirilgan.
 */
export const SHEET_ROUTES = [
  '/products/new',
  '/products/:id/edit',
  '/stock/new',
  '/customers/new',
  '/customers/:id/edit',
  '/debts/:id',
  '/sales/receipt/:id',
  '/sales/history',
  '/settings/storage',
] as const;

/** Berilgan path sheet route'imi? */
export function isSheetRoute(pathname: string): boolean {
  return SHEET_ROUTES.some((p) => Boolean(matchPath({ path: p, end: true }, pathname)));
}

/**
 * Sheet ostida ko'rsatiladigan asosiy sahifa.
 * Sheet route'ning o'zi hech qachon "background" bo'lishi mumkin emas —
 * aks holda asosiy `<Routes>` noma'lum path olib, `/` ga qaytarib yuboradi
 * va chek detali ochilmay qoladi.
 */
export function baseRouteFor(pathname: string): string {
  if (pathname.startsWith('/products')) return '/products';
  if (pathname.startsWith('/stock')) return '/stock';
  if (pathname.startsWith('/sales')) return '/sales';
  if (pathname.startsWith('/customers')) return '/customers';
  if (pathname.startsWith('/debts')) return '/debts';
  if (pathname.startsWith('/settings')) return '/settings';
  if (pathname.startsWith('/reports')) return '/reports';
  if (pathname.startsWith('/stats')) return '/stats';
  return '/';
}

export interface SheetBackground {
  pathname: string;
  search: string;
}

/**
 * Joriy joylashuvdan xavfsiz "background" yasaydi:
 *  - agar allaqachon ochiq sheet bo'lsa (history.state.background bor) — o'shani
 *    meros qilib olamiz (sheet ustiga sheet ochilsa, orqa fon buzilmaydi);
 *  - agar joriy path o'zi sheet route bo'lsa — uning asosiy sahifasini olamiz;
 *  - aks holda — joriy sahifa.
 */
export function resolveBackground(
  pathname: string,
  search: string,
  state: unknown
): SheetBackground {
  const existing = (state as { background?: SheetBackground } | null)?.background;
  if (existing && !isSheetRoute(existing.pathname)) {
    return { pathname: existing.pathname, search: existing.search ?? '' };
  }
  if (isSheetRoute(pathname)) return { pathname: baseRouteFor(pathname), search: '' };
  return { pathname, search };
}

/**
 * Sheet (modal) ni alohida route sifatida ochadi:
 * hozirgi sahifa location.state.background ga yoziladi →
 * Back tugmasi sheet ni yopadi, sahifa almashmaydi.
 */
export function useOpenSheet(): (path: string) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (path: string) => {
      navigate(path, {
        state: { background: resolveBackground(location.pathname, location.search, location.state) },
      });
    },
    [navigate, location.pathname, location.search, location.state]
  );
}

/**
 * Sheet'ni yopish: agar orqada sahifa bo'lsa — tarixda bir qadam orqaga,
 * aks holda (deep-link / refresh) — ko'rsatilgan fallback sahifaga.
 */
export function useCloseSheet(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    const state = location.state as { background?: SheetBackground } | null;
    if (state?.background) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, location.state, fallback]);
}
