import { useEffect, useState } from "react";
import { discardSession } from "../../lib/timer";
import { ItemOverlay } from "./ItemOverlay";
import type { PotatoState } from "../../lib/phrases";
import {
  getBreakMinutes,
  getFocusMinutes,
  STORE_DEFAULTS,
  type Inventory,
} from "../../lib/storage";
import { DiscardModal } from "./DiscardModal";

type TimerDetailScreenProps = {
  /** focus|break — 본 컴포넌트는 호출자(TodosTab)에서 두 phase에서만 마운트됨. */
  phase: "focus" | "break";
  timeLeft: number;
  potatoState: PotatoState;
  /**
   * Phase 21 사용자 피드백: 타이머 상세 화면은 시간 집중 — 대사는 메인 화면 전용.
   * 본 prop은 호환성을 위해 남기되 렌더에는 사용하지 않는다.
   */
  phrase?: string;
  /** 장착 아이템 — 타이머 상세에서도 캐릭터에 동일하게 노출. 미전달 시 빈 슬롯. */
  equipped?: Inventory["equipped"];
  onBack: () => void;
};

function formatMmSs(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Todos 탭 내 타이머 상세 화면 — PomodoroCard 클릭 시 노출 (Phase 17 B2-F, FR-F3~F5).
 *
 * Phase 21 사용자 피드백 반영:
 *   - 캐릭터 주위에 원형 progress ring을 두고 중앙에 MM:SS 카운트다운을 배치.
 *   - 멘트 말풍선은 ring 아래로 분리하여 시각 위계 정리.
 *   - focus_minutes/break_minutes를 store에서 1회 조회하여 progress 정상화.
 *
 * BR-5: focus/break에서만 진입. complete/idle 진입은 호출자(TodosTab)의 phase effect로 차단.
 */
export function TimerDetailScreen({
  phase,
  timeLeft,
  potatoState,
  equipped,
  onBack,
}: TimerDetailScreenProps) {
  const equippedSafe = equipped ?? STORE_DEFAULTS.inventory.equipped;
  const [showDiscard, setShowDiscard] = useState(false);
  const [totalSecs, setTotalSecs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mins =
          phase === "focus" ? await getFocusMinutes() : await getBreakMinutes();
        if (!cancelled) setTotalSecs(Math.max(1, mins * 60));
      } catch (err) {
        console.error("[mohashim] timer total load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const handleConfirm = async () => {
    try {
      await discardSession();
      setShowDiscard(false);
    } catch {
      // discardSession 실패 시 모달 유지 — 사용자가 재시도 가능
    }
  };

  // ring geometry — viewBox 200x200, stroke 8, gap 6 between potato and ring.
  const RING_R = 92;
  const RING_C = 2 * Math.PI * RING_R;
  const progress =
    totalSecs && totalSecs > 0
      ? Math.max(0, Math.min(1, timeLeft / totalSecs))
      : 0;
  // dashOffset: progress=1(시작) → 0, progress=0(완료) → RING_C (꽉 빈 원호).
  const dashOffset = RING_C * (1 - progress);
  const ringColor = phase === "focus" ? "#dc4646" : "#d68a6a";

  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="flex items-center px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로가기"
          className="flex h-8 w-8 items-center justify-center rounded-lg border-[1.5px] border-ink bg-paperWarm text-sm font-extrabold text-ink shadow-[1px_1px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
        >
          ←
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        {/* 원형 progress ring + 중앙 캐릭터/타이머 */}
        <div className="relative h-[200px] w-[200px]">
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="100"
              cy="100"
              r={RING_R}
              fill="none"
              stroke="rgba(43,37,32,0.10)"
              strokeWidth="8"
            />
            <circle
              cx="100"
              cy="100"
              r={RING_R}
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.6s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <ItemOverlay
              equipped={equippedSafe}
              state={potatoState}
              size={84}
              animated={true}
            />
            <span className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-ink">
              {formatMmSs(timeLeft)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-center px-3 py-4">
        <button
          type="button"
          onClick={() => setShowDiscard(true)}
          className="inline-flex items-center rounded-2xl border-[1.5px] border-ink/10 bg-transparent px-4 py-1.5 text-xs font-medium text-ink/55 transition-colors hover:border-ink/20 hover:text-ink/75"
        >
          그만하기
        </button>
      </div>

      <DiscardModal
        open={showDiscard}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
