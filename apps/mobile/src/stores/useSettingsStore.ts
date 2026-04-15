import { create } from 'zustand';
import { type Language, setLanguage } from '../i18n';

interface SettingsState {
  language: Language;
  soundEnabled: boolean;
  gaugeMode: 'classic' | 'skill';
  changeLanguage: (lang: Language) => void;
  toggleSound: () => void;
  setGaugeMode: (mode: 'classic' | 'skill') => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'ko',
  soundEnabled: true,
  gaugeMode: 'classic',
  changeLanguage: (lang) => {
    setLanguage(lang);
    set({ language: lang });
  },
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setGaugeMode: (mode) => set({ gaugeMode: mode }),
}));
