/**
 * Shop 9종 아이템 카탈로그 (Phase 24 BR-1, FR-9).
 *
 * Rust shop::catalog::find()와 1:1 정합. TS는 UI 표시용 미러 — 가격 검증은 Rust가 단일 진위.
 * Phase 25에서 placeholder SVG → 실제 시안으로 교체 예정.
 */
import faceRoundGlassesSvg from "../assets/items/face_round_glasses.svg";
import faceHeartGlassesSvg from "../assets/items/face_heart_glasses.svg";
import faceSquareHornSvg from "../assets/items/face_square_horn.svg";
import headStrawhatSvg from "../assets/items/head_strawhat.svg";
import headBeretRedSvg from "../assets/items/head_beret_red.svg";
import headWizardConeSvg from "../assets/items/head_wizard_cone.svg";
import backBlanketCheckSvg from "../assets/items/back_blanket_check.svg";
import backCloakNavySvg from "../assets/items/back_cloak_navy.svg";
import backCloakAuraSvg from "../assets/items/back_cloak_aura.svg";

export type Slot = "face" | "head" | "back";

export type ShopItem = {
  id: string;
  slot: Slot;
  nameKo: string;
  price: number;
  svgPath: string;
};

/**
 * 9종 카탈로그 — Rust shop::catalog::find()와 1:1 정합 (BR-1).
 * 단일 진실 소스: Rust. TS는 UI 표시용 미러.
 */
export const CATALOG: ShopItem[] = [
  { id: "face_round_glasses", slot: "face", nameKo: "동글 안경",             price: 15,  svgPath: faceRoundGlassesSvg },
  { id: "face_heart_glasses", slot: "face", nameKo: "불타는 안경",            price: 22,  svgPath: faceHeartGlassesSvg },
  { id: "face_square_horn",   slot: "face", nameKo: "멋쟁이 선글라스",        price: 35,  svgPath: faceSquareHornSvg },
  { id: "head_strawhat",      slot: "head", nameKo: "밀짚모자",               price: 55,  svgPath: headStrawhatSvg },
  { id: "head_beret_red",     slot: "head", nameKo: "예술가 모자",            price: 65,  svgPath: headBeretRedSvg },
  { id: "head_wizard_cone",   slot: "head", nameKo: "마법사 고깔",            price: 85,  svgPath: headWizardConeSvg },
  { id: "back_blanket_check", slot: "back", nameKo: "포근한 담요 목도리",     price: 110, svgPath: backBlanketCheckSvg },
  { id: "back_cloak_navy",    slot: "back", nameKo: "빨간 히어로 목도리",     price: 140, svgPath: backCloakNavySvg },
  { id: "back_cloak_aura",    slot: "back", nameKo: "반짝이는 오라 목도리",   price: 170, svgPath: backCloakAuraSvg },
];

export function findItem(id: string): ShopItem | undefined {
  return CATALOG.find((i) => i.id === id);
}

export function itemsBySlot(slot: Slot): ShopItem[] {
  return CATALOG.filter((i) => i.slot === slot);
}
