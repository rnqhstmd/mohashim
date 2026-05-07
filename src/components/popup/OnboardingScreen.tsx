import {
  type PermissionKind,
  type PermissionState,
  type PermissionStatus,
} from "../../lib/permissions";

type OnboardingScreenProps = {
  permissions: PermissionState;
  isConsenting: boolean;
  onConsent: () => void;
  onOpenSettings: (kind: PermissionKind) => void;
};

type StatusIndicatorProps = {
  status: PermissionStatus;
};

function StatusIndicator({ status }: StatusIndicatorProps) {
  if (status === "granted") {
    return (
      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700">
        <span aria-hidden="true">✓</span>
        <span>허용됨</span>
      </span>
    );
  }
  if (status === "denied") {
    return (
      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-peach">
        <span aria-hidden="true">✕</span>
        <span>거절됨</span>
      </span>
    );
  }
  return (
    <span className="mt-2 flex items-center gap-1 text-xs font-medium text-deep/60">
      <span aria-hidden="true">●</span>
      <span>미요청</span>
    </span>
  );
}

type PermissionCardProps = {
  icon: string;
  title: string;
  description: string;
  status: PermissionStatus;
  kind: PermissionKind;
  extraHint?: string;
  onOpenSettings: (kind: PermissionKind) => void;
};

function PermissionCard({
  icon,
  title,
  description,
  status,
  kind,
  extraHint,
  onOpenSettings,
}: PermissionCardProps) {
  // 마이크: BR-6 — 거절된 경우에만 deep link 노출.
  // 접근성: C2 — 다이얼로그 트리거가 없으므로 not_determined/denied 모두 deep link 안내.
  const showDeepLink =
    kind === "microphone"
      ? status === "denied"
      : status === "denied" || status === "not_determined";
  return (
    <div className="my-2 w-full rounded-xl border border-deep/20 bg-sky/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-base font-bold">
            {icon} {title}
          </span>
          <p className="mt-1 text-xs text-deep/70">{description}</p>
        </div>
        <StatusIndicator status={status} />
      </div>
      {extraHint && showDeepLink && (
        <p className="mt-2 text-xs text-deep/70">{extraHint}</p>
      )}
      {showDeepLink && (
        <button
          type="button"
          onClick={() => onOpenSettings(kind)}
          className="mt-2 text-xs text-deep underline"
        >
          시스템 설정에서 허용하기
        </button>
      )}
    </div>
  );
}

export function OnboardingScreen({
  permissions,
  isConsenting,
  onConsent,
  onOpenSettings,
}: OnboardingScreenProps) {
  const accessibilityHint =
    "다이얼로그가 표시되지 않습니다. 시스템 환경설정 → 개인정보 보호 → 손쉬운 사용에서 모하심 체크를 추가하세요.";

  return (
    <div className="flex h-[460px] w-[320px] flex-col items-center bg-mist p-4 font-pretendard text-ink">
      <header className="mt-2 flex flex-col items-center">
        <span className="text-xs font-medium tracking-widest text-deep/70">
          WELCOME TO
        </span>
        <span className="text-2xl font-bold text-deep">모하심</span>
      </header>

      <PermissionCard
        icon="🎤"
        title="마이크 권한"
        description="음량(dB)만 측정. 음성 데이터 미저장."
        status={permissions.mic}
        kind="microphone"
        onOpenSettings={onOpenSettings}
      />

      <PermissionCard
        icon="⌨️"
        title="접근성 권한"
        description="키보드/마우스 입력 발생만 감지. 키 내용 미수집."
        status={permissions.accessibility}
        kind="accessibility"
        extraHint={accessibilityHint}
        onOpenSettings={onOpenSettings}
      />

      <p className="mt-auto text-xs text-ink/50">
        모든 정보는 PC에만 저장돼요
      </p>

      <button
        type="button"
        onClick={onConsent}
        disabled={isConsenting}
        className="mt-4 w-full rounded-lg bg-deep py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {isConsenting ? "권한 요청 중..." : "모든 권한 허용하고 시작하기"}
      </button>
    </div>
  );
}
