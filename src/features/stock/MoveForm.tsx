import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, Coins, PackagePlus } from 'lucide-react';
import { applyMove, supplyFromSupplier } from '../../db/actions';
import { formatMoney, formatNumber, round2 } from '../../shared/lib/format';
import { useCloseSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';
import NumberInput from '../../shared/ui/NumberInput';
import ProductPicker from '../../shared/ui/ProductPicker';
import { Field, Segmented } from '../../shared/ui/bits';
import SupplierPicker from '../customers/SupplierPicker';
import type { Product } from '../../db/db';

type MoveKind = 'in' | 'supply' | 'out' | 'recount';

/**
 * Zaxira harakati formasi.
 *
 * `supply` (yangi) — yetkazib beruvchidan qabul qilish:
 *   majburiy: mahsulot, yetkazib beruvchi, miqdor;
 *   ixtiyoriy: dona tannarxi (bo'sh bo'lsa mahsulot tannarxi olinadi),
 *              "qarzga" belgisi → yetkazib beruvchiga qarz yoziladi.
 *
 * Qolgan turlar (`in`/`out`/`recount`) avvalgidek ishlaydi — regressiya yo'q.
 */
export default function MoveFormSheet() {
  const { t } = useTranslation();
  const close = useCloseSheet('/stock');

  const [product, setProduct] = useState<Product | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kind, setKind] = useState<MoveKind>('in');
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Faqat `supply` uchun
  const [supplierId, setSupplierId] = useState('');
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [onCredit, setOnCredit] = useState(true);
  const [updateCost, setUpdateCost] = useState(true);

  const isSupply = kind === 'supply';

  /** Yetkazib beruvchi uchun tannarx: kiritilgan yoki mahsulot tannarxi */
  const effectiveCost = unitCost != null && unitCost > 0 ? unitCost : (product?.cost ?? 0);
  const supplyTotal = round2((qty ?? 0) * effectiveCost);

  const save = async () => {
    setErr(null);
    if (!product) { setErr(t('common.selectProduct')); buzz(30); return; }
    if (qty == null) { setErr(t('common.required')); buzz(30); return; }

    setBusy(true);
    try {
      if (isSupply) {
        if (!supplierId) { setErr(t('supplier.required')); buzz(30); return; }
        if (!(qty > 0)) { setErr(t('stock.errQty')); buzz(30); return; }
        await supplyFromSupplier({
          productId: product.id,
          qty,
          supplierId,
          unitCost: effectiveCost || null,
          onCredit,
          note: note.trim(),
          updateCost,
        });
      } else {
        await applyMove({ productId: product.id, type: kind, qty, note: note.trim() });
      }
      toast(t('stock.saved'));
      buzz(14);
      close();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg === 'supplier_required' ? t('supplier.required')
        : msg === 'invalid_qty' ? t('stock.errQty')
          : t('common.error'));
      buzz(30);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={isSupply ? t('stock.receiveTitle') : t('stock.newMove')}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            <Check size={17} strokeWidth={1.5} /> {t('common.save')}
          </button>
        </>
      }
    >
      <Field label={t('stock.type')}>
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v);
            setQty(null);
            setErr(null);
            if (v !== 'supply') { setSupplierId(''); setUnitCost(null); }
          }}
          options={[
            { value: 'in', label: t('stock.type.in') },
            { value: 'supply', label: t('stock.type.supply'), icon: Building2 },
            { value: 'out', label: t('stock.type.out') },
            { value: 'recount', label: t('stock.type.recount') },
          ]}
        />
      </Field>

      <Field label={t('common.selectProduct')} required error={!product ? err : null}>
        <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={() => setPickerOpen(true)}>
          <span className={product ? 'truncate' : 'text-mute'}>{product ? product.name : t('common.selectProduct')}</span>
          {product && (
            <span className="tnum flex-none text-[0.8125rem] text-mute">
              {formatNumber(product.stock)} {t('products.unit.' + product.unit)}
            </span>
          )}
        </button>
      </Field>

      {/* Yetkazib beruvchi — faqat qabul qilishda */}
      {isSupply && (
        <SupplierPicker
          value={supplierId}
          onChange={(v) => { setSupplierId(v); setErr(null); }}
          required
          error={err === t('supplier.required') ? err : null}
          hint={t('supplier.sourceHint')}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        {kind === 'recount' && product && (
          <Field label={t('stock.currentStock')}>
            <div className="input flex items-center bg-card2 text-mute" aria-readonly>
              {formatNumber(product.stock)} {t('products.unit.' + product.unit)}
            </div>
          </Field>
        )}
        <Field
          label={kind === 'recount' ? t('stock.newCount') : t('common.qty')}
          required
          error={product && err !== t('supplier.required') ? err : null}
        >
          <NumberInput value={qty} onChange={setQty} decimals={2} placeholder="0" ariaLabel={t('common.qty')} />
        </Field>

        {isSupply && (
          <Field label={t('stock.unitCost')} hint={t('stock.unitCostHint')}>
            <NumberInput
              value={unitCost}
              onChange={setUnitCost}
              placeholder={product ? String(product.cost) : '0'}
              ariaLabel={t('stock.unitCost')}
            />
          </Field>
        )}
      </div>

      {/* Qarz / naqd tanlovi + hisob */}
      {isSupply && (
        <>
          <label className="mb-2 flex items-start gap-2.5 rounded-lg border border-line p-2.5"
            style={{ background: 'var(--surface2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--accent)]"
              checked={onCredit}
              onChange={(e) => setOnCredit(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-semibold">{t('stock.onCredit')}</span>
              <span className="block text-[0.6875rem] leading-snug text-mute">{t('stock.onCreditHint')}</span>
            </span>
          </label>

          <label className="mb-3 flex items-start gap-2.5 rounded-lg border border-line p-2.5"
            style={{ background: 'var(--surface2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--accent)]"
              checked={updateCost}
              onChange={(e) => setUpdateCost(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-semibold">{t('stock.updateCost')}</span>
              <span className="block text-[0.6875rem] leading-snug text-mute">{t('stock.updateCostHint')}</span>
            </span>
          </label>

          {(qty ?? 0) > 0 && (
            <div className="card space-y-1 p-3 text-[0.8125rem]">
              <div className="flex justify-between text-mute">
                <span className="flex items-center gap-1.5"><PackagePlus size={13} strokeWidth={1.5} /> {t('stock.addedQty')}</span>
                <span className="tnum">{formatNumber(qty ?? 0)} {product ? t('products.unit.' + product.unit) : ''}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="flex items-center gap-1.5"><Coins size={13} strokeWidth={1.5} /> {t('stock.supplyTotal')}</span>
                <span className="tnum" style={{ color: onCredit ? 'var(--debt-supplier)' : 'var(--text)' }}>
                  {formatMoney(supplyTotal)}
                </span>
              </div>
              <p className="text-[0.6875rem] text-mute">
                {onCredit ? t('stock.willIncreaseDebt') : t('stock.paidCash')}
              </p>
            </div>
          )}
        </>
      )}

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
