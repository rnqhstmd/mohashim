import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodoItem } from "../TodoItem";
import type { Todo, WorkTag, Location } from "../../../lib/storage";

/**
 * TodoItem 카드화 (Phase 17 FR-A1~A8) 검증.
 *
 * 핵심 변경:
 *   - 행 단위 → 카드 단위 (rounded-xl border bg-white)
 *   - 원형 체크박스 (rounded-full)
 *   - label에 font-kyobo (BR-3)
 *   - 우측 상단 × 삭제 버튼
 *   - 태그 칩 하단 행 분리
 *   - active 시 border-l-4 border-deep bg-cream (인라인 그라디언트 폐기)
 *   - 완료 시 line-through opacity-40
 */

const baseTodo: Todo = {
  id: "t1",
  text: "할 일 하나",
  done: false,
  tag: null,
  loc: null,
  active: false,
  completedAt: null,
};

const workTag: WorkTag = {
  id: "wt-default-dev",
  emoji: "💻",
  label: "개발",
  color: "#7aa3e6",
};

const location: Location = {
  id: "loc-default-home",
  emoji: "🏠",
  label: "집",
  color: "#a8b3cc",
};

const baseProps = {
  workTag: null,
  location: null,
  openSwipeId: null,
  onSwipeOpen: () => {},
  onToggleDone: () => {},
  onToggleActive: () => {},
  onDelete: () => {},
};

describe("TodoItem", () => {
  it("AC-A1: 외곽 카드에 rounded-xl border bg-white 클래스 적용", () => {
    const { container } = render(<TodoItem {...baseProps} todo={baseTodo} />);
    const card = container.firstChild as HTMLElement | null;
    expect(card?.className).toContain("rounded-xl");
    expect(card?.className).toContain("border");
    expect(card?.className).toContain("bg-white");
    expect(card?.className).toContain("border-deep/10");
  });

  it("AC-A2 (미완료): 체크박스가 원형(rounded-full)이며 ✓ 미표시", () => {
    render(<TodoItem {...baseProps} todo={baseTodo} />);
    const checkbox = screen.getByRole("button", { name: "완료" });
    expect(checkbox.className).toContain("rounded-full");
    expect(checkbox.className).toContain("border-deep/40");
    expect(checkbox.textContent).toBe("");
  });

  it("AC-A2 (완료): 체크박스가 bg-deep + ✓ 표시", () => {
    const done: Todo = { ...baseTodo, done: true, completedAt: "2026-01-01T00:00:00.000Z" };
    render(<TodoItem {...baseProps} todo={done} />);
    const checkbox = screen.getByRole("button", { name: "완료 해제" });
    expect(checkbox.className).toContain("rounded-full");
    expect(checkbox.className).toContain("bg-deep");
    expect(checkbox.textContent).toContain("✓");
  });

  it("AC-A3: label에 font-kyobo 클래스 적용", () => {
    render(<TodoItem {...baseProps} todo={baseTodo} />);
    const label = screen.getByText("할 일 하나");
    expect(label.className).toContain("font-kyobo");
  });

  it("AC-A4: 태그 칩(workTag/location)이 카드 하단 행에 렌더된다", () => {
    render(
      <TodoItem
        {...baseProps}
        todo={baseTodo}
        workTag={workTag}
        location={location}
      />
    );
    expect(screen.getByText("개발")).toBeInTheDocument();
    expect(screen.getByText("집")).toBeInTheDocument();
  });

  it("AC-A5: × 버튼이 우측 상단(absolute right-2 top-2 opacity 적용) 노출되며 클릭 시 onDelete 호출", () => {
    const onDelete = vi.fn();
    render(
      <TodoItem {...baseProps} todo={baseTodo} onDelete={onDelete} />
    );
    const deleteBtn = screen.getByRole("button", { name: "삭제 (×)" });
    expect(deleteBtn.className).toContain("absolute");
    expect(deleteBtn.className).toContain("right-2");
    expect(deleteBtn.className).toContain("top-2");
    expect(deleteBtn.className).toContain("text-deep/30");
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("t1");
  });

  it("AC-A6: 완료 시 label에 line-through opacity-40 적용", () => {
    const done: Todo = { ...baseTodo, done: true, completedAt: "2026-01-01T00:00:00.000Z" };
    render(<TodoItem {...baseProps} todo={done} />);
    const label = screen.getByText("할 일 하나");
    expect(label.className).toContain("line-through");
    expect(label.className).toContain("opacity-40");
  });

  it("AC-A7: active 시 카드에 border-l-4 border-deep bg-cream 적용", () => {
    const active: Todo = { ...baseTodo, active: true };
    const { container } = render(<TodoItem {...baseProps} todo={active} />);
    const card = container.firstChild as HTMLElement | null;
    expect(card?.className).toContain("border-l-4");
    expect(card?.className).toContain("border-deep");
    expect(card?.className).toContain("bg-cream");
  });

  it("미완료 active 토글 버튼이 노출된다 (★/▶)", () => {
    render(<TodoItem {...baseProps} todo={baseTodo} />);
    expect(
      screen.getByRole("button", { name: "현재 작업으로 설정" })
    ).toBeInTheDocument();
  });

  it("완료 항목은 active 토글 버튼이 미노출", () => {
    const done: Todo = { ...baseTodo, done: true, completedAt: "2026-01-01T00:00:00.000Z" };
    render(<TodoItem {...baseProps} todo={done} />);
    expect(
      screen.queryByRole("button", { name: "현재 작업으로 설정" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "현재 작업 해제" })
    ).not.toBeInTheDocument();
  });
});
