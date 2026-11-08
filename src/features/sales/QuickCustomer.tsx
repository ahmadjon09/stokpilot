import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserPlus, UserRound, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Customer } from '../../db/db';
import { formatMoney, round2 } from '../../shared/lib/format';
import { partyNet } from '../../db/ledger';
import NumberInput from '../../shared/ui/NumberInput';
import { Segmented } from '../../shared/ui/bits';

export type QuickCustomerMode = 'existing' | 'new';

export interface QuickCustomerValue {
  mode: QuickCustomerMode;
  customerId: string;
  name: string;
  phone: string;
  /** Nasiyada darhol to'langan avans */
  advance: number | null;
  /** Validatsiya holati — checkout tugmasini bloklash uchun */
  valid: boolean;
}

export const EMPTY_QUICK_CUSTOMER: QuickCustomerValue = {
  mode: 'existing', customerId: '', name: '', phone: '', advance: null, valid: false,
};

/** Telefon raqamining minimal ishonchli validatsiyasi (sintaksis, format emas) */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export interface QuickCustomerProps {
  value: QuickCustomerValue;
  onChange: (next: QuickCustomerValue) => void;
  /** Savatdagi jami — avans chegarasi va qarz ko'rinishi uchun */
  total: number;
}

/**
 * Savat ichida mijoz tanlash / yangi mijoz yaratish (Task 3).
 *
 * Nasiya (qarz) tanlanganda ko'rinadi:
 *  - mavjud mijozni tanlash (qidiruv bilan);
 *  - yoki shu yerto'la "Yangi mijoz" — faqat ism va telefon. Mijoz bazaga
 *    checkout paytida (`completeSale`) atomar yoziladi, shuning uchun
 *    foydalanuvchi bekor qilsa bazada "bo'sh" mijoz qolmaydi.
 *
 * Avans maydoni — nasiyada darhol to'lanadigan qism; qolgani qarz bo'ladi.
 */
export default function QuickCustomer({ value, onChange, total }: QuickCustomerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const customers = useLiveQuery(
    () => db.customers.where('kind').equals('customer').toArray(),
    [],
  );

  const filtered = useMemo(() => {
    const list = (customers ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const s = query.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s));
  }, [customers, query]);

  /** Validatsiyani yuqoriga uzatamiz — checkout shu holatga qarab bloklanadi */
  const patch = (p: Partial<QuickCustomerValue>) => {
    const next: QuickCustomerValue = { ...value, ...p };
    next.valid = next.mode === 'new'
      ? next.name.trim().length >= 2 && (!next.phone.trim() || isValidPhone(next.phone))
      : Boolean(next.customerId);
    onChange(next);
  };

  const selected = value.mode === 'existing'
    ? (customers ?? []).find((c) => c.id === value.customerId)
    : undefined;

  const advance = round2(Math.min(Math.max(value.advance ?? 0, 0), total));
  const debt = round2(total - advance);

  return (
    <div className="space-y-2.5 rounded-lg border border-line p-2.5" style={{ background: 'var(--surface2)' }}>
      <Segmented
        value={value.mode}
        onChange={(mode) => patch({ mode, valid: mode === 'new' ? value.name.trim().length >= 2 : Boolean(value.customerId) })}
        options={[
          { value: 'existing', label: t('quickCust.pick'), icon: Users },
          { value: 'new', label: t('quickCust.new'), icon: UserPlus },
        ]}
      />

      {value.mode === 'existing' ? (
        <div className="space-y-2">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('debt.searchPh')}
            aria-label={t('common.search')}
            inputMode="search"
          />
          {/* Ro'yxat balandligi cheklangan — savat paneli cho'zilib ketmasligi uchun */}
          <div className="max-h-40 overflow-y-auto overscroll-contain rounded-md border border-line"
            style={{ background: 'var(--surface)' }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-[0.75rem] text-mute">{t('customers.empty')}</p>
            ) : (
              filtered.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  selected={value.customerId === c.id}
                  onPick={() => patch({ customerId: c.id })}
                />
              ))
            )}
          </div>

          {selected && selected.balance !== 0 && (
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
              {t('debt.dueNow')}: {formatMoney(Math.abs(selected.balance))}
              {' · '}
              {partyNet(selected.balance).theyOweUs ? t('debt.theyOwe') : t('debt.weOwe')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[0.6875rem] font-semibold text-mute" htmlFor="qc-name">
              {t('quickCust.name')} <span className="text-bad">*</span>
            </label>
            <input
              id="qc-name"
              className={'input' + (value.name.trim().length > 0 && value.name.trim().length < 2 ? ' input-err' : '')}
              value={value.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t('quickCust.namePh')}
              autoComplete="name"
              maxLength={80}
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.6875rem] font-semibold text-mute" htmlFor="qc-phone">
              {t('quickCust.phone')}
            </label>
            <input
              id="qc-phone"
              className={'input' + (value.phone.trim() && !isValidPhone(value.phone) ? ' input-err' : '')}
              value={value.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              placeholder="+998 90 123 45 67"
              inputMode="tel"
              autoComplete="tel"
              maxLength={24}
            />
            {value.phone.trim() !== '' && !isValidPhone(value.phone) && (
              <span className="field-error">{t('quickCust.errPhone')}</span>
            )}
          </div>
          <p className="text-[0.6875rem] leading-snug text-mute">{t('quickCust.hint')}</p>
        </div>
      )}

      {/* Avans: nasiyada darhol to'lanadigan qism */}
      <div>
        <label className="mb-1 block text-[0.6875rem] font-semibold text-mute" htmlFor="qc-advance">
          {t('quickCust.advance')}
        </label>
        <NumberInput
          value={value.advance}
          onChange={(v) => patch({ advance: v })}
          placeholder="0"
          ariaLabel={t('quickCust.advance')}
        />
        <p className="mt-1 flex items-center justify-between text-[0.6875rem]">
          <span className="text-mute">{t('quickCust.advanceHint')}</span>
          <span className="tnum font-bold" style={{ color: debt > 0 ? 'var(--bad)' : 'var(--ok)' }}>
            {t('quickCust.debtWillBe')}: {formatMoney(debt)}
          </span>
        </p>
      </div>
    </div>
  );
}

function CustomerRow({ customer, selected, onPick }: {
  customer: Customer; selected: boolean; onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className="flex w-full items-center gap-2 border-b border-line px-2.5 py-2 text-left transition last:border-b-0"
      style={{ background: selected ? 'var(--accent-soft)' : undefined }}
    >
      <UserRound size={15} strokeWidth={1.5} className={selected ? 'text-accent' : 'text-mute'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-semibold">{customer.name}</span>
        {customer.phone && <span className="block truncate text-[0.6875rem] text-mute">{customer.phone}</span>}
      </span>
      {customer.balance !== 0 && (
        <span className="tnum flex-none text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
          {formatMoney(Math.abs(customer.balance))}
        </span>
      )}
    </button>
  );
}
