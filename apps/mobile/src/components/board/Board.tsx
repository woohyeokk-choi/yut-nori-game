import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { getNodePositions, OUTER_PATH, SHORTCUT_5_TO_15, SHORTCUT_10_TO_FINISH } from '@yut-nori/shared';

const BOARD_SIZE = Math.min(Dimensions.get('window').width - 48, 360);
const PADDING = 30;
const INNER = BOARD_SIZE - PADDING * 2;

interface MalInfo {
  position: number;
  team: number;
  playerIndex: number;
  malIndex: number;
  isStacked: boolean;
}

interface BoardProps {
  mals: MalInfo[];
  highlightedPositions?: number[];
  onNodePress?: (nodeId: number) => void;
}

const TEAM_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F'];

export function Board({ mals, highlightedPositions = [], onNodePress }: BoardProps) {
  const positions = getNodePositions();

  const toScreen = (x: number, y: number) => ({
    sx: PADDING + x * INNER,
    sy: PADDING + y * INNER,
  });

  const renderEdges = () => {
    const allEdges = [...OUTER_PATH, ...SHORTCUT_5_TO_15, ...SHORTCUT_10_TO_FINISH];
    return allEdges.map((edge, i) => {
      const from = positions.get(edge.from);
      // FINISH(30) → 출발점(0)으로 시각적 연결
      const to = edge.to === 30 ? positions.get(0) : positions.get(edge.to);
      if (!from || !to) return null;
      const f = toScreen(from.x, from.y);
      const t = toScreen(to.x, to.y);
      return (
        <Line
          key={`edge-${i}`}
          x1={f.sx} y1={f.sy}
          x2={t.sx} y2={t.sy}
          stroke={edge.isShortcut ? '#C4A882' : '#8B7355'}
          strokeWidth={edge.isShortcut ? 1.5 : 2}
          strokeLinecap="round"
        />
      );
    });
  };

  const renderNodes = () => {
    const nodes: React.ReactNode[] = [];
    positions.forEach((pos, nodeId) => {
      const { sx, sy } = toScreen(pos.x, pos.y);
      const isHighlighted = highlightedPositions.includes(nodeId);
      const isCorner = [0, 5, 10, 15].includes(nodeId);
      const isCenter = nodeId === 22;
      const radius = isCorner || isCenter ? 14 : 10;

      nodes.push(
        <Circle
          key={`node-${nodeId}`}
          cx={sx} cy={sy}
          r={radius}
          fill={isHighlighted ? '#FFD700' : '#FFF8F0'}
          stroke={isHighlighted ? '#E74C3C' : '#8B7355'}
          strokeWidth={isHighlighted ? 3 : 1.5}
          onPress={() => onNodePress?.(nodeId)}
        />
      );

      // 모서리/중앙 라벨
      if (isCorner || isCenter) {
        const labels: Record<number, string> = { 0: '출발', 5: '↗', 10: '↖', 15: '↙', 22: '★' };
        nodes.push(
          <SvgText
            key={`label-${nodeId}`}
            x={sx} y={sy + 4}
            fontSize={isCenter ? 12 : 9}
            fill="#8B7355"
            textAnchor="middle"
            fontWeight="600"
          >
            {labels[nodeId] ?? ''}
          </SvgText>
        );
      }
    });
    return nodes;
  };

  const renderMals = () => {
    const malsByPosition = new Map<number, MalInfo[]>();
    mals.forEach(mal => {
      if (mal.position < 0 || mal.position >= 30) return;
      const existing = malsByPosition.get(mal.position) ?? [];
      existing.push(mal);
      malsByPosition.set(mal.position, existing);
    });

    const malNodes: React.ReactNode[] = [];
    malsByPosition.forEach((malsAtPos, pos) => {
      const nodePos = positions.get(pos);
      if (!nodePos) return;
      const { sx, sy } = toScreen(nodePos.x, nodePos.y);

      malsAtPos.forEach((mal, idx) => {
        const offsetX = idx * 6 - (malsAtPos.length - 1) * 3;
        malNodes.push(
          <Circle
            key={`mal-${mal.playerIndex}-${mal.malIndex}`}
            cx={sx + offsetX}
            cy={sy}
            r={7}
            fill={TEAM_COLORS[mal.team] ?? '#999'}
            stroke="#FFF"
            strokeWidth={2}
          />
        );
      });
    });
    return malNodes;
  };

  return (
    <View style={styles.container}>
      <Svg width={BOARD_SIZE} height={BOARD_SIZE} viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}>
        {renderEdges()}
        {renderNodes()}
        {renderMals()}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
