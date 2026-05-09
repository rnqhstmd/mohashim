import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  getEconomy,
  getInventory,
  getMailbox,
  STORE_DEFAULTS,
  type Inventory,
} from "../../lib/storage";
import { onEconomyUpdated } from "../../lib/economy";
import { onMailboxDeeplink, onMailboxUpdated } from "../../lib/mailbox";
import { onInventoryUpdated } from "../../lib/shop";
import { useScoreTick } from "../../lib/score";
import { focusStart } from "../../lib/timer";
import { useToastQueue } from "../../lib/toast";
import { usePhrase } from "../../lib/usePhrase";
import { BottomTabBar, type Tab } from "./BottomTabBar";
import { MailboxScreen } from "./MailboxScreen";
import { MainHeader } from "./MainHeader";
import { SettingsScreen } from "./SettingsScreen";
import { ShopTab } from "./ShopTab";
import { ToastContainer } from "./Toast";
import { TodosTab } from "./TodosTab";
import { GrassTab } from "./GrassTab";

type MainScreenProps = {
  onResetDone: () => void;
};

// Mohashim Design.html(NOTE_BG) — 따뜻한 노트 페이퍼 표면.
//   1) SVG feTurbulence 페이퍼 섬유 노이즈 (baseFrequency 1.4, opacity 0.045)
//   2) 27/28px 가로 ruled lines (rgba(60,50,40,0.035))
//   3) 좌상/우하 warm vignette
const NOTE_PAPER_BG: CSSProperties = {
  backgroundImage: [
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.20  0 0 0 0 0.18  0 0 0 0 0.14  0 0 0 0.045 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
    "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(60,50,40,0.035) 27px, rgba(60,50,40,0.035) 28px)",
    "radial-gradient(ellipse at 30% 20%, rgba(255,253,247,0.5), transparent 60%)",
    "radial-gradient(ellipse at 80% 85%, rgba(200,190,175,0.18), transparent 55%)",
  ].join(","),
};

/**
 * 메인 팝업 화면 (Phase 26 재구조).
 *
 * 구조:
 *   overlayScreen에 따라 분기:
 *   - "mailbox": <MailboxScreen onClose={...} /> 단독 (BottomTabBar 숨김)
 *   - "settings": <SettingsScreen onClose={...} /> 단독 (BottomTabBar 숨김)
 *   - null: <MainHeader> + <main>(tab) + <BottomTabBar> + <ToastContainer>
 *
 * 3탭 구조: todos / grass / shop. mailbox/settings는 헤더 아이콘으로 진입.
 *
 * Phase 6 wiring (옵션 A 통합 — M1):
 * - todos 탭은 항상 <TodosTab key={tab} />을 렌더하며, 내부에서 phase에 따라 PomodoroCard /
 *   FocusStartButton 분기를 처리한다. MainScreen은 IdleScreen/PomodoroRunning을 직접 분기하지 않는다.
 * - score-tick의 state/db/total을 추출하여 usePhrase로 멘트/potatoState를 산출 후 TodosTab에 전달.
 * - useToastQueue는 본 컴포넌트에서만 단일 호출하여 ToastContainer에 toasts 전달.
 *
 * Phase 26 추가:
 * - sprouts state: economy 잔액. economy-updated 이벤트로 갱신 (FR-22, AC-14).
 * - overlayScreen state: mailbox/settings 풀스크린 진입 (FR-20).
 * - mailbox-deeplink listener는 overlayScreen("mailbox")로 진입 (AC-15).
 */
export function MainScreen({ onResetDone }: MainScreenProps) {
  const snap = useScoreTick();
  const [tab, setTab] = useState<Tab>("todos");
  const [overlayScreen, setOverlayScreen] = useState<
    "mailbox" | "settings" | null
  >(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Phase 27 FR-11: settings 오버레이 활성 시 mailbox-deeplink 수신 신호.
  // SettingsScreen이 본 신호를 감지하여 더티 판정(view !== "main")에 따라 confirm 다이얼로그
  // 노출 여부를 결정. 사용자 결정 후 onPendingDeeplinkChange(false)로 reset된다.
  const [pendingDeeplink, setPendingDeeplink] = useState<boolean>(false);
  // Phase 25 FR-1: 캐릭터 레이어 장착 상태. Rust inventory-updated 이벤트로 갱신.
  const [equipped, setEquipped] = useState<Inventory["equipped"]>(() => ({
    ...STORE_DEFAULTS.inventory.equipped,
  }));
  // Phase 26 FR-22: economy 잔액 — todos 카드의 dB 행에 통합 표시 (AC-14).
  const [sprouts, setSprouts] = useState<number>(0);

  // Phase 23 FR-14: mailbox 뱃지 초기화 + mailbox-updated 이벤트로 갱신.
  // Phase 26 AC-15: mailbox-deeplink 수신 시 overlayScreen="mailbox"로 진입.
  useEffect(() => {
    let cancelled = false;
    const refreshUnread = async () => {
      const letters = await getMailbox().catch(() => []);
      if (!cancelled) setUnreadCount(letters.filter((l) => !l.read).length);
    };
    void refreshUnread();
    let unlistenUpdated: (() => void) | undefined;
    let unlistenDeeplink: (() => void) | undefined;
    void onMailboxUpdated(() => { void refreshUnread(); }).then((ul) => {
      if (cancelled) {
        ul();
        return;
      }
      unlistenUpdated = ul;
    });
    void onMailboxDeeplink((_letterId) => {
      // Phase 27 FR-11: settings 활성 시 SettingsScreen에 위임 (서브뷰 더티 confirm).
      // settings가 아니면 (메인 또는 mailbox 자체) 즉시 mailbox 진입.
      // setOverlayScreen 직접 사용 — closure stale state 회피 위해 functional update로 비교.
      setOverlayScreen((curr) => {
        if (curr === "settings") {
          setPendingDeeplink(true);
          return curr;
        }
        // curr === "mailbox" 또는 null. mailbox 진입 (재진입 시 state 동일하므로 no-op,
        // 사용자는 이미 편지함을 보고 있음 — UX 무반응 허용).
        return "mailbox";
      });
    }).then((ul) => {
      if (cancelled) {
        ul();
        return;
      }
      unlistenDeeplink = ul;
    });
    return () => {
      cancelled = true;
      unlistenUpdated?.();
      unlistenDeeplink?.();
    };
  }, []);

  // Phase 25 FR-1, BR-4: 마운트 + inventory-updated 이벤트 수신 시 equipped 재조회.
  // mailbox 패턴과 동일 — cancelled flag + then-callback에서 cancelled 체크 후 unlisten 즉시 호출.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const inv = await getInventory().catch((err) => {
        console.error("[mohashim] inventory load failed", err);
        return null;
      });
      if (!cancelled && inv) setEquipped(inv.equipped);
    };
    void refresh();
    let unlisten: (() => void) | undefined;
    void onInventoryUpdated(() => {
      void refresh();
    }).then((ul) => {
      if (cancelled) {
        ul();
        return;
      }
      unlisten = ul;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Phase 26 FR-22 / AC-14: economy 마운트 + economy-updated 구독.
  // inventory 패턴과 동일.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const eco = await getEconomy().catch((err) => {
        console.error("[mohashim] economy load failed", err);
        return null;
      });
      if (!cancelled && eco) setSprouts(eco.sprouts);
    };
    void refresh();
    let unlisten: (() => void) | undefined;
    void onEconomyUpdated(() => {
      void refresh();
    }).then((ul) => {
      if (cancelled) {
        ul();
        return;
      }
      unlisten = ul;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  const phase = snap?.phase ?? "idle";
  const timeLeft = snap?.timeLeft ?? 0;
  const total = snap?.total ?? 0;
  const engineState = snap?.state ?? "calm";
  const noiseLoudActive = snap?.noiseLoud ?? false;
  // Phase 21 사용자 피드백: 평상시/집중 모두에서 dB 측정 UI가 노출되어야 함.
  const db = snap?.db ?? 50;

  const { phrase, potatoState } = usePhrase(
    snap
      ? { phase, total, state: engineState, noiseLoudActive }
      : null
  );

  const toastQueue = useToastQueue();

  // Phase 21 사용자 피드백: 세션 완료 토스트는 제거. 직전 세션 점수는 idle 상태의
  // FocusStartButton 상단 "🏆 직전 세션" 배지로 노출되어 동일 정보가 충돌 없이 전달.
  // Toast 인프라는 다른 메시지(에러/안내) 용으로 유지.

  // Focus 진입 시 자동으로 todos 탭으로 전환하여 PomodoroCard가 보이도록.
  // 외부 트리거 등으로 settings 탭에 머무는 동안 Focus가 시작될 때를 대비한 fail-safe.
  // focusStart 실패 시 IPC 에러는 이미 timer.ts에서 console.error로 기록됨.
  // 다음 score-tick에서 phase=idle이 확인되면 FocusStartButton으로 자연 복귀하므로 swallow.
  const handleFocusStart = async () => {
    setTab("todos");
    try {
      await focusStart();
    } catch {
      // no-op: 다음 tick에서 phase=idle 확인 시 FocusStartButton으로 복귀
    }
  };

  // Phase 27 PR review: SettingsScreen에 전달하는 onAcceptDeeplink 콜백 메모이제이션.
  // 매 렌더마다 새 함수 인스턴스 생성을 방지하여 SettingsScreen의 useEffect 의존성 안정화.
  const handleAcceptDeeplink = useCallback(() => {
    setOverlayScreen("mailbox");
  }, []);

  return (
    <div
      className="relative flex h-[460px] w-[320px] flex-col overflow-hidden rounded-[18px] bg-paperBg font-kyobo text-ink"
      style={NOTE_PAPER_BG}
    >
      {/* Phase 26 FR-20 / AC-15: overlayScreen 분기. mailbox/settings는 풀스크린 단독,
          BottomTabBar 숨김 (Q&A 결정 2). null이면 메인 헤더 + 탭 + 바텀바 노출. */}
      {overlayScreen === "mailbox" ? (
        <MailboxScreen onClose={() => setOverlayScreen(null)} />
      ) : overlayScreen === "settings" ? (
        <SettingsScreen
          onResetDone={onResetDone}
          onClose={() => setOverlayScreen(null)}
          pendingDeeplink={pendingDeeplink}
          onPendingDeeplinkChange={setPendingDeeplink}
          onAcceptDeeplink={handleAcceptDeeplink}
        />
      ) : (
        <>
          {/* Phase 26 FR-20 / MA-2: 우상단 헤더 — ModeChip + 편지함 + 톱니바퀴.
              모든 탭 공통 노출. todos 탭의 카드 내부 chip(PomodoroCard 등)은 그대로 유지 —
              카드 진행 표시. 외곽 헤더와 시각 영역 분리. */}
          <MainHeader
            phase={phase}
            unreadCount={unreadCount}
            onOpenMailbox={() => setOverlayScreen("mailbox")}
            onOpenSettings={() => setOverlayScreen("settings")}
          />
          <main className="flex flex-1 flex-col overflow-hidden">
            {tab === "todos" ? (
              <TodosTab
                key={tab}
                phase={phase}
                timeLeft={timeLeft}
                potatoState={potatoState}
                phrase={phrase}
                db={db}
                total={total}
                equipped={equipped}
                sprouts={sprouts}
                onFocusStart={handleFocusStart}
              />
            ) : tab === "grass" ? (
              <GrassTab key={tab} />
            ) : (
              <ShopTab key={tab} />
            )}
          </main>
          <BottomTabBar tab={tab} onChange={setTab} />
          <ToastContainer toasts={toastQueue.toasts} />
        </>
      )}
    </div>
  );
}
