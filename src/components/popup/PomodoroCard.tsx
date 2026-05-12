import { ItemOverlay } from "./ItemOverlay";
import type { PotatoState } from "../../lib/phrases";
import type { Inventory } from "../../lib/storage";

type PomodoroCardProps = {
  phase: "focus" | "break" | "complete";
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
  db: number;
  /**
   * 실시간 점수(0~100). complete phase에서는 세션 평균.
   */
  total: number;
  equipped: Inventory["equipped"];
  sprouts: number;
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
 * Todos 탭 상단 카드 — focus/break/complete phase에서 노출.
 *
 * FocusStartButton과 동일 레이아웃:
 *   좌측 컬럼: 캐릭터 + "모하 🌱 N"
 *   우측 컬럼: 실시간 점수 + dB → 대사(중앙·2줄) → 타이머 보기 버튼
 *
 * MainHeader가 phase 칩(집중중/휴식중)을 단일 진실 소스로 노출 — 본 카드 내부 중복 칩 제거.
 */
export function PomodoroCard({
  phase,
  timeLeft,
  potatoState,
  phrase,
  db,
  total,
  equipped,
  sprouts,
  onTimerClick,
}: PomodoroCardProps) {
  const isComplete = phase === "complete";

  const inactive = db === 0;
  const dbSpl = inactive ? 0 : Math.max(0, Math.min(120, db + 94));
  const env = inactive
    ? { icon: "🎙", label: "측정 대기 중", danger: false }
    : envFromDb(dbSpl);
  const dbColor = inactive ? "#8a93a6" : env.danger ? "#d8554b" : "#5fa97a";

  return (
    <div className="border-b border-ink/10 bg-paperWarm/70 px-3 pb-3 pt-2 backdrop-blur-[1px]">
      {/* 2컬럼 — items-stretch(기본) + 좌측 justify-between으로 이름과 버튼 horizontally aligned */}
      <div className="flex gap-3">
        {/* 좌측: 캐릭터(top) / 이름·새싹(bottom) */}
        <div className="flex shrink-0 flex-col items-center justify-between">
          <ItemOverlay
            equipped={equipped}
            state={potatoState}
            size={80}
            animated={true}
          />
          <div className="flex items-center gap-1">
            <span className="text-[14px] font-extrabold text-ink">모하</span>
            <span className="flex items-center gap-0.5 text-[12px] font-bold text-ink/70">
              <span aria-hidden>🌱</span>
              <span className="tabular-nums">{sprouts.toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* 우측: 점수+dB(top) / 대사(중앙) / 타이머 보기 버튼(bottom) */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* 점수 + dB 한 행 */}
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-[22px] font-extrabold leading-none text-ink">
                {Math.max(0, Math.min(100, Math.round(total)))}
              </span>
              <span className="text-[10px] font-bold text-ink/55">/ 100</span>
            </div>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{ color: dbColor }}
            >
              <span aria-hidden>{env.icon}</span>
              <span>{env.label}</span>
              {!inactive && (
                <span className="ml-0.5 tabular-nums opacity-90">
                  {Math.round(dbSpl)}dB
                </span>
              )}
            </span>
          </div>

          {/* 대사: 좌우/수직 중앙 정렬, 최대 2줄 고정 영역. whitespace-pre-line으로 phrases.ts \n 보존. */}
          <div className="flex min-h-[2.8rem] flex-1 items-center justify-center">
            <p className="whitespace-pre-line text-center text-[14px] italic leading-[1.35] text-ink/75 line-clamp-2">
              "{phrase}"
            </p>
          </div>

          {/* 타이머 보기 버튼 — 대사 바로 하단 */}
          <button
            type="button"
            onClick={onTimerClick}
            disabled={isComplete}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-ink px-3 py-1.5 text-xs font-extrabold tracking-tight text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)] disabled:cursor-default disabled:bg-ink/40 disabled:shadow-none"
          >
            <span aria-hidden>⏱</span>
            <span>{isComplete ? "세션 완료" : "타이머 보기"}</span>
            <span
              aria-hidden
              className="border-l border-paperWarm/30 pl-1.5 text-[10px] font-bold text-paperWarm/80 tabular-nums"
            >
              {formatMmSs(timeLeft)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
