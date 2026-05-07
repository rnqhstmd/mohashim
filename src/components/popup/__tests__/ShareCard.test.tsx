import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShareCard, SHARE_PREVIEW_DISPLAY_PX } from "../ShareCard";
import type { MonthData } from "../../../lib/grass";

/**
 * Phase 16 ShareCard 재설계 검증 (AC-12~14, previewSize 분기).
 */

const sampleData: MonthData = {
  monthOffset: 0,
  year: 2026,
  month: 5,
  cells: [
    { date: null, sessions: 0, avg: 0, todos: 0, level: 0, isFuture: false },
    { date: "2026-05-01", sessions: 3, avg: 70, todos: 2, level: 3, isFuture: false },
  ],
  totalSessions: 3,
  avgScore: 70,
};

describe("ShareCard", () => {
  it("AC-12: character 영역과 stats 영역이 부재", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    expect(container.querySelector("#character")).toBeNull();
    expect(container.querySelector("#stats")).toBeNull();
  });

  it("AC-13: message가 빈 문자열이면 사용자 메시지 text 미렌더", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    // SVG 내 모든 text 요소: watermark 1개만 (stats 제거됨).
    const texts = container.querySelectorAll("svg text");
    expect(texts.length).toBe(1);
    // 워터마크는 남아있어야 함.
    expect(texts[0].textContent).toBe("MOHASHIM");
  });

  it("AC-14: message가 비어있지 않으면 x=540, y=950, fontSize=72, bold, fill=#2b2520", () => {
    const { container } = render(
      <ShareCard data={sampleData} message="안녕" />
    );
    const texts = container.querySelectorAll("svg text");
    // watermark + message = 2.
    expect(texts.length).toBe(2);
    const messageText = Array.from(texts).find((t) => t.textContent === "안녕");
    expect(messageText).toBeTruthy();
    expect(messageText?.getAttribute("x")).toBe("540");
    expect(messageText?.getAttribute("y")).toBe("950");
    expect(messageText?.getAttribute("text-anchor")).toBe("middle");
    expect(messageText?.getAttribute("font-size")).toBe("72");
    expect(messageText?.getAttribute("font-weight")).toBe("bold");
    expect(messageText?.getAttribute("fill")).toBe("#2b2520");
  });

  it("previewSize 미지정: off-screen wrapper(aria-hidden + left=-99999px)", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.className).toContain("absolute");
    expect((wrapper.style.left || "")).toBe("-99999px");
    // SVG width/height는 1080.
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("1080");
    expect(svg?.getAttribute("height")).toBe("1080");
    // viewBox는 1080 유지.
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1080 1080");
  });

  it("previewSize=260: visible wrapper + SVG width/height=260, viewBox=1080 유지", () => {
    const { container } = render(
      <ShareCard
        data={sampleData}
        message=""
        previewSize={SHARE_PREVIEW_DISPLAY_PX}
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBeNull();
    expect(wrapper.style.width).toBe("260px");
    expect(wrapper.style.height).toBe("260px");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("260");
    expect(svg?.getAttribute("height")).toBe("260");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1080 1080");
  });
});
