import { invoke } from "@tauri-apps/api/core";
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

/** Web Notification API → 모하심 PermissionStatus 매핑. */
async function getNotificationStatus(): Promise<PermissionStatus> {
  try {
    const granted = await notifIsGranted();
    if (granted) return "granted";
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
 * Phase 21: 알림 권한 요청. Tauri plugin은 web Notification API를 래핑하여
 * granted | denied | default을 반환. default(=취소/닫음)는 not_determined로 매핑.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
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
