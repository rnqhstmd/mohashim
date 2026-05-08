/**
 * Mailbox IPC wrappers + event listen helpers (Phase 23, FR-9~14).
 *
 * Rust 단일 writer (P-D4) — write는 IPC 경유, read는 get_mailbox IPC 또는 storage.getMailbox().
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 설계서 정합 (FR-15): 편지함 read API + 도메인 타입을 본 모듈에서 일괄 노출.
// 실제 IPC 호출 + 폴백 정규화는 storage.getMailbox에 위치하며, 본 모듈은 도메인 도구를 한곳에 모은다.
export { getMailbox } from "./storage";
export type { Letter, Mailbox, MailboxKind } from "./storage";

/** 편지함 전체 읽음 처리 (FR-9, AC-7 멱등). */
export async function markAllRead(): Promise<void> {
  await invoke("mark_all_mailbox_read");
}

/** 개별 편지 읽음 처리 (FR-9 파생). */
export async function markLetterRead(id: string): Promise<void> {
  await invoke("mark_mailbox_letter_read", { id });
}

/**
 * mailbox-updated 이벤트 구독 (FR-14).
 *
 * Rust record_session_letter 완료 시 emit된다. 반환값은 unlisten 함수.
 * useEffect cleanup에서 호출하여 리스너 누수를 방지한다.
 */
export function onMailboxUpdated(cb: () => void): Promise<() => void> {
  return listen("mailbox-updated", cb);
}

/**
 * mailbox-deeplink 이벤트 구독 (FR-8).
 *
 * OS 알림 클릭 시 Rust가 emit한다. letter_id가 있으면 해당 편지 상세로 이동한다.
 * Phase 23 MVP: letter_id는 항상 null (Phase 24에서 deeplink 심화 구현 예정).
 */
export function onMailboxDeeplink(
  cb: (letterId: string | null) => void
): Promise<() => void> {
  return listen<{ letter_id?: string }>("mailbox-deeplink", (event) => {
    cb(event.payload?.letter_id ?? null);
  });
}
