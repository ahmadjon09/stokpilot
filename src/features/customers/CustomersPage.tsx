import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, UserRound, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/db';
import { formatMoney } from '../../shared/lib/format';
import { EmptyState, Segmented } from '../../shared/ui/bits';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz } from '../../shared/lib/misc';

export default function CustomersPage() {
  const { t } = useTranslation();
  const openSheet = useOpenSheet();
  const [filter, setFilter] = useState<'all' | 'customer' | 'supplier'>('all');

  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];

  const list = useMemo(
    () => customers.filter((c) => filter === 'all' || c.kind === filter).sort((a, b) => a.name.localeCompare(b.name)),
    [customers, filter]
  );

  return (
    <div className="space-y-3">
      <div className="hidden md:block">
        <h1 className="text-[22px] font-extrabold tracking-tight">{t('customers.title')}</h1>
      </div>

      <Segmented value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('common.all') },
        { value: 'customer', label: t('customers.kind.customer') },
        { value: 'supplier', label: t('customers.kind.supplier') },
      ]} />

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
                <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
                <span className="block truncate text-[12px] text-mute">{c.phone || t('customers.kind.' + c.kind)}</span>
              </span>
              {c.balance !== 0 && (
                <span className="text-right">
                  <span className="tnum block text-[14px] font-bold" style={{ color: c.balance > 0 ? 'var(--bad)' : 'var(--ok)' }}>
                    {formatMoney(Math.abs(c.balance))}
                  </span>
                  <span className="block text-[11px] text-mute">{c.balance > 0 ? t('customers.owes') : t('customers.weOwe')}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
