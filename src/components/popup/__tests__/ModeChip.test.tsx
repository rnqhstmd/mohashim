import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  // Phase 21 사용자 피드백: idle 라벨("음료 홀짝이는 중", "명상 중" 등) 회색 chip이
  // 불필요하다는 피드백 → idle phase에서 chip 자체를 미노출(null)로 변경.
  it("renders nothing for idle phase", () => {
    const { container } = render(<ModeChip phase="idle" />);
    expect(container.firstChild).toBeNull();
  });
});
