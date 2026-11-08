/**
 * Ma'lumot validatsiyasi — IndexedDB'dan o'qilgan har bir yozuv shu yerdan o'tadi.
 *
 * Nega kerak:
 *  - Eski (legacy) versiyada saqlangan yozuvda yangi maydon bo'lmasligi mumkin;
 *  - Foydalanuvchi tashqi JSON backup import qilishi mumkin (buzilgan fayl);
 *  - APK/WebView'da baza yarim yozilgan holatda qolishi mumkin.
 *
 * Qoida: validatsiya hech qachon "throw" qilmaydi. U yozuvni imkon qadar
 * to'g'rilab (repair) yangi obyekt qaytaradi, umuman tiklab bo'lmaydigan
 * yozuv uchun `null` qaytaradi. Shunday qilib bitta buzuq qator butun
 * ilovani yiqitmaydi.
 */

import { round2 } from '../shared/lib/format';
import { saleStatus } from './returns';
import {
  type Category, type Customer, type ImageRec, type LedgerDirection, type LedgerEntry,
  type LedgerSource, type LogRec, type MoveType, type PayType, type Product, type ReturnLine,
  type ReturnRec, type Sale, type SaleItem, type SaleStatus, type StockMove, type Unit,
} from './db';

/* ------------------------------- helpers ------------------------------- */

type Dict = Record<string, unknown>;

export const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback;
}

export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    // "1 234,5" yoki "1234.5" — backup fayllarda uchraydi
    const parsed = Number(v.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Bo'sh/yo'q timestamp uchun xavfsiz qiymat (1970 emas — hozirgi vaqt) */
export function ts(v: unknown, fallback = Date.now()): number {
  const n = num(v, NaN);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/* ------------------------------- enums --------------------------------- */

export const UNITS: readonly Unit[] = ['dona', 'kg', 'litr', 'metr'] as const;
export const MOVE_TYPES: readonly MoveType[] = ['in', 'out', 'recount', 'sale', 'return'] as const;
export const PAY_TYPES: readonly PayType[] = ['cash', 'card', 'transfer', 'debt'] as const;
export const DISCOUNT_TYPES = ['none', 'percent', 'amount'] as const;
export const SALE_STATUSES: readonly SaleStatus[] = ['done', 'partial', 'returned'] as const;
export const RETURN_SETTLEMENTS = ['debt', 'cash'] as const;
export const CUSTOMER_KINDS = ['customer', 'supplier'] as const;
export const LEDGER_DIRECTIONS: readonly LedgerDirection[] = ['charge', 'payment'] as const;
export const LEDGER_SOURCES: readonly LedgerSource[] = ['opening', 'sale', 'payment', 'return', 'adjustment'] as const;
/** To'lov usullari — '' (ko'rsatilmagan) ham ruxsat etiladi */
export const LEDGER_METHODS: readonly (PayType | '')[] = ['', 'cash', 'card', 'transfer', 'debt'] as const;

/* ------------------------------ validators ----------------------------- */

export interface Validated<T> {
  /** Ishlatishga tayyor, to'g'rilangan yozuv (yoki null — tiklab bo'lmadi) */
  value: T | null;
  /** true — yozuv o'zgartirildi (migratsiya davomida saqlanishi kerak) */
  changed: boolean;
}

export function validateProduct(raw: unknown, idHint?: string): Validated<Product> {
  if (!isDict(raw)) return { value: null, changed: true };
  const now = Date.now();
  const id = str(raw.id, idHint ?? '');
  if (!id) return { value: null, changed: true };

  const clean: Product = {
    id,
    sku: str(raw.sku),
    name: str(raw.name).trim() || '—',
    categoryId: str(raw.categoryId),
    unit: oneOf(raw.unit, UNITS, 'dona'),
    cost: num(raw.cost),
    price: num(raw.price),
    minStock: Math.max(0, num(raw.minStock)),
    stock: num(raw.stock),
    barcode: str(raw.barcode),
    note: str(raw.note),
    imageIds: strArray(raw.imageIds),
    createdAt: ts(raw.createdAt, now),
    updatedAt: ts(raw.updatedAt ?? raw.createdAt, now),
  };

  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateSaleItem(raw: unknown): SaleItem | null {
  if (!isDict(raw)) return null;
  const productId = str(raw.productId);
  const qty = num(raw.qty);
  if (!productId || !Number.isFinite(qty) || qty === 0) return null;
  // Qaytarilgan miqdor hech qachon sotilganidan oshmasligi kerak
  const returnedQty = Math.min(Math.max(0, num(raw.returnedQty)), Math.abs(qty));
  return {
    productId,
    name: str(raw.name).trim() || '—',
    unit: oneOf(raw.unit, UNITS, 'dona'),
    price: num(raw.price),
    cost: num(raw.cost),
    qty,
    returnedQty,
  };
}

export function validateSale(raw: unknown, idHint?: string): Validated<Sale> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  if (!id) return { value: null, changed: true };

  // items: eski yozuvlarda massiv bo'lmasligi yoki buzuq element bo'lishi mumkin
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map(validateSaleItem).filter((x): x is SaleItem => x !== null);
  const itemsDropped = items.length !== rawItems.length;

  // Legacy cheklarda subtotal/umumiy yo'q bo'lsa — itemlardan qayta hisoblaymiz
  const itemsSum = rawItems.reduce<number>((s, it) => {
    if (!isDict(it)) return s;
    return s + num(it.price) * num(it.qty);
  }, 0);

  const subtotal = num(raw.subtotal, itemsSum);
  const total = num(raw.total, subtotal);
  const payType = oneOf(raw.payType, PAY_TYPES, 'cash');

  /*
   * paidAmount / debtAmount — v3 da qo'shildi.
   * Legacy (v1/v2) chekda bu maydonlar yo'q: ular payType dan xulosa qilinadi.
   *   - nasiya (debt): butun summa qarzga yozilgan → paid 0, debt total
   *   - boshqa turlar: to'liq to'langan → paid total, debt 0
   */
  const legacyDebt = payType === 'debt' ? Math.abs(total) : 0;
  const legacyPaid = round2(total - legacyDebt);
  const debtAmount = Math.min(Math.abs(num(raw.debtAmount, legacyDebt)), Math.abs(total));
  const paidAmount = round2(num(raw.paidAmount, legacyPaid));

  /*
   * `status` ENDI sotuvdan emas, qaytarilgan miqdorlardan hisoblanadi:
   * eski 'returned' qiymati `items[].returnedQty` bilan mos bo'lmasligi mumkin
   * (masalan v4 ga o'tishda), shuning uchun har doim qayta hisoblanadi.
   */
  const computedStatus = saleStatus({ items });
  const rawStatus = oneOf(raw.status, SALE_STATUSES, 'done');
  // Eski 'returned' yozuvi bor, lekin satrlar bo'sh bo'lsa (legacy) — saqlanadi
  const status: SaleStatus = rawStatus === 'returned' && computedStatus === 'done'
    ? 'returned'
    : computedStatus;

  const clean: Sale = {
    id,
    number: Math.max(0, Math.trunc(num(raw.number))),
    items,
    subtotal,
    discountType: oneOf(raw.discountType, DISCOUNT_TYPES, 'none'),
    discountValue: num(raw.discountValue),
    total,
    costTotal: num(raw.costTotal),
    payType,
    paidAmount,
    debtAmount,
    customerId: str(raw.customerId),
    customerName: str(raw.customerName),
    status,
    refundedAmount: Math.max(0, num(raw.refundedAmount)),
    refundedCost: Math.max(0, num(raw.refundedCost)),
    note: str(raw.note),
    createdAt: ts(raw.createdAt, Date.now()),
  };

  return { value: clean, changed: itemsDropped || changedKeys(raw, clean) };
}

/**
 * Kontragent (mijoz yoki yetkazib beruvchi).
 * `balance` imzolangan: >0 — u bizga qarzdor, <0 — biz u bilan qarzdormiz.
 */
export function validateCustomer(raw: unknown, idHint?: string): Validated<Customer> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  if (!id) return { value: null, changed: true };
  const clean: Customer = {
    id,
    name: str(raw.name).trim() || '—',
    phone: str(raw.phone),
    kind: oneOf(raw.kind, CUSTOMER_KINDS, 'customer'),
    balance: num(raw.balance),
    note: str(raw.note),
    createdAt: ts(raw.createdAt, Date.now()),
  };
  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateMove(raw: unknown, idHint?: string): Validated<StockMove> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  if (!id) return { value: null, changed: true };
  const refId = str(raw.refId);
  const clean: StockMove = {
    id,
    productId: str(raw.productId),
    productName: str(raw.productName).trim() || '—',
    type: oneOf(raw.type, MOVE_TYPES, 'in'),
    qty: num(raw.qty),
    note: str(raw.note),
    createdAt: ts(raw.createdAt, Date.now()),
    ...(refId ? { refId } : {}),
  };
  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateCategory(raw: unknown, idHint?: string): Validated<Category> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  if (!id) return { value: null, changed: true };
  const clean: Category = { id, name: str(raw.name).trim() || '—' };
  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateImage(raw: unknown, idHint?: string): Validated<ImageRec> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  // Ma'lumot qismi bo'lmasa rasm foydasiz — uni tashlab yuboramiz
  const data = str(raw.data);
  if (!id || !data) return { value: null, changed: true };
  const clean: ImageRec = {
    id,
    productId: str(raw.productId),
    data,
    thumb: str(raw.thumb) || data,
    size: Math.max(0, num(raw.size, data.length)),
    createdAt: ts(raw.createdAt, Date.now()),
  };
  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateLog(raw: unknown, idHint?: string): Validated<LogRec> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  if (!id) return { value: null, changed: true };
  const clean: LogRec = {
    id,
    action: str(raw.action, 'unknown'),
    message: str(raw.message),
    createdAt: ts(raw.createdAt, Date.now()),
  };
  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateLedgerEntry(raw: unknown, idHint?: string): Validated<LedgerEntry> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  const partyId = str(raw.partyId);
  // Kontragentsiz yozuv ma'nosiz — uni tashlab yuboramiz
  if (!id || !partyId) return { value: null, changed: true };

  const saleId = str(raw.saleId);
  const saleNumber = Math.trunc(num(raw.saleNumber));
  const method = oneOf(raw.method, LEDGER_METHODS, '');

  const clean: LedgerEntry = {
    id,
    partyId,
    partyKind: oneOf(raw.partyKind, CUSTOMER_KINDS, 'customer'),
    direction: oneOf(raw.direction, LEDGER_DIRECTIONS, 'charge'),
    source: oneOf(raw.source, LEDGER_SOURCES, 'adjustment'),
    // Summa doim musbat — yo'nalish `direction` da ifodalanadi
    amount: Math.abs(num(raw.amount)),
    balanceAfter: num(raw.balanceAfter),
    note: str(raw.note),
    method,
    ...(saleId ? { saleId } : {}),
    ...(saleId && Number.isFinite(saleNumber) && saleNumber > 0 ? { saleNumber } : {}),
    createdAt: ts(raw.createdAt, Date.now()),
  };

  return { value: clean, changed: changedKeys(raw, clean) };
}

export function validateReturnLine(raw: unknown): ReturnLine | null {
  if (!isDict(raw)) return null;
  const qty = num(raw.qty);
  if (!(qty > 0)) return null;
  return {
    index: Math.max(0, Math.trunc(num(raw.index))),
    productId: str(raw.productId),
    name: str(raw.name).trim() || '—',
    unit: oneOf(raw.unit, UNITS, 'dona'),
    price: num(raw.price),
    cost: num(raw.cost),
    qty,
    refund: Math.max(0, num(raw.refund)),
  };
}

/**
 * Qaytarish dalolatnomasi. Satrlari bo'sh yozuv ma'nosiz — tashlab yuboriladi.
 */
export function validateReturn(raw: unknown, idHint?: string): Validated<ReturnRec> {
  if (!isDict(raw)) return { value: null, changed: true };
  const id = str(raw.id, idHint ?? '');
  const saleId = str(raw.saleId);
  if (!id || !saleId) return { value: null, changed: true };

  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = rawLines.map(validateReturnLine).filter((x): x is ReturnLine => x !== null);
  if (lines.length === 0) return { value: null, changed: true };

  const clean: ReturnRec = {
    id,
    saleId,
    saleNumber: Math.max(0, Math.trunc(num(raw.saleNumber))),
    lines,
    amount: Math.max(0, num(raw.amount, lines.reduce((s, l) => s + l.refund, 0))),
    cost: Math.max(0, num(raw.cost, lines.reduce((s, l) => s + l.cost * l.qty, 0))),
    debtReduced: Math.max(0, num(raw.debtReduced)),
    settlement: oneOf(raw.settlement, RETURN_SETTLEMENTS, 'cash'),
    note: str(raw.note),
    ...(bool(raw.migrated) ? { migrated: true } : {}),
    createdAt: ts(raw.createdAt, Date.now()),
  };

  return { value: clean, changed: lines.length !== rawLines.length || changedKeys(raw, clean) };
}

/* ------------------------------ utilities ------------------------------ */

/**
 * `clean` ning kalitlarini `raw` bilan solishtiradi.
 * Faqat mavjud maydonlar tekshiriladi — ortiqcha (noma'lum) kalitlar
 * e'tiborga olinmaydi, ular baribir saqlanmaydi.
 */
function changedKeys(raw: Dict, clean: object): boolean {
  const a = clean as Dict;
  for (const k of Object.keys(a)) {
    const va = a[k];
    const vb = raw[k];
    // Massiv/obyektlar chuqur solishtiriladi — reference tenglik yetarli emas
    // (`items: SaleItem[]` har validatsiyada yangi obyekt bo'ladi).
    if (va !== null && typeof va === 'object') {
      if (!deepEqual(va, vb)) return true;
      continue;
    }
    if (va !== vb) return true;
  }
  return false;
}

/** Kichik JSON-mos qiymatlar uchun barqaror chuqur tenglik tekshiruvi */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a as Dict);
    const kb = Object.keys(b as Dict);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Dict)[k], (b as Dict)[k]));
  }
  return false;
}
