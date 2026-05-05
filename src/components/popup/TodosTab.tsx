import { useEffect, useMemo, useState } from "react";
import type { Phase } from "../../lib/score";
import type { PotatoState } from "../../lib/phrases";
import type { Todo, WorkTag, Location } from "../../lib/storage";
import {
  getTodos as storeGetTodos,
  setTodos as storeSetTodos,
  getWorkTags,
  getLocations,
} from "../../lib/storage";
import {
  sortTodos,
  createTodo,
  toggleDone,
  setActive,
  deleteTodo,
} from "../../lib/todos";
import { TodoInput } from "./TodoInput";
import { TodoItem } from "./TodoItem";
import { PomodoroCard } from "./PomodoroCard";
import { FocusStartButton } from "./FocusStartButton";

type TodosTabProps = {
  phase: Phase;
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
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
  onFocusStart,
}: TodosTabProps) {
  const [todos, setTodosState] = useState<Todo[]>([]);
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

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

  const persist = async (next: Todo[]) => {
    const prev = todos;
    setTodosState(next);
    try {
      await storeSetTodos(next);
    } catch (err) {
      console.error("[mohashim] todos persist failed, rolling back", err);
      setTodosState(prev);
    }
  };

  const isRunning =
    phase === "focus" || phase === "break" || phase === "complete";

  return (
    <div
      className="flex h-full flex-col"
      onClick={() => setOpenSwipeId(null)}
    >
      {isRunning ? (
        <PomodoroCard
          phase={phase}
          timeLeft={timeLeft}
          potatoState={potatoState}
          phrase={phrase}
        />
      ) : (
        <FocusStartButton
          potatoState={potatoState}
          phrase={phrase}
          onStart={onFocusStart}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
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
                openSwipeId={openSwipeId}
                onSwipeOpen={setOpenSwipeId}
                onToggleDone={(id) => {
                  void persist(toggleDone(todos, id));
                }}
                onToggleActive={(id) => {
                  void persist(setActive(todos, id));
                }}
                onDelete={(id) => {
                  void persist(deleteTodo(todos, id));
                }}
              />
            ))
          )}
        </div>
        <TodoInput
          workTags={workTags}
          locations={locations}
          onSubmit={(text, tag, loc) => {
            void persist([...todos, createTodo(text, tag, loc)]);
          }}
        />
      </div>
    </div>
  );
}
