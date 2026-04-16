import { BoardNode, BoardEdge, CORNER_NODES, NODE } from '../types';

/**
 * 윷놀이 판 그래프 구조
 * 
 * 전통 윷판: 외곽 20칸(0~19) + 지름길 9칸(20~28)
 * 총 29개 노드
 * 
 *        10
 *       / | \
 *     11  |  9
 *    /  23|24  \
 *   12  / | \  8
 *   | 25  22  21|
 *   13  \ | /  7
 *    \  26|27  /
 *     14  |  6
 *       \ | /
 *   15-16-0-1-2-3-4-5
 *        17 18 19
 *   
 * 이동 방향: 반시계 (0→19→18→17→15→14→13→12→11→10→9→8→7→6→5→4→3→2→1→0→골인)
 * 실제 외곽: 0(우하)→1(우)→...→5(우상)→...→10(좌상)→...→15(좌하)→...→19→0(골인)
 */

// 외곽 경로 (반시계 방향, 0번부터 19번까지)
export const OUTER_PATH: BoardEdge[] = [
  { from: 0, to: 1, isShortcut: false },
  { from: 1, to: 2, isShortcut: false },
  { from: 2, to: 3, isShortcut: false },
  { from: 3, to: 4, isShortcut: false },
  { from: 4, to: 5, isShortcut: false },   // 우상 모서리
  { from: 5, to: 6, isShortcut: false },
  { from: 6, to: 7, isShortcut: false },
  { from: 7, to: 8, isShortcut: false },
  { from: 8, to: 9, isShortcut: false },
  { from: 9, to: 10, isShortcut: false },  // 좌상 모서리
  { from: 10, to: 11, isShortcut: false },
  { from: 11, to: 12, isShortcut: false },
  { from: 12, to: 13, isShortcut: false },
  { from: 13, to: 14, isShortcut: false },
  { from: 14, to: 15, isShortcut: false }, // 좌하 모서리
  { from: 15, to: 16, isShortcut: false },
  { from: 16, to: 17, isShortcut: false },
  { from: 17, to: 18, isShortcut: false },
  { from: 18, to: 19, isShortcut: false },
  { from: 19, to: NODE.FINISH, isShortcut: false }, // 골인
];

// 지름길 경로 (5번 모서리 → 중앙 → 15번 모서리)
export const SHORTCUT_5_TO_15: BoardEdge[] = [
  { from: 5, to: 21, isShortcut: true },
  { from: 21, to: 22, isShortcut: true },  // 중앙
  { from: 22, to: 26, isShortcut: true },
  { from: 26, to: 15, isShortcut: true },
];

// 지름길 경로 (10번 모서리 → 중앙 → 0번(골인))
export const SHORTCUT_10_TO_FINISH: BoardEdge[] = [
  { from: 10, to: 23, isShortcut: true },
  { from: 23, to: 22, isShortcut: true },  // 중앙
  { from: 22, to: 27, isShortcut: true },
  { from: 27, to: 28, isShortcut: true },
  { from: 28, to: NODE.FINISH, isShortcut: true },
];

// 중앙에서 골인 (중앙 도착 시 선택 가능)
export const CENTER_TO_FINISH: BoardEdge[] = [
  { from: 22, to: 27, isShortcut: true },
  { from: 27, to: 28, isShortcut: true },
  { from: 28, to: NODE.FINISH, isShortcut: true },
];

export const ALL_EDGES: BoardEdge[] = [
  ...OUTER_PATH,
  ...SHORTCUT_5_TO_15,
  ...SHORTCUT_10_TO_FINISH,
];

// 노드 좌표 (0~1 정규화, 렌더링용)
export function getNodePositions(): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();
  
  // 외곽 20칸 (반시계 방향)
  // 하단 변: 0(우하)→4→3→2→1→(중간 생략) 실제로는:
  // 0=우하, 5=우상, 10=좌상, 15=좌하
  
  // 정사각형 좌표계 (0~1 정규화)
  // 0=우하(1,1), 5=우상(1,0), 10=좌상(0,0), 15=좌하(0,1)
  const corners = [
    { id: 0, x: 1.0, y: 1.0 },   // 우하 (출발/골인)
    { id: 5, x: 1.0, y: 0.0 },   // 우상
    { id: 10, x: 0.0, y: 0.0 },  // 좌상
    { id: 15, x: 0.0, y: 1.0 },  // 좌하
  ];

  // 외곽 각 변의 5칸을 보간
  for (let side = 0; side < 4; side++) {
    const from = corners[side];
    const to = corners[(side + 1) % 4];
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const nodeId = side * 5 + i;
      positions.set(nodeId, {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }

  // 지름길 노드 (실제 경로에 사용되는 노드만)
  // 경로: 5(1,0)→21→22(0.5,0.5)→26→15(0,1) (우상→중앙→좌하)
  positions.set(21, { x: 0.75, y: 0.25 });  // 5→22 중간
  positions.set(22, { x: 0.5, y: 0.5 });    // 중앙 ★
  positions.set(26, { x: 0.25, y: 0.75 });  // 22→15 중간

  // 경로: 10(0,0)→23→22(0.5,0.5)→27→28→FINISH (좌상→중앙→우하)
  positions.set(23, { x: 0.25, y: 0.25 });  // 10→22 중간
  positions.set(27, { x: 0.67, y: 0.67 });  // 22→0(골인) 1/3
  positions.set(28, { x: 0.83, y: 0.83 });  // 22→0(골인) 2/3

  return positions;
}

export function isCornerNode(nodeId: number): boolean {
  return (CORNER_NODES as readonly number[]).includes(nodeId);
}

export function getNextNode(from: number, useShortcut: boolean): number | null {
  const edges = useShortcut ? ALL_EDGES : OUTER_PATH;
  
  if (useShortcut && isCornerNode(from)) {
    // 지름길 경로에서 다음 노드 찾기
    const shortcutEdge = ALL_EDGES.find(e => e.from === from && e.isShortcut);
    if (shortcutEdge) return shortcutEdge.to;
  }
  
  const edge = edges.find(e => e.from === from);
  if (edge) return edge.to;
  
  // 외곽 경로에서 찾기 (fallback)
  const outerEdge = OUTER_PATH.find(e => e.from === from);
  return outerEdge?.to ?? null;
}

export function getPreviousNode(nodeId: number): number | null {
  // 외곽 경로에서 이전 노드 찾기
  const edge = OUTER_PATH.find(e => e.to === nodeId);
  if (edge) return edge.from;
  
  // 지름길에서 이전 노드 찾기
  const shortcutEdge = ALL_EDGES.find(e => e.to === nodeId && e.isShortcut);
  return shortcutEdge?.from ?? null;
}
