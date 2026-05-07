import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Todo, WorkTag, Location } from "../../lib/storage";
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

/**
 * 투두 카드 (Phase 17 FR-A1~A8) — 행 단위 → 카드 단위 변경.
 *
 * 외곽 카드는 고정. 내부 컨텐츠가 translateX로 좌측 슬라이드되며 우측에 삭제 버튼이 노출된다 (BR-7).
 * active 시 좌측 4px deep 막대 + cream 배경. 인라인 그라디언트 하드코딩 폐기 — Tailwind 토큰만 사용.
 *
 * 스와이프 의도 분기 (C1):
 *   - 5px 임계 미만: undecided 유지 (클릭 호환).
 *   - dx-dy 비교로 horizontal/vertical 결정.
 *   - vertical 시 부모 스크롤에 양보 (return).
 *   - horizontal 시 setPointerCapture로 click 차단 + offset 갱신.
 *
 * 다른 카드 스와이프 시 자동 닫힘 — `openSwipeId !== todo.id`이면 effect로 offset=0 복귀.
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

  // 다른 카드가 열리면 본 카드는 닫힘.
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

  const showActive = todo.active && !todo.done;

  // 외곽 카드 클래스 — Phase 20 design.html 정렬: ink/15 stroke + paperWarm bg + 미세
  // offset shadow. active는 좌측 4px deep로 시각 강조 + cream bg 유지.
  const cardClass = [
    "rounded-xl border border-ink/15 relative overflow-hidden shadow-[1px_1px_0_0_rgba(40,37,32,0.06)]",
    showActive ? "border-l-4 border-l-ink bg-cream" : "bg-paperWarm",
    todo.done ? "opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // label 클래스 — 완료 시 line-through + opacity-40, font-kyobo 적용 (BR-3).
  const labelClass = todo.done
    ? "font-kyobo flex-1 truncate line-through opacity-40"
    : "font-kyobo flex-1 truncate text-ink";

  return (
    <div className={cardClass}>
      {/* 우측 상단 × 삭제 버튼 (FR-A5) */}
      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        aria-label="삭제 (×)"
        className="absolute right-2 top-2 z-10 text-ink/35 hover:text-red-500"
      >
        ×
      </button>

      {/* 우측 슬라이드 노출 삭제 버튼 (BR-7) — 외곽 카드 내부 absolute 배경 */}
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

      {/* 내부 컨텐츠 — translateX 적용 대상 */}
      <div
        className="relative bg-inherit px-3 py-2 transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* 상단 행: 원형 체크박스 + label + ★/▶ */}
        <div className="flex items-center gap-2 pr-6">
          <button
            type="button"
            onClick={() => onToggleDone(todo.id)}
            aria-label={todo.done ? "완료 해제" : "완료"}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
              todo.done
                ? "border-ink bg-ink text-paperWarm"
                : "border-ink/35 bg-paperWarm"
            }`}
          >
            {todo.done && <span className="text-[10px]">✓</span>}
          </button>

          <span className={labelClass}>{todo.text}</span>

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

        {/* 하단 행: 태그 칩 (들여쓰기 pl-7로 체크박스 우측 정렬) */}
        {(workTag || location) && (
          <div className="mt-1 flex items-center gap-2 pl-7">
            {workTag && <FlatTag tag={workTag} />}
            {location && <FlatTag tag={location} />}
          </div>
        )}
      </div>
    </div>
  );
}
