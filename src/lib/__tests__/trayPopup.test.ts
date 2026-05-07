import { describe, expect, it } from "vitest";
import { computePopupPosition, pickMonitorForPoint } from "../trayPopup";

type FakeMonitor = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};
const mon = (x: number, y: number, w: number, h: number): FakeMonitor => ({
  position: { x, y },
  size: { width: w, height: h },
});

describe("computePopupPosition", () => {
  it("clamps x to right edge on macOS retina near right of monitor", () => {
    // primary retina monitor 2880x1800 @ sf=2.0, popup logical 320x470 → physical 640x940.
    // payload.x=2820, iconW=44 → iconCenterX=2842.
    // xRaw = round(2842 - (640 - 100)) = 2302. monitor.width - popup.width = 2240.
    // → x clamp = 2240. y = 0 + 44 = 44.
    const result = computePopupPosition(
      { x: 2820, y: 0, iconWidth: 44, iconHeight: 44 },
      { width: 640, height: 940 },
      { x: 0, y: 0, width: 2880, height: 1800 },
      "macos",
    );
    expect(result).toEqual({ x: 2240, y: 44 });
  });

  it("computes Windows tray position (popup above icon, no clamp needed)", () => {
    // 1920x1080 @ sf=1.0, popup 320x470. payload.x=1820, y=1040, icon 32x32.
    // iconCenterX = 1836. xRaw = round(1836 - 270) = 1566. 0 ≤ 1566 ≤ 1600 → no clamp.
    // y = 1040 - 470 = 570. 0 ≤ 570 ≤ 610 → no clamp.
    const result = computePopupPosition(
      { x: 1820, y: 1040, iconWidth: 32, iconHeight: 32 },
      { width: 320, height: 470 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      "windows",
    );
    expect(result).toEqual({ x: 1566, y: 570 });
  });

  it("clamps x to left edge when click is near left of screen (macOS)", () => {
    // payload.x=10, iconW=22 → iconCenterX=21. xRaw = round(21 - 270) = -249.
    // → x clamp = 0. y = 0 + 22 = 22.
    const result = computePopupPosition(
      { x: 10, y: 0, iconWidth: 22, iconHeight: 22 },
      { width: 320, height: 470 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      "macos",
    );
    expect(result).toEqual({ x: 0, y: 22 });
  });

  it("clamps x to right edge when click is near right of screen (macOS)", () => {
    // payload.x=1900, iconW=22 → iconCenterX=1911. xRaw = round(1911 - 270) = 1641.
    // monitor.width - popup.width = 1600 → clamp = 1600. y = 0 + 22 = 22.
    const result = computePopupPosition(
      { x: 1900, y: 0, iconWidth: 22, iconHeight: 22 },
      { width: 320, height: 470 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      "macos",
    );
    expect(result).toEqual({ x: 1600, y: 22 });
  });

  it("clamps y to top edge on Windows when click is near top of screen", () => {
    // payload.x=500, y=30, icon 32x32. popup 320x470.
    // iconCenterX=516. xRaw = round(516 - 270) = 246. 0 ≤ 246 ≤ 1600 → no x clamp.
    // y = 30 - 470 = -440 → clamp = 0.
    const result = computePopupPosition(
      { x: 500, y: 30, iconWidth: 32, iconHeight: 32 },
      { width: 320, height: 470 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      "windows",
    );
    expect(result).toEqual({ x: 246, y: 0 });
  });

  it("respects non-zero monitor origin (secondary monitor)", () => {
    // monitor (1920, 0, 1920, 1080). payload.x=3700, iconW=22 → iconCenterX=3711.
    // xRaw = round(3711 - 270) = 3441. monitor.x=1920, monitor.x+w-popup.w=3520.
    // 1920 ≤ 3441 ≤ 3520 → no clamp. y = 0 + 22 = 22.
    const result = computePopupPosition(
      { x: 3700, y: 0, iconWidth: 22, iconHeight: 22 },
      { width: 320, height: 470 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
      "macos",
    );
    expect(result).toEqual({ x: 3441, y: 22 });
  });
});

describe("pickMonitorForPoint", () => {
  it("좌상단 inclusive — primary 좌상단 (0,0) 매칭", () => {
    const monitors = [mon(0, 0, 1920, 1080), mon(1920, 0, 1920, 1080)];
    expect(pickMonitorForPoint(monitors, 0, 0)).toBe(monitors[0]);
  });

  it("우하단 exclusive — primary 우하단 정확히는 secondary", () => {
    const monitors = [mon(0, 0, 1920, 1080), mon(1920, 0, 1920, 1080)];
    // x=1920은 primary[0,1920) 미포함, secondary[1920,3840) 포함.
    expect(pickMonitorForPoint(monitors, 1920, 0)).toBe(monitors[1]);
  });

  it("secondary 모니터 내부 좌표 매칭", () => {
    const monitors = [mon(0, 0, 1920, 1080), mon(1920, 0, 1920, 1080)];
    expect(pickMonitorForPoint(monitors, 2500, 500)).toBe(monitors[1]);
  });

  it("매칭 실패 시 monitors[0] 폴백 (D-2)", () => {
    const monitors = [mon(0, 0, 1920, 1080), mon(1920, 0, 1920, 1080)];
    // 음수 좌표(어디에도 없음) → monitors[0] 폴백.
    expect(pickMonitorForPoint(monitors, -100, -100)).toBe(monitors[0]);
  });

  it("빈 monitor 목록 → undefined (호출자 null 가드 위임)", () => {
    expect(pickMonitorForPoint([], 0, 0)).toBeUndefined();
  });

  it("음수 좌표 모니터 (macOS 보조 좌측) — 음수 영역 매칭", () => {
    // primary 0, secondary -1920~0
    const monitors = [mon(0, 0, 1920, 1080), mon(-1920, 0, 1920, 1080)];
    expect(pickMonitorForPoint(monitors, -500, 100)).toBe(monitors[1]);
  });
});
