import { describe, expect, it } from "vitest";
import { shouldDisablePrev } from "../../components/popup/ContributionGraph";

/**
 * Phase 10 DEC-10-5: shouldDisablePrev 순수 함수 단위 테스트.
 * 4 케이스 명세 (설계서 테스트 패턴):
 * - undefined → false (BR-6 하위 호환)
 * - -3, -4 → false (활성)
 * - -4, -4 → true (경계, AC-17)
 * - -5, -4 → true (초과)
 */

describe("shouldDisablePrev (FR-17, AC-17, BR-6)", () => {
  it("BR-6: minOffset=undefined → false (하위 호환, 비활성화하지 않음)", () => {
    expect(shouldDisablePrev(0, undefined)).toBe(false);
    expect(shouldDisablePrev(-100, undefined)).toBe(false);
  });

  it("AC-17: monthOffset=-3, minOffset=-4 → false (활성, 경계 미도달)", () => {
    expect(shouldDisablePrev(-3, -4)).toBe(false);
  });

  it("AC-17: monthOffset=-4, minOffset=-4 → true (경계, 비활성화)", () => {
    expect(shouldDisablePrev(-4, -4)).toBe(true);
  });

  it("AC-17: monthOffset=-5, minOffset=-4 → true (초과, 비활성화)", () => {
    expect(shouldDisablePrev(-5, -4)).toBe(true);
  });
});
