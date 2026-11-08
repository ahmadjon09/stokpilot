/**
 * Sotuv statistikasi — qaytarishlarni hisobga olgan holda.
 *
 * MUAMMO: ilgari hisobotlar `s.status === 'done'` bilan filtrlab, `x.total`
 * ni qo'shardi. Qismli qaytarish joriy etilgach bu ikki xil xatoga olib kelardi:
 *   1) 'partial' chek hisobotdan BUTUNLAY yo'qolardi (sotuv "bug'lanadi");
 *   2) 'returned' chek ham tushib qolardi, lekin u allaqachon 0 ga teng.
 *
 * YECHIM: chekni holat bo'yicha emas, QAYTARILGAN SUMMA bo'yicha hisoblaymiz:
 *   netTotal = total − refundedAmount
 * Natijada holat ('done' / 'partial' / 'returned') hisob-kitobga ta'sir qilmaydi
 * va yagona haqiqat manbai — dalolatnomalar yig'indisi bo'ladi.
 */
import type { Sale, SaleItem } from '../../db/db';
import { round2 } from './format';

/** Chekning qaytarishdan keyingi summasi */
export function saleNetTotal(
  sale: Pick<Sale, 'total' | 'refundedAmount'> & { status?: Sale['status'] },
): number {
  /*
   * Xavfsizlik to'ri: v4 dan oldingi "butunlay qaytarilgan" chekda
   * `refundedAmount` bo'lmasligi mumkin (migratsiya uni to'ldiradi, lekin
   * buzilgan zaxira fayldan tiklangan holatlar bo'lishi mumkin).
   * Holat 'returned' bo'lsa, tushum 0 — aks holda qaytarilgan chek daromad
   * sifatida sanalib qolardi.
   */
  if (sale.status === 'returned' && !(sale.refundedAmount > 0)) return 0;
  return round2(Math.max(0, sale.total - (sale.refundedAmount ?? 0)));
}

/** Chekning qaytarishdan keyingi tannarxi */
export function saleNetCost(sale: Pick<Sale, 'costTotal' | 'refundedCost'>): number {
  return round2(Math.max(0, sale.costTotal - (sale.refundedCost ?? 0)));
}

/** Chekning qaytarishdan keyingi foydasi */
export function saleNetProfit(sale: Pick<Sale, 'total' | 'refundedAmount' | 'costTotal' | 'refundedCost'>): number {
  return round2(saleNetTotal(sale) - saleNetCost(sale));
}

/** Satrdan qaytarilmagan (sof sotilgan) miqdor */
export function itemNetQty(item: SaleItem): number {
  return round2(Math.max(0, item.qty - (item.returnedQty ?? 0)));
}

/** Hisobotga kiradigan cheklar: sof summasi 0 dan katta bo'lganlar */
export function countableSales(sales: Sale[]): Sale[] {
  return sales.filter((s) => saleNetTotal(s) > 0);
}

/** Sotuvlar yig'indisi (sof tushum) */
export function sumNetRevenue(sales: Sale[]): number {
  return round2(sales.reduce((sum, s) => sum + saleNetTotal(s), 0));
}

/** Sotuvlar yig'indisi (sof foyda) */
export function sumNetProfit(sales: Sale[]): number {
  return round2(sales.reduce((sum, s) => sum + saleNetProfit(s), 0));
}

/**
 * Mahsulot bo'yicha sof sotilgan miqdor va sof tushum.
 * Chegirma hisobga olinmaydi (mavjud ABC-tahlil bilan bir xil mantiq) —
 * faqat qaytarilgan donalar chiqarib tashlanadi.
 */
export function itemStats(sales: Sale[]): Map<string, { name: string; qty: number; revenue: number }> {
  const map = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const sale of sales) {
    for (const it of sale.items) {
      const qty = itemNetQty(it);
      if (qty <= 0) continue; // to'liq qaytarilgan satr statistikaga kirmaydi
      const cur = map.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty = round2(cur.qty + qty);
      cur.revenue = round2(cur.revenue + it.price * qty);
      map.set(it.productId, cur);
    }
  }
  return map;
}
