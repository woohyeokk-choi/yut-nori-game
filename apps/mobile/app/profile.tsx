import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../src/i18n';
import { useCharacterStore } from '../src/stores/useCharacterStore';
import { useSubscriptionStore } from '../src/stores/useSubscriptionStore';

export default function Profile() {
  const router = useRouter();
  const { characters, selectedId, select } = useCharacterStore();
  const { isSubscribed, type: subType } = useSubscriptionStore();

  return (
    <ScrollView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← {t('lobby.profile')}</Text>
      </Pressable>

      <Text style={styles.name}>Player 1</Text>
      <Text style={styles.stats}>0W - 0L (0%)</Text>
      <Text style={styles.subStatus}>구독: {subType === 'free' ? '무료' : subType}</Text>

      <Text style={styles.sectionTitle}>캐릭터 선택</Text>
      <View style={styles.grid}>
        {characters.map((char) => {
          const locked = char.premium && !isSubscribed;
          const active = char.id === selectedId;
          return (
            <Pressable
              key={char.id}
              style={[styles.charCard, active && styles.charCardActive, locked && styles.charCardLocked]}
              onPress={() => !locked && select(char.id)}
              disabled={locked}
            >
              <Text style={styles.charEmoji}>{char.emoji}</Text>
              <Text style={[styles.charName, locked && styles.charNameLocked]}>
                {char.name}
              </Text>
              {locked && <Text style={styles.lockBadge}>🔒</Text>}
              {active && <Text style={styles.activeBadge}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F0', padding: 24, paddingTop: 64 },
  back: { marginBottom: 24 },
  backText: { fontSize: 17, color: '#D4A574', fontWeight: '600' },
  name: { fontSize: 28, fontWeight: '700', color: '#2C1810' },
  stats: { fontSize: 17, color: '#8B7355', marginTop: 4 },
  subStatus: { fontSize: 14, color: '#B0A090', marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#2C1810', marginTop: 32, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  charCard: {
    width: 72, height: 88, backgroundColor: '#F0E6D8', borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  charCardActive: { backgroundColor: '#D4A574', borderWidth: 2, borderColor: '#B8854A' },
  charCardLocked: { opacity: 0.45 },
  charEmoji: { fontSize: 28 },
  charName: { fontSize: 11, color: '#8B7355', marginTop: 4, fontWeight: '500' },
  charNameLocked: { color: '#B0A090' },
  lockBadge: { position: 'absolute', top: 4, right: 4, fontSize: 12 },
  activeBadge: { position: 'absolute', top: 4, right: 4, fontSize: 14, color: '#FFF' },
});
