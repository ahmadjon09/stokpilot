import { useMemo } from 'react';
import { useSettings } from '../../store/settings';

export interface ChartColors {
  accent: string;
  muted: string;
  grid: string;
  ok: string;
  bad: string;
  warn: string;
  cursor: string;
  palette: string[];
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Recharts uchun theme-aware ranglar (theme o'zgarganda qayta hisoblanadi) */
export function useAccentColors(): ChartColors {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  return useMemo(() => {
    const accentColor = cssVar('--accent', '#4f46e5');
    return {
      accent: accentColor,
      muted: cssVar('--muted', '#6b7280'),
      grid: cssVar('--border', '#e5e7eb'),
      ok: cssVar('--ok', '#059669'),
      bad: cssVar('--bad', '#dc2626'),
      warn: cssVar('--warn', '#d97706'),
      cursor: 'color-mix(in srgb, var(--text) 6%, transparent)',
      palette: [
        accentColor,
        '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e',
        '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
      ],
    };
    // theme/accent o'zgarganda CSS o'zgaruvchilari yangilanadi → qayta hisoblash
  }, [theme, accent]);
}
