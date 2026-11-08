import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, ChevronRight, CreditCard, Landmark, Receipt, RotateCcw, Search, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type PayType, type Sale } from '../../db/db';
import { hasReturnableItems } from '../../db/returns';
import { formatDateTime, formatMoney } from '../../shared/lib/format';
import { EmptyState } from '../../shared/ui/bits';
import { useCloseSheet, useOpenSheet } from '../../shared/lib/nav';
import { buzz } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';
import ReturnSheet from './ReturnSheet';

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
/**
 * Chekning qaytarishlardan keyingi aniq summasi (hisobotlar bilan bir xil mantiq).
 */
function netTotal(sale: Sale): number {
  return Math.max(0, sale.total - (sale.refundedAmount ?? 0));
}

export default function SalesHistorySheet() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const close = useCloseSheet('/sales');

  const sales = useLiveQuery(
    () => db.sales.orderBy('createdAt').reverse().limit(120).toArray(),
    []
  );
  // Qaytarish oynasi uchun tanlangan chek (satr darajasida tanlov)
  const [returnTarget, setReturnTarget] = useState<Sale | null>(null);
  const [q, setQ] = useState('');
  const [onlyDone, setOnlyDone] = useState(false);

  const list = useMemo(() => {
    const rows = sales ?? [];
    const s = q.trim().toLowerCase();
    return rows.filter((x) => {
      // "Faqat qaytarilmaganlar" — qismli qaytarilganlar ham istisno
      if (onlyDone && x.status !== 'done') return false;
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
                    {s.status === 'partial' && <span className="badge badge-warn">{t('sales.partial')}</span>}
                  </p>
                  <p className="truncate text-[0.75rem] text-mute">
                    {formatDateTime(s.createdAt)} · {s.items.length} {t('sales.itemsCount')}
                    {s.customerName ? ` · ${s.customerName}` : ''}
                  </p>
                </div>
                <span
                  className="tnum flex-none text-[0.9062rem] font-extrabold"
                  style={s.status !== 'done' ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}
                  title={s.status !== 'done' ? t('sales.netAmount') + ': ' + formatMoney(netTotal(s)) : undefined}
                >
                  {formatMoney(netTotal(s))}
                </span>

                {/* Amallar — qator bosilishini to'xtatadi (event bubbling) */}
                <button
                  type="button"
                  className="icon-btn flex-none"
                  aria-label={t('common.view')}
                  onClick={(e) => { e.stopPropagation(); open(s.id); }}
                >
                  <ChevronRight size={18} strokeWidth={1.5} />
                </button>
                {/* Qaytarish — qoldiq bo'lsa har doim ochiq (qismli qaytarish) */}
                {hasReturnableItems(s) && (
                  <button
                    type="button"
                    className="icon-btn flex-none"
                    style={{ color: 'var(--bad)' }}
                    aria-label={t('sales.return')}
                    onClick={(e) => { e.stopPropagation(); setReturnTarget(s); }}
                  >
                    <RotateCcw size={17} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {returnTarget && (
        <ReturnSheet
          sale={returnTarget}
          onClose={() => setReturnTarget(null)}
          // Qaytarishdan keyin yangilangan chekni qayta ochamiz — foydalanuvchi
          // darhol "yana qaytarish mumkinmi" ni ko'radi (bir necha dona).
          onDone={(saleId) => {
            setReturnTarget(null);
            void db.sales.get(saleId).then((fresh) => {
              if (fresh && hasReturnableItems(fresh)) open(fresh.id);
            });
          }}
        />
      )}
    </Sheet>
  );
}
