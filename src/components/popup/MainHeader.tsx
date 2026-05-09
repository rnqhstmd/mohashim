import type { Phase } from "../../lib/score";

type MainHeaderProps = {
  phase: Phase;
  unreadCount: number;
  onOpenMailbox: () => void;
  onOpenSettings: () => void;
};

/**
 * 메인 화면 우상단 헤더 (Phase 26 FR-20, MA-2, PRD UX 142행 정합).
 *
 * 메인 화면(overlayScreen=null)에서만 노출. popup 외곽 absolute(top-right).
 *
 * 배치 (왼쪽→오른쪽): ModeChip → 편지함 → 톱니바퀴.
 * - ModeChip: 기존 컴포넌트 재사용. focus/break일 때만 가시 (idle/complete는 빈 영역).
 *   ModeChip 내부에 absolute가 있어 본 컴포넌트 안에서는 inline 모드로 사용하기
 *   위해 wrapper에 relative만 두고 위치는 ModeChip이 책임.
 * - 편지함 / 톱니바퀴: BottomTabBar에서 옮겨온 SVG.
 * - 편지함 아이콘에 unread>0 시 빨간 dot 뱃지 (FR-21, AC-13).
 */
export function MainHeader({
  phase,
  unreadCount,
  onOpenMailbox,
  onOpenSettings,
}: MainHeaderProps) {
  const showChip = phase === "focus" || phase === "break";
  return (
    <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5">
      {/* ModeChip은 자체 absolute 배치를 갖고 있어, 헤더 inline 영역에 통합하기 위해
          간단한 inline 배지 형태로 새로 그린다 — focus/break에서만 노출. */}
      {showChip && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-ink/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-[1px_1px_0_0_#2b2520] ${
            phase === "focus" ? "bg-chipFocus" : "bg-chipBreak"
          }`}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-mhpulse" />
          <span>{phase === "focus" ? "집중 중" : "휴식 중"}</span>
        </span>
      )}
      <button
        type="button"
        onClick={onOpenMailbox}
        aria-label="편지함"
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 bg-paperWarm/80 text-ink/70 shadow-[1px_1px_0_0_rgba(40,37,32,0.06)] transition-colors hover:bg-paperWarm hover:text-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="3"
            y="6"
            width="18"
            height="13"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
          />
          <path
            d="M3 9l9 6 9-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

