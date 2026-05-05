import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { OnboardingScreen } from "./components/popup/OnboardingScreen";

type BootStatus = "loading" | "ready";

function MainScreen() {
  return (
    <div className="flex h-[460px] w-[320px] flex-col items-center justify-center bg-mist font-pretendard text-ink">
      <h1 className="text-lg font-bold text-deep">모하심</h1>
      <p className="mt-2 text-sm text-deep/70">준비 중</p>
    </div>
  );
}

function App() {
  const [bootStatus, setBootStatus] = useState<BootStatus>("loading");
  const [permissions, setPermissions] = useState<PermissionState>({
    mic: "not_determined",
    accessibility: "not_determined",
  });
  const [onboardingCompleted, setOnboardingCompletedState] = useState(false);
  const [isConsenting, setIsConsenting] = useState(false);
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
  return canEnter ? (
    <MainScreen />
  ) : (
    <OnboardingScreen
      permissions={permissions}
      isConsenting={isConsenting}
      onConsent={handleConsent}
      onOpenSettings={handleOpenSettings}
    />
  );
}

export default App;
