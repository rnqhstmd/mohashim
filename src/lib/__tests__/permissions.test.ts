import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted as notifIsGranted,
  requestPermission as notifRequest,
} from "@tauri-apps/plugin-notification";
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

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedNotifIsGranted = vi.mocked(notifIsGranted);
const mockedNotifRequest = vi.mocked(notifRequest);

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedNotifIsGranted.mockReset();
  mockedNotifRequest.mockReset();
});

describe("canEnterMain", () => {
  const statuses: PermissionStatus[] = ["granted", "denied", "not_determined"];

  it("returns true only when both mic and accessibility are granted (notification 무관)", () => {
    for (const mic of statuses) {
      for (const accessibility of statuses) {
        for (const notification of statuses) {
          const expected = mic === "granted" && accessibility === "granted";
          expect(canEnterMain({ mic, accessibility, notification })).toBe(
            expected
          );
        }
      }
    }
  });

  it("granted + granted + notification denied = true (선택 권한)", () => {
    expect(
      canEnterMain({
        mic: "granted",
        accessibility: "granted",
        notification: "denied",
      })
    ).toBe(true);
  });

  it("granted + denied = false", () => {
    expect(
      canEnterMain({
        mic: "granted",
        accessibility: "denied",
        notification: "granted",
      })
    ).toBe(false);
  });

  it("not_determined + not_determined = false", () => {
    expect(
      canEnterMain({
        mic: "not_determined",
        accessibility: "not_determined",
        notification: "not_determined",
      })
    ).toBe(false);
  });
});

describe("getPermissionStatus", () => {
  it("forwards Tauri response + notification status on success", async () => {
    mockedInvoke.mockResolvedValueOnce({
      mic: "granted",
      accessibility: "denied",
    });
    mockedNotifIsGranted.mockResolvedValueOnce(true);
    await expect(getPermissionStatus()).resolves.toEqual({
      mic: "granted",
      accessibility: "denied",
      notification: "granted",
    });
    expect(mockedInvoke).toHaveBeenCalledWith("permission_status");
  });

  it("notification not granted maps to not_determined (선택 권한)", async () => {
    mockedInvoke.mockResolvedValueOnce({
      mic: "granted",
      accessibility: "granted",
    });
    mockedNotifIsGranted.mockResolvedValueOnce(false);
    await expect(getPermissionStatus()).resolves.toEqual({
      mic: "granted",
      accessibility: "granted",
      notification: "not_determined",
    });
  });

  it("falls back to denied/denied/denied on invoke error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("ipc fail"));
    mockedNotifIsGranted.mockResolvedValueOnce(false);
    await expect(getPermissionStatus()).resolves.toEqual({
      mic: "denied",
      accessibility: "denied",
      notification: "denied",
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
