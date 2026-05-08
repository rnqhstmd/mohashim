//! Mailbox 알림 발화 + 보류 큐 (Phase 23, FR-6, FR-7, BR-4/5/7/8, P-M9).
//!
//! Focus 중 OS 알림 보류 큐. Phase 23에서는 dead code이지만 Phase 24+ 인프라로 도입.
//! drain 시맨틱: buffer 비움 + enabled=true이면 발송, false이면 발송 없이 비움.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::score::phase::Phase;
use crate::score::shared::current_phase;
use crate::storage::get_notifications_enabled;

/// 마지막 OS 알림 발화 시각 (Unix epoch ms). FR-8 minimal 딥링크 휴리스틱용.
///
/// `send_now` 성공 시 갱신, `install_notification_action_handler`의 윈도우 focus 핸들러에서
/// swap → 최근 N ms 이내이면 알림 클릭으로 추정하여 mailbox-deeplink emit.
/// 0이면 미발화 또는 이미 소비됨.
pub(crate) static LAST_NOTIF_AT_MS: AtomicU64 = AtomicU64::new(0);

/// 알림 발화 후 deeplink로 추정할 윈도우 focus 윈도우 (ms). Phase 23 휴리스틱.
pub(crate) const NOTIF_DEEPLINK_WINDOW_MS: u64 = 10_000;

/// mailbox read-mutate-write 직렬화 (Phase 23, MUST-2).
/// push(timer 컨텍스트)와 mark_all_read(IPC tokio 런타임) 동시 호출 race 차단.
pub(crate) static MAILBOX_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Focus 중 OS 알림 보류 큐 (Phase 23 P-M9, BR-5, BR-8).
///
/// **Phase 23 dead code 명시**: Phase 23에서 mailbox push는 on_complete_consumed에서만 발생하며,
/// 해당 호출은 store_phase(Idle) 이후로 보장된다. 따라서 Phase 23 정상 흐름에서
/// push_message 호출 시 phase는 항상 Idle → 보류 큐 분기 진입 없음.
/// Phase 24(구매 영수증 등 Focus 중 push 시나리오)부터 실제 활성화되는 인프라 코드.
///
/// in-memory — 앱 재시작 시 초기화 (BR-8).
pub(crate) static PENDING_NOTIFS: OnceLock<Mutex<Vec<(String, String)>>> = OnceLock::new();

/// `MAILBOX_MUTEX`를 획득한다. poison된 경우에도 inner guard를 복원하여 진행
/// (mailbox 손상보다 lock 영구 차단이 더 위험 — economy 패턴 동일).
pub(crate) fn lock_mailbox() -> MutexGuard<'static, ()> {
    let mutex = MAILBOX_MUTEX.get_or_init(|| Mutex::new(()));
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

/// `PENDING_NOTIFS` 보류 큐 lock 획득. poison 복원 동일.
fn lock_pending() -> MutexGuard<'static, Vec<(String, String)>> {
    let mutex = PENDING_NOTIFS.get_or_init(|| Mutex::new(Vec::new()));
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

/// content를 앞 60 char(UTF-8)으로 자르고 초과 시 "…" 부착 (BR-10).
pub fn truncate60(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= 60 {
        s.to_string()
    } else {
        chars[..60].iter().collect::<String>() + "…"
    }
}

/// OS 알림 발화 또는 보류 큐 적재 (Phase 23 FR-6, FR-7, BR-4, BR-5).
///
/// 호출 시점 phase 판정:
/// - Focus | Break → 보류 큐에 (title, body) 적재. 편지 저장은 호출 전에 이미 완료됨.
/// - 그 외(Idle 등) → notifications_enabled 게이트 후 즉시 발화.
///
/// **Phase 23 계약**: record_session_letter는 store_phase(Idle) + write_active_phase("idle")
/// 이후에 호출되므로 이 분기는 항상 즉시 발화 경로로 진입한다.
pub fn push_message<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    match current_phase() {
        Phase::Focus | Phase::Break => {
            let mut pending = lock_pending();
            pending.push((title.to_string(), body.to_string()));
        }
        _ => {
            if !get_notifications_enabled(app) {
                return;
            }
            send_now(app, title, body);
        }
    }
}

/// 보류 큐 배치 포맷 순수 함수 (BR-7).
///
/// - N=0: None
/// - N=1: 해당 편지 title/body 그대로
/// - N≥2: title="새 편지 {N}건", body="{첫 제목} 외 {N-1}건"
pub(crate) fn format_batch_notif(drained: &[(String, String)]) -> Option<(String, String)> {
    match drained.len() {
        0 => None,
        1 => Some((drained[0].0.clone(), drained[0].1.clone())),
        n => Some((
            format!("새 편지 {}건", n),
            format!("{} 외 {}건", drained[0].0, n - 1),
        )),
    }
}

/// 보류 큐 drain (Phase 23 FR-6, BR-6, BR-7).
///
/// **시맨틱 확정**: buffer 비움 + notifications_enabled=true이면 OS 알림 발송.
///                  notifications_enabled=false이면 발송 없이 buffer만 비움.
///
/// BR-7 배치 발송:
/// - N=0: no-op
/// - N=1: 해당 편지 title/body 그대로 발송
/// - N≥2: title="새 편지 {N}건", body="{첫 제목} 외 {N-1}건"
pub fn drain_pending_notifs<R: Runtime>(app: &AppHandle<R>) {
    let drained = std::mem::take(&mut *lock_pending());
    if drained.is_empty() {
        return;
    }
    if !get_notifications_enabled(app) {
        return;
    }
    if let Some((title, body)) = format_batch_notif(&drained) {
        send_now(app, &title, &body);
    }
}

/// OS 알림 즉시 발송. 실패 시 stderr 로그만 남기고 무시 (UX 비차단).
///
/// 성공 시 `LAST_NOTIF_AT_MS`에 현재 시각을 기록 — FR-8 minimal 딥링크 휴리스틱용
/// (알림 발화 직후 윈도우 focus 시 알림 클릭으로 추정).
fn send_now<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("[mohashim] mailbox notification failed: {e}");
        return;
    }
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    LAST_NOTIF_AT_MS.store(now_ms, Ordering::Release);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate60_short_string_unchanged() {
        let s = "짧은 문자열";
        assert_eq!(truncate60(s), s);
    }

    #[test]
    fn truncate60_long_string_truncated() {
        let s: String = "a".repeat(61);
        let out = truncate60(&s);
        let chars: Vec<char> = out.chars().collect();
        assert_eq!(chars.len(), 61);
        assert_eq!(chars[60], '…');
        assert!(chars[..60].iter().all(|c| *c == 'a'));
    }

    #[test]
    fn truncate60_korean_chars() {
        let s10 = "가".repeat(10);
        assert_eq!(truncate60(&s10), s10);

        let s61 = "가".repeat(61);
        let out = truncate60(&s61);
        let chars: Vec<char> = out.chars().collect();
        assert_eq!(chars.len(), 61);
        assert_eq!(chars[60], '…');
        assert!(chars[..60].iter().all(|c| *c == '가'));
    }

    #[test]
    fn drain_batch_format_single() {
        let drained = vec![("제목1".to_string(), "본문1".to_string())];
        let out = format_batch_notif(&drained);
        assert_eq!(out, Some(("제목1".to_string(), "본문1".to_string())));
    }

    #[test]
    fn drain_batch_format_multi() {
        let drained = vec![
            ("첫 제목".to_string(), "본문1".to_string()),
            ("두 번째".to_string(), "본문2".to_string()),
            ("세 번째".to_string(), "본문3".to_string()),
        ];
        let out = format_batch_notif(&drained);
        assert_eq!(
            out,
            Some(("새 편지 3건".to_string(), "첫 제목 외 2건".to_string()))
        );
    }

    #[test]
    fn drain_batch_format_empty() {
        let drained: Vec<(String, String)> = vec![];
        assert_eq!(format_batch_notif(&drained), None);
    }

    /// AC-25: 보류 큐 release — Focus 중 2건 적재 후 drain 시 배치 발송 포맷 검증.
    ///
    /// PENDING_NOTIFS에 직접 2건 적재(Focus 중 push_message가 enqueue하는 것과 동등) 후
    /// drain 시점의 std::mem::take + format_batch_notif 흐름을 검증한다. send_now는
    /// AppHandle 의존이 있어 본 테스트 범위 외 (포맷 검증만으로 AC 충족).
    #[test]
    fn ac25_pending_queue_two_items_drain_batch_format() {
        // 1) PENDING_NOTIFS lock 획득 + 2건 적재 (Focus 중 push_message 시뮬레이션).
        {
            let mutex = PENDING_NOTIFS.get_or_init(|| Mutex::new(Vec::new()));
            let mut buf = mutex.lock().unwrap_or_else(|p| p.into_inner());
            buf.clear(); // 다른 테스트와의 격리.
            buf.push(("첫 편지".to_string(), "본문1".to_string()));
            buf.push(("두 번째 편지".to_string(), "본문2".to_string()));
        }
        // 2) drain 시점의 std::mem::take 시뮬레이션.
        let drained = {
            let mutex = PENDING_NOTIFS.get_or_init(|| Mutex::new(Vec::new()));
            let mut buf = mutex.lock().unwrap_or_else(|p| p.into_inner());
            std::mem::take(&mut *buf)
        };
        // 3) drain 후 buffer는 비어있어야 한다 (drain 시맨틱).
        {
            let mutex = PENDING_NOTIFS.get_or_init(|| Mutex::new(Vec::new()));
            let buf = mutex.lock().unwrap_or_else(|p| p.into_inner());
            assert!(buf.is_empty(), "drain 후 buffer는 비어있어야 한다");
        }
        // 4) BR-7 배치 포맷 검증: N=2 → "새 편지 2건" / "첫 편지 외 1건".
        let formatted = format_batch_notif(&drained);
        assert_eq!(
            formatted,
            Some(("새 편지 2건".to_string(), "첫 편지 외 1건".to_string()))
        );
    }
}
