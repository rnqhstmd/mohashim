import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShareCard, SHARE_PREVIEW_DISPLAY_PX } from "../ShareCard";
import type { MonthData } from "../../../lib/grass";
import { SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT } from "../../../lib/grass";

/**
 * Part B ShareCard 레이아웃 검증.
 *
 * 레이아웃: 헤더 → top-character(좌) + highlights 3블록(우) → 잔디맵 → 범례 → 워터마크.
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
    const watermark = texts.find((t) => (t.textContent ?? "").includes("모하심으로 기록 중"));
    expect(watermark).toBeTruthy();
    const subtitle = texts.find((t) => t.textContent === "2026년 5월");
    expect(subtitle).toBeTruthy();
  });

  it("highlights — 가장 집중 잘 한 날 + 할일 가장 많이 한 날 노출 (sampleData)", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    const texts = Array.from(container.querySelectorAll("svg text"));
    const focusLabel = texts.find((t) =>
      (t.textContent ?? "").includes("가장 집중 잘 한 날")
    );
    expect(focusLabel).toBeTruthy();
    const focusMain = texts.find((t) =>
      (t.textContent ?? "").includes("70점") && (t.textContent ?? "").includes("5월 1일")
    );
    expect(focusMain).toBeTruthy();
    const todoLabel = texts.find((t) =>
      (t.textContent ?? "").includes("할일 가장 많이 한 날")
    );
    expect(todoLabel).toBeTruthy();
    const todoMain = texts.find((t) =>
      (t.textContent ?? "").includes("2개")
    );
    expect(todoMain).toBeTruthy();
  });

  it("highlights — 데이터 없는 달은 '기록 없음' 폴백", () => {
    const { container } = render(<ShareCard data={emptyData} message="" />);
    const texts = Array.from(container.querySelectorAll("svg text"));
    const fallback = texts.find((t) => t.textContent === "기록 없음");
    expect(fallback).toBeTruthy();
  });

  it("message가 비어있지 않으면 highlights 블록 안에 bold #2b2520 렌더", () => {
    const { container } = render(
      <ShareCard data={sampleData} message="안녕" />
    );
    const texts = Array.from(container.querySelectorAll("svg text"));
    const messageText = texts.find((t) => t.textContent === "안녕");
    expect(messageText).toBeTruthy();
    expect(messageText?.getAttribute("font-weight")).toBe("bold");
    expect(messageText?.getAttribute("fill")).toBe("#2b2520");
  });

  it("previewSize 미지정: off-screen wrapper(aria-hidden + left=-99999px)", () => {
    const { container } = render(<ShareCard data={sampleData} message="" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.className).toContain("absolute");
    expect(wrapper.style.left).toBe("-99999px");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe(String(SHARE_CARD_WIDTH));
    expect(svg?.getAttribute("height")).toBe(String(SHARE_CARD_HEIGHT));
    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`);
  });

  it(`previewSize=${SHARE_PREVIEW_DISPLAY_PX}: visible wrapper + SVG width=${SHARE_PREVIEW_DISPLAY_PX}, viewBox 유지`, () => {
    const { container } = render(
      <ShareCard
        data={sampleData}
        message=""
        previewSize={SHARE_PREVIEW_DISPLAY_PX}
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBeNull();
    expect(wrapper.style.width).toBe(`${SHARE_PREVIEW_DISPLAY_PX}px`);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe(String(SHARE_PREVIEW_DISPLAY_PX));
    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`);
  });
});
