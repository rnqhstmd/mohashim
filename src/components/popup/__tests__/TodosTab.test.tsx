import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Phase 18 영역 D — TimerDetailScreen 자동 닫힘 명문화 (FR-D2/D3, AC-D2~D4).
 *
 * 본 테스트는 TodosTab의 phase effect만 검증한다 — phase=idle/complete 진입 시
 * timer-detail에서 list 자동 복귀 (AC-D2/D3), phase=focus/break 유지 시 view 유지 (FR-D3).
 *
 * mock 전략 (H — design-critic CONSIDER C-4 반영):
 *   - storage: TodosTab이 import하는 모든 함수를 명시적으로 mock — 실 디스크 I/O 차단.
 *   - @tauri-apps/api/core: invoke를 noop으로 — record_todo_completion 등이 호출되어도 무해.
 *   - PomodoroCard: onTimerClick prop을 노출하는 단순 button mock — 실제 Potato 렌더 회피.
 *   - FocusStartButton: 단순 button mock — phase=idle 진입 후 list 복귀 검증용.
 */

vi.mock("../../../lib/storage", () => ({
  getTodos: vi.fn().mockResolvedValue([]),
  setTodos: vi.fn().mockResolvedValue(undefined),
  getWorkTags: vi.fn().mockResolvedValue([]),
  getLocations: vi.fn().mockResolvedValue([]),
  flush: vi.fn().mockResolvedValue(undefined),
  recordTodoAdded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../PomodoroCard", () => ({
  PomodoroCard: ({ onTimerClick }: { onTimerClick: () => void }) => (
    <button type="button" onClick={onTimerClick}>
      timer-mock
    </button>
  ),
}));

vi.mock("../FocusStartButton", () => ({
  FocusStartButton: () => <button type="button">focus-start-mock</button>,
}));

import { TodosTab } from "../TodosTab";
import type { Phase } from "../../../lib/score";
import type { PotatoState } from "../../../lib/phrases";

// Phase 25 FR-1: 캐릭터 레이어 prop 회귀 — 모든 슬롯 미장착 기본값.
const EMPTY_EQUIPPED = { face: null, head: null, back: null };

type RenderProps = {
  phase: Phase;
};

function renderTab({ phase }: RenderProps) {
  return render(
    <TodosTab
      phase={phase}
      timeLeft={1500}
      potatoState={"focused" as PotatoState}
      phrase="집중 중"
      db={50}
      total={75}
      equipped={EMPTY_EQUIPPED}
      onFocusStart={() => Promise.resolve()}
    />
  );
}

describe("TodosTab phase effect (FR-D1~D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-D2: phase=focus → timer-detail 진입 → phase=idle 전환 시 list 자동 복귀.
  it("returns to list when phase transitions focus → idle (AC-D2)", async () => {
    const { rerender } = renderTab({ phase: "focus" });
    // 초기 로드 완료 대기 — PomodoroCard mock이 phase=focus에서 노출됨.
    await waitFor(() => {
      expect(screen.getByText("timer-mock")).toBeInTheDocument();
    });
    // PomodoroCard 클릭 → view=timer-detail.
    fireEvent.click(screen.getByText("timer-mock"));
    expect(
      screen.getByRole("button", { name: "뒤로가기" })
    ).toBeInTheDocument();

    // phase=idle 전환 → effect로 view=list 복귀.
    rerender(
      <TodosTab
        phase="idle"
        timeLeft={1500}
        potatoState={"calm" as PotatoState}
        phrase="시작해볼까"
        db={50}
        total={75}
        equipped={EMPTY_EQUIPPED}
        onFocusStart={() => Promise.resolve()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("focus-start-mock")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "뒤로가기" })
    ).not.toBeInTheDocument();
  });

  // AC-D3: phase=focus → timer-detail 진입 → phase=complete 전환 시 list 자동 복귀.
  it("returns to list when phase transitions focus → complete (AC-D3)", async () => {
    const { rerender } = renderTab({ phase: "focus" });
    await waitFor(() => {
      expect(screen.getByText("timer-mock")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("timer-mock"));
    expect(
      screen.getByRole("button", { name: "뒤로가기" })
    ).toBeInTheDocument();

    rerender(
      <TodosTab
        phase="complete"
        timeLeft={0}
        potatoState={"focused" as PotatoState}
        phrase="완료"
        db={50}
        total={75}
        equipped={EMPTY_EQUIPPED}
        onFocusStart={() => Promise.resolve()}
      />
    );
    await waitFor(() => {
      // phase=complete는 PomodoroCard mock이 노출되며 timer-detail은 닫힘.
      expect(screen.getByText("timer-mock")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "뒤로가기" })
    ).not.toBeInTheDocument();
  });

  // FR-D3: phase=focus 유지 시 view=timer-detail 유지.
  it("keeps timer-detail view while phase stays focus (FR-D3)", async () => {
    const { rerender } = renderTab({ phase: "focus" });
    await waitFor(() => {
      expect(screen.getByText("timer-mock")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("timer-mock"));
    expect(
      screen.getByRole("button", { name: "뒤로가기" })
    ).toBeInTheDocument();

    // 동일 phase=focus 재렌더 — view 유지.
    rerender(
      <TodosTab
        phase="focus"
        timeLeft={1400}
        potatoState={"focused" as PotatoState}
        phrase="집중 중"
        db={50}
        total={75}
        equipped={EMPTY_EQUIPPED}
        onFocusStart={() => Promise.resolve()}
      />
    );
    expect(
      screen.getByRole("button", { name: "뒤로가기" })
    ).toBeInTheDocument();
  });

  // FR-D3: phase=focus → break 전환은 timer-detail 유지 (focus/break 모두 mm:ss 의미 있음).
  it("keeps timer-detail view when phase transitions focus → break (FR-D3)", async () => {
    const { rerender } = renderTab({ phase: "focus" });
    await waitFor(() => {
      expect(screen.getByText("timer-mock")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("timer-mock"));
    expect(
      screen.getByRole("button", { name: "뒤로가기" })
    ).toBeInTheDocument();

    rerender(
      <TodosTab
        phase="break"
        timeLeft={300}
        potatoState={"calm" as PotatoState}
        phrase="휴식 중"
        db={50}
        total={75}
        equipped={EMPTY_EQUIPPED}
        onFocusStart={() => Promise.resolve()}
      />
    );
    expect(
      screen.getByRole("button", { name: "뒤로가기" })
    ).toBeInTheDocument();
  });
});
