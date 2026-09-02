import { useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Download, HardDrive, Image as ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, type Snapshot } from '../../db/db';
import { wipeAll } from '../../db/seed';
import { exportAllToFile, isValidBackup, restoreBackup, restoreSnapshot } from '../../shared/lib/backup';
import { formatDateTime } from '../../shared/lib/format';
import { processImageFile } from '../../shared/lib/img';
import { ACCENTS, useSettings, type NavKey, type WidgetKey } from '../../store/settings';
import { useOpenSheet } from '../../shared/lib/nav';
import { buzz, toast } from '../../shared/lib/misc';
import NumberInput from '../../shared/ui/NumberInput';
import { ConfirmDialog, Field, Segmented } from '../../shared/ui/bits';
import { NAV_META } from '../../layouts/AppShell';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[0.9375rem] font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

const ALL_NAV: NavKey[] = ['dashboard', 'products', 'sales', 'stock', 'customers', 'reports', 'settings'];
const ALL_WIDGETS: { key: WidgetKey; labelKey: string }[] = [
  { key: 'kpis', labelKey: 'nav.dashboard' },
  { key: 'trend', labelKey: 'dash.salesTrend' },
  { key: 'categories', labelKey: 'dash.byCategory' },
  { key: 'top', labelKey: 'dash.topProducts' },
  { key: 'flow', labelKey: 'dash.stockFlow' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const openSheet = useOpenSheet();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const snapshots = useLiveQuery(() => db.snapshots.orderBy('createdAt').reverse().toArray(), []) ?? [];

  const onImportFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isValidBackup(parsed)) throw new Error('bad');
      await restoreBackup(parsed);
      toast(t('backup.imported'));
      buzz(14);
    } catch {
      toast(t('backup.importError'));
      buzz(30);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const img = await processImageFile(file);
      s.setBiz({ logo: img.thumb });
      toast(t('settings.saved'));
    } catch { toast(t('common.error')); }
    finally { if (logoRef.current) logoRef.current.value = ''; }
  };

  const toggleNav = (k: NavKey) => {
    buzz(6);
    if (s.nav.includes(k)) {
      if (s.nav.length <= 3) { toast(t('settings.navMin')); return; }
      s.set({ nav: s.nav.filter((x) => x !== k) });
    } else {
      if (s.nav.length >= 5) { toast(t('settings.navMax')); return; }
      s.set({ nav: [...s.nav, k] });
    }
  };

  const toggleWidget = (k: WidgetKey) => {
    buzz(6);
    s.set({ widgets: s.widgets.includes(k) ? s.widgets.filter((x) => x !== k) : [...s.widgets, k] });
  };

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <h1 className="text-[1.375rem] font-extrabold tracking-tight">{t('settings.title')}</h1>
      </div>

      {/* Umumiy */}
      <Section title={t('settings.general')}>
        <Field label={t('settings.language')}>
          <Segmented value={s.lang} onChange={(v) => s.set({ lang: v })} options={[
            { value: 'uz', label: t('settings.lang.uz') },
            { value: 'ru', label: t('settings.lang.ru') },
          ]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.currency')}>
            <Segmented value={s.currency} onChange={(v) => s.set({ currency: v })} options={[
              { value: 'UZS', label: "UZS" },
              { value: 'USD', label: 'USD' },
            ]} />
          </Field>
          <Field label={t('settings.decimalSep')}>
            <Segmented value={s.decimalSep} onChange={(v) => s.set({ decimalSep: v })} options={[
              { value: ',', label: ',' },
              { value: '.', label: '.' },
            ]} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.dateFormat')}>
            <select className="input" value={s.dateFormat} onChange={(e) => s.set({ dateFormat: e.target.value as 'dmy' | 'mdy' | 'iso' })}>
              <option value="dmy">31.12.2026</option>
              <option value="mdy">12/31/2026</option>
              <option value="iso">2026-12-31</option>
            </select>
          </Field>
          <Field label={t('settings.weekStart')}>
            <Segmented value={String(s.weekStart) as '0' | '1'} onChange={(v) => s.set({ weekStart: Number(v) as 0 | 1 })} options={[
              { value: '1', label: t('settings.monday') },
              { value: '0', label: t('settings.sunday') },
            ]} />
          </Field>
        </div>
      </Section>

      {/* Ko'rinish */}
      <Section title={t('settings.appearance')}>
        <Field label={t('settings.theme')}>
          <Segmented value={s.theme} onChange={(v) => s.set({ theme: v })} options={[
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
            { value: 'system', label: t('settings.theme.system') },
          ]} />
        </Field>
        <Field label={t('settings.accent')}>
          <div className="flex gap-2.5">
            {Object.entries(ACCENTS).map(([k, color]) => (
              <button key={k} type="button" aria-label={k} aria-pressed={s.accent === k}
                className="h-9 w-9 rounded-full transition"
                style={{ background: color, outline: s.accent === k ? '3px solid var(--text)' : 'none', outlineOffset: 2 }}
                onClick={() => { buzz(6); s.set({ accent: k }); }} />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.radius')}>
            <Segmented value={String(s.radius) as '0' | '8' | '16'} onChange={(v) => s.set({ radius: Number(v) })} options={[
              { value: '0', label: '0' }, { value: '8', label: '8' }, { value: '16', label: '16' },
            ]} />
          </Field>
          <Field label={t('settings.density')}>
            <Segmented value={s.density} onChange={(v) => s.set({ density: v })} options={[
              { value: 'compact', label: t('settings.compact') },
              { value: 'comfortable', label: t('settings.comfortable') },
            ]} />
          </Field>
        </div>
        <Field label={t('settings.fontSize')}>
          <Segmented value={s.font} onChange={(v) => s.set({ font: v })} options={[
            { value: 'sm', label: t('settings.font.sm') },
            { value: 'md', label: t('settings.font.md') },
            { value: 'lg', label: t('settings.font.lg') },
          ]} />
        </Field>
      </Section>

      {/* Interfeys */}
      <Section title={t('settings.interface')}>
        <Field label={t('settings.navItems')} hint={t('settings.navHint')}>
          <div className="card row-list overflow-hidden">
            {s.nav.map((k, i) => (
              <div key={k} className="flex items-center gap-2 px-3 py-1.5">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked onChange={() => toggleNav(k)} aria-label={t(NAV_META[k].labelKey)} />
                <span className="flex-1 text-[0.875rem] font-semibold">{t(NAV_META[k].labelKey)}</span>
                <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label={t('common.up')} disabled={i === 0}
                  onClick={() => s.set({ nav: move(s.nav, i, -1) })}>
                  <ArrowUp size={16} strokeWidth={1.5} />
                </button>
                <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label={t('common.down')} disabled={i === s.nav.length - 1}
                  onClick={() => s.set({ nav: move(s.nav, i, 1) })}>
                  <ArrowDown size={16} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {ALL_NAV.filter((k) => !s.nav.includes(k)).map((k) => (
              <div key={k} className="flex items-center gap-2 px-3 py-1.5 opacity-70">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={false} onChange={() => toggleNav(k)} aria-label={t(NAV_META[k].labelKey)} />
                <span className="flex-1 text-[0.875rem]">{t(NAV_META[k].labelKey)}</span>
              </div>
            ))}
          </div>
        </Field>

        <Field label={t('settings.widgets')} hint={t('settings.widgetsHint')}>
          <div className="card row-list overflow-hidden">
            {s.widgets.map((k, i) => {
              const meta = ALL_WIDGETS.find((w) => w.key === k);
              return (
                <div key={k} className="flex items-center gap-2 px-3 py-1.5">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked onChange={() => toggleWidget(k)} aria-label={meta ? t(meta.labelKey) : k} />
                  <span className="flex-1 text-[0.875rem] font-semibold">{meta ? t(meta.labelKey) : k}</span>
                  <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label={t('common.up')} disabled={i === 0}
                    onClick={() => s.set({ widgets: move(s.widgets, i, -1) })}>
                    <ArrowUp size={16} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label={t('common.down')} disabled={i === s.widgets.length - 1}
                    onClick={() => s.set({ widgets: move(s.widgets, i, 1) })}>
                    <ArrowDown size={16} strokeWidth={1.5} />
                  </button>
                </div>
              );
            })}
            {ALL_WIDGETS.filter((w) => !s.widgets.includes(w.key)).map((w) => (
              <div key={w.key} className="flex items-center gap-2 px-3 py-1.5 opacity-70">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={false} onChange={() => toggleWidget(w.key)} aria-label={t(w.labelKey)} />
                <span className="flex-1 text-[0.875rem]">{t(w.labelKey)}</span>
              </div>
            ))}
          </div>
        </Field>
      </Section>

      {/* Biznes */}
      <Section title={t('settings.business')}>
        <div className="mb-3 flex items-center gap-3">
          {s.biz.logo ? (
            <div className="relative">
              <img src={s.biz.logo} alt="" className="h-14 w-14 rounded-xl border border-line object-contain" />
              <button type="button" aria-label={t('common.delete')}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-mute"
                onClick={() => s.setBiz({ logo: '' })}>
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-line text-mute"><ImageIcon size={20} strokeWidth={1.5} /></span>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => logoRef.current?.click()}>
            <Upload size={15} strokeWidth={1.5} /> {t('settings.logo')}
          </button>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onLogo(e.target.files)} />
        </div>
        <Field label={t('settings.companyName')}>
          <input className="input" value={s.biz.name} onChange={(e) => s.setBiz({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.vat')}>
            <NumberInput value={s.biz.vat || null} onChange={(v) => s.setBiz({ vat: v ?? 0 })} decimals={2} placeholder="0" />
          </Field>
          <Field label={t('settings.minStockDefault')}>
            <NumberInput value={s.biz.minStock} onChange={(v) => s.setBiz({ minStock: v ?? 0 })} decimals={0} />
          </Field>
        </div>
        <Field label={t('settings.receiptText')}>
          <textarea className="input" rows={2} value={s.biz.receiptFooter} onChange={(e) => s.setBiz({ receiptFooter: e.target.value })} />
        </Field>
      </Section>

      {/* Ma'lumotlar */}
      <Section title={t('settings.data')}>
        <button type="button" className="btn btn-ghost mb-2 w-full justify-start" onClick={() => openSheet('/settings/storage')}>
          <HardDrive size={17} strokeWidth={1.5} /> {t('settings.storage')}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => { void exportAllToFile().then(() => toast(t('backup.exported'))); }}>
            <Download size={16} strokeWidth={1.5} /> {t('common.export')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={16} strokeWidth={1.5} /> {t('common.import')}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImportFile(e.target.files)} />

        <p className="mb-1 mt-4 text-[0.8125rem] font-bold text-mute">{t('settings.snapshots')}</p>
        {snapshots.length === 0 ? (
          <p className="text-[0.8125rem] text-mute">{t('backup.noSnapshots')}</p>
        ) : (
          <div className="card row-list overflow-hidden">
            {snapshots.map((sn) => (
              <div key={sn.id} className="flex items-center justify-between px-3 py-2">
                <span className="tnum text-[0.8125rem]">{formatDateTime(sn.createdAt)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRestore(sn)}>
                  <RefreshCw size={14} strokeWidth={1.5} /> {t('settings.restore')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <button type="button" className="btn btn-ghost w-full" style={{ color: 'var(--bad)' }} disabled={busy} onClick={() => setConfirmWipe(true)}>
            <Trash2 size={16} strokeWidth={1.5} /> {t('settings.wipe')}
          </button>
        </div>
      </Section>

      {/* About */}
      <Section title={t('settings.about')}>
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="text-[0.9375rem] font-extrabold">StokPilot</p>
            <p className="text-[0.7812rem] text-mute">{t('app.tagline')} · {t('settings.version')} 1.0.0</p>
          </div>
        </div>
      </Section>

      {confirmWipe && (
        <ConfirmDialog title={t('settings.wipe')} text={t('settings.wipeConfirm')} danger confirmLabel={t('common.delete')}
          onConfirm={() => {
            setConfirmWipe(false);
            setBusy(true);
            void wipeAll()
              .then(() => toast(t('settings.wiped')))
              .catch(() => toast(t('common.error')))
              .finally(() => setBusy(false));
          }}
          onCancel={() => setConfirmWipe(false)} />
      )}
      {confirmRestore && (
        <ConfirmDialog title={t('settings.restore')} text={t('backup.restoreConfirm')}
          onConfirm={() => { void restoreSnapshot(confirmRestore).then(() => { toast(t('backup.restored')); setConfirmRestore(null); }); }}
          onCancel={() => setConfirmRestore(null)} />
      )}
    </div>
  );
}
