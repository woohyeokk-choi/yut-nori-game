import { getNodePositions } from '@yut-nori/shared';

const NODE_HIT_RADIUS = 20; // 터치 판정 반경 (px)

/**
 * 터치 좌표에서 가장 가까운 노드를 찾는다
 * @param touchX 터치 x좌표 (캔버스 내 px)
 * @param touchY 터치 y좌표 (캔버스 내 px)
 * @param boardSize 보드 크기 (px)
 * @param padding 보드 패딩 (px)
 * @param highlightedOnly 하이라이트된 노드만 검색할지
 * @param highlightedNodes 하이라이트된 노드 ID 목록
 */
export function findClosestNode(
  touchX: number,
  touchY: number,
  boardSize: number,
  padding: number,
  highlightedOnly: boolean = false,
  highlightedNodes: number[] = []
): number | null {
  const positions = getNodePositions();
  const inner = boardSize - padding * 2;

  let closestId: number | null = null;
  let closestDist = Infinity;

  positions.forEach((pos, nodeId) => {
    if (highlightedOnly && !highlightedNodes.includes(nodeId)) return;

    const sx = padding + pos.x * inner;
    const sy = padding + pos.y * inner;
    const dist = Math.sqrt((touchX - sx) ** 2 + (touchY - sy) ** 2);

    if (dist < NODE_HIT_RADIUS && dist < closestDist) {
      closestDist = dist;
      closestId = nodeId;
    }
  });

  return closestId;
}
