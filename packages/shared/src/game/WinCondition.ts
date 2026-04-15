import { MalState, NODE } from '../types';

/**
 * 승리 조건 판정
 */
export class WinCondition {
  /**
   * 모든 말이 골인했는지 확인
   */
  static checkWin(mals: MalState[]): boolean {
    return mals.every(mal => mal.position === NODE.FINISH);
  }

  /**
   * 팀의 모든 말이 골인했는지 확인 (2v2)
   */
  static checkTeamWin(teamMals: MalState[][]): boolean {
    return teamMals.every(playerMals => this.checkWin(playerMals));
  }

  /**
   * 골인한 말 수
   */
  static getFinishedCount(mals: MalState[]): number {
    return mals.filter(mal => mal.position === NODE.FINISH).length;
  }
}
