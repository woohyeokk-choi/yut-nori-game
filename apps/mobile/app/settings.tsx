import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../src/i18n';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { useSubscriptionStore } from '../src/stores/useSubscriptionStore';
import type { Language } from '../src/i18n';

export default function Settings() {
  const router = useRouter();
  const { language, soundEnabled, gaugeMode, changeLanguage, toggleSound, setGaugeMode } = useSettingsStore();
  const { type: subType, isSubscribed, subscribe, unsubscribe } = useSubscriptionStore();

  const languages: { key: Language; label: string }[] = [
    { key: 'ko', label: '한국어' },
    { key: 'en', label: 'English' },
    { key: 'ja', label: '日本語' },
  ];

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← {t('lobby.settings')}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.row}>
        {languages.map((lang) => (
          <Pressable
            key={lang.key}
            style={[styles.chip, language === lang.key && styles.chipActive]}
            onPress={() => changeLanguage(lang.key)}
          >
            <Text style={[styles.chipText, language === lang.key && styles.chipTextActive]}>
              {lang.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('settings.sound')}</Text>
      <Switch value={soundEnabled} onValueChange={toggleSound} />

      <Text style={styles.sectionTitle}>{t('settings.gaugeMode')}</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.chip, gaugeMode === 'classic' && styles.chipActive]}
          onPress={() => setGaugeMode('classic')}
        >
          <Text style={[styles.chipText, gaugeMode === 'classic' && styles.chipTextActive]}>
            {t('game.classic')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, gaugeMode === 'skill' && styles.chipActive]}
          onPress={() => setGaugeMode('skill')}
        >
          <Text style={[styles.chipText, gaugeMode === 'skill' && styles.chipTextActive]}>
            {t('game.skill')}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t('settings.subscription')}</Text>
      <Text style={styles.subStatus}>현재: {subType === 'free' ? '무료' : subType}</Text>
      <View style={styles.row}>
        {isSubscribed ? (
          <Pressable style={[styles.chip, styles.chipDanger]} onPress={unsubscribe}>
            <Text style={styles.chipTextActive}>구독 해지</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.chip} onPress={() => subscribe('weekly')}>
              <Text style={styles.chipText}>주간 ₩2,900</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => subscribe('monthly')}>
              <Text style={styles.chipText}>월간 ₩7,900</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => subscribe('lifetime')}>
              <Text style={styles.chipText}>평생 ₩29,900</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F0', padding: 24, paddingTop: 64 },
  backButton: { marginBottom: 32 },
  backText: { fontSize: 17, color: '#D4A574', fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#8B7355', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F0E6D8' },
  chipActive: { backgroundColor: '#D4A574' },
  chipText: { fontSize: 15, color: '#8B7355' },
  chipTextActive: { color: '#FFFFFF' },
  chipDanger: { backgroundColor: '#E74C3C' },
  subStatus: { fontSize: 14, color: '#8B7355', marginBottom: 8 },
});
