import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { WorkTag, Location } from "../../lib/storage";
import { TagPicker } from "./TagPicker";

type TodoInputProps = {
  workTags: readonly WorkTag[];
  locations: readonly Location[];
  onSubmit: (text: string, tag: string | null, loc: string | null) => void;
};

type PickerOpen = "work" | "loc" | null;

/**
 * 투두 입력바 — 텍스트 input + 🏷/📍 picker 토글 + + 버튼.
 *
 * - `<input maxLength={100}>`로 100자 차단 (BR-10, AC-3).
 * - 🏷/📍 버튼으로 picker 가로 스크롤 영역을 열고 닫음 (`pickerOpen`).
 * - Enter 또는 + 버튼 → trim 후 빈 문자열이면 무시 (BR-6). 등록 후 모든 state reset.
 */
export function TodoInput({ workTags, locations, onSubmit }: TodoInputProps) {
  const [text, setText] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<PickerOpen>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 텍스트 변경 시 textarea 높이 자동 조정 — 한 줄을 넘기면 줄바꿈되며 카드가 위로 늘어남.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    onSubmit(trimmed, selectedTag, selectedLoc);
    setText("");
    setSelectedTag(null);
    setSelectedLoc(null);
    setPickerOpen(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const togglePicker = (kind: "work" | "loc") => {
    setPickerOpen((prev) => (prev === kind ? null : kind));
  };

  return (
    <div className="border-t border-ink/10 bg-paperWarm/85 backdrop-blur-[2px]">
      {pickerOpen === "work" && (
        <div className="px-3">
          <TagPicker
            kind="work"
            items={workTags}
            value={selectedTag}
            onChange={setSelectedTag}
          />
        </div>
      )}
      {pickerOpen === "loc" && (
        <div className="px-3">
          <TagPicker
            kind="loc"
            items={locations}
            value={selectedLoc}
            onChange={setSelectedLoc}
          />
        </div>
      )}
      <div className="flex w-full items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={() => togglePicker("work")}
          aria-label="작업 태그 선택"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
            pickerOpen === "work" || selectedTag
              ? "bg-deepNavy/10 text-deepNavy"
              : "text-ink/50 hover:text-ink/70"
          }`}
        >
          🏷
        </button>
        <button
          type="button"
          onClick={() => togglePicker("loc")}
          aria-label="위치 태그 선택"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
            pickerOpen === "loc" || selectedLoc
              ? "bg-deepNavy/10 text-deepNavy"
              : "text-ink/50 hover:text-ink/70"
          }`}
        >
          📍
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          maxLength={50}
          placeholder="할 일을 입력하세요"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-ink/20 bg-paperWarm px-2.5 py-1 text-sm leading-snug text-ink placeholder:text-ink/40 outline-none focus:border-ink/50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          aria-label="추가"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-ink text-base font-bold text-paperWarm shadow-[1px_1px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
        >
          ＋
        </button>
      </div>
    </div>
  );
}
