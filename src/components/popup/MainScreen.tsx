import { useState } from "react";
import { useScoreTick } from "../../lib/score";
import { focusStart } from "../../lib/timer";
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
 */
export function MainScreen({ onResetDone }: MainScreenProps) {
  const snap = useScoreTick();
  const [tab, setTab] = useState<Tab>("todos");
  const phase = snap?.phase ?? "idle";
  const timeLeft = snap?.timeLeft ?? 0;
  const isRunning = phase === "focus" || phase === "break";

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
          />
        ) : (
          <IdleScreen onStart={handleFocusStart} />
        )}
      </main>
      <BottomTabBar tab={tab} onChange={setTab} />
      <ToastContainer />
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
