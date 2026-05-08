import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Phase } from "../../lib/score";
import type { PotatoState } from "../../lib/phrases";
import type { Todo, WorkTag, Location, Inventory } from "../../lib/storage";
import {
  getTodos as storeGetTodos,
  setTodos as storeSetTodos,
  getWorkTags,
  getLocations,
  recordTodoAdded,
} from "../../lib/storage";
import {
  sortTodos,
  createTodo,
  toggleDone,
  setActive,
  deleteTodo,
  editTodoText,
} from "../../lib/todos";
import { formatDate } from "../../lib/grass";
import { TodoInput } from "./TodoInput";
import { TodoItem } from "./TodoItem";
import { PomodoroCard } from "./PomodoroCard";
import { FocusStartButton } from "./FocusStartButton";
import { TimerDetailScreen } from "./TimerDetailScreen";

type TodosTabProps = {
  phase: Phase;
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
  /** Phase 21: 캐릭터 카드 아래 NoiseMeter dB 표시. */
  db: number;
  /** 사용자 피드백: 세션 진행 중 PomodoroCard에 실시간 점수 큰 폰트 노출용 (0~100). */
  total: number;
  /** Phase 25 FR-1: 캐릭터 레이어 장착 상태. PomodoroCard/FocusStartButton에 전달. */
  equipped: Inventory["equipped"];
  onFocusStart: () => Promise<void>;
};

/**
 * Todos 탭 본체 — 옵션 A 통합 레이아웃 (M1).
 *
 * 항상 렌더되며 phase에 따라 상단 영역만 분기:
 *   - idle: <FocusStartButton />
 *   - focus|break|complete: <PomodoroCard />
 *
 * todos 본체는 항상 동일 — TodoInput + 정렬된 TodoItem 목록.
 *
 * 외부 클릭 시 열려있는 스와이프 자동 닫힘 — 컨테이너 onClick으로 openSwipeId=null.
 *
 * persist 헬퍼: 메모리 state 갱신 + 디스크 setTodos. 디스크 실패는 console.error로만 흘려보낸다.
 */
export function TodosTab({
  phase,
  timeLeft,
  potatoState,
  phrase,
  db,
  total,
  equipped,
  onFocusStart,
}: TodosTabProps) {
  const [todos, setTodosState] = useState<Todo[]>([]);
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  // 로드 완료 전에는 빈 상태 ("아직 할 일이 없어요") flicker 방지를 위해 본문 미렌더.
  const [loaded, setLoaded] = useState(false);
  // Phase 17 B2-F (FR-F4): list / timer-detail view 토글. PomodoroCard 클릭 시
  // timer-detail 진입, ← 클릭 또는 phase가 focus/break를 벗어나면 list 복귀.
  const [view, setView] = useState<"list" | "timer-detail">("list");

  // FR-D1 (Phase 18): phase=idle/complete 진입 시 timer-detail에서 list 자동 복귀.
  // 이유: TimerDetailScreen은 mm:ss 카운트다운이 의미 있는 focus/break 동안만 노출.
  // phase 종료 시 빈 카운터(00:00 정지) 표시를 방지하고 사용자가 자연스러운 list 흐름으로
  // 복귀하도록 한다. phase=focus/break 유지 시에는 view 전환 없음 (FR-D3).
  // 매핑: AC-D2 (phase=idle → view=list), AC-D3 (phase=complete → view=list).
  useEffect(() => {
    if (phase !== "focus" && phase !== "break") setView("list");
  }, [phase]);

  // 초기 로드 — cancelled flag 패턴으로 unmount 후 setState 방지.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, w, l] = await Promise.all([
          storeGetTodos(),
          getWorkTags(),
          getLocations(),
        ]);
        if (cancelled) return;
        setTodosState(t);
        setWorkTags(w);
        setLocations(l);
      } catch (err) {
        console.error("[mohashim] todos load failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => sortTodos(todos), [todos]);

  const workMap = useMemo(
    () => new Map(workTags.map((t) => [t.id, t])),
    [workTags]
  );
  const locMap = useMemo(
    () => new Map(locations.map((t) => [t.id, t])),
    [locations]
  );

  // 직렬화된 디스크 write 큐 — 빠른 연속 클릭으로 in-flight persist가 race되어
  // 저장 순서가 뒤바뀌거나 stale rollback이 최신 상태를 덮어쓰는 것을 방지.
  // 메모리 state는 즉시 반영(낙관적 업데이트), 디스크 write만 직렬화한다.
  // 실패 시 다음 persist가 그대로 진행하여 결과적 일관성 확보 (마지막 호출이 최종 상태).
  //
  // Phase 22 (FR-17, BR-6, DEC-22-3, MUST-1 해소): storeSetTodos 성공 후 length 비교 없이
  // 무조건 `recordTodoAdded()` fire-and-forget. Rust IPC가 단일 진위 판정자로 멱등 가드를
  // 통과시켜 `lastTodoSproutDate != today_local`인 경우만 1🌱 지급 (FR-18). 삭제/완료/편집에서도
  // 호출되지만 mutex+읽기 후 즉시 no-op (AC-15/16). 실패는 console.error swallow.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persist = (next: Todo[]) => {
    setTodosState(next);
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      try {
        await storeSetTodos(next);
        // Phase 22 FR-17: persist 성공 후 출석 보상 IPC 호출. 실패는 swallow.
        recordTodoAdded().catch((err) => {
          console.error("[mohashim] recordTodoAdded failed", err);
        });
      } catch (err) {
        console.error("[mohashim] todos persist failed", err);
      }
    });
  };

  /**
   * Phase 12 FR-4: todo 완료/롤백 시 sessions[date].todos_completed 갱신을 위해
   * Rust 커맨드 invoke. 날짜는 **`completedAt`(완료 시) 또는 직전 `completedAt`(롤백 시)
   * 기준 로컬 'YYYY-MM-DD'**. PRD FR-4 정합 — 자정 경계(23:59:59 → 00:00:00)에서
   * `toggleDone` 내부의 completedAt 생성 시각과 호출자의 `new Date()`가 다른 날짜로
   * 평가되어 record/undo 날짜가 불일치하는 race를 차단한다.
   *
   * - 완료 전환(false→true): toggleDone 결과에서 해당 todo의 새 `completedAt`을
   *   로컬 날짜로 변환 후 record_todo_completion.
   * - 롤백(true→false): toggle 직전 todo의 `completedAt`을 로컬 날짜로 변환 후
   *   undo_todo_completion. completedAt이 null/손상이면 invoke 생략 (이전 적재 없음 가정).
   *
   * invoke 실패는 console.error로만 기록하고 swallow — UI 동작 차단 금지 (BR-4, AC-13).
   * 잔디 갱신 누락은 다음 탭 재진입 시 복구.
   */
  const handleToggleDone = (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (!target) {
      // 정상 흐름에서 발생하지 않음. 방어적으로 toggleDone만 수행.
      persist(toggleDone(todos, id));
      return;
    }
    const wasCompleted = target.done === true;
    const previousCompletedAt = target.completedAt;
    const updated = toggleDone(todos, id);
    persist(updated);

    if (!wasCompleted) {
      // false → true 전환. toggleDone이 채운 새 completedAt을 그대로 로컬 날짜로 사용
      // (FR-4: completedAt 기준). 자정 경계에서 호출자가 별도 new Date()를 만들지 않아
      // 두 시각이 다른 날로 평가되는 race 차단.
      const next = updated.find((t) => t.id === id);
      const completedAt = next?.completedAt ?? null;
      const dateStr = completedAt
        ? formatDate(new Date(completedAt))
        : formatDate(new Date()); // 방어적 폴백: toggleDone이 completedAt을 채우지 못한 비정상 경로.
      // Phase 13 (MA-1): todoId required. Rust가 SESSION_TODOS_DONE buffer에 적재하기 위해 필수.
      void invoke("record_todo_completion", { date: dateStr, todoId: id }).catch((err) => {
        console.error("[mohashim] record_todo_completion failed", err);
      });
    } else if (previousCompletedAt) {
      // true → false 롤백. 직전 completedAt 기준 로컬 날짜로 -1.
      const parsed = new Date(previousCompletedAt);
      if (!Number.isNaN(parsed.getTime())) {
        const dateStr = formatDate(parsed);
        // Phase 13 (MA-1): todoId required. Rust가 buffer에서 해당 ID를 제거하기 위해 필수.
        void invoke("undo_todo_completion", { date: dateStr, todoId: id }).catch((err) => {
          console.error("[mohashim] undo_todo_completion failed", err);
        });
      }
      // parsed invalid: completedAt 손상. invoke 생략.
    }
    // wasCompleted && !previousCompletedAt: 이전 적재 없음 가정 — invoke 생략.
  };

  if (
    view === "timer-detail" &&
    (phase === "focus" || phase === "break")
  ) {
    return (
      <TimerDetailScreen
        phase={phase}
        timeLeft={timeLeft}
        potatoState={potatoState}
        phrase={phrase}
        onBack={() => setView("list")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {phase === "focus" || phase === "break" || phase === "complete" ? (
        <PomodoroCard
          phase={phase}
          timeLeft={timeLeft}
          potatoState={potatoState}
          phrase={phrase}
          db={db}
          total={total}
          equipped={equipped}
          onTimerClick={() => setView("timer-detail")}
        />
      ) : (
        <FocusStartButton
          potatoState={potatoState}
          phrase={phrase}
          db={db}
          equipped={equipped}
          onStart={onFocusStart}
        />
      )}

      {/* Phase 21 사용자 피드백: 할 일 목록이 잘리거나 스크롤되지 않는 회귀 — flex
          컨테이너의 `min-height: auto`(기본) 때문에 자식 overflow-y-auto가 부모 높이
          이상으로 늘어나며 스크롤 트리거가 발생하지 않음. 부모에 min-h-0, 자식에도
          min-h-0를 명시하고 TodoInput을 shrink-0으로 고정해 잔여 공간만 스크롤 영역에
          할당. gap-2 → space-y-2 + p-1로 카드 그림자 잘림도 방지. */}
      <div className="flex flex-1 flex-col overflow-hidden min-h-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1 space-y-2">
          {!loaded ? null : sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-deep/40">
              아직 할 일이 없어요
            </div>
          ) : (
            sorted.map((t) => (
              <TodoItem
                key={t.id}
                todo={t}
                workTag={t.tag ? workMap.get(t.tag) ?? null : null}
                location={t.loc ? locMap.get(t.loc) ?? null : null}
                onToggleDone={handleToggleDone}
                onToggleActive={(id) => persist(setActive(todos, id))}
                onDelete={(id) => persist(deleteTodo(todos, id))}
                onEditText={(id, text) => persist(editTodoText(todos, id, text))}
              />
            ))
          )}
        </div>
        <div className="shrink-0">
          <TodoInput
            workTags={workTags}
            locations={locations}
            onSubmit={(text, tag, loc) =>
              persist([...todos, createTodo(text, tag, loc)])
            }
          />
        </div>
      </div>
    </div>
  );
}
