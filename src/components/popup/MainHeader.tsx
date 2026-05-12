import { useEffect, useState } from "react";
import { useIdleChipLabel } from "../../lib/idleChip";
import type { Phase } from "../../lib/score";

type MainHeaderProps = {
  phase: Phase;
  unreadCount: number;
  onOpenMailbox: () => void;
  onOpenSettings: () => void;
};

function formatNow(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours < 12 ? "오전" : "오후";
  const h12 = hours % 12 || 12;
  const mm = String(minutes).padStart(2, "0");
  return `${month}월 ${day}일 ${ampm} ${h12}시 ${mm}분`;
}

/**
 * 메인 화면 최상단 전체 너비 바.
 *
 * 좌측: 오늘 날짜 + 시간 (1분마다 갱신).
 * 우측: 메세지함 → 설정 → 상태 칩(idle/집중중/휴식중).
 */
export function MainHeader({
  phase,
  unreadCount,
  onOpenMailbox,
  onOpenSettings,
}: MainHeaderProps) {
  const [timeStr, setTimeStr] = useState(formatNow);
  const showFocusChip = phase === "focus" || phase === "break";
  const idleLabel = useIdleChipLabel(phase === "idle");

  useEffect(() => {
    const id = setInterval(() => setTimeStr(formatNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2">
      {/* 좌측: 날짜 + 시간 */}
      <div className="text-[13px] font-extrabold text-ink/75">
        {timeStr}
      </div>

      {/* 우측: 메세지함 → 설정 → 상태 칩 */}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenMailbox}
          aria-label="편지함"
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 bg-paperWarm/80 text-ink/70 shadow-[1px_1px_0_0_rgba(40,37,32,0.06)] transition-colors hover:bg-paperWarm hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <path d="M3 9l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="설정"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 bg-paperWarm/80 text-ink/70 shadow-[1px_1px_0_0_rgba(40,37,32,0.06)] transition-colors hover:bg-paperWarm hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {showFocusChip ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full border border-ink/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-[1px_1px_0_0_#2b2520] ${
              phase === "focus" ? "bg-chipFocus" : "bg-chipBreak"
            }`}
          >
            <span className="inline-block h-1.5 w-1.5 animate-mhpulse rounded-full bg-white" />
            <span>{phase === "focus" ? "집중 중" : "휴식 중"}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-ink/80 bg-deepNavy px-2 py-0.5 text-[10px] font-bold text-white shadow-[1px_1px_0_0_#2b2520]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
            {idleLabel || "쉬는 중"}
          </span>
        )}
      </div>
    </div>
  );
}
