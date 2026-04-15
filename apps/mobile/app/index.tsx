import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { GAME_VERSION } from '@yut-nori/shared';
import { t } from '../src/i18n';
import { useSettingsStore } from '../src/stores/useSettingsStore';

export default function Lobby() {
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('app.title')}</Text>
      <Text style={styles.version}>v{GAME_VERSION}</Text>

      <View style={styles.buttons}>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/game?mode=quick')}>
          <Text style={styles.primaryButtonText}>{t('lobby.quickMatch')}</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/game?mode=room')}>
          <Text style={styles.primaryButtonText}>{t('lobby.createRoom')}</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/game?mode=ai')}>
          <Text style={styles.primaryButtonText}>{t('lobby.aiGame')}</Text>
        </Pressable>
      </View>

      <View style={styles.bottomRow}>
        <Pressable style={styles.iconButton} onPress={() => router.push('/settings')}>
          <Text style={styles.iconButtonText}>{t('lobby.settings')}</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => router.push('/leaderboard')}>
          <Text style={styles.iconButtonText}>{t('lobby.leaderboard')}</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => router.push('/profile')}>
          <Text style={styles.iconButtonText}>{t('lobby.profile')}</Text>
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
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#2C1810',
    marginBottom: 8,
    fontFamily: 'System',
  },
  version: {
    fontSize: 14,
    color: '#8B7355',
    marginBottom: 48,
  },
  buttons: {
    gap: 16,
    width: '100%',
    maxWidth: 320,
  },
  primaryButton: {
    backgroundColor: '#D4A574',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 48,
  },
  iconButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  iconButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#8B7355',
  },
});
