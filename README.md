# StokPilot

> **"Ombor va sotuv — internetsiz ham nazoratda."**

To'liq offline-first, mobil/planshet uchun inventar-ombor va sotuv boshqaruvi PWA.
Backend yo'q — 100% client-side, barcha ma'lumot **IndexedDB** (Dexie.js) da, rasmlar siqilgan base64 ko'rinishida.

## Texnik stack

| Qatlam | Texnologiya |
|---|---|
| Framework | React 18 + TypeScript (strict), Vite 5 |
| Routing | React Router v6 — har bir modal/bottom-sheet alohida route (`/products/:id/edit`, `/sales/receipt/:id`, `/settings/storage`…). Back tugmasi sheet'ni yopadi, deep-link va refresh ishlaydi |
| DB | Dexie.js (IndexedDB), **versiyalangan schema + migratsiya** (`db.version(1..4)`, `onupgradeneeded` ichida validatsiya/tiklash) |
| State | Zustand (persist) sozlamalar uchun |
| UI | Tailwind CSS v4 + CSS-variable theme tokenlari |
| Charts | Recharts (responsive, theme-aware) |
| i18n | i18next — uz (lotin, default) / ru, hardcoded matn yo'q |
| Icons | Lucide (1.5px stroke, emoji yo'q) |
| PWA | Service Worker + Web App Manifest, installable, to'liq offline |

## Ishga tushirish

```bash
npm install
npm run build      # tsc strict + vite build
npm run preview    # production preview (SW bilan offline)
npm run dev        # dev server
npm run check          # migratsiya + ledger + navigatsiya + render + tsc
npm run check:ledger   # qarz daftari business-logic (33 ta tekshiruv)
npm run check:render   # yangi UI komponentlarining render smoke-testi
```

## Ma'lumotlar xavfsizligi (migratsiya)

Baza versiyalangan: har bir sxema o'zgarishi `db.version(N).upgrade(...)` bilan
kuzatiladi. Legacy yozuvlar **hech qachon o'chirilmaydi** — ular `src/db/validate.ts`
orqali normallashtiriladi (yo'q maydonlar to'ldiriladi, noto'g'ri tiplar
tuzatiladi, `"1 234,5"` kabi satrlar songa aylantiriladi).

| Qatlam | Fayl | Vazifa |
|---|---|---|
| Validatsiya | `src/db/validate.ts` | har bir yozuv uchun `{value, changed}` — buzilganini `null` qaytaradi |
| Migratsiya | `src/db/migrations.ts` | `normalizeDatabase(tx)` — jadval bo'yicha tuzatish + bog'lanishlarni tiklash (rasm havolalari, chek raqamlari) |
| Sxema | `src/db/db.ts` | `DB_VERSION`, `version(1)` (o'zgarmas), `version(2).upgrade()`, `openDatabase()` fallback, `repairDatabase()` |
| Error boundary | `src/shared/ui/DbGate.tsx` | baza ochilmasa tushunarli xabar + retry; tiklash natijasini toast bilan ko'rsatadi |

Yarim uzilgan migratsiya xavfsiz: barcha qadamlar **idempotent**
(`npm run check:migrations` buni tekshiradi).

Baza umuman ochilmasa (`DataError`, `BlockedError`) — avval yozuvlar "rescue"
qilinadi, keyin baza qayta yaratiladi; ma'lumotninig bir qismi ham o'qilmasa,
baza **o'chirilmaydi** — foydalanuvchiga xabar va "qayta urinish" beriladi.
Xotira bo'limida qo'lda "Ma'lumotlarni tekshirish" (`repairDatabase`) tugmasi bor.

## Modullar

- **Dashboard** — 4 KPI, sotuv dinamikasi (line), kategoriya taqsimoti (donut), top-10 (bar), zaxira harakati (area). Widgetlar sozlamada yoqiladi/o'chiriladi va tartibi o'zgaradi.
- **Mahsulotlar** — SKU, kategoriya, birlik, tannarx/narx, min. qoldiq, shtrix-kod, ko'p rasm (canvas resize 1200px + WebP/JPEG q=0.8, thumbnail 200px alohida store'da), qidiruv/filtr/saralash, bulk o'chirish, progressive disclosure forma, autosave draft, aqlli defaultlar (oxirgi kategoriya, SKU avtogeneratsiya).
- **Zaxira** — kirim / chiqim / inventarizatsiya (recount), audit-log (har bir harakat `moves` jadvalida, nom snapshot bilan).
- **Sotuv (POS)** — tez savdo grid, savat, chegirma (% yoki summa), to'lov turi (naqd/karta/o'tkazma/nasiya), mijoz biriktirish, chek (PDF — chop etish), **donalab/qismli qaytarish** (zaxira, tushum, foyda va nasiya qarzini qayta hisoblaydi).
- **Mijozlar / yetkazib beruvchilar** — qarz balansi, tarix, daftarga o'tish.
- **Qarzlar** — mijoz va yetkazib beruvchi bo'yicha yagona daftar: to'lovlar, bo'lib to'lash, izohlar, qoldiq tarixi.
- **Hisobotlar** — 7/30/90 kun: tushum, foyda, marja, o'rtacha chek, ABC-tahlil, kam qolgan tovarlar, o'lik zaxira. CSV (Excel) eksport + chop etish (PDF).
- **Sozlamalar** — til, valyuta, o'nlik ajratgich, sana formati, hafta boshi; Light/Dark/System mavzu (real vaqt), accent rang, radius 0/8/16, zichlik, shrift o'lchami; bottom-nav elementlari (max 5) va dashboard widgetlarini tanlash/tartiblash; biznes (nom, logotip, NDS, chek matni, default min. qoldiq).
- **Xotira** — `navigator.storage.estimate()`, jadval bo'yicha hajm + progress bar, eng katta 10 rasm, kesh tozalash, rasmlarni qayta siqish, eski loglarni o'chirish, hammasini o'chirish (tasdiqlash bilan).
- **Backup** — to'liq JSON eksport/import, har eksportda avtomatik snapshot (oxirgi 3 ta), qurilmalararo fayl orqali ko'chirish.

## Raqamlar (NumberInput)

- Yozish paytida `1000 → 1 000` (space grouping), caret **sakramaydi** (raqamlar soni bo'yicha qayta pozitsiyalanadi).
- Paste / backspace / o'nlik kasr / manfiy son / `inputMode="decimal"` — barchasi ishlaydi.
- Pul hisoblari `roundHalfEven` (bank rounding) bilan; ichki qiymat doim toza `number`.

## Papka strukturasi

```
src/
  db/            # Dexie schema, seed, tranzaksiya amallari
  features/      # dashboard, products, stock, sales, customers, reports, settings
  i18n/          # uz.ts, ru.ts
  layouts/       # AppShell (bottom nav / sidebar / FAB)
  shared/lib/    # format, img, backup, csv, theme, misc
  shared/ui/     # NumberInput, Sheet, ProductPicker, bits
  store/         # settings (zustand persist)
```

## Sotuv tarixi va chek detali

- `/sales/history` — qidiruv (chek raqami / mijoz / mahsulot), "qaytarilmagan" filtri;
  qatorning istalgan joyiga bosilsa chek ochiladi.
- `/sales/receipt/:id` — mahsulotlar, oraliq jami, chegirma, NDS, jami, to'lov turi,
  mijoz, tannarx va foyda (ekranda; chop etishda ko'rinmaydi), qaytarilgan holati.
- Uch holat aniq ajratiladi: `undefined` — skeleton, `null` — "Chek topilmadi", yozuv — detal.
- Sheet'lar nested ochilganda orqa fon meros olinadi (`resolveBackground`), shu sababli
  Savat → Tarix → Chek zanjirida "orqaga" POS sahifasiga qaytaradi.

## Qarz daftari (ledger) — v3

Mijoz ham, yetkazib beruvchi ham **bitta jadval** (`ledger`) orqali yuritiladi.
Har bir yozuv: yo'nalish, summa, manba, izoh, to'lov usuli va **o'sha paytdagi
qoldiq** (`balanceAfter`) — shu tufayli tarix istalgan nuqtadan tiklanadi.

### Belgi konvensiyasi (butun ilova bo'ylab yagona)

```
balance > 0  →  kontragent BIZGA qarzdor
balance < 0  →  BIZ kontragentga qarzdormiz
```

| Hodisa | direction | Mijoz balansi | Yetkazib beruvchi balansi |
|---|---|---|---|
| Nasiyaga sotildi / qarzga tovar oldik | `charge` | `+` (u qarzdor) | `−` (biz qarzdormiz) |
| To'lov qabul qilindi / to'lov qilindi | `payment` | `−` | `+` |
| Nasiya qaytarildi | `payment` (faqat to'lanmagan qism) | `−` | — |

UI hech qachon xom belgini ko'rsatmaydi — `partyNet(balance)` orqali
"bizga qarzdor / biz qarzdormiz" va musbat summa chiqariladi.

### Muhim qoidalar

- `Customer.balance` — **kesh (cache)**: faqat `applyPartyEntry()` / `saveCustomer()` orqali
  o'zgaradi va har doim daftar yozuvi bilan birga (atomar tranzaksiya).
- `opening` yozuvi — daftarning boshlang'ich nuqtasi; u **har doim eng birinchi**
  hisoblanadi (`replayLedger` vaqt bo'yicha emas, tur bo'yicha ajratadi). Bu
  `createdAt` yo'q legacy mijozlarda yakuniy balans buzilishining oldini oladi.
- `sale` va `opening` yozuvlari o'chirilmaydi — sotuv/qoldiq bilan birga yashaydi.
- Qaytarishda faqat **to'lanmagan** qism qarzdan chiqariladi (avans qarz emas).

### Modul xaritasi

| Fayl | Vazifa |
|---|---|
| `src/db/ledger.ts` | sof funksiyalar: `ledgerDelta`, `partyNet`, `replayLedger`, `ledgerStats` |
| `src/db/migrations.ts` | `migrateV2toV3` — mavjud balans va nasiya sotuvlarini daftarga ko'chiradi (idempotent) |
| `src/db/actions.ts` | `applyPartyEntry`, `recordPayment`, `adjustDebt`, `deleteLedgerEntry`, `completeSale`, `returnSale` |
| `src/features/debts/` | `DebtsPage` (ro'yxat + sof pozitsiya), `PartySheet` (kartochka + tarix), `PaymentSheet`, `LedgerTimeline` |

### Savatdan tez mijoz yaratish (nasiya)

Nasiya tanlanganda savat ichida `QuickCustomer` ochiladi: mavjud mijozni tanlash
yoki **ism + telefon** bilan yangi mijoz. Yangi mijoz bazaga faqat checkout
paytida, `completeSale()` tranzaksiyasi ichida yoziladi — bekor qilinsa
"bo'sh" kontakt qolmaydi. Avans maydoni darhol to'lanadigan qismni bildiradi;
qolgani qarz sifatida yangi mijozga biriktiriladi.

## Qismli (donalab) qaytarish — v4

Chekni butunlay qaytarish shart emas: har bir satrdan **1..N dona** qaytarish mumkin.

### Ma'lumot modeli

| Maydon | Ma'nosi |
|---|---|
| `SaleItem.qty` | **sotilgan** miqdor — hech qachon o'zgarmaydi (audit asosi) |
| `SaleItem.returnedQty` | shu satrdan jami qaytarilgan miqdor; qoldiq = `qty − returnedQty` |
| `Sale.refundedAmount` / `refundedCost` | qaytarilgan summa va tannarx (tez hisobot uchun kesh) |
| `Sale.status` | `done` → `partial` → `returned` (doim `saleStatus()` bilan qayta hisoblanadi) |
| `returns` jadvali | har bir qaytarish amali — **o'zgarmas dalolatnoma**: satrlar, miqdor, summa, qarzga ta'siri, izoh, vaqt |

`returns` yozuvlari hech qachon tahrirlanmaydi/o'chirilmaydi: "nima, qancha va qachon
qaytarilgani" faqat shu yerdan olinadi. Har bir amal uchun `moves` ga `type: 'return'`
zaxira harakati ham yoziladi.

### Hisob-kitob qoidalari

1. **Chegirma ulushi** — qaytarilgan summa chekdagi yakuniy nisbat bo'yicha hisoblanadi:
   `refund = (total − allaqachon qaytarilgan) × satr ulushi`. 10% chegirmali chekdan
   qaytarish ham 10% chegirmali summada bo'ladi, aks holda foyda buzilardi.
2. **Tiyin yo'qolmaydi** — satrlar proporsional yaxlitlanadi, yaxlitlash qoldig'i eng katta
   satrga qo'shiladi.
3. **Nasiya** — faqat **to'lanmagan** qism qarzdan chiqariladi, qolgani naqd qaytariladi
   (`settlement: 'cash' | 'debt'`). Qarz hech qachon manfiyga tushmaydi.
4. **Hisobotlar** — `status` bo'yicha emas, **sof summa** bo'yicha hisoblanadi
   (`src/shared/lib/salesStats.ts`). Ilgari `status === 'done'` filtri qismli qaytarilgan
   chekni hisobotdan butunlay yo'qotardi — endi `total − refundedAmount` ishlatiladi.

### Migratsiya (v3 → v4)

- Barcha eski satrlarga `returnedQty: 0` qo'shiladi, `refundedAmount/refundedCost` = 0.
- v3 da `status: 'returned'` bo'lgan cheklar uchun satrlar `returnedQty = qty` qilib
  belgilanadi va bitta `migrated: true` dalolatnoma yaratiladi — eski qaytarishlar
  tarixda ko'rinadi, hisobot esa o'zgarmaydi.
- **Idempotent**: dalolatnomasi bor chekka hech narsa qo'shilmaydi; `repairDatabase()`
  qayta ishga tushirilsa ham natija bir xil.

### Modul xaritasi

| Fayl | Vazifa |
|---|---|
| `src/db/returns.ts` | sof matematika: `remainingQty`, `saleStatus`, `planReturn`, `discountFactor` |
| `src/db/actions.ts` | `returnItems(saleId, selection, note)` — atomar amal; `returnSale()` — "hammasi" qulayligi |
| `src/features/sales/ReturnSheet.tsx` | mobil qaytarish oynasi: satr bo'yicha −/+ stepper, "Hammasi", izoh, yakuniy hisob |
| `src/features/sales/ReceiptSheet.tsx` | chek detali: satr holati, sof summa/foyda, qaytarishlar tarixi |
| `src/shared/lib/salesStats.ts` | hisobot uchun sof ko'rsatkichlar (`saleNetTotal`, `itemStats`, …) |
| `scripts/returns-check.mts` | 56 ta tekshiruv (56 assertions) |

### UX qoidalari (mobil)

- Har bir satr — alohida karta: `−` / miqdor maydoni / `+` / `Hammasi`. Tugmalar 40px.
- `+` tugmasi qoldiqda **o'chadi**, kiritilgan qiymat avtomatik `clamp` qilinadi —
  qoldiqdan ko'p qaytarish imkonsiz.
- To'liq qaytarilgan satr xira ko'rinadi va `✓` bilan belgilanadi (qayta tanlanmaydi).
- Tasodifiy to'liq qaytarishning oldini olish: yakuniy panelda summa, qarzdan kamayishi
  va "chekda qoladi" ko'rsatiladi; tasdiqlashdan oldin tanlov ko'rinib turadi.
- Qaytarishdan keyin chek yangilanadi (qayta ochiladi), foydalanuvchi qolgan donalarni
  darhol qaytarishi mumkin.

## Mobil savat (POS) layouti

```
.cart-panel            flex column, max-height: calc(100dvh - …), overflow hidden
 ├─ .cart-panel-head   flex: none
 ├─ .cart-body         flex: 1 1 auto; min-height: 0; overflow-y: auto   ← faqat shu scroll
 └─ .cart-foot         flex: none                                        ← "To'lovni yakunlash"
```

`min-height: 0` bo'lmasa flex bola kontentni cho'zib, tugmalarni ekrandan chiqaradi.
Amallar paneli scroll konteyneridan tashqarida — mahsulot soni qanchalik ko'p bo'lsa ham
tugma doim ko'rinadi. `overscroll-behavior: contain` orqa fon "sakrashini" to'xtatadi.

## Keyingi bosqich uchun yo'nalishlar

- `db.version(5)` — masalan, `sales.items` uchun alohida jadval (juda katta bazalar uchun)
- TanStack Virtual (juda katta ro'yxatlar), exceljs/pdfmake kutubxonalari
- Swipe amallar va pull-to-refresh kengaytmalari
