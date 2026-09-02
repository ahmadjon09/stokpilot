import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Camera, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, uid, nextSku, type Product, type Unit } from '../../db/db';
import { deleteProduct } from '../../db/actions';
import { processImageFile } from '../../shared/lib/img';
import { useSettings } from '../../store/settings';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import Sheet from '../../shared/ui/Sheet';
import NumberInput from '../../shared/ui/NumberInput';
import { ConfirmDialog, Field } from '../../shared/ui/bits';

const DRAFT_KEY = 'sp-draft-product-new';
const LAST_CAT_KEY = 'sp-last-category';

interface FormState {
  name: string;
  price: number | null;
  cost: number | null;
  categoryId: string;
  newCategory: string;
  sku: string;
  unit: Unit;
  minStock: number | null;
  barcode: string;
  note: string;
}

export default function ProductFormSheet() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const defaultMinStock = useSettings((s) => s.biz.minStock);
  const hasBackground = Boolean((location.state as { background?: unknown } | null)?.background);
  const fallback = '/products';
  const close = () => { if (hasBackground) navigate(-1); else navigate(fallback); };

  const products = useLiveQuery(async () => (id ? db.products.get(id) : undefined), [id]);
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), []) ?? [];
  const existingImages = useLiveQuery(async () => (id ? db.images.where('productId').equals(id).toArray() : []), [id]) ?? [];

  const loadedRef = useRef(false);
  const [form, setForm] = useState<FormState>({
    name: '', price: null, cost: null, categoryId: '', newCategory: '',
    sku: '', unit: 'dona', minStock: null, barcode: '', note: '',
  });
  const [newImages, setNewImages] = useState<{ id: string; data: string; thumb: string; size: number }[]>([]);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [more, setMore] = useState(false);
  const [addingCat, setAddingCat] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Yuklash: edit → bazadan; new → draft yoki defaultlar
  useEffect(() => {
    if (loadedRef.current) return;
    if (isEdit) {
      if (!products) return; // hali yuklanmagan
      loadedRef.current = true;
      setForm({
        name: products.name, price: products.price, cost: products.cost || null,
        categoryId: products.categoryId, newCategory: '', sku: products.sku,
        unit: products.unit, minStock: products.minStock, barcode: products.barcode, note: products.note,
      });
    } else {
      loadedRef.current = true;
      try {
        const draft = sessionStorage.getItem(DRAFT_KEY);
        if (draft) {
          setForm((f) => ({ ...f, ...(JSON.parse(draft) as Partial<FormState>) }));
          return;
        }
      } catch { /* noop */ }
      void nextSku().then((sku) => setForm((f) => ({
        ...f, sku, minStock: defaultMinStock,
        categoryId: localStorage.getItem(LAST_CAT_KEY) ?? '',
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, products]);

  // Autosave draft (yangi mahsulot)
  useEffect(() => {
    if (!isEdit) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form, isEdit]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    buzz(8);
    for (const file of Array.from(files).slice(0, 5)) {
      try {
        const img = await processImageFile(file);
        setNewImages((arr) => [...arr, { id: uid(), ...img }]);
      } catch { toast(t('common.error')); }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = t('products.errName');
    if (form.price == null || form.price <= 0) e.price = t('products.errPrice');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!validate()) { buzz(30); return; }
    setSaving(true);
    try {
      let categoryId = form.categoryId;
      if (addingCat && form.newCategory.trim()) {
        categoryId = uid();
        await db.categories.add({ id: categoryId, name: form.newCategory.trim() });
      }
      if (categoryId) localStorage.setItem(LAST_CAT_KEY, categoryId);

      const now = Date.now();
      const productId = id ?? uid();
      const existing = id ? await db.products.get(id) : undefined;
      const product: Product = {
        id: productId,
        sku: form.sku.trim() || (await nextSku()),
        name: form.name.trim(),
        categoryId,
        unit: form.unit,
        cost: form.cost ?? 0,
        price: form.price ?? 0,
        minStock: form.minStock ?? defaultMinStock,
        stock: existing?.stock ?? 0,
        barcode: form.barcode.trim(),
        note: form.note.trim(),
        imageIds: [...(existing?.imageIds ?? []), ...newImages.map((i) => i.id)],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.products.put(product);
      for (const im of newImages) {
        await db.images.add({ id: im.id, productId, data: im.data, thumb: im.thumb, size: im.size, createdAt: now });
      }
      sessionStorage.removeItem(DRAFT_KEY);
      toast(t('settings.saved'));
      buzz(14);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={isEdit ? t('products.edit') : t('products.new')}
      onClose={close}
      footer={
        <>
          {isEdit && (
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--bad)' }} onClick={() => setConfirmDel(true)}>
              <Trash2 size={17} strokeWidth={1.5} />
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>{t('common.save')}</button>
        </>
      }
    >
      {/* Rasmlar */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {existingImages.map((im) => (
          <div key={im.id} className="relative">
            <img src={im.thumb} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
            <button type="button" aria-label={t('common.delete')}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-mute"
              onClick={() => { void db.images.delete(im.id); }}>
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        {newImages.map((im) => (
          <div key={im.id} className="relative">
            <img src={im.thumb} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
            <button type="button" aria-label={t('common.delete')}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-mute"
              onClick={() => setNewImages((arr) => arr.filter((x) => x.id !== im.id))}>
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex h-16 w-16 flex-none flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-mute transition hover:bg-card2"
          aria-label={t('products.addImage')}>
          <Camera size={19} strokeWidth={1.5} />
          <Plus size={13} strokeWidth={1.5} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      </div>

      {/* Asosiy maydonlar (progressive disclosure) */}
      <Field label={t('common.name')} required error={errors.name}>
        <input className={'input' + (errors.name ? ' input-err' : '')} value={form.name}
          onChange={(e) => set('name', e.target.value)} placeholder="Masalan: Cola 1.5L" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t('common.price')} *`} required error={errors.price}>
          <NumberInput value={form.price} onChange={(v) => set('price', v)}
            className={errors.price ? 'input-err' : ''} placeholder="0" ariaLabel={t('common.price')} />
        </Field>
        <Field label={t('common.cost')}>
          <NumberInput value={form.cost} onChange={(v) => set('cost', v)} placeholder="0" ariaLabel={t('common.cost')} />
        </Field>
      </div>

      <Field label={t('products.category')}>
        {addingCat ? (
          <div className="flex gap-2">
            <input className="input" autoFocus placeholder={t('products.categoryName')} value={form.newCategory}
              onChange={(e) => set('newCategory', e.target.value)} />
            <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={() => setAddingCat(false)}>{t('common.cancel')}</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">—</option>
              {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm shrink-0" style={{ minHeight: 44 }} onClick={() => setAddingCat(true)}>
              <Plus size={15} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </Field>

      {/* Qo'shimcha maydonlar (accordion) */}
      <div className="mt-1 border-t border-line">
        <button type="button" className="acc-head" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {t('common.optional')}
          <ChevronDown size={18} strokeWidth={1.5} className="text-mute transition-transform" style={{ transform: more ? 'rotate(180deg)' : 'none' }} />
        </button>
        {more && (
          <div className="pt-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('products.sku')}>
                <input className="input" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
              </Field>
              <Field label={t('products.unit')}>
                <select className="input" value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
                  <option value="dona">{t('products.unit.dona')}</option>
                  <option value="kg">{t('products.unit.kg')}</option>
                  <option value="litr">{t('products.unit.litr')}</option>
                  <option value="metr">{t('products.unit.metr')}</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('products.minStock')}>
                <NumberInput value={form.minStock} onChange={(v) => set('minStock', v)} decimals={0} />
              </Field>
              <Field label={t('products.barcode')}>
                <input className="input" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} inputMode="numeric" />
              </Field>
            </div>
            <Field label={t('common.note')}>
              <textarea className="input" value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} />
            </Field>
          </div>
        )}
      </div>

      {confirmDel && id && (
        <ConfirmDialog title={t('common.delete')} text={t('products.deleteOne')} danger
          onConfirm={() => { void deleteProduct(id).then(() => close()); }}
          onCancel={() => setConfirmDel(false)} />
      )}
    </Sheet>
  );
}
