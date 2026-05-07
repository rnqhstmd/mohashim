import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import {
  getOnboardingCompleted,
  initStorage,
  setOnboardingCompleted,
} from "./lib/storage";
import { seedDefaultTags } from "./lib/todos";
import {
  canEnterMain,
  getPermissionStatus,
  openPermissionSettings,
  requestMicrophonePermission,
  requestNotificationPermission,
  type PermissionKind,
  type PermissionState,
} from "./lib/permissions";
import { attachTrayClickListener, type TargetOs } from "./lib/trayPopup";
import { OnboardingScreen } from "./components/popup/OnboardingScreen";
import { MainScreen } from "./components/popup/MainScreen";
// Phase 21 사용자 피드백: PopupTail(꼬리 < 도형) 미노출 — 사각형 팝업만 유지.

type BootStatus = "loading" | "ready";

function App() {
  const [bootStatus, setBootStatus] = useState<BootStatus>("loading");
  const [permissions, setPermissions] = useState<PermissionState>({
    mic: "not_determined",
    accessibility: "not_determined",
    notification: "not_determined",
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
        // D-1, AC-seed-timing: initStorage 직후 / UI 렌더 이전에 기본 태그 시드.
        // 내부에서 try/catch swallow하므로 본 effect의 catch 분기로 빠지지 않는다.
        await seedDefaultTags();
        const [perms, oc] = await Promise.all([
          getPermissionStatus(),
          getOnboardingCompleted(),
        ]);
        if (cancelled) return;
        setPermissions(perms);
        // Phase 21 사용자 피드백: 마이크 + 접근성 허용 후 알림 단계 없이 메인으로
        // 자동 전환되는 회귀 — 이전 install에서 stale `onboarding_completed=true`가
        // 디스크에 남아 있고 사용자가 OS에서 권한을 다시 부여하는 시점에
        // canEnter=oc(true)&&canEnterMain(true)로 즉시 통과되던 케이스. 부팅 시
        // 권한이 모두 부여된 상태가 아니면 oc를 강제로 false로 리셋해 사용자가
        // **반드시 시작하기 버튼을 눌러야** 메인으로 진입하도록 한다 (BR-7).
        const granted = canEnterMain(perms);
        const effectiveOc = oc && granted;
        if (oc && !effectiveOc) {
          // 디스크에도 false 영속 — 다음 부팅에서 동일 게이트 통과 회피.
          void setOnboardingCompleted(false);
        }
        setOnboardingCompletedState(effectiveOc);
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
        // Phase 21: PopupTail 미렌더이므로 tailX 콜백 미전달 — 위치 계산만 수행.
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

  // Phase 21: 마이크 카드 안의 "권한 요청" 버튼 전용. 시스템 다이얼로그를 트리거.
  const handleRequestMic = async () => {
    if (isConsenting) return;
    setIsConsenting(true);
    try {
      await requestMicrophonePermission();
      const next = await getPermissionStatus();
      setPermissions(next);
    } finally {
      setIsConsenting(false);
    }
  };

  // Phase 21: 알림 카드 안의 "권한 요청" 버튼. 선택 권한 — 결과와 무관하게 진행.
  const handleRequestNotification = async () => {
    if (isConsenting) return;
    setIsConsenting(true);
    try {
      await requestNotificationPermission();
      const next = await getPermissionStatus();
      setPermissions(next);
    } finally {
      setIsConsenting(false);
    }
  };

  // Phase 21: 최하단 "시작하기" 버튼은 둘 다 granted일 때만 활성화돼서 호출됨.
  // 권한 재확인 후 onboarding_completed 플래그 설정 → MainScreen 전환.
  const handleConsent = async () => {
    if (isConsenting) return;
    setIsConsenting(true);
    try {
      // 최신 권한 상태 재조회 (방어적 — focus listener와 별개로 한 번 더).
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
      <div className="flex h-[460px] w-[320px] items-center justify-center bg-mist font-kyobo" />
    );
  }

  const canEnter = onboardingCompleted && canEnterMain(permissions);
  return (
    <div
      className={`relative h-[470px] w-[320px] flex flex-col ${
        os === "macos" ? "justify-end" : "justify-start"
      }`}
      style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))" }}
    >
      {canEnter ? (
        <MainScreen onResetDone={() => setOnboardingCompletedState(false)} />
      ) : (
        <OnboardingScreen
          permissions={permissions}
          isConsenting={isConsenting}
          onConsent={handleConsent}
          onRequestMic={handleRequestMic}
          onRequestNotification={handleRequestNotification}
          onOpenSettings={handleOpenSettings}
        />
      )}
    </div>
  );
}

export default App;
