import { useSettings } from '../../store/settings';

const S = () => useSettings.getState();

/** "1 234 567,89" → 1234567.89. Bo'sh satr uchun null. */
export function parseNumber(input: string): number | null {
  if (!input) return null;
  const s = input.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 1234567.891 → "1 234 567,89" (sozlamadagi ajratgich bilan). */
export function formatNumber(n: number | null | undefined, opts?: { decimals?: number; forceSep?: boolean }): string {
  if (n == null || !Number.isFinite(n)) return '';
  const dec = opts?.decimals ?? 2;
  const sep = S().decimalSep;
  const neg = n < 0;
  const [intPart, rawFrac] = Math.abs(n).toFixed(dec).split('.');
  const frac = rawFrac ? rawFrac.replace(/0+$/, '') : '';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let out = grouped;
  if (frac) out += sep + frac;
  else if (opts?.forceSep) out += sep;
  return (neg ? '-' : '') + out;
}

export function currencySymbol(currency?: string): string {
  const c = currency ?? S().currency;
  return c === 'UZS' ? "so'm" : '$';
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  const c = S().currency;
  const num = formatNumber(n);
  return c === 'UZS' ? `${num} so'm` : `$${num}`;
}

/** Bank rounding (half-even) — pul hisoblari uchun */
export function roundHalfEven(n: number, dp = 2): number {
  const sign = n < 0 ? -1 : 1;
  const m = Math.pow(10, dp);
  const x = Math.abs(n) * m;
  const f = Math.floor(x);
  const r = x - f;
  const eps = 1e-9;
  let up: number;
  if (r > 0.5 + eps) up = 1;
  else if (r < 0.5 - eps) up = 0;
  else up = f % 2 === 0 ? 0 : 1;
  return sign * (f + up) / m;
}

export const round2 = (n: number): number => roundHalfEven(n, 2);

/** Kasr qismini dec xonagacha kesish (yaxlitlamasdan) — kiritish paytida */
export function truncateDecimals(s: string, dec: number): string {
  if (dec <= 0) return s;
  const idx = s.search(/[.,]/);
  if (idx === -1) return s;
  return s.slice(0, idx + 1 + dec);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(ts: number): string {
  const fmt = S().dateFormat;
  const d = new Date(ts);
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yy = String(d.getFullYear());
  if (fmt === 'mdy') return `${mm}/${dd}/${yy}`;
  if (fmt === 'iso') return `${yy}-${mm}-${dd}`;
  return `${dd}.${mm}.${yy}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)}, ${formatTime(ts)}`;
}

function locale(): string {
  return S().lang === 'uz' ? 'uz-UZ' : 'ru-RU';
}

export function monthShort(ts: number): string {
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short' }).format(new Date(ts));
}

export function weekdayShort(ts: number): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(ts));
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Katta sonlarni chart o'qlarida qisqartirish: 12 500 → 12.5k */
export function compactNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/[.,]0$/, '') + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/[.,]0$/, '') + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/[.,]0$/, '') + 'k';
  return String(Math.round(n));
}
