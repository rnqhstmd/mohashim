//! Shop 9종 아이템 가격 테이블 + 슬롯 판별 (Phase 24 BR-1, BR-4, BR-9).
//!
//! Rust 단일 진위 — TS shopCatalog.ts는 UI 미러. 가격 검증은 Rust가 수행.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    Face,
    Head,
    Back,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CatalogEntry {
    pub price: u32,
    pub slot: Slot,
    pub name_ko: &'static str,
}

/// item_id → CatalogEntry 매핑 (BR-1, BR-9 hardcode 가격 테이블).
pub fn find(item_id: &str) -> Option<CatalogEntry> {
    match item_id {
        "face_round_glasses"  => Some(CatalogEntry { price: 15,  slot: Slot::Face, name_ko: "동글 안경" }),
        "face_heart_glasses"  => Some(CatalogEntry { price: 22,  slot: Slot::Face, name_ko: "불타는 눈빛" }),
        "face_square_horn"    => Some(CatalogEntry { price: 35,  slot: Slot::Face, name_ko: "멋쟁이 선글라스" }),
        "head_strawhat"       => Some(CatalogEntry { price: 40,  slot: Slot::Head, name_ko: "새싹 핀" }),
        "head_beret_red"      => Some(CatalogEntry { price: 55,  slot: Slot::Head, name_ko: "노란 안전모" }),
        "head_wizard_cone"    => Some(CatalogEntry { price: 70,  slot: Slot::Head, name_ko: "마법사 고깔" }),
        "back_blanket_check"  => Some(CatalogEntry { price: 80,  slot: Slot::Back, name_ko: "포근한 담요 망토" }),
        "back_cloak_navy"     => Some(CatalogEntry { price: 100, slot: Slot::Back, name_ko: "빨간 히어로 망토" }),
        "back_cloak_aura"     => Some(CatalogEntry { price: 120, slot: Slot::Back, name_ko: "반짝이는 오라" }),
        _ => None,
    }
}

/// 슬롯 접두사 판별 (BR-4). lookup 미사용 fast path — equip 시 사용.
pub fn slot_for_id(item_id: &str) -> Option<Slot> {
    if item_id.starts_with("face_") { Some(Slot::Face) }
    else if item_id.starts_with("head_") { Some(Slot::Head) }
    else if item_id.starts_with("back_") { Some(Slot::Back) }
    else { None }
}

/// "face" / "head" / "back" 문자열 → Slot. unequip_slot IPC 파라미터 검증용.
pub fn parse_slot(slot: &str) -> Option<Slot> {
    match slot {
        "face" => Some(Slot::Face),
        "head" => Some(Slot::Head),
        "back" => Some(Slot::Back),
        _ => None,
    }
}

/// Slot → "face"/"head"/"back" 문자열. inventory.equipped 슬롯 키 매핑용.
pub fn slot_str(slot: Slot) -> &'static str {
    match slot {
        Slot::Face => "face",
        Slot::Head => "head",
        Slot::Back => "back",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// AC-25: 9종 가격 매핑 BR-1 정합.
    #[test]
    fn catalog_9_items_correct_prices() {
        assert_eq!(find("face_round_glasses").unwrap().price, 15);
        assert_eq!(find("face_heart_glasses").unwrap().price, 22);
        assert_eq!(find("face_square_horn").unwrap().price, 35);
        assert_eq!(find("head_strawhat").unwrap().price, 40);
        assert_eq!(find("head_beret_red").unwrap().price, 55);
        assert_eq!(find("head_wizard_cone").unwrap().price, 70);
        assert_eq!(find("back_blanket_check").unwrap().price, 80);
        assert_eq!(find("back_cloak_navy").unwrap().price, 100);
        assert_eq!(find("back_cloak_aura").unwrap().price, 120);
    }

    #[test]
    fn catalog_9_items_correct_slots_and_names() {
        assert_eq!(find("face_round_glasses").unwrap().slot, Slot::Face);
        assert_eq!(find("face_round_glasses").unwrap().name_ko, "동글 안경");
        assert_eq!(find("head_strawhat").unwrap().slot, Slot::Head);
        assert_eq!(find("head_strawhat").unwrap().name_ko, "새싹 핀");
        assert_eq!(find("back_cloak_aura").unwrap().slot, Slot::Back);
        assert_eq!(find("back_cloak_aura").unwrap().name_ko, "반짝이는 오라");
    }

    /// AC-23 / BR-4: 슬롯 접두사 판별.
    #[test]
    fn slot_for_id_face_prefix() {
        assert_eq!(slot_for_id("face_round_glasses"), Some(Slot::Face));
        assert_eq!(slot_for_id("face_anything"), Some(Slot::Face));
    }

    #[test]
    fn slot_for_id_head_prefix() {
        assert_eq!(slot_for_id("head_strawhat"), Some(Slot::Head));
    }

    #[test]
    fn slot_for_id_back_prefix() {
        assert_eq!(slot_for_id("back_cloak_navy"), Some(Slot::Back));
    }

    #[test]
    fn slot_for_id_unknown_returns_none() {
        assert_eq!(slot_for_id("invalid_prefix"), None);
        assert_eq!(slot_for_id(""), None);
    }

    #[test]
    fn parse_slot_valid_strings() {
        assert_eq!(parse_slot("face"), Some(Slot::Face));
        assert_eq!(parse_slot("head"), Some(Slot::Head));
        assert_eq!(parse_slot("back"), Some(Slot::Back));
        assert_eq!(parse_slot("hand"), None);
        assert_eq!(parse_slot(""), None);
    }

    #[test]
    fn catalog_unknown_id_returns_none() {
        assert_eq!(find("unknown_id"), None);
        assert_eq!(find(""), None);
    }
}
