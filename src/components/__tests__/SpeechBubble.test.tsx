import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpeechBubble } from "../SpeechBubble";

describe("SpeechBubble", () => {
  it("renders the provided text", () => {
    render(<SpeechBubble text="테스트" color="#ffffff" />);
    expect(screen.getByText("테스트")).toBeInTheDocument();
  });

  it("applies container styling classes (AC-19)", () => {
    render(<SpeechBubble text="테스트" color="#ffffff" />);
    const text = screen.getByText("테스트");
    const container = text.parentElement;
    expect(container).not.toBeNull();
    expect(container?.className).toContain("rounded-[14px]");
    expect(container?.className).toContain("border-[1.5px]");
    expect(container?.className).toContain("border-ink");
    expect(container?.className).toContain("shadow-[2px_2px_0_0_#2b2520]");
    expect(container?.className).toContain("inline-block");
  });
});

describe("SpeechBubble — bubble tail", () => {
  // Phase 21 사용자 피드백 (재): Potato가 말풍선 좌측에 있는 horizontal 레이아웃에서
  // 꼬리가 Potato를 가리켜야 함 → 좌측 향함(◁). border-l + border-b + rotate-45 →
  // 좌하단 코너 변이 보이며 좌측으로 향한 삼각형. 위치는 좌측면 -left-[6px], 수직
  // 중앙 근처(bottom-3).
  it("renders the left-pointing tail (◁) with left+bottom ink borders", () => {
    render(<SpeechBubble text="테스트" />);
    const tail = screen.getByTestId("bubble-tail");
    expect(tail).toBeInTheDocument();
    expect(tail.className).toContain("rotate-45");
    expect(tail.className).toContain("border-l-ink");
    expect(tail.className).toContain("border-b-ink");
    expect(tail.className).toContain("border-r-transparent");
    expect(tail.className).toContain("border-t-transparent");
    expect(tail.className).toContain("absolute");
    expect(tail.className).toContain("-left-[6px]");
    expect(tail.className).toContain("bottom-3");
  });
});

describe("SpeechBubble — empty text guard (BR-3)", () => {
  it("renders nothing when text is empty", () => {
    const { container } = render(<SpeechBubble text="" />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render the tail when text is empty", () => {
    render(<SpeechBubble text="" />);
    expect(() => screen.getByTestId("bubble-tail")).toThrow();
  });
});

describe("SpeechBubble — color default", () => {
  // Phase 20: Mohashim Design.html(PAPER 톤 #fdf8ef)을 기본 배경으로 채택. 노트 페이퍼 표면과
  // 자연스럽게 어울리도록 흰색에서 따뜻한 종이 톤으로 변경.
  it("uses #fdf8ef (paper warm) as the default background color", () => {
    render(<SpeechBubble text="테스트" />);
    const text = screen.getByText("테스트");
    const container = text.parentElement as HTMLElement;
    const bg = container.style.backgroundColor;
    expect(["#fdf8ef", "rgb(253, 248, 239)"]).toContain(bg);
  });
});

describe("SpeechBubble — className 병합", () => {
  it("className 미지정 시 trailing space 없음", () => {
    render(<SpeechBubble text="테스트" />);
    const text = screen.getByText("테스트");
    const container = text.parentElement;
    expect(container?.className.endsWith(" ")).toBe(false);
  });

  it("className 추가 시 깔끔하게 결합 (단일 공백)", () => {
    render(<SpeechBubble text="테스트" className="custom-cls" />);
    const text = screen.getByText("테스트");
    const container = text.parentElement;
    expect(container?.className).toContain("custom-cls");
    expect(container?.className).not.toContain("  "); // 더블 공백 없음
  });
});
