import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIShare, Mention, Message, MessageMedia } from '../types';

const CACHE_PREFIX = '@gc_msg_cache_';
const QUEUE_PREFIX = '@gc_offline_queue_';
const MAX_CACHED_MESSAGES = 80;

export type QueuedMessage = {
  id: string;
  clientMessageId: string;
  groupId: string;
  authorId: string;
  text: string;
  replyToMessageId?: string | null;
  mentions?: Mention[];
  mentionEveryone?: boolean;
  media?: MessageMedia | null;
  aiShare?: AIShare | null;
  stickerId?: string | null;
  pollId?: string | null;
  createdAt: string;
  status: 'sending' | 'failed';
  retryCount: number;
};

/** Load cached messages for a group from AsyncStorage */
export async function getCachedMessages(groupId: string): Promise<Message[]> {
  if (!groupId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${groupId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[offlineQueue] getCachedMessages failed:', e);
    return [];
  }
}

/** Save recent messages for a group into AsyncStorage (trimmed to MAX_CACHED_MESSAGES) */
export async function saveCachedMessages(groupId: string, messages: Message[]): Promise<void> {
  if (!groupId || !messages) return;
  try {
    // Exclude daily recap synthetic cards and volatile ephemeral cards from persistent storage
    const persistable = messages
      .filter((m) => !m.isDailyRecapCard && !m.gcCommandEntry)
      .slice(-MAX_CACHED_MESSAGES);

    await AsyncStorage.setItem(`${CACHE_PREFIX}${groupId}`, JSON.stringify(persistable));
  } catch (e) {
    console.warn('[offlineQueue] saveCachedMessages failed:', e);
  }
}

/** Load pending offline messages for a group */
export async function getOfflineQueue(groupId: string): Promise<QueuedMessage[]> {
  if (!groupId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${QUEUE_PREFIX}${groupId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[offlineQueue] getOfflineQueue failed:', e);
    return [];
  }
}

/** Add a message to the persistent offline queue */
export async function enqueueOfflineMessage(item: QueuedMessage): Promise<void> {
  if (!item.groupId || !item.clientMessageId) return;
  try {
    const queue = await getOfflineQueue(item.groupId);
    const existingIndex = queue.findIndex((q) => q.clientMessageId === item.clientMessageId);
    if (existingIndex >= 0) {
      queue[existingIndex] = item;
    } else {
      queue.push(item);
    }
    await AsyncStorage.setItem(`${QUEUE_PREFIX}${item.groupId}`, JSON.stringify(queue));
  } catch (e) {
    console.warn('[offlineQueue] enqueueOfflineMessage failed:', e);
  }
}

/** Remove a message from the offline queue upon successful delivery */
export async function dequeueOfflineMessage(groupId: string, clientMessageId: string): Promise<void> {
  if (!groupId || !clientMessageId) return;
  try {
    const queue = await getOfflineQueue(groupId);
    const filtered = queue.filter((q) => q.clientMessageId !== clientMessageId);
    await AsyncStorage.setItem(`${QUEUE_PREFIX}${groupId}`, JSON.stringify(filtered));
  } catch (e) {
    console.warn('[offlineQueue] dequeueOfflineMessage failed:', e);
  }
}

/** Update the delivery status of a queued message (e.g. 'sending' or 'failed') */
export async function updateQueuedMessageStatus(
  groupId: string,
  clientMessageId: string,
  status: 'sending' | 'failed'
): Promise<void> {
  if (!groupId || !clientMessageId) return;
  try {
    const queue = await getOfflineQueue(groupId);
    const target = queue.find((q) => q.clientMessageId === clientMessageId);
    if (target) {
      target.status = status;
      if (status === 'failed') {
        target.retryCount += 1;
      }
      await AsyncStorage.setItem(`${QUEUE_PREFIX}${groupId}`, JSON.stringify(queue));
    }
  } catch (e) {
    console.warn('[offlineQueue] updateQueuedMessageStatus failed:', e);
  }
}

/** Clear all pending messages in the queue for a group */
export async function clearOfflineQueue(groupId: string): Promise<void> {
  if (!groupId) return;
  try {
    await AsyncStorage.removeItem(`${QUEUE_PREFIX}${groupId}`);
  } catch (e) {
    console.warn('[offlineQueue] clearOfflineQueue failed:', e);
  }
}
