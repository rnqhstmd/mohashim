import { useState } from "react";
import { discardSession } from "../../lib/timer";
import { DiscardModal } from "./DiscardModal";

type PomodoroRunningProps = {
  phase: "focus" | "break";
  timeLeft: number;
};

function formatMmSs(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Focus/Break 진행 중 화면 — MM:SS 카운트다운 + Discard 버튼.
 *
 * timeLeft는 score-tick payload 기반. discardSession은 Rust 단일 writer로
 * atomic phase=Idle + active_phase=idle 동기화한다.
 */
export function PomodoroRunning({ phase, timeLeft }: PomodoroRunningProps) {
  const [showDiscard, setShowDiscard] = useState(false);
  const heading = phase === "focus" ? "집중 중" : "휴식 중";

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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-deep/70">{heading}</p>
      <span className="text-5xl font-bold tabular-nums text-deep">
        {formatMmSs(timeLeft)}
      </span>
      <button
        type="button"
        onClick={() => setShowDiscard(true)}
        className="mt-2 text-xs text-deep/60 underline"
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
