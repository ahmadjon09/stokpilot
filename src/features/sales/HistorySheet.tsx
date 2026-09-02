import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { Banknote, CreditCard, Landmark, Receipt, RotateCcw, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type PayType } from '../../db/db';
import { returnSale } from '../../db/actions';
import { formatDateTime, formatMoney } from '../../shared/lib/format';
import { ConfirmDialog, EmptyState } from '../../shared/ui/bits';
import { useOpenSheet } from '../../shared/lib/nav';
import Sheet from '../../shared/ui/Sheet';

const PAY_ICON: Record<PayType, typeof Banknote> = {
  cash: Banknote, card: CreditCard, transfer: Landmark, debt: UserRound,
};

export default function SalesHistorySheet() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const openSheet = useOpenSheet();
  const hasBackground = Boolean((location.state as { background?: unknown } | null)?.background);
  const close = () => { if (hasBackground) navigate(-1); else navigate('/sales'); };

  const sales = useLiveQuery(() => db.sales.orderBy('createdAt').reverse().limit(60).toArray(), []) ?? [];
  const [confirmReturn, setConfirmReturn] = useState<string | null>(null);

  return (
    <Sheet title={t('sales.history')} onClose={close} wide>
      {sales.length === 0 ? (
        <EmptyState icon={Receipt} title={t('sales.emptyHistory')} />
      ) : (
        <div className="card row-list overflow-hidden">
          {sales.map((s) => {
            const Icon = PAY_ICON[s.payType];
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 58 }}>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                  <Icon size={16} strokeWidth={1.5} className="text-accent" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="tnum text-[14px] font-bold">
                    #{s.number}
                    {s.status === 'returned' && <span className="badge badge-warn ml-2">{t('sales.returned')}</span>}
                  </p>
                  <p className="truncate text-[12px] text-mute">
                    {formatDateTime(s.createdAt)} · {s.items.length} {t('sales.itemsCount')}
                    {s.customerName ? ` · ${s.customerName}` : ''}
                  </p>
                </div>
                <span className="tnum text-[14.5px] font-extrabold">{formatMoney(s.total)}</span>
                <button type="button" className="icon-btn" aria-label={t('common.view')}
                  onClick={() => openSheet(`/sales/receipt/${s.id}`)}>
                  <Receipt size={18} strokeWidth={1.5} />
                </button>
                {s.status === 'done' && (
                  <button type="button" className="icon-btn" style={{ color: 'var(--bad)' }} aria-label={t('sales.return')}
                    onClick={() => setConfirmReturn(s.id)}>
                    <RotateCcw size={17} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmReturn && (
        <ConfirmDialog title={t('sales.return')} text={t('sales.returnConfirm')} danger confirmLabel={t('sales.return')}
          onConfirm={() => { void returnSale(confirmReturn).then(() => setConfirmReturn(null)); }}
          onCancel={() => setConfirmReturn(null)} />
      )}
    </Sheet>
  );
}
