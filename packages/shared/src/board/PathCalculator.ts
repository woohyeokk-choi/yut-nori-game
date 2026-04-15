import { YutResult, NODE, YUT_MOVE_COUNT, AvailableMove, MalState } from '../types';
import { OUTER_PATH, ALL_EDGES, isCornerNode, getNextNode, getPreviousNode } from './BoardGraph';

/**
 * 윷놀이 경로 계산기
 */
export class PathCalculator {
  /**
   * 주어진 위치에서 윷 결과에 따른 도착 위치 계산
   */
  static calculatePath(
    from: number,
    yutResult: YutResult,
    useShortcut: boolean = false
  ): { destination: number; path: number[] } {
    if (yutResult === 'backdo') {
      return this.walkBackward(from);
    }
    return this.walkForward(from, YUT_MOVE_COUNT[yutResult], useShortcut);
  }

  /**
   * 전진 이동
   */
  private static walkForward(
    from: number,
    steps: number,
    useShortcut: boolean
  ): { destination: number; path: number[] } {
    const path: number[] = [];
    let current = from;
    let remainingSteps = steps;
    let onShortcut = this.isOnShortcut(from);

    // 출발점(-1)에서 시작하면 0번으로 이동
    if (current === NODE.START) {
      current = 0;
      remainingSteps--;
      path.push(0);
      if (remainingSteps === 0) {
        return { destination: current, path };
      }
    }

    while (remainingSteps > 0) {
      // 모서리에서 지름길 선택 가능 (첫 칸 진입 시에만)
      const shouldTakeShortcut = useShortcut && isCornerNode(current) && !onShortcut;
      
      if (shouldTakeShortcut) {
        onShortcut = true;
      }

      const next = this.getNextInPath(current, onShortcut);
      
      if (next === null || next === NODE.FINISH) {
        // 골인 (남은 칸수와 무관하게 골인 처리)
        path.push(NODE.FINISH);
        return { destination: NODE.FINISH, path };
      }

      current = next;
      path.push(current);
      remainingSteps--;

      // 중앙(22) 도착 시 지름길 상태 유지
      if (current === 22) {
        onShortcut = true;
      }
    }

    return { destination: current, path };
  }

  /**
   * 백도 (1칸 후퇴)
   */
  private static walkBackward(from: number): { destination: number; path: number[] } {
    if (from === NODE.START || from === 0) {
      // 출발점이나 0번에서 백도 시 출발점으로
      return { destination: NODE.START, path: [NODE.START] };
    }

    const prev = getPreviousNode(from);
    if (prev === null) {
      return { destination: NODE.START, path: [NODE.START] };
    }

    return { destination: prev, path: [prev] };
  }

  /**
   * 현재 위치의 다음 노드 (경로 상)
   */
  private static getNextInPath(current: number, onShortcut: boolean): number | null {
    if (onShortcut) {
      // 지름길 경로에서 다음 찾기
      const shortcutEdge = ALL_EDGES.find(
        e => e.from === current && e.isShortcut
      );
      if (shortcutEdge) return shortcutEdge.to;
    }

    // 외곽 경로에서 다음 찾기
    const outerEdge = OUTER_PATH.find(e => e.from === current);
    return outerEdge?.to ?? null;
  }

  /**
   * 현재 노드가 지름길 위인지 확인
   */
  private static isOnShortcut(nodeId: number): boolean {
    return nodeId >= 20 && nodeId <= 28;
  }

  /**
   * 이동 가능한 말 목록 계산
   */
  static getAvailableMoves(
    mals: MalState[],
    yutResult: YutResult,
    playerTeamMals?: MalState[] // 2v2에서 팀 전체 말
  ): AvailableMove[] {
    const moves: AvailableMove[] = [];
    const allMals = playerTeamMals ?? mals;

    for (let i = 0; i < mals.length; i++) {
      const mal = mals[i];
      
      // 이미 골인한 말은 이동 불가
      if (mal.position === NODE.FINISH) continue;
      
      // 출발 전 말이 백도면 이동 불가
      if (mal.position === NODE.START && yutResult === 'backdo') continue;

      // 기본 경로 (지름길 미사용)
      const normalPath = this.calculatePath(mal.position, yutResult, false);
      moves.push({
        malIndex: i,
        targetPosition: normalPath.destination,
        path: normalPath.path,
        canTakeShortcut: false,
      });

      // 지름길 가능 여부 체크
      if (yutResult !== 'backdo') {
        const steps = YUT_MOVE_COUNT[yutResult];
        // 이동 경로 중 모서리를 지나가는지 확인
        let tempPos = mal.position === NODE.START ? 0 : mal.position;
        let tempSteps = mal.position === NODE.START ? steps - 1 : steps;
        
        for (let s = 0; s < tempSteps; s++) {
          if (isCornerNode(tempPos) && !this.isOnShortcut(tempPos)) {
            const shortcutPath = this.calculatePath(mal.position, yutResult, true);
            if (shortcutPath.destination !== normalPath.destination) {
              moves.push({
                malIndex: i,
                targetPosition: shortcutPath.destination,
                path: shortcutPath.path,
                canTakeShortcut: true,
              });
            }
            break;
          }
          const next = OUTER_PATH.find(e => e.from === tempPos);
          if (!next) break;
          tempPos = next.to;
        }
      }
    }

    return moves;
  }
}
