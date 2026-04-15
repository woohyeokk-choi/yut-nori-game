import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Board } from '../src/components/board/Board';
import { SkillGauge } from '../src/components/board/SkillGauge';
import { ChatBubbles } from '../src/components/board/ChatBubbles';
import { gameClient } from '../src/services/gameClient';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { t } from '../src/i18n';
import { NODE, PathCalculator, type YutResult, type GaugeZone, type MalState, YUT_MOVE_COUNT } from '@yut-nori/shared';

interface MalInfo {
  position: number;
  team: number;
  playerIndex: number;
  malIndex: number;
  isStacked: boolean;
}

export default function Game() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const router = useRouter();
  const gaugeMode = useSettingsStore((s) => s.gaugeMode);

  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<string>('waiting');
  const [currentTurn, setCurrentTurn] = useState(0);
  const [myIndex, setMyIndex] = useState(-1);
  const [yutResult, setYutResult] = useState<string>('');
  const [mals, setMals] = useState<MalInfo[]>([]);
  const [turnTimer, setTurnTimer] = useState(30);
  const [highlightedNodes, setHighlightedNodes] = useState<number[]>([]);
  const [availableMoves, setAvailableMoves] = useState<{ malIndex: number; target: number; shortcut: boolean }[]>([]);
  const [winnerId, setWinnerId] = useState('');
  const [lastMessage, setLastMessage] = useState<{ userId: string; text: string; timestamp: number } | null>(null);
  const [statusText, setStatusText] = useState('접속 중...');

  const isMyTurn = myIndex === currentTurn && phase === 'playing';
  const needsThrow = isMyTurn && !yutResult;
  const needsMove = isMyTurn && !!yutResult;

  // AI 대전용 오프라인 상태
  const [isAI, setIsAI] = useState(mode === 'ai');
  const [aiMals, setAiMals] = useState<MalInfo[]>([]);

  useEffect(() => {
    if (mode === 'ai') {
      setupAIGame();
    } else {
      connectToServer();
    }
    return () => { gameClient.leave(); };
  }, []);

  const setupAIGame = () => {
    setIsAI(true);
    setPhase('playing');
    setMyIndex(0);
    setCurrentTurn(0);
    const initialMals: MalInfo[] = [];
    for (let p = 0; p < 2; p++) {
      for (let m = 0; m < 4; m++) {
        initialMals.push({ position: NODE.START, team: p, playerIndex: p, malIndex: m, isStacked: false });
      }
    }
    setMals(initialMals);
    setStatusText('내 차례 - 던지기!');
  };

  const connectToServer = async () => {
    try {
      const room = await gameClient.joinOrCreate('1v1', gaugeMode);
      setConnected(true);
      setStatusText('상대 대기 중...');

      room.onStateChange((state: any) => {
        setPhase(state.phase);
        setCurrentTurn(state.currentTurn);
        setTurnTimer(state.turnTimer);
        setYutResult(state.yutResult || '');
        setWinnerId(state.winnerId || '');

        if (state.lastMessage) {
          try { setLastMessage(JSON.parse(state.lastMessage)); } catch {}
        }

        const newMals: MalInfo[] = [];
        state.players?.forEach((player: any, pIdx: number) => {
          if (player.userId === room.sessionId && myIndex === -1) {
            setMyIndex(pIdx);
          }
          player.mals?.forEach((mal: any, mIdx: number) => {
            newMals.push({
              position: mal.position,
              team: player.team,
              playerIndex: pIdx,
              malIndex: mIdx,
              isStacked: mal.isStacked,
            });
          });
        });
        setMals(newMals);

        if (state.phase === 'playing') {
          const isMe = state.currentTurn === myIndex;
          setStatusText(isMe ? (state.yutResult ? '말을 선택하세요' : '내 차례 - 던지기!') : '상대 차례');
        } else if (state.phase === 'finished') {
          setStatusText(state.winnerId === room.sessionId ? '승리!' : '패배');
        }
      });
    } catch (e) {
      setStatusText('연결 실패');
    }
  };

  // 윷 던지기 핸들러
  const handleThrow = useCallback((gaugeZone: GaugeZone) => {
    if (isAI) {
      // AI 모드: 로컬 처리
      const { YutProbability } = require('@yut-nori/shared');
      const result: YutResult = YutProbability.getResult(gaugeZone);
      setYutResult(result);
      setStatusText(`결과: ${result} - 말을 선택하세요`);
      
      // 이동 가능한 말 계산
      const myMals = mals.filter(m => m.playerIndex === currentTurn);
      const malStates: MalState[] = myMals.map(m => ({ position: m.position, isStacked: m.isStacked, stackedWith: [] }));
      const moves = PathCalculator.getAvailableMoves(malStates, result);
      const highlights = moves.map(m => m.targetPosition).filter(p => p >= 0 && p < 30);
      setHighlightedNodes(highlights);
      setAvailableMoves(moves.map(m => ({ malIndex: m.malIndex, target: m.targetPosition, shortcut: m.canTakeShortcut })));
    } else {
      gameClient.throwYut(gaugeZone);
    }
  }, [isAI, mals, currentTurn]);

  // 말 이동 핸들러 (노드 클릭)
  const handleNodePress = useCallback((nodeId: number) => {
    if (!needsMove && !isAI) return;

    if (isAI) {
      const move = availableMoves.find(m => m.target === nodeId);
      if (!move) return;

      setMals(prev => {
        const updated = [...prev];
        const mal = updated.find(m => m.playerIndex === currentTurn && m.malIndex === move.malIndex);
        if (!mal) return prev;

        // 잡기 체크
        updated.forEach(m => {
          if (m.team !== currentTurn && m.position === nodeId && m.position >= 0) {
            m.position = NODE.START;
          }
        });

        mal.position = nodeId;
        return [...updated];
      });

      setYutResult('');
      setHighlightedNodes([]);
      setAvailableMoves([]);

      // 승리 체크
      const myMals = mals.filter(m => m.playerIndex === currentTurn);
      const allFinished = myMals.every(m => m.position === NODE.FINISH || m.position === nodeId && nodeId === NODE.FINISH);
      
      if (allFinished) {
        setPhase('finished');
        setWinnerId(currentTurn === 0 ? 'player' : 'ai');
        setStatusText(currentTurn === 0 ? '승리!' : '패배');
        return;
      }

      // AI 턴
      if (currentTurn === 0) {
        setCurrentTurn(1);
        setStatusText('AI 차례...');
        setTimeout(() => doAITurn(), 1500);
      } else {
        setCurrentTurn(0);
        setStatusText('내 차례 - 던지기!');
      }
    } else {
      // 온라인: 서버에 말 이동 전송
      const myMals = mals.filter(m => m.playerIndex === myIndex);
      for (const mal of myMals) {
        if (mal.position !== NODE.FINISH) {
          const result = PathCalculator.calculatePath(mal.position, yutResult as YutResult, false);
          if (result.destination === nodeId) {
            gameClient.moveMal(mal.malIndex, false);
            return;
          }
          const shortcutResult = PathCalculator.calculatePath(mal.position, yutResult as YutResult, true);
          if (shortcutResult.destination === nodeId) {
            gameClient.moveMal(mal.malIndex, true);
            return;
          }
        }
      }
    }
  }, [needsMove, isAI, availableMoves, currentTurn, mals, myIndex, yutResult]);

  // AI 턴 실행
  const doAITurn = () => {
    const { YutProbability } = require('@yut-nori/shared');
    const result: YutResult = YutProbability.getResult('normal');
    
    const aiPlayerMals = mals.filter(m => m.playerIndex === 1);
    const malStates: MalState[] = aiPlayerMals.map(m => ({ position: m.position, isStacked: m.isStacked, stackedWith: [] }));
    const moves = PathCalculator.getAvailableMoves(malStates, result);

    if (moves.length > 0) {
      // 간단한 휴리스틱: 첫 번째 이동 가능한 말 이동
      const move = moves[0];
      setMals(prev => {
        const updated = [...prev];
        const mal = updated.find(m => m.playerIndex === 1 && m.malIndex === move.malIndex);
        if (mal) {
          // 잡기
          updated.forEach(m => {
            if (m.team === 0 && m.position === move.targetPosition && m.position >= 0) {
              m.position = NODE.START;
            }
          });
          mal.position = move.targetPosition;
        }
        return [...updated];
      });
    }

    setCurrentTurn(0);
    setStatusText('내 차례 - 던지기!');
  };

  const handleSendMessage = (text: string) => {
    if (isAI) {
      setLastMessage({ userId: 'player', text, timestamp: Date.now() });
    } else {
      gameClient.sendMessage(text);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => { gameClient.leave(); router.back(); }}>
          <Text style={styles.backText}>← 로비</Text>
        </Pressable>
        <Text style={styles.timerText}>{phase === 'playing' ? `${turnTimer}s` : ''}</Text>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      <Board
        mals={mals}
        highlightedPositions={highlightedNodes}
        onNodePress={handleNodePress}
      />

      {phase === 'playing' && (
        <View style={styles.controls}>
          <SkillGauge
            mode={gaugeMode}
            onThrow={handleThrow}
            disabled={!needsThrow}
          />
          <ChatBubbles
            onSend={handleSendMessage}
            lastMessage={lastMessage}
            disabled={phase !== 'playing'}
          />
        </View>
      )}

      {phase === 'finished' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.resultText}>
            {winnerId === 'player' || (myIndex >= 0 && winnerId) ? '🎉 승리!' : '😔 패배'}
          </Text>
          <Pressable style={styles.backToLobby} onPress={() => router.back()}>
            <Text style={styles.backToLobbyText}>로비로 돌아가기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F0', paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  backText: { fontSize: 17, color: '#D4A574', fontWeight: '600' },
  timerText: { fontSize: 20, fontWeight: '700', color: '#2C1810' },
  statusText: { fontSize: 14, color: '#8B7355', fontWeight: '500' },
  controls: { marginTop: 16, gap: 16, alignItems: 'center' },
  resultOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  resultText: { fontSize: 48, fontWeight: '700', color: '#FFF', marginBottom: 24 },
  backToLobby: { backgroundColor: '#D4A574', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14 },
  backToLobbyText: { fontSize: 17, fontWeight: '600', color: '#FFF' },
});
