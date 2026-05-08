import { describe, expect, it } from "vitest";
import { CATALOG, findItem, itemsBySlot } from "../shopCatalog";

describe("shopCatalog", () => {
  it("AC-12: 9종 아이템 정의 (BR-1 매핑)", () => {
    expect(CATALOG).toHaveLength(9);
    expect(CATALOG.map((i) => i.id)).toEqual([
      "face_round_glasses",
      "face_heart_glasses",
      "face_square_horn",
      "head_strawhat",
      "head_beret_red",
      "head_wizard_cone",
      "back_blanket_check",
      "back_cloak_navy",
      "back_cloak_aura",
    ]);
  });

  it("AC-12: 가격 BR-1 정합", () => {
    const prices = Object.fromEntries(CATALOG.map((i) => [i.id, i.price]));
    expect(prices).toEqual({
      face_round_glasses: 30,
      face_heart_glasses: 40,
      face_square_horn: 60,
      head_strawhat: 100,
      head_beret_red: 120,
      head_wizard_cone: 150,
      back_blanket_check: 200,
      back_cloak_navy: 250,
      back_cloak_aura: 300,
    });
  });

  it("AC-12: 슬롯 접두사와 slot 필드 정합", () => {
    for (const item of CATALOG) {
      const prefix = item.id.split("_")[0];
      expect(prefix).toBe(item.slot);
    }
  });

  it("AC-12: nameKo BR-1 정합", () => {
    const names = Object.fromEntries(CATALOG.map((i) => [i.id, i.nameKo]));
    expect(names).toEqual({
      face_round_glasses: "동글 안경",
      face_heart_glasses: "불타는 눈빛",
      face_square_horn: "멋쟁이 선글라스",
      head_strawhat: "새싹 핀",
      head_beret_red: "노란 안전모",
      head_wizard_cone: "마법사 고깔",
      back_blanket_check: "포근한 담요 망토",
      back_cloak_navy: "빨간 히어로 망토",
      back_cloak_aura: "반짝이는 오라",
    });
  });

  it("findItem: 정의된 ID 조회 성공", () => {
    expect(findItem("face_round_glasses")?.price).toBe(30);
  });

  it("findItem: 미정의 ID는 undefined", () => {
    expect(findItem("unknown_id")).toBeUndefined();
  });

  it("itemsBySlot: face 슬롯 3종", () => {
    const faces = itemsBySlot("face");
    expect(faces).toHaveLength(3);
    expect(faces.every((i) => i.slot === "face")).toBe(true);
  });

  it("itemsBySlot: head 슬롯 3종", () => {
    expect(itemsBySlot("head")).toHaveLength(3);
  });

  it("itemsBySlot: back 슬롯 3종", () => {
    expect(itemsBySlot("back")).toHaveLength(3);
  });
});
