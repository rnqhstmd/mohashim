import { useState } from "react";
import { discardSession } from "../../lib/timer";
import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";
import { DiscardModal } from "./DiscardModal";

// complete는 1-tick 동안만 PomodoroRunning에 잠시 머무르며 (sessionComplete 멘트 표시),
// 다음 tick에 idle로 전환되어 IdleScreen으로 빠진다. 본 컴포넌트는 phase를 직접 사용하지
// 않으므로 (ModeChip이 우상단에서 표시) 시각 분기 없음. 타입에는 명시적으로 포함.
type PomodoroRunningProps = {
  phase: "focus" | "break" | "complete";
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
};

function formatMmSs(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Focus/Break 진행 중 화면 — Potato + SpeechBubble + MM:SS 카운트다운 + Discard 버튼.
 *
 * timeLeft는 score-tick payload 기반. discardSession은 Rust 단일 writer로
 * atomic phase=Idle + active_phase=idle 동기화한다.
 *
 * 레이아웃 (FR-32, 4단):
 *   1. Potato(100, animated) + SpeechBubble 가로 배치 (꼬리가 Potato 향함)
 *   2. MM:SS 카운트다운 (text-5xl tabular-nums)
 *   3. "그만하기" 버튼
 *   4. DiscardModal (open 시)
 *
 * "집중 중"/"휴식 중" 헤딩은 ModeChip(우상단)과 중복되어 제거됨.
 */
export function PomodoroRunning({
  phase,
  timeLeft,
  potatoState,
  phrase,
}: PomodoroRunningProps) {
  const [showDiscard, setShowDiscard] = useState(false);

  // discardSession 실패 시 모달을 닫지 않아 사용자가 재시도할 수 있도록 한다.
  // IPC 에러는 timer.ts에서 console.error로 기록됨.
  const handleConfirm = async () => {
    try {
      await discardSession();
      setShowDiscard(false);
    } catch {
      // 모달 유지 — 사용자가 재시도 가능
    }
  };

  // phase는 ModeChip이 우상단에서 표시하므로 본 컴포넌트에서는 명시적 헤딩을 두지 않는다.
  void phase;

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-start justify-center gap-2">
        <Potato state={potatoState} size={100} animated={true} />
        <div className="mt-8">
          <SpeechBubble text={phrase} />
        </div>
      </div>
      <span className="text-5xl font-extrabold tabular-nums tracking-tight text-ink">
        {formatMmSs(timeLeft)}
      </span>
      <button
        type="button"
        onClick={() => setShowDiscard(true)}
        className="mt-2 inline-flex items-center rounded-2xl border-[1.5px] border-ink/10 bg-transparent px-4 py-1.5 text-xs font-medium text-ink/55 transition-colors hover:border-ink/20 hover:text-ink/75"
      >
        그만하기
      </button>
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
