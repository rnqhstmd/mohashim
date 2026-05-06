import { afterEach, describe, expect, it, vi } from "vitest";

// todos.ts는 storage.ts에서 타입과 시드 함수만 import한다. 시드 호출 경로는 본 테스트에서 사용되지 않으나
// storage.ts 모듈 평가 시 tauri plugin이 로드되므로 최소 mock으로 모듈 평가 실패를 차단.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), has: vi.fn(), save: vi.fn() })) },
}));

import { createTodo, toggleDone } from "../todos";
import type { Todo } from "../storage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTodo (FR-1)", () => {
  it("AC-1 (FR-1): 신규 todo 초기 completedAt=null", () => {
    const t = createTodo("hello", null, null);
    expect(t.completedAt).toBeNull();
  });

  it("AC-1: 신규 todo 기본 필드 검증", () => {
    const t = createTodo("text", "wt-1", "loc-1");
    expect(t.text).toBe("text");
    expect(t.tag).toBe("wt-1");
    expect(t.loc).toBe("loc-1");
    expect(t.done).toBe(false);
    expect(t.active).toBe(false);
    expect(t.completedAt).toBeNull();
  });
});

describe("toggleDone (FR-1, AC-1/2)", () => {
  const baseTodo: Todo = {
    id: "t1",
    text: "task",
    done: false,
    tag: null,
    loc: null,
    active: false,
    completedAt: null,
  };

  it("AC-1 (FR-1): 미완료→완료 시 completedAt에 ISO 8601 UTC Z 기록", () => {
    // 시각 결정성을 위해 fake timers 활성화 후 Date 고정.
    vi.useFakeTimers();
    const fixed = new Date("2026-05-06T12:34:56.789Z");
    vi.setSystemTime(fixed);

    const result = toggleDone([baseTodo], "t1");
    const target = result.find((t) => t.id === "t1")!;
    expect(target.done).toBe(true);
    expect(target.completedAt).toBe("2026-05-06T12:34:56.789Z");

    vi.useRealTimers();
  });

  it("AC-2 (FR-1): 완료→미완료 롤백 시 completedAt=null", () => {
    const completed: Todo = {
      ...baseTodo,
      done: true,
      completedAt: "2026-05-06T12:00:00.000Z",
    };
    const result = toggleDone([completed], "t1");
    const target = result.find((t) => t.id === "t1")!;
    expect(target.done).toBe(false);
    expect(target.completedAt).toBeNull();
  });

  it("AC-1: 토글 대상이 아닌 항목의 completedAt은 보존", () => {
    const other: Todo = {
      ...baseTodo,
      id: "t2",
      done: true,
      completedAt: "2026-01-01T00:00:00.000Z",
    };
    const result = toggleDone([baseTodo, other], "t1");
    const preserved = result.find((t) => t.id === "t2")!;
    expect(preserved.completedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("AC-1 (BR-2): 미완료→완료 전환 시 active=false 강제 + completedAt 기록 동시 적용", () => {
    const activeTodo: Todo = { ...baseTodo, active: true };
    const result = toggleDone([activeTodo], "t1");
    const target = result.find((t) => t.id === "t1")!;
    expect(target.done).toBe(true);
    expect(target.active).toBe(false);
    expect(typeof target.completedAt).toBe("string");
  });

  it("AC-1: 존재하지 않는 id 토글 시 변경 없음 (completedAt 미기록)", () => {
    const result = toggleDone([baseTodo], "nonexistent");
    expect(result).toEqual([baseTodo]);
  });
});
