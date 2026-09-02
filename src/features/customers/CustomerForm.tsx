import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, uid, type Customer } from '../../db/db';
import { formatDateTime, formatMoney } from '../../shared/lib/format';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';
import NumberInput from '../../shared/ui/NumberInput';
import { ConfirmDialog, Field, Segmented } from '../../shared/ui/bits';

export default function CustomerFormSheet() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const hasBackground = Boolean((location.state as { background?: unknown } | null)?.background);
  const close = () => { if (hasBackground) navigate(-1); else navigate('/customers'); };

  const existing = useLiveQuery(async () => (id ? db.customers.get(id) : undefined), [id]);
  const salesHistory = useLiveQuery(
    async () => (id ? db.sales.where('customerId').equals(id).reverse().sortBy('createdAt') : []),
    [id]
  ) ?? [];

  const loadedRef = useRef(false);
  const [form, setForm] = useState<{ name: string; phone: string; kind: 'customer' | 'supplier'; balance: number | null; note: string }>({
    name: '', phone: '', kind: 'customer', balance: null, note: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!isEdit || loadedRef.current || !existing) return;
    loadedRef.current = true;
    setForm({ name: existing.name, phone: existing.phone, kind: existing.kind, balance: existing.balance || null, note: existing.note });
  }, [isEdit, existing]);

  const save = async () => {
    if (!form.name.trim()) { setErr(t('customers.errName')); buzz(30); return; }
    const rec: Customer = {
      id: id ?? uid(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      kind: form.kind,
      balance: form.balance ?? 0,
      note: form.note.trim(),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await db.customers.put(rec);
    toast(t('settings.saved'));
    buzz(14);
    close();
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
          <button type="button" className="btn btn-primary" onClick={() => void save()}>{t('common.save')}</button>
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

      {isEdit && salesHistory.length > 0 && (
        <div className="mt-2 border-t border-line pt-3">
          <p className="mb-2 text-[0.8125rem] font-bold text-mute">{t('customers.history')}</p>
          <div className="card row-list overflow-hidden">
            {salesHistory.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-[0.8125rem]">
                <span className="tnum text-mute">#{s.number} · {formatDateTime(s.createdAt)}</span>
                <span className="tnum font-bold">{formatMoney(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmDel && id && (
        <ConfirmDialog title={t('common.delete')} text={t('customers.deleteConfirm')} danger
          onConfirm={() => { void db.customers.delete(id).then(() => close()); }}
          onCancel={() => setConfirmDel(false)} />
      )}
    </Sheet>
  );
}
