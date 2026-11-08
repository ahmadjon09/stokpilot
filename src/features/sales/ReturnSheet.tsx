import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Sale, SaleItem } from '../../db/db';
import { returnItems } from '../../db/actions';
import { planReturn, remainingQty, type ReturnSelection } from '../../db/returns';
import { formatMoney, formatNumber, round2 } from '../../shared/lib/format';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';

export interface ReturnSheetProps {
  sale: Sale;
  onClose: () => void;
  /** Muvaffaqiyatli qaytarishdan keyin — yangilangan chek ID'si beriladi */
  onDone?: (saleId: string) => void;
}

/**
 * Qismli (donalab) qaytarish oynasi.
 *
 * UX qarorlari (mobil uchun):
 *  - Har bir satr mustaqil karta: −/+ stepper, "Hammasi" va to'g'ridan-to'g'ri
 *    miqdor kiritish. Tugmalar 44px — barmoq bilan xatosiz bosish uchun.
 *  - Miqdor HECH QACHON qoldiqdan oshmaydi: + tugmasi limitda o'chadi, kiritilgan
 *    qiymat esa avtomatik cheklanadi (`clamp`).
 *  - Tasodifan butun chekni qaytarib yubormaslik uchun: "Hammasini belgilash"
 *    alohida tugma va tasdiqlashda tanlov yig'indisi ko'rsatiladi.
 *  - Yakuniy panel (footer) scroll'dan tashqarida — summa va tugma doim ko'rinadi.
 */
export default function ReturnSheet({ sale, onClose, onDone }: ReturnSheetProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ReturnSelection>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(() => planReturn(sale, selection), [sale, selection]);
  const selectedLines = plan.lines.length;

  const setQty = (index: number, value: number) => {
    setError(null);
    setSelection((prev) => {
      const item = sale.items[index];
      const max = remainingQty(item);
      const next = { ...prev };
      const qty = round2(Math.min(Math.max(0, Number.isFinite(value) ? value : 0), max));
      if (qty <= 0) delete next[index];
      else next[index] = qty;
      return next;
    });
  };

  const selectAll = () => {
    buzz(8);
    setError(null);
    const next: ReturnSelection = {};
    sale.items.forEach((it, i) => {
      const max = remainingQty(it);
      if (max > 0) next[i] = max;
    });
    setSelection(next);
  };

  const clearAll = () => { buzz(6); setError(null); setSelection({}); };

  const submit = async () => {
    if (busy) return;
    // Xatolarni UI'da ko'rsatamiz — hech narsa yozilmaydi
    if (plan.errors.length > 0) {
      setError(plan.errors[0]);
      buzz(30);
      return;
    }
    setBusy(true);
    try {
      await returnItems({ saleId: sale.id, selection, note: note.trim() });
      buzz(20);
      toast(t('sales.returnSuccess'));
      onDone?.(sale.id);
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      // Ma'lum xato kalitlarini tarjima qilamiz, qolganini umumiy xatoga aylantiramiz
      setError(msg.startsWith('sales.') ? msg : 'common.error');
      buzz(30);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('sales.returnTitle') + ' #' + sale.number}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selectedLines === 0 || plan.errors.length > 0}
            onClick={() => void submit()}
          >
            <RotateCcw size={16} strokeWidth={1.5} /> {t('sales.returnConfirm')}
          </button>
        </>
      }
    >
      {/* Tanlov boshqaruvi */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.8125rem] font-bold text-mute">{t('sales.returnSelect')}</p>
        <div className="flex gap-1.5">
          <button type="button" className="chip" style={{ minHeight: 32, padding: '0 10px' }} onClick={clearAll}>
            {t('sales.returnNone')}
          </button>
          <button type="button" className="chip" style={{ minHeight: 32, padding: '0 10px' }} onClick={selectAll}>
            {t('sales.returnSelectAll')}
          </button>
        </div>
      </div>
      <p className="mb-3 text-[0.7188rem] text-mute">{t('sales.returnPickHint')}</p>

      {/* Satrlar */}
      <div className="space-y-2">
        {sale.items.map((item, index) => (
          <ReturnRow
            key={`${item.productId}-${index}`}
            item={item}
            index={index}
            value={selection[index] ?? 0}
            onChange={(v) => setQty(index, v)}
            onMax={() => setQty(index, remainingQty(item))}
          />
        ))}
      </div>

      {/* Izoh */}
      <div className="mt-3">
        <label className="field-label" htmlFor="ret-note">{t('sales.returnNote')}</label>
        <textarea
          id="ret-note"
          className="input"
          rows={2}
          maxLength={200}
          value={note}
          placeholder={t('sales.returnNotePh')}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Yakuniy hisob */}
      {selectedLines > 0 && (
        <div className="card mt-3 space-y-1.5 p-3 text-[0.8125rem]">
          <div className="flex justify-between font-bold">
            <span>{t('sales.returnSummary')}</span>
            <span className="tnum text-[1rem]">{formatMoney(plan.amount)}</span>
          </div>
          {sale.payType === 'debt' && (
            <>
              {plan.debtReduced > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--ok)' }}>
                  <span>{t('sales.returnDebtReduced')}</span>
                  <span className="tnum">−{formatMoney(plan.debtReduced)}</span>
                </div>
              )}
              {round2(plan.amount - plan.debtReduced) > 0 && (
                <div className="flex justify-between text-mute">
                  <span>{t('sales.returnCashRefund')}</span>
                  <span className="tnum">{formatMoney(round2(plan.amount - plan.debtReduced))}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between text-mute">
            <span>{t('sales.returnRemainingTotal')}</span>
            <span className="tnum">{formatMoney(plan.remainingTotal)}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--bad)' }} role="alert">
          <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 flex-none" />
          {t(error)}
        </p>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/*  Bitta satr                                                             */
/* ---------------------------------------------------------------------- */

function ReturnRow({ item, index, value, onChange, onMax }: {
  item: SaleItem;
  index: number;
  value: number;
  onChange: (v: number) => void;
  onMax: () => void;
}) {
  const { t } = useTranslation();
  const max = remainingQty(item);
  const already = item.returnedQty ?? 0;
  const disabled = max <= 0;
  const active = value > 0;

  return (
    <div
      className="rounded-xl border p-2.5 transition"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.875rem] font-semibold">{item.name}</p>
          <p className="tnum text-[0.7188rem] text-mute">
            {formatMoney(item.price)} × {formatNumber(item.qty)} {t('products.unit.' + item.unit)}
            {' · '}
            {t('sales.returnSold')}: {formatNumber(item.qty)}
            {already > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--warn)' }}>
                  {t('sales.returnAlready')}: {formatNumber(already)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex-none text-right">
          <p className="tnum text-[0.6875rem] text-mute">{t('sales.returnRemaining')}</p>
          <p className="tnum text-[0.875rem] font-bold" style={{ color: disabled ? 'var(--muted)' : 'var(--text)' }}>
            {formatNumber(max)}
          </p>
        </div>
      </div>

      {disabled ? (
        <p className="mt-1.5 flex items-center gap-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
          <Check size={11} strokeWidth={2.5} /> {t('sales.returnAlready')}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          {/* − / + stepper */}
          <button
            type="button"
            className="icon-btn"
            style={{ width: 40, height: 40, background: 'var(--surface2)' }}
            aria-label={`${t('sales.returnQty')} −1`}
            disabled={value <= 0}
            onClick={() => { buzz(6); onChange(round2(value - 1)); }}
          >
            <Minus size={15} strokeWidth={1.5} />
          </button>

          {/* To'g'ridan-to'g'ri kiritish (o'nlik birliklar uchun ham) */}
          <input
            className="input tnum text-center"
            style={{ width: 74, minHeight: 40, padding: '0 6px' }}
            value={value > 0 ? String(value) : ''}
            placeholder="0"
            inputMode="decimal"
            aria-label={`${t('sales.returnQty')} — ${item.name}`}
            id={`ret-qty-${index}`}
            onChange={(e) => {
              const raw = e.target.value.replace(',', '.');
              // Bo'sh maydon = 0; noto'g'ri kiritish e'tiborsiz qoldiriladi
              if (raw.trim() === '') { onChange(0); return; }
              const n = Number(raw);
              if (Number.isFinite(n)) onChange(n);
            }}
          />

          <button
            type="button"
            className="icon-btn"
            style={{ width: 40, height: 40, background: 'var(--surface2)' }}
            aria-label={`${t('sales.returnQty')} +1`}
            disabled={value >= max}
            onClick={() => { buzz(6); onChange(round2(Math.min(max, value + 1))); }}
          >
            <Plus size={15} strokeWidth={1.5} />
          </button>

          {/* Tez tanlov: hammasi */}
          <button
            type="button"
            className="chip ml-auto"
            style={{ minHeight: 34 }}
            aria-pressed={value >= max}
            onClick={() => { buzz(6); onMax(); }}
          >
            {t('sales.returnAll')}
          </button>
        </div>
      )}
    </div>
  );
}
