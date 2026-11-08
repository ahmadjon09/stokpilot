import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Check, Plus, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, uid, type Customer } from '../../db/db';
import { saveCustomer } from '../../db/actions';
import { debtView } from '../../shared/lib/debt';
import { formatMoney } from '../../shared/lib/format';
import { buzz, toast } from '../../shared/lib/misc';

export interface SupplierPickerProps {
  /** Tanlangan yetkazib beruvchi ID ('' — tanlanmagan) */
  value: string;
  onChange: (supplierId: string) => void;
  label?: string;
  hint?: string;
  /** Majburiy — bo'sh bo'lsa ogohlantirish ko'rsatiladi */
  required?: boolean;
  error?: string | null;
  /** Ro'yxat balandligi (mobil uchun ixcham) */
  maxHeight?: number;
}

/**
 * Yetkazib beruvchi tanlash + shu yerda tez yaratish.
 *
 * Nega alohida komponent: bir xil oqim uch joyda kerak —
 *  1) Mahsulot qo'shish/tahrirlash (asosiy yetkazib beruvchi);
 *  2) Zaxira → kirim (partiya manbasi);
 *  3) Zaxira → qarzga kirim.
 *
 * UX (savatdagi `QuickCustomer` bilan bir xil mantiq):
 *  - qidiruv bilan mavjud yetkazib beruvchini tanlash;
 *  - yoki "Yangi" — faqat nom (telefon ixtiyoriy). Yozuv DARHOL bazaga
 *    tushadi, chunki bu yerda "bekor qilinsa yo'q bo'lsin" talabi yo'q:
 *    foydalanuvchi ataylab yangi kontragent yaratyapti.
 *  - Har bir qatorda joriy qarz ko'rsatiladi — rang standarti bo'yicha
 *    (zangor = biz qarzdormiz).
 */
export default function SupplierPicker({
  value, onChange, label, hint, required, error, maxHeight = 176,
}: SupplierPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const suppliers = useLiveQuery(
    () => db.customers.where('kind').equals('supplier').toArray(),
    [],
  );

  const filtered = useMemo(() => {
    const list = (suppliers ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const s = query.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s));
  }, [suppliers, query]);

  const selected = (suppliers ?? []).find((c) => c.id === value);

  const createSupplier = async () => {
    const name = newName.trim();
    if (name.length < 2) { buzz(30); return; }
    setBusy(true);
    try {
      const rec: Customer = {
        id: uid(),
        name,
        phone: newPhone.trim(),
        kind: 'supplier',
        balance: 0,
        note: '',
        createdAt: Date.now(),
      };
      // `saveCustomer` balansni ham, daftar yozuvini ham o'zi boshqaradi
      await saveCustomer(rec);
      onChange(rec.id);
      setCreating(false);
      setNewName('');
      setNewPhone('');
      setQuery('');
      buzz(14);
      toast(t('supplier.created'));
    } catch {
      toast(t('common.error'));
      buzz(30);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="field-label">
        {label ?? t('supplier.pickSupplier')}
        {required && <span className="text-bad"> *</span>}
      </span>

      {/* Tanlangan / tanlash tugmasi */}
      {selected && !creating ? (
        <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
          style={{ background: 'var(--surface2)', minHeight: 44 }}>
          <Building2 size={16} strokeWidth={1.5} className="flex-none" style={{ color: 'var(--debt-supplier)' }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.875rem] font-semibold">{selected.name}</span>
            <SupplierBalance supplier={selected} />
          </span>
          <button
            type="button"
            className="icon-btn flex-none"
            aria-label={t('common.clear')}
            onClick={() => { buzz(6); onChange(''); }}
            style={{ width: 32, height: 32 }}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      ) : creating ? (
        <div className="space-y-2">
          <input
            className={'input' + (newName.trim().length > 0 && newName.trim().length < 2 ? ' input-err' : '')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('supplier.namePh')}
            aria-label={t('supplier.newSupplier')}
            autoFocus
            maxLength={80}
          />
          <input
            className="input"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            inputMode="tel"
            aria-label={t('common.phone')}
            maxLength={24}
          />
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm flex-1" style={{ minHeight: 38 }}
              onClick={() => { setCreating(false); setNewName(''); setNewPhone(''); }}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm flex-1"
              style={{ minHeight: 38 }}
              disabled={busy || newName.trim().length < 2}
              onClick={() => void createSupplier()}
            >
              <Check size={15} strokeWidth={1.5} /> {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input
                className={'input pl-8' + (error ? ' input-err' : '')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('supplier.searchPh')}
                aria-label={t('common.search')}
                inputMode="search"
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm flex-none"
              style={{ minHeight: 44 }}
              onClick={() => { buzz(8); setCreating(true); }}
              aria-label={t('supplier.newSupplier')}
            >
              <Plus size={15} strokeWidth={1.5} />
            </button>
          </div>

          {/* Ro'yxat — balandligi cheklangan, sahifa cho'zilib ketmasligi uchun */}
          <div
            className="mt-2 overflow-y-auto overscroll-contain rounded-md border border-line"
            style={{ maxHeight, background: 'var(--surface)' }}
          >
            {suppliers === undefined ? (
              <p className="px-3 py-3 text-center text-[0.75rem] text-mute">{t('common.loading')}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-[0.75rem] text-mute">{t('supplier.empty')}</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-line px-2.5 py-2 text-left transition last:border-b-0 hover:bg-card2"
                  style={{ background: value === c.id ? 'var(--accent-soft)' : undefined, minHeight: 44 }}
                  onClick={() => { buzz(6); onChange(c.id); }}
                  aria-pressed={value === c.id}
                >
                  <Building2 size={15} strokeWidth={1.5} className="flex-none text-mute" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-semibold">{c.name}</span>
                    <SupplierBalance supplier={c} />
                  </span>
                  {value === c.id && <Check size={15} strokeWidth={2} className="flex-none text-accent" />}
                </button>
              ))
            )}
          </div>
        </>
      )}

      {error ? <span className="field-error" role="alert">{error}</span>
        : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/** Qarz holati — rang standarti bo'yicha (zangor = biz qarzdormiz) */
function SupplierBalance({ supplier }: { supplier: Customer }) {
  const { t } = useTranslation();
  const view = debtView(supplier.balance, supplier.kind);
  if (view.settled) {
    return <span className="block text-[0.6875rem] text-mute">{t('debt.settled')}</span>;
  }
  return (
    <span className="tnum block text-[0.6875rem] font-semibold" style={{ color: view.color }}>
      {t(view.sideKey)}: {formatMoney(view.amount)}
    </span>
  );
}
