import { Client, Room } from 'colyseus.js';

const SERVER_URL = typeof window !== 'undefined' 
  ? `ws://${window.location.hostname}:2567`
  : 'ws://localhost:2567';

class GameClient {
  private client: Client;
  private room: Room | null = null;

  constructor() {
    this.client = new Client(SERVER_URL);
  }

  async joinOrCreate(gameMode: '1v1' | '2v2', gaugeMode: 'classic' | 'skill', options?: { roomCode?: string; userName?: string }): Promise<Room> {
    if (options?.roomCode) {
      this.room = await this.client.joinById(options.roomCode, { gameMode, gaugeMode, userName: options.userName ?? 'Player' });
    } else {
      this.room = await this.client.joinOrCreate('yut_game', { gameMode, gaugeMode, userName: options?.userName ?? 'Player' });
    }
    return this.room;
  }

  async createRoom(gameMode: '1v1' | '2v2', gaugeMode: 'classic' | 'skill', userName?: string): Promise<Room> {
    this.room = await this.client.create('yut_game', { gameMode, gaugeMode, userName: userName ?? 'Player' });
    return this.room;
  }

  throwYut(gaugeZone?: string) { this.room?.send('throw_yut', { gaugeZone }); }
  moveMal(malIndex: number, useShortcut: boolean = false) { this.room?.send('move_mal', { malIndex, useShortcut }); }
  sendMessage(text: string) { this.room?.send('send_message', { text }); }
  getRoom() { return this.room; }
  leave() { this.room?.leave(); this.room = null; }
}

export const gameClient = new GameClient();
