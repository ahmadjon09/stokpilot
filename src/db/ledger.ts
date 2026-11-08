/**
 * Qarz daftari (ledger) yordamchilari — SOF funksiyalar.
 *
 * Bu fayl ataylab yon ta'sirsiz: hisob-kitobni UI ham, migratsiya ham,
 * testlar ham bir xil qoida bo'yicha bajarishi kerak. Bazaga yozish
 * `src/db/actions.ts` dagi `applyPartyEntry()` da.
 *
 * ── BELGI KONVENSIYASI (butun ilova bo'ylab yagona) ────────────────────────
 *   balance > 0  →  kontragent BIZGA qarzdor
 *   balance < 0  →  BIZ kontragentga qarzdormiz
 *
 * Bu mijoz uchun ham, yetkazib beruvchi uchun ham bir xil ishlaydi:
 *   • mijoz nasiyaga oldi            → charge  → balance +  (u qarzdor) ✅
 *   • mijoz qarzini to'ladi          → payment → balance −  ✅
 *   • yetkazib beruvchidan qarzga oldik → charge  → balance −  (biz qarzdormiz) ✅
 *   • biz yetkazib beruvchiga to'ladik  → payment → balance +  ✅
 *
 * Ya'ni `charge` — "qarz oshdi", `payment` — "qarz kamaydi", lekin balans
 * o'qiga proyeksiya kontragent turiga qarab teskari ishorada bo'ladi
 * (mijoz ijobiy tomonda, yetkazib beruvchi manfiy tomonda). Shu sababli
 * `kind` har doim hisobga olinadi — bu funksiyani hech qachon "kind"siz
 * chaqirmang.
 *
 * Foydalanuvchiga ko'rsatish uchun `partyNet()` — har doim musbat son va
 * "kim kimga qarzdor" ma'nosi bilan.
 */

import type { Customer, LedgerDirection, LedgerEntry, LedgerSource, PayType } from './db';
import { round2 } from '../shared/lib/format';

/**
 * Yozuvning imzolangan balansga ta'siri.
 *
 * @param kind 'customer' — kontragent odatda bizga qarzdor bo'ladi (musbat o'q);
 *             'supplier' — biz unga qarzdor bo'lamiz (manfiy o'q).
 *
 * Mijoz:   charge +, payment −
 * Yetkazib beruvchi: charge −, payment +
 */
export function ledgerDelta(
  direction: LedgerDirection,
  amount: number,
  kind: Customer['kind'],
): number {
  const a = Math.abs(round2(amount));
  const axis = kind === 'supplier' ? -1 : 1;
  return direction === 'charge' ? axis * a : -axis * a;
}

/**
 * Foydalanuvchi nuqtai nazaridan "sof qarz" — doim >= 0.
 * `settled` — hisob-kitob yopilgan (qarz yo'q).
 */
export interface PartyNet {
  /** Qarz summasi (musbat) */
  amount: number;
  /** true — hech kim hech kimga qarzdor emas */
  settled: boolean;
  /** true — kontragent bizga qarzdor; false — biz qarzdormiz */
  theyOweUs: boolean;
}

export function partyNet(balance: number): PartyNet {
  const b = round2(balance);
  if (b === 0) return { amount: 0, settled: true, theyOweUs: true };
  return { amount: Math.abs(b), settled: false, theyOweUs: b > 0 };
}

/**
 * Berilgan tur (mijoz / yetkazib beruvchi) uchun yozuv turini aniqlaydi.
 * Yetkazib beruvchida "nasiyaga tovar oldik" = qarz oshishi, lekin balans
 * manfiy tomonga ketadi — shu sababli UI'da `partyNet()` ishlatiladi.
 */
export function isDebtorKind(kind: Customer['kind']): boolean {
  return kind === 'customer';
}

/* ---------------------------------------------------------------------- */
/*  Tarixni qayta hisoblash                                                */
/* ---------------------------------------------------------------------- */

/**
 * Yozuvlarni xronologik tartibda qayta o'tib, har biri uchun `balanceAfter`
 * ni tiklaydi va yakuniy balansni qaytaradi.
 *
 * Nima uchun kerak:
 *  - eski (v2) bazada `ledger` yo'q edi — v3 migratsiyasida shu funksiya
 *    mavjud balansdan boshlang'ich (opening) yozuv yasaydi;
 *  - to'lov o'chirilganda yoki tuzatish kiritilganda qoldiqlar ketma-ket
 *    buzilmasligi kerak.
 */
export function replayLedger(
  entries: LedgerEntry[],
  openingBalance = 0,
): { entries: LedgerEntry[]; balance: number } {
  const byTime = (a: LedgerEntry, b: LedgerEntry) =>
    a.createdAt - b.createdAt || a.id.localeCompare(b.id);

  /*
   * `opening` yozuvi HAR DOIM eng birinchi bo'lishi shart — u boshlang'ich
   * nuqta. Legacy bazada `customer.createdAt` yo'q bo'lsa validator uni
   * "hozir" bilan to'ldiradi va yozuv eski sotuvlardan KEYIN sanalib qolardi;
   * natijada yakuniy balans buzilardi (ma'lumot "yo'qolgan" ko'rinadi).
   * Shu sababli vaqt bo'yicha emas, tur bo'yicha ajratamiz.
   */
  const openings = entries.filter((e) => e.source === 'opening').sort(byTime);
  const movements = entries.filter((e) => e.source !== 'opening').sort(byTime);

  let balance = round2(openingBalance);
  const orderedOpenings = openings.map((e) => {
    balance = round2(e.balanceAfter);
    return e;
  });
  const orderedMovements = movements.map((e) => {
    balance = round2(balance + ledgerDelta(e.direction, e.amount, e.partyKind));
    return { ...e, balanceAfter: balance };
  });

  return { entries: [...orderedOpenings, ...orderedMovements], balance };
}

/**
 * Yozuvlardan yakuniy balansni hisoblash.
 * `opening` yozuvi mutlaq boshlang'ich nuqta bo'lgani uchun uning
 * `balanceAfter` qiymati asos qilib olinadi (delta emas).
 */
export function sumLedger(entries: LedgerEntry[]): number {
  return replayLedger(entries, 0).balance;
}

/* ---------------------------------------------------------------------- */
/*  Statistika                                                             */
/* ---------------------------------------------------------------------- */

export interface LedgerStats {
  /** Jami qarzga yozilgan (charge) */
  charged: number;
  /** Jami to'langan (payment) */
  paid: number;
  /** To'lovlar soni */
  payments: number;
  /** Oxirgi to'lov sanasi */
  lastPaymentAt: number | null;
}

export function ledgerStats(entries: LedgerEntry[]): LedgerStats {
  let charged = 0;
  let paid = 0;
  let payments = 0;
  let lastPaymentAt: number | null = null;
  for (const e of entries) {
    if (e.direction === 'charge') charged = round2(charged + e.amount);
    else {
      paid = round2(paid + e.amount);
      payments += 1;
      if (lastPaymentAt === null || e.createdAt > lastPaymentAt) lastPaymentAt = e.createdAt;
    }
  }
  return { charged, paid, payments, lastPaymentAt };
}

/** Yangi yozuv uchun xom (draft) obyekt — bazaga yozishdan oldin */
export interface PartyEntryInput {
  party: Customer;
  direction: LedgerDirection;
  amount: number;
  source?: LedgerSource;
  note?: string;
  method?: PayType | '';
  saleId?: string;
  saleNumber?: number;
  /** Yozuv vaqti (test/migratsiya uchun); bo'lmasa hozirgi vaqt */
  at?: number;
}

/** Yozuv qoralama obyektini yasaydi (id/balanceAfter chaqiruvchida to'ldiriladi) */
export function buildLedgerEntry(input: PartyEntryInput, id: string, balanceAfter: number): LedgerEntry {
  const { party } = input;
  return {
    id,
    partyId: party.id,
    partyKind: party.kind,
    direction: input.direction,
    source: input.source ?? 'adjustment',
    amount: Math.abs(round2(input.amount)),
    balanceAfter: round2(balanceAfter),
    note: (input.note ?? '').trim(),
    method: input.method ?? '',
    ...(input.saleId ? { saleId: input.saleId, saleNumber: input.saleNumber } : {}),
    createdAt: input.at ?? Date.now(),
  };
}
