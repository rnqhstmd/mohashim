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
    // Windows TOFU: 사용자가 토글을 눌러 OS 알림 설정 페이지를 한 번 거친 적이
    // 있으면 granted로 간주. 사용자가 OS에서 실제로 끈 경우는 검출 불가 — 단,
    // 그 경우엔 OS Toast 자체가 표시되지 않아 fail-silent가 됨.
    if (isWindows() && localStorage.getItem(NOTIF_INTERACTED_KEY) === "1") {
      return "granted";
    }
    // Web Notification API는 정확한 거절/미정 분리를 노출하지 않는다. 첫 부팅에서는
    // not_determined로 가정해도 사용자에게 권한 요청 버튼이 노출되며, 실제로 거절된
    // 상태였다면 다이얼로그가 즉시 닫혀 동일 결과로 수렴.
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
    return { ...rust, notification };
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
    return await invoke<PermissionStatus>("request_microphone_permission");
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

export async function openPermissionSettings(
  kind: PermissionKind
): Promise<void> {
  try {
    await invoke("open_permission_settings", { kind });
  } catch (err) {
    console.error("[mohashim] open_permission_settings failed", err);
  }
}
