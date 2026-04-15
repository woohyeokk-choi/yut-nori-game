import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { t } from '../src/i18n';

export default function Leaderboard() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← {t('leaderboard.title')}</Text>
      </Pressable>
      <Text style={styles.text}>{t('leaderboard.title')}</Text>
      <Text style={styles.sub}>{t('match.finding')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F0', padding: 24, paddingTop: 64 },
  back: { marginBottom: 32 },
  backText: { fontSize: 17, color: '#D4A574', fontWeight: '600' },
  text: { fontSize: 24, fontWeight: '700', color: '#2C1810' },
  sub: { fontSize: 15, color: '#8B7355', marginTop: 8 },
});
