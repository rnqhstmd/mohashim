# tray 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 트레이/메뉴바

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| FR-25 | macOS 메뉴바 28px / Windows 시스템 트레이 48px 5단계 아이콘 | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7). macOS 라이트/다크 자동 반전·Windows 실기 검증은 머지 후 수동 |
| FR-26 | 평소=아이콘만, 뽀모도로 진행 중에만 옆에 시간 표시 | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7) |
| FR-37 | Windows 시스템 트레이 UX 정비 — 팝업 위치 보정 + 메뉴 항목 확장 + 첫 부팅 onboarding 트레이 근처 배치 + 권한 흐름 정정 | ✅ | [PR #23](https://github.com/rnqhstmd/mohashim/pull/23). 64a1499(팝업 위치/권한 흐름/알림 토글 deny 분기), 9355298(빌드 안정화 + 메뉴 확장), 86cabe8(메뉴 클릭 팝업 위치 회귀 해소), 2fd941e(첫 부팅 onboarding 트레이 근처 보정), cf8ad86(팝업 안 뜨는 진단 + 아이콘 squircle 해소), f521501(작업 표시줄 고정 → Windows 트레이 사용 팁) |

## 디자인 결정

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| DEC-6 | Idle 트레이 옵션 a — `calm` 고정, dB > 80일 때만 `stressed` | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7). `score/phase.rs::final_tray_state` |
| DEC-8 | 트레이 자산 워크플로 — 마스터 1세트 → OS별 빌드 변환. macOS template 단색 PNG / Windows 컬러 ICO 멀티 해상도 | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7). `scripts/tray-gen.mjs` (sharp + png-to-ico, prebuild 훅) |
| DEC-18 | Windows 트레이/인스톨러 시각 통일 — cream 모하 단일 톤. NSIS 사이드바·헤더 텍스트 제거 + 트레이 아이콘 cream 모하 통일 + 손그림 부실감자 PNG 번들 | ✅ | [PR #22](https://github.com/rnqhstmd/mohashim/pull/22) + [PR #23](https://github.com/rnqhstmd/mohashim/pull/23). 8d4748a(손그림 PNG 번들 + 아이콘 생성기), 79d672f(NSIS 사이드바 텍스트 제거 + 모하 단일 노출), a02b68d(NSIS 헤더 텍스트 제거 + 트레이 아이콘 cream 통일) |
