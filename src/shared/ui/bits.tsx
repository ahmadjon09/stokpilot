import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Plus, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buzz } from '../lib/misc';

export function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string | null; hint?: string; children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span>
        : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={'seg ' + (className ?? '')} role="tablist">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={value === o.value}
            className={'seg-btn' + (value === o.value ? ' seg-on' : '')}
            onClick={() => { buzz(6); onChange(o.value); }}
          >
            {Icon && <Icon size={15} strokeWidth={1.5} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: {
  icon: LucideIcon; title: string; hint?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--accent-soft)' }}>
        <Icon size={28} strokeWidth={1.5} className="text-accent" />
      </div>
      <div>
        <p className="text-[0.9375rem] font-bold">{title}</p>
        {hint && <p className="mt-1 max-w-[280px] text-[0.8125rem] text-mute">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; text: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <p className="text-[1rem] font-bold">{title}</p>
        <p className="mt-2 text-[0.875rem] text-mute">{text}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="button" className={'btn flex-1 ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={() => { buzz(12); onConfirm(); }}>
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1 }: {
  value: number; onChange: (v: number) => void; min?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="icon-btn" style={{ width: 40, height: 40, background: 'var(--surface2)' }}
        aria-label="−1" onClick={() => { buzz(6); onChange(Math.max(min, value - 1)); }}>
        <Minus size={16} strokeWidth={1.5} />
      </button>
      <span className="tnum min-w-[38px] text-center text-[0.9375rem] font-bold">{value}</span>
      <button type="button" className="icon-btn" style={{ width: 40, height: 40, background: 'var(--surface2)' }}
        aria-label="+1" onClick={() => { buzz(6); onChange(value + 1); }}>
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Obyekt hajmini inson-o'qiy formatda */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/** Toast host — window 'sp-toast' hodisalarini tinglaydi */
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2400);
    };
    window.addEventListener('sp-toast', onToast);
    return () => { window.removeEventListener('sp-toast', onToast); window.clearTimeout(timer); };
  }, []);
  if (!msg) return null;
  return <div className="toast" role="status">{msg}</div>;
}
