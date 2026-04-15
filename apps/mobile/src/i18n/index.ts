import ko from './ko.json';
import en from './en.json';
import ja from './ja.json';

export type Language = 'ko' | 'en' | 'ja';

const translations: Record<Language, typeof ko> = { ko, en, ja };

let currentLanguage: Language = 'ko';

export function setLanguage(lang: Language) {
  currentLanguage = lang;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(key: string): string {
  const keys = key.split('.');
  let value: any = translations[currentLanguage];
  for (const k of keys) {
    value = value?.[k];
  }
  return (value as string) ?? key;
}
