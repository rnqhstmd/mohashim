import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "../OnboardingScreen";
import type { PermissionState } from "../../../lib/permissions";

const baseProps = {
  isConsenting: false,
  onConsent: () => {},
  onRequestMic: () => {},
  onOpenSettings: () => {},
};

const allNotDetermined: PermissionState = {
  mic: "not_determined",
  accessibility: "not_determined",
};

const allGranted: PermissionState = {
  mic: "granted",
  accessibility: "granted",
};

const micDenied: PermissionState = {
  mic: "denied",
  accessibility: "not_determined",
};

const onlyAccessibilityDenied: PermissionState = {
  mic: "granted",
  accessibility: "denied",
};

describe("OnboardingScreen — Phase 21 재구조", () => {
  it("renders microphone and accessibility cards", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(screen.getByText("마이크 권한")).toBeInTheDocument();
    expect(screen.getByText("접근성 권한")).toBeInTheDocument();
  });

  it("shows privacy footer text", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(
      screen.getByText("모든 정보는 PC에만 저장돼요"),
    ).toBeInTheDocument();
    expect(screen.queryByText("🔒")).not.toBeInTheDocument();
  });

  it("마이크 not_determined → 카드 안에 '마이크 권한 허용 요청' 버튼", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(
      screen.getByRole("button", { name: "마이크 권한 허용 요청" }),
    ).toBeInTheDocument();
  });

  it("마이크 not_determined + 카드 버튼 클릭 → onRequestMic 호출 (onConsent 호출 X)", () => {
    const onRequestMic = vi.fn();
    const onConsent = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allNotDetermined}
        onRequestMic={onRequestMic}
        onConsent={onConsent}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "마이크 권한 허용 요청" }),
    );
    expect(onRequestMic).toHaveBeenCalledTimes(1);
    expect(onConsent).not.toHaveBeenCalled();
  });

  it("마이크 denied → 카드 안에 '시스템 설정에서 허용하기' 버튼", () => {
    const onOpenSettings = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={micDenied}
        onOpenSettings={onOpenSettings}
      />,
    );
    const buttons = screen.getAllByRole("button", {
      name: "시스템 설정에서 허용하기",
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(buttons[0]);
    expect(onOpenSettings).toHaveBeenCalledWith("microphone");
  });

  it("접근성 not_granted → 카드 안에 '시스템 설정에서 허용하기' 버튼", () => {
    const onOpenSettings = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={onlyAccessibilityDenied}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "시스템 설정에서 허용하기" }),
    );
    expect(onOpenSettings).toHaveBeenCalledWith("accessibility");
  });

  it("최하단 시작하기 버튼: 둘 다 granted 시에만 활성", () => {
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
  });

  it("최하단 시작하기 버튼 클릭 시 onConsent 호출 (둘 다 granted 상태)", () => {
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

  it("granted 카드는 카드 내부 액션 버튼 미노출 (마이크)", () => {
    // 마이크만 granted
    render(<OnboardingScreen {...baseProps} permissions={onlyAccessibilityDenied} />);
    // 접근성 카드의 시스템 설정 버튼은 1개만 (마이크 카드에는 없음)
    const buttons = screen.queryAllByRole("button", {
      name: "시스템 설정에서 허용하기",
    });
    expect(buttons).toHaveLength(1);
  });

  it("renders status indicators per permission state", () => {
    render(<OnboardingScreen {...baseProps} permissions={micDenied} />);
    expect(screen.getByText("거절됨")).toBeInTheDocument();
    expect(screen.getByText("미요청")).toBeInTheDocument();
  });

  it("hides all action buttons when both permissions are granted", () => {
    render(<OnboardingScreen {...baseProps} permissions={allGranted} />);
    expect(
      screen.queryByRole("button", { name: "마이크 권한 허용 요청" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "시스템 설정에서 허용하기" }),
    ).not.toBeInTheDocument();
  });
});
