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
 * Phase 22 P-E1 / FR-7~8 / AC-4~5: 25~60 / 1~30 범위.
 */
describe("isValidDuration", () => {
  it("returns true at focus lower/upper bounds", () => {
    expect(isValidDuration("25", 25, 60)).toBe(true);
    expect(isValidDuration("60", 25, 60)).toBe(true);
  });
  it("returns true at break lower/upper bounds", () => {
    expect(isValidDuration("1", 1, 30)).toBe(true);
    expect(isValidDuration("30", 1, 30)).toBe(true);
  });
  it("returns false below focus min / above focus max", () => {
    expect(isValidDuration("24", 25, 60)).toBe(false);
    expect(isValidDuration("61", 25, 60)).toBe(false);
  });
  it("returns false below break min / above break max", () => {
    expect(isValidDuration("0", 1, 30)).toBe(false);
    expect(isValidDuration("31", 1, 30)).toBe(false);
  });
  it("returns false for empty / whitespace", () => {
    expect(isValidDuration("", 25, 60)).toBe(false);
    expect(isValidDuration("   ", 25, 60)).toBe(false);
  });
  it("returns false for non-integer (decimal/text)", () => {
    expect(isValidDuration("25.5", 25, 60)).toBe(false);
    expect(isValidDuration("abc", 25, 60)).toBe(false);
  });
});

/**
 * FR-E4 + BR-4 + Phase 22 P-E1 / AC-4/5: canSave — 25~60 / 1~30 경계, dirty 미충족 false.
 */
describe("canSave", () => {
  it("returns false when focus = 24 (below min)", () => {
    expect(canSave("24", "10", 25, 5)).toBe(false);
  });
  it("returns false when focus = 61 (above max)", () => {
    expect(canSave("61", "10", 25, 5)).toBe(false);
  });
  it("returns false when break = 0 (below min)", () => {
    expect(canSave("30", "0", 25, 5)).toBe(false);
  });
  it("returns false when break = 31 (above max)", () => {
    expect(canSave("30", "31", 25, 5)).toBe(false);
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
  it("returns true at lower bounds (25,1) when different from saved", () => {
    expect(canSave("25", "1", 25, 5)).toBe(true);
  });
  it("returns true at upper bounds (60,30) when different from saved", () => {
    expect(canSave("60", "30", 25, 5)).toBe(true);
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
    fireEvent.change(focusInput, { target: { value: "61" } });
    // Phase 22 P-E1: 25~60분 정책 정합.
    expect(screen.getByText(/25~60분 사이로 입력해주세요/)).toBeInTheDocument();
  });

  it("restores last valid value on blur when input is invalid", async () => {
    render(<DurationsEditScreen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    });
    const focusInput = screen.getByDisplayValue("25");
    // 유효 → lastValidFocus = 30 갱신 (25~60 범위 내).
    fireEvent.change(focusInput, { target: { value: "30" } });
    // 무효 입력 (61 > 60).
    fireEvent.change(focusInput, { target: { value: "61" } });
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
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
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
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("변경 사항 폐기")).not.toBeInTheDocument();
  });
});
