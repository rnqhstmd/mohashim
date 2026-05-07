import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/timer", () => ({
  discardSession: vi.fn().mockResolvedValue(undefined),
}));

import { TimerDetailScreen } from "../TimerDetailScreen";
import { discardSession } from "../../../lib/timer";
import { POTATO_PHRASES } from "../../../lib/phrases";

const focusPhrase = POTATO_PHRASES.focusHigh[0];
const breakPhrase = POTATO_PHRASES.break[0];

/**
 * TimerDetailScreen — Potato + SpeechBubble + 대형 MM:SS + 뒤로가기 + Discard 모달
 * (Phase 17 B2-F, FR-F3~F5).
 */
describe("TimerDetailScreen", () => {
  it("renders Potato, SpeechBubble, and MM:SS (1500 → 25:00)", () => {
    render(
      <TimerDetailScreen
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.getByRole("img", { name: "집중하는 모하" })
    ).toBeInTheDocument();
    expect(screen.getByText(focusPhrase)).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
  });

  it("formats timeLeft 65 as 01:05 in break phase", () => {
    render(
      <TimerDetailScreen
        timeLeft={65}
        potatoState="calm"
        phrase={breakPhrase}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("calls onBack when ← button clicked", () => {
    const onBack = vi.fn();
    render(
      <TimerDetailScreen
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "뒤로가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("opens DiscardModal on '그만하기' click", () => {
    render(
      <TimerDetailScreen
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "그만하기" }));
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "계속할래" })
    ).toBeInTheDocument();
  });

  it("closes DiscardModal on '계속할래' click", () => {
    render(
      <TimerDetailScreen
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "그만하기" }));
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속할래" }));
    expect(
      screen.queryByRole("button", { name: "포기" })
    ).not.toBeInTheDocument();
  });

  it("calls discardSession on '포기' click", () => {
    render(
      <TimerDetailScreen
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "그만하기" }));
    fireEvent.click(screen.getByRole("button", { name: "포기" }));
    expect(discardSession).toHaveBeenCalledOnce();
  });
});
