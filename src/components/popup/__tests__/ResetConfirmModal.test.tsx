import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResetConfirmModal } from "../ResetConfirmModal";

/**
 * BR-reset-2 (설계 §15): "모하" 정확 일치 시에만 확인 활성.
 */
describe("ResetConfirmModal", () => {
  it("returns null when open=false", () => {
    const { container } = render(
      <ResetConfirmModal open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal when open=true", () => {
    render(
      <ResetConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/모하/)).toBeInTheDocument();
  });

  it("disables confirm button initially", () => {
    render(
      <ResetConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
  });

  it("disables confirm when text is not exactly 모하", () => {
    render(
      <ResetConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "모" } });
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "모하심" } });
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
  });

  it("enables confirm when text is exactly 모하", () => {
    render(
      <ResetConfirmModal open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "모하" } });
    expect(screen.getByRole("button", { name: "확인" })).toBeEnabled();
  });

  it("calls onConfirm on confirm click", () => {
    const onConfirm = vi.fn();
    render(
      <ResetConfirmModal open={true} onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "모하" } });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel on cancel click", () => {
    const onCancel = vi.fn();
    render(
      <ResetConfirmModal open={true} onConfirm={vi.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
