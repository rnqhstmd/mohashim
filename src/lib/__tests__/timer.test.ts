import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("timer", () => {
  it("focusStart invokes 'focus_start' tauri command", async () => {
    const { focusStart } = await import("../timer");
    await focusStart();
    expect(invokeMock).toHaveBeenCalledWith("focus_start");
  });

  it("focusStart logs to console.error and re-throws on failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error("ipc failure"));
    const { focusStart } = await import("../timer");
    await expect(focusStart()).rejects.toThrow("ipc failure");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("discardSession invokes 'discard_session' tauri command", async () => {
    const { discardSession } = await import("../timer");
    await discardSession();
    expect(invokeMock).toHaveBeenCalledWith("discard_session");
  });

  it("discardSession logs to console.error and re-throws on failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error("ipc failure"));
    const { discardSession } = await import("../timer");
    await expect(discardSession()).rejects.toThrow("ipc failure");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
