import { useState } from "react";
import { resetAllData } from "../../lib/storage";
import { DurationsEditorScreen } from "./DurationsEditorScreen";
import { ResetConfirmModal } from "./ResetConfirmModal";
import { WorkTagEditorScreen } from "./WorkTagEditorScreen";
import { LocationEditorScreen } from "./LocationEditorScreen";

type SettingsScreenProps = {
  onResetDone: () => void;
};

type View = "main" | "work" | "loc";

/**
 * Settings 탭 메인 (설계 §5, §19).
 *
 * 단일 패널 sub-screen 라우팅:
 *   - main: DurationsEditor + 작업/위치 태그 편집 메뉴 + 초기화 버튼
 *   - work: WorkTagEditorScreen
 *   - loc:  LocationEditorScreen
 *
 * dirty 정책은 TagListEditor 단일 책임 (C2). SettingsScreen은 단순 라우터.
 *
 * 초기화 확인 시 resetAllData()를 호출 후 onResetDone을 통해 상위에
 * onboardingCompleted=false 상태 전환을 위임한다 (App.tsx → OnboardingScreen 복귀).
 */
export function SettingsScreen({ onResetDone }: SettingsScreenProps) {
  const [view, setView] = useState<View>("main");
  const [showReset, setShowReset] = useState(false);

  const handleConfirm = async () => {
    setShowReset(false);
    try {
      await resetAllData();
      onResetDone();
    } catch (err) {
      console.error("[mohashim] reset failed", err);
      // 실패 시 onResetDone 미호출 — 스토어 미초기화 상태로 onboarding 진입 방지.
      // (간단한 fail-safe — 사용자 가시 토스트는 후속 character/UX Phase에서 추가 가능)
    }
  };

  if (view === "work") {
    return <WorkTagEditorScreen onClose={() => setView("main")} />;
  }
  if (view === "loc") {
    return <LocationEditorScreen onClose={() => setView("main")} />;
  }

  return (
    <div className="flex h-full flex-col">
      <DurationsEditorScreen />

      <div className="flex flex-col gap-2 px-4 pt-2">
        <button
          type="button"
          onClick={() => setView("work")}
          className="rounded-md border border-deep/15 bg-white px-3 py-2 text-left text-sm text-ink"
        >
          작업 태그 편집
        </button>
        <button
          type="button"
          onClick={() => setView("loc")}
          className="rounded-md border border-deep/15 bg-white px-3 py-2 text-left text-sm text-ink"
        >
          위치 태그 편집
        </button>
      </div>

      <div className="mt-auto p-4">
        <button
          type="button"
          onClick={() => setShowReset(true)}
          className="text-sm text-red-600 underline"
        >
          모든 데이터 초기화
        </button>
      </div>

      <ResetConfirmModal
        open={showReset}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setShowReset(false)}
      />
    </div>
  );
}
