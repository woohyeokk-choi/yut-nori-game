import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Board } from '../src/components/board/Board';
import { t } from '../src/i18n';
import { NODE } from '@yut-nori/shared';

// 데모용 초기 말 상태
const INITIAL_MALS = [
  // Player 0 (빨강, 팀0)
  { position: NODE.START, team: 0, playerIndex: 0, malIndex: 0, isStacked: false },
  { position: NODE.START, team: 0, playerIndex: 0, malIndex: 1, isStacked: false },
  { position: NODE.START, team: 0, playerIndex: 0, malIndex: 2, isStacked: false },
  { position: NODE.START, team: 0, playerIndex: 0, malIndex: 3, isStacked: false },
  // Player 1 (파랑, 팀1)
  { position: NODE.START, team: 1, playerIndex: 1, malIndex: 0, isStacked: false },
  { position: NODE.START, team: 1, playerIndex: 1, malIndex: 1, isStacked: false },
  { position: NODE.START, team: 1, playerIndex: 1, malIndex: 2, isStacked: false },
  { position: NODE.START, team: 1, playerIndex: 1, malIndex: 3, isStacked: false },
];

export default function Game() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const router = useRouter();
  const [mals, setMals] = useState(INITIAL_MALS);
  const [currentTurn, setCurrentTurn] = useState(0);

  // 데모: 노드 클릭 시 첫 번째 출발 전 말을 해당 위치로 이동
  const handleNodePress = (nodeId: number) => {
    setMals(prev => {
      const updated = [...prev];
      const startMal = updated.find(m => m.playerIndex === currentTurn && m.position === NODE.START);
      if (startMal) {
        startMal.position = nodeId;
        setCurrentTurn(ct => ct === 0 ? 1 : 0);
      }
      return [...updated];
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>← 로비</Text>
        </Pressable>
        <Text style={styles.turnText}>
          {currentTurn === 0 ? '🔴 빨강 차례' : '🔵 파랑 차례'}
        </Text>
      </View>

      <Board
        mals={mals}
        onNodePress={handleNodePress}
      />

      <View style={styles.footer}>
        <Text style={styles.modeText}>Mode: {mode ?? 'demo'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    paddingTop: 60,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  backText: { fontSize: 17, color: '#D4A574', fontWeight: '600' },
  turnText: { fontSize: 17, fontWeight: '600', color: '#2C1810' },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  modeText: { fontSize: 14, color: '#8B7355' },
});
