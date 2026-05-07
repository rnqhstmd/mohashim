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
  onTailX?: (tailXLogical: number) => void,
): Promise<() => void> {
  const win = getCurrentWindow();
  // Phase 21 사용자 피드백 재개정: 팝업 좌측 선을 아이콘 좌측 끝에 맞춘다 —
  // popup_left = icon_left_logical (메뉴바 트레이 위치 변동에도 일관 정렬).
  // 화면 우측 경계로 clamp되면 popup_left가 좌측으로 시프트되며, tail은
  // icon_center - popup_left로 동기화하여 항상 아이콘 중심을 가리키도록 한다
  // (onTailX 콜백). Rust apply_initial_position과 동일 공식.
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
        const iconLeftLogical = event.payload.x / sf;
        const iconRightLogical =
          (event.payload.x + event.payload.iconWidth) / sf;
        const iconCenterXLogical =
          (event.payload.x + event.payload.iconWidth / 2) / sf;
        const iconBottomYLogical =
          (event.payload.y + event.payload.iconHeight) / sf;
        const iconTopYLogical = event.payload.y / sf;
        const monLeftLogical = monitor.position.x / sf;
        const monTopLogical = monitor.position.y / sf;
        const monRightLogical = monLeftLogical + monitor.size.width / sf;
        const monBottomLogical = monTopLogical + monitor.size.height / sf;

        const popupW = 320;
        const popupH = 470;
        // Phase 21 사용자 피드백 (Windows): 우측 끝 트레이 아이콘 케이스에서
        // popup_left = icon_left가 화면 밖으로 나가는 회귀 — popup_right = icon_right로
        // 폴백하여 아이콘이 팝업 우측 하단 모서리 근처에 위치하도록.
        let x = Math.round(
          iconLeftLogical + popupW > monRightLogical
            ? iconRightLogical - popupW
            : iconLeftLogical,
        );
        let y: number;
        if (os === "macos") {
          y = Math.round(iconBottomYLogical);
        } else {
          y = Math.round(iconTopYLogical - popupH);
        }
        x = Math.max(monLeftLogical, Math.min(monRightLogical - popupW, x));
        y = Math.max(monTopLogical, Math.min(monBottomLogical - popupH, y));
        await win.setPosition(new LogicalPosition(x, y));
        // Tail은 popup 좌측에서 (iconCenter - popup_left)px 위치 — clamp 후에도
        // 정확히 아이콘 중심을 가리킨다. 양 끝 보정으로 popup 폭 안쪽으로 강제.
        if (onTailX) {
          const rawTailX = iconCenterXLogical - x;
          const tailX = Math.max(8, Math.min(popupW - 28, rawTailX));
          onTailX(tailX);
        }
      } catch (e) {
        console.error("[mohashim] tray-click position adjust failed", e);
      }
    },
  );
  return unlisten;
}
