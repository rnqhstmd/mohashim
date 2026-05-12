import { findItem, type ShopItem, type Slot } from "../../lib/shopCatalog";
import type { Inventory } from "../../lib/storage";
import type { PotatoState } from "../../lib/phrases";
import { Potato } from "../Potato";

/**
 * 캐릭터 레이어 컴포넌트 (Phase 25 FR-1, BR-1, BR-2, BR-3).
 *
 * Z-index 순서: potato(z-10) → back(z-15, 목도리는 캐릭터 위에 두름) → head(z-20) → face(z-30).
 * `previewItem`이 있으면 동일 슬롯의 equipped를 시각적으로 대체한다 (FR-7).
 * 미장착 슬롯은 <img>를 렌더하지 않는다 (FR-8).
 *
 * 메인 카드(FocusStartButton/PomodoroCard)와 상점 미리보기(ShopTab.PreviewArea) 양쪽에서 사용.
 */

type ItemOverlayProps = {
  /** 장착 상태. 모든 슬롯은 string|null. */
  equipped: Inventory["equipped"];
  /** 상점 미리보기 한정. 동일 슬롯 equipped를 시각적으로 대체 (FR-7). */
  previewItem?: ShopItem | null;
  /** Potato 표정. 미전달 시 'calm'. */
  state?: PotatoState;
  /** 컨테이너 한 변 px. Potato size에도 동일 값 전달. */
  size: number;
  /** Potato animated 그대로 전달 (BR-3). 미전달 시 false. */
  animated?: boolean;
};

function resolveSlot(
  slot: Slot,
  equippedId: string | null,
  previewItem: ShopItem | null | undefined,
): string | null {
  if (previewItem && previewItem.slot === slot) return previewItem.svgPath;
  if (equippedId) {
    const item = findItem(equippedId);
    return item?.svgPath ?? null;
  }
  return null;
}

export function ItemOverlay({
  equipped,
  previewItem,
  state = "calm",
  size,
  animated = false,
}: ItemOverlayProps) {
  const backSvg = resolveSlot("back", equipped.back, previewItem);
  const headSvg = resolveSlot("head", equipped.head, previewItem);
  const faceSvg = resolveSlot("face", equipped.face, previewItem);
  // animated=true일 때 Potato와 동일한 mh-bob 애니메이션을 아이템 레이어에도 적용 →
  // 캐릭터만 떠다니고 모자/안경/목도리는 멈춰있는 분리 회귀 차단.
  // 부모 wrapper에 animate-mh-bob을 걸어 모든 자식이 동일 transform 받도록 한다.
  const wrapperAnim = animated ? "animate-mh-bob" : "";
  return (
    <div
      className={`relative ${wrapperAnim}`}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        {/* Potato 자체는 부모가 이미 animate하므로 내부 animation 비활성화. */}
        <Potato state={state} size={size} animated={false} />
      </div>
      {/* 목도리(back 슬롯)는 캐릭터의 목·어깨를 두르므로 캐릭터 본체 위에 배치 (z-15) */}
      {backSvg && (
        <img src={backSvg} alt="" className="absolute inset-0 z-[15] h-full w-full" />
      )}
      {headSvg && (
        <img src={headSvg} alt="" className="absolute inset-0 z-20 h-full w-full" />
      )}
      {faceSvg && (
        <img src={faceSvg} alt="" className="absolute inset-0 z-30 h-full w-full" />
      )}
    </div>
  );
}
