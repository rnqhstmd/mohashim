# lifecycle 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 데이터 관리

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| FR-24 | 모든 데이터 초기화 — 로컬 DB 완전 삭제 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | reset_all command + ResetConfirmModal "모하" 정확 일치 + 즉시 onboarding 복귀 |

## 디자인 결정

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| DEC-1 | Pretendard 폰트 앱 번들 동봉 (CDN 미사용, 오프라인 보장) | ✅ | [#1](https://github.com/rnqhstmd/mohashim/pull/1) | woff2 4종 + OFL 1.1 LICENSE 동봉 |
| DEC-9 | 마이크·접근성 권한 모두 필수. 거절 시 OnboardingScreen 복귀 (부분 거절 동작 미지원) | ✅ | [#1](https://github.com/rnqhstmd/mohashim/pull/1) | canEnterMain 게이팅 + OS deep link |
| DEC-11 | 앱 재시작 = 진행 중 세션 자동 discard. phase/timeLeft 보존 X | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | active_phase 9번째 키 영속 + auto_discard_on_boot가 setup에서 score::start 이전 실행 |
| DEC-12 | 데이터 초기화 friction — SettingsScreen 하단 빨간 텍스트 버튼 + 모달에서 "모하" 타이핑 + store JSON 전체 삭제 + onboarding 리부팅 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | SettingsScreen 빨간 버튼 + ResetConfirmModal "모하" 정확 일치 + reset_all command + setOnboardingCompletedState(false) |
| DEC-13 | 라이트 모드 only (MVP) — 다크 모드는 v0.1 범위 외 | ✅ | [#1](https://github.com/rnqhstmd/mohashim/pull/1) | tailwind darkMode:"class" + dark variant 0건 |
| DEC-15 | 첫 실행 감지 = `onboarding_completed: bool` 플래그 in store. 시스템 권한 거절 상태면 플래그 무시하고 강제 노출 | ✅ | [#1](https://github.com/rnqhstmd/mohashim/pull/1) | App.tsx canEnter = onboardingCompleted && canEnterMain |
