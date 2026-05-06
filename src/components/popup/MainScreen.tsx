import { useEffect, useRef, useState } from "react";
import { useScoreTick } from "../../lib/score";
import type { Phase } from "../../lib/score";
import { focusStart } from "../../lib/timer";
import { useToastQueue } from "../../lib/toast";
import { usePhrase } from "../../lib/usePhrase";
import { BottomTabBar, type Tab } from "./BottomTabBar";
import { ModeChip } from "./ModeChip";
import { SettingsScreen } from "./SettingsScreen";
import { ToastContainer } from "./Toast";
import { TodosTab } from "./TodosTab";
import { GrassTab } from "./GrassTab";

type MainScreenProps = {
  onResetDone: () => void;
};

/**
 * 메인 팝업 화면 (설계 §11/§13/§6).
 *
 * 구조:
 *   ModeChip (absolute 우상단)
 *   <main> 탭에 따라 TodosTab | SettingsScreen | Placeholder
 *   BottomTabBar
 *   ToastContainer
 *
 * phase는 score-tick 기반. timer.focusStart는 Rust 단일 writer로 active_phase 갱신.
 *
 * Phase 6 wiring (옵션 A 통합 — M1):
 * - todos 탭은 항상 <TodosTab key={tab} />을 렌더하며, 내부에서 phase에 따라 PomodoroCard /
 *   FocusStartButton 분기를 처리한다. MainScreen은 IdleScreen/PomodoroRunning을 직접 분기하지 않는다.
 * - score-tick의 state/db/total을 추출하여 usePhrase로 멘트/potatoState를 산출 후 TodosTab에 전달.
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

  const { phrase, potatoState } = usePhrase(
    snap ? { phase, total, db, state: engineState } : null
  );

  const toastQueue = useToastQueue();
  const pushToast = toastQueue.push;

  // FR-35: phase=complete 1-tick 진입 시점에 sessionComplete 멘트를 토스트로 동시 표시.
  // Phase 3 timer 검증 결과: timer.rs::on_phase_transition(Break, Complete)이 즉시
  // on_complete_consumed를 호출하여 atomic이 Idle로 전환되므로 complete는 정확히 1 tick만 emit됨.
  // prevPhaseRef로 1-tick 엣지 검출 (직전 phase != complete && 현재 phase == complete).
  //
  // deps 정책 (PR #5 review 반영):
  // - phase는 엣지 검출 트리거이므로 deps 필수.
  // - phrase는 deps에서 제외 — usePhrase가 currentBucket 기반으로 phase=complete 진입 즉시
  //   sessionComplete 첫 멘트를 반환하므로 effect 진입 시점의 phrase가 항상 정확.
  //   8초마다 phrase 회전으로 effect가 재실행되어도 prevPhaseRef 가드로 push는 차단되지만
  //   불필요한 effect 재실행을 차단하여 비용 최소화.
  // - pushToast는 toast.ts에서 useCallback으로 안정화된 참조라 재실행 영향 없음.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prevPhaseRef = useRef<Phase>("idle");
  useEffect(() => {
    if (prevPhaseRef.current !== "complete" && phase === "complete") {
      pushToast({ kind: "complete", text: phrase });
    }
    prevPhaseRef.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pushToast]);

  // Focus 진입 시 자동으로 todos 탭으로 전환하여 PomodoroCard가 보이도록.
  // 외부 트리거 등으로 settings 탭에 머무는 동안 Focus가 시작될 때를 대비한 fail-safe.
  // focusStart 실패 시 IPC 에러는 이미 timer.ts에서 console.error로 기록됨.
  // 다음 score-tick에서 phase=idle이 확인되면 FocusStartButton으로 자연 복귀하므로 swallow.
  const handleFocusStart = async () => {
    setTab("todos");
    try {
      await focusStart();
    } catch {
      // no-op: 다음 tick에서 phase=idle 확인 시 FocusStartButton으로 복귀
    }
  };

  return (
    <div className="relative flex h-[460px] w-[320px] flex-col bg-mist font-pretendard text-ink">
      <ModeChip phase={phase} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {tab === "settings" ? (
          <SettingsScreen onResetDone={onResetDone} />
        ) : tab === "grass" ? (
          <GrassTab
            key={tab}
            onShareToast={(kind, text) => pushToast({ kind, text })}
          />
        ) : (
          <TodosTab
            key={tab}
            phase={phase}
            timeLeft={timeLeft}
            potatoState={potatoState}
            phrase={phrase}
            onFocusStart={handleFocusStart}
          />
        )}
      </main>
      <BottomTabBar tab={tab} onChange={setTab} />
      <ToastContainer toasts={toastQueue.toasts} />
    </div>
  );
}

