import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import OfflineGate from './shared/ui/OfflineGate';
import DbGate from './shared/ui/DbGate';
import './i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* DbGate — IndexedDB ochilishi/migratsiyasi uchun error boundary */}
      <DbGate>
        <OfflineGate>
          <App />
        </OfflineGate>
      </DbGate>
    </BrowserRouter>
  </React.StrictMode>
);

// Offline-first: register service worker (production builds)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
