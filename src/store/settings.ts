import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'uz' | 'ru';
export type ThemeMode = 'light' | 'dark' | 'system';
export type NavKey =
  | 'dashboard' | 'products' | 'sales' | 'stock'
  | 'customers' | 'debts' | 'reports' | 'stats' | 'settings';

/**
 * Navigatsiya uchun mavjud kalitlar — tartib muhim (sidebar shu tartibda).
 * `stats` — v5 da qo'shilgan chuqur statistika sahifasi.
 */
export const ALL_NAV_KEYS: readonly NavKey[] = [
  'dashboard', 'products', 'sales', 'stock',
  'customers', 'debts', 'reports', 'stats', 'settings',
] as const;

/** Pastki panel (bottom bar) sig'adigan maksimal element soni */
export const BOTTOM_NAV_MAX = 5;
/** Kamida shuncha element bo'lishi kerak — aks holda panel "bo'sh" ko'rinadi */
export const BOTTOM_NAV_MIN = 3;

/**
 * Foydalanuvchi tanlagan elementlar yetarli bo'lmaganda ishlatiladigan
 * ZAXIRA ro'yxati. Shu tufayli hech qachon "yo'qolgan" tugma bo'lmaydi:
 * sozlamalar buzilgan/o'chirilgan bo'lsa ham panel to'liq ko'rinadi.
 */
export const NAV_FALLBACK: readonly NavKey[] = [
  'dashboard', 'sales', 'products', 'stock', 'debts',
] as const;

/**
 * Yakuniy pastki panel ro'yxatini hisoblaydi.
 *
 * Qoidalar (muhim — regressiyalarni oldini oladi):
 *  1. Noto'g'ri kalitlar (eski sozlama, `undefined`) tashlab yuboriladi;
 *  2. Dublikatlar olib tashlanadi (tartib saqlanadi);
 *  3. BOTTOM_NAV_MAX dan oshmaydi;
 *  4. Agar natija BOTTOM_NAV_MIN dan kam bo'lsa — zaxira ro'yxatidan
 *     yetishmayotganlari qo'shiladi (mavjudlarini takrorlamay).
 *
 * Shu funksiya SOF: UI ham, testlar ham bir xil natija oladi.
 */
export function resolveBottomNav(nav: unknown): NavKey[] {
  const valid = new Set<string>(ALL_NAV_KEYS);
  const seen = new Set<NavKey>();
  const out: NavKey[] = [];

  for (const raw of Array.isArray(nav) ? nav : []) {
    if (typeof raw !== 'string' || !valid.has(raw)) continue;
    const key = raw as NavKey;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= BOTTOM_NAV_MAX) break;
  }

  // Zaxira bilan to'ldirish — "yo'qolgan tugma" muammosining yechimi
  if (out.length < BOTTOM_NAV_MIN) {
    for (const key of NAV_FALLBACK) {
      if (out.length >= BOTTOM_NAV_MIN) break;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }

  return out;
}

/**
 * Sidebar ro'yxati — BARCHA bo'limlar, doim to'liq.
 * Sidebar "kashfiyat" paneli: unda hech narsa yashirilmaydi, shuning uchun
 * foydalanuvchi sozlamalarda nima tanlaganidan qat'i nazar hamma joyga
 * yeta oladi (ayniqsa planshet/desktopda).
 */
export function resolveSidebarNav(nav: unknown): NavKey[] {
  const chosen = resolveBottomNav(nav);
  const chosenSet = new Set(chosen);
  // Tanlanganlar yuqorida (foydalanuvchi kutgan tartibda), qolganlari pastda
  const rest = ALL_NAV_KEYS.filter((k) => !chosenSet.has(k));
  return [...chosen, ...rest];
}
export type WidgetKey = 'kpis' | 'trend' | 'categories' | 'top' | 'flow';

export const ACCENTS: Record<string, string> = {
  indigo: '#4f46e5',
  emerald: '#059669',
  sky: '#0284c7',
  amber: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
  teal: '#0d9488',
};

export interface BizSettings {
  name: string;
  logo: string; // base64
  vat: number;
  receiptFooter: string;
  minStock: number;
}

interface SettingsState {
  theme: ThemeMode;
  accent: string;
  radius: number; // 0 | 8 | 16
  density: 'compact' | 'comfortable';
  font: 'sm' | 'md' | 'lg';
  lang: Lang;
  currency: 'UZS' | 'USD';
  decimalSep: ',' | '.';
  dateFormat: 'dmy' | 'mdy' | 'iso';
  weekStart: 0 | 1;
  biz: BizSettings;
  nav: NavKey[];
  widgets: WidgetKey[];
  set: (p: Partial<Omit<SettingsState, 'set' | 'setBiz'>>) => void;
  setBiz: (p: Partial<BizSettings>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      accent: 'indigo',
      radius: 8,
      density: 'comfortable',
      font: 'md',
      lang: 'uz',
      currency: 'UZS',
      decimalSep: ',',
      dateFormat: 'dmy',
      weekStart: 1,
      biz: { name: "Mening do'konim", logo: '', vat: 0, receiptFooter: 'Xaridingiz uchun rahmat!', minStock: 5 },
      nav: ['dashboard', 'sales', 'products', 'stock', 'debts'],
      widgets: ['kpis', 'trend', 'categories', 'top', 'flow'],
      set: (p) => set(p),
      setBiz: (p) => set({ biz: { ...get().biz, ...p } }),
    }),
    { name: 'sp-settings' }
  )
);

export function isDarkMode(theme: ThemeMode): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** CSS o'zgaruvchilar, dark klassi, i18n tilini qo'llash */
export function applyAppearance(s: Pick<SettingsState, 'theme' | 'accent' | 'radius' | 'density' | 'font'>): void {
  const root = document.documentElement;
  root.classList.toggle('dark', isDarkMode(s.theme));
  root.style.setProperty('--accent', ACCENTS[s.accent] ?? ACCENTS.indigo);
  root.style.setProperty('--radius', s.radius + 'px');
  root.dataset.density = s.density;
  root.dataset.font = s.font;
}
