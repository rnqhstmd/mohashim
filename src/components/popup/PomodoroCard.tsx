import { ItemOverlay } from "./ItemOverlay";
import type { PotatoState } from "../../lib/phrases";
import type { Inventory } from "../../lib/storage";

type PomodoroCardProps = {
  phase: "focus" | "break" | "complete";
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
  /** Phase 21: 데시벨 인라인 노출 — 캐릭터 헤더 내부에서 dB 라벨/숫자 표기. */
  db: number;
  /**
   * 사용자 피드백: idle 화면에 직전 세션 점수를 노출하는 대신, 세션 진행 중에
   * 실시간 점수(work_score + noise_score, 0~100)를 카드 헤더 우측에 큼지막하게
   * 보여준다. complete phase에서는 세션 평균 점수가 표시된다 (score-tick에서
   * total이 평균으로 갱신됨).
   */
  total: number;
  /** Phase 25 FR-1: 캐릭터 레이어 장착 상태. */
  equipped: Inventory["equipped"];
  onTimerClick: () => void;
};

function formatMmSs(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function envFromDb(db: number): { icon: string; label: string; danger: boolean } {
  if (db <= 40) return { icon: "📚", label: "조용해요", danger: false };
  if (db <= 55) return { icon: "🏠", label: "조용해요", danger: false };
  if (db <= 65) return { icon: "☕", label: "조용한 편", danger: false };
  if (db <= 75) return { icon: "🗣", label: "조금 시끄러워", danger: false };
  if (db <= 85) return { icon: "👥", label: "시끄러워요", danger: true };
  return { icon: "🚧", label: "매우 시끄러워", danger: true };
}

/**
 * Todos 탭 상단 카드 — focus/break/complete phase에서 노출 (Phase 21 사용자 피드백 재구조).
 *
 * FocusStartButton과 동일 레이아웃 골격 — 우상단 모드 칩 / 좌측 큰 Potato /
 * 우측 헤더 + 환경 라벨 + 멘트 / 하단 풀폭 [타이머 보기 | mm:ss] 버튼.
 */
export function PomodoroCard({
  phase,
  timeLeft,
  potatoState,
  phrase,
  db,
  total,
  equipped,
  onTimerClick,
}: PomodoroCardProps) {
  const isComplete = phase === "complete";
  const modeLabel =
    phase === "focus" ? "집중 중" : phase === "break" ? "휴식 중" : "세션 완료";
  const chipBg =
    phase === "focus"
      ? "bg-chipFocus"
      : phase === "break"
      ? "bg-chipBreak"
      : "bg-emerald-500";

  const inactive = db === 0;
  const dbSpl = inactive ? 0 : Math.max(0, Math.min(120, db + 94));
  const env = inactive
    ? { icon: "🎙", label: "측정 대기 중", danger: false }
    : envFromDb(dbSpl);
  const dbColor = inactive ? "#8a93a6" : env.danger ? "#d8554b" : "#5fa97a";

  return (
    <div className="relative border-b border-ink/10 bg-paperWarm/70 px-3 pb-2.5 pt-2.5 backdrop-blur-[1px]">
      {/* 우상단 절대 위치 — 모드 칩. */}
      <span
        className={`absolute right-3 top-2 inline-flex items-center gap-1 rounded-full border border-ink/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-[1px_1px_0_0_#2b2520] ${chipBg}`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-mhpulse" />
        {modeLabel}
      </span>

      {/* 1행: 큰 Potato + 우측 헤더 영역 */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <ItemOverlay
            equipped={equipped}
            state={potatoState}
            size={88}
            animated={true}
          />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="flex items-center gap-1 text-[15px] font-extrabold leading-tight text-ink">
            <span>안녕 난 모하야!</span>
          </h2>

          {/* 실시간 점수 — 세션 진행 중 가독성 우선의 큰 숫자 표시 (사용자 피드백). */}
          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
            <span className="text-[28px] font-extrabold leading-none text-ink">
              {Math.max(0, Math.min(100, Math.round(total)))}
            </span>
            <span className="text-[11px] font-bold text-ink/55">/ 100</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold">
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              style={{ color: dbColor }}
            >
              <span aria-hidden>{env.icon}</span>
              <span>{env.label}</span>
              <span className="ml-0.5 opacity-90">
                {inactive ? "—" : `${Math.round(dbSpl)}dB`}
              </span>
            </span>
          </div>

          <p className="mt-1 break-words text-xs italic text-ink/75">
            "{phrase}"
          </p>
        </div>
      </div>

      {/* 2행: 타이머 보기 풀폭 버튼. */}
      <button
        type="button"
        onClick={onTimerClick}
        disabled={isComplete}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-ink py-2.5 text-sm font-extrabold tracking-tight text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)] disabled:cursor-default disabled:bg-ink/40 disabled:shadow-none"
      >
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-paperWarm/15">
          ⏱
        </span>
        <span>{isComplete ? "세션 완료" : "타이머 보기"}</span>
        <span
          aria-hidden
          className="inline-block w-[44px] border-l border-paperWarm/30 pl-2 text-right text-xs font-bold text-paperWarm/80 tabular-nums"
        >
          {formatMmSs(timeLeft)}
        </span>
      </button>
    </div>
  );
}
