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
  it("renders the bottom-left tail with rotate and ink borders (AC-19)", () => {
    render(<SpeechBubble text="테스트" />);
    const tail = screen.getByTestId("bubble-tail");
    expect(tail).toBeInTheDocument();
    expect(tail.className).toContain("rotate-45");
    expect(tail.className).toContain("border-l-ink");
    expect(tail.className).toContain("border-b-ink");
    expect(tail.className).toContain("absolute");
    expect(tail.className).toContain("left-3");
    expect(tail.className).toContain("-bottom-[6px]");
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
  it("uses #ffffff as the default background color", () => {
    render(<SpeechBubble text="테스트" />);
    const text = screen.getByText("테스트");
    const container = text.parentElement as HTMLElement;
    const bg = container.style.backgroundColor;
    expect(["#ffffff", "rgb(255, 255, 255)"]).toContain(bg);
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
