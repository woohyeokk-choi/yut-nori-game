import React from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { Canvas, Circle, Line, Text as SkiaText, useFont, vec, Paint, Group } from '@shopify/react-native-skia';
import { getNodePositions, OUTER_PATH, SHORTCUT_5_TO_15, SHORTCUT_10_TO_FINISH } from '@yut-nori/shared';
import { findClosestNode } from './hitTest';

const BOARD_SIZE = Math.min(Dimensions.get('window').width - 48, 360);
const PADDING = 30;
const INNER = BOARD_SIZE - PADDING * 2;

const TEAM_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F'];

interface MalInfo {
  position: number;
  team: number;
  playerIndex: number;
  malIndex: number;
  isStacked: boolean;
}

interface SkiaBoardProps {
  mals: MalInfo[];
  highlightedPositions?: number[];
  onNodePress?: (nodeId: number) => void;
}

export function SkiaBoard({ mals, highlightedPositions = [], onNodePress }: SkiaBoardProps) {
  const positions = getNodePositions();

  const toScreen = (x: number, y: number) => ({
    sx: PADDING + x * INNER,
    sy: PADDING + y * INNER,
  });

  const handleTouch = (e: any) => {
    if (!onNodePress) return;
    const { locationX, locationY } = e.nativeEvent;
    const nodeId = findClosestNode(
      locationX, locationY, BOARD_SIZE, PADDING,
      highlightedPositions.length > 0, highlightedPositions
    );
    if (nodeId !== null) {
      onNodePress(nodeId);
    }
  };

  return (
    <View style={styles.container} onTouchEnd={handleTouch}>
      <Canvas style={{ width: BOARD_SIZE, height: BOARD_SIZE }}>
        {/* 간선 (경로) */}
        {[...OUTER_PATH, ...SHORTCUT_5_TO_15, ...SHORTCUT_10_TO_FINISH].map((edge, i) => {
          const from = positions.get(edge.from);
          const to = edge.to === 30 ? positions.get(0) : positions.get(edge.to);
          if (!from || !to) return null;
          const f = toScreen(from.x, from.y);
          const t = toScreen(to.x, to.y);
          return (
            <Line
              key={`edge-${i}`}
              p1={vec(f.sx, f.sy)}
              p2={vec(t.sx, t.sy)}
              color={edge.isShortcut ? '#C4A882' : '#8B7355'}
              strokeWidth={edge.isShortcut ? 1.5 : 2}
              style="stroke"
            />
          );
        })}

        {/* 노드 */}
        {Array.from(positions.entries()).map(([nodeId, pos]) => {
          const { sx, sy } = toScreen(pos.x, pos.y);
          const isHighlighted = highlightedPositions.includes(nodeId);
          const isCorner = [0, 5, 10, 15].includes(nodeId);
          const isCenter = nodeId === 22;
          const radius = isCorner || isCenter ? 14 : 10;

          return (
            <React.Fragment key={`node-${nodeId}`}>
              <Circle
                cx={sx} cy={sy} r={radius}
                color={isHighlighted ? '#FFD700' : '#FFF8F0'}
              />
              <Circle
                cx={sx} cy={sy} r={radius}
                color={isHighlighted ? '#E74C3C' : '#8B7355'}
                style="stroke"
                strokeWidth={isHighlighted ? 3 : 1.5}
              />
            </React.Fragment>
          );
        })}

        {/* 말 */}
        {(() => {
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
                <React.Fragment key={`mal-${mal.playerIndex}-${mal.malIndex}`}>
                  <Circle
                    cx={sx + offsetX} cy={sy} r={7}
                    color={TEAM_COLORS[mal.team] ?? '#999'}
                  />
                  <Circle
                    cx={sx + offsetX} cy={sy} r={7}
                    color="#FFFFFF"
                    style="stroke"
                    strokeWidth={2}
                  />
                </React.Fragment>
              );
            });
          });
          return malNodes;
        })()}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
