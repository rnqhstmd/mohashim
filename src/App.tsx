import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import {
  getOnboardingCompleted,
  initStorage,
  setOnboardingCompleted,
} from "./lib/storage";
import {
  canEnterMain,
  getPermissionStatus,
  openPermissionSettings,
  requestAccessibilityPermission,
  requestMicrophonePermission,
  type PermissionKind,
  type PermissionState,
} from "./lib/permissions";
import { attachTrayClickListener, type TargetOs } from "./lib/trayPopup";
import { OnboardingScreen } from "./components/popup/OnboardingScreen";
import { MainScreen } from "./components/popup/MainScreen";
import { PopupTail } from "./components/PopupTail";

type BootStatus = "loading" | "ready";

function App() {
  const [bootStatus, setBootStatus] = useState<BootStatus>("loading");
  const [permissions, setPermissions] = useState<PermissionState>({
    mic: "not_determined",
    accessibility: "not_determined",
  });
  const [onboardingCompleted, setOnboardingCompletedState] = useState(false);
  const [isConsenting, setIsConsenting] = useState(false);
  const [os, setOs] = useState<TargetOs | null>(null);
  const isRefreshingRef = useRef(false);

  // 부트: Storage init + 권한 status + onboarding 플래그 1회 조회.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initStorage();
        const [perms, oc] = await Promise.all([
          getPermissionStatus(),
          getOnboardingCompleted(),
        ]);
        if (cancelled) return;
        setPermissions(perms);
        // BR-7: onboarding_completed 플래그는 동의 버튼 클릭 경로에서만 설정.
        // 권한 사전 granted여도 OnboardingScreen은 표시되며, 동의 버튼 클릭 시
        // handleConsent가 자연스럽게 통과시킨다 (다이얼로그 미발생, 즉시 완료).
        setOnboardingCompletedState(oc);
      } catch (err) {
        console.error("[mohashim] boot failed", err);
      } finally {
        if (!cancelled) setBootStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // focus 재조회 (D3, FR-9). inflight lock으로 동시 실행 차단 (C6).
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenP = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      getPermissionStatus()
        .then(setPermissions)
        .catch(() => {})
        .finally(() => {
          isRefreshingRef.current = false;
        });
    });
    return () => {
      void unlistenP.then((fn) => fn());
    };
  }, []);

  // OS 판별 + tray-click listener 등록 (PopupTail position + FR-E3, AC-T26).
  // platform() 1회 호출로 OS state 설정과 listener 등록을 모두 처리.
  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;
    (async () => {
      try {
        const p = await platform();
        if (cancelled) return;
        const targetOs: TargetOs = p === "macos" ? "macos" : "windows";
        setOs(targetOs);
        detach = await attachTrayClickListener(targetOs);
        if (cancelled) {
          detach?.();
          detach = null;
        }
      } catch (e) {
        console.error("[mohashim] platform/tray-click setup failed", e);
      }
    })();
    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  const handleConsent = async () => {
    if (isConsenting) return;
    setIsConsenting(true);
    try {
      const mic = await requestMicrophonePermission();
      if (mic !== "granted") {
        const next = await getPermissionStatus();
        setPermissions(next);
        return;
      }
      await requestAccessibilityPermission();
      const next = await getPermissionStatus();
      setPermissions(next);
      if (canEnterMain(next)) {
        await setOnboardingCompleted(true);
        setOnboardingCompletedState(true);
      }
    } finally {
      setIsConsenting(false);
    }
  };

  const handleOpenSettings = (kind: PermissionKind) => {
    void openPermissionSettings(kind);
  };

  if (bootStatus === "loading") {
    return (
      <div className="flex h-[460px] w-[320px] items-center justify-center bg-mist font-pretendard" />
    );
  }

  const canEnter = onboardingCompleted && canEnterMain(permissions);
  return (
    <div
      className="relative h-[460px] w-[320px]"
      style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))" }}
    >
      {canEnter ? (
        <MainScreen onResetDone={() => setOnboardingCompletedState(false)} />
      ) : (
        <OnboardingScreen
          permissions={permissions}
          isConsenting={isConsenting}
          onConsent={handleConsent}
          onOpenSettings={handleOpenSettings}
        />
      )}
      {os && (
        <PopupTail position={os === "macos" ? "top" : "bottom"} tailX={270} />
      )}
    </div>
  );
}

export default App;
