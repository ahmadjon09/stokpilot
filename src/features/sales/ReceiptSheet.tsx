import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/db';
import { formatDateTime, formatMoney, formatNumber } from '../../shared/lib/format';
import { useSettings } from '../../store/settings';
import Sheet from '../../shared/ui/Sheet';

export default function ReceiptSheet() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const biz = useSettings((s) => s.biz);
  const hasBackground = Boolean((location.state as { background?: unknown } | null)?.background);
  const close = () => { if (hasBackground) navigate(-1); else navigate('/sales'); };

  const sale = useLiveQuery(async () => (id ? db.sales.get(id) : undefined), [id]);

  if (!sale) {
    return <Sheet title={t('sales.receipt')} onClose={close}><p className="py-8 text-center text-mute">{t('common.loading')}</p></Sheet>;
  }

  const payLabel = t('sales.pay.' + sale.payType);

  return (
    <Sheet
      title={t('sales.receipt') + ' #' + sale.number}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost no-print" onClick={close}>{t('common.close')}</button>
          <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
            <Printer size={17} strokeWidth={1.5} /> {t('common.print')}
          </button>
        </>
      }
    >
      <div className="print-area receipt mx-auto max-w-[340px] py-2">
        <div className="text-center">
          {biz.logo && <img src={biz.logo} alt="" className="mx-auto mb-2 h-12 w-12 rounded-lg object-contain" />}
          <p className="text-[15px] font-extrabold">{biz.name}</p>
          <p className="text-[11.5px] text-mute">StokPilot · {formatDateTime(sale.createdAt)}</p>
        </div>
        <div className="rline" />
        <table>
          <thead>
            <tr className="text-[11px] uppercase text-mute">
              <th>{t('common.name')}</th>
              <th className="text-center">{t('common.qty')}</th>
              <th className="text-right">{t('common.sum')}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => (
              <tr key={i}>
                <td>
                  {it.name}
                  <span className="block text-[10.5px] text-mute">{formatMoney(it.price)} × {formatNumber(it.qty)} {t('products.unit.' + it.unit)}</span>
                </td>
                <td className="tnum text-center align-top">{formatNumber(it.qty)}</td>
                <td className="tnum text-right align-top font-semibold">{formatMoney(it.price * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rline" />
        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between"><span>{t('sales.subtotal')}</span><span className="tnum">{formatMoney(sale.subtotal)}</span></div>
          {sale.discountType !== 'none' && (
            <div className="flex justify-between"><span>{t('sales.discount')}{sale.discountType === 'percent' ? ` (${formatNumber(sale.discountValue)}%)` : ''}</span><span className="tnum">−{formatMoney(sale.subtotal - sale.total)}</span></div>
          )}
          {biz.vat > 0 && (
            <div className="flex justify-between text-mute"><span>{t('sales.vatIncluded')} ({formatNumber(biz.vat)}%)</span><span className="tnum">{formatMoney((sale.total * biz.vat) / (100 + biz.vat))}</span></div>
          )}
          <div className="flex justify-between pt-1 text-[16px] font-extrabold"><span>{t('common.total')}</span><span className="tnum">{formatMoney(sale.total)}</span></div>
          <div className="flex justify-between text-mute"><span>{t('sales.payType')}</span><span>{payLabel}</span></div>
          {sale.customerName && <div className="flex justify-between text-mute"><span>{t('sales.customer')}</span><span>{sale.customerName}</span></div>}
          {sale.status === 'returned' && <p className="badge badge-warn">{t('sales.returned')}</p>}
        </div>
        {biz.receiptFooter && (
          <>
            <div className="rline" />
            <p className="text-center text-[12px]">{biz.receiptFooter}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
