import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  tr: {
    translation: {
      "common.start": "Görüntülü Sohbete Başla",
      "common.next": "Sıradaki",
      "common.block": "Engelle",
      "common.report": "Şikayet",
      "common.login": "Giriş yap",
      "common.logout": "Çıkış",
      "filters.title": "Eşleşme Filtreleri",
    },
  },
  en: {
    translation: {
      "common.start": "Start Video Chat",
      "common.next": "Next",
      "common.block": "Block",
      "common.report": "Report",
      "common.login": "Sign in",
      "common.logout": "Sign out",
      "filters.title": "Match Filters",
    },
  },
  ar: {
    translation: {
      "common.start": "ابدأ الدردشة المرئية",
      "common.next": "التالي",
      "common.block": "حظر",
      "common.report": "الإبلاغ",
      "common.login": "تسجيل الدخول",
      "common.logout": "تسجيل الخروج",
      "filters.title": "مرشحات المطابقة",
    },
  },
};

const stored = typeof window !== "undefined" ? localStorage.getItem("lang") : null;

void i18n.use(initReactI18next).init({
  resources,
  lng: stored || "tr",
  fallbackLng: "tr",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: "tr" | "en" | "ar") {
  void i18n.changeLanguage(lang);
  if (typeof window !== "undefined") localStorage.setItem("lang", lang);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }
}

export default i18n;
