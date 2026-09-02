# StokPilot

> **"Ombor va sotuv — internetsiz ham nazoratda."**

To'liq offline-first, mobil/planshet uchun inventar-ombor va sotuv boshqaruvi PWA.
Backend yo'q — 100% client-side, barcha ma'lumot **IndexedDB** (Dexie.js) da, rasmlar siqilgan base64 ko'rinishida.

## Texnik stack

| Qatlam | Texnologiya |
|---|---|
| Framework | React 18 + TypeScript (strict), Vite 5 |
| Routing | React Router v6 — har bir modal/bottom-sheet alohida route (`/products/:id/edit`, `/sales/receipt/:id`, `/settings/storage`…). Back tugmasi sheet'ni yopadi, deep-link va refresh ishlaydi |
| DB | Dexie.js (IndexedDB), versiyalangan schema (`db.version(1)`) |
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
```

## Modullar

- **Dashboard** — 4 KPI, sotuv dinamikasi (line), kategoriya taqsimoti (donut), top-10 (bar), zaxira harakati (area). Widgetlar sozlamada yoqiladi/o'chiriladi va tartibi o'zgaradi.
- **Mahsulotlar** — SKU, kategoriya, birlik, tannarx/narx, min. qoldiq, shtrix-kod, ko'p rasm (canvas resize 1200px + WebP/JPEG q=0.8, thumbnail 200px alohida store'da), qidiruv/filtr/saralash, bulk o'chirish, progressive disclosure forma, autosave draft, aqlli defaultlar (oxirgi kategoriya, SKU avtogeneratsiya).
- **Zaxira** — kirim / chiqim / inventarizatsiya (recount), audit-log (har bir harakat `moves` jadvalida, nom snapshot bilan).
- **Sotuv (POS)** — tez savdo grid, savat, chegirma (% yoki summa), to'lov turi (naqd/karta/o'tkazma/nasiya), mijoz biriktirish, chek (PDF — chop etish), qaytarish (return) zaxirani qaytaradi va nasiya balansini to'g'irlaydi.
- **Mijozlar / yetkazib beruvchilar** — qarz balansi, tarix.
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

## Keyingi bosqich uchun yo'nalishlar

- `db.version(2)` migratsiyalari uchun tayyor schema
- TanStack Virtual (juda katta ro'yxatlar), exceljs/pdfmake kutubxonalari
- Swipe amallar va pull-to-refresh kengaytmalari
