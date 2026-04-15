import React, { useState, useEffect } from 'react';
import { View, Pressable, Text, StyleSheet, Animated } from 'react-native';
import { t } from '../../i18n';

interface ChatBubblesProps {
  onSend: (text: string) => void;
  lastMessage: { userId: string; text: string; timestamp: number } | null;
  disabled: boolean;
}

const MESSAGES = ['sorry', 'wellDone', 'hurry', 'arrived'] as const;
const COOLDOWN = 3000;

export function ChatBubbles({ onSend, lastMessage, disabled }: ChatBubblesProps) {
  const [cooldown, setCooldown] = useState(false);
  const [bubbleOpacity] = useState(new Animated.Value(0));
  const [bubbleText, setBubbleText] = useState('');

  useEffect(() => {
    if (lastMessage) {
      setBubbleText(lastMessage.text);
      Animated.sequence([
        Animated.timing(bubbleOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(bubbleOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [lastMessage?.timestamp]);

  const handleSend = (msgKey: typeof MESSAGES[number]) => {
    if (cooldown || disabled) return;
    const text = t(`chat.${msgKey}`);
    onSend(text);
    setCooldown(true);
    setTimeout(() => setCooldown(false), COOLDOWN);
  };

  return (
    <View style={styles.container}>
      {bubbleText ? (
        <Animated.View style={[styles.bubble, { opacity: bubbleOpacity }]}>
          <Text style={styles.bubbleText}>{bubbleText}</Text>
        </Animated.View>
      ) : null}
      <View style={styles.buttons}>
        {MESSAGES.map((key) => (
          <Pressable
            key={key}
            style={[styles.msgButton, (cooldown || disabled) && styles.msgButtonDisabled]}
            onPress={() => handleSend(key)}
            disabled={cooldown || disabled}
          >
            <Text style={styles.msgButtonText}>{t(`chat.${key}`)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 8 },
  bubble: {
    backgroundColor: '#2C1810',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 4,
  },
  bubbleText: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  buttons: { flexDirection: 'row', gap: 8 },
  msgButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F0E6D8',
  },
  msgButtonDisabled: { opacity: 0.4 },
  msgButtonText: { fontSize: 13, color: '#8B7355' },
});
