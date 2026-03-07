import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from '../locales/ko';
import en from '../locales/en';
import ja from '../locales/ja';

// UI 언어는 별도 키 (tubegen_ui_language)
// 나레이션 언어 (tubegen_language)와 독립
const UI_LANG_KEY = 'tubegen_ui_language';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
    },
    lng: localStorage.getItem(UI_LANG_KEY) || 'ko',
    fallbackLng: 'ko',
    interpolation: {
      escapeValue: false,
    },
  });

export const UI_LANGUAGE_KEY = UI_LANG_KEY;
export default i18n;
