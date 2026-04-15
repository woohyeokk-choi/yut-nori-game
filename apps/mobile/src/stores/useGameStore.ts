import { create } from 'zustand';
import type { YutResult, GamePhase, AvailableMove } from '@yut-nori/shared';

interface GameStoreState {
  phase: GamePhase;
  currentTurn: number;
  myPlayerIndex: number;
  yutResult: YutResult | null;
  extraTurns: number;
  availableMoves: AvailableMove[];
  isMyTurn: boolean;
  winnerId: string;
  setPhase: (phase: GamePhase) => void;
  setCurrentTurn: (turn: number) => void;
  setMyPlayerIndex: (idx: number) => void;
  setYutResult: (result: YutResult | null) => void;
  setAvailableMoves: (moves: AvailableMove[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  phase: 'waiting',
  currentTurn: 0,
  myPlayerIndex: -1,
  yutResult: null,
  extraTurns: 0,
  availableMoves: [],
  isMyTurn: false,
  winnerId: '',
  setPhase: (phase) => set({ phase }),
  setCurrentTurn: (turn) => set({ currentTurn: turn, isMyTurn: turn === get().myPlayerIndex }),
  setMyPlayerIndex: (idx) => set({ myPlayerIndex: idx }),
  setYutResult: (result) => set({ yutResult: result }),
  setAvailableMoves: (moves) => set({ availableMoves: moves }),
  reset: () => set({ phase: 'waiting', currentTurn: 0, yutResult: null, extraTurns: 0, availableMoves: [], winnerId: '' }),
}));
