# lifecycle 용어 사전

| 용어 | 설명 |
|------|------|
| 권한 게이팅 | 마이크·접근성 권한 둘 다 받기 전엔 메인 팝업 진입 차단. OnboardingScreen 강제 노출 |
| OnboardingScreen | 첫 실행 + 권한 미허용 상태에서 표시. 권한 카드 2개 + 동의 버튼 |
| 양 권한 필수 정책 (DEC-9) | 마이크·접근성 둘 중 하나라도 거절되면 메인 진입 X. 부분 거절 동작 미지원 |
| 첫 실행 플래그 | store에 `onboarding_completed: bool`. true면 onboarding 건너뜀. 단 시스템 권한이 거절 상태면 플래그 무시하고 강제 노출 |
| OS 설정 deep link | macOS `x-apple.systempreferences:` URL / Windows 설정 URI. 사용자를 권한 화면으로 직접 안내 |
| 자동 discard (재시작) | 앱 종료 후 재시작 시 진행 중이던 세션 무조건 discard. phase/timeLeft 보존 X |
| 데이터 초기화 | store JSON 전체 삭제 → 메모리 리셋 → onboarding 리부팅 |
| 위험 영역 초기화 (DEC-12) | SettingsScreen 최하단 빨간 텍스트 버튼. 모달에서 "모하" 타이핑해야 활성화 (실수 방지 friction) |
| tauri-plugin-store | 오프라인 로컬 JSON 저장 플러그인. 본 앱의 모든 영속 데이터 |
| Pretendard 번들 (DEC-1) | woff2 폰트 파일을 `src/assets/fonts/`에 동봉. CDN 미사용 → 오프라인 보장 |
| 라이트 모드 only (DEC-13) | v0.1은 라이트 모드만. 다크 모드는 추후 |
| Privacy badge | OnboardingScreen 카드 하단 "🔒 모든 데이터는 내 컴퓨터에만" pill. BLUE_LIGHT 배경 + BLUE_DEEP 보더 |
| 권한 점수 분배 표시 | OnboardingScreen 권한 카드 우측 — 마이크 카드="20점" / 접근성 카드="80점" 초록 pill |
