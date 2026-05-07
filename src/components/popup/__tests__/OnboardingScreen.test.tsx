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

const onlyAccessibilityMissing: PermissionState = {
  mic: "granted",
  accessibility: "not_determined",
};

const onlyAccessibilityDenied: PermissionState = {
  mic: "granted",
  accessibility: "denied",
};

describe("OnboardingScreen", () => {
  it("renders microphone and accessibility cards without score pills", () => {
    render(
      <OnboardingScreen {...baseProps} permissions={allNotDetermined} />
    );
    // 카드 타이틀 정확 매칭 — Phase 20에서 버튼 라벨에 "마이크 권한 허용 요청"이 포함되어
    // /마이크 권한/ regex로는 다중 매칭이 발생하므로 정확 문자열로 가드.
    expect(screen.getByText("마이크 권한")).toBeInTheDocument();
    expect(screen.getByText("접근성 권한")).toBeInTheDocument();
    expect(screen.queryByText(/20점/)).not.toBeInTheDocument();
    expect(screen.queryByText(/80점/)).not.toBeInTheDocument();
  });

  it("shows privacy footer text", () => {
    render(<OnboardingScreen {...baseProps} permissions={allNotDetermined} />);
    expect(
      screen.getByText("모든 정보는 PC에만 저장돼요")
    ).toBeInTheDocument();
    // 기존 카피("모든 데이터는 내 컴퓨터에만") 부재 검증.
    expect(
      screen.queryByText(/모든 데이터는 내 컴퓨터에만/)
    ).not.toBeInTheDocument();
    // Phase 20 design.html 정렬: 자물쇠 🔒 뱃지가 footer에 노출되지 않는다.
    // (status indicator 칩은 권한 카드 내부의 rounded-full border 요소이므로
    //  본 검증은 footer 영역에 한정.)
    expect(screen.queryByText("🔒")).not.toBeInTheDocument();
  });

  // Phase 20 사용자 피드백: 시작 버튼 라벨이 권한 상태에 따라 달라지고, 권한이
  // 부족할 때는 disabled로 명확히 차단한다.
  it("shows '마이크 권한 허용 요청' label when mic is not_determined", () => {
    render(
      <OnboardingScreen {...baseProps} permissions={allNotDetermined} />
    );
    expect(
      screen.getByRole("button", { name: "마이크 권한 허용 요청" })
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

  it("shows '시작하기' label and enabled when both permissions are granted", () => {
    render(<OnboardingScreen {...baseProps} permissions={allGranted} />);
    const btn = screen.getByRole("button", { name: /시작하기/ });
    expect(btn).not.toBeDisabled();
  });

  it("disables button with mic-denied message when mic is denied", () => {
    render(<OnboardingScreen {...baseProps} permissions={micDenied} />);
    const btn = screen.getByRole("button", {
      name: /마이크 권한이 거절되었어요/,
    });
    expect(btn).toBeDisabled();
  });

  it("disables button with accessibility prompt when only accessibility is missing", () => {
    render(
      <OnboardingScreen {...baseProps} permissions={onlyAccessibilityMissing} />
    );
    const btn = screen.getByRole("button", {
      name: /접근성 권한을 켜주세요/,
    });
    expect(btn).toBeDisabled();
  });

  it("disables button with accessibility prompt when accessibility is denied", () => {
    render(
      <OnboardingScreen {...baseProps} permissions={onlyAccessibilityDenied} />
    );
    const btn = screen.getByRole("button", {
      name: /접근성 권한을 켜주세요/,
    });
    expect(btn).toBeDisabled();
  });

  it("calls onConsent on click when mic is not_determined", () => {
    const onConsent = vi.fn();
    render(
      <OnboardingScreen
        {...baseProps}
        permissions={allNotDetermined}
        onConsent={onConsent}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "마이크 권한 허용 요청" })
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
