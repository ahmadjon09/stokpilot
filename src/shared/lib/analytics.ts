/**
 * Davr bo'yicha statistika — SOF funksiyalar (baza va React'ga bog'lanmaydi).
 *
 * Nega alohida modul: dashboard, hisobotlar va "Statistika" bo'limi bir xil
 * davr matematikasidan foydalanishi shart. Ilgari har bir sahifa o'z
 * `startOfDay` siklini yozardi va oy chegaralari turlicha hisoblanardi
 * (ayniqsa oy oxiri/oy boshi va qishki vaqt o'zgarishlarida).
 *
 * ── MUHIM: KALENDAR ARIFMETIKASI ──────────────────────────────────────────
 * Oy chegarasini `now - 30 * DAY` bilan hisoblash MUMKIN EMAS:
 *   • oylar 28..31 kun;
 *   • 31-martdan bir oy oldin — 28-fevral (30 kun emas).
 * Shuning uchun `new Date(y, m, d)` orqali mahalliy kalendar bilan
 * ishlaymiz. Bu foydalanuvchi ko'rgan "oktabr oyi" bilan aynan mos keladi.
 */

import type { Sale } from '../../db/db';
import { round2 } from './format';
import { countableSales, itemStats, saleNetCost, saleNetProfit, saleNetTotal } from './salesStats';

export const DAY = 86400000;

/* ---------------------------------------------------------------------- */
/*  Kalendar yordamchilari                                                 */
/* ---------------------------------------------------------------------- */

/** Mahalliy vaqt bo'yicha kun boshi */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Mahalliy vaqt bo'yicha oy boshi */
export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

/** Oy boshidan `n` oy oldin/keyin (kalendar bo'yicha, kun soni emas) */
export function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // 31-kunni 30-kunli oyga o'tkazishda "oy sakrashi" bo'lmasligi uchun
  // avval 1-sanaga tushamiz, keyin oyni suramiz
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

/** Oyning oxiri (keyingi oy boshi − 1 ms) */
export function endOfMonth(ts: number): number {
  return addMonths(startOfMonth(ts), 1) - 1;
}

/** Oy nomi — i18n kaliti emas, to'g'ridan-to'g'ri qisqa nom (grafik uchun) */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------------- */
/*  Davr statistikasi                                                      */
/* ---------------------------------------------------------------------- */

export interface PeriodStats {
  /** Davr boshi / oxiri (ms) */
  from: number;
  to: number;
  /** Sof tushum (qaytarishlar ayirilgan) */
  revenue: number;
  /** Sof foyda */
  profit: number;
  /** Sof tannarx */
  cost: number;
  /** Cheklar soni (sof summasi > 0) */
  checks: number;
  /** O'rtacha chek */
  avgCheck: number;
  /** Foyda marjasi, % */
  margin: number;
  /** Sotilgan dona (qaytarilganlar chiqarilgan) */
  units: number;
  /** Nasiyaga sotilgan summa shu davrda */
  creditSales: number;
  /** Shu davrda qaytarilgan summa */
  refunded: number;
}

/**
 * Berilgan vaqt oralig'idagi sotuvlardan to'liq KPI to'plamini hisoblaydi.
 *
 * `sales` — allaqachon yuklangan ro'yxat (diapazon bo'yicha filtrlash shu
 * yerda, chunki chaqiruvchi odatda bir marta katta diapazonni oladi).
 */
export function periodStats(sales: Sale[], from: number, to: number = Date.now()): PeriodStats {
  const inRange = countableSales(sales).filter((s) => s.createdAt >= from && s.createdAt <= to);

  let revenue = 0;
  let cost = 0;
  let profit = 0;
  let units = 0;
  let creditSales = 0;
  let refunded = 0;

  for (const s of inRange) {
    revenue = round2(revenue + saleNetTotal(s));
    cost = round2(cost + saleNetCost(s));
    profit = round2(profit + saleNetProfit(s));
    refunded = round2(refunded + (s.refundedAmount ?? 0));
    if (s.payType === 'debt') creditSales = round2(creditSales + saleNetTotal(s));
  }

  // Donalar — qaytarilgan donalar chiqarib tashlanadi
  for (const st of itemStats(inRange).values()) units = round2(units + st.qty);

  const checks = inRange.length;
  return {
    from,
    to,
    revenue,
    profit,
    cost,
    checks,
    avgCheck: checks > 0 ? round2(revenue / checks) : 0,
    margin: revenue > 0 ? round2((profit / revenue) * 100) : 0,
    units,
    creditSales,
    refunded,
  };
}

/* ---------------------------------------------------------------------- */
/*  Kunlik / oylik qatorlar                                                */
/* ---------------------------------------------------------------------- */

export interface DayRow {
  /** Kun boshi (ms) */
  ts: number;
  revenue: number;
  profit: number;
  checks: number;
}

/** Oxirgi `days` kun — har bir kun uchun alohida qator (bugungi kun bilan tugaydi) */
export function dailySeries(sales: Sale[], days: number, now = Date.now()): DayRow[] {
  const today = startOfDay(now);
  const rows: DayRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = today - i * DAY;
    const to = from + DAY - 1;
    const s = periodStats(sales, from, to);
    rows.push({ ts: from, revenue: s.revenue, profit: s.profit, checks: s.checks });
  }
  return rows;
}

export interface MonthRow {
  /** Oy boshi (ms) */
  ts: number;
  /** "2026-11" — barqaror kalit */
  key: string;
  revenue: number;
  profit: number;
  checks: number;
  units: number;
  margin: number;
  /** O'sish, oldingi oyga nisbatan % (birinchi oy uchun null) */
  growth: number | null;
}

/**
 * Oxirgi `months` oy (joriy oy bilan tugaydi) — har bir oy uchun to'liq
 * ko'rsatkichlar va oldingi oyga nisbatan o'sish.
 *
 * `growth` — foizda. Oldingi oy 0 bo'lsa `null` (0 ga bo'lish ma'nosiz).
 */
export function monthlySeries(sales: Sale[], months: number, now = Date.now()): MonthRow[] {
  const current = startOfMonth(now);
  const rows: MonthRow[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const from = addMonths(current, -i);
    const to = addMonths(from, 1) - 1;
    const s = periodStats(sales, from, to);
    rows.push({
      ts: from,
      key: monthKey(from),
      revenue: s.revenue,
      profit: s.profit,
      checks: s.checks,
      units: s.units,
      margin: s.margin,
      growth: null, // quyida to'ldiriladi
    });
  }

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].revenue;
    const cur = rows[i].revenue;
    rows[i].growth = prev > 0 ? round2(((cur - prev) / prev) * 100) : null;
  }

  return rows;
}

/* ---------------------------------------------------------------------- */
/*  Taqqoslash (joriy oy vs o'tgan oy / o'tgan yil)                        */
/* ---------------------------------------------------------------------- */

export interface Comparison {
  current: PeriodStats;
  previous: PeriodStats;
  /** Tushum o'zgarishi, % (previous 0 bo'lsa null) */
  revenueChange: number | null;
  /** Foyda o'zgarishi, % */
  profitChange: number | null;
  /** Cheklar soni o'zgarishi */
  checksChange: number;
}

function pctChange(prev: number, cur: number): number | null {
  if (prev === 0) return null;
  return round2(((cur - prev) / prev) * 100);
}

/** Joriy oy bilan o'tgan oyni taqqoslaydi (foiz o'zgarishlari bilan) */
export function monthComparison(sales: Sale[], now = Date.now()): Comparison {
  const curFrom = startOfMonth(now);
  const prevFrom = addMonths(curFrom, -1);
  const current = periodStats(sales, curFrom, now);
  const previous = periodStats(sales, prevFrom, curFrom - 1);
  return {
    current,
    previous,
    revenueChange: pctChange(previous.revenue, current.revenue),
    profitChange: pctChange(previous.profit, current.profit),
    checksChange: current.checks - previous.checks,
  };
}

/* ---------------------------------------------------------------------- */
/*  Formatlash                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Oy nomi — `Intl` orqali (tilga mos). `locale` i18n tiliga mos beriladi
 * ('uz' yoki 'ru').
 */
export function monthLabel(ts: number, locale: string, style: 'short' | 'long' = 'short'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
      month: style, year: style === 'long' ? 'numeric' : undefined,
    }).format(new Date(ts));
  } catch {
    // Intl ma'lumotlari yo'q muhitlarda (test) — barqaror fallback
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }
}

/** "5-noy" kabi qisqa kun yorlig'i */
export function dayLabel(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric', month: 'short',
    }).format(new Date(ts));
  } catch {
    const d = new Date(ts);
    return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
