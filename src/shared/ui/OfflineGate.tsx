import { useEffect, useState, type ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Internet aloqasi bo'lmaganda butun ilovani bloklaydigan modal.
 *  Foydalanuvchi ma'lumotlari (IndexedDB) hech qachon o'chirilmaydi yoki
 *  o'zgartirilmaydi — shunchaki interfeys internet yoqilmaguncha to'siladi. */
export default function OfflineGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const online = useOnline();

  if (online) return <>{children}</>;

  return (
    <>
      {children}
      <div className="dialog-backdrop" style={{ zIndex: 200 }} role="alertdialog" aria-modal="true" aria-label={t('offline.title')}>
        <div className="dialog-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{ width: 64, height: 64, background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <WifiOff size={30} strokeWidth={1.5} />
          </div>
          <p className="text-[1.0625rem] font-extrabold">{t('offline.title')}</p>
          <p className="mt-2 text-[0.875rem] text-mute">{t('offline.text')}</p>
          <button
            type="button"
            className="btn btn-primary mt-5 w-full"
            onClick={() => {
              if (navigator.onLine) window.location.reload();
            }}
          >
            {t('offline.retry')}
          </button>
          <p className="mt-3 text-[0.75rem] text-mute">{t('offline.waiting')}</p>
        </div>
      </div>
    </>
  );
}
