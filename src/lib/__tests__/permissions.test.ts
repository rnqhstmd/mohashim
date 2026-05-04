import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  canEnterMain,
  getPermissionStatus,
  openPermissionSettings,
  requestAccessibilityPermission,
  requestMicrophonePermission,
  type PermissionStatus,
} from "../permissions";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("canEnterMain", () => {
  const statuses: PermissionStatus[] = ["granted", "denied", "not_determined"];

  it("returns true only when both mic and accessibility are granted", () => {
    for (const mic of statuses) {
      for (const accessibility of statuses) {
        const expected = mic === "granted" && accessibility === "granted";
        expect(canEnterMain({ mic, accessibility })).toBe(expected);
      }
    }
  });

  it("granted + granted = true", () => {
    expect(
      canEnterMain({ mic: "granted", accessibility: "granted" })
    ).toBe(true);
  });

  it("granted + denied = false", () => {
    expect(
      canEnterMain({ mic: "granted", accessibility: "denied" })
    ).toBe(false);
  });

  it("not_determined + not_determined = false", () => {
    expect(
      canEnterMain({
        mic: "not_determined",
        accessibility: "not_determined",
      })
    ).toBe(false);
  });
});

describe("getPermissionStatus", () => {
  it("forwards Tauri response on success", async () => {
    mockedInvoke.mockResolvedValueOnce({
      mic: "granted",
      accessibility: "denied",
    });
    await expect(getPermissionStatus()).resolves.toEqual({
      mic: "granted",
      accessibility: "denied",
    });
    expect(mockedInvoke).toHaveBeenCalledWith("permission_status");
  });

  it("falls back to denied/denied on invoke error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("ipc fail"));
    await expect(getPermissionStatus()).resolves.toEqual({
      mic: "denied",
      accessibility: "denied",
    });
  });
});

describe("requestMicrophonePermission", () => {
  it("returns invoke result on success", async () => {
    mockedInvoke.mockResolvedValueOnce("granted");
    await expect(requestMicrophonePermission()).resolves.toBe("granted");
    expect(mockedInvoke).toHaveBeenCalledWith("request_microphone_permission");
  });

  it("returns 'denied' on invoke error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("boom"));
    await expect(requestMicrophonePermission()).resolves.toBe("denied");
  });
});

describe("requestAccessibilityPermission", () => {
  it("returns invoke result on success", async () => {
    mockedInvoke.mockResolvedValueOnce("not_determined");
    await expect(requestAccessibilityPermission()).resolves.toBe(
      "not_determined"
    );
    expect(mockedInvoke).toHaveBeenCalledWith(
      "request_accessibility_permission"
    );
  });

  it("returns 'denied' on invoke error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("boom"));
    await expect(requestAccessibilityPermission()).resolves.toBe("denied");
  });
});

describe("openPermissionSettings", () => {
  it("invokes with kind payload", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    await openPermissionSettings("microphone");
    expect(mockedInvoke).toHaveBeenCalledWith("open_permission_settings", {
      kind: "microphone",
    });
  });

  it("swallows errors", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("nope"));
    await expect(openPermissionSettings("accessibility")).resolves.toBeUndefined();
  });
});
