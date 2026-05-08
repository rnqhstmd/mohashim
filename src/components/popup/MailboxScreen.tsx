import { useEffect, useState } from "react";
import { Potato } from "../Potato";
import { getMailbox, type Letter } from "../../lib/storage";
import { markAllRead } from "../../lib/mailbox";

function truncate60(s: string): string {
  const chars = Array.from(s);
  if (chars.length <= 60) return s;
  return chars.slice(0, 60).join("") + "…";
}

// =====================================================================
// 목록 뷰
// =====================================================================

type ListViewProps = {
  letters: Letter[];
  onSelect: (id: string) => void;
};

function ListView({ letters, onSelect }: ListViewProps) {
  if (letters.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <Potato state="calm" size={80} animated={false} />
        <p className="text-center text-sm text-ink/60">
          아직 편지가 없어. 함께 집중해보자!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
      {letters.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onSelect(l.id)}
          className="flex w-full items-start gap-2 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-ink/5 active:bg-ink/8"
        >
          <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
            <span className="truncate text-[13px] font-semibold text-ink">
              {l.title}
            </span>
            <span className="truncate text-[11px] text-ink/55">
              {truncate60(l.body)}
            </span>
          </div>
          {!l.read && (
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          )}
        </button>
      ))}
    </div>
  );
}

// =====================================================================
// 상세 뷰
// =====================================================================

type DetailViewProps = {
  letter: Letter;
  onBack: () => void;
};

function DetailView({ letter, onBack }: DetailViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/60 transition-colors hover:bg-ink/8 hover:text-ink"
          aria-label="뒤로가기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="flex-1 truncate text-[13px] font-semibold text-ink">
          {letter.title}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink/80">
          {letter.body}
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// 메인 화면
// =====================================================================

/**
 * 편지함 풀스크린 (Phase 23 FR-10~13).
 *
 * 마운트 시 get_mailbox IPC로 편지 로드 → createdAt 내림차순 정렬.
 * 미읽음 1건↑이면 markAllRead로 뱃지 갱신 (FR-9).
 */
export function MailboxScreen() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fetched = await getMailbox();
      if (cancelled) return;
      const sorted = [...fetched].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setLetters(sorted);
      if (fetched.some((l) => !l.read)) {
        await markAllRead().catch(() => {});
        if (cancelled) return;
        // AC-15 일관성: markAllRead 완료 후 로컬 letters 상태도 read=true로 동기화.
        // 빨간 점 잔존을 차단하고, 뱃지 해제와 시각적 정합 유지.
        setLetters((prev) => prev.map((l) => ({ ...l, read: true })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedLetter = letters.find((l) => l.id === selectedId) ?? null;

  if (view === "detail" && selectedLetter) {
    return (
      <DetailView
        letter={selectedLetter}
        onBack={() => setView("list")}
      />
    );
  }

  return <ListView letters={letters} onSelect={(id) => { setSelectedId(id); setView("detail"); }} />;
}
