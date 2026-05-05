import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/timer", () => ({
  discardSession: vi.fn().mockResolvedValue(undefined),
}));

import { PomodoroRunning } from "../PomodoroRunning";

/**
 * PomodoroRunning — MM:SS 카운트다운 + Discard 모달 토글 (설계 §11).
 */
describe("PomodoroRunning", () => {
  it("formats timeLeft as MM:SS (1500 → 25:00)", () => {
    render(<PomodoroRunning phase="focus" timeLeft={1500} />);
    expect(screen.getByText("25:00")).toBeInTheDocument();
  });

  it("formats timeLeft 65 as 01:05", () => {
    render(<PomodoroRunning phase="focus" timeLeft={65} />);
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("formats timeLeft 0 as 00:00", () => {
    render(<PomodoroRunning phase="break" timeLeft={0} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("shows '집중 중' heading for focus phase", () => {
    render(<PomodoroRunning phase="focus" timeLeft={1500} />);
    expect(screen.getByText("집중 중")).toBeInTheDocument();
  });

  it("shows '휴식 중' heading for break phase", () => {
    render(<PomodoroRunning phase="break" timeLeft={300} />);
    expect(screen.getByText("휴식 중")).toBeInTheDocument();
  });

  it("opens DiscardModal on Discard click", () => {
    render(<PomodoroRunning phase="focus" timeLeft={1500} />);
    const discardBtn = screen.getByRole("button", { name: "그만하기" });
    fireEvent.click(discardBtn);
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "계속할래" })
    ).toBeInTheDocument();
  });

  it("closes DiscardModal on '계속할래' click", () => {
    render(<PomodoroRunning phase="focus" timeLeft={1500} />);
    fireEvent.click(screen.getByRole("button", { name: "그만하기" }));
    expect(screen.getByRole("button", { name: "포기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속할래" }));
    expect(
      screen.queryByRole("button", { name: "포기" })
    ).not.toBeInTheDocument();
  });
});
