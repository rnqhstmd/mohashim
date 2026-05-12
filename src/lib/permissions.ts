import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import {
  isPermissionGranted as notifIsGranted,
  requestPermission as notifRequest,
} from "@tauri-apps/plugin-notification";

export type PermissionStatus = "granted" | "denied" | "not_determined";
export type PermissionKind = "microphone" | "accessibility" | "notification";
export type PermissionState = {
  mic: PermissionStatus;
  accessibility: PermissionStatus;
  /**
   * Phase 21: 알림 권한. 마이크/AX와 달리 **선택 사항** — 시작하기 게이트에 영향 없음.
   * 모하심은 알림 없이도 핵심 기능(타이머 / 점수) 동작.
   */
  notification: PermissionStatus;
};

/**
 * 시작하기 게이트 — 마이크/AX만 필수. 알림 권한은 선택사항으로 게이트에서 제외.
 */
export function canEnterMain(p: PermissionState): boolean {
  return p.mic === "granted" && p.accessibility === "granted";
}

type RustPermissionState = {
  mic: PermissionStatus;
  accessibility: PermissionStatus;
};

/**
 * Windows TOFU 마킹 키. WebView2의 Notification API는 권한 다이얼로그를 띄울 수
 * 없고 Notification.permission도 항상 "default"라 OS Toast 동작 여부를 정확히
 * 알 수 없다. 따라서 사용자가 알림 토글을 누르면 OS 알림 설정 페이지로 안내한 뒤
 * 이 플래그를 set하여 후속 조회에서 granted로 표시 — 마이크와 동일한 trust-on-
 * first-use 정책. localStorage는 Tauri WebView에서 영속.
 */
const NOTIF_INTERACTED_KEY = "mohashim:notif_interacted_v1";

/**
 * Windows 전용 마이크 INTERACTED 영속 키.
 *
 * Rust측 `MIC_INTERACTED` atomic은 프로세스 메모리 변수라 앱 종료 시 reset된다.
 * 사용자가 한 번 토글로 권한 부여한 뒤 재실행하면 mic=not_determined로 보이고
 * `oc && granted` 가드가 disk의 `onboarding_completed=true`를 false로 덮어써
 * 매 재실행마다 웰컴 페이지로 돌아가는 회귀가 발생한다.
 *
 * 해결: 토글 성공 시 localStorage에 영속. 부팅 시점의 `getPermissionStatus`가
 * mic=not_determined이고 본 키가 "1"이면 Rust atomic을 복원하는 invoke를 호출
 * 한다 (`restore_persisted_mic_interacted` 커맨드).
 */
const MIC_INTERACTED_KEY = "mohashim:mic_interacted_v1";

function isWindows(): boolean {
  try {
    return platform() === "windows";
  } catch {
    return false;
  }
}

/** Web Notification API → 모하심 PermissionStatus 매핑. */
async function getNotificationStatus(): Promise<PermissionStatus> {
  try {
    const granted = await notifIsGranted();
    if (granted) return "granted";
    if (isWindows() && localStorage.getItem(NOTIF_INTERACTED_KEY) === "1") {
      return "granted";
    }
    // macOS: 앱 첫 설치 시 알림이 기본 허용으로 동작하므로 웰컴 페이지 토글을 ON으로
    // 디폴트 표시한다. 사용자가 시스템 설정에서 명시적으로 거부한 경우는 OS 알림이
    // fail-silent로 처리되며 UI 영향은 미미.
    if (!isWindows()) {
      return "granted";
    }
    return "not_determined";
  } catch (err) {
    console.error("[mohashim] notification status check failed", err);
    return "denied";
  }
}

export async function getPermissionStatus(): Promise<PermissionState> {
  try {
    const [rust, notification] = await Promise.all([
      invoke<RustPermissionState>("permission_status"),
      getNotificationStatus(),
    ]);
    // Windows TOFU 영속 복원: mic atomic이 프로세스 종료 시 reset되므로 localStorage
    // 영속 플래그가 "1"이면 Rust atomic을 복원하고 granted로 매핑한다.
    let mic = rust.mic;
    if (
      mic !== "granted" &&
      isWindows() &&
      localStorage.getItem(MIC_INTERACTED_KEY) === "1"
    ) {
      try {
        const restored = await invoke<PermissionStatus>(
          "restore_persisted_mic_interacted"
        );
        mic = restored;
      } catch (err) {
        console.error("[mohashim] restore_persisted_mic_interacted failed", err);
      }
    }
    return { mic, accessibility: rust.accessibility, notification };
  } catch (err) {
    console.error("[mohashim] permission_status failed", err);
    return { mic: "denied", accessibility: "denied", notification: "denied" };
  }
}

/**
 * 알림 권한 요청.
 *
 * - macOS: Tauri plugin → web Notification API 다이얼로그. granted/denied/default
 *   결과를 그대로 매핑.
 * - Windows: WebView2는 Notification.requestPermission() 다이얼로그를 띄우지 못한다.
 *   대신 마이크 토글과 동일한 trust-on-first-use 패턴 — 사용자를 OS 알림 설정 페이지로
 *   안내(`ms-settings:notifications`)하고 INTERACTED 플래그를 영속하여 후속 조회에서
 *   granted로 표시한다. 실제 OS Toast는 인스톨러 등록된 AppUserModelID 기반으로
 *   동작 — 사용자가 OS 알림 페이지에서 명시 거부한 경우 fail-silent.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  if (isWindows()) {
    await openPermissionSettings("notification");
    localStorage.setItem(NOTIF_INTERACTED_KEY, "1");
    return "granted";
  }
  try {
    const result = await notifRequest();
    if (result === "granted") return "granted";
    if (result === "denied") return "denied";
    return "not_determined";
  } catch (err) {
    console.error("[mohashim] requestNotificationPermission failed", err);
    return "denied";
  }
}

export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  try {
    const result = await invoke<PermissionStatus>("request_microphone_permission");
    // Windows TOFU 영속: granted로 전환되면 localStorage에 마킹 → 다음 부팅 시
    // getPermissionStatus가 atomic을 복원해 매 재실행마다 웰컴 페이지로 회귀하는
    // 회귀를 방지한다.
    if (result === "granted" && isWindows()) {
      localStorage.setItem(MIC_INTERACTED_KEY, "1");
    }
    return result;
  } catch (err) {
    console.error("[mohashim] request_microphone_permission failed", err);
    return "denied";
  }
}

export async function requestAccessibilityPermission(): Promise<PermissionStatus> {
  try {
    return await invoke<PermissionStatus>("request_accessibility_permission");
  } catch (err) {
    console.error("[mohashim] request_accessibility_permission failed", err);
    return "denied";
  }
}

/**
 * Windows 마이크 권한 atomic을 disk 영속에서 복원한다 (재실행 시 reset된 atomic을
 * 복구). Rust 측에서 disk file write도 함께 처리하여 후속 부팅에서도 자동 복원되는
 * 단일 진실 소스를 보장한다. macOS / Linux는 OS API로 검증 가능하므로 no-op.
 */
export async function restoreMicInteracted(): Promise<PermissionStatus> {
  try {
    return await invoke<PermissionStatus>("restore_persisted_mic_interacted");
  } catch (err) {
    console.error("[mohashim] restoreMicInteracted failed", err);
    return "denied";
  }
}

export async function openPermissionSettings(
  kind: PermissionKind
): Promise<void> {
  try {
    await invoke("open_permission_settings", { kind });
  } catch (err) {
    console.error("[mohashim] open_permission_settings failed", err);
  }
}
