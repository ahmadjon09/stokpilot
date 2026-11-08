import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Printer, RotateCcw, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type SaleItem } from '../../db/db';
import { formatDateTime, formatMoney, formatNumber } from '../../shared/lib/format';
import { useSettings } from '../../store/settings';
import { useCloseSheet } from '../../shared/lib/nav';
import { EmptyState } from '../../shared/ui/bits';
import Sheet from '../../shared/ui/Sheet';

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
  const profit = sale.total - sale.costTotal;

  /** Xaridor nasiya bo'lsa — mijoz kartochkasiga o'tish */
  return (
    <Sheet
      title={t('sales.receipt') + ' #' + sale.number}
      onClose={close}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost no-print" onClick={close}>{t('common.close')}</button>
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
          {sale.status === 'returned'
            ? <span className="badge badge-warn"><RotateCcw size={11} strokeWidth={2} /> {t('sales.returned')}</span>
            : <span className="badge badge-ok">{t('common.done')}</span>}
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
                <td className="tnum text-center align-top">{formatNumber(it.qty)}</td>
                <td className="tnum text-right align-top font-semibold">{formatMoney(it.price * it.qty)}</td>
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
                  <span className="tnum" style={{ color: 'var(--bad)' }}>{formatMoney(sale.debtAmount)}</span>
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
            <span className="tnum">{formatMoney(sale.costTotal)}</span>
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
        </div>

        {biz.receiptFooter && (
          <>
            <div className="rline" />
            <p className="text-center text-[0.75rem]">{biz.receiptFooter}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
