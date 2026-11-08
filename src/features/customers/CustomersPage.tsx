import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Building2, HandCoins, UserRound, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/db';
import { partyNet } from '../../db/ledger';
import { formatMoney, round2 } from '../../shared/lib/format';
import { EmptyState, Segmented } from '../../shared/ui/bits';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz } from '../../shared/lib/misc';

export default function CustomersPage() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'customer' | 'supplier'>('all');

  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];

  const list = useMemo(
    () => customers.filter((c) => filter === 'all' || c.kind === filter).sort((a, b) => a.name.localeCompare(b.name)),
    [customers, filter]
  );

  /** Qarz jamlanmasi — kind bo'yicha (belgi konvensiyasi uchun `partyNet`) */
  const totals = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    for (const c of customers) {
      const n = partyNet(c.balance);
      if (n.settled) continue;
      if (n.theyOweUs) receivable = round2(receivable + n.amount);
      else payable = round2(payable + n.amount);
    }
    return { receivable, payable };
  }, [customers]);

  return (
    <div className="space-y-3">
      <div className="hidden md:block">
        <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('customers.title')}</h1>
      </div>

      <Segmented value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('common.all') },
        { value: 'customer', label: t('customers.kind.customer') },
        { value: 'supplier', label: t('customers.kind.supplier') },
      ]} />

      {/* Qarz jamlanmasi + qarz daftariga o'tish */}
      <div className="card flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.totalReceivable')}</p>
          <p className="tnum text-[0.875rem] font-bold" style={{ color: 'var(--ok)' }}>{formatMoney(totals.receivable)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-mute">{t('debt.totalPayable')}</p>
          <p className="tnum text-[0.875rem] font-bold" style={{ color: 'var(--bad)' }}>{formatMoney(totals.payable)}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => navigate('/debts')}>
          <HandCoins size={15} strokeWidth={1.5} /> {t('debt.viewAll')}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title={t('customers.empty')} hint={t('customers.emptyHint')}
            action={<button type="button" className="btn btn-primary" onClick={() => openSheet('/customers/new')}>{t('customers.new')}</button>} />
        </div>
      ) : (
        <div className="card row-list overflow-hidden">
          {list.map((c) => (
            <button key={c.id} type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-card2"
              style={{ minHeight: 58 }}
              onClick={() => { buzz(6); openSheet(`/customers/${c.id}/edit`); }}>
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full" style={{ background: 'var(--accent-soft)' }}>
                {c.kind === 'customer'
                  ? <UserRound size={17} strokeWidth={1.5} className="text-accent" />
                  : <Building2 size={17} strokeWidth={1.5} className="text-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9062rem] font-semibold">{c.name}</span>
                <span className="block truncate text-[0.75rem] text-mute">{c.phone || t('customers.kind.' + c.kind)}</span>
              </span>
              {(() => {
                const n = partyNet(c.balance);
                if (n.settled) return null;
                return (
                  <span className="flex-none text-right">
                    <span className="tnum block text-[0.875rem] font-bold" style={{ color: n.theyOweUs ? 'var(--ok)' : 'var(--bad)' }}>
                      {formatMoney(n.amount)}
                    </span>
                    <span className="block text-[0.6875rem] text-mute">
                      {n.theyOweUs ? t('customers.owes') : t('customers.weOwe')}
                    </span>
                  </span>
                );
              })()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
