import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Landmark, RotateCcw, Scale, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Customer, LedgerEntry, LedgerSource, PayType } from '../../db/db';
import { formatDateTime, formatMoney } from '../../shared/lib/format';
import { round2 } from '../../shared/lib/format';
import { EmptyState } from '../../shared/ui/bits';

const SOURCE_ICON: Record<LedgerSource, LucideIcon> = {
  opening: Scale,
  sale: ArrowUpRight,
  payment: ArrowDownLeft,
  return: RotateCcw,
  adjustment: Wallet,
};

const METHOD_ICON: Record<PayType, LucideIcon> = {
  cash: Banknote, card: CreditCard, transfer: Landmark, debt: Wallet,
};

export interface LedgerTimelineProps {
  entries: LedgerEntry[];
  /** Qaysi "tomondan" qaraladi — rang va ishora uchun */
  kind: Customer['kind'];
  /** Yozuvni o'chirish (ixtiyoriy). `sale` yozuvlari uchun chaqirilmaydi. */
  onDelete?: (entry: LedgerEntry) => void;
}

/**
 * Qarz daftari lentasi — mijoz ham, yetkazib beruvchi ham uchun bir xil.
 *
 * Har bir qatorda: sana/vaqt, harakat turi va izohi, summa (qarz oshgani
 * qizil, kamaygani yashil) va shu yozuvdan keyingi QOLDIQ. Shu tufayli
 * foydalanuvchi "qachon, qancha, qanday izoh bilan" to'langani va qarz
 * qanday qolganini bir qarashda ko'radi.
 */
export default function LedgerTimeline({ entries, kind, onDelete }: LedgerTimelineProps) {
  const { t } = useTranslation();

  // Xronologik (eng yangisi yuqorida) — mobil uchun eng qulay ko'rinish
  const rows = useMemo(
    () => [...entries].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)),
    [entries],
  );

  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title={t('debt.historyEmpty')} hint={t('debt.historyEmptyHint')} />;
  }

  return (
    <div className="card row-list overflow-hidden">
      {rows.map((e) => {
        const Icon = SOURCE_ICON[e.source] ?? Wallet;
        const method = e.method ? t('sales.pay.' + e.method) : '';
        /*
         * Rang QARZLAR STANDARTI bo'yicha (src/shared/lib/debt.ts).
         *
         * Bu yozuv — HARAKAT, qoldiq emas. Shuning uchun rang "qaysi tomonga
         * o'zgardi" degan ma'noni beradi:
         *   • QARZ O'SDI  → o'sha qarz turining rangi
         *       mijoz nasiyaga oldi        → qizil  (--debt-customer)
         *       biz yetkazib beruvchidan oldik → zangor (--debt-supplier)
         *   • QARZ KAMAYDI → yashil (--ok) — to'lov/qaytarish ijobiy harakat
         *
         * Ya'ni to'lov hech qachon ko'k bo'lib ko'rinmaydi (u qarz emas).
         */
        const increasesDebt = e.direction === 'charge';
        const color = increasesDebt
          ? (e.partyKind === 'supplier' ? 'var(--debt-supplier)' : 'var(--debt-customer)')
          : 'var(--ok)';
        const sign = increasesDebt ? '+' : '−';
        const MethodIcon = e.method && e.method !== 'debt' ? METHOD_ICON[e.method] : null;
        const deletable = Boolean(onDelete) && e.source !== 'sale' && e.source !== 'opening';

        return (
          <div key={e.id} className="flex items-start gap-3 px-3 py-2.5">
            <span
              className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
            >
              <Icon size={16} strokeWidth={1.5} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8438rem] font-semibold">
                <span>{t('debt.source.' + e.source)}</span>
                {e.saleNumber ? <span className="badge badge-mute tnum">#{e.saleNumber}</span> : null}
                {MethodIcon && (
                  <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-mute">
                    <MethodIcon size={11} strokeWidth={1.5} /> {method}
                  </span>
                )}
              </p>
              <p className="tnum text-[0.7188rem] text-mute">{formatDateTime(e.createdAt)}</p>
              {e.note && (
                <p className="mt-1 break-words rounded-md px-2 py-1 text-[0.75rem] leading-snug"
                  style={{ background: 'var(--surface2)' }}>
                  {e.note}
                </p>
              )}
            </div>

            <div className="flex-none text-right">
              <p className="tnum text-[0.875rem] font-extrabold" style={{ color }}>
                {sign}{formatMoney(e.amount)}
              </p>
              <p className="tnum text-[0.6875rem] text-mute">
                {t('debt.balanceAfter')}: {formatMoney(Math.abs(e.balanceAfter))}
              </p>
              {deletable && (
                <button
                  type="button"
                  className="mt-1 text-[0.6875rem] font-semibold underline-offset-2 hover:underline"
                  style={{ color: 'var(--muted)' }}
                  onClick={() => onDelete?.(e)}
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Kichik statistika kartasi — jami qarz / to'langan / to'lovlar soni */
export function LedgerStatsStrip({ stats }: {
  stats: { charged: number; paid: number; payments: number; lastPaymentAt: number | null };
}) {
  const { t } = useTranslation();
  return (
    <div className="card grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
      <div className="px-2 py-2.5 text-center">
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.statsCharged')}</p>
        <p className="tnum mt-0.5 text-[0.8125rem] font-bold">{formatMoney(round2(stats.charged))}</p>
      </div>
      <div className="px-2 py-2.5 text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.statsPaid')}</p>
        <p className="tnum mt-0.5 text-[0.8125rem] font-bold" style={{ color: 'var(--ok)' }}>{formatMoney(round2(stats.paid))}</p>
      </div>
      <div className="px-2 py-2.5 text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.statsPayments')}</p>
        <p className="tnum mt-0.5 text-[0.8125rem] font-bold">{stats.payments}</p>
        {stats.lastPaymentAt && (
          <p className="tnum mt-0.5 text-[0.5625rem] text-mute">{formatDateTime(stats.lastPaymentAt)}</p>
        )}
      </div>
    </div>
  );
}
