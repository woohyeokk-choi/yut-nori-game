import { View, Text, StyleSheet } from 'react-native';
import { useRouter, Pressable } from 'expo-router';
import { t } from '../src/i18n';

export default function Profile() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← {t('lobby.profile')}</Text>
      </Pressable>
      <Text style={styles.name}>Player 1</Text>
      <Text style={styles.stats}>0W - 0L (0%)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F0', padding: 24, paddingTop: 64 },
  back: { marginBottom: 32 },
  backText: { fontSize: 17, color: '#D4A574', fontWeight: '600' },
  name: { fontSize: 28, fontWeight: '700', color: '#2C1810' },
  stats: { fontSize: 17, color: '#8B7355', marginTop: 8 },
});
