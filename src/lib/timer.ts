import { invoke } from "@tauri-apps/api/core";

/**
 * 포커스 세션을 시작한다 (Rust `focus_start` 커맨드).
 *
 * Rust 측에서 store의 focus_minutes를 읽어 atomic phase=Focus, time_left=min*60으로
 * 설정하고 active_phase 스토어 키를 "focus"로 기록한다 (단일 writer 정책).
 */
export async function focusStart(): Promise<void> {
  try {
    await invoke("focus_start");
  } catch (err) {
    console.error("[mohashim] focus_start failed", err);
  }
}

/**
 * 진행 중인 포커스/휴식 세션을 폐기한다 (Rust `discard_session` 커맨드).
 *
 * 현재 phase가 Focus|Break이 아니면 Rust 측에서 no-op 처리.
 * 실패 시 에러는 swallow한다 (permissions.ts 패턴 일관).
 */
export async function discardSession(): Promise<void> {
  try {
    await invoke("discard_session");
  } catch (err) {
    console.error("[mohashim] discard_session failed", err);
  }
}
