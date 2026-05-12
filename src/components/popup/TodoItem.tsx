import { useEffect, useRef, useState } from "react";
import type { Todo, WorkTag, Location } from "../../lib/storage";
import { FlatTag } from "./FlatTag";

type TodoItemProps = {
  todo: Todo;
  workTag: WorkTag | null;
  location: Location | null;
  onToggleDone: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onEditText: (id: string, text: string) => void;
};

/**
 * 투두 카드 (Phase 21 재구조 — 사용자 피드백 반영).
 *
 * 변경:
 *   - swipe-to-delete 제거 (translateX + 노출 삭제 버튼 애니메이션 제거).
 *   - 우측 상단 ⋮ 메뉴 버튼 단일 — 클릭 시 [고정/고정 해제 · 삭제] popover.
 *   - 텍스트 클릭 → 인라인 편집 input. Enter 저장 / ESC 취소 / blur 저장.
 *   - 완료된 todo는 텍스트 클릭 시 편집 진입하지 않음 (toggle만).
 *
 * active 시각: 좌측 4px deep 막대 + cream 배경.
 */
export function TodoItem({
  todo,
  workTag,
  location,
  onToggleDone,
  onToggleActive,
  onDelete,
  onEditText,
}: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 편집 진입 시 textarea autofocus + 자동 높이 조정.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // editing 진입/draft 변경 시 textarea 높이를 콘텐츠에 맞게 조정.
  // 다중 라인으로 wrapping된 긴 todo를 편집할 때 한 줄로 collapse되지 않도록 한다.
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  // 메뉴 외부 클릭 닫기.
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const startEdit = () => {
    if (todo.done) return;
    setDraft(todo.text);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== todo.text) {
      onEditText(todo.id, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(todo.text);
    setEditing(false);
  };

  const showActive = todo.active && !todo.done;

  // Phase 21 사용자 피드백: 좌측 4px 검정 막대(border-l-4 border-l-ink) 제거 —
  // 강조 색상을 살짝 붉은 톤(rose-50/rose-200)으로만 적용하고, 고정 표시는
  // 행 우측 끝의 별도 핀 아이콘으로 노출 (메뉴 버튼 좌측).
  const cardClass = [
    "rounded-xl relative shadow-[1px_1px_0_0_rgba(40,37,32,0.06)]",
    showActive
      ? "border border-rose-300/70 bg-rose-50/70"
      : "border border-ink/15 bg-paperWarm",
    todo.done ? "opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 사용자 피드백: 긴 텍스트가 한 줄 잘림(...)이 아닌 다중 라인으로 자연스럽게
  // 줄바꿈되도록 처리. 글자수는 maxLength={100}으로 이미 입력 단계에서 제한됨.
  // 텍스트 클릭 편집 제거 — ⋮ 메뉴의 "수정" 버튼으로만 진입 (오타 클릭 방지).
  const labelBaseClass = todo.done
    ? "flex-1 whitespace-normal break-words line-through opacity-40"
    : "flex-1 whitespace-normal break-words text-ink";

  return (
    <div className={cardClass}>
      <div className="px-3 py-2">
        {/* 다중 라인 텍스트 시 체크박스/액션 버튼이 첫 줄과 정렬되도록 items-start. */}
        <div className="flex items-start gap-2 pr-1">
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

          {editing ? (
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              maxLength={100}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitEdit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              className="flex-1 resize-none overflow-hidden rounded-md border border-ink/30 bg-paperWarm px-1.5 py-0.5 text-sm leading-snug text-ink outline-none focus:border-ink/60"
            />
          ) : (
            <span className={labelBaseClass}>{todo.text}</span>
          )}

          {/* Phase 21 사용자 피드백: 고정 항목은 우측 끝 핀 아이콘으로 표시. */}
          {showActive && (
            <span
              aria-label="고정됨"
              title="고정됨"
              className="shrink-0 text-rose-500"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16 4l-1 1 .5 1L13 9 9 8 7 10l3.5 3.5L7 17v3l3.5-3.5L14 20l2-2-1-4 2.5-2.5 1 .5 1-1-3.5-3.5z" />
              </svg>
            </span>
          )}

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="할 일 메뉴 열기"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded text-ink/50 hover:bg-ink/5 hover:text-ink/80"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-7 z-20 min-w-[120px] overflow-hidden rounded-lg border-[1.5px] border-ink bg-paperWarm shadow-[2px_2px_0_0_#2b2520]"
              >
                {!todo.done && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onToggleActive(todo.id);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-bold text-ink hover:bg-ink/5"
                    >
                      <span aria-hidden>📌</span>
                      {todo.active ? "고정 해제" : "고정"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        startEdit();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 border-t border-ink/10 px-3 py-1.5 text-left text-xs font-bold text-ink hover:bg-ink/5"
                    >
                      <span aria-hidden>✏️</span>
                      수정
                    </button>
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDelete(todo.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-ink/10 px-3 py-1.5 text-left text-xs font-bold text-red-600 hover:bg-red-500/10"
                >
                  <span aria-hidden>🗑</span>
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>

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
