# 개발 문서 — 모하심 (Mohashim)

## 빠른 시작

```bash
npm install
npm run tauri dev
```

테스트:

```bash
npm test              # vitest run (265 TS 테스트)
cargo test --lib      # Rust 단위 테스트 (37개)
npm run test:watch    # watch 모드
```

---

## 빌드

```bash
npm run tauri build
```

산출물 위치: `src-tauri/target/release/bundle/`

- macOS: `macos/Mohashim.dmg`, `macos/Mohashim.app`
- Windows: `msi/Mohashim_*.msi`, `nsis/Mohashim_*.exe`

> **prebuild 자동 실행** — `npm run build` 전에 `npm run tray:gen`이 자동 실행되어 트레이 아이콘 PNG/ICO를 생성합니다.

---

## 플랫폼 지원

| 플랫폼 | 지원 수준 | 비고 |
|--------|-----------|------|
| macOS 12+ | 1차 타겟 | 마이크/접근성 권한 다이얼로그 + deep link 완전 동작. AVCaptureDevice / AXIsProcessTrusted 직접 호출 |
| Windows 10+ | 지원 | trust-on-first-use 권한 흐름 — 토글 클릭 시 Settings(`ms-settings:privacy-microphone`) 열고 INTERACTED 마킹. 알림은 Tauri plugin (winrt Toast) |
| Linux | 미지원 | Windows stub과 동일 동작, 공식 QA 없음 |

### Windows 권한 정책

Windows는 OS API로 mic/accessibility 권한 부여 여부를 검증할 수 없으므로 **trust-on-first-use** 정책을 적용합니다 (`src-tauri/src/permissions.rs::platform`).

1. 부팅 시 mic/accessibility = `not_determined`.
2. 사용자가 토글 클릭 → `ms-settings:privacy-microphone` (또는 `ms-settings:privacy`) 열림 + 해당 권한 `INTERACTED` 플래그 set.
3. 후속 `permission_status` 조회 → `granted` 반환.
4. 시작하기 활성화.

알림은 Tauri `tauri-plugin-notification`이 web Notification API로 처리하므로 별도 처리 없음.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 18 + TypeScript (strict) + Vite 5 + Tailwind CSS 3 |
| 백엔드 | Rust 2021 edition (Tauri v2) |
| 입력 감지 | rdev 0.5 (키보드/마우스 후킹) |
| 오디오 | cpal 0.15 + AVCaptureDevice (마이크 dB) |
| 저장소 | tauri-plugin-store (로컬 JSON) |
| 알림 | tauri-plugin-notification |
| 자동 시작 | tauri-plugin-autostart |
| 테스트 | Vitest + React Testing Library + jsdom / serial_test (Rust) |

---

## 아키텍처 개요

```
[Rust 백엔드]
  audio.rs    — cpal 마이크 스트림 → dB EMA 저장 (atomic f32)
  input.rs    — rdev 이벤트 → 마지막 입력 시각 저장 (atomic u64)
  power.rs    — 슬립/웨이크 감지 (NSWorkspace, macOS)
  score/mod.rs — 1Hz tick: work_score + noise_score → score-tick emit
  timer.rs    — focus_start / discard_session IPC 핸들러
  tray.rs     — 상태 변경 시에만 트레이 아이콘/타이틀 갱신 + 팝업 좌표 계산
  storage.rs  — store 래퍼 (Rust 단일 writer 정책)
  permissions.rs — 플랫폼 분기 권한 조회/요청 (macOS AVCaptureDevice, Windows TOFU)

[React 프론트엔드]
  App.tsx           — 부트, 권한 flow, 라우팅 (oc=true && canEnterMain)
  lib/score.ts      — useScoreTick() hook (score-tick 이벤트 구독)
  lib/phrases.ts    — 감자 멘트 버킷 (5단계 × 상황별)
  lib/idleChip.ts   — 8초 회전 무작위 idle 멘트
  components/popup/ — MainScreen, PomodoroCard, FocusStartButton, TimerDetailScreen,
                      GrassTab, TodosTab, SettingsScreen, OnboardingScreen
```

---

## 핵심 알고리즘

### 집중도 점수 산출 (`src-tauri/src/score/`)

매초(`tick_loop`) 다음을 산출하여 `score-tick` 이벤트로 프론트에 emit:

```text
score = work_score(idle_secs) + noise_score(db_ema)   ∈ [0, 100]
```

**work_score** (`work.rs`)
- `idle <= 180s` → 80 (만점, grace period)
- `190s` → 75 (5초마다 -5점 감점)
- `360s` → 0 (자리비움 확정)

**noise_score** (`noise.rs`)
- `db <= 65 dBSPL` → 20 (만점)
- `65 ~ 80` 사이 선형 감소
- `> 80 dBSPL` → 0 (시끄러움)
- NaN / 음수 등 비정상 입력은 20 폴백

**dB EMA** (`audio.rs::apply_ema`)
- `α = 0.1` 지수 이동 평균. RMS 1e-6 floor로 -∞ 회피.
- dBFS(0~-∞) 단위 → 프론트에서 `+94` 보정해 dBSPL(가청 범위) 표기.

**LiveState 5단계** (`phase.rs::state_from_total`)

| 점수 | 상태 | 캐릭터 표정 |
|------|------|-------------|
| 81~100 | Focused | 집중 |
| 61~80 | Calm | 평온 |
| 41~60 | Distracted | 산만 |
| 21~40 | Covering | 숨김 |
| 0~20 | Stressed | 스트레스 |

### 포모도로 phase 전이 (`timer.rs::on_phase_transition`)

```
Idle ──focus_start──▶ Focus ──시간 0──▶ Break ──시간 0──▶ Complete ──1tick──▶ Idle
                            └────discard────────────────▶ Discarded ─▶ Idle
```

- `Focus → Break`: `🍅 집중 종료!` 알림 + `active_phase = "break"` store.
- `Break → Complete`: `🎉 세션 완료!` 알림 + 세션 평균 점수 인계 (atomic), 잔디에 기록.
- `Complete → Idle`: 다음 tick에서 `on_complete_consumed` → atomic Idle 복귀.

세션 평균 점수는 Focus phase tick에만 누적(`accumulate_session_score`)되며 Break 진입 시점에 snapshot.

### 트레이 팝업 위치 (`tray.rs::apply_initial_position`)

`tray-click` 이벤트의 rect를 기반으로 모니터별 sf로 logical 좌표 변환 후 `set_position(LogicalPosition)` 호출. show 직전에 적용해 default 좌표 노출 회귀를 차단.

```
popup_left = icon_left_logical                          (기본)
if popup_left + popup_w > monitor_right:
    popup_left = icon_right_logical - popup_w           (Windows 우측 끝 폴백)

popup_top = (macOS) icon_bottom_y_logical               (메뉴바 아래)
          = (Windows) icon_top_y_logical - popup_h      (작업표시줄 위)

clamp([monitor_left .. monitor_right - popup_w], popup_left)
clamp([monitor_top  .. monitor_bottom - popup_h], popup_top)
```

JS측(`src/lib/trayPopup.ts`)도 동일 공식으로 setPosition을 보수적으로 한 번 더 호출 — Rust 한 번 + JS 한 번이지만 같은 좌표라 race 없음.

---

## 자산 안내

- `src/assets/fonts/Pretendard-*.woff2` — Pretendard v1.3.9 (SIL OFL 1.1, `LICENSE.txt` 동봉). CDN 미사용, 오프라인 보장.
- `src/assets/tray-master/*.svg` — 트레이 아이콘 5종 마스터 소스. `npm run tray:gen`으로 PNG/ICO 생성.
- `src-tauri/icons/` — 앱 아이콘 (32×32, 128×128, 128×128@2x, icon.png).

---

## 컨텍스트 / 명세

| 경로 | 내용 |
|------|------|
| `requirements/기능mvp.md` | MVP 기능 명세 전체 |
| `context/{domain}/architecture.md` | 도메인별 아키텍처 (score/timer/character/grass/todo/tray/lifecycle) |
| `context/{domain}/glossary.md` | 도메인 용어 정의 |
| `.dev/phase-{n}-*/` | 브랜치별 PRD / 설계서 / 코드맵 / Trust Ledger |

---

## 릴리즈

태그 push로 GitHub Actions가 자동 빌드·배포합니다. (`.github/workflows/release.yml`)

```bash
git tag v0.1.0
git push origin v0.1.0
```

빌드 후 GitHub Releases에 `Mohashim.dmg`와 `Mohashim_Windows.msi`가 첨부됩니다.
