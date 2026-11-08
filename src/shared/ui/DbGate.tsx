import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, DatabaseZap, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMigrationReport, openDatabase, type OpenResult } from '../../db/db';

type Phase = { kind: 'loading' } | { kind: 'done'; result: OpenResult };

/** Toast faqat bir marta ko'rsatiladi (til almashganda effect qayta ishga tushadi) */
let reportShown = false;

/**
 * Ma'lumot qatlami uchun "error boundary".
 *
 * Ilova render bo'lishidan OLDIN bazani ochadi va:
 *  - migratsiya/tiklash natijasini bir marta ko'rsatadi (toast);
 *  - baza umuman ochilmasa (masalan, boshqa tab eski versiyani ushlab turgan
 *    yoki WebView IndexedDB'ni bloklagan bo'lsa) — tushunarli xabar va
 *    "qayta urinish" tugmasini beradi.
 *
 * Muhim: bu qatlam hech qachon ma'lumotni o'chirmaydi. Og'ir tiklash faqat
 * `openDatabase()` ichida, aniq va hujjatlashtirilgan holatlarda bo'ladi.
 */
export default function DbGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void openDatabase().then((result) => {
      if (cancelled) return;
      if (!reportShown && (result.status === 'repaired' || result.status === 'reseeded')) {
        // Bir marta, "db-*" xabarini toast orqali ko'rsatamiz
        reportShown = true;
        window.dispatchEvent(new CustomEvent('sp-toast', { detail: t(result.message ?? 'db.repaired') }));
      }
      // Debug/statistika uchun globalga yozamiz (Xotira bo'limida o'qiladi)
      (window as unknown as { __spMigration?: unknown }).__spMigration = result.report ?? getMigrationReport();
      setPhase({ kind: 'done', result });
    });
    return () => { cancelled = true; };
  }, [t]);

  if (phase.kind === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-mute">
        <Loader2 size={26} strokeWidth={1.5} className="animate-spin" />
        <p className="text-[0.875rem] font-semibold">{t('common.loading')}</p>
      </div>
    );
  }

  if (phase.result.status === 'blocked') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <div className="card w-full max-w-[420px] p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'color-mix(in srgb, var(--bad) 13%, transparent)', color: 'var(--bad)' }}>
            <DatabaseZap size={28} strokeWidth={1.5} />
          </div>
          <p className="text-[1.0625rem] font-extrabold">{t('db.blockedTitle')}</p>
          <p className="mt-2 text-[0.875rem] text-mute">{t('db.blockedText')}</p>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--warn)' }}>
            <AlertTriangle size={13} strokeWidth={2} /> {t('db.noDataLost')}
          </p>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={() => window.location.reload()}>
            <RefreshCw size={16} strokeWidth={1.5} /> {t('offline.retry')}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
