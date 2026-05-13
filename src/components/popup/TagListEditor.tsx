import { useMemo, useState } from "react";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data";
import i18nKo from "@emoji-mart/data/i18n/ko.json";
import type { WorkTag, Location } from "../../lib/storage";
import { COLOR_PALETTE } from "../../lib/todos";
import { DiscardChangesModal } from "./DiscardChangesModal";

type EmojiSelectData = { native: string };

type AnyTag = WorkTag | Location;

type TagListEditorProps<T extends AnyTag> = {
  title: string;
  items: readonly T[];
  kind: "work" | "loc";
  maxItems?: number;
  onSave: (next: T[], deletedIds: string[]) => Promise<void>;
  onClose: () => void;
};

const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

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
        ? `wt-${Date.now()}-${Math.random().toString(36).slice(2)}`
        : `loc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newTag = {
      id: newId,
      emoji: "📌",
      label: kind === "work" ? "새 작업" : "새 위치",
      color: COLOR_PALETTE[0],
    } as T;
    setDraft((d) => [...d, newTag]);
    setEditingId(newId);
    setEmojiPickerFor(null);
    setColorPickerFor(null);
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
      setNewIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } else {
      setDeletedIds((p) => [...p, id]);
    }
    if (editingId === id) setEditingId(null);
    if (emojiPickerFor === id) setEmojiPickerFor(null);
    if (colorPickerFor === id) setColorPickerFor(null);
  };

  const updateTag = (id: string, patch: Partial<T>) => {
    setDraft((d) => d.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const startEditing = (id: string) => {
    setEditingId(id);
    setEmojiPickerFor(null);
    setColorPickerFor(null);
  };

  const stopEditing = () => {
    setEditingId(null);
    setEmojiPickerFor(null);
    setColorPickerFor(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2.5">
        <button
          type="button"
          onClick={onBackClick}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink/60 transition-colors hover:bg-ink/8 hover:text-ink"
          aria-label="뒤로"
        >
          <ChevronLeft />
        </button>
        <span className="flex-1 truncate text-[13px] font-semibold text-ink">{title}</span>
        <button
          type="button"
          onClick={() => { void handleSave(); }}
          disabled={!isDirty || saving}
          className="text-sm font-bold text-deepNavy disabled:text-ink/30"
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
          const emojiOpen = emojiPickerFor === item.id;
          const colorOpen = colorPickerFor === item.id;
          return (
            <div
              key={item.id}
              className="mb-3 rounded-xl border border-ink/15 bg-paperWarm/85 p-3 shadow-[1px_1px_0_0_rgba(40,37,32,0.06)]"
            >
              {/* 메인 행: [표시 원] [라벨/입력] [완료/✎] [×] */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (!editing) startEditing(item.id); }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/15 text-base"
                  style={{ background: item.color }}
                  aria-label={editing ? "현재 이모지" : "편집 시작"}
                >
                  {item.emoji}
                </button>

                {editing ? (
                  <input
                    type="text"
                    maxLength={10}
                    value={item.label}
                    onChange={(e) =>
                      updateTag(item.id, { label: e.target.value } as Partial<T>)
                    }
                    className="min-w-0 flex-1 rounded border border-ink/25 bg-paperWarm px-2 py-1 text-sm text-ink outline-none focus:border-ink/50"
                    autoFocus
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.label}</span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (editing) stopEditing();
                    else startEditing(item.id);
                  }}
                  className="shrink-0 whitespace-nowrap rounded px-1.5 text-xs font-semibold text-ink/55 hover:text-ink"
                >
                  {editing ? "완료" : "✎"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={draft.length <= 1}
                  className="shrink-0 rounded px-1.5 text-sm text-red-500 disabled:text-ink/20"
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>

              {/* 편집 모드: 이모지/색상 픽커 진입 버튼 + 펼침 패널 */}
              {editing && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEmojiPickerFor(emojiOpen ? null : item.id);
                        setColorPickerFor(null);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        emojiOpen
                          ? "border-ink/40 bg-ink/5 text-ink"
                          : "border-ink/15 bg-paperWarm text-ink/70 hover:border-ink/30 hover:text-ink"
                      }`}
                    >
                      <span className="text-sm leading-none">{item.emoji}</span>
                      <span>이모지</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setColorPickerFor(colorOpen ? null : item.id);
                        setEmojiPickerFor(null);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        colorOpen
                          ? "border-ink/40 bg-ink/5 text-ink"
                          : "border-ink/15 bg-paperWarm text-ink/70 hover:border-ink/30 hover:text-ink"
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-ink/15"
                        style={{ background: item.color }}
                      />
                      <span>색상</span>
                    </button>
                  </div>

                  {colorOpen && (
                    <div className="flex flex-wrap gap-1.5 rounded-lg border border-ink/10 bg-paperWarm/60 p-2">
                      {COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            updateTag(item.id, { color } as Partial<T>);
                            setColorPickerFor(null);
                          }}
                          style={{ background: color }}
                          className={`h-6 w-6 rounded-full transition-transform ${
                            item.color === color ? "ring-2 ring-ink scale-110" : ""
                          }`}
                          aria-label={`색상 ${color}`}
                        />
                      ))}
                    </div>
                  )}

                  {emojiOpen && (
                    <div className="overflow-hidden rounded-lg">
                      <Picker
                        data={emojiData}
                        i18n={i18nKo}
                        onEmojiSelect={(emoji: EmojiSelectData) => {
                          updateTag(item.id, { emoji: emoji.native } as Partial<T>);
                          setEmojiPickerFor(null);
                        }}
                        theme="light"
                        set="native"
                        previewPosition="none"
                        skinTonePosition="none"
                        perLine={8}
                        emojiSize={20}
                        emojiButtonSize={30}
                        searchPosition="static"
                        navPosition="top"
                        maxFrequentRows={1}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(() => {
          const atCap = maxItems !== undefined && draft.length >= maxItems;
          return (
            <button
              type="button"
              onClick={handleAdd}
              disabled={atCap}
              className="w-full rounded-xl border border-dashed border-ink/25 py-3 text-sm font-semibold text-ink/55 hover:border-ink/40 hover:text-ink/75 disabled:opacity-40 disabled:hover:border-ink/25"
            >
              {atCap
                ? `최대 ${maxItems}개까지 추가할 수 있어요`
                : `＋ 새 ${kind === "work" ? "작업 태그" : "위치 태그"} 추가`}
            </button>
          );
        })()}
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
