/**
 * Sheet/route navigatsiya smoke-testi (2-topshiriq regressiyasi).
 * Bu yerda haqiqiy xato takrorlanadi:
 *   Savat → Sotuvlar tarixi → Chek detali.
 * Ilgari "background" zanjiri buzilib, orqa fon `/` ga sakrab ketardi va
 * chek detali ko'rinmasdi.
 * Ishga tushirish: npx tsx scripts/nav-check.mts
 */
import { baseRouteFor, isSheetRoute, resolveBackground } from '../src/shared/lib/nav.ts';

type Case = { name: string; got: unknown; want: unknown };
const cases: Case[] = [];

// 1) POS sahifasidan tarixni ochish
const bg1 = resolveBackground('/sales', '', null);
cases.push({ name: 'POS → tarix: fon /sales', got: bg1, want: { pathname: '/sales', search: '' } });

// 2) Tarix sheet'idan chek detali ochish (regressiya shu yerda edi)
const bg2 = resolveBackground('/sales/history', '', { background: bg1 });
cases.push({ name: 'tarix → chek: fon /sales', got: bg2, want: { pathname: '/sales', search: '' } });

// 3) Deep-link: chek to'g'ridan-to'g'ri ochildi (orqa fon yo'q)
const bg3 = resolveBackground('/sales/receipt/abc', '', null);
cases.push({ name: 'deep-link chek: fon /sales', got: bg3, want: { pathname: '/sales', search: '' } });

// 4) Buzilgan state: background o'zi sheet route bo'lib qolgan
const bg4 = resolveBackground('/sales/receipt/abc', '', { background: { pathname: '/sales/history', search: '' } });
cases.push({ name: 'buzilgan state tuzatiladi', got: bg4, want: { pathname: '/sales', search: '' } });

// 5) Filtr (search) saqlanadi
const bg5 = resolveBackground('/products', '?q=non', null);
cases.push({ name: 'search saqlanadi', got: bg5, want: { pathname: '/products', search: '?q=non' } });

// 6) Sheet route aniqlash
cases.push({ name: 'isSheetRoute(/sales/history)', got: isSheetRoute('/sales/history'), want: true });
cases.push({ name: 'isSheetRoute(/sales)', got: isSheetRoute('/sales'), want: false });
cases.push({ name: 'isSheetRoute(/)', got: isSheetRoute('/'), want: false });

// 7) baseRouteFor
cases.push({ name: "baseRouteFor(/settings/storage)", got: baseRouteFor('/settings/storage'), want: '/settings' });
cases.push({ name: "baseRouteFor(/)", got: baseRouteFor('/'), want: '/' });

let failed = 0;
for (const c of cases) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) { failed++; console.log(`FAIL: ${c.name}\n  got  ${JSON.stringify(c.got)}\n  want ${JSON.stringify(c.want)}`); }
}
console.log(failed === 0 ? `✅ Barcha ${cases.length} navigatsiya tekshiruvi o'tdi` : `❌ ${failed} yiqildi`);
process.exit(failed === 0 ? 0 : 1);
