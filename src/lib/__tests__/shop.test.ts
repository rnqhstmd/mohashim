import { describe, expect, it } from "vitest";
import { computeItemState, parseInsufficientSprouts } from "../shop";

describe("shop", () => {
  describe("parseInsufficientSprouts", () => {
    it("정상 형식 파싱", () => {
      expect(parseInsufficientSprouts("insufficient_sprouts:30")).toBe(30);
      expect(parseInsufficientSprouts("insufficient_sprouts:0")).toBe(0);
      expect(parseInsufficientSprouts("insufficient_sprouts:9999")).toBe(9999);
    });

    it("형식 불일치 시 null", () => {
      expect(parseInsufficientSprouts("unknown_item:face_round_glasses")).toBeNull();
      expect(parseInsufficientSprouts("not_owned:face_round_glasses")).toBeNull();
      expect(parseInsufficientSprouts("")).toBeNull();
      expect(parseInsufficientSprouts(null)).toBeNull();
      expect(parseInsufficientSprouts(123)).toBeNull();
    });

    it("Error 객체 message 추출", () => {
      expect(parseInsufficientSprouts(new Error("insufficient_sprouts:50"))).toBe(50);
    });
  });

  describe("computeItemState", () => {
    const baseInventory = {
      owned: [],
      equipped: { face: null, head: null, back: null },
    };

    it("미보유 + 잔액 충분 → available", () => {
      const state = computeItemState(
        "face_round_glasses",
        30,
        baseInventory,
        100
      );
      expect(state).toBe("available");
    });

    it("미보유 + 잔액 부족 → insufficient", () => {
      const state = computeItemState(
        "face_square_horn",
        60,
        baseInventory,
        50
      );
      expect(state).toBe("insufficient");
    });

    it("보유 + 미장착 → owned", () => {
      const state = computeItemState(
        "face_round_glasses",
        30,
        { ...baseInventory, owned: ["face_round_glasses"] },
        100
      );
      expect(state).toBe("owned");
    });

    it("보유 + 장착 중 → equipped", () => {
      const state = computeItemState(
        "face_round_glasses",
        30,
        {
          owned: ["face_round_glasses"],
          equipped: { face: "face_round_glasses", head: null, back: null },
        },
        100
      );
      expect(state).toBe("equipped");
    });

    it("head 슬롯 판별", () => {
      const state = computeItemState(
        "head_strawhat",
        100,
        {
          owned: ["head_strawhat"],
          equipped: { face: null, head: "head_strawhat", back: null },
        },
        100
      );
      expect(state).toBe("equipped");
    });

    it("back 슬롯 판별", () => {
      const state = computeItemState(
        "back_cloak_navy",
        250,
        {
          owned: ["back_cloak_navy"],
          equipped: { face: null, head: null, back: "back_cloak_navy" },
        },
        500
      );
      expect(state).toBe("equipped");
    });

    it("알 수 없는 접두사 ID는 잔액 기반 판정 (장착/보유 분기 건너뜀)", () => {
      // review Info 반영: Rust slot_for_id와 정합 — 알 수 없는 접두사는 None.
      const inv = {
        owned: ["misc_unknown"],
        equipped: { face: null, head: null, back: "misc_unknown" },
      };
      // 잔액 충분 → available (이전 코드는 "equipped"로 잘못 판정했음).
      expect(computeItemState("misc_unknown", 100, inv, 500)).toBe("available");
      // 잔액 부족 → insufficient.
      expect(computeItemState("misc_unknown", 100, inv, 50)).toBe("insufficient");
    });
  });
});
