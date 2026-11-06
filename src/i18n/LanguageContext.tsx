import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  Language,
  LANGUAGE_STORAGE_KEY,
  Messages,
  getMessagesFor,
  localeFor,
  readStoredLanguage,
  setCurrentLanguage,
} from './index';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: Messages;
  locale: 'pt-BR' | 'en-US';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readStoredLanguage());

  const setLanguage = useCallback((value: Language) => {
    // Non-React helpers read the module-level language, so update it before re-rendering.
    setCurrentLanguage(value);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
    } catch {
      // localStorage unavailable (private mode): keep the choice for this session only.
    }
    setLanguageState(value);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'pt-BR' : 'en');
  }, [language, setLanguage]);

  const t = getMessagesFor(language);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.common.appTitle;
  }, [language, t]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t, locale: localeFor(language) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within a LanguageProvider');
  }
  return context;
}
