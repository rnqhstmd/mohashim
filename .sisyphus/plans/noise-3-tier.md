# 소음 3단계 분리 (60-80dB 중간 멘트 버킷)

> Momus 리뷰 v1 → v2 반영 완료 (REVISE → 수정).

## Goal
60dB 이하/60-80dB/80dB 초과의 3단계로 소음을 분류하고, 60-80 구간에 새 멘트 버킷(`noiseMedium`)을 추가한다. **점수 산출과 표정은 현행 유지**하며, 소음 멘트는 idle/focus/break 모든 phase에서 점수 기반 멘트보다 우선 출력한다.

## Background

### 현재 동작 (사실 확인 — 라인 검증 완료)

- `src-tauri/src/score/noise.rs:11` — `db_ema ≤ 80.0` → `noise_score=20`, 초과 → `0`. 80이 유일한 임계.
- `src-tauri/src/score/shared.rs:88` — `IDLE_NOISE_LOUD_TICKS: AtomicU64`. phase=Idle && db>80 1Hz 카운터.
- `src-tauri/src/score/shared.rs:91` — `NOISE_LOUD_HYSTERESIS_TICKS = 5`.
- `src-tauri/src/score/shared.rs:94` — `NOISE_LOUD_THRESHOLD_DB: f32 = 80.0`.
- `src-tauri/src/score/shared.rs:301-316` — `store_phase`가 **Idle 외 모든 phase 진입 시 `reset_noise_loud_state()` 자동 호출**. 이 동작이 FR-3과 충돌하므로 본 계획에서 핵심 수정 대상.
- `src-tauri/src/score/shared.rs:320-322` — `reset_noise_loud_state` 단순 0 store.
- `src-tauri/src/score/shared.rs:334` — `apply_noise_loud_hysteresis(phase, db, prev_count) -> (u64, bool)`. phase=Idle 외에서 `(0, false)` 강제.
- `src-tauri/src/score/mod.rs:21,100-101,272-298,321` — tick_loop의 카운터 호출 및 NoiseEnter/Exit 발화. 코멘트 "Idle phase 한정"(line 99).
- `src-tauri/src/score/state.rs:10-21,29-70` — `ScoreSnapshot` 10키 정의 + 단언 테스트(`obj.len()==10` + 키 리터럴 배열).
- `src-tauri/src/score/phase.rs:60-67,86-97` — `state_from_total`(점수→LiveState), `final_tray_state`(phase=Idle db>80 → Stressed override).
- `src/lib/phrases.ts:5-13` — `BucketKey` union 8종.
- `src/lib/phrases.ts:15-19` — `PhraseCtx` 타입 3필드.
- `src/lib/phrases.ts:87-96` — `selectBucket` 분기.
- `src/lib/phrases.ts:139-149` — `mapPhaseToPotatoState` (phase=idle && noiseLoudActive → covering).
- `src/lib/score.ts:13-24` — `ScoreSnapshot` TS 타입 10필드.
- `src/lib/usePhrase.ts:11-18,33-43,74-82,107-118` — `UsePhraseInput` 타입, `FALLBACK_INPUT` 상수, 두 `useMemo` deps 배열.
- `src/components/popup/MainScreen.tsx:190,194-198` — `noiseLoudActive` 추출 + `usePhrase` 전달.

### 사용자 결정
- 60-80 멘트는 사용자가 직접 작성 (PR 머지 전 채워넣기).
- 표정/트레이는 현행 유지. **`mapPhaseToPotatoState`는 변경 금지** (Momus 지적 반영).
- 소음 멘트는 idle/focus/break 모든 phase에서 점수 기반 멘트보다 **우선 출력**.
- Hysteresis는 60dB 진입도 동일 5초 누적.
- 점수는 80+ 에서만 페널티 (현행 그대로).

## Functional Requirements

- **FR-1**: 새 상수 `NOISE_MEDIUM_THRESHOLD_DB: f32 = 60.0` 정의. `60.0 < db ≤ 80.0` 구간을 medium으로 판정.
- **FR-2**: 새 atomic `NOISE_MEDIUM_TICKS: AtomicU64::new(0)`. 5틱 누적 시 `noise_medium_active=true`.
- **FR-3**: hysteresis 동작을 **Idle/Focus/Break** 모든 phase로 확장. Complete/Discarded에서만 카운터 리셋.
- **FR-4**: `ScoreSnapshot`에 `noise_medium: bool` 필드 추가 (10→11키). camelCase 직렬화: `noiseMedium`.
- **FR-5**: `selectBucket` 우선순위:
  1. `phase=discarded` → `discarded`
  2. `phase=complete` → `sessionComplete`
  3. `noiseLoudActive` → `noiseLoud`
  4. `noiseMediumActive` → `noiseMedium`
  5. `phase=break` → `break`
  6. `phase=idle` → `idle`
  7. focus + total → `focusHigh`/`focusLow`/`focusBroken`
- **FR-6**: 새 버킷 `noiseMedium`. 초기값 1개 placeholder, 사용자가 PR 머지 전 추가.
- **FR-7**: `noise_score` 산출 미변경 (`db ≤ 80` → 20, 초과 → 0).
- **FR-8**: `final_tray_state` 미변경. 표정/트레이 현행 유지.
- **FR-9**: `mapPhaseToPotatoState` 미변경 (phase=idle && noiseLoudActive → covering 유지).
- **FR-10**: `NoiseEnter`/`NoiseExit` 로그를 idle/focus/break 모든 phase에서 발화하도록 일반화. medium은 로그 비대상.

## Business Rules

- **BR-1**: 60-80 active와 80+ active는 동시에 true가 될 수 없다. `apply_noise_hysteresis` 내부 분기에서 자연스럽게 상호 배타 — `db > 80` / `60 < db ≤ 80` / else 세 가지 mutually exclusive branch.
- **BR-2** (재설계): phase 전환 시 카운터 자동 리셋은 **Complete/Discarded 진입 시에만**. Focus⇄Break 전환에서는 카운터 유지 (FR-3 누적 보존을 위해 — Momus 지적 반영).
- **BR-3**: `ScoreSnapshot.noise_loud=true && noise_medium=false`는 항상 보장. `tick_loop`에서 `debug_assert!(!(noise_loud_active && noise_medium_active))` 명시.
- **BR-4** (state.rs 기존 BR-4 "입력 내용 추가 금지"와 별개): camelCase 직렬화 키는 정확히 11개로 확장. 신규 키는 derived state(`noiseMedium`)이며 입력 내용 아님.

## Acceptance Criteria

### Rust — score/shared.rs

- **AC-1**: `apply_noise_hysteresis(Phase::Focus, 85.0, 0, 0)` → `(1, 0, false, false)`. focus에서도 loud 누적.
- **AC-2**: 5틱 연속 `apply_noise_hysteresis(Phase::Focus, 85.0, …)` → 5번째에 `loud_active=true`.
- **AC-3**: 5틱 연속 `apply_noise_hysteresis(Phase::Focus, 70.0, …)` → 5번째에 `medium_active=true`, `loud_active=false`.
- **AC-4**: medium 카운터 3 누적 상태에서 85dB 진입 → `(0, 1, false, false)` (medium 리셋, loud 1로 시작).
- **AC-5**: loud 카운터 3 누적 상태에서 70dB 진입 → `(1, 0, false, false)` (loud 리셋, medium 1로 시작).
- **AC-6**: db=60.0 정확히 → `(0, 0, false, false)` (`db > 60.0` strict).
- **AC-7**: db=80.0 정확히 → medium 누적 (`60 < 80 ≤ 80`), loud 0.
- **AC-8**: db=NaN → 두 카운터 모두 0.
- **AC-9**: `Phase::Complete` 진입 → 두 카운터 모두 0 (store_phase 내부 호출).
- **AC-10**: `Phase::Discarded` 진입 → 두 카운터 모두 0.
- **AC-11**: `Phase::Focus` → `Phase::Break` 전환 → 두 카운터 모두 유지 (Momus 지적 반영, BR-2).

### Rust — score/state.rs

- **AC-12**: `ScoreSnapshot` 정확히 11키. 기존 테스트(state.rs:29-70) 갱신: 함수명 `ac4_snapshot_has_exactly_eleven_camelcase_keys`, `obj.len()==11`, 키 리터럴 배열에 `"noiseMedium"` 추가.
- **AC-13**: `noise_loud=true`면 `noise_medium=false` (struct invariant 테스트).

### TypeScript — lib/phrases.ts

- **AC-14**: `selectBucket({phase:"focus", total:90, noiseLoudActive:true, noiseMediumActive:false})` → `"noiseLoud"`.
- **AC-15**: `selectBucket({phase:"focus", total:90, noiseLoudActive:false, noiseMediumActive:true})` → `"noiseMedium"`.
- **AC-16**: `selectBucket({phase:"break", noiseMediumActive:true, …})` → `"noiseMedium"`.
- **AC-17**: `selectBucket({phase:"idle", noiseLoudActive:false, noiseMediumActive:false, …})` → `"idle"`.
- **AC-18**: `selectBucket({…, noiseLoudActive:true, noiseMediumActive:true, …})` → `"noiseLoud"` (BR-1 위반 방어).
- **AC-19**: `POTATO_PHRASES.noiseMedium.length >= 1`.
- **AC-20**: 기존 `Phase 11 (MA-1): idle + noiseLoudActive=true → 'covering'` 테스트(phrases.test.ts:258 부근) 통과 유지 — `mapPhaseToPotatoState` 미변경 회귀 차단.

### TypeScript — lib/score.ts, lib/usePhrase.ts

- **AC-21**: `ScoreSnapshot` 타입에 `noiseMedium: boolean` 필드.
- **AC-22**: `UsePhraseInput` 타입에 `noiseMediumActive: boolean` 필드.
- **AC-23**: `FALLBACK_INPUT`에 `noiseMediumActive: false` 추가.
- **AC-24**: `usePhrase`의 두 `useMemo` deps 배열에 `safeNoiseMediumActive` 포함.

### Component — MainScreen.tsx

- **AC-25**: `noiseMediumActive = snap?.noiseMedium ?? false` 추출 + `usePhrase` 인자로 전달.

## Risks

- **R-1**: `state.rs` 테스트 10→11키 갱신. 기존 테스트는 `obj.len()==10` 단언과 키 리터럴 배열 두 곳을 갱신해야 함.
- **R-2**: `IDLE_NOISE_LOUD_TICKS` → `NOISE_LOUD_TICKS` 이름 변경 시 ~10개 callsite 영향(`shared.rs:88, 304(via reset), 321, test 583/585/594/596/598`, `mod.rs:21, 273`). **완화**: 검색·치환은 grep으로 일괄 + cargo check.
- **R-3**: `reset_noise_loud_state` → `reset_noise_state` 이름 변경 + 동작 변경(두 카운터 리셋). `shared.rs:304` 호출처 의미 변경 — 현재 "Idle 외 모든 phase 진입 시 리셋"을 "Complete/Discarded 진입 시에만 리셋"으로 변경. BR-2 반영.
- **R-4**: `score.test.ts:50,57` 부근의 `noiseLoud` fixture가 `noiseMedium` 미포함 → TS 컴파일 실패. 명시적 갱신 필요(아래 step 9).
- **R-5**: `usePhrase.test.ts`의 `Ctx` mock 다수가 `noiseLoudActive`만 보유 → 타입 확장 시 컴파일 실패. 명시적 갱신 필요.
- **R-6**: focus 중 noise 멘트 우선 출력 정책에 따라 score 기반 격려 멘트(focusHigh 등) 출력 빈도 감소 — 사용자 결정사항, 의도된 동작.
- **R-7**: medium 멘트 placeholder 1개만으로 머지될 경우 단조로움 — PR 본문 체크리스트로 명시.
- **R-8**: `mapPhaseToPotatoState` 미변경 — 60-80 멘트는 noiseMedium이지만 표정은 점수/Idle 기준 그대로 → 시각적 불일치(사용자 결정으로 진행).
- **R-9** (Momus): `NoiseEnter`/`NoiseExit` 로그가 cross-phase로 확장됨. 기존 분석 도구가 idle 한정 가정 시 영향 가능성. **완화**: 코드 코멘트 `mod.rs:99` 갱신 + logger 호출이 idle/focus/break 모두에서 발생 가능함을 명시.

## Implementation Steps

### Phase 1 — Rust shared.rs (상수/atomic/헬퍼)

1. `src-tauri/src/score/shared.rs`
   - **상수 추가** (line 95 근처):
     ```rust
     pub const NOISE_MEDIUM_THRESHOLD_DB: f32 = 60.0;
     pub const NOISE_MEDIUM_HYSTERESIS_TICKS: u64 = 5;
     ```
   - **atomic 추가**:
     ```rust
     pub static NOISE_MEDIUM_TICKS: AtomicU64 = AtomicU64::new(0);
     ```
   - **이름 변경**: `IDLE_NOISE_LOUD_TICKS` → `NOISE_LOUD_TICKS`. callsite 일괄 갱신:
     - `shared.rs` 자기 자신
     - `shared.rs` 테스트(line ~583, 585, 594, 596, 598)
     - `mod.rs:21` import
     - `mod.rs:273` fetch_update
   - **`reset_noise_loud_state` → `reset_noise_state`**: 두 카운터 모두 0. callsite `shared.rs:304` 갱신.
   - **`store_phase` 동작 변경** (shared.rs:301-316): 기존 `if !matches!(p, Phase::Idle) { reset_noise_loud_state(); }` →
     ```rust
     if matches!(p, Phase::Complete | Phase::Discarded) {
         reset_noise_state();
     }
     ```
     (BR-2 반영. Focus⇄Break 전환에서 카운터 유지.)
   - **`apply_noise_loud_hysteresis` → `apply_noise_hysteresis`** 시그니처 확장:
     ```rust
     pub fn apply_noise_hysteresis(
         phase: Phase,
         db: f32,
         prev_loud: u64,
         prev_medium: u64,
     ) -> (u64, u64, bool, bool) {
         // Complete/Discarded는 호출자(tick_loop)에서 진입 자체가 없도록 가드 — 방어적으로 0 반환.
         if matches!(phase, Phase::Complete | Phase::Discarded) {
             return (0, 0, false, false);
         }
         if db.is_nan() {
             return (0, 0, false, false);
         }
         if db > NOISE_LOUD_THRESHOLD_DB {
             let nl = prev_loud.saturating_add(1);
             let active_l = nl >= NOISE_LOUD_HYSTERESIS_TICKS;
             return (nl, 0, active_l, false);
         }
         if db > NOISE_MEDIUM_THRESHOLD_DB {
             let nm = prev_medium.saturating_add(1);
             let active_m = nm >= NOISE_MEDIUM_HYSTERESIS_TICKS;
             return (prev_loud.saturating_mul(0), nm, false, active_m);
         }
         (0, 0, false, false)
     }
     ```
     (BR-1을 분기 내에서 자연 보장.)

### Phase 2 — Rust state.rs / mod.rs

2. `src-tauri/src/score/state.rs`
   - `ScoreSnapshot`에 `pub noise_medium: bool` 추가.
   - 테스트(line 29-70):
     - 함수명 `ac4_snapshot_has_exactly_ten_camelcase_keys` → `ac4_snapshot_has_exactly_eleven_camelcase_keys`
     - `assert_eq!(obj.len(), 10, …)` → `11`
     - 키 리터럴 배열에 `"noiseMedium"` 추가
     - 페이로드 fixture에 `noise_medium: false` 추가
   - `noise_loud=true && noise_medium=true` 방어용 디버그 단언 테스트 1개 추가(AC-13).

3. `src-tauri/src/score/mod.rs`
   - 호출처 갱신:
     - line 100 부근 `prev_noise_loud_active` 옆에 `prev_noise_medium_active: bool` 로컬 추가.
     - line 99 코멘트 "Idle phase 한정" → "Idle/Focus/Break phase"로 갱신 (Momus R-9).
     - line 272-298 hysteresis 블록:
       ```rust
       let mut noise_loud_active = false;
       let mut noise_medium_active = false;
       // 두 카운터를 한 번에 결정 — prev 값 양쪽을 한 번 load하고 새 값 양쪽을 store.
       let prev_loud = NOISE_LOUD_TICKS.load(Relaxed);
       let prev_medium = NOISE_MEDIUM_TICKS.load(Relaxed);
       let (new_loud, new_medium, la, ma) =
           apply_noise_hysteresis(phase_at_emit, db, prev_loud, prev_medium);
       NOISE_LOUD_TICKS.store(new_loud, Relaxed);
       NOISE_MEDIUM_TICKS.store(new_medium, Relaxed);
       noise_loud_active = la;
       noise_medium_active = ma;
       debug_assert!(!(noise_loud_active && noise_medium_active));
       ```
       (PR #11에서 `fetch_update`로 race를 막던 패턴은 두 atomic 동시 처리가 불가하므로 단일 1Hz tick_loop에서 load→store 패턴으로 변경. tick_loop은 단일 스레드이므로 자체 race 없음. 외부 race는 store_phase의 reset_noise_state — 이는 phase 전환 시점에 발생하므로 같은 tick의 hysteresis 산출 직전 또는 직후에 한 번만 일어나 race 영향 없음.)
     - line 288-298 NoiseEnter/Exit 발화 — `prev_noise_loud_active`만 추적하는 기존 로직 유지. medium은 로그 미발화 (FR-10).
     - line 311-322 `ScoreSnapshot` 생성: `noise_medium: noise_medium_active` 추가.
     - `prev_noise_loud_active = noise_loud_active;` 뒤에 `prev_noise_medium_active = noise_medium_active;` 갱신 (현재 미사용이지만 추후 medium 로그 추가 시 사용 가능성).

### Phase 3 — TypeScript 타입/멘트/훅

4. `src/lib/score.ts`
   - `ScoreSnapshot` 타입에 `noiseMedium: boolean` 추가 (line 13-24).

5. `src/lib/phrases.ts`
   - `BucketKey`에 `"noiseMedium"` 추가 (line 5-13).
   - `PhraseCtx`에 `noiseMediumActive: boolean` 추가 (line 15-19).
   - `POTATO_PHRASES.noiseMedium: readonly string[]` 추가. 초기 placeholder 1개:
     ```typescript
     noiseMedium: [
       "음~ 좀 시끄러운 것 같은데?",
     ],
     ```
   - `selectBucket` 재배치 (line 87-96):
     ```typescript
     export function selectBucket(ctx: PhraseCtx): BucketKey {
       if (ctx.phase === "discarded") return "discarded";
       if (ctx.phase === "complete") return "sessionComplete";
       if (ctx.noiseLoudActive) return "noiseLoud";
       if (ctx.noiseMediumActive) return "noiseMedium";
       if (ctx.phase === "break") return "break";
       if (ctx.phase === "idle") return "idle";
       if (ctx.total >= 80) return "focusHigh";
       if (ctx.total >= 40) return "focusLow";
       return "focusBroken";
     }
     ```
   - `mapPhaseToPotatoState`는 **미변경** (FR-9, AC-20). 단, `PhraseCtx` 타입 확장에 따라 `noiseMediumActive` 필드는 받지만 사용 안 함.

6. `src/lib/usePhrase.ts`
   - `UsePhraseInput` 타입(line 11-18)에 `noiseMediumActive: boolean` 추가.
   - `FALLBACK_INPUT`(line 33-43)에 `noiseMediumActive: false` 추가 + 타입 동일 갱신.
   - `safeNoiseMediumActive` 로컬 추출(line 71 부근).
   - `selectBucket` 호출에 `noiseMediumActive: safeNoiseMediumActive` 추가(line 74-82).
   - useMemo deps 배열 두 곳(line 81, 117)에 `safeNoiseMediumActive` 추가.
   - `mapPhaseToPotatoState` 호출 ctx에도 `noiseMediumActive` 추가(타입 일관성).

### Phase 4 — Component

7. `src/components/popup/MainScreen.tsx`
   - line 190 `const noiseLoudActive = snap?.noiseLoud ?? false;` 다음에:
     ```typescript
     const noiseMediumActive = snap?.noiseMedium ?? false;
     ```
   - line 194-198 `usePhrase` 호출 인자 객체에 `noiseMediumActive` 추가.

### Phase 5 — 테스트

8. `src-tauri/src/score/shared.rs` 테스트 블록
   - AC-1~AC-11 추가.
   - 기존 `apply_noise_loud_hysteresis` 테스트(line ~548-) 시그니처/이름 갱신.

9. `src/lib/__tests__/score.test.ts`
   - `noiseLoud` 포함 fixture에 `noiseMedium: false` 추가 (TS 컴파일 통과용).

10. `src/lib/__tests__/usePhrase.test.ts`
    - 모든 `noiseLoudActive` 포함 mock에 `noiseMediumActive: false` 추가.

11. `src/lib/__tests__/phrases.test.ts`
    - AC-14~AC-19 추가.
    - 기존 `selectBucket` 테스트 갱신 (특히 phase=idle && noiseLoudActive → noiseLoud 유지, phase=focus + noiseLoudActive → noiseLoud 신규).
    - 기존 `mapPhaseToPotatoState` 테스트(MA-1) 통과 유지 검증 (AC-20).

### Phase 6 — 검증

12. `cargo test` (Rust 전체)
13. `npm test` (TS 전체)
14. `npm run build`
15. 수동 검증:
    - 70dB 5초 in idle → noiseMedium 멘트 ✓
    - 85dB 5초 in idle → noiseLoud 멘트 ✓
    - 70dB 5초 in focus → noiseMedium 멘트 (신규) ✓
    - 85dB 5초 in focus → noiseLoud 멘트 + 점수 페널티 ✓
    - 70dB 5초 in break → noiseMedium 우선 출력 ✓
    - 50dB 환경 → phase 기반 멘트 정상 ✓

## Verification

- [ ] `cargo test` 통과
- [ ] `npm test` 통과 (score.test.ts, usePhrase.test.ts, phrases.test.ts 포함)
- [ ] `npm run build` 통과
- [ ] phase 전환(focus→break)에서 hysteresis 카운터 유지 검증 (AC-11)
- [ ] `mapPhaseToPotatoState` MA-1 회귀 없음 (AC-20)
- [ ] BR-1 위반 시나리오에서 `debug_assert!` 미발화

## Out of Scope

- 표정/트레이 아이콘 변경.
- medium 진입/해제 로깅(`NoiseEnter`/`NoiseExit`는 loud만).
- 다국어 멘트.
- 사용자별 임계값 커스터마이징.
- score_integration.rs에 noise_medium 통합 테스트 추가 (현재 atomic/phase scaffold 부재 — out of scope).

## Open Items (PR 머지 전 사용자 입력 필요)

- [ ] `POTATO_PHRASES.noiseMedium` 멘트 5~6개 사용자 직접 작성.

# Part B — ShareCard 레이아웃 개편 (잔디 자랑하기)

## Goal (Part B)
잔디 자랑하기 카드 상단을 "헤더(제목/월) → **캐릭터 + 3 통계 세로 블록** → 잔디맵 → 범례" 순서로 재구성한다. 좌측에 풀 컬러 모하 캐릭터(장착 아이템 반영), 우측에 🏆 가장 집중한 날 / ✅ 할일 많이 한 날 / 💬 내 자랑 한마디 3개를 세로로 배치한다.

## Background (Part B)

### 현재 카드 구조 (`src/components/popup/ShareCard.tsx`)
- 카드 캔버스: `SHARE_CARD_WIDTH=864`, `SHARE_CARD_HEIGHT=1164`.
- Y=124 제목, Y=176 월 (line 296-318) — 유지.
- Y=238 요일 헤더 (line 22), Y=262 잔디 그리드 (line 31 `GRID_TOP=262`).
- 캐릭터는 현재 **잔디맵 뒤 워터마크**로 흐릿하게 깔려있음 (`BG_CHAR_X=142, BG_CHAR_Y=440, BG_CHAR_SIZE=580, BG_OPACITY=0.09`, line 60-65).
- Y=778 범례, Y=858/898 업적 좌우 분할, Y=968/1020 자랑 한마디, Y=1130 워터마크.
- `computeMonthHighlights`(line 96-110)가 bestFocus/mostTodos 2개 산출.

### 사용자 결정
- 헤더(제목+월)는 위치 그대로.
- 헤더 바로 아래에 새 블록: **좌측 캐릭터(옷 적용) + 우측 세로 3블록**.
- 우측 세로 블록 3개: 🏆 가장 집중한 날 / ✅ 할일 많이 한 날 / 💬 내 자랑 한마디.
- 새 블록 아래에 잔디맵(요일 헤더 포함) 배치.
- 자랑 한마디 입력 → 카드 하단의 별도 블록이 아니라 캐릭터 옆 세로 블록으로 통합.

## Functional Requirements (Part B)

- **FR-B1**: 좌측 상단 캐릭터는 풀 컬러(opacity 1.0)로 표시. `itemDataUrls`(face/head/back) 모두 적용된 장착 버전.
- **FR-B2**: 캐릭터 크기는 `CHAR_BLOCK_SIZE = 260` (864/3.3 비율). 캐릭터 영역 내 중앙 배치.
- **FR-B3**: 우측 세로 3블록 — 각 블록은 "라벨(작은 글자) + 메인(큰 글자)" 2줄 구성. 라벨/메인 폰트 크기는 현행 업적 영역(22/30)과 동일.
- **FR-B4**: 3블록 순서 (위→아래): 🏆 가장 집중한 날 → ✅ 할일 많이 한 날 → 💬 내 자랑 한마디.
- **FR-B5**: 자랑 한마디는 현행 카드 하단 영역(Y 968/1020)에서 제거되고 신규 블록 안으로 이전. 빈 문자열일 때 placeholder("자랑 한 마디 남겨줘!" 등) 표시 또는 블록 자체를 빈 줄로 유지.
- **FR-B6**: 기존 잔디맵 뒤 워터마크 캐릭터는 **제거**. 좌측 상단 풀 컬러 캐릭터로 대체. `BG_*` 상수 및 관련 SVG 그룹 삭제.
- **FR-B7**: 잔디 그리드는 새 블록 아래로 이동. 후속 요소(범례, 업적 - 자랑 한마디 제거 후 잔디맵 + 워터마크 만) 위치 재계산.
- **FR-B8**: 카드 하단 업적 좌우 분할 영역(Y 858/898)은 캐릭터 옆 세로 블록으로 통합되었으므로 **제거**.

## Business Rules (Part B)

- **BR-B1**: 새 블록 영역 높이는 `CHAR_BLOCK_SIZE`와 동일하게 260px. 캐릭터와 우측 3블록 모두 이 영역 안에 수직 정렬.
- **BR-B2**: 캐릭터 좌측 여백 = 우측 3블록 우측 여백. 카드 좌우 대칭 균형.
- **BR-B3**: 우측 3블록 사이 수직 간격은 균등 (블록 영역 높이를 3등분).
- **BR-B4**: 카드 전체 높이(`SHARE_CARD_HEIGHT=1164`)는 유지. 자랑 한마디 블록 제거로 확보된 공간 + 캐릭터 워터마크 제거로 확보된 공간으로 새 블록을 흡수.

## Acceptance Criteria (Part B)

- **AC-B1**: 카드 SVG 렌더 결과에서 제목 텍스트 "모하심 잔디 자랑하기"가 Y=124 위치 유지.
- **AC-B2**: 월 텍스트(`2026년 5월` 등)가 Y=176 위치 유지.
- **AC-B3**: 캐릭터 SVG가 좌측 상단(예: `CHAR_X=80, CHAR_Y=220`) 풀 컬러로 렌더링. `itemDataUrls.face/head/back`이 모두 적용됨.
- **AC-B4**: 우측 3블록이 동일 X 좌표(예: `STATS_X=540`)에서 Y=240/340/440(또는 균등 간격)로 세로 배치.
- **AC-B5**: 🏆 라벨 + 메인 / ✅ 라벨 + 메인 / 💬 라벨 + 메인 순서로 렌더링.
- **AC-B6**: 잔디 그리드 시작 Y가 기존 262에서 신규 위치(예: 500 이상)로 이동.
- **AC-B7**: 기존 잔디맵 뒤 워터마크 캐릭터(`<g id="bg-character">`)가 DOM에서 제거됨.
- **AC-B8**: 기존 하단 업적 영역(`<g id="achievements">`)이 DOM에서 제거됨.
- **AC-B9**: 기존 하단 자랑 한마디(`<g id="user-message">`)가 DOM에서 제거됨.
- **AC-B10**: `SharePreviewModal` 입력창에 글자 입력 시 캐릭터 옆 세로 블록의 💬 메인 텍스트가 즉시 반영(현행 message prop 흐름 유지).
- **AC-B11**: `bestFocus`/`mostTodos` 데이터 없을 때 "기록 없음" 텍스트가 새 위치에 표시.
- **AC-B12**: `ShareCard.test.tsx` 회귀 테스트 전부 통과 — 기존 테스트가 검증하는 텍스트 키워드는 유지하되 좌표 단언은 갱신.

## Risks (Part B)

- **R-B1**: 카드 PNG 합성(`composeShareCard` in `grass.ts`)이 새 캐릭터 영역의 `<image>` 외부 참조를 base64 dataURL로 정상 인라인하는지 검증 필요 (현행 워터마크 영역 처리와 동일 흐름이면 OK).
- **R-B2**: 카드 종횡비 유지(864×1164) — 캐릭터 + 3블록 영역 260px가 헤더(176)와 잔디맵 시작 사이에 안정적으로 들어가는지. 잔디 그리드 시작 Y 재계산 후 후속 요소도 모두 reflow 필요.
- **R-B3**: 자랑 한마디 빈 문자열일 때의 표시 정책 — 현행은 `{message && (...)}`로 group 자체를 숨김. 신규 위치에서도 동일 정책 유지 시 3블록 중 1개가 빈 줄로 보이는 UX 이슈 가능. **완화**: 빈 문자열일 때 placeholder("자랑 한 마디 남겨줘!") 노출.
- **R-B4**: 기존 `ShareCard.test.tsx`가 워터마크 캐릭터/하단 업적/하단 자랑 한마디 존재를 단언할 가능성. 회귀 테스트 갱신 범위 확인 필요.
- **R-B5**: 캐릭터 워터마크 제거로 카드 전체 시각적 무게가 좌상으로 쏠림 — 디자인 점검 필요. **완화**: 잔디맵 하단에 작은 워터마크/시그니처 유지 검토.

## Implementation Steps (Part B)

### Phase B1 — 레이아웃 상수 재계산
1. `src/components/popup/ShareCard.tsx` 상단 상수 블록(line 17-65) 재구성:
   - 헤더 유지: `TITLE_Y=124`, `MONTH_Y=176`.
   - 신규 캐릭터+통계 영역:
     ```typescript
     const TOP_BLOCK_Y = 220;
     const TOP_BLOCK_HEIGHT = 260;
     const CHAR_BLOCK_SIZE = 240;
     const CHAR_X = 64;
     const CHAR_Y = TOP_BLOCK_Y + (TOP_BLOCK_HEIGHT - CHAR_BLOCK_SIZE) / 2;
     const STATS_LABEL_X = 540;
     const STATS_BLOCK_GAP = 90;
     const STATS_FIRST_Y = TOP_BLOCK_Y + 30;
     ```
   - 잔디맵 시작을 `GRID_TOP = TOP_BLOCK_Y + TOP_BLOCK_HEIGHT + 30 = 510` 부근으로 이동. `WEEKDAY_Y = GRID_TOP - 24`.
   - 범례, 워터마크 Y 좌표 재계산 — 잔디 그리드 끝 = `GRID_TOP + ceil(cells/7) * STEP` 기준으로 +30 offset.
   - **제거**: `BG_CHAR_SIZE`, `BG_CHAR_X`, `BG_CHAR_Y`, `BG_CHAR_SCALE`, `BG_OPACITY`, `ACH_LABEL_Y`, `ACH_MAIN_Y`, `COL1_X`, `COL2_X`, `MSG_LABEL_Y`, `MSG_MAIN_Y`.

2. 카드 전체 높이(`SHARE_CARD_HEIGHT`) 변경 여부 확인 — `lib/grass.ts`에 정의된 상수. 현재 유지 가정이지만 잔디 그리드 + 범례 + 워터마크 합산이 1164에 맞는지 fine-tune.

### Phase B2 — 캐릭터 렌더링 (풀 컬러)
3. `<g id="bg-character" opacity={BG_OPACITY}>` 블록(line 264-293) 삭제.
4. 신규 좌측 상단 캐릭터 렌더링 그룹 추가 (헤더 바로 다음, 잔디맵 이전):
   ```tsx
   <g id="top-character">
     {itemDataUrls?.back && (
       <image href={itemDataUrls.back} x={CHAR_X} y={CHAR_Y} width={CHAR_BLOCK_SIZE} height={CHAR_BLOCK_SIZE} />
     )}
     <PotatoSvg x={CHAR_X} y={CHAR_Y} scale={CHAR_BLOCK_SIZE / 200} />
     {itemDataUrls?.head && (
       <image href={itemDataUrls.head} x={CHAR_X} y={CHAR_Y} width={CHAR_BLOCK_SIZE} height={CHAR_BLOCK_SIZE} />
     )}
     {itemDataUrls?.face && (
       <image href={itemDataUrls.face} x={CHAR_X} y={CHAR_Y} width={CHAR_BLOCK_SIZE} height={CHAR_BLOCK_SIZE} />
     )}
   </g>
   ```
   opacity=1.0(기본), z-order는 back → potato body → head → face 순서.

### Phase B3 — 우측 통계 세로 블록
5. 신규 그룹 `<g id="top-stats">`:
   - `focusBlock` 라벨(Y=STATS_FIRST_Y) + 메인(Y=STATS_FIRST_Y+34).
   - `todosBlock` 라벨(Y=STATS_FIRST_Y+STATS_BLOCK_GAP) + 메인(Y=+34).
   - 자랑 한마디 블록:
     - 라벨: "💬 내 자랑 한마디" (Y=STATS_FIRST_Y + 2*STATS_BLOCK_GAP).
     - 메인: `message || "자랑 한 마디 남겨줘!"` (color는 message 비어있을 때 `#9aa0b0` 회색, 채워졌을 때 `#2b2520`).
   - textAnchor는 기존 업적과 다르게 `start` 정렬(좌측 정렬) — 캐릭터 옆 영역의 통일성을 위해.

### Phase B4 — 하단 영역 제거
6. `<g id="achievements">`(line 395-444) 그룹 전체 삭제.
7. `<g id="user-message">`(line 447-471) 그룹 전체 삭제.
8. 워터마크(`Y=1130`)는 유지하되 잔디 그리드 + 범례 변경에 따라 Y 좌표 미세 조정.

### Phase B5 — 테스트
9. `src/components/popup/__tests__/ShareCard.test.tsx` 갱신:
   - "워터마크 캐릭터" 단언 → "좌측 상단 캐릭터" 단언.
   - "하단 업적 영역" 단언 → "우측 통계 세로 블록" 단언.
   - "하단 자랑 한마디" 단언 → "캐릭터 옆 세로 블록 자랑 한마디" 단언.
   - 좌표/Y값 단언이 있으면 새 상수 기준으로 갱신.
10. `src/components/popup/__tests__/SharePreviewModal.test.tsx` 회귀 확인 — 입력→메시지 반영 흐름 미변경이면 갱신 없음.

### Phase B6 — 검증
11. `npm test` 통과.
12. `npm run build` 통과.
13. 수동 검증:
    - 잔디 자랑하기 모달 → 캐릭터 좌측 상단 풀 컬러 + 옷 적용 ✓
    - 우측 3블록 세로 배치 ✓
    - 자랑 한마디 입력 시 우측 3번째 블록 실시간 반영 ✓
    - 잔디맵이 신규 블록 아래에 위치 ✓
    - 빈 한마디 placeholder 노출 ✓

## Verification (Part B)

- [ ] `npm test -- --run src/components/popup/__tests__/ShareCard.test.tsx` 통과
- [ ] `npm test -- --run src/components/popup/__tests__/SharePreviewModal.test.tsx` 통과
- [ ] PNG 복사 후 결과 이미지에서 캐릭터 + 3블록 + 잔디맵 순서 확인
- [ ] 캐릭터에 face/head/back 아이템 장착 시 좌측 상단 캐릭터에 모두 반영
- [ ] 빈 message → placeholder, 입력 후 → 실제 텍스트 색상 변경 동작
- [ ] 카드 좌우 시각적 균형 확인 (캐릭터 좌측 여백 ≈ 통계 블록 우측 여백)

## Out of Scope (Part B)

- 다국어 라벨.
- 캐릭터 애니메이션(정적 SVG만).
- 통계 추가(4번째 이상은 별도 PR).
- 카드 종횡비/해상도 변경.

---

## v1 → v2 변경 사항 (Momus 리뷰 반영)

- 라인 번호 수정(`state.rs:46` → `state.rs:10-21`, `phrases.ts:91-95` → `phrases.ts:87-96`).
- BR-2 재설계: phase 전환 자동 리셋을 Complete/Discarded로 한정 (FR-3과 모순 해소).
- `apply_noise_hysteresis` 시그니처 명시화: 두 prev/new 카운터 + 두 active flag 반환.
- `tick_loop` 두 atomic 처리 패턴 명시: load→store 단일 스레드 패턴(`fetch_update` 대안 설명).
- 누락 파일 추가: `MainScreen.tsx`, `usePhrase.ts`, `score.test.ts`, `usePhrase.test.ts`.
- `mapPhaseToPotatoState` 미변경 명시화(FR-9, AC-20).
- `NoiseEnter`/`NoiseExit` 로그 cross-phase 확장 명시화(FR-10, R-9, mod.rs:99 코멘트 갱신).
- BR-3 디버그 단언 위치 명시(`tick_loop` 내 `debug_assert!`).
