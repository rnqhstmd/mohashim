import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShareCard, SHARE_PREVIEW_DISPLAY_PX } from "../ShareCard";
import type { MonthData } from "../../../lib/grass";

/**
 * Phase 16 + Phase 21 ShareCard 검증.
 *
 * Phase 21 변경:
 * - 워터마크 "MOHASHIM" → "모하심" + 연월 서브타이틀
 * - <g id="highlights">: 가장 집중 잘 한 날 / 할일 가장 많이 한 날
 * - 사용자 메시지: y=950 fontSize=72 → y=1010 fontSize=56 (베스트 통계 위로 이동)
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

const emptyData: MonthData = {
  monthOffset: 0,
  year: 2026,
  month: 5,
  cells: [],
  totalSessions: 0,
  avgScore: 0,
};

describe("ShareCard", () => {
  it("character 영역 부재 + highlights 영역 존재 (Phase 21)", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    expect(container.querySelector("#character")).toBeNull();
    expect(container.querySelector("#highlights")).not.toBeNull();
  });

  it("워터마크는 한글 '모하심'으로 표기 + 연월 서브타이틀 노출", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    const texts = Array.from(container.querySelectorAll("svg text"));
    const watermark = texts.find((t) => t.textContent === "모하심");
    expect(watermark).toBeTruthy();
    const subtitle = texts.find((t) => t.textContent === "2026년 5월");
    expect(subtitle).toBeTruthy();
  });

  it("highlights — 가장 집중 잘 한 날 + 할일 가장 많이 한 날 노출 (sampleData)", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    const texts = Array.from(container.querySelectorAll("svg text"));
    const focusLine = texts.find((t) =>
      (t.textContent ?? "").includes("가장 집중 잘 한 날")
    );
    const todoLine = texts.find((t) =>
      (t.textContent ?? "").includes("할일 가장 많이 한 날")
    );
    expect(focusLine).toBeTruthy();
    expect(focusLine?.textContent).toContain("70점");
    expect(focusLine?.textContent).toContain("5월 1일");
    expect(todoLine).toBeTruthy();
    expect(todoLine?.textContent).toContain("2개");
  });

  it("highlights — 데이터 없는 달은 '아직 집중 세션 없음' 폴백", () => {
    const { container } = render(<ShareCard data={emptyData} message="" />);
    const texts = Array.from(container.querySelectorAll("svg text"));
    const fallback = texts.find(
      (t) => t.textContent === "아직 집중 세션 없음"
    );
    expect(fallback).toBeTruthy();
  });

  it("message가 비어있지 않으면 y=1010, fontSize=56, bold, fill=#2b2520 (Phase 21)", () => {
    const { container } = render(
      <ShareCard data={sampleData} message="안녕" />
    );
    const texts = Array.from(container.querySelectorAll("svg text"));
    const messageText = texts.find((t) => t.textContent === "안녕");
    expect(messageText).toBeTruthy();
    expect(messageText?.getAttribute("x")).toBe("540");
    expect(messageText?.getAttribute("y")).toBe("1010");
    expect(messageText?.getAttribute("text-anchor")).toBe("middle");
    expect(messageText?.getAttribute("font-size")).toBe("56");
    expect(messageText?.getAttribute("font-weight")).toBe("bold");
    expect(messageText?.getAttribute("fill")).toBe("#2b2520");
  });

  it("previewSize 미지정: off-screen wrapper(aria-hidden + left=-99999px)", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.className).toContain("absolute");
    expect((wrapper.style.left || "")).toBe("-99999px");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("1080");
    expect(svg?.getAttribute("height")).toBe("1080");
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
