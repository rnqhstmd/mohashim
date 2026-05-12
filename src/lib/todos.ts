/**
 * Todo 도메인 — 정렬/CRUD 순수 함수 + 시드 + 상수.
 *
 * - 정렬 BR-1: 미완료(active 우선) → 완료. 안정 정렬로 입력 순서(배열 인덱스) 보존.
 * - 롤백 결정성 (M3, D-5): 완료 → 미완료 토글 시 항목을 배열 맨 앞으로 이동 후
 *   안정 정렬로 active 다음 위치에 자연 배치.
 * - 시드 D-1: 첫 실행에서 `work_tags` / `locations` 빈 배열일 때만 기본 태그 주입.
 *   실패는 console.error로만 흘려보내고 빈 배열 상태로 진행 (fail-safe).
 */
import type { Todo, WorkTag, Location } from "./storage";
import {
  getWorkTags,
  setWorkTags,
  getLocations,
  setLocations,
  getTodos,
  setTodos,
} from "./storage";
import { formatDate } from "./grass";

// ---------- 색상 / 액센트 ----------

/** sun 토큰과 동일 hex. active 항목 시각 강조에 사용. */
export const ACCENT = "#f4d160";
/** active 항목 좌측 4px 막대 색상. Tailwind 토큰 미추가 (C3). */
export const ACCENT_DARK = "#c9a832";

// ---------- 팔레트 ----------

/** 태그 편집 시 선택 가능한 이모지 18종 (architecture.md 명세). */
export const EMOJI_PALETTE: readonly string[] = [
  "💻", "📚", "✏️", "📖", "✍️", "📋",
  "🎨", "🧠", "🏃", "🍳", "🎵", "🏠",
  "☕", "🏢", "📍", "🌳", "🎯", "💡",
];

/** 태그 편집 시 선택 가능한 색상 10종. */
export const COLOR_PALETTE: readonly string[] = [
  "#7aa3e6", "#9d7ad9", "#f4a261", "#5fa97a", "#d68a6a",
  "#a8b3cc", "#7dc89a", "#5a8dd8", "#c46455", "#f4d160",
];

// ---------- 기본 태그 ----------

/**
 * 기본 작업 태그 3종 (공부 → 개발 → 디자인). 안정 prefix(`wt-default-*`)로 시드 멱등성 유지.
 */
export const DEFAULT_WORK_TAGS: readonly WorkTag[] = [
  { id: "wt-default-study",  emoji: "📚", label: "공부",   color: COLOR_PALETTE[1] },
  { id: "wt-default-dev",    emoji: "💻", label: "개발",   color: COLOR_PALETTE[0] },
  { id: "wt-default-design", emoji: "🎨", label: "디자인", color: COLOR_PALETTE[6] },
];

/**
 * 기본 위치 태그 3종 (집/카페/도서관).
 */
export const DEFAULT_LOCATIONS: readonly Location[] = [
  { id: "loc-default-home",    emoji: "🏠", label: "집",     color: COLOR_PALETTE[7] },
  { id: "loc-default-cafe",    emoji: "☕", label: "카페",   color: COLOR_PALETTE[4] },
  { id: "loc-default-library", emoji: "📚", label: "도서관", color: COLOR_PALETTE[9] },
];

// ---------- 정렬 ----------

/**
 * BR-1: 완료 후순위 → active 우선 → 입력 순서 유지.
 * V8/JSC의 Array.prototype.sort는 안정 정렬이므로 동일 우선순위 내 입력 순서 보존.
 */
export function sortTodos(todos: readonly Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    return 0;
  });
}

// ---------- CRUD ----------

/** 신규 todo 생성. id는 timestamp + random suffix. */
export function createTodo(text: string, tag: string | null, loc: string | null): Todo {
  return {
    id: `t${Date.now()}${Math.random().toString(36).slice(2)}`,
    text,
    done: false,
    tag,
    loc,
    active: false,
    completedAt: null,
  };
}

/**
 * 완료 토글. 완료 → 미완료 롤백 시 항목을 배열 맨 앞으로 이동시켜
 * 안정 정렬에 의해 active 다음 위치에 자연 배치되도록 한다 (M3, D-5).
 * BR-2: 완료 처리 시 active 강제 false.
 */
export function toggleDone(todos: readonly Todo[], id: string): Todo[] {
  const target = todos.find((t) => t.id === id);
  if (!target) return [...todos];
  const wasCompleted = target.done === true;

  const updated = todos.map((t) =>
    t.id === id
      ? {
          ...t,
          done: !t.done,
          active: t.done ? t.active : false,
          // FR-1, AC-1/2: 미완료(false)→완료 전환 시 ISO 8601 UTC `Z` 기록.
          // 완료(true)→미완료 롤백 시 null. (DEC-10-4: timezone 무관 — yearly_cleanup은 done 비교만)
          completedAt: t.done ? null : new Date().toISOString(),
        }
      // ↑ t.done은 토글 전 값. 미완료(false)→완료 전환 시 active=false 강제 (BR-2).
      //   완료(true)→미완료 롤백 시 active 보존(이미 false였을 것이므로 무해).
      : t
  );

  if (wasCompleted) {
    // 롤백 (D-5): 항목을 배열 맨 앞으로 이동 후 안정 정렬로 active 다음 위치 자연 배치.
    // active=false 명시 고정 — 외부 store 직접 편집으로 done=true && active=true 데이터가
    // 유입된 경우에도 BR-2 정책 일관성 보장.
    const rolled = { ...updated.find((t) => t.id === id)!, active: false };
    const rest = updated.filter((t) => t.id !== id);
    return sortTodos([rolled, ...rest]);
  }
  return sortTodos(updated);
}

/**
 * active 토글. BR-2: 완료 항목은 active 불가. BR-3: 한 번에 1개만.
 * 이미 active인 항목 재토글 시 해제.
 */
export function setActive(todos: readonly Todo[], id: string): Todo[] {
  const target = todos.find((t) => t.id === id);
  if (!target || target.done) return [...todos];
  const isAlreadyActive = target.active;
  const updated = todos.map((t) => ({
    ...t,
    active: t.id === id ? !isAlreadyActive : false,
  }));
  return sortTodos(updated);
}

/** 단일 todo 삭제. */
export function deleteTodo(todos: readonly Todo[], id: string): Todo[] {
  return todos.filter((t) => t.id !== id);
}

/**
 * Phase 21: 할 일 인라인 편집 — text 갱신. 기존 정렬 가중치(active/done/createdAt)에는
 * 영향이 없으므로 list 순서 유지. 빈 문자열은 호출자에서 사전 차단되지만 방어적으로
 * 미반영 경로를 둔다.
 */
export function editTodoText(
  todos: readonly Todo[],
  id: string,
  text: string,
): Todo[] {
  const trimmed = text.trim();
  if (trimmed === "") return [...todos];
  return todos.map((t) => (t.id === id ? { ...t, text: trimmed } : t));
}

/**
 * 태그 삭제 시 todos 참조 정리 (BR-5). 일괄 처리 (U-4).
 * 삭제된 태그 ID 배열을 받아 해당 필드를 null로 비운다.
 */
export function removeTagRefs(
  todos: readonly Todo[],
  tagIds: readonly string[],
  kind: "work" | "loc"
): Todo[] {
  if (tagIds.length === 0) return [...todos];
  const set = new Set(tagIds);
  if (kind === "work") {
    return todos.map((t) =>
      t.tag !== null && set.has(t.tag) ? { ...t, tag: null } : t
    );
  }
  return todos.map((t) =>
    t.loc !== null && set.has(t.loc) ? { ...t, loc: null } : t
  );
}

// ---------- 시드 ----------

/**
 * 첫 실행 시 work_tags/locations가 빈 배열이면 기본 태그를 시드한다 (D-1, AC-23~25).
 * 시드 실패 시 console.error만 남기고 빈 배열 상태로 진행한다 (fail-safe).
 */
export async function seedDefaultTags(): Promise<void> {
  try {
    const [wt, lc] = await Promise.all([getWorkTags(), getLocations()]);
    if (wt.length === 0) await setWorkTags([...DEFAULT_WORK_TAGS]);
    if (lc.length === 0) await setLocations([...DEFAULT_LOCATIONS]);
  } catch (err) {
    console.error("[mohashim] seedDefaultTags failed", err);
  }
}

/**
 * 부팅 시점 일별 청소 — 어제 이전에 완료된 todo는 삭제, 미완료는 모두 보존.
 *
 * 정책 (사용자 요청):
 *   - 미완료(`done=false`) → 항상 유지 (재시도/이월 자연스러움).
 *   - 완료(`done=true`) + completedAt이 오늘 → 유지 (오늘 성취 가시화).
 *   - 완료 + completedAt이 어제 이전 → 삭제 (잔디에 이미 기록됨).
 *   - 완료 + completedAt 부재/손상 → 삭제 (정합성 회복).
 *
 * 실패는 console.error swallow — 부팅 흐름 비차단.
 */
export async function cleanupCompletedTodos(): Promise<void> {
  try {
    const todos = await getTodos();
    const today = formatDate(new Date());
    const filtered = todos.filter((t) => {
      if (!t.done) return true;
      if (!t.completedAt) return false;
      const parsed = new Date(t.completedAt);
      if (Number.isNaN(parsed.getTime())) return false;
      return formatDate(parsed) === today;
    });
    if (filtered.length !== todos.length) {
      await setTodos(filtered);
    }
  } catch (err) {
    console.error("[mohashim] cleanupCompletedTodos failed", err);
  }
}
