import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Minus, Receipt, TrendingUp, Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '../../db/db';
import { compactNum, formatMoney, formatNumber, round2 } from '../../shared/lib/format';
import {
  dayLabel, dailySeries, monthComparison, monthLabel, monthlySeries, periodStats,
  startOfDay, startOfMonth,
} from '../../shared/lib/analytics';
import { useAccentColors } from '../../shared/lib/theme';
import { useSettings } from '../../store/settings';
import { Segmented } from '../../shared/ui/bits';

type Range = 'today' | '7' | '30' | 'month';

/**
 * "Statistika" — chuqurlashtirilgan tahlil.
 *
 * Uchta blok:
 *  1) BUGUN — bugungi savdo, foyda, cheklar, o'rtacha chek;
 *  2) OYLIK TAQQOSLASH — joriy oy vs o'tgan oy (foiz o'zgarishi bilan);
 *  3) TARIXIY JADVAL — oxirgi 12 oy: tushum, foyda, cheklar, marja, o'sish.
 *
 * Nega alohida sahifa: `Hisobotlar` amaliy (ABC, kam qolgan, eksport), bu
 * esa RAQAMLI TARIX — "oktabrda qancha qildim?" degan savolga javob.
 */
export default function StatisticsPage() {
  const { t } = useTranslation();
  const c = useAccentColors();
  const lang = useSettings((s) => s.lang);
  const [range, setRange] = useState<Range>('30');

  // 400 kun — 12 oylik taqqoslash uchun yetarli va bazani cho'ktirmaydi
  const since = useMemo(() => startOfMonth(Date.now()) - 400 * 86400000, []);
  const sales = useLiveQuery(
    () => db.sales.where('createdAt').above(since).toArray(),
    [since],
  ) ?? [];

  const data = useMemo(() => {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);

    const today = periodStats(sales, todayStart, now);
    const yesterday = periodStats(sales, todayStart - 86400000, todayStart - 1);
    const thisMonth = periodStats(sales, monthStart, now);
    const comparison = monthComparison(sales, now);

    const from =
      range === 'today' ? todayStart
        : range === 'month' ? monthStart
          : todayStart - (Number(range) - 1) * 86400000;
    const current = periodStats(sales, from, now);

    return {
      today,
      yesterday,
      thisMonth,
      comparison,
      current,
      daily: dailySeries(sales, range === 'today' ? 1 : Math.min(Number(range) || 30, 90), now),
      monthly: monthlySeries(sales, 12, now),
    };
  }, [sales, range]);

  const tooltipStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
    fontSize: 13, color: 'var(--text)',
  };
  const moneyFmt = (v: number | string) => formatMoney(Number(v));
  const loc = lang === 'ru' ? 'ru' : 'uz';

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('stats.title')}</h1>
        <p className="text-[0.8125rem] text-mute">{t('stats.subtitle')}</p>
      </div>

      {/* ── 1. BUGUN ─────────────────────────────────────────────────── */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold">
            <CalendarDays size={16} strokeWidth={1.5} className="text-accent" /> {t('stats.today')}
          </h2>
          <Delta value={pct(data.today.revenue, data.yesterday.revenue)} label={t('stats.vsYesterday')} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Kpi icon={Wallet} label={t('stats.revenue')} value={formatMoney(data.today.revenue)} tone="debt" />
          <Kpi icon={TrendingUp} label={t('stats.profit')} value={formatMoney(data.today.profit)} tone="ok" />
          <Kpi icon={Receipt} label={t('stats.checks')} value={String(data.today.checks)} />
          <Kpi icon={BarChart3} label={t('stats.avgCheck')} value={formatMoney(data.today.avgCheck)} />
        </div>
      </section>

      {/* ── 2. OYLIK TAQQOSLASH ──────────────────────────────────────── */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold">
            <BarChart3 size={16} strokeWidth={1.5} className="text-accent" /> {t('stats.monthCompare')}
          </h2>
          <span className="text-[0.6875rem] font-semibold text-mute">
            {monthLabel(data.comparison.current.from, loc, 'long')}
          </span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <CompareCard
            title={t('stats.thisMonth')}
            cur={data.comparison.current.revenue}
            prev={data.comparison.previous.revenue}
            change={data.comparison.revenueChange}
            prevLabel={monthLabel(data.comparison.previous.from, loc, 'short')}
          />
          <CompareCard
            title={t('stats.profit')}
            cur={data.comparison.current.profit}
            prev={data.comparison.previous.profit}
            change={data.comparison.profitChange}
            prevLabel={monthLabel(data.comparison.previous.from, loc, 'short')}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <MiniStat label={t('stats.checks')} value={String(data.thisMonth.checks)}
            sub={`${data.comparison.checksChange >= 0 ? '+' : ''}${data.comparison.checksChange} ${t('stats.vsPrevMonth')}`} />
          <MiniStat label={t('stats.units')} value={formatNumber(data.thisMonth.units)} />
          <MiniStat label={t('stats.margin')} value={formatNumber(data.thisMonth.margin) + ' %'} />
        </div>
      </section>

      {/* ── 3. DAVR TANLASH + KUNLIK GRAFIK ──────────────────────────── */}
      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: 'today', label: t('stats.rangeToday') },
          { value: '7', label: t('reports.days7') },
          { value: '30', label: t('reports.days30') },
          { value: 'month', label: t('stats.rangeMonth') },
        ]}
      />

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[0.9375rem] font-bold">{t('stats.dailyDynamics')}</h2>
          <p className="tnum text-[0.8125rem] font-bold" style={{ color: 'var(--accent)' }}>
            {formatMoney(data.current.revenue)}
          </p>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <MiniStat label={t('stats.profit')} value={formatMoney(data.current.profit)} />
          <MiniStat label={t('stats.checks')} value={String(data.current.checks)} />
          <MiniStat label={t('stats.creditSales')} value={formatMoney(data.current.creditSales)} tone="debt" />
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.daily} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="ts"
                tick={{ fontSize: 11, fill: c.muted }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tickFormatter={(v: number) => dayLabel(v, loc)}
              />
              <YAxis tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => compactNum(v)} width={52} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [moneyFmt(v as number), '']}
                labelFormatter={(v) => dayLabel(Number(v), loc)}
                labelStyle={{ color: 'var(--muted)' }}
              />
              <Line type="monotone" dataKey="revenue" stroke={c.accent} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── 4. OYLIK TARIX ───────────────────────────────────────────── */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-bold">{t('stats.monthlyHistory')}</h2>
          <span className="text-[0.6875rem] text-mute">{t('stats.last12')}</span>
        </div>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="ts"
                tick={{ fontSize: 10, fill: c.muted }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tickFormatter={(v: number) => monthLabel(v, loc, 'short')}
              />
              <YAxis tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => compactNum(v)} width={52} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) => [moneyFmt(v as number), String(name)]}
                labelFormatter={(v) => monthLabel(Number(v), loc, 'long')}
                labelStyle={{ color: 'var(--muted)' }}
                cursor={{ fill: c.cursor }}
              />
              <Bar dataKey="revenue" name={t('stats.revenue')} fill={c.accent} radius={[5, 5, 0, 0]} />
              <Bar dataKey="profit" name={t('stats.profit')} fill={c.ok} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Oylik jadval — mobil uchun gorizontal scroll, layout buzilmaydi */}
      <section className="card overflow-hidden">
        <div className="px-4 pt-4">
          <h2 className="text-[0.9375rem] font-bold">{t('stats.monthlyTable')}</h2>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[540px] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-line text-left text-[0.6875rem] uppercase text-mute">
                <th className="px-4 py-2">{t('stats.month')}</th>
                <th className="px-2 py-2 text-right">{t('stats.revenue')}</th>
                <th className="px-2 py-2 text-right">{t('stats.profit')}</th>
                <th className="px-2 py-2 text-right">{t('stats.checks')}</th>
                <th className="px-2 py-2 text-right">{t('stats.margin')}</th>
                <th className="px-4 py-2 text-right">{t('stats.growth')}</th>
              </tr>
            </thead>
            <tbody>
              {[...data.monthly].reverse().map((m) => {
                const isCurrent = m.key === data.monthly[data.monthly.length - 1].key;
                return (
                  <tr
                    key={m.key}
                    className="border-b border-line last:border-0"
                    style={isCurrent ? { background: 'var(--accent-soft)' } : undefined}
                  >
                    <td className="px-4 py-2 font-semibold">
                      {monthLabel(m.ts, loc, 'long')}
                      {isCurrent && <span className="badge badge-mute ml-1.5">{t('stats.current')}</span>}
                    </td>
                    <td className="tnum px-2 py-2 text-right font-semibold">{formatMoney(m.revenue)}</td>
                    <td className="tnum px-2 py-2 text-right" style={{ color: m.profit >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                      {formatMoney(m.profit)}
                    </td>
                    <td className="tnum px-2 py-2 text-right text-mute">{m.checks}</td>
                    <td className="tnum px-2 py-2 text-right text-mute">{formatNumber(m.margin)} %</td>
                    <td className="px-4 py-2 text-right">
                      <Growth value={m.growth} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Kichik komponentlar                                                    */
/* ---------------------------------------------------------------------- */

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return round2(((cur - prev) / prev) * 100);
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof Wallet; label: string; value: string; tone?: 'ok' | 'debt';
}) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'debt' ? 'var(--debt-customer)' : 'var(--accent)';
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--surface2)' }}>
      <p className="flex items-center gap-1 truncate text-[0.6875rem] font-semibold text-mute">
        <Icon size={12} strokeWidth={1.5} style={{ color }} /> {label}
      </p>
      <p className="tnum mt-0.5 truncate text-[0.9375rem] font-extrabold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'debt';
}) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: 'var(--surface2)' }}>
      <p className="truncate text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{label}</p>
      <p className="tnum truncate text-[0.8125rem] font-bold"
        style={tone === 'debt' ? { color: 'var(--debt-customer)' } : undefined}>{value}</p>
      {sub && <p className="truncate text-[0.5625rem] text-mute">{sub}</p>}
    </div>
  );
}

function CompareCard({ title, cur, prev, change, prevLabel }: {
  title: string; cur: number; prev: number; change: number | null; prevLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mute">{title}</p>
      <p className="tnum mt-0.5 text-[1.125rem] font-extrabold">{formatMoney(cur)}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="tnum truncate text-[0.6875rem] text-mute">
          {prevLabel}: {formatMoney(prev)}
        </p>
        <Delta value={change} label={t('stats.vsPrevMonth')} />
      </div>
    </div>
  );
}

function Delta({ value, label }: { value: number | null; label: string }) {
  const { t } = useTranslation();
  if (value === null) {
    return <span className="text-[0.625rem] text-mute">{t('stats.noBase')}</span>;
  }
  const up = value > 0;
  const flat = Math.abs(value) < 0.01;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const color = flat ? 'var(--muted)' : up ? 'var(--ok)' : 'var(--bad)';
  return (
    <span
      className="tnum inline-flex flex-none items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      title={label}
    >
      <Icon size={11} strokeWidth={2} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Growth({ value }: { value: number | null }) {
  const { t } = useTranslation();
  if (value === null) return <span className="text-[0.6875rem] text-mute">—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.01;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const color = flat ? 'var(--muted)' : up ? 'var(--ok)' : 'var(--bad)';
  return (
    <span className="tnum inline-flex items-center gap-0.5 text-[0.75rem] font-bold" style={{ color }} title={t('stats.growth')}>
      <Icon size={12} strokeWidth={2} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
