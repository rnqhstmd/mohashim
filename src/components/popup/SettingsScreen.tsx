import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getBreakMinutes,
  getFocusMinutes,
  getTodos,
  getWorkTags,
  setTodos,
  setWorkTags,
  flush,
  resetAllData,
} from "../../lib/storage";
import type { WorkTag } from "../../lib/storage";
import {
  EMOJI_PALETTE,
  COLOR_PALETTE,
  removeTagRefs,
} from "../../lib/todos";
import { DurationsEditScreen } from "./DurationsEditScreen";
import { ResetConfirmModal } from "./ResetConfirmModal";
import { LocationEditorScreen } from "./LocationEditorScreen";

type SettingsScreenProps = {
  onResetDone: () => void;
};

// FR-C5 / D-2: View 타입에서 "work" 제거. 작업 태그 편집은 메인 인라인으로 통합.
type View = "main" | "loc" | "durations";

/**
 * Settings 탭 메인 (Phase 18 B2 — FR-C1~C6, FR-B9 / Phase 17 B2-E 후속).
 *
 * 단일 패널 sub-screen 라우팅:
 *   - main:      집중/휴식 카드 + 작업 태그 인라인 편집(FR-C1~C6) + 위치 태그 편집 + 로그 폴더 열기 + 초기화
 *   - durations: DurationsEditScreen (집중/휴식 분 편집)
 *   - loc:       LocationEditorScreen (위치 태그 편집)
 *
 * 작업 태그 편집 (Phase 18 FR-C1~C6 + BR-C1~C3):
 *   - ✎ 클릭 → editingId 갱신, 카드 인라인 펼침. 한 번에 하나만 (BR-C3).
 *   - 입력/이모지/색상 변경 → setWorkTags(save:false) + flush() 즉시 영속 (BR-C1).
 *   - × 클릭 (D-4) → 모달 없이 즉시 삭제 + removeTagRefs로 todos 정리 (FR-C3).
 *   - ＋ 클릭 → 신규 태그 추가 + setEditingId(newId) (FR-C6).
 *   - 작업 태그 1개 시 × 비활성화 (FR-C4).
 *
 * 메인 마운트 시 / sub-screen에서 복귀 시 focus_minutes / break_minutes / work_tags를
 * 다시 읽어 카드 표기를 갱신한다.
 */
export function SettingsScreen({ onResetDone }: SettingsScreenProps) {
  const [view, setView] = useState<View>("main");
  const [showReset, setShowReset] = useState(false);
  const [focusMin, setFocusMin] = useState<number | null>(null);
  const [breakMin, setBreakMin] = useState<number | null>(null);
  const [workTags, setWorkTagsState] = useState<WorkTag[]>([]);
  // BR-C3: editingId 단일 — 한 번에 하나의 카드만 펼침.
  const [editingId, setEditingId] = useState<string | null>(null);

  // PR #19 cross-review W1: 편집/삭제/추가 저장이 직렬화되지 않으면 빠른 연속 조작에서
  // 삭제가 되살아나거나 최신 편집이 덮일 수 있다. Promise 체인으로 영속 작업을 직렬 큐화.
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueuePersist = (op: () => Promise<void>) => {
    persistQueueRef.current = persistQueueRef.current
      .then(op)
      .catch((err) => console.error("[mohashim] work tag persist failed", err));
  };

  // 메인 진입/복귀 시 표기 값 로드.
  useEffect(() => {
    if (view !== "main") return;
    let cancelled = false;
    (async () => {
      try {
        const [f, b, w] = await Promise.all([
          getFocusMinutes(),
          getBreakMinutes(),
          getWorkTags(),
        ]);
        if (cancelled) return;
        setFocusMin(f);
        setBreakMin(b);
        setWorkTagsState(w);
      } catch (err) {
        console.error("[mohashim] settings main load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleConfirm = async () => {
    setShowReset(false);
    try {
      await resetAllData();
      onResetDone();
    } catch (err) {
      console.error("[mohashim] reset failed", err);
      // 실패 시 onResetDone 미호출 — 스토어 미초기화 상태로 onboarding 진입 방지.
    }
  };

  // FR-C2 / BR-C1: 인라인 편집 — 메모리 즉시 + 디스크 영속은 직렬 큐 (W1).
  const updateTag = (id: string, patch: Partial<WorkTag>) => {
    const next = workTags.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setWorkTagsState(next);
    enqueuePersist(async () => {
      await setWorkTags(next, { save: false });
      await flush();
    });
  };

  // FR-C3 / D-4: × 클릭 → 모달 없이 즉시 삭제 + 참조 todos는 removeTagRefs로 일괄 정리.
  // FR-C4: 작업 태그 1개 시 호출 자체가 차단되도록 disabled 처리하나 방어적으로 가드.
  const handleDelete = (id: string) => {
    if (workTags.length <= 1) return;
    const next = workTags.filter((t) => t.id !== id);
    setWorkTagsState(next);
    if (editingId === id) setEditingId(null);
    enqueuePersist(async () => {
      await setWorkTags(next, { save: false });
      const todos = await getTodos();
      const cleaned = removeTagRefs(todos, [id], "work");
      await setTodos(cleaned, { save: false });
      await flush();
    });
  };

  // FR-C6: 새 작업 태그 추가 → 즉시 편집 모드 진입.
  const handleAdd = () => {
    if (workTags.length >= 5) return;
    const newId = `wt${Date.now()}${Math.random().toString(36).slice(2)}`;
    const newTag: WorkTag = {
      id: newId,
      emoji: EMOJI_PALETTE[0],
      label: "새 작업",
      color: COLOR_PALETTE[0],
    };
    const next = [...workTags, newTag];
    setWorkTagsState(next);
    setEditingId(newId);
    enqueuePersist(async () => {
      await setWorkTags(next, { save: false });
      await flush();
    });
  };

  if (view === "loc") {
    return <LocationEditorScreen onClose={() => setView("main")} />;
  }
  if (view === "durations") {
    return <DurationsEditScreen onClose={() => setView("main")} />;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-2 p-4">
        <button
          type="button"
          onClick={() => setView("durations")}
          className="flex w-full items-center justify-between rounded-xl border border-deep/10 bg-white px-4 py-3 hover:bg-deep/5"
        >
          <span className="text-sm text-ink">
            ⏱ 집중 {focusMin ?? "—"} 분
          </span>
          <span className="text-sm text-deep/40">›</span>
        </button>
        <button
          type="button"
          onClick={() => setView("durations")}
          className="flex w-full items-center justify-between rounded-xl border border-deep/10 bg-white px-4 py-3 hover:bg-deep/5"
        >
          <span className="text-sm text-ink">
            ☕ 휴식 {breakMin ?? "—"} 분
          </span>
          <span className="text-sm text-deep/40">›</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-2">
        <h3 className="text-xs font-semibold text-deep/70">작업 태그</h3>
        {workTags.map((tag) => {
          const editing = editingId === tag.id;
          // TagListEditor.tsx:139~218 패턴 차용 — maxLength=10 + EMOJI 6열 grid + 색상 원형.
          return (
            <div
              key={tag.id}
              className="rounded-xl border border-deep/10 bg-white p-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-base"
                  style={{ background: tag.color }}
                >
                  {tag.emoji}
                </span>
                {editing ? (
                  <input
                    type="text"
                    maxLength={10}
                    value={tag.label}
                    onChange={(e) => {
                      void updateTag(tag.id, { label: e.target.value });
                    }}
                    className="flex-1 rounded border border-deep/30 px-2 py-1 text-sm"
                  />
                ) : (
                  <span className="flex-1 text-sm text-ink">{tag.label}</span>
                )}
                <button
                  type="button"
                  // BR-C3: 토글 — 펼친 상태에서 ✎ 다시 누르면 접힘.
                  onClick={() => setEditingId(editing ? null : tag.id)}
                  className="px-2 text-xs text-deep/60"
                  aria-label={editing ? "작업 태그 편집 완료" : "작업 태그 편집"}
                >
                  {editing ? "완료" : "✎"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDelete(tag.id);
                  }}
                  // FR-C4: 1개일 때 비활성.
                  disabled={workTags.length <= 1}
                  className="px-2 text-xs text-red-500 disabled:text-deep/20"
                  aria-label="작업 태그 삭제"
                >
                  ×
                </button>
              </div>
              {editing && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-6 gap-1">
                    {EMOJI_PALETTE.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          void updateTag(tag.id, { emoji });
                        }}
                        className={`flex h-7 w-7 items-center justify-center rounded ${
                          tag.emoji === emoji ? "bg-deep/15" : ""
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          void updateTag(tag.id, { color });
                        }}
                        style={{ background: color }}
                        className={`h-6 w-6 rounded-full ${
                          tag.color === color ? "ring-2 ring-deep" : ""
                        }`}
                        aria-label={`색상 ${color}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            void handleAdd();
          }}
          disabled={workTags.length >= 5}
          className="w-full rounded-xl border border-dashed border-deep/30 py-2 text-sm text-deep/60 disabled:opacity-40"
        >
          ＋ 새 작업 태그 추가
        </button>

        <button
          type="button"
          onClick={() => setView("loc")}
          className="mt-2 rounded-md border border-deep/15 bg-white px-3 py-2 text-left text-sm text-ink"
        >
          위치 태그 편집
        </button>

        {/* FR-B9 / D-3: 로그 폴더 열기 — Rust open_log_dir command 호출.
            opener:allow-open-path 권한으로 Finder/Explorer에서 디렉토리 노출. */}
        <button
          type="button"
          onClick={() => {
            void invoke("open_log_dir").catch((err) => {
              console.error("[mohashim] open_log_dir failed", err);
            });
          }}
          className="mt-2 rounded-md border border-deep/15 bg-white px-3 py-2 text-left text-sm text-ink"
        >
          로그 폴더 열기
        </button>
      </div>

      <div className="mt-auto p-4">
        <button
          type="button"
          onClick={() => setShowReset(true)}
          className="text-sm text-red-600 underline"
        >
          모든 데이터 초기화
        </button>
      </div>

      <ResetConfirmModal
        open={showReset}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setShowReset(false)}
      />
    </div>
  );
}
