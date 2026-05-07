import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { canSave, isValidDuration, DurationsEditScreen } from "../DurationsEditScreen";

vi.mock("../../../lib/storage", () => ({
  getFocusMinutes: vi.fn(),
  getBreakMinutes: vi.fn(),
  setFocusMinutes: vi.fn(),
  setBreakMinutes: vi.fn(),
}));

import {
  getFocusMinutes,
  getBreakMinutes,
  setFocusMinutes,
  setBreakMinutes,
} from "../../../lib/storage";

/**
 * FR-E3: isValidDuration — 빈 문자열 / 비정수 / 범위 외 false.
 * Phase 17 BR-4: 1~180/1~60 범위.
 */
describe("isValidDuration", () => {
  it("returns true at lower/upper bounds", () => {
    expect(isValidDuration("1", 1, 180)).toBe(true);
    expect(isValidDuration("180", 1, 180)).toBe(true);
  });
  it("returns false below min / above max", () => {
    expect(isValidDuration("0", 1, 180)).toBe(false);
    expect(isValidDuration("181", 1, 180)).toBe(false);
  });
  it("returns false for empty / whitespace", () => {
    expect(isValidDuration("", 1, 180)).toBe(false);
    expect(isValidDuration("   ", 1, 180)).toBe(false);
  });
  it("returns false for non-integer (decimal/text)", () => {
    expect(isValidDuration("25.5", 1, 180)).toBe(false);
    expect(isValidDuration("abc", 1, 180)).toBe(false);
  });
});

/**
 * FR-E4 + BR-4: canSave — 1~180 / 1~60 경계, dirty 미충족 false.
 */
describe("canSave", () => {
  it("returns false when focus < 1", () => {
    expect(canSave("0", "10", 25, 5)).toBe(false);
  });
  it("returns false when focus > 180", () => {
    expect(canSave("181", "10", 25, 5)).toBe(false);
  });
  it("returns false when break < 1", () => {
    expect(canSave("25", "0", 25, 5)).toBe(false);
  });
  it("returns false when break > 60", () => {
    expect(canSave("25", "61", 25, 5)).toBe(false);
  });
  it("returns false when focus is empty / non-numeric", () => {
    expect(canSave("", "10", 25, 5)).toBe(false);
    expect(canSave("abc", "10", 25, 5)).toBe(false);
  });
  it("returns false when break is empty", () => {
    expect(canSave("25", "", 25, 5)).toBe(false);
  });
  it("returns false when both inputs equal saved values", () => {
    expect(canSave("25", "5", 25, 5)).toBe(false);
  });
  it("returns true at lower bounds (1,1) when different from saved", () => {
    expect(canSave("1", "1", 25, 5)).toBe(true);
  });
  it("returns true at upper bounds (180,60) when different from saved", () => {
    expect(canSave("180", "60", 25, 5)).toBe(true);
  });
  it("returns false for non-integer (decimal) focus", () => {
    expect(canSave("25.5", "10", 25, 5)).toBe(false);
  });
});

/**
 * UI 레벨 동작 — onBlur 자동 복구, 인라인 에러, 저장 후 onClose, dirty 뒤로가기 모달.
 */
describe("DurationsEditScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getFocusMinutes as ReturnType<typeof vi.fn>).mockResolvedValue(25);
    (getBreakMinutes as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (setFocusMinutes as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (setBreakMinutes as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("loads saved values on mount", async () => {
    render(<DurationsEditScreen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
      expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    });
  });

  it("shows inline error when focus out of range", async () => {
    render(<DurationsEditScreen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    const focusInput = screen.getByDisplayValue("25");
    fireEvent.change(focusInput, { target: { value: "200" } });
    expect(screen.getByText(/1~180분 사이로 입력해주세요/)).toBeInTheDocument();
  });

  it("restores last valid value on blur when input is invalid", async () => {
    render(<DurationsEditScreen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    const focusInput = screen.getByDisplayValue("25");
    // 유효 → lastValidFocus = 30 갱신
    fireEvent.change(focusInput, { target: { value: "30" } });
    // 무효 입력
    fireEvent.change(focusInput, { target: { value: "200" } });
    // blur → lastValid(30)으로 복구
    fireEvent.blur(focusInput);
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
  });

  it("restores to initial saved value on blur when no prior valid edit", async () => {
    render(<DurationsEditScreen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    const focusInput = screen.getByDisplayValue("25");
    fireEvent.change(focusInput, { target: { value: "" } });
    fireEvent.blur(focusInput);
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("disables save when no changes", async () => {
    render(<DurationsEditScreen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole("button", { name: "저장" });
    expect(saveBtn).toBeDisabled();
  });

  it("calls setFocusMinutes/setBreakMinutes and onClose on save", async () => {
    const onClose = vi.fn();
    render(<DurationsEditScreen onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue("25"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(setFocusMinutes).toHaveBeenCalledWith(30, { save: false });
      expect(setBreakMinutes).toHaveBeenCalledWith(5, { save: true });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows DiscardChangesModal on back when dirty, confirms close", async () => {
    const onClose = vi.fn();
    render(<DurationsEditScreen onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue("25"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /시간 편집/ }));
    expect(screen.getByText("변경 사항 폐기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "폐기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose immediately when back pressed and not dirty", async () => {
    const onClose = vi.fn();
    render(<DurationsEditScreen onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /시간 편집/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("변경 사항 폐기")).not.toBeInTheDocument();
  });
});
