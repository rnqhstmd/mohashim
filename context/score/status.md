# score 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 점수 산출

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| FR-6 | 작업 활동 점수: 글로벌 키보드/마우스 발생 여부만 (내용 비수집) | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | rdev::listen + `\|_\|` 콜백 + SAFETY 헤더 + 2-tier 정적 검증 |
| FR-7 | 3분 스마트 유예 — 미입력 3분간 80점 유지 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | `seconds_idle ≤ 180 → 80`, AC-1 단위 테스트 |
| FR-8 | 3분 초과 시 지속 감점, 입력 발생 시 즉시 리셋 및 점수 복구 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | `decay = (past/10) * 5`, 10초당 -5점, touch_input 즉시 리셋 |
| FR-9 | 마이크 dB EMA 필터링 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | α=0.1, RMS_FLOOR=1e-6, NaN/-∞ 클램핑 |
| FR-10 | 0~65dB=20점, 66~80dB=19~1점 비례, 80dB+=0점 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | `(19.0 - ((db-65)/15)*18).round()` 단일 진실 소스 |
| FR-33 | 점수 모델 단순화 + 분석 로깅 (Phase 18) | ✅ | [#19](https://github.com/rnqhstmd/mohashim/pull/19). 66debb5 — Phase 17 후속 + 자정 회전 + key 순서 + 직렬 큐(b4fe489) |
| FR-34 | MainScreen 점수 노출 개편 — 직전 점수 제거 + 실시간 점수 강조 + 메인 인사 변경 | ✅ | [PR #23](https://github.com/rnqhstmd/mohashim/pull/23). 0002786 |
| FR-35 | macOS rdev 크래시 핫픽스 — 입력 후킹 안정화 | ✅ | [PR #22](https://github.com/rnqhstmd/mohashim/pull/22). 23e575c |
| FR-36 | 오디오 자동 복구 (H-3) — 디바이스 단절 시 cpal 재초기화 | ✅ | [PR #16](https://github.com/rnqhstmd/mohashim/pull/16). baefddb — Phase 15 + 백오프 reset 캡슐화(931475a) + next_tick reset 단위 테스트(74d40ca) |

## 디자인 결정

| ID | 항목 | 상태 | PR | 비고 |
|----|------|------|----|------|
| DEC-4 | Score Engine은 Rust 백그라운드. 트레이 갱신을 위해 상시 실행 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | `src-tauri/src/score/*` 7파일 + 1Hz tick + 멱등성 CAS |
| DEC-7 | 입력 비수집 보장 — `event_type` 미매치 + timestamp만, IPC 페이로드에 키 필드 부재 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | `\|_\|` 콜백 + `// SAFETY:` 헤더 + `scripts/check-privacy.sh` 2-tier |
| DEC-14 | 마이크 = `cpal` 크레이트 | ✅ | [#2](https://github.com/rnqhstmd/mohashim/pull/2) | `src-tauri/src/audio.rs` I16/U16/F32 분기 + thread::park 영구 보유 |
