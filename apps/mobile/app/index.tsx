import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GAME_VERSION } from '@yut-nori/shared';

export default function Lobby() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>윷놀이</Text>
      <Text style={styles.version}>v{GAME_VERSION}</Text>

      <View style={styles.buttons}>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>빠른 매칭</Text>
        </Pressable>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>방 만들기</Text>
        </Pressable>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>AI 대전</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8F0',
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#2C1810',
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    color: '#8B7355',
    marginBottom: 48,
  },
  buttons: {
    gap: 16,
    width: '80%',
    maxWidth: 320,
  },
  button: {
    backgroundColor: '#D4A574',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
