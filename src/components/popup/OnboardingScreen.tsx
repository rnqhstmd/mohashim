import type { CSSProperties } from "react";
import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
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

// Mohashim Design.html(NOTE_BG) — MainScreen과 동일한 페이퍼 표면.
const NOTE_PAPER_BG: CSSProperties = {
  backgroundImage: [
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.20  0 0 0 0 0.18  0 0 0 0 0.14  0 0 0 0.045 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
    "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(60,50,40,0.035) 27px, rgba(60,50,40,0.035) 28px)",
    "radial-gradient(ellipse at 30% 20%, rgba(255,253,247,0.5), transparent 60%)",
    "radial-gradient(ellipse at 80% 85%, rgba(200,190,175,0.18), transparent 55%)",
  ].join(","),
};

// Mohashim Design.html(line 1644) — BLUE_LIGHT 점박이 오버레이 (디자인 시안의 친근한 텍스처).
const DOT_OVERLAY: CSSProperties = {
  backgroundImage:
    "radial-gradient(rgba(180,200,230,0.45) 1.2px, transparent 1.2px)",
  backgroundSize: "16px 16px",
  opacity: 0.35,
};

type StatusIndicatorProps = {
  status: PermissionStatus;
};

function StatusIndicator({ status }: StatusIndicatorProps) {
  if (status === "granted") {
    return (
      <span className="ml-2 flex shrink-0 items-center gap-1 rounded-full border border-emerald-700/30 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        <span aria-hidden="true">✓</span>
        <span>허용됨</span>
      </span>
    );
  }
  if (status === "denied") {
    return (
      <span className="ml-2 flex shrink-0 items-center gap-1 rounded-full border border-peach/40 bg-peach/15 px-2 py-0.5 text-[10px] font-bold text-peach">
        <span aria-hidden="true">✕</span>
        <span>거절됨</span>
      </span>
    );
  }
  return (
    <span className="ml-2 flex shrink-0 items-center gap-1 rounded-full border border-ink/15 bg-paperBg px-2 py-0.5 text-[10px] font-bold text-ink/55">
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
    <div className="w-full rounded-[12px] border-[1.5px] border-ink bg-paperWarm px-3 py-2 shadow-[1.5px_1.5px_0_0_#2b2520]">
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-ink bg-mist text-base"
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold leading-tight">
              {title}
            </span>
            <StatusIndicator status={status} />
          </div>
          <p className="mt-0.5 text-[9.5px] leading-snug text-ink/55">
            {description}
          </p>
        </div>
      </div>
      {extraHint && showDeepLink && (
        <p className="mt-1.5 text-[9.5px] leading-snug text-ink/55">
          {extraHint}
        </p>
      )}
      {showDeepLink && (
        <button
          type="button"
          onClick={() => onOpenSettings(kind)}
          className="mt-1.5 text-[10px] font-bold text-deepNavy underline decoration-deepNavy/40 underline-offset-2 hover:decoration-deepNavy"
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

  // Phase 20 사용자 피드백: 시작 버튼이 항상 동일한 라벨로 보이고, 권한이 거절된
  // 상태에서 클릭해도 침묵 종료하므로 "왜 안 되지" 혼란이 발생. 권한 상태에 따라
  // 라벨/활성 상태를 동기화한다.
  //
  // - mic granted + accessibility granted: 시작하기 (활성, 실제 진입)
  // - mic not_determined: 마이크 권한 허용 요청 (활성 — 클릭 시 시스템 다이얼로그)
  // - mic denied: 비활성 — 카드의 deep link로 시스템 설정 안내
  // - accessibility != granted: 비활성 — 카드의 deep link 안내
  const micGranted = permissions.mic === "granted";
  const micNotDetermined = permissions.mic === "not_determined";
  const accessibilityGranted = permissions.accessibility === "granted";
  const allGranted = micGranted && accessibilityGranted;

  let primaryLabel: string;
  let primaryDisabled: boolean;
  let primaryHint: string | null = null;
  if (isConsenting) {
    primaryLabel = "권한 요청 중...";
    primaryDisabled = true;
  } else if (allGranted) {
    primaryLabel = "시작하기";
    primaryDisabled = false;
  } else if (micNotDetermined) {
    primaryLabel = "마이크 권한 허용 요청";
    primaryDisabled = false;
  } else if (!micGranted) {
    primaryLabel = "마이크 권한이 거절되었어요";
    primaryDisabled = true;
    primaryHint = "위 카드의 \"시스템 설정에서 허용하기\"를 눌러 마이크 권한을 켜주세요.";
  } else {
    // mic granted, accessibility !granted
    primaryLabel = "접근성 권한을 켜주세요";
    primaryDisabled = true;
    primaryHint =
      "시스템 설정 → 손쉬운 사용에서 모하심을 추가/체크한 뒤 앱을 재시작하면 자동 인식돼요.";
  }

  return (
    <div
      className="relative flex h-[460px] w-[320px] flex-col items-center overflow-hidden rounded-[18px] bg-paperBg px-4 pb-3 pt-3.5 font-pretendard text-ink"
      style={NOTE_PAPER_BG}
    >
      {/* Mohashim Design.html line 1642-1646: 옅은 도트 오버레이로 친근한 깊이감 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={DOT_OVERLAY}
      />

      <div className="relative z-10 flex w-full flex-col items-center text-center">
        <span className="text-[9px] font-extrabold tracking-[0.2em] text-deepNavy">
          WELCOME TO
        </span>
        <span className="mt-0.5 text-[28px] font-extrabold leading-none tracking-tight">
          모하심
        </span>

        <div className="mt-1.5">
          <Potato state="calm" size={84} />
        </div>
        <div className="-mt-1">
          <SpeechBubble text="시작하려면 권한 두 개 줘!" color="#f4d160" />
        </div>

        <div className="mt-3 flex w-full flex-col gap-2">
          <PermissionCard
            icon="🎤"
            title="마이크 권한"
            description="음량(dB)만 측정 — 녹음 안 해요"
            status={permissions.mic}
            kind="microphone"
            onOpenSettings={onOpenSettings}
          />
          <PermissionCard
            icon="⌨️"
            title="접근성 권한"
            description="입력 발생 여부만 — 키 내용 안 봐요"
            status={permissions.accessibility}
            kind="accessibility"
            extraHint={accessibilityHint}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onConsent}
        disabled={primaryDisabled}
        className="relative z-10 mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[12px] border-[1.8px] border-ink bg-ink py-3 text-[13px] font-extrabold tracking-tight text-paperWarm shadow-[2px_3px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[3px_5px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_2px_0_0_rgba(40,30,20,0.18)] disabled:cursor-not-allowed disabled:border-ink/30 disabled:bg-ink/30 disabled:text-paperWarm/80 disabled:shadow-none disabled:hover:translate-y-0"
      >
        <span>{primaryLabel}</span>
        {allGranted && !isConsenting && <span aria-hidden>→</span>}
      </button>

      {primaryHint && (
        <p className="relative z-10 mt-2 max-w-[280px] text-center text-[10px] font-semibold leading-snug text-ink/55">
          {primaryHint}
        </p>
      )}

      <p className="relative z-10 mt-2 text-[10px] font-semibold text-ink/45">
        모든 정보는 PC에만 저장돼요
      </p>
    </div>
  );
}
