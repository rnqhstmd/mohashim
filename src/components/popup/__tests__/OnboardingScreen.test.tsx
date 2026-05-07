import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "../OnboardingScreen";
import type { PermissionState } from "../../../lib/permissions";

const baseProps = {
  isConsenting: false,
  onConsent: () => {},
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

describe("OnboardingScreen", () => {
  it("renders microphone and accessibility cards without score pills", () => {
    render(
      <OnboardingScreen {...baseProps} permissions={allNotDetermined} />
    );
    expect(screen.getByText(/마이크 권한/)).toBeInTheDocument();
    expect(screen.getByText(/접근성 권한/)).toBeInTheDocument();
    expect(screen.queryByText(/20점/)).not.toBeInTheDocument();
    expect(screen.queryByText(/80점/)).not.toBeInTheDocument();
  });

  it("shows privacy footer text", () => {
    const { container } = render(
      <OnboardingScreen {...baseProps} permissions={allNotDetermined} />
    );
    expect(
      screen.getByText("모든 정보는 PC에만 저장돼요")
    ).toBeInTheDocument();
    // 기존 자물쇠 뱃지(🔒 / rounded-full border) 부재 검증.
    expect(
      screen.queryByText(/모든 데이터는 내 컴퓨터에만/)
    ).not.toBeInTheDocument();
    expect(container.querySelector(".rounded-full.border")).toBeNull();
  });

  it("shows consent button label when idle", () => {
    render(
      <OnboardingScreen {...baseProps} permissions={allNotDetermined} />
    );
    expect(
      screen.getByRole("button", { name: "모든 권한 허용하고 시작하기" })
    ).toBeInTheDocument();
  });

  it("disables consent button when isConsenting", () => {
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allNotDetermined}
        isConsenting
      />
    );
    const btn = screen.getByRole("button", { name: "권한 요청 중..." });
    expect(btn).toBeDisabled();
  });

  it("keeps consent button enabled when both permissions are already granted", () => {
    // Fix 2/4 일관성: 이미 granted 상태에서도 사용자 클릭 시 handleConsent가
    // 정상 동작해 onboarding_completed 플래그를 설정하도록 disabled 가드를 제거.
    render(<OnboardingScreen {...baseProps} permissions={allGranted} />);
    const btn = screen.getByRole("button", {
      name: "모든 권한 허용하고 시작하기",
    });
    expect(btn).not.toBeDisabled();
  });

  it("calls onConsent on click", () => {
    const onConsent = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allNotDetermined}
        onConsent={onConsent}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "모든 권한 허용하고 시작하기" })
    );
    expect(onConsent).toHaveBeenCalledTimes(1);
  });

  it("shows deep link for denied microphone and triggers onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={micDenied}
        onOpenSettings={onOpenSettings}
      />
    );
    const links = screen.getAllByRole("button", {
      name: "시스템 설정에서 허용하기",
    });
    // 마이크 카드 + 접근성 카드(not_determined) 두 곳에 노출.
    expect(links.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(links[0]);
    expect(onOpenSettings).toHaveBeenCalledWith("microphone");
  });

  it("shows accessibility hint when accessibility is not granted", () => {
    render(<OnboardingScreen {...baseProps} permissions={micDenied} />);
    expect(
      screen.getByText(
        /시스템 환경설정 → 개인정보 보호 → 손쉬운 사용에서 모하심 체크를 추가하세요/
      )
    ).toBeInTheDocument();
  });

  it("hides deep link when both permissions are granted", () => {
    render(<OnboardingScreen {...baseProps} permissions={allGranted} />);
    expect(
      screen.queryByRole("button", { name: "시스템 설정에서 허용하기" })
    ).not.toBeInTheDocument();
  });

  it("renders status indicators per permission state", () => {
    render(<OnboardingScreen {...baseProps} permissions={micDenied} />);
    expect(screen.getByText("거절됨")).toBeInTheDocument();
    expect(screen.getByText("미요청")).toBeInTheDocument();
  });
});
