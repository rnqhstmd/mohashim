import { listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalPosition,
} from "@tauri-apps/api/window";

/**
 * Rust `tray-click` 이벤트 페이로드 (FR-E3).
 *
 * Tauri tray IconEvent의 click position과 icon rect를 그대로 전달한다.
 * 좌표/크기는 모두 physical px 기준이다.
 */
export interface TrayClickPayload {
  x: number;
  y: number;
  iconWidth: number;
  iconHeight: number;
}

/** 팝업 윈도우 크기 (physical px). */
export interface PopupGeometryPhysical {
  width: number;
  height: number;
}

/** 모니터 작업 영역 (physical px). FR-E4 기준 primary monitor. */
export interface MonitorBoundsPhysical {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TargetOs = "macos" | "windows";

/**
 * 트레이 클릭 페이로드 → 팝업 좌상단 좌표 (physical px).
 *
 * tail은 popup logical 320 기준 x=270 (아이콘 중심에서 50px 좌측)을 가리키도록
 * 설계되어 있다 (설계서 §9). 따라서 popup의 좌상단 x는
 *   iconCenterX - (popup.width - 50 * scaleFactor)
 * 로 두면 tail이 아이콘 중심 정렬에 가깝게 맞춰진다.
 *
 * y는 OS별로 분기:
 *  - macOS: 메뉴바 하단(아이콘 아래)에 매달리도록 `payload.y + iconHeight`.
 *  - Windows: 시스템 트레이 위(작업표시줄 상단)로 띄우도록 `payload.y - popup.height`.
 *
 * FR-E4: primary monitor + 표준 작업표시줄 가정. 화면 경계로 clamp하여 팝업이
 * 모니터 밖으로 나가지 않도록 한다 (다중 모니터/세로 작업표시줄은 비대상).
 */
export function computePopupPosition(
  payload: TrayClickPayload,
  popup: PopupGeometryPhysical,
  monitor: MonitorBoundsPhysical,
  os: TargetOs,
): { x: number; y: number } {
  const iconCenterX = payload.x + payload.iconWidth / 2;
  const sf = popup.width / 320;
  let x = Math.round(iconCenterX - (popup.width - 50 * sf));
  let y: number;
  if (os === "macos") {
    y = Math.round(payload.y + payload.iconHeight);
  } else {
    y = Math.round(payload.y - popup.height);
  }
  x = Math.max(monitor.x, Math.min(monitor.x + monitor.width - popup.width, x));
  y = Math.max(monitor.y, Math.min(monitor.y + monitor.height - popup.height, y));
  return { x, y };
}

/**
 * Rust `tray-click` 이벤트를 listen하여 팝업 윈도우 토글을 수행한다 (FR-E3).
 *
 * - visible: hide (사용자 결정 = 토글 유지)
 * - hidden: setPosition + show + setFocus
 *
 * `currentMonitor`가 null인 경우(모니터 정보 조회 실패) 위치 보정 없이 show/focus만
 * 수행한다 — 사용자 가시성을 우선 보존한다.
 *
 * 반환값은 listener cleanup 함수.
 */
export async function attachTrayClickListener(
  os: TargetOs,
): Promise<() => void> {
  const win = getCurrentWindow();
  const unlisten = await listen<TrayClickPayload>(
    "tray-click",
    async (event) => {
      try {
        const isVisible = await win.isVisible();
        if (isVisible) {
          await win.hide();
          return;
        }
        const monitor = await currentMonitor();
        if (!monitor) {
          await win.show();
          await win.setFocus();
          return;
        }
        const sf = monitor.scaleFactor;
        const popupPhysical: PopupGeometryPhysical = {
          width: Math.round(320 * sf),
          height: Math.round(470 * sf),
        };
        const monB: MonitorBoundsPhysical = {
          x: monitor.position.x,
          y: monitor.position.y,
          width: monitor.size.width,
          height: monitor.size.height,
        };
        const { x, y } = computePopupPosition(
          event.payload,
          popupPhysical,
          monB,
          os,
        );
        await win.setPosition(new PhysicalPosition(x, y));
        await win.show();
        await win.setFocus();
      } catch (e) {
        console.error("[mohashim] tray-click handler failed", e);
      }
    },
  );
  return unlisten;
}
