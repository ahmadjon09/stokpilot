import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { HandCoins, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, uid, type Customer } from '../../db/db';
import { deleteCustomer, saveCustomer } from '../../db/actions';
import { ledgerStats, partyNet } from '../../db/ledger';
import { formatMoney } from '../../shared/lib/format';
import { buzz, toast } from '../../shared/lib/misc';
import { useCloseSheet, useOpenSheet } from '../../shared/lib/nav';
import Sheet from '../../shared/ui/Sheet';
import NumberInput from '../../shared/ui/NumberInput';
import { ConfirmDialog, Field, Segmented } from '../../shared/ui/bits';

/**
 * Kontakt (mijoz / yetkazib beruvchi) formasi.
 *
 * Balans maydoni — faqat BOSHLANG'ICH yoki qo'lda tuzatish uchun. U har doim
 * `saveCustomer()` orqali yoziladi, ya'ni o'zgarish qarz daftarida (ledger)
 * alohida yozuv sifatida qoladi va tarix buzilmaydi.
 */
export default function CustomerFormSheet() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { t } = useTranslation();
  const close = useCloseSheet('/customers');
  const openSheet = useOpenSheet();

  const existing = useLiveQuery(async () => (id ? (await db.customers.get(id)) ?? null : null), [id]);
  const entries = useLiveQuery(
    () => (id ? db.ledger.where('partyId').equals(id).toArray() : []),
    [id],
  ) ?? [];

  const stats = useMemo(() => ledgerStats(entries), [entries]);
  const net = partyNet(existing?.balance ?? 0);

  const loadedRef = useRef(false);
  const [form, setForm] = useState<{
    name: string; phone: string; kind: 'customer' | 'supplier'; balance: number | null; note: string;
  }>({ name: '', phone: '', kind: 'customer', balance: null, note: '' });
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit || loadedRef.current || !existing) return;
    loadedRef.current = true;
    setForm({
      name: existing.name,
      phone: existing.phone,
      kind: existing.kind,
      balance: existing.balance || null,
      note: existing.note,
    });
  }, [isEdit, existing]);

  const save = async () => {
    if (!form.name.trim()) { setErr(t('customers.errName')); buzz(30); return; }
    setBusy(true);
    try {
      const rec: Customer = {
        id: id ?? uid(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        kind: form.kind,
        balance: form.balance ?? 0,
        note: form.note.trim(),
        createdAt: existing?.createdAt ?? Date.now(),
      };
      await saveCustomer(rec);
      toast(t('settings.saved'));
      buzz(14);
      close();
    } catch {
      toast(t('common.error'));
      buzz(30);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setConfirmDel(false);
    if (!id) return;
    try {
      await deleteCustomer(id);
      buzz(14);
      close();
    } catch { toast(t('common.error')); }
  };

  return (
    <Sheet
      title={isEdit ? t('customers.edit') : t('customers.new')}
      onClose={close}
      footer={
        <>
          {isEdit && (
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--bad)' }} onClick={() => setConfirmDel(true)} aria-label={t('common.delete')}>
              <Trash2 size={17} strokeWidth={1.5} />
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{t('common.save')}</button>
        </>
      }
    >
      <Field label={t('common.name')} required error={err}>
        <input className={'input' + (err ? ' input-err' : '')} value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErr(null); }} />
      </Field>

      <Field label={t('customers.kind')}>
        <Segmented value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v }))} options={[
          { value: 'customer', label: t('customers.kind.customer') },
          { value: 'supplier', label: t('customers.kind.supplier') },
        ]} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('common.phone')}>
          <input className="input" value={form.phone} inputMode="tel" placeholder="+998"
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label={t('customers.balance')} hint={t('customers.balanceHint')}>
          <NumberInput value={form.balance} onChange={(v) => setForm((f) => ({ ...f, balance: v }))} allowNegative placeholder="0" />
        </Field>
      </div>

      <Field label={t('common.note')}>
        <textarea className="input" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
      </Field>

      {/* Joriy qarz holati + daftarga o'tish */}
      {isEdit && (
        <div className="mt-2 border-t border-line pt-3">
          <div className="card mb-2 flex items-center justify-between p-3">
            <div className="min-w-0">
              <p className="text-[0.75rem] font-semibold text-mute">{t('debt.dueNow')}</p>
              <p className="tnum text-[1rem] font-extrabold" style={{ color: net.settled ? 'var(--ok)' : net.theyOweUs ? 'var(--ok)' : 'var(--bad)' }}>
                {formatMoney(net.amount)}
                <span className="ml-1.5 text-[0.6875rem] font-medium text-mute">
                  {net.settled ? t('debt.settled') : net.theyOweUs ? t('debt.theyOwe') : t('debt.weOwe')}
                </span>
              </p>
              <p className="mt-0.5 text-[0.6875rem] text-mute">
                {t('debt.statsPaid')}: {formatMoney(stats.paid)} · {stats.payments} {t('debt.statsPayments')}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => openSheet(`/debts/${id}`)}>
              <HandCoins size={15} strokeWidth={1.5} /> {t('debt.ledger')}
            </button>
          </div>
        </div>
      )}

      {confirmDel && id && (
        <ConfirmDialog title={t('common.delete')} text={t('customers.deleteConfirm')} danger
          onConfirm={() => void del()}
          onCancel={() => setConfirmDel(false)} />
      )}
    </Sheet>
  );
}
