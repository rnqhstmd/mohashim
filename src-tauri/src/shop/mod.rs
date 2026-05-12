//! Shop 도메인 — 구매 / 장착 / 해제 / 인벤토리 조회 IPC (Phase 24 v2).
//!
//! SHOP_MUTEX > ECONOMY_MUTEX > MAILBOX_MUTEX > PENDING_NOTIFS lock 순서 (단방향, deadlock 불가).
//! Rust 단일 writer (P-D4): inventory 키 write 진입점은 본 모듈만.

pub mod catalog;
pub mod state;

use std::sync::{Mutex, MutexGuard, OnceLock};

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_store::StoreExt;

use crate::mailbox::state::Letter;
use crate::storage::STORE_FILE;
use catalog::{find, parse_slot, slot_for_id, CatalogEntry};
use state::{
    apply_equip, apply_purchase_owned, apply_unequip, read_inventory, write_inventory,
    InventoryState,
};

/// shop 도메인 read-mutate-write 직렬화 (Phase 24 MUST-2).
/// purchase / equip / unequip / get_inventory 모든 IPC가 단일 writer로 직렬 처리.
pub(crate) static SHOP_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// SHOP_MUTEX를 획득한다. poison 시 inner guard 복원 (economy/mailbox 동일 패턴).
pub(crate) fn lock_shop() -> MutexGuard<'static, ()> {
    SHOP_MUTEX
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|p| p.into_inner())
}

/// 영수증 편지 본문 포맷 (Phase 24 FR-21).
///
/// receipt id는 `receipt-{unix_ms}-{nanos}` 포맷 — SHOP_MUTEX 직렬화로 동시성 충돌은 차단되나
/// 동일 ms 내 연속 구매 시 id 중복 방지 위해 nanosecond 보조 (review MEDIUM 반영).
fn build_receipt_letter(item: &CatalogEntry, balance_after: u32) -> Letter {
    use chrono::Local;
    let now = Local::now();
    let id = format!(
        "receipt-{}-{}",
        now.timestamp_millis().max(0) as u64,
        now.timestamp_subsec_nanos()
    );
    let title = format!("{} 구매 완료!", item.name_ko);
    let body = format!(
        "새싹 [{}개]를 사용했고, 잔액은 [{}개]야.\n상점에서 [내 아이템]을 체크하면 장착할 수 있어. 모하의 새 모습 보러 가자!",
        item.price, balance_after
    );
    Letter {
        id,
        kind: "SYSTEM".to_string(),
        title,
        body,
        created_at: now.to_rfc3339(),
        read: false,
        session_tag: None,
    }
}

/// 구매 IPC (FR-1, FR-2, FR-3, FR-7).
///
/// 흐름: SHOP_MUTEX → catalog::find → economy::try_charge → inventory.owned 갱신 + save →
///       mailbox::append_letter_and_emit (영수증) → inventory-updated emit.
///
/// store.save는 본 함수에서 단 1회 — economy + inventory를 묶음 save하여 부분 일관성 회피.
/// mailbox는 append_letter_and_emit 내부에서 별도 save (별 키이므로 무관).
#[tauri::command]
pub async fn purchase_item<R: Runtime>(
    app: AppHandle<R>,
    item_id: String,
) -> Result<(), String> {
    let _guard = lock_shop();

    // 1) 카탈로그 조회 (BR-9 Rust 내부 가격 테이블).
    let item = find(&item_id).ok_or_else(|| format!("unknown_item:{item_id}"))?;

    // 2) store 열기 (보유 검증 + inventory 갱신 공용).
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store_error:{e}"))?;

    // 3) 이미 보유 중이면 차감 없이 차단 (PR review HIGH 반영, FR-3 정책 변경).
    //    UI에서 보유 카드는 "장착"/"해제" 버튼만 노출되어 정상 흐름은 도달 불가하지만,
    //    IPC 직접 호출 방어 + 사용자 의도 보호(이미 보유한 아이템에 새싹 재차감 차단).
    let inv = read_inventory(&store);
    if inv.owned.contains(&item_id) {
        return Err(format!("already_owned:{item_id}"));
    }

    // 4) 잔액 차감 (lock 캡슐화 — economy::try_charge). 에러 문자열 그대로 전파:
    //    - "insufficient_sprouts:{부족분}" → TS UI에서 부족분 툴팁 표시.
    //    - "store_error:{원인}" → 잔액 부족과 분리된 store 오류 의미론.
    let new_balance = crate::economy::try_charge(&app, item.price)?;
    crate::logger::write(crate::logger::LogEvent::SproutSpent {
        item_id: item_id.clone(),
        amount: item.price,
        balance_after: new_balance,
    });

    // 5) inventory.owned 갱신 + save (economy + inventory 단일 save 묶음).
    let next_inv = apply_purchase_owned(inv, &item_id);
    write_inventory(&store, &next_inv);
    store
        .save()
        .map_err(|e| format!("store_error:{e}"))?;

    // 6) 영수증 편지 push (push_message 내장 phase 분기로 자연 라우팅).
    let letter = build_receipt_letter(&item, new_balance);
    crate::mailbox::append_letter_and_emit(&app, letter);

    // 7) inventory-updated emit (FR-6).
    if let Err(e) = app.emit("inventory-updated", ()) {
        eprintln!("[mohashim] inventory-updated emit failed: {e}");
    }
    // 8) Phase 26 FR-22 / AC-14: 구매로 economy.sprouts 차감 후 메인 카드 잔액 갱신 알림.
    if let Err(e) = app.emit("economy-updated", ()) {
        eprintln!("[mohashim] economy-updated emit failed: {e}");
    }

    Ok(())
}

/// 장착 IPC (FR-4, BR-6, AC-7, AC-8, AC-11).
///
/// owned 검증 후 동일 슬롯 자동 교체. inventory-updated emit.
#[tauri::command]
pub async fn equip_item<R: Runtime>(
    app: AppHandle<R>,
    item_id: String,
) -> Result<(), String> {
    let _guard = lock_shop();

    let slot = slot_for_id(&item_id)
        .ok_or_else(|| format!("unknown_item_prefix:{item_id}"))?;

    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let inv = read_inventory(&store);
    let next_inv = apply_equip(inv, &item_id, slot)
        .map_err(|e| format!("{e}:{item_id}"))?;
    write_inventory(&store, &next_inv);
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;

    if let Err(e) = app.emit("inventory-updated", ()) {
        eprintln!("[mohashim] inventory-updated emit failed: {e}");
    }
    Ok(())
}

/// 장착 해제 IPC (FR-5, FR-6, AC-9).
#[tauri::command]
pub async fn unequip_slot<R: Runtime>(
    app: AppHandle<R>,
    slot: String,
) -> Result<(), String> {
    let _guard = lock_shop();

    let parsed = parse_slot(&slot).ok_or_else(|| format!("unknown_slot:{slot}"))?;

    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let inv = read_inventory(&store);
    let next_inv = apply_unequip(inv, parsed);
    write_inventory(&store, &next_inv);
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;

    if let Err(e) = app.emit("inventory-updated", ()) {
        eprintln!("[mohashim] inventory-updated emit failed: {e}");
    }
    Ok(())
}

/// 인벤토리 조회 IPC (FR-8). TS read-only 헬퍼 보조.
///
/// SHOP_MUTEX를 획득하여 write 진행 중 torn read 차단 (review HIGH 반영, 설계서 정합).
#[tauri::command]
pub async fn get_inventory<R: Runtime>(app: AppHandle<R>) -> Result<InventoryState, String> {
    let _guard = lock_shop();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    Ok(read_inventory(&store))
}
