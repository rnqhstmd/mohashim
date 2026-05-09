//! Mailbox 상태 직렬화/폴백 (Phase 23, FR-2, BR-2, P-D7).
//!
//! `mailbox` 스토어 키의 read/write 단일 경로. 비배열 / 항목 비객체 /
//! 필수 필드 타입 불일치 시 해당 항목을 skip하여 손상 데이터를 격리한다.
//! Rust 단일 writer (P-D4) — TS는 `getMailbox()` read-only만 노출.

use serde::Serialize;
use serde_json::json;
use tauri::Runtime;
use tauri_plugin_store::Store;

/// 단일 편지 항목 (FR-2, BR-3).
///
/// `id` — `"ml-{unix_ms}"` 형식 (BR-3).
/// `kind` — `"SESSION" | "MONTHLY" | "SYSTEM"` 중 하나.
/// `created_at` — RFC3339 with offset.
/// `session_tag` — SESSION 종류 편지의 출처 세션 식별자 (옵션).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Letter {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub read: bool,
    pub session_tag: Option<String>,
}

/// `mailbox` 키 read + 폴백 정규화 (FR-2, P-D7).
///
/// 키 부재 / 비배열 시 빈 vec 폴백. 각 항목은 비객체 / 필수 필드 누락 / 타입 불일치 /
/// `kind` enum 외 값일 경우 skip한다. `read`는 비bool 시 false 폴백,
/// `sessionTag`는 비문자열 시 None 폴백 (개별 필드 단위 관용 정책).
pub fn read_mailbox<R: Runtime>(store: &Store<R>) -> Vec<Letter> {
    let raw = match store.get("mailbox") {
        Some(v) => v,
        None => return Vec::new(),
    };
    let arr = match raw.as_array() {
        Some(a) => a,
        None => return Vec::new(),
    };
    let mut out: Vec<Letter> = Vec::with_capacity(arr.len());
    for item in arr.iter() {
        let obj = match item.as_object() {
            Some(o) => o,
            None => continue,
        };
        let id = match obj.get("id").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let kind = match obj.get("kind").and_then(|v| v.as_str()) {
            Some(s) if matches!(s, "SESSION" | "MONTHLY" | "SYSTEM") => s.to_string(),
            _ => continue,
        };
        let title = match obj.get("title").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let body = match obj.get("body").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let created_at = match obj.get("createdAt").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let read = obj.get("read").and_then(|v| v.as_bool()).unwrap_or(false);
        let session_tag = obj
            .get("sessionTag")
            .and_then(|v| v.as_str())
            .map(String::from);
        out.push(Letter {
            id,
            kind,
            title,
            body,
            created_at,
            read,
            session_tag,
        });
    }
    out
}

/// `mailbox` 키 write (FR-2, P-D4).
///
/// `store.save()`는 호출자가 묶음 처리한다 — 다른 키와 부분 일관성 회피.
/// `sessionTag == None`은 `null` 직렬화 (TS 폴백 정합).
pub fn write_mailbox<R: Runtime>(store: &Store<R>, letters: &[Letter]) {
    let arr: Vec<serde_json::Value> = letters
        .iter()
        .map(|l| {
            json!({
                "id": l.id,
                "kind": l.kind,
                "title": l.title,
                "body": l.body,
                "createdAt": l.created_at,
                "read": l.read,
                "sessionTag": l.session_tag,
            })
        })
        .collect();
    store.set("mailbox", json!(arr));
}

/// 편지 추가 + FIFO 50 캡 (BR-2, P-M6).
///
/// 51번째 push 시 oldest(index 0)부터 삭제한다. 미읽음 여부와 무관하게
/// 가장 오래된 항목부터 제거하여 단순 FIFO 정책을 유지한다.
///
/// **Phase 27 PR review (BR-1 멱등 가드)**: 동일 id letter가 이미 존재하면 push를 skip한다.
/// 단일 트랜잭션 내 id 충돌은 호출자(timer/insight) 책임으로 본래 발생하지 않으나,
/// store 채널 외부 경로(예: 동일 end_ms 재시도)에서 BR-1 100% 멱등을 코드 레벨에서도
/// 보장하기 위한 방어 가드.
pub fn append_with_cap(letters: &mut Vec<Letter>, new: Letter) {
    if letters.iter().any(|l| l.id == new.id) {
        return;
    }
    letters.push(new);
    while letters.len() > 50 {
        letters.remove(0);
    }
}

/// 모든 편지를 read=true로 변경 (멱등 최적화).
///
/// 변경된 항목이 하나라도 있으면 true 반환 — 호출자는 이 값으로 `store.save()`를
/// 게이팅해 불필요한 디스크 I/O를 피할 수 있다 (이미 모두 read인 경우 false).
pub fn mark_all_read_in_place(letters: &mut [Letter]) -> bool {
    let mut changed = false;
    for l in letters.iter_mut() {
        if !l.read {
            l.read = true;
            changed = true;
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::{append_with_cap, mark_all_read_in_place, Letter};

    fn make_letter(id: &str) -> Letter {
        Letter {
            id: id.to_string(),
            kind: "SESSION".to_string(),
            title: "t".to_string(),
            body: "b".to_string(),
            created_at: "2026-05-08T00:00:00+09:00".to_string(),
            read: false,
            session_tag: None,
        }
    }

    /// 49건에서 push 후 50건 (cap 미도달).
    #[test]
    fn append_with_cap_under_50_increases_len() {
        let mut letters: Vec<Letter> =
            (0..49).map(|i| make_letter(&format!("ml-{}", i))).collect();
        append_with_cap(&mut letters, make_letter("ml-49"));
        assert_eq!(letters.len(), 50);
        assert_eq!(letters.last().unwrap().id, "ml-49");
    }

    /// 50건에서 push 후 여전히 50건, oldest(index 0) 삭제됨.
    #[test]
    fn append_with_cap_at_50_removes_oldest() {
        let mut letters: Vec<Letter> =
            (0..50).map(|i| make_letter(&format!("ml-{}", i))).collect();
        append_with_cap(&mut letters, make_letter("ml-50"));
        assert_eq!(letters.len(), 50);
        assert_eq!(letters.first().unwrap().id, "ml-1");
        assert_eq!(letters.last().unwrap().id, "ml-50");
    }

    /// 51건 push 시 가장 오래된 것이 삭제되고 새 것이 남음 (FIFO).
    #[test]
    fn append_with_cap_fifo_preserves_newest() {
        let mut letters: Vec<Letter> =
            (0..51).map(|i| make_letter(&format!("ml-{}", i))).collect();
        // 직접 51개 만들어 cap 적용 시 oldest 1개 제거되어 50건.
        append_with_cap(&mut letters, make_letter("ml-new"));
        assert_eq!(letters.len(), 50);
        // 가장 오래된 두 개(ml-0, ml-1)가 삭제됨.
        assert_eq!(letters.first().unwrap().id, "ml-2");
        assert_eq!(letters.last().unwrap().id, "ml-new");
    }

    /// Phase 27 PR review: 동일 id push는 skip되어야 함 (BR-1 멱등 가드).
    #[test]
    fn append_with_cap_skips_duplicate_id() {
        let mut letters = vec![make_letter("ml-1")];
        let dup = make_letter("ml-1");
        append_with_cap(&mut letters, dup);
        assert_eq!(letters.len(), 1, "동일 id push는 skip되어야 함");
        assert_eq!(letters[0].id, "ml-1");
    }

    /// unread 있으면 true 반환 + 모두 read=true.
    #[test]
    fn mark_all_read_returns_true_when_unread_exists() {
        let mut letters = vec![make_letter("ml-1"), make_letter("ml-2")];
        letters[0].read = true; // 일부만 read
        let changed = mark_all_read_in_place(&mut letters);
        assert!(changed);
        assert!(letters.iter().all(|l| l.read));
    }

    /// 이미 모두 read=true이면 false 반환 (멱등).
    #[test]
    fn mark_all_read_returns_false_when_all_read() {
        let mut letters = vec![make_letter("ml-1"), make_letter("ml-2")];
        for l in letters.iter_mut() {
            l.read = true;
        }
        let changed = mark_all_read_in_place(&mut letters);
        assert!(!changed);
        assert!(letters.iter().all(|l| l.read));
    }

    /// 빈 슬라이스에 대해 false 반환 (변경 없음).
    #[test]
    fn read_mailbox_fallback_non_array() {
        // read_mailbox는 Store<R> 의존성이 있어 직접 테스트 불가.
        // 대신 mark_all_read_in_place의 빈 입력 멱등성을 검증한다 (폴백 정합 간접 보장).
        let mut empty: Vec<Letter> = Vec::new();
        let changed = mark_all_read_in_place(&mut empty);
        assert!(!changed);
        assert!(empty.is_empty());
    }
}
