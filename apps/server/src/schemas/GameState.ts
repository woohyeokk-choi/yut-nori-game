import { Schema, type, ArraySchema, MapSchema } from '@colyseus/schema';

export class MalSchema extends Schema {
  @type('int8') position: number = -1;
  @type('boolean') isStacked: boolean = false;
  @type(['int8']) stackedWith = new ArraySchema<number>();
}

export class PlayerSchema extends Schema {
  @type('string') userId: string = '';
  @type('string') userName: string = '';
  @type('int8') team: number = 0;
  @type([MalSchema]) mals = new ArraySchema<MalSchema>();
  @type('boolean') isConnected: boolean = true;
}

export class GameState extends Schema {
  @type('string') phase: string = 'waiting'; // waiting | playing | finished
  @type('int8') currentTurn: number = 0;
  @type('int8') turnTimer: number = 30;
  @type('string') yutResult: string = '';
  @type('int8') extraTurns: number = 0;
  @type('string') gaugeMode: string = 'classic'; // classic | skill
  @type('string') gameMode: string = '1v1'; // 1v1 | 2v2
  @type([PlayerSchema]) players = new ArraySchema<PlayerSchema>();
  @type('string') winnerId: string = '';
  @type('int8') winnerTeam: number = -1;
  @type('int64') turnStartedAt: number = 0;
  
  // 말풍선 메시지 (최근 1개만)
  @type('string') lastMessage: string = ''; // JSON: { userId, text, timestamp }
}
