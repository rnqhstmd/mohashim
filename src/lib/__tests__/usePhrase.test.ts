import { StrictMode, createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { usePhrase } from "../usePhrase";
import { POTATO_PHRASES } from "../phrases";
import type { LiveState, Phase } from "../score";

type Ctx = {
  phase: Phase;
  total: number;
  db: number;
  state: LiveState;
  noiseLoudActive: boolean;
};

const idleCtx: Ctx = {
  phase: "idle",
  total: 0,
  db: 50,
  state: "calm",
  noiseLoudActive: false,
};
const focusHighCtx: Ctx = {
  phase: "focus",
  total: 90,
  db: 50,
  state: "focused",
  noiseLoudActive: false,
};
const noiseLoudCtx: Ctx = {
  phase: "idle",
  total: 0,
  db: 90,
  state: "calm",
  noiseLoudActive: true,
};

let mockRandom: MockInstance<() => number>;

beforeEach(() => {
  vi.useFakeTimers();
  // Math.random 결정성 확보: 기본값 0 → pickPhrase는 항상 [0]번 멘트를 반환.
  // 특정 it에서 mockReturnValueOnce를 체이닝하여 다음 호출만 다른 값으로 덮어쓴다.
  mockRandom = vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePhrase", () => {
  it("AC-10: 첫 렌더 idle ctx → bucket='idle', phrase=idle[0], potatoState='calm'", () => {
    const { result } = renderHook(() => usePhrase(idleCtx));
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    expect(result.current.potatoState).toBe("calm");
  });

  it("AC-11 (BR-1): 8000ms 경과 시 다음 멘트로 회전", () => {
    const { result } = renderHook(() => usePhrase(idleCtx));
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);

    // setInterval 콜백의 pickPhrase 호출에서만 idle[targetIdx]를 반환하도록 stub.
    // targetIdx / length는 floor 시 항상 targetIdx → length 변경에도 의도 보존.
    const targetIdx = 1;
    mockRandom.mockReturnValueOnce(targetIdx / POTATO_PHRASES.idle.length);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[targetIdx]);
  });

  it("BR-1 경계: 7999ms에서는 멘트 변화 없음, +1ms 시점에 변경", () => {
    const { result } = renderHook(() => usePhrase(idleCtx));
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);

    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);

    const targetIdx = 1;
    mockRandom.mockReturnValueOnce(targetIdx / POTATO_PHRASES.idle.length);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[targetIdx]);
  });

  it("AC-13 (BR-2): bucket 변경 시 새 버킷 첫 멘트 즉시 갱신", () => {
    const { result, rerender } = renderHook(({ ctx }) => usePhrase(ctx), {
      initialProps: { ctx: idleCtx },
    });

    // idle에서 8초 경과 → idle[targetIdx]로 회전
    const targetIdx = 1;
    mockRandom.mockReturnValueOnce(targetIdx / POTATO_PHRASES.idle.length);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[targetIdx]);

    // focusHigh ctx로 전환 → bucket 변경 시 useEffect의 pickPhrase가 random=0 → focusHigh[0]
    mockRandom.mockReturnValueOnce(0);
    rerender({ ctx: focusHighCtx });
    expect(result.current.bucket).toBe("focusHigh");
    expect(result.current.phrase).toBe(POTATO_PHRASES.focusHigh[0]);
    expect(result.current.potatoState).toBe("focused");
  });

  it("AC-12 (BR-5): usePhrase(null) → idle 버킷 첫 멘트 + calm potatoState", () => {
    const { result } = renderHook(() => usePhrase(null));
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    expect(result.current.potatoState).toBe("calm");
  });

  it("noiseLoud: noiseLoudActive=true 시 bucket='noiseLoud', potatoState='covering'", () => {
    const { result } = renderHook(() => usePhrase(noiseLoudCtx));
    expect(result.current.bucket).toBe("noiseLoud");
    expect(result.current.phrase).toBe(POTATO_PHRASES.noiseLoud[0]);
    expect(result.current.potatoState).toBe("covering");
  });

  // Phase 11 신규 케이스: hysteresis 미충족 (1~4초 누적 중) 시 idle 유지.
  it("Phase 11 (FR-7): phase=idle, db=90, noiseLoudActive=false → bucket='idle', potatoState='calm'", () => {
    const ctx: Ctx = {
      phase: "idle",
      total: 0,
      db: 90,
      state: "calm",
      noiseLoudActive: false,
    };
    const { result, unmount } = renderHook(() => usePhrase(ctx));
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    expect(result.current.potatoState).toBe("calm");
    unmount();
  });

  it("Phase 11 (MA-1): phase=idle, db=50, noiseLoudActive=true → bucket='noiseLoud', potatoState='covering' (db 무관)", () => {
    const ctx: Ctx = {
      phase: "idle",
      total: 0,
      db: 50,
      state: "calm",
      noiseLoudActive: true,
    };
    const { result, unmount } = renderHook(() => usePhrase(ctx));
    expect(result.current.bucket).toBe("noiseLoud");
    expect(result.current.phrase).toBe(POTATO_PHRASES.noiseLoud[0]);
    expect(result.current.potatoState).toBe("covering");
    unmount();
  });

  it("cleanup: unmount 후 setInterval 미발화 (clearInterval 호출 검증)", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = renderHook(() => usePhrase(idleCtx));
    const initialCalls = clearSpy.mock.calls.length;
    unmount();
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(initialCalls + 1);
  });

  it("StrictMode 이중 invoke에서도 첫 렌더 phrase=idle[0] 보장", () => {
    const { result, unmount } = renderHook(
      ({ input }: { input: typeof idleCtx }) => usePhrase(input),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
        initialProps: { input: idleCtx },
      }
    );
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    // fakeTimers 환경에서 명시적 unmount — afterEach의 useRealTimers 이전에 cleanup 수행.
    unmount();
  });

  it("BR-6 방어: phase='discarded' 입력 시 idle 폴백 (bucket='idle')", () => {
    const discardedCtx: Ctx = {
      phase: "discarded",
      total: 0,
      db: 50,
      state: "calm",
      noiseLoudActive: false,
    };
    const { result, unmount } = renderHook(() => usePhrase(discardedCtx));
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    expect(result.current.potatoState).toBe("calm");
    // fakeTimers 환경에서 명시적 unmount — afterEach의 useRealTimers 이전에 cleanup 수행.
    unmount();
  });
});
