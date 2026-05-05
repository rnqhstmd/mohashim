import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModeChip } from "../ModeChip";

/**
 * ModeChip phase별 표시 분기 (설계 §11).
 *
 * - focus/break: chip + 라벨 + pulse dot.
 * - complete/discarded: null.
 * - idle: chipIdle 클래스 (라벨은 useIdleChipLabel 비동기, 클래스만 검증).
 */
describe("ModeChip", () => {
  it("shows '집중 중' when phase is focus", () => {
    render(<ModeChip phase="focus" />);
    expect(screen.getByText("집중 중")).toBeInTheDocument();
  });

  it("shows '휴식 중' when phase is break", () => {
    render(<ModeChip phase="break" />);
    expect(screen.getByText("휴식 중")).toBeInTheDocument();
  });

  it("renders nothing for complete", () => {
    const { container } = render(<ModeChip phase="complete" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for discarded", () => {
    const { container } = render(<ModeChip phase="discarded" />);
    expect(container.firstChild).toBeNull();
  });

  it("applies bg-chipFocus class for focus phase", () => {
    const { container } = render(<ModeChip phase="focus" />);
    const chip = container.firstChild as HTMLElement | null;
    expect(chip?.className).toContain("bg-chipFocus");
  });

  it("applies bg-chipBreak class for break phase", () => {
    const { container } = render(<ModeChip phase="break" />);
    const chip = container.firstChild as HTMLElement | null;
    expect(chip?.className).toContain("bg-chipBreak");
  });

  it("applies bg-chipIdle class for idle phase", () => {
    // Math.random mock으로 useIdleChipLabel 안정화.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = render(<ModeChip phase="idle" />);
    const chip = container.firstChild as HTMLElement | null;
    expect(chip?.className).toContain("bg-chipIdle");
    vi.restoreAllMocks();
  });
});
