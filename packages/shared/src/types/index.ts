// 윷 결과 타입
export type YutResult = 'do' | 'gae' | 'geol' | 'yut' | 'mo' | 'backdo';

// 게이지 영역
export type GaugeZone = 'perfect' | 'good' | 'normal' | 'bad';

// 게임 모드
export type GameMode = '1v1' | '2v2';

// 게이지 모드
export type GaugeMode = 'classic' | 'skill';

// 게임 단계
export type GamePhase = 'waiting' | 'playing' | 'finished';

// 말 상태
export interface MalState {
  position: number;    // -1: 출발 전, 0~28: 보드 위, 30: 골인
  isStacked: boolean;
  stackedWith: number[];
}

// 플레이어 상태
export interface PlayerState {
  userId: string;
  userName: string;
  team: number;
  mals: MalState[];
  isConnected: boolean;
}

// 노드 정보
export interface BoardNode {
  id: number;
  x: number;
  y: number;
  isCorner: boolean;
  isCenter: boolean;
  isStart: boolean;
}

// 간선 정보
export interface BoardEdge {
  from: number;
  to: number;
  isShortcut: boolean;
}

// 이동 가능 경로
export interface AvailableMove {
  malIndex: number;
  targetPosition: number;
  path: number[];
  canTakeShortcut: boolean;
}

// 윷 결과별 이동 칸수
export const YUT_MOVE_COUNT: Record<YutResult, number> = {
  do: 1,
  gae: 2,
  geol: 3,
  yut: 4,
  mo: 5,
  backdo: -1,
};

// 추가 턴 여부
export const YUT_EXTRA_TURN: Record<YutResult, boolean> = {
  do: false,
  gae: false,
  geol: false,
  yut: true,
  mo: true,
  backdo: false,
};

// 특수 위치 상수
export const NODE = {
  START: -1,       // 출발 전
  FINISH: 30,      // 골인
  CENTER: 22,      // 중앙 교차점
} as const;

// 모서리 노드 (지름길 진입 가능)
export const CORNER_NODES = [5, 10, 22] as const;
