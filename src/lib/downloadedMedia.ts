import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How long the "Saved" pill remains visible on the media preview (30 seconds).
 */
export const SAVED_PILL_DURATION_MS = 30 * 1000;

const STORAGE_KEY = 'gc:downloadedMediaTimestamps';

/** Map of messageId -> epoch timestamp (ms) when saved. */
let cache: Map<string, number> | null = null;

async function load(): Promise<Map<string, number>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = new Map();
      return cache;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Migrate legacy string[] format with current timestamp
      cache = new Map(parsed.map((id) => [id, Date.now()]));
    } else if (parsed && typeof parsed === 'object') {
      cache = new Map(Object.entries(parsed).map(([k, v]) => [k, Number(v)]));
    } else {
      cache = new Map();
    }
  } catch {
    cache = new Map();
  }
  return cache;
}

/**
 * Returns set of message IDs whose saved status has not yet expired (saved within last 30 seconds).
 */
export async function getDownloadedIds(): Promise<Set<string>> {
  const map = await load();
  const now = Date.now();
  const activeIds = new Set<string>();
  let hasExpired = false;

  for (const [id, timestamp] of map.entries()) {
    if (now - timestamp < SAVED_PILL_DURATION_MS) {
      activeIds.add(id);
    } else {
      map.delete(id);
      hasExpired = true;
    }
  }

  if (hasExpired) {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(map.entries()))
      );
    } catch {
      // Best-effort cache cleanup
    }
  }

  return activeIds;
}

/**
 * Marks a message as saved at the current timestamp, persists it, and returns
 * the active unexpired set of saved message IDs.
 */
export async function markDownloaded(messageId: string): Promise<Set<string>> {
  const map = await load();
  map.set(messageId, Date.now());

  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(map.entries()))
    );
  } catch {
    // Best-effort
  }

  return getDownloadedIds();
}
