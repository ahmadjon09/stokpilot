import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Clock, Printer, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Sale, type SaleItem } from '../../db/db';
import { hasReturnableItems, remainingQty } from '../../db/returns';
import { formatDateTime, formatMoney, formatNumber, round2 } from '../../shared/lib/format';
import { useSettings } from '../../store/settings';
import { useCloseSheet } from '../../shared/lib/nav';
import { EmptyState } from '../../shared/ui/bits';
import Sheet from '../../shared/ui/Sheet';
import ReturnSheet from './ReturnSheet';

/** Chek detali — sotuvlar tarixidan yoki to'lovdan keyin ochiladi. */
export default function ReceiptSheet() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const close = useCloseSheet('/sales');
  const biz = useSettings((s) => s.biz);

  /**
   * useLiveQuery uch xil holat qaytaradi:
   *  undefined → hali yuklanmoqda,
   *  null      → so'rov tugadi, lekin yozuv yo'q (o'chirilgan/buzilgan ID),
   *  Sale      → topildi.
   * Ilgari `undefined` ham, `null` ham bir xil "Yuklanmoqda…" bo'lib qolardi —
   * ya'ni mavjud bo'lmagan chekda ekran abadiy yuklanib turardi.
   */
  const sale = useLiveQuery(async () => (id ? (await db.sales.get(id)) ?? null : null), [id]);
  // Shu chek bo'yicha barcha qaytarish dalolatnomalari (xronologik)
  const returns = useLiveQuery(
    async () => (id ? db.returns.where('saleId').equals(id).sortBy('createdAt') : []),
    [id],
  );
  const [returnOpen, setReturnOpen] = useState(false);

  if (sale === undefined) {
    return (
      <Sheet title={t('sales.receipt')} onClose={close}>
        <div className="space-y-2 py-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-5 w-full" />)}
        </div>
      </Sheet>
    );
  }

  if (sale === null) {
    return (
      <Sheet title={t('sales.receipt')} onClose={close} footer={
        <button type="button" className="btn btn-primary" onClick={close}>{t('common.close')}</button>
      }>
        <EmptyState icon={XCircle} title={t('sales.receiptNotFound')} hint={t('sales.receiptNotFoundHint')} />
      </Sheet>
    );
  }

  const payLabel = t('sales.pay.' + sale.payType);
  const discountSum = Math.max(0, sale.subtotal - sale.total);
  const vatPart = biz.vat > 0 ? (sale.total * biz.vat) / (100 + biz.vat) : 0;
  const refunded = round2(sale.refundedAmount ?? 0);
  const refundedCost = round2(sale.refundedCost ?? 0);
  /** Qaytarishlardan keyingi haqiqiy sotuv / tannarx / foyda */
  const netTotal = round2(Math.max(0, sale.total - refunded));
  const netCost = round2(Math.max(0, sale.costTotal - refundedCost));
  const profit = round2(netTotal - netCost);
  const canReturn = hasReturnableItems(sale);
  /**
   * Shu chek bo'yicha qaytarishlar hisobiga kamaygan qarz.
   * Chekdagi `debtAmount` — sotuv paytidagi boshlang'ich qarz; joriy qoldiq
   * uchun undan qaytarilganini ayiramiz (mijozning umumiy balansi
   * `customers` da yuritiladi).
   */
  const debtReturned = round2((returns ?? []).reduce((s, r) => s + (r.debtReduced ?? 0), 0));
  const debtLeft = round2(Math.max(0, sale.debtAmount - debtReturned));

  /** Xaridor nasiya bo'lsa — mijoz kartochkasiga o'tish */
  return (
    <Sheet
      title={t('sales.receipt') + ' #' + sale.number}
      onClose={close}
      wide
      /*
       * Footer: mobil 375px da uchta tugma bir qatorga sig'maydi.
       * `.sheet-foot` avtomatik wrap qiladi; "Yopish" ixcham (flex: 0 0 auto),
       * qolgan ikkitasi teng bo'linadi — barmoq uchun 44px balandlik saqlanadi.
       */
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost no-print"
            style={{ flex: '0 0 auto', paddingLeft: 12, paddingRight: 12 }}
            onClick={close}
          >
            {t('common.close')}
          </button>
          {canReturn && (
            <button
              type="button"
              className="btn no-print"
              style={{ border: '1px solid var(--bad)', color: 'var(--bad)', background: 'transparent' }}
              onClick={() => setReturnOpen(true)}
            >
              <RotateCcw size={17} strokeWidth={1.5} /> {t('sales.return')}
            </button>
          )}
          <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
            <Printer size={17} strokeWidth={1.5} /> {t('common.print')}
          </button>
        </>
      }
    >
      <div className="print-area receipt mx-auto max-w-[360px] py-2">
        {/* Sarlavha */}
        <div className="text-center">
          {biz.logo && <img src={biz.logo} alt="" className="mx-auto mb-2 h-12 w-12 rounded-lg object-contain" />}
          <p className="text-[0.9375rem] font-extrabold">{biz.name}</p>
          <p className="text-[0.7188rem] text-mute">StokPilot · {formatDateTime(sale.createdAt)}</p>
        </div>

        <div className="rline" />

        {/* Holat badge'lari — ekranda ko'rinadi, chop etishda ham foydali */}
        <div className="no-print mb-2 flex flex-wrap items-center justify-center gap-1.5">
          <span className="badge badge-mute">{payLabel}</span>
          {sale.status === 'returned' && (
            <span className="badge badge-warn"><RotateCcw size={11} strokeWidth={2} /> {t('sales.returned')}</span>
          )}
          {sale.status === 'partial' && (
            <span className="badge badge-warn"><Undo2 size={11} strokeWidth={2} /> {t('sales.partial')}</span>
          )}
          {sale.status === 'done' && <span className="badge badge-ok">{t('common.done')}</span>}
          <span className="badge badge-mute">#{sale.number}</span>
        </div>

        {/* Mahsulotlar jadvali */}
        <table>
          <thead>
            <tr className="text-[0.6875rem] uppercase text-mute">
              <th>{t('common.name')}</th>
              <th className="text-center">{t('common.qty')}</th>
              <th className="text-right">{t('common.sum')}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it: SaleItem, i: number) => (
              <tr key={`${it.productId}-${i}`}>
                <td className="pr-2">
                  {it.name}
                  <span className="block text-[0.6562rem] text-mute">
                    {formatMoney(it.price)} × {formatNumber(it.qty)} {t('products.unit.' + it.unit)}
                  </span>
                </td>
                <td className="tnum text-center align-top">
                  {formatNumber(it.qty)}
                  {(it.returnedQty ?? 0) > 0 && (
                    <span className="block text-[0.5937rem] font-bold" style={{ color: 'var(--warn)' }}>
                      −{formatNumber(it.returnedQty)}
                    </span>
                  )}
                </td>
                <td className="tnum text-right align-top font-semibold">
                  {formatMoney(it.price * it.qty)}
                  {(it.returnedQty ?? 0) > 0 && (
                    <span className="block text-[0.5937rem] font-normal text-mute">
                      {formatMoney(it.price * (it.qty - it.returnedQty))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="rline" />

        {/* Yakuniy hisob */}
        <div className="space-y-1 text-[0.8125rem]">
          <div className="flex justify-between">
            <span>{t('sales.subtotal')}</span>
            <span className="tnum">{formatMoney(sale.subtotal)}</span>
          </div>
          {sale.discountType !== 'none' && discountSum > 0 && (
            <div className="flex justify-between">
              <span>
                {t('sales.discount')}
                {sale.discountType === 'percent' ? ` (${formatNumber(sale.discountValue)}%)` : ''}
              </span>
              <span className="tnum">−{formatMoney(discountSum)}</span>
            </div>
          )}
          {vatPart > 0 && (
            <div className="flex justify-between text-mute">
              <span>{t('sales.vatIncluded')} ({formatNumber(biz.vat)}%)</span>
              <span className="tnum">{formatMoney(vatPart)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-[1rem] font-extrabold">
            <span>{t('common.total')}</span>
            <span className="tnum">{formatMoney(sale.total)}</span>
          </div>
          {refunded > 0 && (
            <>
              <div className="flex justify-between font-semibold" style={{ color: 'var(--warn)' }}>
                <span>{t('sales.refunded')}</span>
                <span className="tnum">−{formatMoney(refunded)}</span>
              </div>
              <div className="flex justify-between font-extrabold" style={{ color: 'var(--accent)' }}>
                <span>{t('sales.netAmount')}</span>
                <span className="tnum">{formatMoney(netTotal)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-mute"><span>{t('sales.payType')}</span><span>{payLabel}</span></div>
          {/* Nasiya: to'langan qism va qarzga yozilgan qism */}
          {sale.payType === 'debt' && (
            <>
              {sale.paidAmount > 0 && (
                <div className="flex justify-between">
                  <span>{t('quickCust.advance')}</span>
                  <span className="tnum" style={{ color: 'var(--ok)' }}>{formatMoney(sale.paidAmount)}</span>
                </div>
              )}
              {sale.debtAmount > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>{t('quickCust.debtWillBe')}</span>
                  <span className="tnum" style={{ color: debtLeft > 0 ? 'var(--bad)' : 'var(--ok)' }}>
                    {debtReturned > 0 && (
                      <span className="mr-1 text-[0.6875rem] font-normal text-mute" style={{ textDecoration: 'line-through' }}>
                        {formatMoney(sale.debtAmount)}
                      </span>
                    )}
                    {formatMoney(debtLeft)}
                  </span>
                </div>
              )}
            </>
          )}
          {sale.customerName && (
            <div className="flex justify-between text-mute"><span>{t('sales.customer')}</span><span>{sale.customerName}</span></div>
          )}
          {sale.note && (
            <div className="flex justify-between text-mute"><span>{t('common.note')}</span><span className="text-right">{sale.note}</span></div>
          )}
        </div>

        {/* Faqat ega/xodim uchun — chekda chop etilmaydi */}
        <div className="rline no-print" />
        <div className="no-print space-y-1 text-[0.75rem] text-mute">
          <div className="flex items-center justify-between">
            <span>{t('sales.itemsCount')}</span>
            <span className="tnum">{sale.items.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('sales.costTotal')}</span>
            <span className="tnum">{formatMoney(netCost)}</span>
          </div>
          <div className="flex items-center justify-between font-semibold" style={{ color: profit >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
            <span>{t('sales.profit')}</span>
            <span className="tnum">{formatMoney(profit)}</span>
          </div>
          {sale.status === 'returned' && (
            <p className="mt-1 flex items-center gap-1.5" style={{ color: 'var(--warn)' }}>
              <AlertTriangle size={12} strokeWidth={2} /> {t('sales.returnedHint')}
            </p>
          )}
          {sale.status === 'partial' && (
            <p className="mt-1 flex items-center gap-1.5" style={{ color: 'var(--warn)' }}>
              <AlertTriangle size={12} strokeWidth={2} /> {t('sales.partialHint')}
            </p>
          )}
        </div>

        {/* Qaytarishlar tarixi — o'zgarmas dalolatnomalar */}
        {(returns?.length ?? 0) > 0 && (
          <div className="no-print mt-3">
            <div className="rline" />
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] font-bold">
              <Clock size={13} strokeWidth={1.5} /> {t('sales.returnHistory')}
            </p>
            <div className="space-y-1.5">
              {returns!.map((r) => (
                <div key={r.id} className="rounded-lg p-2 text-[0.75rem]" style={{ background: 'var(--surface2)' }}>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="tnum">{formatDateTime(r.createdAt)}</span>
                    <span className="tnum" style={{ color: 'var(--warn)' }}>−{formatMoney(r.amount)}</span>
                  </div>
                  <p className="mt-0.5 text-[0.6875rem] text-mute">
                    {r.lines.map((l) => `${l.name} × ${formatNumber(l.qty)}`).join(', ')}
                  </p>
                  {r.note && <p className="mt-0.5 text-[0.6875rem] italic">{r.note}</p>}
                  {r.debtReduced > 0 && (
                    <p className="mt-0.5 text-[0.6875rem]" style={{ color: 'var(--ok)' }}>
                      {t('sales.returnDebtReduced')}: {formatMoney(r.debtReduced)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {biz.receiptFooter && (
          <>
            <div className="rline" />
            <p className="text-center text-[0.75rem]">{biz.receiptFooter}</p>
          </>
        )}
      </div>

      {returnOpen && (
        <ReturnSheet
          sale={sale}
          onClose={() => setReturnOpen(false)}
          onDone={() => setReturnOpen(false)}
        />
      )}
    </Sheet>
  );
}
