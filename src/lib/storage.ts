/**
 * Storage typed wrapper.
 *
 * IMPORTANT (BR-active-phase): `active_phase` 키는 **Rust 단일 writer**다.
 * `set("active_phase", ...)`을 직접 호출하지 말 것. TypeScript의 인덱스 키 제너릭
 * 특성상 컴파일 타임에 특정 키만 차단하기 어려우므로 코드 리뷰에서 강제한다.
 * setter는 의도적으로 export하지 않으며, read-only `getActivePhase`만 노출한다.
 */
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  tag: string | null;
  loc: string | null;
  active: boolean;
};
export type WorkTag = { id: string; emoji: string; label: string; color: string };
export type Location = { id: string; emoji: string; label: string; color: string };
export type SessionRecord = {
  date: string;     // 'YYYY-MM-DD' (로컬 시간대)
  sessions: number; // 그 날 완료 세션 수
  avg: number;      // 그 날 평균 집중 점수 (0~100)
  sum?: number;     // 그 날 누적 점수 합계 (avg 역산 오류 방지용 내부 필드)
};
export type ActivePhase = "idle" | "focus" | "break";

export type StoreSchema = {
  onboarding_completed: boolean;
  focus_minutes: number;
  break_minutes: number;
  notifications_enabled: boolean;
  auto_launch_enabled: boolean;
  todos: Todo[];
  work_tags: WorkTag[];
  locations: Location[];
  sessions: Record<string, SessionRecord>;
  active_phase: ActivePhase;
};

export const STORE_FILE = ".store.json";

export const STORE_DEFAULTS: StoreSchema = {
  onboarding_completed: false,
  focus_minutes: 25,
  break_minutes: 5,
  notifications_enabled: true,
  auto_launch_enabled: false,
  todos: [],
  work_tags: [],
  locations: [],
  sessions: {},
  active_phase: "idle",
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

export type SetOptions = {
  /**
   * 디스크 flush 여부. 기본 true.
   * 짧은 시간 내 다수 키를 변경할 때 false로 모은 뒤 마지막에 `flush()`를 호출하면
   * 디스크 I/O를 1회로 묶을 수 있다.
   */
  save?: boolean;
};

export async function set<
  K extends Exclude<keyof StoreSchema, "active_phase" | "sessions" | "auto_launch_enabled">
>(
  key: K,
  value: StoreSchema[K],
  options: SetOptions = {}
): Promise<void> {
  const store = await ensureStore();
  await store.set(key, value);
  if (options.save !== false) {
    await store.save();
  }
}

/** 보류된 변경 사항을 디스크에 flush. `set(key, value, { save: false })`와 짝을 이룬다. */
export async function flush(): Promise<void> {
  const store = await ensureStore();
  await store.save();
}

export async function getOnboardingCompleted(): Promise<boolean> {
  return get("onboarding_completed");
}

export async function setOnboardingCompleted(value: boolean): Promise<void> {
  await set("onboarding_completed", value);
}

/**
 * 자동 실행 상태 read.
 *
 * `auto_launch_enabled`는 store와 OS LaunchAgent 두 시스템에 분산되어 있어 단일 진실 소스가
 * 부재한다. Rust `set_auto_launch` IPC가 store + OS API를 함께 갱신하는 단일 writer이므로,
 * 프론트엔드는 일반 `set()` 경로 대신 본 wrapper만 사용한다 (set 제너릭에서 키 제외됨).
 */
export async function getAutoLaunch(): Promise<boolean> {
  return invoke<boolean>("get_auto_launch");
}

export async function setAutoLaunch(enabled: boolean): Promise<void> {
  await invoke("set_auto_launch", { enabled });
}

/**
 * 현재 active_phase 값을 반환한다 (read-only).
 *
 * setter는 의도적으로 export하지 않는다. active_phase 키의 store write는
 * Rust `timer.rs`가 단일 writer로 수행한다 (DEC-11, MUST-1).
 */
export async function getActivePhase(): Promise<ActivePhase> {
  return get("active_phase");
}

export async function getFocusMinutes(): Promise<number> {
  return get("focus_minutes");
}

export async function setFocusMinutes(
  value: number,
  options: SetOptions = {}
): Promise<void> {
  await set("focus_minutes", value, options);
}

export async function getBreakMinutes(): Promise<number> {
  return get("break_minutes");
}

export async function setBreakMinutes(
  value: number,
  options: SetOptions = {}
): Promise<void> {
  await set("break_minutes", value, options);
}

/**
 * 폴백 정규화: tag/loc/active 부재 또는 구 타입(name) 잔존 시 안전 변환 (Phase 6 M2).
 * - 비배열 잔존 데이터는 빈 배열로 무효화하여 UI 충돌 차단.
 * - id 부재 시 결정적 prefix(`t-fallback-${idx}`)로 폴백 — 호출 시마다 같은 ID 반환 → React key 안정.
 */
export async function getTodos(): Promise<Todo[]> {
  const raw = await get("todos");
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((t: any, idx: number) => ({
    id: typeof t?.id === "string" ? t.id : `t-fallback-${idx}`,
    text: typeof t?.text === "string" ? t.text : "",
    done: !!t?.done,
    tag: typeof t?.tag === "string" ? t.tag : null,
    loc: typeof t?.loc === "string" ? t.loc : null,
    active: !!t?.active,
  }));
}

export async function setTodos(value: Todo[], options: SetOptions = {}): Promise<void> {
  await set("todos", value, options);
}

/** 폴백 정규화 (Phase 6 M2). 비배열은 [], id 부재 시 결정적 폴백. */
export async function getWorkTags(): Promise<WorkTag[]> {
  const raw = await get("work_tags");
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((t: any, idx: number) => ({
    id: typeof t?.id === "string" ? t.id : `wt-fallback-${idx}`,
    emoji: typeof t?.emoji === "string" ? t.emoji : "🏷",
    label: typeof t?.label === "string" ? t.label : (typeof t?.name === "string" ? t.name : ""),
    color: typeof t?.color === "string" ? t.color : "#7aa3e6",
  }));
}

export async function setWorkTags(value: WorkTag[], options: SetOptions = {}): Promise<void> {
  await set("work_tags", value, options);
}

/** 폴백 정규화 (Phase 6 M2). 비배열은 [], id 부재 시 결정적 폴백. */
export async function getLocations(): Promise<Location[]> {
  const raw = await get("locations");
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((t: any, idx: number) => ({
    id: typeof t?.id === "string" ? t.id : `loc-fallback-${idx}`,
    emoji: typeof t?.emoji === "string" ? t.emoji : "📍",
    label: typeof t?.label === "string" ? t.label : (typeof t?.name === "string" ? t.name : ""),
    color: typeof t?.color === "string" ? t.color : "#7aa3e6",
  }));
}

export async function setLocations(value: Location[], options: SetOptions = {}): Promise<void> {
  await set("locations", value, options);
}

/**
 * 세션 기록 read-only 헬퍼. sessions 키의 writer는 Rust 단일 (Phase 8 R-G1).
 * 폴백 정규화: 비객체 → {}, 각 엔트리 부적합 시 { sessions: 0, avg: 0 } 정규화.
 * 기존 minutes 필드 데이터(Phase 1)는 sessions/avg 부재로 무시됨 (D-G5).
 */
export async function getSessions(): Promise<Record<string, SessionRecord>> {
  const raw = await get("sessions");
  // Array도 typeof === "object"라 Object.entries로 통과될 수 있으므로 명시 차단 (cross-review 반영).
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, SessionRecord> = {};
  for (const [date, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const sessions = typeof e.sessions === "number" && e.sessions >= 0 ? e.sessions : 0;
    const avg = typeof e.avg === "number" && e.avg >= 0 && e.avg <= 100 ? e.avg : 0;
    const sum = typeof e.sum === "number" && e.sum >= 0 ? e.sum : undefined;
    result[date] = {
      date: typeof e.date === "string" ? e.date : date,
      sessions,
      avg,
      ...(sum !== undefined ? { sum } : {}),
    };
  }
  return result;
}

/**
 * 사용자 데이터 전체 초기화. Rust `reset_all` 커맨드를 호출한다.
 *
 * Rust 측에서 atomic 강제 → store clear → 10키 default 시드 순으로 처리한다.
 * 실패 시 에러를 호출자에게 재전파하여 상위(SettingsScreen)가 onResetDone 미호출 등
 * 후속 처리를 결정할 수 있도록 한다.
 */
export async function resetAllData(): Promise<void> {
  try {
    await invoke("reset_all");
    // Rust 측에서 store.clear() + seed_defaults()로 디스크가 갱신되었으나
    // 모듈 스코프 메모이제이션된 storeInstance는 stale. 무효화하여 다음 호출에서
    // Store.load(STORE_FILE)을 재실행하도록 한다.
    storeInstance = null;
    initPromise = null;
  } catch (err) {
    console.error("[mohashim] reset_all failed", err);
    throw err;
  }
}
