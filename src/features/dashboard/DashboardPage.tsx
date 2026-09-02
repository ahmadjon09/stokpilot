import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Banknote, TrendingUp, Wallet } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/db';
import { compactNum, formatMoney, monthShort, startOfDay } from '../../shared/lib/format';
import { useSettings } from '../../store/settings';
import { useAccentColors } from '../../shared/lib/theme';

const DAY = 86400000;

function KpiCard({ icon: Icon, label, value, tone }: {
  icon: typeof Wallet; label: string; value: string; tone?: 'warn' | 'ok';
}) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
        style={{ background: tone === 'warn' ? 'color-mix(in srgb, var(--warn) 15%, transparent)' : 'var(--accent-soft)' }}>
        <Icon size={19} strokeWidth={1.5} style={{ color: tone === 'warn' ? 'var(--warn)' : 'var(--accent)' }} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-mute">{label}</p>
        <p className="kpi-num truncate">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3">
        <h3 className="text-[14.5px] font-bold">{title}</h3>
        {sub && <p className="text-[12px] text-mute">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const widgets = useSettings((s) => s.widgets);
  const c = useAccentColors();

  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const sales = useLiveQuery(() => db.sales.where('createdAt').above(Date.now() - 30 * DAY).toArray(), []) ?? [];
  const moves = useLiveQuery(() => db.moves.where('createdAt').above(Date.now() - 14 * DAY).toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];

  const data = useMemo(() => {
    const today = startOfDay(Date.now());
    const done = sales.filter((s) => s.status === 'done');
    const todaySales = done.filter((s) => s.createdAt >= today);
    const revenueToday = todaySales.reduce((s, x) => s + x.total, 0);
    const profitToday = todaySales.reduce((s, x) => s + (x.total - x.costTotal), 0);
    const stockValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
    const lowCount = products.filter((p) => p.stock <= p.minStock).length;

    // 14 kunlik trend
    const trend: { label: string; sum: number }[] = [];
    for (let d = 13; d >= 0; d--) {
      const dayStart = startOfDay(Date.now()) - d * DAY;
      const sum = done.filter((s) => s.createdAt >= dayStart && s.createdAt < dayStart + DAY).reduce((s, x) => s + x.total, 0);
      trend.push({ label: monthShort(dayStart), sum });
    }

    // Kategoriya taqsimoti (30 kun)
    const prodCat = new Map(products.map((p) => [p.id, p.categoryId]));
    const catSum = new Map<string, number>();
    for (const s of done) {
      for (const it of s.items) {
        const cat = prodCat.get(it.productId) ?? '?';
        catSum.set(cat, (catSum.get(cat) ?? 0) + it.price * it.qty);
      }
    }
    const catName = new Map(categories.map((x) => [x.id, x.name]));
    const pie = [...catSum.entries()]
      .map(([id, value]) => ({ name: catName.get(id) ?? '—', value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);

    // Top-10 mahsulot (30 kun tushum)
    const prodSum = new Map<string, { name: string; sum: number }>();
    for (const s of done) {
      for (const it of s.items) {
        const cur = prodSum.get(it.productId) ?? { name: it.name, sum: 0 };
        cur.sum += it.price * it.qty;
        prodSum.set(it.productId, cur);
      }
    }
    const top = [...prodSum.values()].sort((a, b) => b.sum - a.sum).slice(0, 10)
      .map((x) => ({ name: x.name.length > 14 ? x.name.slice(0, 13) + '…' : x.name, sum: Math.round(x.sum) }));

    // Zaxira harakati (14 kun)
    const flow: { label: string; inQty: number; outQty: number }[] = [];
    for (let d = 13; d >= 0; d--) {
      const dayStart = startOfDay(Date.now()) - d * DAY;
      const dayMoves = moves.filter((m) => m.createdAt >= dayStart && m.createdAt < dayStart + DAY);
      const inQty = dayMoves.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
      const outQty = dayMoves.filter((m) => m.qty < 0).reduce((s, m) => s - m.qty, 0);
      flow.push({ label: monthShort(dayStart), inQty, outQty });
    }

    return { revenueToday, profitToday, stockValue, lowCount, trend, pie, top, flow };
  }, [products, sales, moves, categories]);

  const tooltipStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
    fontSize: 13, color: 'var(--text)',
  };
  const moneyFmt = (v: number | string) => formatMoney(Number(v));

  const hasData = sales.length > 0 || products.length > 0;

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <h1 className="text-[22px] font-extrabold tracking-tight">{t('nav.dashboard')}</h1>
      </div>

      {!hasData ? (
        <div className="card p-10 text-center text-mute">{t('dash.noData')}</div>
      ) : (
        <>
          {widgets.includes('kpis') && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <KpiCard icon={Wallet} label={t('dash.totalStockValue')} value={formatMoney(data.stockValue)} />
              <KpiCard icon={Banknote} label={t('dash.todaySales')} value={formatMoney(data.revenueToday)} tone="ok" />
              <KpiCard icon={TrendingUp} label={t('dash.todayProfit')} value={formatMoney(data.profitToday)} tone="ok" />
              <KpiCard icon={AlertTriangle} label={t('dash.lowStockItems')} value={String(data.lowCount)} tone="warn" />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {widgets.includes('trend') && (
              <ChartCard title={t('dash.salesTrend')} sub={t('dash.last14')}>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactNum(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [moneyFmt(v as number), '']} labelStyle={{ color: 'var(--muted)' }} />
                      <Line type="monotone" dataKey="sum" stroke={c.accent} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}

            {widgets.includes('categories') && (
              <ChartCard title={t('dash.byCategory')} sub={t('dash.last30')}>
                {data.pie.length === 0 ? <p className="py-10 text-center text-[13px] text-mute">{t('dash.noData')}</p> : (
                  <div className="flex items-center gap-2">
                    <div className="h-52 flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.pie} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
                            {data.pie.map((_, i) => <Cell key={i} fill={c.palette[i % c.palette.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [moneyFmt(v as number), String(name)]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="w-[42%] space-y-1.5">
                      {data.pie.slice(0, 6).map((x, i) => (
                        <li key={x.name} className="flex items-center gap-2 text-[12.5px]">
                          <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: c.palette[i % c.palette.length] }} />
                          <span className="truncate text-mute">{x.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ChartCard>
            )}

            {widgets.includes('top') && (
              <ChartCard title={t('dash.topProducts')} sub={t('dash.last30')}>
                {data.top.length === 0 ? <p className="py-10 text-center text-[13px] text-mute">{t('dash.noData')}</p> : (
                  <div style={{ height: 56 * data.top.length + 20 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.top} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [moneyFmt(v as number), '']} cursor={{ fill: c.cursor }} />
                        <Bar dataKey="sum" fill={c.accent} radius={[0, 6, 6, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>
            )}

            {widgets.includes('flow') && (
              <ChartCard title={t('dash.stockFlow')} sub={t('dash.last14')}>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.flow} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c.ok} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={c.ok} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c.bad} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={c.bad} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactNum(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted)' }} />
                      <Area type="monotone" dataKey="inQty" name={t('dash.incoming')} stroke={c.ok} strokeWidth={2} fill="url(#gIn)" />
                      <Area type="monotone" dataKey="outQty" name={t('dash.outgoing')} stroke={c.bad} strokeWidth={2} fill="url(#gOut)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
