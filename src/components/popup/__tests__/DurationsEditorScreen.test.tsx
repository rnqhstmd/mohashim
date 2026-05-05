import { describe, expect, it } from "vitest";
import { canSave } from "../DurationsEditorScreen";

/**
 * FR-22a/22b/22c/22d: 집중/휴식 분 입력 검증 (설계 §14).
 *
 * - 집중: 5~90 정수, 휴식: 3~30 정수.
 * - 빈 문자열 / 비정수 / 범위 초과 → false.
 * - 저장값과 동일(dirty=false) → false.
 */
describe("canSave", () => {
  // FR-22a: 집중 시간 5~90 범위
  it("returns false when focus < 5", () => {
    expect(canSave("4", "10", 25, 5)).toBe(false);
  });
  it("returns false when focus > 90", () => {
    expect(canSave("91", "10", 25, 5)).toBe(false);
  });

  // FR-22b: 휴식 시간 3~30 범위
  it("returns false when break < 3", () => {
    expect(canSave("25", "2", 25, 5)).toBe(false);
  });
  it("returns false when break > 30", () => {
    expect(canSave("25", "31", 25, 5)).toBe(false);
  });

  // FR-22c: 숫자 아님 / 빈 값
  it("returns false when focus is non-numeric", () => {
    expect(canSave("abc", "10", 25, 5)).toBe(false);
  });
  it("returns false when focus is empty", () => {
    expect(canSave("", "10", 25, 5)).toBe(false);
  });
  it("returns false when break is empty", () => {
    expect(canSave("25", "", 25, 5)).toBe(false);
  });

  // FR-22d: dirty 미충족
  it("returns false when both inputs equal saved values", () => {
    expect(canSave("25", "5", 25, 5)).toBe(false);
  });

  // 정상 케이스
  it("returns true for valid inputs differing from saved", () => {
    expect(canSave("30", "10", 25, 5)).toBe(true);
  });
  it("returns true at lower bounds (5, 3) when different from saved", () => {
    expect(canSave("5", "3", 25, 5)).toBe(true);
  });
  it("returns true at upper bounds (90, 30) when different from saved", () => {
    expect(canSave("90", "30", 25, 5)).toBe(true);
  });
  it("returns false for non-integer (decimal) focus", () => {
    expect(canSave("25.5", "10", 25, 5)).toBe(false);
  });
});
