import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Todo, WorkTag, Location } from "../../lib/storage";
import { ACCENT_DARK } from "../../lib/todos";
import { FlatTag } from "./FlatTag";

type TodoItemProps = {
  todo: Todo;
  workTag: WorkTag | null;
  location: Location | null;
  openSwipeId: string | null;
  onSwipeOpen: (id: string | null) => void;
  onToggleDone: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
};

type SwipeIntent = "undecided" | "horizontal" | "vertical";

/** active 항목 시각 강조 (AC-30): 그라디언트 + 좌측 4px ACCENT_DARK 막대 + 박스섀도 + 굵은 글자. */
const activeStyle: CSSProperties = {
  background: "linear-gradient(135deg, #fff8e0, #fff2c4)",
  borderLeft: `4px solid ${ACCENT_DARK}`,
  boxShadow: "0 4px 12px rgba(244, 209, 96, 0.35)",
  fontWeight: 800,
};

/**
 * 투두 행 — 좌측 스와이프 시 우측에 삭제 버튼 노출 (D-4, AC-delete-swipe).
 *
 * 스와이프 의도 분기 (C1):
 *   - 5px 임계 미만: undecided 유지 (클릭 호환).
 *   - dx-dy 비교로 horizontal/vertical 결정.
 *   - vertical 시 부모 스크롤에 양보 (return).
 *   - horizontal 시 setPointerCapture로 click 차단 + offset 갱신.
 *
 * 다른 행 스와이프 시 자동 닫힘 — `openSwipeId !== todo.id`이면 effect로 offset=0 복귀.
 */
export function TodoItem({
  todo,
  workTag,
  location,
  openSwipeId,
  onSwipeOpen,
  onToggleDone,
  onToggleActive,
  onDelete,
}: TodoItemProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const initialOffset = useRef(0);
  const intent = useRef<SwipeIntent>("undecided");
  const [offset, setOffset] = useState(0);

  // 다른 행이 열리면 본 행은 닫힘.
  useEffect(() => {
    if (openSwipeId !== todo.id) {
      setOffset(0);
    }
  }, [openSwipeId, todo.id]);

  const handlePointerDown = (e: ReactPointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    initialOffset.current = offset; // 점프 방지 — 이미 -80인 상태에서 재스와이프 시 dx 0부터 더해짐.
    intent.current = "undecided";
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (intent.current === "undecided") {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < 5 && ay < 5) return;
      if (ax > ay + 5) {
        intent.current = "horizontal";
        try {
          // 핸들러가 부착된 컨테이너(currentTarget)에 capture — 내부 span/button으로 target이 바뀌어도 안정.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // setPointerCapture 실패는 무시
        }
      } else if (ay > ax) {
        intent.current = "vertical";
        return;
      } else {
        return;
      }
    }

    if (intent.current === "horizontal") {
      setOffset(Math.min(0, Math.max(-80, initialOffset.current + dx)));
    }
  };

  const handlePointerUp = () => {
    if (intent.current === "horizontal") {
      if (offset < -40) {
        setOffset(-80);
        onSwipeOpen(todo.id);
      } else {
        setOffset(0);
        if (openSwipeId === todo.id) onSwipeOpen(null);
      }
    }
    intent.current = "undecided";
  };

  const textClass = todo.done
    ? "line-through text-deep/40 flex-1 truncate"
    : "flex-1 truncate text-ink";

  const showActive = todo.active && !todo.done;

  return (
    <div className="relative overflow-hidden">
      {/* 배경 — 좌측 스와이프로 노출되는 삭제 버튼 (우측 정렬) */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
        <button
          type="button"
          onClick={() => onDelete(todo.id)}
          disabled={offset > -10}
          className="rounded bg-red-500 px-3 py-1 text-xs text-white disabled:opacity-0"
        >
          삭제
        </button>
      </div>

      {/* 전경 — 행 콘텐츠 */}
      <div
        className="relative flex items-center gap-2 bg-white px-3 py-2 transition-transform duration-150 ease-out"
        style={{
          transform: `translateX(${offset}px)`,
          ...(showActive ? activeStyle : {}),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <button
          type="button"
          onClick={() => onToggleDone(todo.id)}
          aria-label={todo.done ? "완료 해제" : "완료"}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
            todo.done
              ? "border-deep bg-deep text-white"
              : "border-deep/40 bg-white"
          }`}
        >
          {todo.done && <span className="text-[10px]">✓</span>}
        </button>

        <span className={textClass}>{todo.text}</span>

        {workTag && <FlatTag tag={workTag} />}
        {location && <FlatTag tag={location} />}

        {!todo.done && (
          <button
            type="button"
            onClick={() => onToggleActive(todo.id)}
            aria-label={todo.active ? "현재 작업 해제" : "현재 작업으로 설정"}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm ${
              todo.active ? "text-amber-600" : "text-deep/50"
            }`}
          >
            {todo.active ? "★" : "▶"}
          </button>
        )}
      </div>
    </div>
  );
}
