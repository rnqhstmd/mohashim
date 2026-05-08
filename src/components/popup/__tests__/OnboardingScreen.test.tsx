import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "../OnboardingScreen";
import type { PermissionState } from "../../../lib/permissions";

const baseProps = {
  // 기본 OS = macOS — 기존 테스트는 macOS 분기(시스템 설정 deep-link)를 검증한다.
  // Windows 분기는 별도 테스트에서 os="windows"로 명시하여 검증.
  os: "macos" as const,
  isConsenting: false,
  onConsent: () => {},
  onRequestMic: () => {},
  onRequestAccessibility: () => {},
  onRequestNotification: () => {},
  onOpenSettings: () => {},
};

const allNotDetermined: PermissionState = {
  mic: "not_determined",
  accessibility: "not_determined",
  notification: "not_determined",
};

const allGranted: PermissionState = {
  mic: "granted",
  accessibility: "granted",
  notification: "granted",
};

const micDenied: PermissionState = {
  mic: "denied",
  accessibility: "not_determined",
  notification: "not_determined",
};

const onlyAccessibilityDenied: PermissionState = {
  mic: "granted",
  accessibility: "denied",
  notification: "not_determined",
};

/**
 * Phase 21 토글 구조 (사용자 피드백 반영) — 권한 카드 안에 별도 액션 버튼 대신
 * 우측 토글 스위치를 두고, granted 외 상태에서 토글 클릭 시 적절한 액션을 분기.
 *
 * 토글 분기:
 *   - 마이크 not_determined → onRequestMic
 *   - 마이크 denied → onOpenSettings("microphone")
 *   - 접근성 not_granted → onOpenSettings("accessibility")
 *   - 알림 not_granted → onRequestNotification
 *
 * 알림 권한은 시작하기 게이트에 포함되지 않음 (선택).
 */
describe("OnboardingScreen — Phase 21 토글 구조", () => {
  it("3개 권한 카드 모두 렌더 (마이크/접근성/알림)", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(screen.getByText("마이크 권한")).toBeInTheDocument();
    expect(screen.getByText("접근성 권한")).toBeInTheDocument();
    expect(screen.getByText("알림 권한")).toBeInTheDocument();
  });

  it("필수/선택 배지 위계 명시", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(screen.getAllByText("필수")).toHaveLength(2);
    expect(screen.getByText("선택")).toBeInTheDocument();
  });

  it("privacy footer 노출", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(
      screen.getByText("모든 정보는 PC에만 저장돼요"),
    ).toBeInTheDocument();
  });

  it("토글 스위치는 role=switch로 권한별 1개씩 (총 3개)", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(3);
    for (const sw of switches) {
      expect(sw.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("granted 토글은 aria-checked=true + disabled (시스템에서만 해제)", () => {
    render(<OnboardingScreen {...baseProps} permissions={allGranted} />);
    const switches = screen.getAllByRole("switch");
    for (const sw of switches) {
      expect(sw.getAttribute("aria-checked")).toBe("true");
      expect(sw).toBeDisabled();
    }
  });

  it("마이크 not_determined → 토글 클릭 시 onRequestMic 호출", () => {
    const onRequestMic = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allNotDetermined}
        onRequestMic={onRequestMic}
      />,
    );
    // 마이크 카드의 토글은 첫 번째.
    const micToggle = screen.getAllByRole("switch")[0];
    fireEvent.click(micToggle);
    expect(onRequestMic).toHaveBeenCalledTimes(1);
  });

  it("마이크 denied → 토글 클릭 시 onOpenSettings('microphone') 호출", () => {
    const onOpenSettings = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={micDenied}
        onOpenSettings={onOpenSettings}
      />,
    );
    const micToggle = screen.getAllByRole("switch")[0];
    fireEvent.click(micToggle);
    expect(onOpenSettings).toHaveBeenCalledWith("microphone");
  });

  it("접근성 not_granted → 토글 클릭 시 onOpenSettings('accessibility') 호출 (macOS)", () => {
    const onOpenSettings = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={onlyAccessibilityDenied}
        onOpenSettings={onOpenSettings}
      />,
    );
    // 접근성 카드의 토글은 두 번째.
    const accessibilityToggle = screen.getAllByRole("switch")[1];
    fireEvent.click(accessibilityToggle);
    expect(onOpenSettings).toHaveBeenCalledWith("accessibility");
  });

  it("접근성 not_granted → Windows에선 onOpenSettings 대신 onRequestAccessibility 호출 (시스템 설정 비노출, TOFU)", () => {
    const onOpenSettings = vi.fn();
    const onRequestAccessibility = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        os="windows"
        permissions={onlyAccessibilityDenied}
        onOpenSettings={onOpenSettings}
        onRequestAccessibility={onRequestAccessibility}
      />,
    );
    const accessibilityToggle = screen.getAllByRole("switch")[1];
    fireEvent.click(accessibilityToggle);
    // Windows: ms-settings:privacy를 열지 않고 즉시 INTERACTED 마킹 경로로 진입.
    expect(onRequestAccessibility).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("알림 not_determined → 토글 클릭 시 onRequestNotification 호출", () => {
    const onRequestNotification = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allNotDetermined}
        onRequestNotification={onRequestNotification}
      />,
    );
    // 알림 카드의 토글은 세 번째.
    const notificationToggle = screen.getAllByRole("switch")[2];
    fireEvent.click(notificationToggle);
    expect(onRequestNotification).toHaveBeenCalledTimes(1);
  });

  it("최하단 시작하기 버튼: mic+accessibility granted 시에만 활성 (notification 무관)", () => {
    const { rerender } = render(
      <OnboardingScreen {...baseProps} permissions={allNotDetermined} />,
    );
    expect(
      screen.getByRole("button", { name: /시작하기/ }),
    ).toBeDisabled();

    rerender(<OnboardingScreen {...baseProps} permissions={onlyAccessibilityDenied} />);
    expect(
      screen.getByRole("button", { name: /시작하기/ }),
    ).toBeDisabled();

    rerender(<OnboardingScreen {...baseProps} permissions={allGranted} />);
    expect(
      screen.getByRole("button", { name: /시작하기/ }),
    ).not.toBeDisabled();

    // notification denied여도 mic+accessibility granted면 시작 가능 (선택 권한).
    rerender(
      <OnboardingScreen
        {...baseProps}
        permissions={{
          mic: "granted",
          accessibility: "granted",
          notification: "denied",
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /시작하기/ }),
    ).not.toBeDisabled();
  });

  it("최하단 시작하기 버튼 클릭 시 onConsent 호출 (mic+accessibility granted)", () => {
    const onConsent = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allGranted}
        onConsent={onConsent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /시작하기/ }));
    expect(onConsent).toHaveBeenCalledTimes(1);
  });

  it("isConsenting → 시작하기 버튼이 '권한 요청 중...' + 비활성", () => {
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allGranted}
        isConsenting
      />,
    );
    const btn = screen.getByRole("button", { name: "권한 요청 중..." });
    expect(btn).toBeDisabled();
  });

  it("status pill 표기 (거절됨/미요청/허용됨)", () => {
    render(<OnboardingScreen {...baseProps} permissions={micDenied} />);
    expect(screen.getByText("거절됨")).toBeInTheDocument();
    // accessibility + notification 모두 not_determined → "미요청" 2개 노출.
    expect(screen.getAllByText("미요청").length).toBeGreaterThanOrEqual(1);
  });

  it("권한별 카드 내부에 '허용하기'/'요청하기' 류 별도 버튼 미노출 (토글로 통합)", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(
      screen.queryByRole("button", { name: "마이크 권한 허용 요청" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "시스템 설정에서 허용하기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "알림 권한 허용 요청" }),
    ).not.toBeInTheDocument();
  });
});
