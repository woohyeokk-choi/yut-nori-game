import { create } from 'zustand';

type SubType = 'free' | 'weekly' | 'monthly' | 'lifetime';

interface SubscriptionState {
  type: SubType;
  isSubscribed: boolean;
  subscribe: (type: SubType) => void;
  unsubscribe: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  type: 'free',
  isSubscribed: false,
  subscribe: (type) => set({ type, isSubscribed: type !== 'free' }),
  unsubscribe: () => set({ type: 'free', isSubscribed: false }),
}));
