/**
 * i18n core (pt-BR default, en optional).
 *
 * How to add a new user-visible string:
 *   1. Add the key to the pt-BR namespace file in `src/i18n/locales/pt-BR/<namespace>.ts`.
 *   2. Add the same key to `src/i18n/locales/en/<namespace>.ts` (tsc fails until you do,
 *      because every English namespace is typed as `Messages['<namespace>']`).
 *   3. Use it: in React `const { t } = useI18n(); t.ns.key`, outside React `getMessages().ns.key`.
 *
 * Strings that need interpolation or plurals are functions in the dictionary,
 * e.g. `membersCount: (n: number) => ...`.
 *
 * Stored data (Firestore values, enum values) is never translated; only its
 * display label, through the maps in the `enums` namespace.
 */
import { ptBR, type Messages } from './locales/pt-BR';
import { en } from './locales/en';

export type Language = 'pt-BR' | 'en';
export type { Messages };

export const LANGUAGE_STORAGE_KEY = 'ibit-language';

/**
 * Locale for text that is written to Firestore (e.g. automatic change-history
 * descriptions). Stored data stays in Portuguese regardless of the UI language.
 */
export const STORED_DATA_LOCALE = 'pt-BR';

const dictionaries: Record<Language, Messages> = { 'pt-BR': ptBR, en };

export function readStoredLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'pt-BR';
  } catch {
    return 'pt-BR';
  }
}

let currentLanguage: Language = readStoredLanguage();

/** Called synchronously by the LanguageProvider before it re-renders. */
export function setCurrentLanguage(language: Language): void {
  currentLanguage = language;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function getMessagesFor(language: Language): Messages {
  return dictionaries[language];
}

/** Dictionary of the current language. Call at use time; never cache at module load. */
export function getMessages(): Messages {
  return dictionaries[currentLanguage];
}

export function localeFor(language: Language): 'pt-BR' | 'en-US' {
  return language === 'en' ? 'en-US' : 'pt-BR';
}

/** Locale for toLocale*String / Intl in the current language. */
export function getLocale(): 'pt-BR' | 'en-US' {
  return localeFor(currentLanguage);
}
