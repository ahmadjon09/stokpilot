import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Archive, Printer, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/db';
import { compactNum, formatMoney, formatNumber, monthShort, round2, startOfDay } from '../../shared/lib/format';
import { exportCSV } from '../../shared/lib/csv';
import { useAccentColors } from '../../shared/lib/theme';
import { Segmented } from '../../shared/ui/bits';

const DAY = 86400000;
type Period = 7 | 30 | 90;

export default function ReportsPage() {
  const { t } = useTranslation();
  const c = useAccentColors();
  const [period, setPeriod] = useState<Period>(30);

  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const sales = useLiveQuery(
    () => db.sales.where('createdAt').above(Date.now() - period * DAY).toArray(),
    [period]
  ) ?? [];

  const data = useMemo(() => {
    const done = sales.filter((s) => s.status === 'done');
    const revenue = done.reduce((s, x) => s + x.total, 0);
    const profit = done.reduce((s, x) => s + (x.total - x.costTotal), 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgCheck = done.length > 0 ? revenue / done.length : 0;

    // Kunlar bo'yicha
    const byDays: { label: string; sum: number }[] = [];
    const days = Math.min(period, 30);
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = startOfDay(Date.now()) - d * DAY;
      const sum = done.filter((s) => s.createdAt >= dayStart && s.createdAt < dayStart + DAY).reduce((s, x) => s + x.total, 0);
      byDays.push({ label: monthShort(dayStart), sum });
    }

    // ABC-tahlil
    const prodSum = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of done) {
      for (const it of s.items) {
        const cur = prodSum.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0 };
        cur.qty += it.qty;
        cur.revenue += it.price * it.qty;
        prodSum.set(it.productId, cur);
      }
    }
    const totalRev = [...prodSum.values()].reduce((s, x) => s + x.revenue, 0) || 1;
    let cum = 0;
    const abc = [...prodSum.entries()]
      .map(([pid, v]) => ({ pid, ...v, share: (v.revenue / totalRev) * 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((x) => {
        cum += x.share;
        return { ...x, cum, cls: cum <= 80 ? 'A' : cum <= 95 ? 'B' : 'C' };
      });

    // Kam qolgan
    const low = products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock);

    // O'lik zaxira
    const soldIds = new Set(prodSum.keys());
    const dead = products.filter((p) => p.stock > 0 && !soldIds.has(p.id));

    return { done, revenue, profit, margin, avgCheck, byDays, abc, low, dead };
  }, [sales, products, period]);

  const tooltipStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)',
  };

  const exportAbc = () => exportCSV(`stokpilot-abc-${period}d.csv`,
    ['SKU', t('common.name'), t('reports.soldQty'), t('reports.revenue'), t('reports.share') + ' %', 'ABC'],
    data.abc.map((r) => {
      const p = products.find((x) => x.id === r.pid);
      return [p?.sku ?? '', r.name, r.qty, Math.round(r.revenue), r.share.toFixed(1), r.cls];
    }));

  const exportLow = () => exportCSV('stokpilot-low-stock.csv',
    ['SKU', t('common.name'), t('reports.stockLeft'), t('products.minStock')],
    data.low.map((p) => [p.sku, p.name, p.stock, p.minStock]));

  return (
    <div className="print-area space-y-4">
      <div className="no-print hidden items-center justify-between md:flex">
        <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('reports.title')}</h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
          <Printer size={16} strokeWidth={1.5} /> {t('common.print')} / PDF
        </button>
      </div>

      <div className="no-print flex items-center justify-between gap-2">
        <Segmented value={String(period) as '7' | '30' | '90'} onChange={(v) => setPeriod(Number(v) as Period)} options={[
          { value: '7', label: t('reports.days7') },
          { value: '30', label: t('reports.days30') },
          { value: '90', label: t('reports.days90') },
        ]} className="flex-1" />
        <button type="button" className="icon-btn border border-line bg-card md:hidden" aria-label={t('common.print')} onClick={() => window.print()}>
          <Printer size={18} strokeWidth={1.5} />
        </button>
      </div>

      {data.done.length === 0 ? (
        <div className="card p-10 text-center text-mute">{t('reports.noSales')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              { icon: Wallet, label: t('reports.revenue'), value: formatMoney(round2(data.revenue)) },
              { icon: TrendingUp, label: t('reports.profit'), value: formatMoney(round2(data.profit)) },
              { icon: TrendingUp, label: t('reports.margin'), value: formatNumber(round2(data.margin)) + ' %' },
              { icon: Receipt, label: t('reports.checks'), value: String(data.done.length) },
              { icon: Wallet, label: t('reports.avgCheck'), value: formatMoney(round2(data.avgCheck)) },
            ].map((k, i) => (
              <div key={i} className="card p-3.5">
                <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-mute"><k.icon size={13} strokeWidth={1.5} /> {k.label}</p>
                <p className="kpi-num mt-1">{k.value}</p>
              </div>
            ))}
          </div>

          <section className="card p-4">
            <h3 className="mb-3 text-[0.9062rem] font-bold">{t('reports.byDays')}</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.byDays} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: c.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactNum(v)} width={52} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatMoney(Number(v)), '']} labelStyle={{ color: 'var(--muted)' }} />
                  <Line type="monotone" dataKey="sum" stroke={c.accent} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ABC */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4">
              <h3 className="text-[0.9062rem] font-bold">{t('reports.topByRevenue')}</h3>
              <button type="button" className="btn btn-ghost btn-sm no-print" onClick={exportAbc}>{t('reports.exportCsv')}</button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-line text-left text-[0.6875rem] uppercase text-mute">
                    <th className="px-4 py-2">{t('common.name')}</th>
                    <th className="px-2 py-2 text-right">{t('reports.soldQty')}</th>
                    <th className="px-2 py-2 text-right">{t('reports.revenue')}</th>
                    <th className="px-2 py-2 text-right">{t('reports.share')}</th>
                    <th className="px-2 py-2 text-right">{t('reports.cumShare')}</th>
                    <th className="px-4 py-2 text-right">ABC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.abc.slice(0, 20).map((r) => (
                    <tr key={r.pid} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-semibold">{r.name}</td>
                      <td className="tnum px-2 py-2 text-right">{formatNumber(r.qty)}</td>
                      <td className="tnum px-2 py-2 text-right font-semibold">{formatMoney(round2(r.revenue))}</td>
                      <td className="tnum px-2 py-2 text-right text-mute">{r.share.toFixed(1)}%</td>
                      <td className="tnum px-2 py-2 text-right text-mute">{r.cum.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-right">
                        <span className={'badge ' + (r.cls === 'A' ? 'badge-ok' : r.cls === 'B' ? 'badge-warn' : 'badge-mute')}>{r.cls}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Kam qolgan */}
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4">
                <h3 className="flex items-center gap-2 text-[0.9062rem] font-bold"><AlertTriangle size={16} strokeWidth={1.5} className="text-warn" /> {t('reports.lowStockReport')}</h3>
                <button type="button" className="btn btn-ghost btn-sm no-print" onClick={exportLow}>{t('reports.exportCsv')}</button>
              </div>
              <div className="row-list mt-3">
                {data.low.length === 0 && <p className="px-4 py-6 text-center text-[0.8125rem] text-mute">{t('dash.noData')}</p>}
                {data.low.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.8438rem] font-semibold">{p.name}</p>
                      <p className="text-[0.7188rem] text-mute">{p.sku}</p>
                    </div>
                    <span className="tnum text-[0.8438rem] font-bold" style={{ color: p.stock <= 0 ? 'var(--bad)' : 'var(--warn)' }}>
                      {formatNumber(p.stock)} / {formatNumber(p.minStock)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* O'lik zaxira */}
            <section className="card overflow-hidden">
              <div className="px-4 pt-4">
                <h3 className="flex items-center gap-2 text-[0.9062rem] font-bold"><Archive size={16} strokeWidth={1.5} className="text-mute" /> {t('reports.deadStock')}</h3>
              </div>
              <div className="row-list mt-3">
                {data.dead.length === 0 && <p className="px-4 py-6 text-center text-[0.8125rem] text-mute">{t('dash.noData')}</p>}
                {data.dead.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                    <p className="min-w-0 truncate text-[0.8438rem] font-semibold">{p.name}</p>
                    <span className="tnum text-[0.8438rem] text-mute">{formatNumber(p.stock)} {t('products.unit.' + p.unit)} · {formatMoney(p.stock * p.cost)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
