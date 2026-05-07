import { listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  getCurrentWindow,
  LogicalPosition,
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
 * Phase 19 FR-A1/A2: 트레이 클릭 좌표(`payload.x/y`) 기반으로 모니터를 매칭한다.
 * `currentMonitor()`(앱 윈도우 기준)는 듀얼 모니터에서 잘못된 모니터를 반환할 수 있어
 * `availableMonitors()` + 좌표 매칭으로 교체. 매칭 실패 시 `monitors[0]` 폴백,
 * 그래도 undefined면 위치 보정 없이 show/focus만 수행한다 (가시성 우선).
 *
 * 반환값은 listener cleanup 함수.
 */
/**
 * Phase 19 FR-A1: 트레이 클릭 물리 좌표가 속하는 모니터를 매칭한다.
 *
 * 매칭 술어: 좌상단 inclusive + 우하단 exclusive (인접 모니터 동시 매칭 회피).
 * 매칭 실패 시 `monitors[0]` 폴백 (FR-A2). 빈 목록은 undefined 반환 → 호출자 null 가드.
 */
export function pickMonitorForPoint<
  M extends {
    position: { x: number; y: number };
    size: { width: number; height: number };
  },
>(monitors: readonly M[], x: number, y: number): M | undefined {
  const found = monitors.find(
    (m) =>
      x >= m.position.x &&
      x < m.position.x + m.size.width &&
      y >= m.position.y &&
      y < m.position.y + m.size.height,
  );
  return found ?? monitors[0];
}

export async function attachTrayClickListener(
  os: TargetOs,
): Promise<() => void> {
  const win = getCurrentWindow();
  // Phase 21: Rust(tray.rs)가 visibility(show/hide) 토글을 담당한다. JS는 위치
  // 정밀화만 담당 — Rust가 default 위치에 잠시 띄운 직후 JS가 정확한 트레이
  // 아이콘 아래 좌표로 setPosition. 두 측이 같은 동작을 하지 않도록 분리하여
  // race/double-toggle 회피.
  const unlisten = await listen<TrayClickPayload>(
    "tray-click",
    async (event) => {
      try {
        const monitors = await availableMonitors();
        let monitor = pickMonitorForPoint(
          monitors,
          event.payload.x,
          event.payload.y,
        );
        if (!monitor) monitor = monitors[0];
        if (!monitor) return;

        const sf = monitor.scaleFactor;
        // tray-click payload는 physical 좌표. 모니터 정보 + sf로 logical 좌표 계산.
        const iconCenterXPhys = event.payload.x + event.payload.iconWidth / 2;
        const iconCenterXLogical = iconCenterXPhys / sf;
        const iconBottomYPhys = event.payload.y + event.payload.iconHeight;
        const iconTopYPhys = event.payload.y;
        const monLeftLogical = monitor.position.x / sf;
        const monTopLogical = monitor.position.y / sf;
        const monRightLogical = monLeftLogical + monitor.size.width / sf;
        const monBottomLogical = monTopLogical + monitor.size.height / sf;

        const popupW = 320;
        const popupH = 470;
        // PopupTail.tsx에서 tailX={270} (logical, popup 좌측에서 270px)을 기준으로
        // 트레이 아이콘 중심과 일치시킨다. popup_left + 270 = iconCenter → popup_left
        // = iconCenter - 270. 화면 밖으로 나가지 않도록 아래 clamp.
        const tailXFromPopupLeft = 270;
        let x = Math.round(iconCenterXLogical - tailXFromPopupLeft);
        let y: number;
        if (os === "macos") {
          y = Math.round(iconBottomYPhys / sf);
        } else {
          y = Math.round(iconTopYPhys / sf - popupH);
        }
        x = Math.max(monLeftLogical, Math.min(monRightLogical - popupW, x));
        y = Math.max(monTopLogical, Math.min(monBottomLogical - popupH, y));
        await win.setPosition(new LogicalPosition(x, y));
      } catch (e) {
        console.error("[mohashim] tray-click position adjust failed", e);
      }
    },
  );
  return unlisten;
}
