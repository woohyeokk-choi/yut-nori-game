const { Schema, ArraySchema, defineTypes } = require('@colyseus/schema');

class MalSchema extends Schema {
  constructor() {
    super();
    this.position = -1;
    this.isStacked = false;
  }
}
defineTypes(MalSchema, { position: 'int8', isStacked: 'boolean' });

class PlayerSchema extends Schema {
  constructor() {
    super();
    this.userId = '';
    this.userName = '';
    this.team = 0;
    this.mals = new ArraySchema();
    this.isConnected = true;
  }
}
defineTypes(PlayerSchema, { userId: 'string', userName: 'string', team: 'int8', mals: [MalSchema], isConnected: 'boolean' });

class GameState extends Schema {
  constructor() {
    super();
    this.phase = 'waiting';
    this.currentTurn = 0;
    this.turnTimer = 30;
    this.yutResult = '';
    this.extraTurns = 0;
    this.gaugeMode = 'classic';
    this.gameMode = '1v1';
    this.players = new ArraySchema();
    this.winnerId = '';
    this.winnerTeam = -1;
    this.turnStartedAt = 0;
    this.lastMessage = '';
  }
}
defineTypes(GameState, {
  phase: 'string', currentTurn: 'int8', turnTimer: 'int8', yutResult: 'string',
  extraTurns: 'int8', gaugeMode: 'string', gameMode: 'string', players: [PlayerSchema],
  winnerId: 'string', winnerTeam: 'int8', turnStartedAt: 'number', lastMessage: 'string',
});

module.exports = { MalSchema, PlayerSchema, GameState };
