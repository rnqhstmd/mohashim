import { useEffect, useRef, useState } from "react";
import { useScoreTick } from "../../lib/score";
import type { Phase } from "../../lib/score";
import { focusStart } from "../../lib/timer";
import { useToastQueue } from "../../lib/toast";
import { usePhrase } from "../../lib/usePhrase";
import { BottomTabBar, type Tab } from "./BottomTabBar";
import { IdleScreen } from "./IdleScreen";
import { ModeChip } from "./ModeChip";
import { PomodoroRunning } from "./PomodoroRunning";
import { SettingsScreen } from "./SettingsScreen";
import { ToastContainer } from "./Toast";

type MainScreenProps = {
  onResetDone: () => void;
};

/**
 * 메인 팝업 화면 (설계 §11/§13).
 *
 * 구조:
 *   ModeChip (absolute 우상단)
 *   <main> 탭/phase에 따라 IdleScreen | PomodoroRunning | SettingsScreen | Placeholder
 *   BottomTabBar
 *   ToastContainer
 *
 * phase는 score-tick 기반. timer.focusStart는 Rust 단일 writer로 active_phase 갱신.
 *
 * Phase 5 wiring:
 * - score-tick의 state/db/total을 추출하여 usePhrase로 멘트/potatoState를 산출.
 * - IdleScreen / PomodoroRunning에 potatoState/phrase prop 전달.
 * - useToastQueue는 본 컴포넌트에서만 단일 호출하여 ToastContainer에 toasts 전달.
 * - phase=complete 1-tick 발생 시 sessionComplete 멘트를 토스트로 push (FR-35).
 */
export function MainScreen({ onResetDone }: MainScreenProps) {
  const snap = useScoreTick();
  const [tab, setTab] = useState<Tab>("todos");
  const phase = snap?.phase ?? "idle";
  const timeLeft = snap?.timeLeft ?? 0;
  const total = snap?.total ?? 0;
  const db = snap?.db ?? 0;
  const engineState = snap?.state ?? "calm";
  const isRunning = phase === "focus" || phase === "break";

  const { phrase, potatoState } = usePhrase(
    snap ? { phase, total, db, state: engineState } : null
  );

  const toastQueue = useToastQueue();
  const pushToast = toastQueue.push;

  // FR-35: phase=complete 1-tick 진입 시점에 sessionComplete 멘트를 토스트로 동시 표시.
  // Phase 3 timer 검증 결과: timer.rs::on_phase_transition(Break, Complete)이 즉시
  // on_complete_consumed를 호출하여 atomic이 Idle로 전환되므로 complete는 정확히 1 tick만 emit됨.
  // prevPhaseRef로 1-tick 엣지 검출 (직전 phase != complete && 현재 phase == complete).
  // deps에는 useCallback으로 안정화된 pushToast만 사용 — toastQueue 객체 참조는 매 렌더마다
  // 재생성되므로 deps에 두면 불필요한 effect 재실행이 발생한다 (기능상 prevPhaseRef 가드로
  // 안전하지만 효율 측면에서 push 함수 단일 참조가 적절).
  const prevPhaseRef = useRef<Phase>("idle");
  useEffect(() => {
    if (prevPhaseRef.current !== "complete" && phase === "complete") {
      pushToast({ kind: "complete", text: phrase });
    }
    prevPhaseRef.current = phase;
  }, [phase, phrase, pushToast]);

  // snap=null + DiscardModal open 동시 시: phase=idle 폴백으로 IdleScreen 전환되어
  // PomodoroRunning(과 그 안의 DiscardModal)이 unmount된다. score-tick 일시 단절 시
  // 발생할 수 있으나 실제 발생 가능성은 매우 낮음. 후속 Phase에서 last-known snap 유지
  // 정책 검토 가능.

  // Focus 진입 시 자동으로 todos 탭으로 전환하여 PomodoroRunning이 보이도록.
  // 현재 IdleScreen은 todos 탭에서만 노출되지만, 외부 트리거 등으로 settings 탭에
  // 머무는 동안 Focus가 시작될 때를 대비한 fail-safe.
  // focusStart 실패 시 IPC 에러는 이미 timer.ts에서 console.error로 기록됨.
  // 다음 score-tick에서 phase=idle이 확인되면 IdleScreen으로 자연 복귀하므로 swallow.
  const handleFocusStart = async () => {
    setTab("todos");
    try {
      await focusStart();
    } catch {
      // no-op: 다음 tick에서 phase=idle 확인 시 IdleScreen으로 복귀
    }
  };

  return (
    <div className="relative flex h-[460px] w-[320px] flex-col bg-mist font-pretendard text-ink">
      <ModeChip phase={phase} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {tab === "settings" ? (
          <SettingsScreen onResetDone={onResetDone} />
        ) : tab === "grass" ? (
          <PlaceholderTab name="잔디" />
        ) : isRunning ? (
          <PomodoroRunning
            phase={phase as "focus" | "break"}
            timeLeft={timeLeft}
            potatoState={potatoState}
            phrase={phrase}
          />
        ) : (
          <IdleScreen
            onStart={handleFocusStart}
            potatoState={potatoState}
            phrase={phrase}
          />
        )}
      </main>
      <BottomTabBar tab={tab} onChange={setTab} />
      <ToastContainer toasts={toastQueue.toasts} />
    </div>
  );
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-deep/40">
      {name} (후속 Phase)
    </div>
  );
}
