import { useEffect, useRef, useState } from 'react';
import { parseNumber, truncateDecimals } from '../lib/format';
import { useSettings } from '../../store/settings';

interface NumberInputProps {
  value: number | null;
  onChange: (v: number | null) => void;
  decimals?: number;
  allowNegative?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}

/**
 * Yagona raqam kiritish komponenti:
 * — yozish paytida 1000 → "1 000" formatlanadi;
 * — caret pozitsiyasi saqlanadi (raqamlar soni bo'yicha qayta hisoblanadi);
 * — paste, backspace, o'nlik kasr, manfiy son qo'llab-quvvatlanadi;
 * — ichki qiymat doim toza number|null.
 */
export default function NumberInput({
  value, onChange, decimals = 2, allowNegative = false,
  placeholder, className, id, autoFocus, ariaLabel,
}: NumberInputProps) {
  const sep = useSettings((s) => s.decimalSep);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const caretRef = useRef<{ d: number; afterSep: boolean } | null>(null);

  const fmt = (v: number | null, forceSep = false): string => {
    if (v == null || !Number.isFinite(v)) return '';
    const neg = v < 0;
    const [intPart, rawFrac] = Math.abs(v).toFixed(decimals).split('.');
    const frac = rawFrac ? rawFrac.replace(/0+$/, '') : '';
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    let out = grouped;
    if (frac) out += sep + frac;
    else if (forceSep) out += sep;
    return (neg && allowNegative ? '-' : '') + out;
  };

  const [text, setText] = useState<string>(() => fmt(value));

  // Tashqaridan qiymat o'zgarsa (fokus yo'q bo'lsa) — qayta formatlash
  useEffect(() => {
    if (!focusedRef.current) setText(value == null ? '' : fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, sep]);

  // Caret pozitsiyasini tiklash
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !caretRef.current || !focusedRef.current) return;
    const { d, afterSep } = caretRef.current;
    caretRef.current = null;
    let pos = text.length;
    for (let i = 0; i <= text.length; i++) {
      const before = text.slice(0, i);
      const digits = (before.match(/\d/g) || []).length;
      const hasSep = decimals > 0 && before.includes(sep);
      if (digits === d && hasSep === afterSep) { pos = i; break; }
      if (digits > d) { pos = i; break; }
    }
    try { el.setSelectionRange(pos, pos); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value;
    const pos = e.target.selectionStart ?? raw.length;
    const before = raw.slice(0, pos);

    let cleaned = raw.replace(/[^\d\s\u00A0\u202F.,-]/g, '');
    if (!allowNegative) cleaned = cleaned.replace(/-/g, '');
    // bitta ajratgich: birinchisini saqlaymiz
    let seenSep = false;
    cleaned = cleaned.replace(/[.,]/g, () => {
      if (decimals === 0) return '';
      if (seenSep) return '';
      seenSep = true;
      return sep;
    });
    // minus faqat boshida
    cleaned = cleaned.replace(/(?!^)-/g, '');
    if (decimals > 0) cleaned = truncateDecimals(cleaned, decimals);

    const digitsBefore = (before.match(/\d/g) || []).length;
    const sepBefore = decimals > 0 && /[.,]/.test(before);
    caretRef.current = { d: digitsBefore, afterSep: sepBefore };

    const num = parseNumber(cleaned);
    const hadSep = decimals > 0 && cleaned.includes(sep);
    let display: string;
    if (num == null) {
      if (allowNegative && cleaned.trim() === '-') display = '-';
      else if (hadSep) display = fmt(0, true);
      else display = '';
    } else {
      display = fmt(num, hadSep && !String(Math.abs(num)).includes('.'));
    }
    setText(display);
    onChange(num);
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={'input tnum ' + (className ?? '')}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={handleChange}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => {
        focusedRef.current = false;
        setText(value == null ? '' : fmt(value));
      }}
    />
  );
}
