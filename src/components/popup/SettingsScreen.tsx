import { useState } from "react";
import { resetAllData } from "../../lib/storage";
import { DurationsEditorScreen } from "./DurationsEditorScreen";
import { ResetConfirmModal } from "./ResetConfirmModal";

type SettingsScreenProps = {
  onResetDone: () => void;
};

/**
 * Settings 탭 메인 (설계 §19).
 *
 * - 상단: DurationsEditorScreen
 * - 하단: "모든 데이터 초기화" 빨간 텍스트 버튼 → ResetConfirmModal
 *
 * 초기화 확인 시 resetAllData()를 호출 후 onResetDone을 통해 상위에
 * onboardingCompleted=false 상태 전환을 위임한다 (App.tsx → OnboardingScreen 복귀).
 */
export function SettingsScreen({ onResetDone }: SettingsScreenProps) {
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

  return (
    <div className="flex h-full flex-col">
      <DurationsEditorScreen />

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
