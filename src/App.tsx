import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import {
  getOnboardingCompleted,
  initStorage,
  setOnboardingCompleted,
} from "./lib/storage";
import { cleanupCompletedTodos, seedDefaultTags } from "./lib/todos";
import {
  canEnterMain,
  getPermissionStatus,
  openPermissionSettings,
  requestAccessibilityPermission,
  requestMicrophonePermission,
  requestNotificationPermission,
  restoreMicInteracted,
  type PermissionKind,
  type PermissionState,
} from "./lib/permissions";
import { attachTrayClickListener, type TargetOs } from "./lib/trayPopup";
import { OnboardingScreen } from "./components/popup/OnboardingScreen";
import { MainScreen } from "./components/popup/MainScreen";
import { PinGuideModal } from "./components/popup/PinGuideModal";
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
  // 트레이 우클릭 → "작업 표시줄에 고정 안내" 클릭 시 Rust에서 emit하는 이벤트로 토글.
  const [showPinGuide, setShowPinGuide] = useState(false);
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
        // 일별 청소: 어제 이전 완료 todo 삭제 (잔디에 이미 기록됨).
        // 미완료는 모두 보존 — 사용자가 이월하여 다시 도전 가능.
        await cleanupCompletedTodos();
        let [perms, oc] = await Promise.all([
          getPermissionStatus(),
          getOnboardingCompleted(),
        ]);
        if (cancelled) return;
        const isWin = platform() === "windows";
        // Windows TOFU 보강: oc=true이면 사용자가 이전에 권한 부여하여 메인에 진입한
        // 적이 있다는 의미. Rust MIC_INTERACTED atomic이 프로세스 종료 시 reset된
        // 케이스를 자동 복원하여 권한 토글이 OFF로 보이는 시각 회귀를 차단한다.
        if (oc && perms.mic !== "granted" && isWin) {
          try {
            const restoredMic = await restoreMicInteracted();
            perms = { ...perms, mic: restoredMic };
          } catch (err) {
            console.error("[mohashim] mic atomic restore failed", err);
          }
        }
        setPermissions(perms);
        // 부팅 시 권한이 모두 부여된 상태가 아니면 oc를 false로 리셋하던 가드는 macOS
        // 한정으로 유지한다. Windows에서는 atomic 변수가 프로세스 휘발성이라 부팅 시점
        // 에 mic=not_granted로 보일 수 있고, 가드가 disk oc=true를 false로 영구 덮어쓰면
        // 매 재실행마다 웰컴 페이지로 돌아가는 무한 회귀가 발생하므로 비활성화한다.
        // (사용자가 시스템 설정에서 마이크를 명시 거부한 경우는 OS API 부재로 검출 불가
        // 하지만 audio thread가 dB=0 폴백으로 동작하여 앱은 살아있음.)
        const granted = canEnterMain(perms);
        const effectiveOc = isWin ? oc : oc && granted;
        if (oc && !isWin && !effectiveOc) {
          // macOS 전용: 디스크에도 false 영속 — 다음 부팅에서 동일 게이트 통과 회피.
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

  // 트레이 우클릭 메뉴 "작업 표시줄에 고정 안내" → Rust가 emit한 "show-pin-guide" 수신.
  useEffect(() => {
    const unlistenP = listen("show-pin-guide", () => {
      setShowPinGuide(true);
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

  // 접근성 토글 — Windows에선 OS 권한 자체가 부재하므로 시스템 설정을 열지 않고
  // 즉시 INTERACTED 마킹 + Granted 반환 (TOFU). macOS는 시스템 설정 deep-link 경로
  // (handleOpenSettings)로 분기되며 본 핸들러는 호출되지 않는다.
  const handleRequestAccessibility = async () => {
    if (isConsenting) return;
    setIsConsenting(true);
    try {
      await requestAccessibilityPermission();
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
          os={os}
          permissions={permissions}
          isConsenting={isConsenting}
          onConsent={handleConsent}
          onRequestMic={handleRequestMic}
          onRequestAccessibility={handleRequestAccessibility}
          onRequestNotification={handleRequestNotification}
          onOpenSettings={handleOpenSettings}
        />
      )}
      <PinGuideModal
        open={showPinGuide}
        onClose={() => setShowPinGuide(false)}
      />
    </div>
  );
}

export default App;
