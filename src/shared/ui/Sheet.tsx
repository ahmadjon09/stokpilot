import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * Modal/bottom sheet — alohida route sifatida render qilinadi.
 * Mobil: pastdan chiquvchi sheet (drag-to-dismiss). Planshet/desktop: markazlashgan dialog.
 * Back tugmasi bosilganda route pop bo'ladi → sheet yopiladi.
 */
export default function Sheet({ title, onClose, children, footer, wide }: SheetProps) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState(0);
  const dragging = useRef(false);
  const startY = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // onClose har renderda yangi funksiya bo'lishi mumkin — ref orqali barqaror ushlaymiz,
  // aks holda effekt har bosishda qayta ishga tushib, inputdan fokusni o'g'irlaydi.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Faqat ochilishda fokus — mavjud fokusni buzmaslik uchun
    const el = panelRef.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
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
          dragging.current = true;
          startY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (!dragging.current) return;
          setDrag(Math.max(0, e.touches[0].clientY - startY.current));
        }}
        onTouchEnd={() => {
          if (!dragging.current) return;
          dragging.current = false;
          if (drag > 110) onClose();
          else setDrag(0);
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
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}
