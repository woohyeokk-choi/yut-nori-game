import { View, Text, StyleSheet } from 'react-native';
import { useSubscriptionStore } from '../stores/useSubscriptionStore';

export function AdBanner() {
  const isSubscribed = useSubscriptionStore((s) => s.isSubscribed);
  if (isSubscribed) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>광고 영역 (AdMob Banner)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 50,
    backgroundColor: '#E8DDD0',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D4C5B5',
  },
  bannerText: {
    fontSize: 12,
    color: '#8B7355',
  },
});
