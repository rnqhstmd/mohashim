# timer 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 모드

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| FR-1 | 평상시 모드(Idle): 투두 관리 + 소음 모니터링만, 키보드/마우스 추적 OFF | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | score::tick에서 phase 무관 work/noise 산출 |
| FR-2 | 평상시 80dB 초과 시 소음 경고 멘트 노출 | ✅ | [#11](https://github.com/rnqhstmd/mohashim/pull/11) | Phase 11 — 5초 hysteresis 진입 정책 + character noiseLoud 버킷 wiring (apply_noise_loud_hysteresis 순수 함수, ScoreSnapshot.noise_loud, store_phase 내장 reset). EMA(~1초)+5초=약 6초 안정화 |
| FR-3 | 평상시 우측 상단 상태 텍스트 (7개 중 무작위 1개, 이모티콘 없음) | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | useIdleChipLabel 8초 회전 + ModeChip |
| FR-4 | 집중 모드: 사용자 설정 집중+휴식 = 1 세션, 하이브리드 측정 ON | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | focus_start command + tick 자동 전환 (Focus → Break → Complete) |
| FR-5 | 집중 모드 우측 상단 상태 텍스트 = "집중 중" 고정 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | ModeChip phase=focus → "집중 중" + mhpulse |
| FR-21 | 뽀모도로 진행 중에는 OS 알림 보내지 않음 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | send_notification 내 BR-notif-guard (current_phase==Focus → return) |

## 시간 설정

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| FR-22 | 집중 시간/휴식 시간 사용자 직접 설정 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | DurationsEditorScreen 5~90 / 3~30 범위 + canSave 검증 + dirty 감지 |

## 디자인 결정

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| DEC-2 | 일시정지 버튼 제거 — 일시정지 상태 자체를 두지 않음 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | Phase enum에 Paused 없음 |
| DEC-10 | 슬립/깨어남 처리 — wall-clock 차이가 grace(180초) 초과 시 자동 discard | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4), [#15](https://github.com/rnqhstmd/mohashim/pull/15) | macOS NSWorkspace WillSleep/DidWake (objc2-app-kit). Windows는 PR #15에서 wall-clock drift 폴백으로 처리 (Phase 14 C-2 fix — 20036db) |
| DEC-17 | FR-3 우상단 텍스트 = 팝업 내부 우상단 chip 위치 | ✅ | [#4](https://github.com/rnqhstmd/mohashim/pull/4) | ModeChip absolute right-3 top-3 |
