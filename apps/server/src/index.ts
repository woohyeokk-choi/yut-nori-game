import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import http from 'http';
import { GAME_VERSION } from '@yut-nori/shared';
import { YutGameRoom } from './rooms/YutGameRoom';

const app = express();
const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

// 게임 Room 등록
gameServer.define('yut_game', YutGameRoom);

app.get('/', (_req, res) => {
  res.json({ name: 'Yut Nori Game Server', version: GAME_VERSION });
});

const PORT = Number(process.env.PORT) || 2567;
gameServer.listen(PORT).then(() => {
  console.log(`Colyseus server listening on port ${PORT}`);
  console.log(`Game room "yut_game" registered`);
});
