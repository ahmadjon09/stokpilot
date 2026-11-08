import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, ChevronRight, HandCoins, Search, UserRound, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Customer } from '../../db/db';
import { debtTotals, debtTint, debtView } from '../../shared/lib/debt';
import { formatMoney } from '../../shared/lib/format';
import { EmptyState, Segmented } from '../../shared/ui/bits';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz } from '../../shared/lib/misc';

type Filter = 'all' | 'customer' | 'supplier';

interface Row {
  party: Customer;
  view: ReturnType<typeof debtView>;
}

/**
 * "Qarzlar" bo'limi — mijoz va yetkazib beruvchi bo'yicha yagona ro'yxat.
 *
 * Yuqorida sof pozitsiya: qancha bizga qarzdor (receivable) va qancha biz
 * qarzdormiz (payable). Har bir qatorga bosilsa — qarz daftari (tarix +
 * to'lov kiritish) ochiladi.
 */
export default function DebtsPage() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const customers = useLiveQuery(() => db.customers.toArray(), []);

  const all: Row[] = useMemo(() => {
    const list = (customers ?? []).map((party) => ({ party, view: debtView(party.balance, party.kind) }));
    const s = q.trim().toLowerCase();
    return list
      .filter((r) => {
        if (filter !== 'all' && r.party.kind !== filter) return false;
        if (!s) return true;
        return r.party.name.toLowerCase().includes(s) || r.party.phone.includes(s);
      })
      // Qarzdorlar yuqorida, qarz summasi bo'yicha kamayish tartibida
      .sort((a, b) => {
        if (a.view.settled !== b.view.settled) return a.view.settled ? 1 : -1;
        return b.view.amount - a.view.amount;
      });
  }, [customers, filter, q]);

  /**
   * Sof pozitsiya — YAGONA `debtTotals()` funksiyasidan (CustomersPage,
   * Dashboard ham shundan foydalanadi). Ilgari har bir sahifa o'z siklini
   * yozardi va natijalar farq qilardi.
   */
  const totals = useMemo(() => debtTotals(customers ?? []), [customers]);

  const openParty = (id: string) => { buzz(6); openSheet(`/debts/${id}`); };

  return (
    <div className="space-y-3">
      <div className="hidden md:flex md:items-center md:justify-between">
        <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('debt.title')}</h1>
      </div>

      {/* Sof pozitsiya */}
      <div className="card p-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-mute">
            <Wallet size={14} strokeWidth={1.5} /> {t('debt.netPosition')}
          </span>
          <span
            className="tnum text-[1.125rem] font-extrabold"
            style={{ color: totals.net >= 0 ? 'var(--debt-customer)' : 'var(--debt-supplier)' }}
          >
            {formatMoney(Math.abs(totals.net))}
            <span className="ml-1 text-[0.625rem] font-medium text-mute">
              {totals.net > 0 ? t('debt.netInFavor') : totals.net < 0 ? t('debt.netAgainst') : ''}
            </span>
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface2)' }}>
            <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.totalReceivable')}</p>
            <p className="tnum mt-0.5 text-[0.875rem] font-bold" style={{ color: 'var(--debt-customer)' }}>{formatMoney(totals.receivable)}</p>
            <p className="text-[0.5937rem] text-mute">{totals.debtors} {t('debt.partiesCount')}</p>
          </div>
          <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface2)' }}>
            <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.totalPayable')}</p>
            <p className="tnum mt-0.5 text-[0.875rem] font-bold" style={{ color: 'var(--debt-supplier)' }}>{formatMoney(totals.payable)}</p>
            <p className="text-[0.5937rem] text-mute">{totals.creditors} {t('debt.partiesCount')}</p>
          </div>
        </div>
      </div>

      {/* Filtr + qidiruv */}
      <div className="space-y-2">
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: 'all', label: t('debt.filterAll') },
            { value: 'customer', label: t('debt.filterDebtors') },
            { value: 'supplier', label: t('debt.filterCreditors') },
          ]}
        />
        <div className="relative">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            className="input pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('debt.searchPh')}
            aria-label={t('common.search')}
            inputMode="search"
          />
        </div>
      </div>

      {customers === undefined ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 w-full" />)}
        </div>
      ) : all.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={HandCoins}
            title={q ? t('sales.nothingFound') : t('debt.empty')}
            hint={q ? t('sales.nothingFoundHint') : t('debt.emptyHint')}
          />
        </div>
      ) : (
        <div className="card row-list overflow-hidden">
          {all.map(({ party, view }) => (
            <button
              key={party.id}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-card2 active:bg-card2"
              style={{ minHeight: 60 }}
              onClick={() => openParty(party.id)}
            >
              <span
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full"
                style={{ background: debtTint(view.color, 14), color: view.color }}
              >
                {party.kind === 'customer'
                  ? <UserRound size={17} strokeWidth={1.5} />
                  : <Building2 size={17} strokeWidth={1.5} />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9062rem] font-semibold">{party.name}</span>
                <span className="block truncate text-[0.75rem] text-mute">
                  {party.phone || t('customers.kind.' + party.kind)}
                  {' · '}
                  {t(view.sideKey)}
                </span>
              </span>

              <span className="flex-none text-right">
                <span
                  className="tnum block text-[0.9375rem] font-extrabold"
                  style={{ color: view.color }}
                >
                  {view.settled ? '—' : `${view.sign}${formatMoney(view.amount)}`}
                </span>
              </span>
              <ChevronRight size={17} strokeWidth={1.5} className="flex-none text-mute" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
