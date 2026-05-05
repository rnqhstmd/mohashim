import { useMemo, useState } from "react";
import type { WorkTag, Location } from "../../lib/storage";
import { EMOJI_PALETTE, COLOR_PALETTE } from "../../lib/todos";
import { DiscardChangesModal } from "./DiscardChangesModal";

type AnyTag = WorkTag | Location;

type TagListEditorProps<T extends AnyTag> = {
  title: string;
  items: readonly T[];
  kind: "work" | "loc";
  maxItems?: number;
  onSave: (next: T[], deletedIds: string[]) => Promise<void>;
  onClose: () => void;
};

/**
 * 작업/위치 태그 공통 편집기 (설계 §9, U-4 일괄 저장, C2 자체 dirty 처리).
 *
 * - draft 상태에 변경을 누적, 저장 시 `onSave(draft, deletedIds)` 한 번에 처리.
 * - dirty 판정: JSON.stringify 비교 + deletedIds.length. 변경 후 원복도 정확히 감지 (N≤10에서 무해).
 * - 뒤로가기: dirty면 DiscardChangesModal 1회만 표시 → 확인 시 onClose, 취소 시 모달만 닫힘.
 * - maxItems: 작업=5 / 위치=undefined(무제한). 추가 버튼 disabled 제어.
 * - 최소 1개 보장 (BR-7/AC-17): 삭제 버튼 disabled 처리.
 */
export function TagListEditor<T extends AnyTag>({
  title,
  items,
  kind,
  maxItems,
  onSave,
  onClose,
}: TagListEditorProps<T>) {
  const [draft, setDraft] = useState<T[]>([...items]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty = useMemo(
    () =>
      JSON.stringify(draft) !== JSON.stringify(items) ||
      deletedIds.length > 0,
    [draft, items, deletedIds]
  );

  const onBackClick = () => {
    if (isDirty) setDiscardOpen(true);
    else onClose();
  };

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(draft, deletedIds);
      onClose();
    } catch (err) {
      console.error("[mohashim] tag save failed", err);
      setSaveError("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (maxItems !== undefined && draft.length >= maxItems) return;
    const newId =
      kind === "work"
        ? `wt${Date.now()}${Math.random().toString(36).slice(2)}`
        : `loc${Date.now()}${Math.random().toString(36).slice(2)}`;
    const newTag = {
      id: newId,
      emoji: EMOJI_PALETTE[0],
      label: kind === "work" ? "새 작업" : "새 위치",
      color: COLOR_PALETTE[0],
    } as T;
    setDraft((d) => [...d, newTag]);
    setEditingId(newId);
    setNewIds((s) => {
      const n = new Set(s);
      n.add(newId);
      return n;
    });
  };

  const handleDelete = (id: string) => {
    if (draft.length <= 1) return;
    setDraft((d) => d.filter((t) => t.id !== id));
    if (newIds.has(id)) {
      // 신규 추가 후 즉시 삭제 — 디스크 미존재이므로 deletedIds에 누적 불요.
      setNewIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } else {
      setDeletedIds((p) => [...p, id]);
    }
    if (editingId === id) setEditingId(null);
  };

  const updateTag = (id: string, patch: Partial<T>) => {
    setDraft((d) => d.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-deep/10 px-4 py-3">
        <button
          type="button"
          onClick={onBackClick}
          className="text-sm text-deep"
        >
          ← 뒤로
        </button>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={!isDirty || saving}
          className="text-sm text-deep disabled:text-deep/30"
        >
          저장
        </button>
      </div>

      {saveError && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-600">
          {saveError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {draft.map((item) => {
          const editing = editingId === item.id;
          return (
            <div
              key={item.id}
              className="mb-3 rounded-lg border border-deep/10 bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base"
                  style={{ background: item.color }}
                >
                  {item.emoji}
                </span>
                {editing ? (
                  <input
                    type="text"
                    maxLength={10}
                    value={item.label}
                    onChange={(e) =>
                      updateTag(item.id, { label: e.target.value } as Partial<T>)
                    }
                    className="flex-1 rounded border border-deep/30 px-2 py-1 text-sm"
                  />
                ) : (
                  <span className="flex-1 text-sm text-ink">{item.label}</span>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : item.id)}
                  className="px-2 text-xs text-deep/60"
                >
                  {editing ? "완료" : "✎"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={draft.length <= 1}
                  className="px-2 text-xs text-red-500 disabled:text-deep/20"
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
                        onClick={() =>
                          updateTag(item.id, { emoji } as Partial<T>)
                        }
                        className={`flex h-7 w-7 items-center justify-center rounded ${
                          item.emoji === emoji ? "bg-deep/15" : ""
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
                        onClick={() =>
                          updateTag(item.id, { color } as Partial<T>)
                        }
                        style={{ background: color }}
                        className={`h-6 w-6 rounded-full ${
                          item.color === color ? "ring-2 ring-deep" : ""
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
          onClick={handleAdd}
          disabled={maxItems !== undefined && draft.length >= maxItems}
          className="w-full rounded-lg border border-dashed border-deep/30 py-3 text-sm text-deep/60 disabled:opacity-40"
        >
          ＋ 새 {kind === "work" ? "작업 태그" : "위치 태그"} 추가
        </button>
      </div>

      <DiscardChangesModal
        open={discardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>
  );
}
