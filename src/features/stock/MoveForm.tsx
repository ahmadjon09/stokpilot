import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyMove } from '../../db/actions';
import { formatNumber } from '../../shared/lib/format';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';
import NumberInput from '../../shared/ui/NumberInput';
import ProductPicker from '../../shared/ui/ProductPicker';
import { Field, Segmented } from '../../shared/ui/bits';
import type { Product } from '../../db/db';

type MoveKind = 'in' | 'out' | 'recount';

export default function MoveFormSheet() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const hasBackground = Boolean((location.state as { background?: unknown } | null)?.background);
  const close = () => { if (hasBackground) navigate(-1); else navigate('/stock'); };

  const [product, setProduct] = useState<Product | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kind, setKind] = useState<MoveKind>('in');
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!product) { setErr(t('common.selectProduct')); buzz(30); return; }
    if (qty == null) { setErr(t('common.required')); buzz(30); return; }
    try {
      await applyMove({ productId: product.id, type: kind, qty, note: note.trim() });
      toast(t('stock.saved'));
      buzz(14);
      close();
    } catch {
      setErr(t('common.error'));
    }
  };

  return (
    <Sheet
      title={t('stock.newMove')}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>{t('common.save')}</button>
        </>
      }
    >
      <Field label={t('common.selectProduct')} required error={!product ? err : null}>
        <button type="button" className="input flex items-center justify-between text-left" onClick={() => setPickerOpen(true)}>
          <span className={product ? '' : 'text-mute'}>{product ? product.name : t('common.selectProduct')}</span>
          {product && <span className="tnum text-[0.8125rem] text-mute">{formatNumber(product.stock)} {t('products.unit.' + product.unit)}</span>}
        </button>
      </Field>

      <Field label={t('stock.type')}>
        <Segmented value={kind} onChange={(v) => { setKind(v); setQty(null); }} options={[
          { value: 'in', label: t('stock.type.in') },
          { value: 'out', label: t('stock.type.out') },
          { value: 'recount', label: t('stock.type.recount') },
        ]} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {kind === 'recount' && product && (
          <Field label={t('stock.currentStock')}>
            <div className="input flex items-center bg-card2 text-mute" aria-readonly>
              {formatNumber(product.stock)} {t('products.unit.' + product.unit)}
            </div>
          </Field>
        )}
        <Field label={kind === 'recount' ? t('stock.newCount') : t('common.qty')} required error={product ? err : null}>
          <NumberInput value={qty} onChange={setQty} decimals={2} placeholder="0" ariaLabel={t('common.qty')} />
        </Field>
      </div>

      <Field label={t('common.note')}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('stock.notePh')} />
      </Field>

      {pickerOpen && (
        <ProductPicker
          title={t('common.selectProduct')}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => { setProduct(p); setPickerOpen(false); setErr(null); }}
        />
      )}
    </Sheet>
  );
}
