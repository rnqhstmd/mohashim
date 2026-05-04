import { invoke } from "@tauri-apps/api/core";

export type PermissionStatus = "granted" | "denied" | "not_determined";
export type PermissionKind = "microphone" | "accessibility";
export type PermissionState = {
  mic: PermissionStatus;
  accessibility: PermissionStatus;
};

export function canEnterMain(p: PermissionState): boolean {
  return p.mic === "granted" && p.accessibility === "granted";
}

export async function getPermissionStatus(): Promise<PermissionState> {
  try {
    return await invoke<PermissionState>("permission_status");
  } catch (err) {
    console.error("[mohashim] permission_status failed", err);
    return { mic: "denied", accessibility: "denied" };
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
