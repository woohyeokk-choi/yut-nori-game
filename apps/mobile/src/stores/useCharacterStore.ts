import { create } from 'zustand';

interface Character {
  id: string;
  name: string;
  emoji: string;
  premium: boolean;
}

const ALL_CHARACTERS: Character[] = [
  // 기본 4종 (투박한 디자인)
  { id: 'stone', name: '돌멩이', emoji: '🪨', premium: false },
  { id: 'wood', name: '나무토막', emoji: '🪵', premium: false },
  { id: 'acorn', name: '도토리', emoji: '🌰', premium: false },
  { id: 'chestnut', name: '밤', emoji: '🌰', premium: false },
  // 구독자 8종 (귀여운 디자인)
  { id: 'rabbit', name: '토끼', emoji: '🐰', premium: true },
  { id: 'tiger', name: '호랑이', emoji: '🐯', premium: true },
  { id: 'puppy', name: '강아지', emoji: '🐶', premium: true },
  { id: 'cat', name: '고양이', emoji: '🐱', premium: true },
  { id: 'scholar', name: '선비', emoji: '🧑‍🎓', premium: true },
  { id: 'princess', name: '공주', emoji: '👸', premium: true },
  { id: 'bear', name: '곰', emoji: '🐻', premium: true },
  { id: 'fox', name: '여우', emoji: '🦊', premium: true },
];

interface CharacterState {
  characters: Character[];
  selectedId: string;
  select: (id: string) => void;
  getAvailable: (isSubscribed: boolean) => Character[];
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: ALL_CHARACTERS,
  selectedId: 'stone',
  select: (id) => set({ selectedId: id }),
  getAvailable: (isSubscribed) => ALL_CHARACTERS.filter(c => !c.premium || isSubscribed),
}));
