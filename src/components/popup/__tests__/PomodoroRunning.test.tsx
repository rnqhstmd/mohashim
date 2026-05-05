import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/timer", () => ({
  discardSession: vi.fn().mockResolvedValue(undefined),
}));

import { PomodoroRunning } from "../PomodoroRunning";
import { POTATO_PHRASES } from "../../../lib/phrases";

const focusPhrase = POTATO_PHRASES.focusHigh[0];
const breakPhrase = POTATO_PHRASES.break[0];

/**
 * PomodoroRunning — Potato + SpeechBubble + MM:SS 카운트다운 + Discard 모달 (설계 §11, Phase 5 §6).
 *
 * Phase 5 wiring 이후 "집중 중"/"휴식 중" 헤딩은 ModeChip(우상단)과 중복되어 제거됨.
 */
describe("PomodoroRunning", () => {
  it("formats timeLeft as MM:SS (1500 → 25:00)", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    expect(screen.getByText("25:00")).toBeInTheDocument();
  });

  it("formats timeLeft 65 as 01:05", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={65}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("formats timeLeft 0 as 00:00", () => {
    render(
      <PomodoroRunning
        phase="break"
        timeLeft={0}
        potatoState="calm"
        phrase={breakPhrase}
      />
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("renders Potato with given potatoState (focus → focused aria-label)", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    expect(
      screen.getByRole("img", { name: "집중하는 모하" })
    ).toBeInTheDocument();
  });

  it("renders SpeechBubble with given phrase", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    expect(screen.getByText(focusPhrase)).toBeInTheDocument();
  });

  it("does not render '집중 중'/'휴식 중' heading (deferred to ModeChip)", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    expect(screen.queryByText("집중 중")).not.toBeInTheDocument();
    expect(screen.queryByText("휴식 중")).not.toBeInTheDocument();
  });

  it("opens DiscardModal on Discard click", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    const discardBtn = screen.getByRole("button", { name: "그만하기" });
    fireEvent.click(discardBtn);
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "계속할래" })
    ).toBeInTheDocument();
  });

  it("closes DiscardModal on '계속할래' click", () => {
    render(
      <PomodoroRunning
        phase="focus"
        timeLeft={1500}
        potatoState="focused"
        phrase={focusPhrase}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "그만하기" }));
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속할래" }));
    expect(
      screen.queryByRole("button", { name: "포기" })
    ).not.toBeInTheDocument();
  });
});
