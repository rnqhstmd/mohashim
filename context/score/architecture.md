# score 아키텍처

## 위치 원칙

측정·점수 산출은 **Rust(상시 실행)**, WebView는 표시만. 팝업이 닫혀 있어도 트레이 아이콘이 5단계로 갱신되려면 점수 엔진이 백그라운드에 있어야 한다.

## 모듈 구성

```
src-tauri/src/
├─ score/
│   ├─ mod.rs        — 외부 진입점, 1Hz tick 루프
│   ├─ work.rs       — work_score(seconds_idle) → 0..=80
│   ├─ noise.rs      — noise_score(db_ema) → 0..=20
│   ├─ ema.rs        — EMA 필터 상태
│   ├─ phase.rs      — Idle/Focus/Break/Complete/Discarded 머신
│   └─ state.rs      — ScoreSnapshot 타입 (IPC 페이로드)
├─ audio.rs          — cpal 마이크 캡처 → raw dB
└─ input.rs          — rdev 후킹 (event_type 미매치, timestamp만)
```

## 점수 알고리즘

### 작업 점수 (work)

```rust
fn work_score(seconds_idle: u64) -> u8 {
    if seconds_idle <= 180 { return 80; }       // 3-min grace
    let past = seconds_idle - 180;
    let decay = (past / 10) * 5;
    80u8.saturating_sub(decay as u8)            // 10초당 -5점
}
```

### 소음 점수 (noise)

```rust
fn noise_score(db_ema: f32) -> u8 {
    if db_ema <= 65.0 { return 20; }
    if db_ema >= 80.0 { return 0; }
    // 66dB → 19, 80dB → 1 (linear)
    (19.0 - ((db_ema - 65.0) / 15.0) * 18.0).round() as u8
}
```

### 5단계 매핑

| total | state |
|-------|-------|
| 81~100 | focused |
| 61~80 | calm |
| 41~60 | distracted |
| 21~40 | covering |
| 0~20 | stressed |

## 입력 후킹 (Privacy 보장)

```rust
// SAFETY: 비수집 영역 — event_type 매치 금지, timestamp만 갱신
rdev::listen(|_event| {
    LAST_INPUT_AT.store(now_ms(), Ordering::Relaxed);
});
```

- keycode·문자·마우스 좌표·휠 델타를 변수에 담지 않음
- IPC 페이로드 타입(`ScoreSnapshot`)에 키 필드 부재
- 저장소에 입력 raw 데이터 비기록 (잔디 DB는 평균 점수만)
- `// SAFETY:` 헤더 주석 + CI grep 검사 (`event.event_type`, `key.code` 등)

## 마이크 캡처

- cpal로 default input device → 16-bit mono PCM 스트림
- 샘플 RMS → dB 변환 → EMA 필터 (window ~1초)
- Idle 모드에서도 항상 ON (80dB 경고를 위해)

## tick 루프

- 1Hz 타이머에서 `seconds_idle` + `db_ema` 읽고 점수 산출
- 결과를 두 곳에 적용:
  - **트레이 아이콘** 즉시 교체 (state 변경 시에만)
  - `score-tick` 이벤트 emit (팝업 열려있으면 표시)

## 시각화 컴포넌트 (WebView 측)

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `<NoiseMeter db>` | 팝업 hero 하단 | 가로 dB 게이지. 30~100dB 매핑, 65 임계 틱, >65 빨강 |
| `<ScoreBreakdown work noise>` | hero 호버 시 swap | 작업80/소음20 분리 표시. Focus 모드만 활성 |
| `envFromDb(db)` | NoiseMeter 라벨 | 6단계 환경 매핑(도서관/집/조용한 카페/시끄러운 카페/군중/굉음) + 이모지 |

## 권한 (score 도메인 관점)

- 마이크 권한 없으면 noise=0 (또는 onboarding 복귀)
- 접근성 권한 없으면 work 측정 불가 (또는 onboarding 복귀)
- 정책: **둘 다 필수** (`lifecycle` 도메인의 권한 게이팅 참조)
