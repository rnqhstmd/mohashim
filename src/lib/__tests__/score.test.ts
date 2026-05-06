import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listenMock = vi.fn();
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

beforeEach(() => {
  listenMock.mockReset();
  unlistenMock.mockReset();
  listenMock.mockResolvedValue(unlistenMock);
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useScoreTick", () => {
  it("returns null until first event arrives", async () => {
    const { useScoreTick } = await import("../score");
    const { result } = renderHook(() => useScoreTick());
    expect(result.current).toBeNull();
  });

  it("updates snapshot when score-tick event fires", async () => {
    let handler: ((e: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation(async (_event: string, cb: (e: { payload: unknown }) => void) => {
      handler = cb;
      return unlistenMock;
    });

    const { useScoreTick } = await import("../score");
    const { result } = renderHook(() => useScoreTick());
    await waitFor(() => expect(handler).not.toBeNull());

    const payload = {
      total: 100,
      work: 80,
      noise: 20,
      state: "focused" as const,
      db: 50.0,
      secondsIdle: 0,
      grace: "active" as const,
      phase: "idle" as const,
      timeLeft: 0,
      noiseLoud: false,
    };
    act(() => {
      handler!({ payload });
    });
    await waitFor(() => expect(result.current).toEqual(payload));
    // PR #11 리뷰: noiseLoud 필드가 ScoreSnapshot 10키 계약에 포함됨을 명시 검증.
    expect(result.current?.noiseLoud).toBe(false);
  });

  it("calls unlisten on unmount (AC-14)", async () => {
    const { useScoreTick } = await import("../score");
    const { unmount } = renderHook(() => useScoreTick());
    await waitFor(() => expect(listenMock).toHaveBeenCalledOnce());
    unmount();
    await waitFor(() => expect(unlistenMock).toHaveBeenCalledOnce());
  });

  it("subscribes to 'score-tick' event name", async () => {
    const { useScoreTick, SCORE_TICK_EVENT } = await import("../score");
    expect(SCORE_TICK_EVENT).toBe("score-tick");
    renderHook(() => useScoreTick());
    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith(
        "score-tick",
        expect.any(Function)
      )
    );
  });
});
