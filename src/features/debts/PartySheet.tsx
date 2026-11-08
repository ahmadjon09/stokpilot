import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Pencil, Phone, Receipt, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Customer, type LedgerEntry } from '../../db/db';
import { deleteLedgerEntry } from '../../db/actions';
import { ledgerStats } from '../../db/ledger';
import { debtTint, debtView } from '../../shared/lib/debt';
import { formatMoney } from '../../shared/lib/format';
import { useCloseSheet, useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import { ConfirmDialog, EmptyState } from '../../shared/ui/bits';
import Sheet from '../../shared/ui/Sheet';
import LedgerTimeline, { LedgerStatsStrip } from './LedgerTimeline';
import PaymentSheet, { type PaymentMode } from './PaymentSheet';

/**
 * Kontragent kartochkasi — qarz daftari ekranining yuragi.
 *
 * Ko'rsatadi:
 *  - joriy qarz va "kim kimga qarzdor" (mijoz / yetkazib beruvchi uchun
 *    bir xil komponent, faqat matn farq qiladi);
 *  - to'lovlar statistikasi (jami to'langan, to'lovlar soni, oxirgi sana);
 *  - to'liq tarix: har bir to'lov sanasi, summasi, izohi va o'sha paytdagi
 *    qoldiq (`balanceAfter`).
 *
 * To'lov kiritish — pastdagi asosiy tugma → `PaymentSheet`.
 */
export default function PartySheet() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const close = useCloseSheet('/debts');
  const openSheet = useOpenSheet();

  const party = useLiveQuery(async () => (id ? (await db.customers.get(id)) ?? null : null), [id]);
  const entries = useLiveQuery<LedgerEntry[] | undefined>(
    () => (id ? db.ledger.where('partyId').equals(id).toArray() : []),
    [id],
  );
  const salesCount = useLiveQuery(
    () => (id ? db.sales.where('customerId').equals(id).count() : 0),
    [id],
  );

  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LedgerEntry | null>(null);

  const stats = useMemo(() => ledgerStats(entries ?? []), [entries]);
  const view = debtView(party?.balance ?? 0, party?.kind ?? 'customer');

  if (party === undefined) {
    return (
      <Sheet title={t('debt.ledger')} onClose={close}>
        <div className="space-y-2 py-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
        </div>
      </Sheet>
    );
  }

  if (party === null) {
    return (
      <Sheet title={t('debt.ledger')} onClose={close} footer={
        <button type="button" className="btn btn-primary" onClick={close}>{t('common.close')}</button>
      }>
        <EmptyState icon={XCircle} title={t('sales.receiptNotFound')} hint={t('sales.receiptNotFoundHint')} />
      </Sheet>
    );
  }

  const isSupplier = party.kind === 'supplier';
  const payLabel = isSupplier ? t('debt.makePayment') : t('debt.takePayment');

  const removeEntry = async (entry: LedgerEntry) => {
    try {
      await deleteLedgerEntry(entry.id);
      toast(t('common.done'));
      buzz(12);
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg === 'linked_entry' || msg === 'protected_entry' ? t('debt.linkedEntry') : t('common.error'));
      buzz(30);
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <>
      <Sheet
        title={party.name}
        onClose={close}
        wide
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={t('common.edit')}
              onClick={() => openSheet(`/customers/${party.id}/edit`)}
            >
              <Pencil size={17} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { buzz(6); setPaymentMode('charge'); }}
            >
              <ArrowUpRight size={16} strokeWidth={1.5} /> {t('debt.addDebt')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { buzz(6); setPaymentMode('payment'); }}
            >
              <ArrowDownLeft size={16} strokeWidth={1.5} /> {payLabel}
            </button>
          </>
        }
      >
        {/* Joriy qarz kartasi */}
        <div
          className="mb-3 rounded-xl p-4"
          style={{ background: debtTint(view.color, view.settled ? 7 : 9) }}
        >
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mute">
            {isSupplier ? t('debt.creditors') : t('debt.debtors')}
          </p>
          <p
            className="tnum mt-1 text-[1.5rem] font-extrabold leading-none"
            style={{ color: view.color }}
          >
            {view.settled ? formatMoney(0) : `${view.sign}${formatMoney(view.amount)}`}
          </p>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {t(view.sideKey)}
          </p>

          {party.phone && (
            <a
              href={`tel:${party.phone}`}
              className="mt-2 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              <Phone size={13} strokeWidth={1.5} /> {party.phone}
            </a>
          )}
          {party.note && <p className="mt-2 text-[0.75rem] text-mute">{party.note}</p>}
        </div>

        {entries === undefined ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
          </div>
        ) : (
          <>
            <div className="mb-3"><LedgerStatsStrip stats={stats} /></div>

            <div className="mb-2 flex items-center justify-between">
              <p className="text-[0.8125rem] font-bold text-mute">{t('debt.ledger')}</p>
              {stats.lastPaymentAt && (
                <p className="text-[0.6875rem] text-mute">{t('debt.lastPayment')}: {formatMoney(stats.paid)}</p>
              )}
            </div>

            <LedgerTimeline
              entries={entries}
              kind={party.kind as Customer['kind']}
              onDelete={(e) => setConfirmDelete(e)}
            />

            {/* Nasiya sotuvlar tarixi (faqat mijoz uchun mazmunli) */}
            {!isSupplier && (salesCount ?? 0) > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[0.8125rem] font-bold text-mute">{t('debt.salesHistory')}</p>
                <div className="card row-list overflow-hidden">
                  {(entries ?? [])
                    .filter((e) => e.source === 'sale' && e.saleId)
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 10)
                    .map((e) => (
                      <button
                        key={e.saleId}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-card2"
                        onClick={() => openSheet(`/sales/receipt/${e.saleId}`)}
                      >
                        <Receipt size={15} strokeWidth={1.5} className="flex-none text-accent" />
                        <span className="tnum min-w-0 flex-1 truncate text-[0.8125rem]">
                          #{e.saleNumber} · {formatMoney(e.amount)}
                        </span>
                        <span className="text-[0.6875rem] text-mute">{t('common.view')}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </Sheet>

      {paymentMode && (
        <PaymentSheet party={party} mode={paymentMode} onClose={() => setPaymentMode(null)} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('debt.deleteEntry')}
          text={t('debt.deleteEntryConfirm')}
          danger
          confirmLabel={t('common.delete')}
          onConfirm={() => void removeEntry(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
