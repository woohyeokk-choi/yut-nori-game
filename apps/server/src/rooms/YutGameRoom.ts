import { Room, Client } from 'colyseus';
import { GameState, PlayerSchema, MalSchema } from '../schemas/GameState.js';
import { 
  PathCalculator, YutProbability, WinCondition,
  YUT_EXTRA_TURN, NODE, GaugeZone,
  type YutResult, type MalState
} from '@yut-nori/shared';

const TURN_TIME = 30;
const RECONNECT_TIMEOUT = 30;
const MALS_PER_PLAYER_1V1 = 4;
const MALS_PER_PLAYER_2V2 = 2;

interface JoinOptions {
  userId: string;
  userName: string;
  gameMode: '1v1' | '2v2';
  gaugeMode: 'classic' | 'skill';
  roomCode?: string;
}

export class YutGameRoom extends Room<GameState> {
  private turnInterval: ReturnType<typeof setInterval> | null = null;
  private turnOrder: number[] = []; // 플레이어 인덱스 순서

  onCreate(options: any) {
    this.setState(new GameState());
    this.state.gameMode = options.gameMode || '1v1';
    this.state.gaugeMode = options.gaugeMode || 'classic';

    const maxPlayers = this.state.gameMode === '2v2' ? 4 : 2;
    this.maxClients = maxPlayers;

    // 메시지 핸들러 등록
    this.onMessage('throw_yut', (client, message) => this.handleThrowYut(client, message));
    this.onMessage('move_mal', (client, message) => this.handleMoveMal(client, message));
    this.onMessage('send_message', (client, message) => this.handleSendMessage(client, message));
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerSchema();
    player.userId = options.userId || client.sessionId;
    player.userName = options.userName || `Player ${this.state.players.length + 1}`;
    player.isConnected = true;

    // 팀 배정
    if (this.state.gameMode === '2v2') {
      player.team = this.state.players.length < 2 ? 0 : 1;
    } else {
      player.team = this.state.players.length;
    }

    // 말 생성
    const malCount = this.state.gameMode === '2v2' ? MALS_PER_PLAYER_2V2 : MALS_PER_PLAYER_1V1;
    for (let i = 0; i < malCount; i++) {
      const mal = new MalSchema();
      mal.position = NODE.START;
      player.mals.push(mal);
    }

    this.state.players.push(player);

    // 정원 찼으면 게임 시작
    if (this.state.players.length === this.maxClients) {
      this.startGame();
    }
  }

  async onLeave(client: Client, consented: boolean) {
    const playerIdx = this.getPlayerIndex(client);
    if (playerIdx === -1) return;

    this.state.players[playerIdx].isConnected = false;

    if (consented) {
      // 자발적 퇴장 → 패배 처리
      this.handleDisconnectLoss(playerIdx);
      return;
    }

    // 비자발적 끊김 → 재접속 대기
    try {
      await this.allowReconnection(client, RECONNECT_TIMEOUT);
      this.state.players[playerIdx].isConnected = true;
    } catch {
      this.handleDisconnectLoss(playerIdx);
    }
  }

  onDispose() {
    if (this.turnInterval) {
      clearInterval(this.turnInterval);
    }
  }

  // === 게임 시작 ===
  private startGame() {
    this.state.phase = 'playing';

    // 턴 순서: 1v1은 [0,1], 2v2는 [0,2,1,3] (교차)
    if (this.state.gameMode === '2v2') {
      this.turnOrder = [0, 2, 1, 3]; // 1팀A→2팀A→1팀B→2팀B
    } else {
      this.turnOrder = [0, 1];
    }

    this.state.currentTurn = this.turnOrder[0];
    this.startTurnTimer();
  }

  // === 턴 타이머 ===
  private startTurnTimer() {
    this.state.turnTimer = TURN_TIME;
    this.state.turnStartedAt = Date.now();

    if (this.turnInterval) clearInterval(this.turnInterval);

    this.turnInterval = setInterval(() => {
      this.state.turnTimer--;
      if (this.state.turnTimer <= 0) {
        this.handleTurnTimeout();
      }
    }, 1000);
  }

  private handleTurnTimeout() {
    // 시간 초과: 자동 던지기 → 자동 이동 (가장 뒤의 말)
    const player = this.state.players[this.state.currentTurn];
    if (!player) return;

    if (!this.state.yutResult) {
      // 아직 던지지 않았으면 자동 던지기
      const result = YutProbability.getResult('normal');
      this.state.yutResult = result;
      this.autoMoveMal(player, result as YutResult);
    } else {
      // 던졌지만 말을 안 골랐으면 자동 이동
      this.autoMoveMal(player, this.state.yutResult as YutResult);
    }
  }

  private autoMoveMal(player: PlayerSchema, yutResult: YutResult) {
    const mals: MalState[] = player.mals.map(m => ({
      position: m.position,
      isStacked: m.isStacked,
      stackedWith: [],
    }));

    const moves = PathCalculator.getAvailableMoves(mals, yutResult);
    if (moves.length > 0) {
      // 가장 뒤에 있는 말 자동 이동
      const move = moves[0];
      this.executeMalMove(this.state.currentTurn, move.malIndex, move.targetPosition, move.path);
    }

    this.endTurn();
  }

  // === 메시지 핸들러 ===
  private handleThrowYut(client: Client, message: any) {
    const playerIdx = this.getPlayerIndex(client);
    if (playerIdx !== this.state.currentTurn) return;
    if (this.state.yutResult) return; // 이미 던짐

    let gaugeZone: GaugeZone = 'normal';
    
    if (this.state.gaugeMode === 'skill' && message.gaugeZone) {
      // 서버 타이밍 기반 게이지 검증
      const elapsed = Date.now() - this.state.turnStartedAt;
      const gaugeCycleDuration = 1750;
      const gaugePosition = (elapsed % gaugeCycleDuration) / gaugeCycleDuration;
      const serverZone = YutProbability.calculateGaugeZone(gaugePosition);
      gaugeZone = YutProbability.validateGaugeZone(message.gaugeZone, serverZone);
    }

    const result = YutProbability.getResult(gaugeZone);
    this.state.yutResult = result;

    // 추가 턴 체크
    if (YUT_EXTRA_TURN[result]) {
      this.state.extraTurns++;
    }
  }

  private handleMoveMal(client: Client, message: { malIndex: number; useShortcut?: boolean }) {
    const playerIdx = this.getPlayerIndex(client);
    if (playerIdx !== this.state.currentTurn) return;
    if (!this.state.yutResult) return;

    const player = this.state.players[playerIdx];
    const mal = player.mals[message.malIndex];
    if (!mal || mal.position === NODE.FINISH) return;

    const result = PathCalculator.calculatePath(
      mal.position,
      this.state.yutResult as YutResult,
      message.useShortcut ?? false
    );

    this.executeMalMove(playerIdx, message.malIndex, result.destination, result.path);
    this.endTurn();
  }

  private handleSendMessage(client: Client, message: { text: string }) {
    const playerIdx = this.getPlayerIndex(client);
    if (playerIdx === -1) return;

    const allowedMessages = ['미안해요', '잘했어요', '빨리 주세요', '왔어요'];
    if (!allowedMessages.includes(message.text)) return;

    this.state.lastMessage = JSON.stringify({
      userId: this.state.players[playerIdx].userId,
      text: message.text,
      timestamp: Date.now(),
    });
  }

  // === 말 이동 실행 ===
  private executeMalMove(playerIdx: number, malIndex: number, destination: number, path: number[]) {
    const player = this.state.players[playerIdx];
    const mal = player.mals[malIndex];
    const fromPosition = mal.position;

    // 잡기 체크 (도착지에 상대 말이 있으면 전부 잡기)
    let caught = false;
    if (destination !== NODE.FINISH && destination !== NODE.START) {
      caught = this.checkCatch(playerIdx, destination);
    }

    // 업힌 말도 함께 이동 (같은 팀, 같은 위치의 모든 말)
    this.moveStackedMals(playerIdx, fromPosition, destination);

    // 말 이동
    mal.position = destination;

    // 골인 시 isStacked 해제
    if (destination === NODE.FINISH) {
      mal.isStacked = false;
    }

    // 업기 체크 (도착지에 같은 팀 말이 있으면 업기)
    if (destination !== NODE.FINISH && destination !== NODE.START) {
      this.checkStack(playerIdx, malIndex, destination);
    }

    // 잡기 성공 시 추가 턴
    if (caught) {
      this.state.extraTurns++;
    }

    // 승리 체크
    this.checkWin(playerIdx);
  }

  // 업힌 말(같은 팀, 같은 위치)을 함께 이동
  private moveStackedMals(playerIdx: number, fromPosition: number, destination: number) {
    if (fromPosition === NODE.START || fromPosition === NODE.FINISH) return;
    const team = this.state.players[playerIdx].team;

    for (let p = 0; p < this.state.players.length; p++) {
      if (this.state.players[p].team !== team) continue;
      for (const mal of this.state.players[p].mals) {
        if (mal.position === fromPosition && mal.isStacked) {
          mal.position = destination;
          if (destination === NODE.FINISH) {
            mal.isStacked = false;
          }
        }
      }
    }
  }

  private checkCatch(currentPlayerIdx: number, position: number): boolean {
    const currentTeam = this.state.players[currentPlayerIdx].team;
    let caught = false;

    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].team === currentTeam) continue;

      for (const mal of this.state.players[i].mals) {
        if (mal.position === position && mal.position !== NODE.START && mal.position !== NODE.FINISH) {
          // 잡기! 상대 말을 출발점으로 (업힌 말 전부 잡힘)
          mal.position = NODE.START;
          mal.isStacked = false;
          caught = true;
        }
      }
    }
    return caught;
  }

  private checkStack(playerIdx: number, malIndex: number, position: number) {
    const player = this.state.players[playerIdx];
    const team = player.team;

    // 같은 팀의 다른 말이 같은 위치에 있는지 확인 (팀원 포함)
    for (let p = 0; p < this.state.players.length; p++) {
      if (this.state.players[p].team !== team) continue;

      for (let m = 0; m < this.state.players[p].mals.length; m++) {
        if (p === playerIdx && m === malIndex) continue;
        const otherMal = this.state.players[p].mals[m];

        if (otherMal.position === position) {
          // 업기 (자기 말 + 팀원 말 모두)
          otherMal.isStacked = true;
          player.mals[malIndex].isStacked = true;
        }
      }
    }
  }

  private checkWin(playerIdx: number) {
    const player = this.state.players[playerIdx];
    
    if (this.state.gameMode === '2v2') {
      // 팀의 모든 말 체크
      const teamMals = this.state.players
        .filter(p => p.team === player.team)
        .map(p => p.mals.map(m => ({ position: m.position, isStacked: m.isStacked, stackedWith: [] })));
      
      if (WinCondition.checkTeamWin(teamMals)) {
        this.endGame(player.team);
      }
    } else {
      const mals: MalState[] = player.mals.map(m => ({
        position: m.position,
        isStacked: m.isStacked,
        stackedWith: [],
      }));
      
      if (WinCondition.checkWin(mals)) {
        this.endGame(player.team);
      }
    }
  }

  // === 턴 종료 ===
  private endTurn() {
    this.state.yutResult = '';

    if (this.state.extraTurns > 0) {
      // 추가 턴
      this.state.extraTurns--;
      this.startTurnTimer();
      return;
    }

    // 다음 플레이어
    const currentOrderIdx = this.turnOrder.indexOf(this.state.currentTurn);
    const nextOrderIdx = (currentOrderIdx + 1) % this.turnOrder.length;
    this.state.currentTurn = this.turnOrder[nextOrderIdx];
    this.startTurnTimer();
  }

  // === 게임 종료 ===
  private endGame(winnerTeam: number) {
    this.state.phase = 'finished';
    this.state.winnerTeam = winnerTeam;
    
    const winner = this.state.players.find(p => p.team === winnerTeam);
    if (winner) {
      this.state.winnerId = winner.userId;
    }

    if (this.turnInterval) {
      clearInterval(this.turnInterval);
      this.turnInterval = null;
    }

    // 5초 후 방 닫기
    this.clock.setTimeout(() => {
      this.disconnect();
    }, 5000);
  }

  private handleDisconnectLoss(playerIdx: number) {
    const player = this.state.players[playerIdx];
    const otherTeam = player.team === 0 ? 1 : 0;
    this.endGame(otherTeam);
  }

  // === 유틸 ===
  private getPlayerIndex(client: Client): number {
    return this.state.players.findIndex(p => p.userId === client.sessionId);
  }
}
