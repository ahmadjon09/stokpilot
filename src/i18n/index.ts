import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uz from './uz';
import ru from './ru';
import { useSettings } from '../store/settings';

i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    ru: { translation: ru },
  },
  lng: useSettings.getState().lang,
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
