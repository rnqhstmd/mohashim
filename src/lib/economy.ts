/**
 * Economy 이벤트 listen helper (Phase 26 FR-22, AC-14).
 *
 * Rust 단일 writer (P-D4) — write는 IPC 경유, read는 storage.getEconomy() read-only.
 * 본 모듈은 economy-updated 이벤트 구독만 노출 (mailbox.ts / shop.ts 패턴 정합).
 */
import { listen } from "@tauri-apps/api/event";

/**
 * economy-updated 이벤트 구독 (Phase 26 FR-22, AC-14).
 *
 * Rust economy/timer/shop이 잔액 변경 후 emit한다.
 * 본 이벤트 수신 시 storage.getEconomy() 재조회 권장.
 *
 * 반환값은 unlisten 함수. useEffect cleanup에서 호출하여 리스너 누수를 방지한다.
 */
export function onEconomyUpdated(cb: () => void): Promise<() => void> {
  return listen("economy-updated", cb);
}
