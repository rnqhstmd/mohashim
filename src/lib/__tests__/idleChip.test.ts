import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useIdleChipLabel", () => {
  it("returns empty string when active=false", async () => {
    const { useIdleChipLabel } = await import("../idleChip");
    const { result } = renderHook(({ active }) => useIdleChipLabel(active), {
      initialProps: { active: false },
    });
    expect(result.current).toBe("");
  });

  it("returns one of IDLE_LABELS on mount when active=true", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { useIdleChipLabel, IDLE_LABELS } = await import("../idleChip");
    const { result } = renderHook(() => useIdleChipLabel(true));
    expect(IDLE_LABELS).toContain(result.current);
    expect(result.current).toBe(IDLE_LABELS[0]);
  });

  it("rotates index by +1 every 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { useIdleChipLabel, IDLE_LABELS } = await import("../idleChip");
    const { result } = renderHook(() => useIdleChipLabel(true));
    expect(result.current).toBe(IDLE_LABELS[0]);

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current).toBe(IDLE_LABELS[1]);

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current).toBe(IDLE_LABELS[2]);
  });

  it("wraps around to index 0 after 7 rotations (8*7=56s)", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { useIdleChipLabel, IDLE_LABELS } = await import("../idleChip");
    const { result } = renderHook(() => useIdleChipLabel(true));
    expect(result.current).toBe(IDLE_LABELS[0]);

    act(() => {
      vi.advanceTimersByTime(8000 * 7);
    });
    expect(result.current).toBe(IDLE_LABELS[0]);
  });

  it("returns empty string after switching active=true → false", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { useIdleChipLabel, IDLE_LABELS } = await import("../idleChip");
    const { result, rerender } = renderHook(
      ({ active }) => useIdleChipLabel(active),
      { initialProps: { active: true } }
    );
    expect(IDLE_LABELS).toContain(result.current);
    rerender({ active: false });
    expect(result.current).toBe("");
  });

  it("re-randomizes start index on re-entry to active=true", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { useIdleChipLabel, IDLE_LABELS } = await import("../idleChip");
    const { result, rerender } = renderHook(
      ({ active }) => useIdleChipLabel(active),
      { initialProps: { active: true } }
    );
    expect(result.current).toBe(IDLE_LABELS[0]);

    rerender({ active: false });
    expect(result.current).toBe("");

    randomSpy.mockReturnValue(0.5); // 0.5 * 7 = 3.5 → floor = 3
    rerender({ active: true });
    expect(result.current).toBe(IDLE_LABELS[3]);
  });

  it("clears interval on unmount", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { useIdleChipLabel } = await import("../idleChip");
    const { unmount } = renderHook(() => useIdleChipLabel(true));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
