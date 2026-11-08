import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Sarlavha ostidagi qo'shimcha qator (masalan "to'liq ekran" tugmasi) */
  headerExtra?: ReactNode;
}

/**
 * Modal/bottom sheet — alohida route sifatida render qilinadi.
 * Mobil: pastdan chiquvchi sheet (drag-to-dismiss). Planshet/desktop: markazlashgan dialog.
 * Back tugmasi bosilganda route pop bo'ladi → sheet yopiladi.
 *
 * Scroll izolyatsiyasi:
 *  - `.sheet-panel` — `overflow: hidden` + flex column (head/body/foot);
 *  - `.sheet-body`  — `flex: 1; min-height: 0; overflow-y: auto` — FAQAT shu
 *    qism scroll bo'ladi, footer esa doim pastda ko'rinib turadi;
 *  - `overscroll-behavior: contain` — scroll tugaganda orqadagi sahifa
 *    "sakrab" ketmaydi (mobil brauzer/WebView'da muhim).
 */
export default function Sheet({ title, onClose, children, footer, wide, headerExtra }: SheetProps) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState(0);
  // Drag holati ref'da — har touchmove'da butun sheet (potensial uzun ro'yxat)
  // qayta render bo'lmasligi uchun.
  const dragging = useRef(false);
  const startY = useRef(0);
  const dragRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // onClose har renderda yangi funksiya bo'lishi mumkin — ref orqali barqaror ushlaymiz,
  // aks holda effekt har bosishda qayta ishga tushib, inputdan fokusni o'g'irlaydi.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    // Body scroll'ini qulflash — orqadagi sahifa sheet ostida siljib ketmasligi uchun.
    // `position: fixed` ishlatilmaydi (iOS'da layout sakraydi); overflow + touch-action yetarli.
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    // Faqat ochilishda fokus — mavjud fokusni buzmaslik uchun
    const el = panelRef.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={'sheet-panel' + (wide ? ' sheet-wide' : '')}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onTouchStart={(e) => {
          const zone = (e.target as HTMLElement).closest('[data-drag-zone]');
          if (!zone) return;
          startY.current = e.touches[0].clientY;
          dragging.current = true;
        }}
        onTouchMove={(e) => {
          if (!dragging.current) return;
          const next = Math.max(0, e.touches[0].clientY - startY.current);
          dragRef.current = next;
          setDrag(next);
        }}
        onTouchEnd={() => {
          if (!dragging.current) return;
          dragging.current = false;
          if (dragRef.current > 110) onClose();
          else { dragRef.current = 0; setDrag(0); }
        }}
      >
        <div data-drag-zone className="sheet-drag md:hidden" aria-hidden="true">
          <div className="sheet-handle" />
        </div>
        <div data-drag-zone className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        {headerExtra}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}
