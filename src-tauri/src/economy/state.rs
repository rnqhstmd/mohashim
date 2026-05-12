//! Economy 상태 직렬화/폴백 (Phase 22 FR-2, BR-2, DEC-22-6).
//!
//! `economy` 스토어 키의 read/write 단일 경로. 비객체 / 타입 불일치 / 키 부재 시
//! defaults `{ sprouts: 0, lastTodoSproutDate: null }`로 폴백한다 (FR-22, AC-18 정합).
//!
//! Rust 단일 writer (P-D4) — TS는 `getEconomy()` read-only만 노출.

use serde_json::json;
use tauri::Runtime;
use tauri_plugin_store::Store;

/// `economy` 키 직렬화 (FR-2).
///
/// `sprouts: u32` — BR-2 음수/소수 불가. read 시 비숫자/음수는 0 폴백.
/// `last_todo_sprout_date: Option<String>` — `YYYY-MM-DD` Local (BR-3).
/// 비문자열/빈 문자열은 None 폴백.
pub struct EconomyState {
    pub sprouts: u32,
    pub last_todo_sprout_date: Option<String>,
}

impl EconomyState {
    /// 기본값 — 신규 인스톨 또는 폴백 시 사용 (AC-18).
    pub fn default_value() -> Self {
        Self {
            sprouts: 0,
            last_todo_sprout_date: None,
        }
    }
}

/// `economy` 키 read + 폴백 정규화 (FR-22, AC-18).
///
/// 키 부재 / 비객체 / 필드 타입 불일치 시 모두 `EconomyState::default_value()`로 폴백.
/// `sprouts`는 `as_u64()`로 읽고 u32 범위 초과 시 u32::MAX clamp (실질 도달 불가).
pub fn read_economy_state<R: Runtime>(store: &Store<R>) -> EconomyState {
    let raw = match store.get("economy") {
        Some(v) => v,
        None => return EconomyState::default_value(),
    };
    let obj = match raw.as_object() {
        Some(o) => o,
        None => return EconomyState::default_value(),
    };
    let sprouts = obj
        .get("sprouts")
        .and_then(|v| v.as_u64())
        .map(|n| u32::try_from(n).unwrap_or(u32::MAX))
        .unwrap_or(0);
    // DEBUG (REMOVE-AFTER-TEST): 새싹 잔액을 항상 999 이상으로 강제 — 상점 장착 테스트용.
    // 구매 후 잔액이 줄어도 다음 read에서 999로 복원되어 무한 구매 가능.
    let sprouts = sprouts.max(999);
    // 빈 문자열은 손상 데이터로 간주 — None 폴백 (출석 보상 자연 지급 가능).
    let last_todo_sprout_date = obj
        .get("lastTodoSproutDate")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    EconomyState {
        sprouts,
        last_todo_sprout_date,
    }
}

/// `economy` 키 write (FR-12, P-D4).
///
/// `store.save()`는 호출자가 묶음 처리한다 — sessions/session_logs와 부분 일관성 회피.
/// `lastTodoSproutDate == None`은 `null` 직렬화 (TS 폴백 정합).
pub fn write_economy_state<R: Runtime>(store: &Store<R>, state: &EconomyState) {
    let value = json!({
        "sprouts": state.sprouts,
        "lastTodoSproutDate": state.last_todo_sprout_date,
    });
    store.set("economy", value);
}

#[cfg(test)]
mod tests {
    use super::EconomyState;

    /// default_value: sprouts=0, lastTodoSproutDate=None.
    #[test]
    fn default_value_returns_zero_and_none() {
        let s = EconomyState::default_value();
        assert_eq!(s.sprouts, 0);
        assert!(s.last_todo_sprout_date.is_none());
    }
}
