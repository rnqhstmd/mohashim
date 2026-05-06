# timer 아키텍처

## 상태 머신

```
[Idle] ──(집중 시작)──▶ [Focus] ──(시간 도달)──▶ [Break] ──(시간 도달)──▶ [Complete]
                            │                                                  │
                            └──(취소·확인)──▶ [Discarded]                      │
                                                                               ▼
                                                                            [Idle]
```

- `paused` 상태 없음 — DEC-2 (일시정지 제거)
- 짧은 자리비움은 grace로 흡수, 진짜 중단은 취소(discard)로만

## 전이 규칙

| 출발 | 트리거 | 도착 | 부수 효과 |
|------|--------|------|----------|
| Idle | "집중 시작" 클릭 | Focus | rdev 후킹 ON, score tick 시작 |
| Focus | timeLeft == 0 | Break | OS 알림 "휴식 시작" + 모하 멘트(break 버킷) |
| Focus | "취소 → 포기" | Discarded | rdev 후킹 OFF, 미적재 |
| Break | timeLeft == 0 | Complete | OS 알림 "세션 완료" + 잔디 적재 (grass 도메인) |
| Break | "취소 → 포기" | Discarded | 미적재 |
| Complete / Discarded | 자동 | Idle | rdev 후킹 OFF |

## 우상단 상태 chip

팝업 내부 우상단 chip 위치 (트레이 옆이 아님).

| 모드 | 텍스트 | 색상 |
|------|--------|------|
| Idle | 7종 라벨이 8초 주기 회전 | 회색 |
| Focus | "집중 중" 고정 | 빨간(`#dc4646`) + pulse 점 |
| Break | "휴식 중" 고정 | 코랄(`#d68a6a`) + pulse 점 |

## 슬립 / 깨어남 처리

- macOS: `NSWorkspaceWillSleepNotification` / `DidWakeNotification`
- Windows: `WM_POWERBROADCAST` (PBT_APMSUSPEND / PBT_APMRESUMEAUTOMATIC)
- 깨어남 시점에 `now - last_tick_at`을 계산
  - ≤ 180초 (grace 이내) → 그대로 진행 (잠깐 자리비움으로 처리)
  - \> 180초 → **자동 discard** + 토스트 "X분 슬립 — 이번 세션 못 기록했어"

## 진행 중 알림 차단

```rust
fn send_notification(app, title, body) {
    if PHASE.load() != Phase::Focus { return; }                       // 진행 중 차단
    if !storage::get_notifications_enabled(app) { return; }           // 사용자 토글 (PR #9)
    notification::send(...);
}
```

- Focus 진행 중에는 어떤 알림도 발송 X
- 휴식 시작·세션 완료 알림은 Rust에서 발송 (WebView가 닫혀 있어도 동작)
- `notifications_enabled = false`이면 OS 알림 미발송. 단 카운트다운/세션 totals 적재(`append_session_record`)는 별도 경로라 영향 없음 (BR-6, PR #9)
- `get_notifications_enabled<R>`는 `storage.rs`에 헬퍼로 존재. 누락/실패 시 default `true` (안전 측 기본값 — 기존 사용자 알림 발송 흐름 보존)

## 팝업 UI 구성

| 컴포넌트 | 책임 |
|----------|------|
| `<BottomTabBar active onChange>` | 3 탭 (todos/grass/settings) 라우팅 |
| `<MohashimPopup>` 우상단 chip | Idle 7라벨 8초 회전 / Focus·Break 고정 + pulse 닷 |
| `<PomodoroRunning>` Discard 모달 | "포기 / 계속할래" 양 버튼, stressed 모하, 미적재 안내 |
| `<DurationsEditorScreen>` | 집중 5~90분 / 휴식 3~30분, dirty 감지 시 저장 버튼 활성 |

`mhpulse` keyframes (1.2s ease-in-out) — chip 닷 + 진행 중 라벨 강조에 공통 사용.

## 사용자 설정 시간

- 집중 5~90분, 휴식 3~30분
- DurationsEditorScreen에서 분 단위 직접 입력
- 변경 즉시 store에 저장, 다음 세션부터 반영
