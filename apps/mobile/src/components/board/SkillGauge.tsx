import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Text, StyleSheet, Animated } from 'react-native';
import { YutProbability, type GaugeZone } from '@yut-nori/shared';

interface SkillGaugeProps {
  mode: 'classic' | 'skill';
  onThrow: (gaugeZone: GaugeZone) => void;
  disabled: boolean;
}

export function SkillGauge({ mode, onThrow, disabled }: SkillGaugeProps) {
  const animValue = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [gaugePosition, setGaugePosition] = useState(0);

  useEffect(() => {
    if (mode === 'skill' && !disabled) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, { toValue: 1, duration: 875, useNativeDriver: false }),
          Animated.timing(animValue, { toValue: 0, duration: 875, useNativeDriver: false }),
        ])
      );
      animRef.current = animation;
      animation.start();

      const listener = animValue.addListener(({ value }) => setGaugePosition(value));
      return () => {
        animation.stop();
        animValue.removeListener(listener);
      };
    }
  }, [mode, disabled]);

  const handleThrow = () => {
    if (disabled) return;
    
    if (mode === 'classic') {
      onThrow('normal');
    } else {
      animRef.current?.stop();
      const zone = YutProbability.calculateGaugeZone(gaugePosition);
      onThrow(zone);
    }
  };

  const getZoneColor = (pos: number): string => {
    const zone = YutProbability.calculateGaugeZone(pos);
    switch (zone) {
      case 'perfect': return '#E74C3C';
      case 'good': return '#F39C12';
      case 'normal': return '#3498DB';
      case 'bad': return '#95A5A6';
    }
  };

  return (
    <View style={styles.container}>
      {mode === 'skill' && (
        <View style={styles.gaugeBar}>
          <View style={[styles.gaugeZone, styles.badZone, { left: '0%', width: '20%' }]} />
          <View style={[styles.gaugeZone, styles.normalZone, { left: '20%', width: '15%' }]} />
          <View style={[styles.gaugeZone, styles.goodZone, { left: '35%', width: '10%' }]} />
          <View style={[styles.gaugeZone, styles.perfectZone, { left: '45%', width: '10%' }]} />
          <View style={[styles.gaugeZone, styles.goodZone, { left: '55%', width: '10%' }]} />
          <View style={[styles.gaugeZone, styles.normalZone, { left: '65%', width: '15%' }]} />
          <View style={[styles.gaugeZone, styles.badZone, { left: '80%', width: '20%' }]} />
          <Animated.View
            style={[
              styles.gaugeIndicator,
              {
                left: animValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '96%'],
                }),
                backgroundColor: getZoneColor(gaugePosition),
              },
            ]}
          />
        </View>
      )}
      <Pressable
        testID="throw-button"
        accessibilityRole="button"
        style={[styles.throwButton, disabled && styles.throwButtonDisabled]}
        onPress={handleThrow}
        disabled={disabled}
      >
        <Text style={styles.throwButtonText}>
          {mode === 'skill' ? '던지기!' : '던지기'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, width: '100%', paddingHorizontal: 24 },
  gaugeBar: {
    width: '100%',
    height: 24,
    backgroundColor: '#E0D5C8',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  gaugeZone: { position: 'absolute', top: 0, height: '100%' },
  badZone: { backgroundColor: '#BDC3C7' },
  normalZone: { backgroundColor: '#85C1E9' },
  goodZone: { backgroundColor: '#F8C471' },
  perfectZone: { backgroundColor: '#EC7063' },
  gaugeIndicator: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  throwButton: {
    backgroundColor: '#D4A574',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 14,
    alignItems: 'center',
  },
  throwButtonDisabled: { opacity: 0.4 },
  throwButtonText: { fontSize: 18, fontWeight: '600', color: '#FFF' },
});
