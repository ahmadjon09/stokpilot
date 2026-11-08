import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import type { Customer, LedgerDirection, PayType } from '../../db/db';
import { adjustDebt, recordPayment } from '../../db/actions';
import { ledgerDelta, partyNet } from '../../db/ledger';
import { debtTint, debtView } from '../../shared/lib/debt';
import { formatMoney, round2 } from '../../shared/lib/format';
import { buzz, toast } from '../../shared/lib/misc';
import NumberInput from '../../shared/ui/NumberInput';
import { Field, Segmented } from '../../shared/ui/bits';
import Sheet from '../../shared/ui/Sheet';

export type PaymentMode = 'payment' | 'charge';

export interface PaymentSheetProps {
  party: Customer;
  /** 'payment' — to'lov (qarz kamayadi), 'charge' — qarz oshirish */
  mode: PaymentMode;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * To'lov / qarz kiritish oynasi.
 *
 * Mijoz ham, yetkazib beruvchi ham shu bitta komponentdan foydalanadi —
 * farq faqat matnda ("To'lov qabul qilish" / "To'lov qilish"). Summa,
 * usul va izoh kiritiladi; `recordPayment`/`adjustDebt` orqali daftarga
 * atomar yoziladi.
 */
export default function PaymentSheet({ party, mode, onClose, onSaved }: PaymentSheetProps) {
  const { t } = useTranslation();
  const net = partyNet(party.balance);
  const view = debtView(party.balance, party.kind);
  const isSupplier = party.kind === 'supplier';

  const [direction, setDirection] = useState<LedgerDirection>(mode === 'charge' ? 'charge' : 'payment');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PayType>('cash');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * Saqlashdan oldin qoldiqni ko'rsatamiz. Hisob `ledgerDelta` bilan bir xil
   * bo'lishi SHART — aks holda foydalanuvchi ko'rgan raqam keyin o'zgarib
   * ketadi. Shu sababli yagona manbadan foydalanamiz.
   */
  const after = useMemo(
    () => round2(party.balance + ledgerDelta(direction, amount ?? 0, party.kind)),
    [amount, direction, party.balance, party.kind],
  );

  const save = async () => {
    const value = round2(amount ?? 0);
    if (!(value > 0)) { setErr(t('debt.errAmount')); buzz(30); return; }
    if (direction === 'payment' && value > net.amount + 0.001) {
      setErr(t('debt.errTooMuch') + '. ' + t('debt.errTooMuchHint'));
      buzz(30);
      return;
    }
    setBusy(true);
    try {
      if (direction === 'payment') {
        await recordPayment({ partyId: party.id, amount: value, note, method });
      } else {
        await adjustDebt({ partyId: party.id, amount: value, direction: 'charge', note });
      }
      toast(t('debt.saved'));
      buzz(16);
      onSaved?.();
      onClose();
    } catch {
      toast(t('common.error'));
      buzz(30);
    } finally {
      setBusy(false);
    }
  };

  const title = direction === 'charge'
    ? t('debt.addDebt')
    : isSupplier ? t('debt.makePayment') : t('debt.takePayment');

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            <Check size={17} strokeWidth={1.5} /> {t('common.save')}
          </button>
        </>
      }
    >
      {/* Kontragent va joriy qarz */}
      <div className="card mb-3 flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-bold">{party.name}</p>
          <p className="text-[0.75rem] text-mute">
            {net.settled
              ? t('debt.settled')
              : isSupplier ? t('debt.weOwe') : t('debt.theyOwe')}
          </p>
        </div>
        <div className="flex-none rounded-lg px-2 py-1 text-right" style={{ background: debtTint(view.color, 10) }}>
          <p className="tnum text-[1.0625rem] font-extrabold" style={{ color: view.color }}>
            {formatMoney(net.amount)}
          </p>
          <p className="text-[0.625rem] uppercase tracking-wide text-mute">{t('debt.dueNow')}</p>
        </div>
      </div>

      {/* Rejim tanlash — to'lov yoki qarz qo'shish */}
      <Field label={t('debt.title')}>
        <Segmented
          value={direction}
          onChange={(v) => { setDirection(v); setErr(null); setAmount(null); }}
          options={[
            { value: 'payment', label: isSupplier ? t('debt.makePayment') : t('debt.takePayment'), icon: ArrowDownLeft },
            { value: 'charge', label: t('debt.addDebt'), icon: ArrowUpRight },
          ]}
        />
      </Field>

      <Field
        label={direction === 'payment' ? t('debt.paymentAmount') : t('debt.amount')}
        required
        error={err}
        hint={direction === 'payment' && !net.settled ? `${t('debt.dueNow')}: ${formatMoney(net.amount)}` : undefined}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <NumberInput
              value={amount}
              onChange={(v) => { setAmount(v); setErr(null); }}
              placeholder="0"
              ariaLabel={t('debt.paymentAmount')}
              autoFocus
            />
          </div>
          {direction === 'payment' && net.amount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm flex-none"
              onClick={() => { buzz(6); setAmount(net.amount); setErr(null); }}
            >
              {t('debt.payFull')}
            </button>
          )}
        </div>
      </Field>

      {/* To'lov usuli — faqat to'lovda ma'noga ega */}
      {direction === 'payment' && (
        <Field label={t('debt.paymentMethod')}>
          <Segmented
            value={method}
            onChange={setMethod}
            options={[
              { value: 'cash', label: t('sales.pay.cash') },
              { value: 'card', label: t('sales.pay.card') },
              { value: 'transfer', label: t('sales.pay.transfer') },
            ]}
          />
        </Field>
      )}

      <Field label={t('debt.paymentNote')}>
        <textarea
          className="input"
          rows={2}
          value={note}
          maxLength={200}
          placeholder={t('debt.paymentNote')}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {/* Natija ko'rinishi — saqlashdan oldin qoldiqni ko'rsatamiz */}
      {(amount ?? 0) > 0 && (
        <div className="card space-y-1 p-3 text-[0.8125rem]">
          <div className="flex justify-between text-mute">
            <span>{t('debt.dueNow')}</span>
            <span className="tnum">{formatMoney(net.amount)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>{t('debt.balanceAfter')}</span>
            <span className="tnum" style={{ color: Math.sign(after) === Math.sign(party.balance) ? 'var(--text)' : 'var(--warn)' }}>
              {formatMoney(Math.abs(after))}
              <span className="ml-1 text-[0.6875rem] font-medium text-mute">
                {after === 0 ? '' : (after > 0 ? t('debt.theyOwe') : t('debt.weOwe'))}
              </span>
            </span>
          </div>
        </div>
      )}
    </Sheet>
  );
}
