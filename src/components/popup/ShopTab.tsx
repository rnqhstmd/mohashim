/**
 * Shop 탭 풀스크린 (Phase 24 FR-9~17, FR-21).
 *
 * 미리보기 + 영역 탭(face/head/back) + 카드 그리드 + 구매 확인 모달의 단일 컴포넌트.
 * 하위 PreviewArea / SlotTabs / ItemCard / ConfirmModal은 인라인 처리 (과잉 분해 회피).
 *
 * Phase 25에서 PreviewArea가 ItemOverlay 컴포넌트로 추출 예정 — 현재는 단순 absolute Z-index.
 */
import { useEffect, useState } from "react";
import { Potato } from "../Potato";
import {
  CATALOG,
  computeItemState,
  equipItem,
  itemsBySlot,
  onInventoryUpdated,
  parseInsufficientSprouts,
  purchaseItem,
  unequipSlot,
  type ShopItem,
  type Slot,
} from "../../lib/shop";
import { getEconomy, getInventory, type Economy, type Inventory } from "../../lib/storage";

const SLOT_TABS: ReadonlyArray<{ id: Slot; label: string }> = [
  { id: "face", label: "얼굴" },
  { id: "head", label: "머리" },
  { id: "back", label: "등" },
];

const DEFAULT_INVENTORY: Inventory = {
  owned: [],
  equipped: { face: null, head: null, back: null },
};

const DEFAULT_ECONOMY: Economy = {
  sprouts: 0,
  lastTodoSproutDate: null,
};

// =====================================================================
// 미리보기 영역
// =====================================================================

type PreviewProps = {
  equipped: Inventory["equipped"];
  previewItem: ShopItem | null;
  sprouts: number;
};

/**
 * 미리보기: 카드 클릭 시 previewItem이 같은 슬롯 equipped를 visually replace.
 * Phase 25에서 ItemOverlay 컴포넌트로 추출 예정.
 */
function PreviewArea({ equipped, previewItem, sprouts }: PreviewProps) {
  const overlay = (slot: Slot, equippedId: string | null): string | null => {
    if (previewItem && previewItem.slot === slot) return previewItem.svgPath;
    if (equippedId) {
      const item = CATALOG.find((i) => i.id === equippedId);
      return item?.svgPath ?? null;
    }
    return null;
  };

  const backSvg = overlay("back", equipped.back);
  const headSvg = overlay("head", equipped.head);
  const faceSvg = overlay("face", equipped.face);

  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-3">
      <div className="relative h-20 w-20">
        {/* z-0: back, z-10: potato, z-20: head, z-30: face */}
        {backSvg && (
          <img
            src={backSvg}
            alt=""
            className="absolute inset-0 z-0 h-full w-full"
          />
        )}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Potato state="calm" size={80} animated={false} />
        </div>
        {headSvg && (
          <img
            src={headSvg}
            alt=""
            className="absolute inset-0 z-20 h-full w-full"
          />
        )}
        {faceSvg && (
          <img
            src={faceSvg}
            alt=""
            className="absolute inset-0 z-30 h-full w-full"
          />
        )}
      </div>
      <p className="text-[11px] font-semibold text-deep">
        잔액: 🌱 {sprouts.toLocaleString()}
      </p>
    </div>
  );
}

// =====================================================================
// 영역 탭
// =====================================================================

type SlotTabsProps = {
  selectedSlot: Slot;
  onChange: (slot: Slot) => void;
  ownedOnly: boolean;
  onToggleOwned: (next: boolean) => void;
};

function SlotTabs({
  selectedSlot,
  onChange,
  ownedOnly,
  onToggleOwned,
}: SlotTabsProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2">
      <div className="flex gap-1">
        {SLOT_TABS.map((tab) => {
          const isActive = tab.id === selectedSlot;
          const className = isActive
            ? "rounded-[8px] bg-deepNavy/10 px-2.5 py-1 text-[11px] font-extrabold text-deepNavy"
            : "rounded-[8px] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-ink/55 transition-colors hover:text-ink/75";
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={className}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1 text-[10px] text-ink/65">
        <input
          type="checkbox"
          checked={ownedOnly}
          onChange={(e) => onToggleOwned(e.target.checked)}
          className="h-3 w-3"
        />
        내 아이템
      </label>
    </div>
  );
}

// =====================================================================
// 카드
// =====================================================================

type ItemCardProps = {
  item: ShopItem;
  state: ReturnType<typeof computeItemState>;
  /** insufficient일 때 부족분 (FR-13 툴팁용). */
  shortBy: number;
  onPreview: () => void;
  onPurchase: () => void;
  onEquip: () => void;
  onUnequip: () => void;
};

function ItemCard({
  item,
  state,
  shortBy,
  onPreview,
  onPurchase,
  onEquip,
  onUnequip,
}: ItemCardProps) {
  const isInsufficient = state === "insufficient";
  const isEquipped = state === "equipped";
  const isOwned = state === "owned";

  const containerBase =
    "relative flex flex-col items-center gap-1 rounded-[10px] border border-ink/10 bg-paperBg p-2 transition-colors";
  const containerActive = isInsufficient
    ? "opacity-50"
    : "hover:border-deepNavy/30 cursor-pointer";

  const handleCardClick = () => {
    if (isInsufficient) return; // 클릭 무반응 (FR-13)
    onPreview();
  };

  return (
    <div
      className={`${containerBase} ${containerActive}`}
      onClick={handleCardClick}
      title={isInsufficient ? `${shortBy}🌱 더 모아주세요` : undefined}
      role={isInsufficient ? undefined : "button"}
      aria-disabled={isInsufficient ? "true" : undefined}
    >
      {isEquipped && (
        <span className="absolute right-1 top-1 rounded-full bg-deepNavy px-1.5 py-0.5 text-[9px] font-bold text-white">
          ✓
        </span>
      )}
      <img
        src={item.svgPath}
        alt={item.nameKo}
        className="h-12 w-12"
      />
      <span className="text-center text-[10px] font-semibold text-ink">
        {item.nameKo}
      </span>
      <span className="text-[10px] text-deep/70">🌱 {item.price}</span>

      {/* 액션 버튼 */}
      {!isOwned && !isEquipped && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isInsufficient) return;
            onPurchase();
          }}
          disabled={isInsufficient}
          className={
            isInsufficient
              ? "mt-1 rounded-md bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/40"
              : "mt-1 rounded-md bg-deep px-2 py-0.5 text-[10px] font-bold text-white"
          }
        >
          구매
        </button>
      )}
      {isOwned && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEquip();
          }}
          className="mt-1 rounded-md bg-deepNavy px-2 py-0.5 text-[10px] font-bold text-white"
        >
          장착
        </button>
      )}
      {isEquipped && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnequip();
          }}
          className="mt-1 rounded-md bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/65"
        >
          해제
        </button>
      )}
    </div>
  );
}

// =====================================================================
// 구매 확인 모달
// =====================================================================

type ConfirmModalProps = {
  item: ShopItem | null;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmModal({ item, onConfirm, onCancel }: ConfirmModalProps) {
  if (!item) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-3 flex w-full max-w-xs flex-col gap-2 rounded-[12px] bg-paperBg p-3 shadow-lg">
        <p className="text-center text-[13px] font-bold text-ink">
          {item.nameKo} ({item.price}🌱) 구매할까요?
        </p>
        <p className="text-center text-[10px] text-deep/60">환불 불가</p>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md bg-ink/10 px-2 py-1.5 text-[11px] font-semibold text-ink/65"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-md bg-deep px-2 py-1.5 text-[11px] font-bold text-white"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ShopTab (메인)
// =====================================================================

/**
 * Shop 탭 메인 (Phase 24 FR-9~17, FR-21).
 *
 * 마운트 + inventory-updated 수신 시 inventory + economy 둘 다 재조회 (purchase는 economy도 변경).
 * 영역 탭 변경 시 미리보기 초기화 (FR-12).
 */
export function ShopTab() {
  const [inventory, setInventory] = useState<Inventory>(DEFAULT_INVENTORY);
  const [economy, setEconomy] = useState<Economy>(DEFAULT_ECONOMY);
  const [selectedSlot, setSelectedSlot] = useState<Slot>("face");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ShopItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 마운트 + inventory-updated 수신 시 inventory + economy 재조회.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [inv, eco] = await Promise.all([
        getInventory().catch(() => DEFAULT_INVENTORY),
        getEconomy().catch(() => DEFAULT_ECONOMY),
      ]);
      if (cancelled) return;
      setInventory(inv);
      setEconomy(eco);
    };
    void refresh();
    let unlisten: (() => void) | undefined;
    void onInventoryUpdated(() => {
      void refresh();
    }).then((ul) => {
      if (cancelled) {
        ul();
        return;
      }
      unlisten = ul;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 영역 탭 변경 시 미리보기 초기화 (FR-12).
  const handleSlotChange = (slot: Slot) => {
    setSelectedSlot(slot);
    setPreviewItem(null);
  };

  // 카드 그리드 산출.
  const slotItems = itemsBySlot(selectedSlot);
  const visibleItems = ownedOnly
    ? slotItems.filter((i) => inventory.owned.includes(i.id))
    : slotItems;

  const handleConfirmPurchase = async () => {
    if (!confirmTarget) return;
    const targetId = confirmTarget.id;
    setConfirmTarget(null);
    try {
      await purchaseItem(targetId);
      setErrorMsg(null);
      // inventory-updated 이벤트로 자동 재조회됨.
    } catch (err) {
      const short = parseInsufficientSprouts(err);
      if (short !== null) {
        setErrorMsg(`${short}🌱 더 모아주세요`);
      } else {
        setErrorMsg("구매에 실패했습니다");
      }
    }
  };

  const handleEquip = async (itemId: string) => {
    try {
      await equipItem(itemId);
      setErrorMsg(null);
    } catch {
      setErrorMsg("장착에 실패했습니다");
    }
  };

  const handleUnequip = async (slot: Slot) => {
    try {
      await unequipSlot(slot);
      setErrorMsg(null);
    } catch {
      setErrorMsg("해제에 실패했습니다");
    }
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <PreviewArea
        equipped={inventory.equipped}
        previewItem={previewItem}
        sprouts={economy.sprouts}
      />
      <SlotTabs
        selectedSlot={selectedSlot}
        onChange={handleSlotChange}
        ownedOnly={ownedOnly}
        onToggleOwned={setOwnedOnly}
      />
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {visibleItems.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] text-ink/55">
              {ownedOnly
                ? "이 영역에 보유한 아이템이 없어요"
                : "이 영역에 아이템이 없어요"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {visibleItems.map((item) => {
              const state = computeItemState(
                item.id,
                item.price,
                inventory,
                economy.sprouts
              );
              const shortBy = Math.max(0, item.price - economy.sprouts);
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  state={state}
                  shortBy={shortBy}
                  onPreview={() => setPreviewItem(item)}
                  onPurchase={() => setConfirmTarget(item)}
                  onEquip={() => void handleEquip(item.id)}
                  onUnequip={() => void handleUnequip(item.slot)}
                />
              );
            })}
          </div>
        )}
      </div>
      {errorMsg && (
        <div className="px-3 pb-1 text-center text-[10px] text-red-500">
          {errorMsg}
        </div>
      )}
      <ConfirmModal
        item={confirmTarget}
        onConfirm={() => void handleConfirmPurchase()}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
