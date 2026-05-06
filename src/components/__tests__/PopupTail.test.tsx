import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PopupTail } from "../PopupTail";

/**
 * PopupTail SVG 꼬리 (설계 §8, FR-E2, AC-T24/T25).
 *
 * - position에 따라 transform/위치 분기.
 * - tailX, color props는 기본값과 커스텀값을 모두 검증.
 * - aria-hidden로 스크린 리더에서 제외.
 */
describe("PopupTail", () => {
  it("does not apply scaleY transform when position='top'", () => {
    const { container } = render(<PopupTail position="top" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // top 포지션에서는 transform이 인라인 스타일에 설정되지 않음.
    expect(svg?.style.transform ?? "").toBe("");
    // path d 속성 정확성 (AC-T24).
    const path = svg?.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M0 10 L10 0 L20 10 Z");
  });

  it("applies scaleY(-1) transform when position='bottom'", () => {
    const { container } = render(<PopupTail position="bottom" />);
    const svg = container.querySelector("svg");
    expect(svg?.style.transform).toBe("scaleY(-1)");
  });

  it("uses default tailX of 270", () => {
    const { container } = render(<PopupTail position="top" />);
    const svg = container.querySelector("svg");
    expect(svg?.style.left).toBe("270px");
  });

  it("applies custom tailX when provided", () => {
    const { container } = render(<PopupTail position="top" tailX={120} />);
    const svg = container.querySelector("svg");
    expect(svg?.style.left).toBe("120px");
  });

  it("uses default color #fdf8e8 on path fill", () => {
    const { container } = render(<PopupTail position="top" />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("#fdf8e8");
  });

  it("applies custom color on path fill", () => {
    const { container } = render(<PopupTail position="top" color="#ff0000" />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("#ff0000");
  });

  it("has aria-hidden attribute for screen reader exclusion", () => {
    const { container } = render(<PopupTail position="top" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
