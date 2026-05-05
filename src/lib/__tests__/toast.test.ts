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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useToastQueue", () => {
  it("starts with empty toasts array", async () => {
    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());
    expect(result.current.toasts).toEqual([]);
  });

  it("subscribes to 'toast' event on mount", async () => {
    const { useToastQueue } = await import("../toast");
    renderHook(() => useToastQueue());
    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith("toast", expect.any(Function))
    );
  });

  it("push appends a toast and auto-dismisses after 3 seconds", async () => {
    vi.useFakeTimers();
    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.push({ kind: "info", text: "hello" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].kind).toBe("info");
    expect(result.current.toasts[0].text).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("listen handler pushes payload into queue", async () => {
    let handler: ((e: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation(
      async (_event: string, cb: (e: { payload: unknown }) => void) => {
        handler = cb;
        return unlistenMock;
      }
    );

    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      handler!({ payload: { kind: "complete", text: "세션 완료" } });
    });
    await waitFor(() => expect(result.current.toasts).toHaveLength(1));
    expect(result.current.toasts[0].kind).toBe("complete");
    expect(result.current.toasts[0].text).toBe("세션 완료");
  });

  it("multiple toasts coexist and dismiss independently after 3s", async () => {
    vi.useFakeTimers();
    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.push({ kind: "info", text: "a" });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.push({ kind: "complete", text: "b" });
    });
    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].text).toBe("b");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("dismiss removes the matching toast immediately", async () => {
    vi.useFakeTimers();
    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.push({ kind: "info", text: "x" });
    });
    const id = result.current.toasts[0].id;
    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("calls unlisten on unmount", async () => {
    const { useToastQueue } = await import("../toast");
    const { unmount } = renderHook(() => useToastQueue());
    await waitFor(() => expect(listenMock).toHaveBeenCalledOnce());
    unmount();
    await waitFor(() => expect(unlistenMock).toHaveBeenCalledOnce());
  });

  it("invalid payload (missing text) — 큐 미추가 + console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let handler: ((e: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation(
      async (_event: string, cb: (e: { payload: unknown }) => void) => {
        handler = cb;
        return unlistenMock;
      }
    );

    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      handler!({ payload: { kind: "complete" } }); // text 누락
    });

    expect(result.current.toasts).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      "[mohashim] invalid toast payload",
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it("invalid payload (unknown kind) — 큐 미추가 + console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let handler: ((e: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation(
      async (_event: string, cb: (e: { payload: unknown }) => void) => {
        handler = cb;
        return unlistenMock;
      }
    );

    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      handler!({ payload: { kind: "unknown", text: "x" } });
    });

    expect(result.current.toasts).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      "[mohashim] invalid toast payload",
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it("invalid payload (null) — 큐 미추가 + console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let handler: ((e: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation(
      async (_event: string, cb: (e: { payload: unknown }) => void) => {
        handler = cb;
        return unlistenMock;
      }
    );

    const { useToastQueue } = await import("../toast");
    const { result } = renderHook(() => useToastQueue());
    await waitFor(() => expect(handler).not.toBeNull());

    act(() => {
      handler!({ payload: null });
    });

    expect(result.current.toasts).toHaveLength(0);
    // null payload 케이스 — expect.anything()가 null을 매칭하지 않으므로 두 번째 인자는 명시적 null로 검증.
    expect(errorSpy).toHaveBeenCalledWith(
      "[mohashim] invalid toast payload",
      null
    );
    errorSpy.mockRestore();
  });

  it("clears pending timers on unmount", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(global, "clearTimeout");
    const { useToastQueue } = await import("../toast");
    const { result, unmount } = renderHook(() => useToastQueue());

    act(() => {
      result.current.push({ kind: "info", text: "a" });
      result.current.push({ kind: "info", text: "b" });
    });
    expect(result.current.toasts).toHaveLength(2);
    const initialClearCalls = clearSpy.mock.calls.length;
    unmount();
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(
      initialClearCalls + 2
    );
  });
});
