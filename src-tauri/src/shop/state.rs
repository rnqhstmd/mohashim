//! Inventory 상태 직렬화/폴백 + 순수 mutator (Phase 24 v2 FR-3, BR-3, BR-6).
//!
//! `inventory` 스토어 키의 read/write 단일 경로. 비객체 / 필드 타입 불일치 시 default 폴백.
//! Rust 단일 writer (P-D4) — TS는 storage.getInventory() read-only만 노출.

use serde::Serialize;
use serde_json::json;
use tauri::Runtime;
use tauri_plugin_store::Store;

use super::catalog::Slot;

/// inventory 키 직렬화 (Phase 22 FR-3 시드 호환).
///
/// JSON 키: `owned`, `equipped: { face, head, back }` (camelCase).
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InventoryState {
    pub owned: Vec<String>,
    pub equipped: EquippedSlots,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EquippedSlots {
    pub face: Option<String>,
    pub head: Option<String>,
    pub back: Option<String>,
}

impl Default for InventoryState {
    fn default() -> Self {
        Self {
            owned: Vec::new(),
            equipped: EquippedSlots {
                face: None,
                head: None,
                back: None,
            },
        }
    }
}

/// inventory 키 read + 폴백 정규화.
/// 키 부재 / 비객체 / 필드 타입 불일치 시 default 폴백. owned는 비배열 시 빈 vec, 비문자열 항목 skip.
pub fn read_inventory<R: Runtime>(store: &Store<R>) -> InventoryState {
    let raw = match store.get("inventory") {
        Some(v) => v,
        None => return InventoryState::default(),
    };
    let obj = match raw.as_object() {
        Some(o) => o,
        None => return InventoryState::default(),
    };
    let owned = obj
        .get("owned")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let equipped = obj
        .get("equipped")
        .and_then(|v| v.as_object())
        .map(|eq| {
            let pick = |k: &str| {
                eq.get(k)
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from)
            };
            EquippedSlots {
                face: pick("face"),
                head: pick("head"),
                back: pick("back"),
            }
        })
        .unwrap_or(EquippedSlots {
            face: None,
            head: None,
            back: None,
        });
    InventoryState { owned, equipped }
}

/// inventory 키 write. store.save()는 호출자가 단일 처리 (단일 save 정책).
pub fn write_inventory<R: Runtime>(store: &Store<R>, state: &InventoryState) {
    store.set("inventory", json!(state));
}

/// 구매 시 inventory.owned 갱신 — set 의미론 (Phase 24 FR-3, AC-6).
///
/// 이미 owned에 존재하는 item_id는 push 차단 → 중복 ID 누적 방지.
/// 신규 ID는 마지막에 push(순서 보존). 순수 함수 — store/AppHandle 무의존.
pub fn apply_purchase_owned(state: InventoryState, item_id: &str) -> InventoryState {
    let mut next = state;
    if !next.owned.iter().any(|id| id == item_id) {
        next.owned.push(item_id.to_string());
    }
    next
}

/// 장착 — 동일 슬롯 자동 교체 (Phase 24 BR-6, AC-8). 순수 함수.
///
/// owned 미포함 시 Err 반환. owned는 보존(중복 추가 없음).
pub fn apply_equip(
    state: InventoryState,
    item_id: &str,
    slot: Slot,
) -> Result<InventoryState, &'static str> {
    if !state.owned.iter().any(|id| id == item_id) {
        return Err("not_owned");
    }
    let mut next = state;
    let next_id = Some(item_id.to_string());
    match slot {
        Slot::Face => next.equipped.face = next_id,
        Slot::Head => next.equipped.head = next_id,
        Slot::Back => next.equipped.back = next_id,
    }
    Ok(next)
}

/// 장착 해제 — 슬롯 null 갱신 (Phase 24 FR-5, AC-9). 순수 함수.
pub fn apply_unequip(state: InventoryState, slot: Slot) -> InventoryState {
    let mut next = state;
    match slot {
        Slot::Face => next.equipped.face = None,
        Slot::Head => next.equipped.head = None,
        Slot::Back => next.equipped.back = None,
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_state(owned: Vec<&str>, face: Option<&str>) -> InventoryState {
        InventoryState {
            owned: owned.into_iter().map(String::from).collect(),
            equipped: EquippedSlots {
                face: face.map(String::from),
                head: None,
                back: None,
            },
        }
    }

    /// 빈 owned에 push → len=1.
    #[test]
    fn apply_purchase_owned_new_pushed() {
        let s = InventoryState::default();
        let next = apply_purchase_owned(s, "face_round_glasses");
        assert_eq!(next.owned.len(), 1);
        assert_eq!(next.owned[0], "face_round_glasses");
    }

    /// AC-6: 이미 보유한 ID 재구매 시 owned 무변경(set 의미론).
    #[test]
    fn apply_purchase_owned_duplicate_no_change() {
        let s = sample_state(vec!["face_round_glasses"], None);
        let next = apply_purchase_owned(s, "face_round_glasses");
        assert_eq!(next.owned.len(), 1);
        assert_eq!(next.owned[0], "face_round_glasses");
    }

    /// equipped 슬롯 보존.
    #[test]
    fn apply_purchase_owned_preserves_equipped() {
        let s = sample_state(vec!["face_round_glasses"], Some("face_round_glasses"));
        let next = apply_purchase_owned(s, "head_strawhat");
        assert_eq!(next.equipped.face.as_deref(), Some("face_round_glasses"));
        assert_eq!(next.owned.len(), 2);
    }

    /// AC-8 / BR-6: face 슬롯 A → B 교체.
    #[test]
    fn apply_equip_replaces_face() {
        let s = sample_state(
            vec!["face_round_glasses", "face_heart_glasses"],
            Some("face_round_glasses"),
        );
        let next = apply_equip(s, "face_heart_glasses", Slot::Face).expect("Ok");
        assert_eq!(next.equipped.face.as_deref(), Some("face_heart_glasses"));
        assert_eq!(next.owned.len(), 2, "owned 보존");
    }

    /// AC-11: owned 미포함 ID equip 시 Err.
    #[test]
    fn apply_equip_not_owned_returns_err() {
        let s = sample_state(vec!["face_round_glasses"], None);
        let result = apply_equip(s, "head_strawhat", Slot::Head);
        assert_eq!(result, Err("not_owned"));
    }

    /// AC-9: equipped.face=A → unequip(face) → null.
    #[test]
    fn apply_unequip_clears_slot() {
        let s = sample_state(vec!["face_round_glasses"], Some("face_round_glasses"));
        let next = apply_unequip(s, Slot::Face);
        assert!(next.equipped.face.is_none());
        assert_eq!(next.owned.len(), 1, "owned 보존");
    }

    /// equip 시 다른 슬롯 영향 없음.
    #[test]
    fn apply_equip_face_does_not_affect_head() {
        let s = sample_state(vec!["face_round_glasses"], None);
        let mut s = s;
        s.equipped.head = Some("head_strawhat".to_string());
        s.owned.push("head_strawhat".to_string());
        let next = apply_equip(s, "face_round_glasses", Slot::Face).expect("Ok");
        assert_eq!(next.equipped.face.as_deref(), Some("face_round_glasses"));
        assert_eq!(next.equipped.head.as_deref(), Some("head_strawhat"));
    }
}
