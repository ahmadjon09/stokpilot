import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, ChevronRight, CreditCard, Landmark, Receipt, RotateCcw, Search, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type PayType } from '../../db/db';
import { returnSale } from '../../db/actions';
import { formatDateTime, formatMoney } from '../../shared/lib/format';
import { ConfirmDialog, EmptyState } from '../../shared/ui/bits';
import { useCloseSheet, useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';

const PAY_ICON: Record<PayType, typeof Banknote> = {
  cash: Banknote, card: CreditCard, transfer: Landmark, debt: UserRound,
};

/**
 * Sotuvlar (cheklar) tarixi.
 *
 * Detal ko'rinishi: qatorning istalgan joyiga (yoki chek ikonkasiga) bosilganda
 * `/sales/receipt/:id` sheet'i ochiladi. `useOpenSheet` joriy sheet'ning orqa
 * fonini meros qilib oladi — shu sababli orqada POS sahifasi saqlanib qoladi
 * va "orqaga" bosilganda tarixga emas, savdoga qaytadi (kutilgan xatti-harakat).
 */
export default function SalesHistorySheet() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const close = useCloseSheet('/sales');

  const sales = useLiveQuery(
    () => db.sales.orderBy('createdAt').reverse().limit(120).toArray(),
    []
  );
  const [confirmReturn, setConfirmReturn] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyDone, setOnlyDone] = useState(false);

  const list = useMemo(() => {
    const rows = sales ?? [];
    const s = q.trim().toLowerCase();
    return rows.filter((x) => {
      if (onlyDone && x.status === 'returned') return false;
      if (!s) return true;
      return (
        String(x.number).includes(s) ||
        x.customerName.toLowerCase().includes(s) ||
        x.items.some((it) => it.name.toLowerCase().includes(s))
      );
    });
  }, [sales, q, onlyDone]);

  const open = (id: string) => { buzz(6); openSheet(`/sales/receipt/${id}`); };

  return (
    <Sheet title={t('sales.history')} onClose={close} wide>
      {/* Qidiruv / filtr */}
      {(sales?.length ?? 0) > 0 && (
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input
              className="input pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('sales.searchHistoryPh')}
              aria-label={t('common.search')}
              inputMode="search"
            />
          </div>
          <button
            type="button"
            className={'chip' + (onlyDone ? ' chip-on' : '')}
            aria-pressed={onlyDone}
            onClick={() => { buzz(6); setOnlyDone((v) => !v); }}
          >
            {t('sales.onlyActive')}
          </button>
        </div>
      )}

      {sales === undefined ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={q || onlyDone ? t('sales.nothingFound') : t('sales.emptyHistory')}
          hint={q || onlyDone ? t('sales.nothingFoundHint') : undefined}
        />
      ) : (
        <div className="card row-list overflow-hidden">
          {list.map((s) => {
            const Icon = PAY_ICON[s.payType] ?? Banknote;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={`${t('common.view')} #${s.number}`}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition active:bg-card2 hover:bg-card2"
                style={{ minHeight: 58 }}
                onClick={() => open(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(s.id); }
                }}
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                  <Icon size={16} strokeWidth={1.5} className="text-accent" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="tnum flex items-center gap-2 text-[0.875rem] font-bold">
                    #{s.number}
                    {s.status === 'returned' && <span className="badge badge-warn">{t('sales.returned')}</span>}
                  </p>
                  <p className="truncate text-[0.75rem] text-mute">
                    {formatDateTime(s.createdAt)} · {s.items.length} {t('sales.itemsCount')}
                    {s.customerName ? ` · ${s.customerName}` : ''}
                  </p>
                </div>
                <span className="tnum flex-none text-[0.9062rem] font-extrabold">{formatMoney(s.total)}</span>

                {/* Amallar — qator bosilishini to'xtatadi (event bubbling) */}
                <button
                  type="button"
                  className="icon-btn flex-none"
                  aria-label={t('common.view')}
                  onClick={(e) => { e.stopPropagation(); open(s.id); }}
                >
                  <ChevronRight size={18} strokeWidth={1.5} />
                </button>
                {s.status === 'done' && (
                  <button
                    type="button"
                    className="icon-btn flex-none"
                    style={{ color: 'var(--bad)' }}
                    aria-label={t('sales.return')}
                    onClick={(e) => { e.stopPropagation(); setConfirmReturn(s.id); }}
                  >
                    <RotateCcw size={17} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmReturn && (
        <ConfirmDialog
          title={t('sales.return')}
          text={t('sales.returnConfirm')}
          danger
          confirmLabel={t('sales.return')}
          onConfirm={() => {
            const saleId = confirmReturn;
            setConfirmReturn(null);
            void returnSale(saleId)
              .then(() => { buzz(16); toast(t('sales.returned')); })
              .catch(() => toast(t('common.error')));
          }}
          onCancel={() => setConfirmReturn(null)}
        />
      )}
    </Sheet>
  );
}
