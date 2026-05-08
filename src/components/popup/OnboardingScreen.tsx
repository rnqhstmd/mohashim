import type { CSSProperties } from "react";
import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import {
  type PermissionKind,
  type PermissionState,
  type PermissionStatus,
} from "../../lib/permissions";
import type { TargetOs } from "../../lib/trayPopup";

type OnboardingScreenProps = {
  /** OS — 접근성 토글 동작 분기에 사용 (Windows는 OS 권한 부재로 즉시 grant). */
  os: TargetOs | null;
  permissions: PermissionState;
  isConsenting: boolean;
  onConsent: () => void;
  onRequestMic: () => void;
  /** Windows 전용 — 접근성 토글 클릭 시 즉시 INTERACTED 마킹 + Granted 반환. */
  onRequestAccessibility: () => void;
  /** Phase 21: 알림 권한은 선택. 미허용/취소 시에도 시작하기 활성. */
  onRequestNotification: () => void;
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

// Mohashim Design.html(line 1644) — BLUE_LIGHT 점박이 오버레이.
const DOT_OVERLAY: CSSProperties = {
  backgroundImage:
    "radial-gradient(rgba(180,200,230,0.45) 1.2px, transparent 1.2px)",
  backgroundSize: "16px 16px",
  opacity: 0.35,
};

type RequiredBadgeKind = "required" | "optional";

function RequirementBadge({ kind }: { kind: RequiredBadgeKind }) {
  if (kind === "required") {
    return (
      <span className="rounded-full border border-peach/40 bg-peach/15 px-1.5 py-px text-[8.5px] font-bold text-peach">
        필수
      </span>
    );
  }
  return (
    <span className="rounded-full border border-deep/30 bg-mist px-1.5 py-px text-[8.5px] font-bold text-deep">
      선택
    </span>
  );
}

type PermissionToggleProps = {
  status: PermissionStatus;
  /** 권한이 부여되지 않은 상태에서 토글 클릭 시 실행할 콜백. */
  onActivate: () => void;
};

/**
 * 권한 토글 — 시각적으로는 iOS-스타일 스위치. granted=ON, 그 외=OFF.
 *
 * granted 상태에서는 disabled (시스템에서만 해제 가능). non-granted 상태에서는
 * 클릭 시 onActivate 호출 — 호출자가 권한 요청 / 시스템 설정 deep-link 등
 * 적절한 액션을 실행한다 (BR-9).
 */
function PermissionToggle({ status, onActivate }: PermissionToggleProps) {
  const granted = status === "granted";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={granted}
      onClick={granted ? undefined : onActivate}
      disabled={granted}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-[1.5px] border-ink transition-colors ${
        granted
          ? "cursor-default bg-emerald-400/80 shadow-[1px_1px_0_0_#2b2520]"
          : "bg-paperBg shadow-[1px_1px_0_0_#2b2520] hover:bg-mist"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-[18px] w-[18px] transform rounded-full border-[1.5px] border-ink bg-paperWarm transition-transform ${
          granted ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

type StatusPillProps = {
  status: PermissionStatus;
};

function StatusPill({ status }: StatusPillProps) {
  if (status === "granted") {
    return (
      <span className="rounded-full border border-emerald-700/30 bg-emerald-50 px-1.5 py-px text-[8.5px] font-bold text-emerald-700">
        허용됨
      </span>
    );
  }
  if (status === "denied") {
    return (
      <span className="rounded-full border border-peach/40 bg-peach/15 px-1.5 py-px text-[8.5px] font-bold text-peach">
        거절됨
      </span>
    );
  }
  return (
    <span className="rounded-full border border-ink/15 bg-paperBg px-1.5 py-px text-[8.5px] font-bold text-ink/55">
      미요청
    </span>
  );
}

type PermissionCardProps = {
  icon: string;
  title: string;
  description: string;
  status: PermissionStatus;
  requirement: RequiredBadgeKind;
  /** 권한 미부여 상태에서 토글 클릭 시 실행 — request 또는 openSettings 분기. */
  onActivate: () => void;
};

function PermissionCard({
  icon,
  title,
  description,
  status,
  requirement,
  onActivate,
}: PermissionCardProps) {
  return (
    <div className="w-full rounded-[12px] border-[1.5px] border-ink bg-paperWarm px-3 py-2 shadow-[1.5px_1.5px_0_0_#2b2520]">
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-ink bg-mist text-base"
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-extrabold leading-tight">
              {title}
            </span>
            <RequirementBadge kind={requirement} />
            <StatusPill status={status} />
          </div>
          <p className="mt-0.5 text-[9.5px] leading-snug text-ink/55">
            {description}
          </p>
        </div>
        <PermissionToggle status={status} onActivate={onActivate} />
      </div>
    </div>
  );
}

/**
 * 권한 카드(토글 형식) + 시작하기 버튼.
 *
 * Phase 21 사용자 피드백 반영:
 *   - 가로 레이아웃: 모하(좌) + 말풍선(우, 꼬리는 ←로 모하 가리킴).
 *   - 토글 형식: 카드 안의 별도 버튼 제거 → 우측 토글이 단일 진입점.
 *     * not_determined: 시스템 다이얼로그 트리거 (mic/notification) 또는 시스템 설정
 *       deep-link (accessibility — Tauri로 다이얼로그 트리거 불가).
 *     * denied: 시스템 설정 deep-link (mic/accessibility). notification은 미지원.
 *     * granted: 토글 disabled (해제는 OS에서만 가능).
 *   - 알림 카드는 최하단에 배치하고 "선택" 배지 + 위 두 카드는 "필수" 배지로
 *     UI 위계 명시.
 *   - 카드 압축으로 시작하기 버튼이 460px 화면 안에 노출 (스크롤 회귀 해소).
 */
export function OnboardingScreen({
  os,
  permissions,
  isConsenting,
  onConsent,
  onRequestMic,
  onRequestAccessibility,
  onRequestNotification,
  onOpenSettings,
}: OnboardingScreenProps) {
  const micGranted = permissions.mic === "granted";
  const accessibilityGranted = permissions.accessibility === "granted";
  // Phase 21: 알림은 시작하기 게이트에서 제외 — 선택 권한.
  const allGranted = micGranted && accessibilityGranted;

  // 토글 클릭 시 실행할 액션 분기.
  const handleMicToggle = () => {
    if (permissions.mic === "denied") {
      onOpenSettings("microphone");
      return;
    }
    onRequestMic();
  };

  const handleAccessibilityToggle = () => {
    // macOS: 시스템 환경설정 → 보안/개인정보 → 접근성으로 deep-link.
    //         (rdev/AX는 앱에서 다이얼로그 트리거 불가)
    // Windows: OS에 "접근성 권한"이라는 개념 자체가 없으므로 시스템 설정을 열지 않고
    //          토글 클릭을 사용자 의도로 받아들여 즉시 INTERACTED 마킹 + Granted 반환.
    //          ms-settings:privacy를 열어도 거기엔 접근성 항목이 없어 사용자가 혼란
    //          스러워하는 회귀 해소.
    if (os === "windows") {
      onRequestAccessibility();
      return;
    }
    onOpenSettings("accessibility");
  };

  const handleNotificationToggle = () => {
    // Phase 21 사용자 피드백: macOS는 denied 상태에서 동일 origin 재요청 시
    // 시스템 다이얼로그가 발현되지 않아 토글이 동작하지 않는 회귀.
    // 분기:
    //   - denied: 시스템 설정 deep-link로 사용자가 직접 허용하도록 안내
    //   - 그 외(not_determined): 권한 요청 다이얼로그 트리거
    if (permissions.notification === "denied") {
      onOpenSettings("notification");
      return;
    }
    onRequestNotification();
  };

  const startDisabled = !allGranted || isConsenting;
  const startLabel = isConsenting ? "권한 요청 중..." : "시작하기";

  return (
    <div
      className="relative flex h-[460px] w-[320px] flex-col items-center overflow-hidden rounded-[18px] bg-paperBg px-4 pb-3 pt-3 font-kyobo text-ink"
      style={NOTE_PAPER_BG}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={DOT_OVERLAY}
      />

      <div className="relative z-10 flex w-full flex-col items-center text-center">
        <span className="text-[9px] font-extrabold tracking-[0.2em] text-deepNavy">
          WELCOME TO
        </span>
        <span className="mt-0 text-[24px] font-extrabold leading-none tracking-tight">
          모하심
        </span>

        {/* Phase 21: 모하(좌) + 말풍선(우) 가로 레이아웃. 말풍선 꼬리 ←는
            SpeechBubble 자체에서 좌측을 가리키도록 구현되어 있어 이대로 OK. */}
        <div className="mt-2 flex w-full items-center justify-center gap-2">
          <Potato state="calm" size={64} />
          <SpeechBubble text="권한 세 개만 줘!" color="#f4d160" />
        </div>

        <div className="mt-2.5 flex w-full flex-col gap-1.5">
          <PermissionCard
            icon="🎤"
            title="마이크 권한"
            description="음량(dB)만 측정 — 녹음 안 해요"
            status={permissions.mic}
            requirement="required"
            onActivate={handleMicToggle}
          />
          <PermissionCard
            icon="⌨️"
            title="접근성 권한"
            description="입력 발생 여부만 — 키 내용 안 봐요"
            status={permissions.accessibility}
            requirement="required"
            onActivate={handleAccessibilityToggle}
          />
          <PermissionCard
            icon="🔔"
            title="알림 권한"
            description="휴식/세션 완료 알림 — 안 받고 싶으면 건너뛰기"
            status={permissions.notification}
            requirement="optional"
            onActivate={handleNotificationToggle}
          />
        </div>
      </div>

      {/* spacer — 시작하기 버튼을 항상 하단에 고정. */}
      <div className="flex-1" />

      <button
        type="button"
        onClick={onConsent}
        disabled={startDisabled}
        className="relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-[12px] border-[1.8px] border-ink bg-ink py-2.5 text-[13px] font-extrabold tracking-tight text-paperWarm shadow-[2px_3px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[3px_5px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_2px_0_0_rgba(40,30,20,0.18)] disabled:cursor-not-allowed disabled:border-ink/30 disabled:bg-ink/30 disabled:text-paperWarm/80 disabled:shadow-none disabled:hover:translate-y-0"
      >
        <span>{startLabel}</span>
        {!startDisabled && <span aria-hidden>→</span>}
      </button>

      <p className="relative z-10 mt-1.5 text-[9.5px] font-semibold text-ink/45">
        모든 정보는 PC에만 저장돼요
      </p>
    </div>
  );
}
