/**
 * Shop IPC wrappers + event listen helpers (Phase 24, FR-1, FR-4, FR-5, FR-6, FR-8).
 *
 * Rust 단일 writer (P-D4) — write는 IPC 경유, read는 get_inventory IPC 또는 storage.getInventory().
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Inventory } from "./storage";

// 설계서 정합 (FR-15 정합 패턴): shop 도메인 read API + 카탈로그 타입을 본 모듈에서 일괄 노출.
// 실제 IPC 호출 + 폴백 정규화는 storage.getInventory에 위치하며, 본 모듈은 도메인 도구 통합.
export { getInventory } from "./storage";
export { CATALOG, findItem, itemsBySlot } from "./shopCatalog";
export type { ShopItem, Slot } from "./shopCatalog";

/**
 * 아이템 구매 (FR-1, FR-2, FR-3, FR-7, FR-21).
 *
 * Rust shop::purchase_item 호출 — SHOP_MUTEX 안에서 잔액 검증 + 차감 + inventory.owned 갱신
 * + 영수증 편지 push + mailbox-updated/inventory-updated emit을 단일 트랜잭션으로 수행.
 *
 * 잔액 부족 시 `Err("insufficient_sprouts:{부족분}")` 반환.
 */
export async function purchaseItem(itemId: string): Promise<void> {
  await invoke("purchase_item", { itemId });
}

/**
 * 아이템 장착 (FR-4, BR-6, AC-7, AC-8).
 *
 * 슬롯 자동 판별(접두사) + 동일 슬롯 즉시 교체. owned 미포함 시 `Err("not_owned:{id}")`.
 */
export async function equipItem(itemId: string): Promise<void> {
  await invoke("equip_item", { itemId });
}

/**
 * 슬롯 장착 해제 (FR-5, AC-9).
 *
 * `slot` ∈ `"face" | "head" | "back"`. 그 외 값 시 `Err("unknown_slot:{slot}")`.
 */
export async function unequipSlot(slot: "face" | "head" | "back"): Promise<void> {
  await invoke("unequip_slot", { slot });
}

/**
 * inventory-updated 이벤트 구독 (FR-6, AC-10).
 *
 * Rust shop의 purchase_item / equip_item / unequip_slot 완료 시 emit된다. 반환값은 unlisten 함수.
 * useEffect cleanup에서 호출하여 리스너 누수를 방지한다.
 *
 * 본 이벤트 수신 시 inventory + economy 모두 재조회 권장 (purchase는 economy도 변경).
 */
export function onInventoryUpdated(cb: () => void): Promise<() => void> {
  return listen("inventory-updated", cb);
}

/**
 * 잔액 부족 부족분 파싱 헬퍼 (FR-13 잔액 부족 카드 툴팁).
 *
 * Rust `purchase_item` 실패 시 `"insufficient_sprouts:{부족분}"` 형식의 에러 문자열을 반환.
 * 본 헬퍼는 이 문자열에서 부족분을 파싱하여 number 또는 null 반환.
 */
export function parseInsufficientSprouts(error: unknown): number | null {
  if (typeof error !== "string") {
    if (error && typeof error === "object" && "message" in error) {
      return parseInsufficientSprouts((error as { message: unknown }).message);
    }
    return null;
  }
  const match = error.match(/^insufficient_sprouts:(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 사용자에게 표시할 아이템 상태 (FR-13, FR-17).
 *
 * - available: 잔액 충분, 미보유 — 구매 가능.
 * - insufficient: 잔액 부족, 미보유 — 회색 비활성 + 툴팁.
 * - owned: 보유, 미장착 — 인벤토리 토글에서 "장착" 버튼.
 * - equipped: 보유, 장착 중 — 인벤토리 토글에서 "해제" 버튼.
 */
export type ShopItemState = "available" | "insufficient" | "owned" | "equipped";

/**
 * 아이템의 현재 상태 판정 (FR-13, FR-17).
 */
export function computeItemState(
  itemId: string,
  itemPrice: number,
  inventory: Inventory,
  sprouts: number
): ShopItemState {
  // 접두사 명시 검증 — Rust slot_for_id와 정합 (review Info 반영).
  // 알 수 없는 접두사는 장착/보유 분기를 건너뛰고 잔액 기반으로만 판정.
  const slot: "face" | "head" | "back" | null = itemId.startsWith("face_")
    ? "face"
    : itemId.startsWith("head_")
      ? "head"
      : itemId.startsWith("back_")
        ? "back"
        : null;
  if (slot !== null) {
    const equippedId = inventory.equipped[slot];
    if (equippedId === itemId) return "equipped";
    if (inventory.owned.includes(itemId)) return "owned";
  }
  if (sprouts >= itemPrice) return "available";
  return "insufficient";
}
