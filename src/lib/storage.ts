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
  /**
   * 완료 시각 (FR-1, DEC-10-4). 미완료/미설정 시 null.
   * JS `new Date().toISOString()` UTC `Z` 포맷 — yearly_cleanup 정리 기준은 `done` 단순 비교이므로
   * timezone 무관. Phase 12 grass 집계용으로 도입.
   */
  completedAt: string | null;
};
export type WorkTag = { id: string; emoji: string; label: string; color: string };
export type Location = { id: string; emoji: string; label: string; color: string };
export type SessionRecord = {
  date: string;     // 'YYYY-MM-DD' (로컬 시간대)
  sessions: number; // 그 날 완료 세션 수
  avg: number;      // 그 날 평균 집중 점수 (0~100)
  sum?: number;     // 그 날 누적 점수 합계 (avg 역산 오류 방지용 내부 필드)
  /**
   * 그 날 완료 todo 개수 (FR-2). Phase 12에서 채워진다 — 본 Phase는 타입만 확장.
   */
  todos_completed?: number;
};
/**
 * Focus 세션 단위 로그 (FR-4). Rust 단일 writer (BR-1) — TS는 read-only.
 * id 포맷: `sl-{end_at_unix_ms}-{score}` (DEC-10-2).
 * 시각: chrono::Local::to_rfc3339() (DEC-10-3, offset 명시).
 *
 * Phase 22 (FR-9~11, DEC-22-4): `avg_db`, `earned_sprouts` 추가. 기존 로그에 부재 시
 * `getSessionLogs` 폴백 정규화에서 0.
 */
export type SessionLog = {
  id: string;
  date: string;          // 'YYYY-MM-DD' Local
  start_at: string;      // RFC3339 with offset
  end_at: string;        // RFC3339 with offset
  duration_mins: number;
  score: number;         // 0~100
  todos_done: string[];  // Phase 13: Focus/Break 중 완료된 todo의 ID 목록 (FR-13~17). 미체크 세션은 [].
  /** Phase 22 FR-9/10: 세션 평균 마이크 dB. 본 Phase에서 항상 0. Phase 26에서 실측. */
  avg_db: number;
  /** Phase 22 FR-11/16: 세션 완료 시 지급된 새싹 수. */
  earned_sprouts: number;
  /** 태그 인사이트: 세션 dominant 작업 태그 ID 스냅샷. 기존 로그는 null/부재 → 분석 시 폴백. */
  work_tag_id?: string | null;
  /** 태그 인사이트: 세션 dominant 위치 태그 ID 스냅샷. 기존 로그는 null/부재 → 분석 시 폴백. */
  location_id?: string | null;
};
export type ActivePhase = "idle" | "focus" | "break";

/**
 * 새싹 잔액 + 출석 보상 멱등 가드 (Phase 22 FR-2, BR-2/3).
 * Rust 단일 writer (P-D4) — TS `set()` Exclude로 직접 쓰기 차단.
 */
export type Economy = {
  sprouts: number;
  /** YYYY-MM-DD Local. 미지급 시 null (FR-19). */
  lastTodoSproutDate: string | null;
};

/**
 * 보유/장착 아이템 (Phase 22 FR-3). Phase 24 Shop write 경로 (시드만).
 * 3슬롯 캐릭터 레이어: face / head / back. 각 슬롯 미장착 시 null.
 */
export type Inventory = {
  owned: string[];
  equipped: {
    face: string | null;
    head: string | null;
    back: string | null;
  };
};

/**
 * 단일 편지 항목 (Phase 23 FR-2, BR-3).
 * Rust 단일 writer (P-D4) — TS는 get_mailbox IPC + getMailbox() read-only만 노출.
 */
export type MailboxKind = "SESSION" | "MONTHLY" | "SYSTEM";
export type Letter = {
  id: string;
  kind: MailboxKind;
  title: string;
  body: string;
  /** RFC3339 with offset (Rust chrono::Local::to_rfc3339). */
  createdAt: string;
  read: boolean;
  sessionTag: string | null;
};
export type Mailbox = Letter[];

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
  session_logs: SessionLog[];
  last_cleanup_year: number;
  // Phase 22 V2 economy 인프라 (FR-1, P-D1).
  economy: Economy;
  inventory: Inventory;
  mailbox: Mailbox;
  /** 월간 인사이트 마지막 발송 YYYY-MM. 미발송 시 null (Phase 26 write). */
  last_monthly_letter_year_month: string | null;
};

export const STORE_FILE = ".store.json";

/**
 * Rust 단일 writer 키 런타임 가드 (P-D4, AC-20).
 *
 * `set<K>()`의 제너릭 Exclude로 컴파일 타임에는 차단되나, 동일 모듈 내 신규 코드가
 * `storeInstance.set(key, value)`을 직접 호출하거나 타입 우회(`as any`) 시 차단되지
 * 않는다. 본 Set은 `set()` 진입 시점에 키를 검사하여 **런타임 이중 방어**로 단일
 * writer 정책을 보장한다 (P-D4 정책 보장).
 */
const RUNTIME_READONLY_KEYS: ReadonlySet<string> = new Set([
  "active_phase",
  "sessions",
  "auto_launch_enabled",
  "session_logs",
  "last_cleanup_year",
  "economy",
  "inventory",
  "mailbox",
  "last_monthly_letter_year_month",
]);

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
  session_logs: [],
  last_cleanup_year: 0,
  // Phase 22 FR-2~5: V2 economy 인프라 시드.
  economy: { sprouts: 0, lastTodoSproutDate: null },
  inventory: { owned: [], equipped: { face: null, head: null, back: null } },
  mailbox: [],
  last_monthly_letter_year_month: null,
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

/**
 * 스토어 키 set. Rust 단일 writer 키(`active_phase`, `sessions`, `auto_launch_enabled`,
 * `session_logs`, `last_cleanup_year`, `economy`, `inventory`, `mailbox`,
 * `last_monthly_letter_year_month`)는 제너릭 Exclude로 컴파일 타임 차단된다 (P-D4, AC-20).
 *
 * **런타임 이중 방어 (P-D4 정책 보장)**: `RUNTIME_READONLY_KEYS` 가드로 진입 시 키를
 * 재검사한다. 모듈 내부에서 `as any` 우회나 신규 코드의 실수가 발생해도 런타임 throw로
 * 차단되어 잘못된 디스크 쓰기를 막는다. 단일 writer 키 변경은 반드시 Rust IPC를 경유한다.
 */
export async function set<
  K extends Exclude<
    keyof StoreSchema,
    | "active_phase"
    | "sessions"
    | "auto_launch_enabled"
    | "session_logs"
    | "last_cleanup_year"
    | "economy"
    | "inventory"
    | "mailbox"
    | "last_monthly_letter_year_month"
  >
>(
  key: K,
  value: StoreSchema[K],
  options: SetOptions = {}
): Promise<void> {
  // 런타임 이중 방어 (P-D4): 컴파일 타임 Exclude 우회 시 차단.
  if (RUNTIME_READONLY_KEYS.has(key as string)) {
    throw new Error(
      `[mohashim] '${String(key)}' is a Rust single-writer key. Use Rust IPC instead of TS set().`
    );
  }
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
    completedAt: typeof t?.completedAt === "string" ? t.completedAt : null,
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
    // Phase 12 FR-6: todos_completed 정규화. 0 미만 또는 비숫자는 undefined로 폴백 (grass.ts에서 0 폴백).
    const todosCompleted =
      typeof e.todos_completed === "number" && e.todos_completed >= 0
        ? e.todos_completed
        : undefined;
    result[date] = {
      date: typeof e.date === "string" ? e.date : date,
      sessions,
      avg,
      ...(sum !== undefined ? { sum } : {}),
      ...(todosCompleted !== undefined ? { todos_completed: todosCompleted } : {}),
    };
  }
  return result;
}

/**
 * 세션 로그 read-only 헬퍼 (FR-4). session_logs 키의 writer는 Rust 단일 (BR-1).
 * 비배열 잔존 데이터는 빈 배열로 폴백.
 *
 * Phase 22 (DEC-22-4): 기존 로그에 `avg_db` / `earned_sprouts` 부재 시 0 폴백.
 */
export async function getSessionLogs(): Promise<SessionLog[]> {
  const raw = await get("session_logs");
  if (!Array.isArray(raw)) return [];
  // PR #14 리뷰: 손상/레거시 데이터 방어.
  // - todos_done이 배열이 아닌 경우 빈 배열 폴백 (string 문자 이터레이션 방지)
  // - raw 항목 자체가 null/원시값이면 빈 SessionLog 골격으로 폴백 (스프레드 TypeError 방지)
  return (raw as unknown[]).map((r) => {
    if (typeof r !== "object" || r === null) {
      return {
        todos_done: [],
        avg_db: 0,
        earned_sprouts: 0,
        work_tag_id: null,
        location_id: null,
      } as unknown as SessionLog;
    }
    const log = r as Record<string, unknown>;
    return {
      ...log,
      todos_done: Array.isArray(log.todos_done) ? (log.todos_done as string[]) : [],
      // Phase 22 DEC-22-4: 기존 로그(부재) / 비숫자 / 음수는 0 폴백.
      avg_db:
        typeof log.avg_db === "number" && log.avg_db >= 0 ? log.avg_db : 0,
      earned_sprouts:
        typeof log.earned_sprouts === "number" && log.earned_sprouts >= 0
          ? log.earned_sprouts
          : 0,
      // 태그 인사이트: 기존 로그(부재) / 비문자열 / 빈 문자열은 null 폴백.
      work_tag_id:
        typeof log.work_tag_id === "string" && log.work_tag_id.length > 0
          ? log.work_tag_id
          : null,
      location_id:
        typeof log.location_id === "string" && log.location_id.length > 0
          ? log.location_id
          : null,
    } as SessionLog;
  });
}

/**
 * 마지막 yearly_cleanup 실행 연도 read-only 헬퍼 (FR-7, AC-16).
 * 부재/타입 불일치 시 0 폴백 — 첫 실행 또는 reset_all 직후로 간주된다.
 */
export async function getLastCleanupYear(): Promise<number> {
  const raw = await get("last_cleanup_year");
  return typeof raw === "number" ? raw : 0;
}

/**
 * Economy read-only 헬퍼 (Phase 22 FR-21, FR-22, AC-18).
 *
 * 키 부재 / 비객체 / 필드 타입 불일치 시 모두 `{ sprouts: 0, lastTodoSproutDate: null }` 폴백.
 * `getTodos()` 폴백 패턴 정합. Rust `economy::state::read_economy_state`와 동일 정책.
 *
 * 단일 writer는 Rust `economy` 모듈 — TS는 read만 (P-D4).
 */
export async function getEconomy(): Promise<Economy> {
  const raw = await get("economy");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    // DEBUG (REMOVE-AFTER-TEST): 새싹 999 강제로 상점 장착 테스트.
    return { sprouts: 999, lastTodoSproutDate: null };
  }
  const e = raw as Record<string, unknown>;
  const sproutsRaw =
    typeof e.sprouts === "number" && e.sprouts >= 0 ? e.sprouts : 0;
  // DEBUG (REMOVE-AFTER-TEST): 잔액 999 floor 적용 — Rust read_economy_state와 정합.
  const sprouts = Math.max(sproutsRaw, 999);
  const lastTodoSproutDate =
    typeof e.lastTodoSproutDate === "string" && e.lastTodoSproutDate.length > 0
      ? e.lastTodoSproutDate
      : null;
  return { sprouts, lastTodoSproutDate };
}

/**
 * Inventory read-only 헬퍼 (Phase 22 FR-21, FR-22, AC-19).
 *
 * 키 부재 / 비객체 / 필드 타입 불일치 시 안전 기본값으로 폴백.
 * Phase 24 Shop write 경로 — Phase 22는 시드만.
 */
export async function getInventory(): Promise<Inventory> {
  const fallback: Inventory = {
    owned: [],
    equipped: { face: null, head: null, back: null },
  };
  const raw = await get("inventory");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const i = raw as Record<string, unknown>;
  const owned = Array.isArray(i.owned)
    ? (i.owned as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const eqRaw = i.equipped;
  const equipped =
    eqRaw && typeof eqRaw === "object" && !Array.isArray(eqRaw)
      ? (eqRaw as Record<string, unknown>)
      : {};
  const slot = (k: string): string | null =>
    typeof equipped[k] === "string" && (equipped[k] as string).length > 0
      ? (equipped[k] as string)
      : null;
  return {
    owned,
    equipped: {
      face: slot("face"),
      head: slot("head"),
      back: slot("back"),
    },
  };
}

/**
 * Mailbox read-only 헬퍼 (Phase 23 FR-10, AC-1).
 *
 * Rust IPC `get_mailbox`를 통해 편지 목록을 조회한다 (MAILBOX_MUTEX 보호).
 * IPC 실패 시 store 직독 폴백 — 비배열 / 항목 부적합 시 [] 폴백.
 */
export async function getMailbox(): Promise<Letter[]> {
  try {
    return await invoke<Letter[]>("get_mailbox");
  } catch {
    const raw = await get("mailbox").catch(() => [] as Mailbox);
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).flatMap((item): Letter[] => {
      if (!item || typeof item !== "object") return [];
      const l = item as Record<string, unknown>;
      if (typeof l.id !== "string" || !l.id) return [];
      if (!["SESSION", "MONTHLY", "SYSTEM"].includes(l.kind as string)) return [];
      if (typeof l.title !== "string") return [];
      if (typeof l.body !== "string") return [];
      if (typeof l.createdAt !== "string" || !l.createdAt) return [];
      return [
        {
          id: l.id,
          kind: l.kind as MailboxKind,
          title: l.title,
          body: l.body,
          createdAt: l.createdAt,
          read: typeof l.read === "boolean" ? l.read : false,
          sessionTag: typeof l.sessionTag === "string" ? l.sessionTag : null,
        },
      ];
    });
  }
}

/**
 * 월간 인사이트 마지막 발송 YYYY-MM read-only 헬퍼 (Phase 22 FR-21, FR-22, AC-19).
 *
 * 비문자열 / 빈 문자열은 null 폴백. Phase 26 write 경로.
 */
export async function getLastMonthlyLetter(): Promise<string | null> {
  const raw = await get("last_monthly_letter_year_month");
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * 출석 보상 IPC fire-and-forget invoke (Phase 22 FR-17, BR-6, DEC-22-3).
 *
 * `TodosTab.persist`가 `storeSetTodos(next)` 성공 후 length 비교 없이 무조건 호출한다.
 * Rust IPC가 단일 진위 판정자로 멱등 가드를 통과시킨다 (FR-18, AC-15/16).
 *
 * 호출자가 await 여부를 결정 — 일반적으로 fire-and-forget (UI 차단 금지).
 */
export async function recordTodoAdded(): Promise<void> {
  await invoke("record_todo_added");
}

/**
 * 사용자 데이터 전체 초기화. Rust `reset_all` 커맨드를 호출한다.
 *
 * Rust 측에서 atomic 강제 → store clear → 16키 default 시드 순으로 처리한다 (Phase 22 FR-6).
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
