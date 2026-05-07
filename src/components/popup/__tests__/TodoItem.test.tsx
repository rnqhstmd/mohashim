import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodoItem } from "../TodoItem";
import type { Todo, WorkTag, Location } from "../../../lib/storage";

/**
 * Phase 21 TodoItem 재구조 검증.
 *
 * 변경:
 *   - swipe-to-delete 제거 (translateX + 노출 삭제 버튼 X).
 *   - ⋮ 메뉴 단일 진입점 — [고정/고정 해제 · 삭제] popover.
 *   - 텍스트 클릭 → 인라인 편집 input. Enter 저장 / ESC 취소 / blur 저장.
 *   - 완료된 todo는 텍스트 클릭 시 편집 진입 안 함.
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
  onToggleDone: () => {},
  onToggleActive: () => {},
  onDelete: () => {},
  onEditText: () => {},
};

describe("TodoItem (Phase 21 재구조)", () => {
  it("외곽 카드는 rounded-xl + border + bg-paperWarm", () => {
    const { container } = render(<TodoItem {...baseProps} todo={baseTodo} />);
    const card = container.firstChild as HTMLElement | null;
    expect(card?.className).toContain("rounded-xl");
    expect(card?.className).toContain("border");
    expect(card?.className).toContain("bg-paperWarm");
  });

  it("미완료 체크박스 = rounded-full + ✓ 미표시, 완료 = bg-ink + ✓", () => {
    const { rerender } = render(<TodoItem {...baseProps} todo={baseTodo} />);
    const cb = screen.getByRole("button", { name: "완료" });
    expect(cb.className).toContain("rounded-full");
    expect(cb.textContent).toBe("");

    rerender(
      <TodoItem
        {...baseProps}
        todo={{ ...baseTodo, done: true, completedAt: "2026-01-01T00:00:00.000Z" }}
      />
    );
    const cbDone = screen.getByRole("button", { name: "완료 해제" });
    expect(cbDone.className).toContain("bg-ink");
    expect(cbDone.textContent).toContain("✓");
  });

  it("태그 칩 (workTag/location)이 하단 행에 렌더", () => {
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

  it("active 시 카드에 살짝 붉은 톤 적용 (좌측 4px 검정 막대 미사용)", () => {
    const active: Todo = { ...baseTodo, active: true };
    const { container } = render(<TodoItem {...baseProps} todo={active} />);
    const card = container.firstChild as HTMLElement | null;
    // Phase 21 사용자 피드백: border-l-4 + border-l-ink 폐기, rose 톤 사용.
    expect(card?.className).not.toContain("border-l-4");
    expect(card?.className).not.toContain("border-l-ink");
    expect(card?.className).toContain("rose-50");
    // 우측 끝에 핀 아이콘 노출.
    expect(screen.getByLabelText("고정됨")).toBeInTheDocument();
  });

  it("⋮ 메뉴 버튼 단일 (× 버튼/별도 핀 버튼 미노출)", () => {
    render(<TodoItem {...baseProps} todo={baseTodo} />);
    expect(
      screen.getByRole("button", { name: "할 일 메뉴 열기" }),
    ).toBeInTheDocument();
    // 기존 × 삭제 버튼 / ★/▶ 핀 버튼 미존재.
    expect(
      screen.queryByRole("button", { name: "삭제 (×)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "현재 작업으로 고정" }),
    ).not.toBeInTheDocument();
  });

  it("⋮ 클릭 → 메뉴 노출 (고정 + 삭제) → 외부 클릭으로 닫힘", () => {
    render(<TodoItem {...baseProps} todo={baseTodo} />);
    fireEvent.click(screen.getByRole("button", { name: "할 일 메뉴 열기" }));
    expect(screen.getByRole("menuitem", { name: /고정/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /삭제/ })).toBeInTheDocument();

    // 외부 mousedown으로 닫힘.
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("메뉴 → 고정 클릭 시 onToggleActive 호출 + 메뉴 닫힘", () => {
    const onToggleActive = vi.fn();
    render(
      <TodoItem
        {...baseProps}
        todo={baseTodo}
        onToggleActive={onToggleActive}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "할 일 메뉴 열기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /고정/ }));
    expect(onToggleActive).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("메뉴 → 삭제 클릭 시 onDelete 호출 + 메뉴 닫힘", () => {
    const onDelete = vi.fn();
    render(<TodoItem {...baseProps} todo={baseTodo} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "할 일 메뉴 열기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /삭제/ }));
    expect(onDelete).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("완료 항목 메뉴는 '고정' 미노출 (삭제만)", () => {
    render(
      <TodoItem
        {...baseProps}
        todo={{ ...baseTodo, done: true, completedAt: "2026-01-01T00:00:00.000Z" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "할 일 메뉴 열기" }));
    expect(
      screen.queryByRole("menuitem", { name: /고정/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /삭제/ }),
    ).toBeInTheDocument();
  });

  it("텍스트 클릭 → 인라인 편집 input 진입 + Enter 저장 → onEditText 호출", () => {
    const onEditText = vi.fn();
    render(
      <TodoItem {...baseProps} todo={baseTodo} onEditText={onEditText} />,
    );
    fireEvent.click(screen.getByText("할 일 하나"));
    const input = screen.getByDisplayValue("할 일 하나") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "수정된 내용" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEditText).toHaveBeenCalledWith("t1", "수정된 내용");
  });

  it("ESC 키는 편집 취소 — onEditText 미호출", () => {
    const onEditText = vi.fn();
    render(
      <TodoItem {...baseProps} todo={baseTodo} onEditText={onEditText} />,
    );
    fireEvent.click(screen.getByText("할 일 하나"));
    const input = screen.getByDisplayValue("할 일 하나") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "잘못 입력" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onEditText).not.toHaveBeenCalled();
    // 편집 모드 종료 — 원래 텍스트 복귀.
    expect(screen.getByText("할 일 하나")).toBeInTheDocument();
  });

  it("완료된 todo는 텍스트 클릭해도 편집 진입 안 함", () => {
    render(
      <TodoItem
        {...baseProps}
        todo={{ ...baseTodo, done: true, completedAt: "2026-01-01T00:00:00.000Z" }}
      />,
    );
    fireEvent.click(screen.getByText("할 일 하나"));
    expect(
      screen.queryByDisplayValue("할 일 하나"),
    ).not.toBeInTheDocument();
  });

  it("완료 시 label에 line-through opacity-40 적용", () => {
    const done: Todo = {
      ...baseTodo,
      done: true,
      completedAt: "2026-01-01T00:00:00.000Z",
    };
    render(<TodoItem {...baseProps} todo={done} />);
    const label = screen.getByText("할 일 하나");
    expect(label.className).toContain("line-through");
    expect(label.className).toContain("opacity-40");
  });
});
