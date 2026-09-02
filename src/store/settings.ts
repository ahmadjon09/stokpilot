import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'uz' | 'ru';
export type ThemeMode = 'light' | 'dark' | 'system';
export type NavKey = 'dashboard' | 'products' | 'sales' | 'stock' | 'customers' | 'reports' | 'settings';
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
      nav: ['dashboard', 'products', 'sales', 'stock', 'reports'],
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
