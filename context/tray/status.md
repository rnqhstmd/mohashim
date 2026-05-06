# tray 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 트레이/메뉴바

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| FR-25 | macOS 메뉴바 28px / Windows 시스템 트레이 48px 5단계 아이콘 | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7). macOS 라이트/다크 자동 반전·Windows 실기 검증은 머지 후 수동 |
| FR-26 | 평소=아이콘만, 뽀모도로 진행 중에만 옆에 시간 표시 | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7) |

## 디자인 결정

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| DEC-6 | Idle 트레이 옵션 a — `calm` 고정, dB > 80일 때만 `stressed` | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7). `score/phase.rs::final_tray_state` |
| DEC-8 | 트레이 자산 워크플로 — 마스터 1세트 → OS별 빌드 변환. macOS template 단색 PNG / Windows 컬러 ICO 멀티 해상도 | ✅ | [PR #7](https://github.com/rnqhstmd/mohashim/pull/7). `scripts/tray-gen.mjs` (sharp + png-to-ico, prebuild 훅) |
