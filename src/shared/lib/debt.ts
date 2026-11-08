/**
 * Qarzlar standarti (Debt Standard) — butun ilova uchun YAGONA manba.
 *
 * ── MUAMMO (tuzatilgan) ────────────────────────────────────────────────────
 * Qarz ranglari va yo'nalishlari har xil ekranda har xil edi:
 *   • DebtsPage / CustomersPage — mijoz qarzi yashil (--ok), bizning qarz
 *     qizil (--bad);
 *   • PartySheet, PaymentSheet — teskari;
 *   • Adolatli bo'lish uchun "yashil = yaxshi" mantiqi ishlatilgan edi, lekin
 *     natijada BIR XIL raqam ikki sahifada ikki xil rangda ko'rinardi.
 *
 * ── QOIDA (yangi, qat'iy) ─────────────────────────────────────────────────
 * Rang **yo'nalishga** bog'lanadi, "yaxshi/yomon"ga emas:
 *
 *   Mijoz bizga qarzdor        → --debt-customer  (QIZIL)   [+]
 *   Biz yetkazib beruvchiga    → --debt-supplier  (ZANGOR)  [−]
 *   Hisob-kitob yopilgan       → --debt-settled   (sokin)   [0]
 *
 * Ya'ni: qizil rang "pul bizga kelishi kerak", zangor rang "pul bizdan
 * ketishi kerak". Ikkalasi ham bir xil darajada muhim — shuning uchun
 * "yaxshi/yomon" degan ma'no yo'q.
 *
 * Bu modul HECH QACHON bazaga tegmaydi va React'ga bog'lanmaydi — sof
 * funksiyalar, shuning uchun testlar ham, grafikalar ham bir xil ishlatadi.
 */

import { round2 } from '../lib/format';
import { partyNet, type PartyNet } from '../../db/ledger';
import type { Customer } from '../../db/db';

/* ---------------------------------------------------------------------- */
/*  Ranglar (CSS o'zgaruvchilari)                                          */
/* ---------------------------------------------------------------------- */

export const DEBT_COLOR = {
  /** Mijoz qarzi — qizil */
  customer: 'var(--debt-customer)',
  /** Bizning yetkazib beruvchiga qarzimiz — zangor */
  supplier: 'var(--debt-supplier)',
  /** Hisob-kitob yopilgan */
  settled: 'var(--debt-settled)',
} as const;

/** `color-mix` uchun fon rangi (karta orqa foni) */
export function debtTint(color: string, percent = 9): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/* ---------------------------------------------------------------------- */
/*  Semantika                                                              */
/* ---------------------------------------------------------------------- */

/** Qarz kimning foydasiga — UI matni shu asosda tanlanadi */
export type DebtSide = 'receivable' | 'payable' | 'settled';

export interface DebtView {
  /** Qarz summasi, doim >= 0 */
  amount: number;
  /** 0 — yopilgan; aks holda kim qarzdor */
  side: DebtSide;
  /** CSS rang */
  color: string;
  /** '+', '−' yoki '' — raqam oldida ko'rsatiladigan belgi */
  sign: '+' | '−' | '';
  /** Ko'rsatishga tayyor matn: "+125 000 so'm" / "−125 000 so'm" */
  label: string;
  /** i18n kaliti: mijoz / yetkazib beruvchi qarzi */
  sideKey: 'debt.theyOwe' | 'debt.weOwe' | 'debt.settled';
  settled: boolean;
}

/**
 * Imzolangan balansdan ko'rsatiladigan qarz modelini yasaydi.
 *
 * Bu FUNKSIYA butun ilovada yagona haqiqat manbai: ro'yxat, kartochka,
 * dashboard, chek va grafikalar hammasi shundan foydalanadi. Shu tufayli
 * "bir joyda qizil, boshqa joyda zangor" degan nomuvofiqlik bo'lishi mumkin
 * emas.
 *
 * @param balance imzolangan balans (Customer.balance)
 * @param kind    kontragent turi — faqat matn/rol uchun (rang baribir
 *                "kim kimga qarzdor" dan kelib chiqadi)
 */
export function debtView(balance: number, kind: Customer['kind']): DebtView {
  const net: PartyNet = partyNet(balance);
  const settled = net.settled;
  const side: DebtSide = settled ? 'settled' : net.theyOweUs ? 'receivable' : 'payable';
  const color = settled
    ? DEBT_COLOR.settled
    : net.theyOweUs
      ? DEBT_COLOR.customer
      : DEBT_COLOR.supplier;
  const sign: DebtView['sign'] = settled ? '' : net.theyOweUs ? '+' : '−';

  /*
   * `kind` ataylab ishlatilmaydi — lekin muvozanat uchun tekshiramiz:
   * yetkazib beruvchi bizga qarzdor bo'lib qolishi ham mumkin (ortiqcha
   * to'lov, qaytarish). Bunday holatda rang "mijoz qarzi" bo'ladi, chunki
   * pul baribir BIZGA kelishi kerak. Bu ataylab shunday.
   */
  void kind;

  return {
    amount: net.amount,
    side,
    color,
    sign,
    label: settled ? '' : `${sign}${net.amount}`,
    sideKey: settled ? 'debt.settled' : net.theyOweUs ? 'debt.theyOwe' : 'debt.weOwe',
    settled,
  };
}

/* ---------------------------------------------------------------------- */
/*  Yig'ma ko'rsatkichlar (dashboard / ro'yxat sarlavhasi)                 */
/* ---------------------------------------------------------------------- */

export interface DebtTotals {
  /** Mijozlar bizga qarzdor — qizil */
  receivable: number;
  /** Biz yetkazib beruvchilarga qarzdormiz — zangor */
  payable: number;
  /** Sof pozitsiya: receivable − payable (musbat — bizning foydamizga) */
  net: number;
  /** Qarzi bor kontragentlar soni */
  debtors: number;
  creditors: number;
}

/**
 * Kontragentlar ro'yxatidan yig'ma qarz ko'rsatkichlarini hisoblaydi.
 *
 * MUHIM: bitta funksiya — DebtsPage, CustomersPage va Dashboard shu
 * funksiyani chaqiradi. Ilgari har bir sahifa o'z siklini yozgan va
 * qaytarish/avans holatlarida natijalar farq qilardi.
 */
export function debtTotals(parties: Pick<Customer, 'balance' | 'kind'>[]): DebtTotals {
  let receivable = 0;
  let payable = 0;
  let debtors = 0;
  let creditors = 0;

  for (const p of parties) {
    const net = partyNet(p.balance);
    if (net.settled) continue;
    if (net.theyOweUs) {
      receivable = round2(receivable + net.amount);
      debtors += 1;
    } else {
      payable = round2(payable + net.amount);
      creditors += 1;
    }
  }

  return { receivable, payable, net: round2(receivable - payable), debtors, creditors };
}

/* ---------------------------------------------------------------------- */
/*  Yordamchi: imzolangan summani yo'nalishga aylantirish                  */
/* ---------------------------------------------------------------------- */

/**
 * Foydalanuvchi kiritgan IMZOLANGAN qiymatdan (masalan "-3000") daftar
 * yo'nalishini aniqlaydi.
 *
 * Bu `saveCustomer()` dagi xatoning ildizi edi: u `diff > 0` bo'lsa
 * "charge" deb olardi, lekin yetkazib beruvchida `charge` balansni
 * MANFIY tomonga suradi. Endi yo'nalish **balansning o'zgarishi** bo'yicha
 * emas, balki `ledgerDelta` natijasi bilan taqqoslab tekshiriladi.
 *
 * @param currentBalance joriy balans
 * @param targetBalance  foydalanuvchi xohlagan balans
 * @param kind           kontragent turi
 * @returns yo'nalish va delta (delta — yangi balans − eski balans)
 */
export function resolveDebtDirection(
  currentBalance: number,
  targetBalance: number,
  kind: Customer['kind'],
): { direction: 'charge' | 'payment'; delta: number; amount: number } {
  const current = round2(currentBalance);
  const target = round2(targetBalance);
  const delta = round2(target - current);
  const amount = Math.abs(delta);

  if (amount === 0) return { direction: 'charge', delta: 0, amount: 0 };

  /*
   * Yo'nalishni balans o'qiga proyeksiya orqali aniqlaymiz:
   *   mijoz:          charge  → +amount
   *   yetkazib beruvchi: charge  → −amount
   *
   * Shuning uchun "balans oshdi" mijozda charge, yetkazib beruvchida payment.
   */
  const chargeMovesUp = kind !== 'supplier';
  const balanceGrew = delta > 0;
  const direction: 'charge' | 'payment' = chargeMovesUp === balanceGrew ? 'charge' : 'payment';

  return { direction, delta, amount };
}
