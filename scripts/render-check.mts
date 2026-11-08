import 'fake-indexeddb/auto';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

(globalThis as any).window = globalThis;
(globalThis as any).document = { documentElement: { style: { setProperty(){}, }, classList: { toggle(){}, add(){}, remove(){} }, dataset: {}, lang: '' } };
/*
 * Recharts/theme helper'lari `getComputedStyle` dan CSS o'zgaruvchilarini
 * o'qiydi. SSR muhitida u yo'q — bo'sh qiymat qaytaradigan stub beramiz,
 * shunda komponentlar o'z fallback ranglariga tushadi (vizual tekshiruv
 * preview'da qilinadi).
 */
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });

const i18n = (await import('../src/i18n/index.ts')).default;
const { db } = await import('../src/db/db.ts');
const DebtsPage = (await import('../src/features/debts/DebtsPage.tsx')).default;
const PartySheet = (await import('../src/features/debts/PartySheet.tsx')).default;
const PaymentSheet = (await import('../src/features/debts/PaymentSheet.tsx')).default;
const LedgerTimeline = (await import('../src/features/debts/LedgerTimeline.tsx')).default;
const QuickCustomer = (await import('../src/features/sales/QuickCustomer.tsx')).default;
const CustomersPage = (await import('../src/features/customers/CustomersPage.tsx')).default;
const ReturnSheet = (await import('../src/features/sales/ReturnSheet.tsx')).default;
const StatisticsPage = (await import('../src/features/reports/StatisticsPage.tsx')).default;
const SupplierPicker = (await import('../src/features/customers/SupplierPicker.tsx')).default;
const AppShell = (await import('../src/layouts/AppShell.tsx')).default;

const customer = {
  id: 'c1', name: 'Ali Valiyev', phone: '+998901112233', kind: 'customer' as const,
  balance: -45000, note: 'eski mijoz', createdAt: 1700000000000,
};
const entries = [
  { id: 'e1', partyId: 'c1', partyKind: 'customer' as const, direction: 'charge' as const, source: 'sale' as const,
    amount: 60000, balanceAfter: 60000, note: '', method: '' as const, saleId: 's1', saleNumber: 7, createdAt: 1700000001000 },
  { id: 'e2', partyId: 'c1', partyKind: 'customer' as const, direction: 'payment' as const, source: 'payment' as const,
    amount: 15000, balanceAfter: 45000, note: 'Birinchi bo\'lak', method: 'cash' as const, createdAt: 1700000002000 },
];

// Rendering uchun namunaviy chek: bitta satr qisman, bittasi to'liq qaytarilgan
const returnSale = {
  id: 's9', number: 42,
  items: [
    { productId: 'p1', name: 'Non', unit: 'dona' as const, price: 3000, cost: 2000, qty: 5, returnedQty: 2 },
    { productId: 'p2', name: 'Sut', unit: 'litr' as const, price: 11000, cost: 9000, qty: 1, returnedQty: 1 },
  ],
  subtotal: 26000, discountType: 'none' as const, discountValue: 0, total: 26000, costTotal: 19000,
  payType: 'debt' as const, paidAmount: 6000, debtAmount: 20000,
  customerId: 'c1', customerName: 'Ali Valiyev', status: 'partial' as const,
  refundedAmount: 6000, refundedCost: 4000, note: '', createdAt: 1700000000000,
};

const wrap = (el: React.ReactElement, path = '/') =>
  React.createElement(
    I18nextProvider,
    { i18n },
    React.createElement(MemoryRouter, { initialEntries: [path] }, el),
  );

const cases: [string, React.ReactElement, string][] = [
  ['DebtsPage', React.createElement(DebtsPage), '/debts'],
  ['CustomersPage', React.createElement(CustomersPage), '/customers'],
  ['PartySheet (ledger)', React.createElement(PartySheet), '/debts/c1'],
  ['PaymentSheet', React.createElement(PaymentSheet, { party: customer as any, mode: 'payment', onClose(){} }), '/debts'],
  ['LedgerTimeline', React.createElement(LedgerTimeline, { entries: entries as any, kind: 'customer', onDelete(){} }), '/'],
  ['LedgerTimeline (bo\'sh)', React.createElement(LedgerTimeline, { entries: [], kind: 'supplier' }), '/'],
  ['QuickCustomer (new)', React.createElement(QuickCustomer, {
    value: { mode: 'new', customerId: '', name: 'Aziz', phone: '+998901234567', advance: 5000, valid: true },
    onChange() {}, total: 17000,
  }), '/sales'],
  ['ReturnSheet', React.createElement(ReturnSheet, { sale: returnSale as any, onClose(){} }), '/sales'],
  ['ReturnSheet (hammasi qaytarilgan)', React.createElement(ReturnSheet, {
    sale: { ...returnSale, status: 'returned', items: returnSale.items.map((i) => ({ ...i, returnedQty: i.qty })) } as any,
    onClose() {},
  }), '/sales'],
  ['AppShell (layout + nav)', React.createElement(AppShell), '/'],
  ['StatisticsPage', React.createElement(StatisticsPage), '/stats'],
  ['SupplierPicker', React.createElement(SupplierPicker, { value: '', onChange(){} }), '/products'],
  ['SupplierPicker (tanlangan)', React.createElement(SupplierPicker, { value: 'c1', onChange(){} }), '/products'],
  ['QuickCustomer (existing)', React.createElement(QuickCustomer, {
    value: { mode: 'existing', customerId: 'c1', name: '', phone: '', advance: null, valid: true },
    onChange() {}, total: 17000,
  }), '/sales'],
];

let failed = 0;
for (const [name, el, path] of cases) {
  try {
    const html = renderToString(wrap(el, path));
    const hasText = /[\u0400-\u04FFa-zA-Z]/.test(html.replace(/<[^>]*>/g, ''));
    console.log(`${hasText ? '✅' : '⚠️ '} ${name} — ${html.length} bayt`);
    if (!hasText) failed++;
  } catch (e) {
    failed++;
    console.log(`❌ ${name}: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
