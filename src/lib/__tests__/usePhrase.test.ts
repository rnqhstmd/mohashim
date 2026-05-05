import { StrictMode, createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePhrase } from "../usePhrase";
import { POTATO_PHRASES } from "../phrases";
import type { LiveState, Phase } from "../score";

type Ctx = { phase: Phase; total: number; db: number; state: LiveState };

const idleCtx: Ctx = { phase: "idle", total: 0, db: 50, state: "calm" };
const focusHighCtx: Ctx = {
  phase: "focus",
  total: 90,
  db: 50,
  state: "focused",
};
const noiseLoudCtx: Ctx = {
  phase: "idle",
  total: 0,
  db: 90,
  state: "calm",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePhrase", () => {
  it("AC-10: 첫 렌더 idle ctx → bucket='idle', phrase=idle[0], potatoState='calm'", () => {
    const { result } = renderHook(() => usePhrase(idleCtx));
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    expect(result.current.potatoState).toBe("calm");
  });

  it("AC-11 (BR-1): 8000ms 경과 시 seed=1로 증가하여 다음 멘트 순환", () => {
    const { result } = renderHook(() => usePhrase(idleCtx));
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[1]);
  });

  it("BR-1 경계: 7999ms에서는 멘트 변화 없음, +1ms 시점에 변경", () => {
    const { result } = renderHook(() => usePhrase(idleCtx));
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);

    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[1]);
  });

  it("AC-13 (BR-2): bucket 변경 시 seed=0으로 초기화되어 새 버킷 첫 멘트", () => {
    const { result, rerender } = renderHook(({ ctx }) => usePhrase(ctx), {
      initialProps: { ctx: idleCtx },
    });

    // idle에서 8초 경과 → seed=1
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[1]);

    // focusHigh ctx로 전환 → bucket 변경, seed=0 reset
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

  it("noiseLoud: db>80 시 bucket='noiseLoud', potatoState='covering'", () => {
    const { result } = renderHook(() => usePhrase(noiseLoudCtx));
    expect(result.current.bucket).toBe("noiseLoud");
    expect(result.current.phrase).toBe(POTATO_PHRASES.noiseLoud[0]);
    expect(result.current.potatoState).toBe("covering");
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
    };
    const { result, unmount } = renderHook(() => usePhrase(discardedCtx));
    expect(result.current.bucket).toBe("idle");
    expect(result.current.phrase).toBe(POTATO_PHRASES.idle[0]);
    expect(result.current.potatoState).toBe("calm");
    // fakeTimers 환경에서 명시적 unmount — afterEach의 useRealTimers 이전에 cleanup 수행.
    unmount();
  });
});
