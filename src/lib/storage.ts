import { Store } from "@tauri-apps/plugin-store";

export type Todo = { id: string; text: string; done: boolean };
export type WorkTag = { id: string; name: string; color: string };
export type Location = { id: string; name: string };
export type SessionRecord = { date: string; minutes: number };

export type StoreSchema = {
  onboarding_completed: boolean;
  focus_minutes: number;
  break_minutes: number;
  notifications_enabled: boolean;
  todos: Todo[];
  work_tags: WorkTag[];
  locations: Location[];
  sessions: Record<string, SessionRecord>;
};

export const STORE_FILE = ".store.json";

export const STORE_DEFAULTS: StoreSchema = {
  onboarding_completed: false,
  focus_minutes: 25,
  break_minutes: 5,
  notifications_enabled: true,
  todos: [],
  work_tags: [],
  locations: [],
  sessions: {},
};

type StoreInstance = Awaited<ReturnType<typeof Store.load>>;

// 모듈 스코프 메모이제이션 — StrictMode 안전. initPromise를 영속 캐시로 유지하여
// 동시 호출자들이 동일한 promise를 await 하도록 보장한다.
let storeInstance: StoreInstance | null = null;
let initPromise: Promise<void> | null = null;

export async function initStorage(): Promise<void> {
  if (storeInstance) return;
  if (!initPromise) {
    initPromise = (async () => {
      storeInstance = await Store.load(STORE_FILE);
    })().catch((err) => {
      // 실패 시 캐시를 비워 다음 호출에서 재시도 가능하게 한다.
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

async function ensureStore(): Promise<StoreInstance> {
  if (!storeInstance) {
    await initStorage();
  }
  if (!storeInstance) {
    throw new Error("[mohashim] storage not initialized");
  }
  return storeInstance;
}

export async function get<K extends keyof StoreSchema>(
  key: K
): Promise<StoreSchema[K]> {
  const store = await ensureStore();
  const value = await store.get<StoreSchema[K]>(key);
  if (value === null || value === undefined) {
    return STORE_DEFAULTS[key];
  }
  return value;
}

export async function set<K extends keyof StoreSchema>(
  key: K,
  value: StoreSchema[K]
): Promise<void> {
  const store = await ensureStore();
  await store.set(key, value);
  await store.save();
}

export async function getOnboardingCompleted(): Promise<boolean> {
  return get("onboarding_completed");
}

export async function setOnboardingCompleted(value: boolean): Promise<void> {
  await set("onboarding_completed", value);
}
