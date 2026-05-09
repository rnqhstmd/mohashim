# 개발 문서 — 모하심 (Mohashim)

> 사용자용 개요는 [README.md](README.md)를 참고하세요.

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [빠른 시작](#2-빠른-시작)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [아키텍처 개요](#4-아키텍처-개요)
5. [핵심 알고리즘](#5-핵심-알고리즘)
6. [테스트](#6-테스트)
7. [빌드](#7-빌드)
8. [플랫폼 지원](#8-플랫폼-지원)
9. [자산 안내](#9-자산-안내)
10. [릴리즈](#10-릴리즈)
11. [기여 가이드](#11-기여-가이드)
12. [컨텍스트 / 명세](#12-컨텍스트--명세)

---

## 1. 사전 요구사항

| 도구 | 최소 버전 | 확인 명령어 |
|------|-----------|-------------|
| Node.js | 18.x 이상 | `node --version` |
| npm | 9.x 이상 | `npm --version` |
| Rust | 1.77 이상 | `rustc --version` |
| Cargo | 1.77 이상 (Rust와 함께 설치) | `cargo --version` |

**플랫폼별 추가 요구사항:**

- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Microsoft C++ Build Tools (Visual Studio Installer에서 설치)

Tauri v2 전체 사전 요구사항은 [공식 문서](https://v2.tauri.app/start/prerequisites/)를 참고하세요.

---

## 2. 빠른 시작

```bash
# 저장소 클론
git clone https://github.com/rnqhstmd/mohashim.git
cd mohashim

# 의존성 설치
npm install

# 개발 서버 실행 (Hot reload 지원)
npm run tauri dev
```

> 첫 실행 시 Rust 크레이트 컴파일로 수 분이 소요될 수 있습니다.

---

## 3. 프로젝트 구조

```
mohashim/
├── src/                        # React 프론트엔드
│   ├── App.tsx                 # 앱 루트: 권한 플로우, 라우팅
│   ├── main.tsx
│   ├── styles.css
│   ├── assets/
│   │   ├── fonts/              # Pretendard 웹폰트 (오프라인)
│   │   └── tray-master/        # 트레이 아이콘 SVG 마스터 소스
│   ├── components/
│   │   └── popup/              # 팝업 UI 컴포넌트
│   │       ├── MainHeader.tsx
│   │       ├── PomodoroCard.tsx
│   │       ├── FocusStartButton.tsx
│   │       ├── GrassTab.tsx
│   │       ├── TodosTab.tsx
│   │       ├── ShopTab.tsx
│   │       ├── TimerDetailScreen.tsx
│   │       ├── SettingsScreen.tsx
│   │       └── OnboardingScreen.tsx
│   ├── lib/                    # 비즈니스 로직 / 훅
│   │   ├── score.ts            # useScoreTick() — score-tick 이벤트 구독
│   │   ├── phrases.ts          # 모하 멘트 버킷 (5단계 × 상황별)
│   │   ├── idleChip.ts         # 8초 회전 무작위 idle 멘트
│   │   ├── grass.ts            # 잔디 데이터 처리
│   │   ├── timer.ts            # 타이머 상태 관리
│   │   ├── todos.ts            # 할일 CRUD
│   │   ├── permissions.ts      # 권한 상태 조회
│   │   ├── storage.ts          # store 래퍼
│   │   ├── economy.ts          # 새싹 경제 (보상)
│   │   ├── shop.ts             # 상점 상태
│   │   ├── shopCatalog.ts      # 상점 아이템 카탈로그
│   │   ├── mailbox.ts          # 편지함
│   │   ├── trayPopup.ts        # 트레이 팝업 위치 보정
│   │   ├── toast.ts            # 토스트 알림
│   │   └── usePhrase.ts        # 구문 훅
│   └── test/                   # 프론트엔드 테스트
├── src-tauri/                  # Rust 백엔드 (Tauri v2)
│   ├── src/
│   │   ├── main.rs             # 앱 진입점
│   │   ├── lib.rs              # 크레이트 루트, 커맨드 등록
│   │   ├── audio.rs            # cpal 마이크 스트림 → dB EMA
│   │   ├── input.rs            # rdev 이벤트 → 마지막 입력 시각
│   │   ├── power.rs            # 슬립/웨이크 감지 (macOS NSWorkspace)
│   │   ├── timer.rs            # focus_start / discard_session IPC
│   │   ├── tray.rs             # 트레이 아이콘 갱신 + 팝업 위치 계산
│   │   ├── storage.rs          # store 래퍼 (Rust 단일 writer 정책)
│   │   ├── permissions.rs      # 플랫폼 분기 권한 조회/요청
│   │   ├── logger.rs           # 구조화 로깅
│   │   ├── score/              # 집중도 점수 엔진
│   │   │   ├── mod.rs          # 1Hz tick_loop, score-tick emit
│   │   │   ├── work.rs         # work_score (idle 기반)
│   │   │   ├── noise.rs        # noise_score (dB EMA 기반)
│   │   │   ├── phase.rs        # LiveState 5단계 분류
│   │   │   ├── ema.rs          # 지수 이동 평균
│   │   │   ├── shared.rs       # 공유 atomic 상태
│   │   │   └── state.rs        # 점수 상태 관리
│   │   ├── economy/            # 새싹 보상 경제
│   │   │   ├── mod.rs
│   │   │   ├── reward.rs
│   │   │   └── state.rs
│   │   ├── shop/               # 상점
│   │   │   ├── mod.rs
│   │   │   ├── catalog.rs
│   │   │   └── state.rs
│   │   ├── insight/            # 월간 인사이트
│   │   │   ├── mod.rs
│   │   │   ├── buckets.rs
│   │   │   └── templates.rs
│   │   └── mailbox/            # 편지함
│   │       └── mod.rs
│   ├── icons/                  # 앱 아이콘
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/                    # 빌드 유틸리티
├── context/                    # 도메인 컨텍스트 문서
├── requirements/               # 기능 명세
├── docs/                       # 문서 자산 (스크린샷 등)
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── tailwind.config.ts
```

---

## 4. 아키텍처 개요

모하심은 Tauri v2의 IPC(Inter-Process Communication) 모델을 따릅니다. Rust 백엔드가 시스템 리소스(마이크, 입력, 트레이)를 직접 관리하고, React 프론트엔드는 Tauri 이벤트와 커맨드를 통해 상태를 수신·조작합니다.

```
┌─────────────────────────────────────────────────────┐
│  React 프론트엔드 (WebView)                           │
│                                                     │
│  App.tsx ─→ 권한 플로우 ─→ 메인 화면                  │
│  useScoreTick() ──────────────── score-tick 이벤트 ←┐│
│  usePomodoroState() ───── IPC Commands              ││
└───────────────────────────── Tauri IPC ─────────────┘│
                                                       │
┌─────────────────────────────────────────────────────┐│
│  Rust 백엔드                                          ││
│                                                     ││
│  audio.rs ──→ dB EMA (atomic f32)                   ││
│  input.rs ──→ 마지막 입력 시각 (atomic u64)             ││
│  score/mod.rs ─→ 1Hz tick: work + noise ────────────┘│
│  timer.rs ──→ Focus / Break / Complete 상태 전이      │
│  tray.rs  ──→ 아이콘 갱신 + 팝업 위치 계산              │
│  permissions.rs ─→ macOS / Windows 권한 분기          │
│  storage.rs ──→ tauri-plugin-store (단일 writer)     │
└─────────────────────────────────────────────────────┘
```

**설계 원칙:**

- **단일 writer 정책**: store 쓰기는 Rust에서만 수행. 프론트엔드는 읽기 전용 IPC 조회 또는 이벤트 수신.
- **Atomic 상태**: dB EMA와 마지막 입력 시각은 `atomic f32` / `atomic u64`로 lock-free 공유.
- **1Hz tick**: 점수 계산은 1초 주기 `tick_loop`에서만 실행되어 부하를 최소화.

---

## 5. 핵심 알고리즘

### 5.1 집중도 점수 산출 (`src-tauri/src/score/`)

매초 `tick_loop`에서 다음을 산출해 `score-tick` 이벤트로 프론트엔드에 전송합니다.

```
score = work_score(idle_secs) + noise_score(db_ema)   ∈ [0, 100]
```

#### work_score (`work.rs`)

키보드/마우스 마지막 입력 이후 경과 시간(idle_secs)을 기반으로 산출합니다.

```
idle <= 180s  →  80점  (grace period: 짧은 자리비움은 만점 유지)
180s ~ 360s   →  5초마다 -5점 (선형 감소)
idle >= 360s  →   0점  (자리비움 확정)
```

#### noise_score (`noise.rs`)

마이크 dB EMA를 기반으로 산출합니다.

```
db <= 65 dBSPL          →  20점  (조용한 환경, 만점)
65 dBSPL < db <= 80     →  선형 감소
db > 80 dBSPL           →   0점  (시끄러운 환경)
NaN / 음수 (비정상 입력)  →  20점  (폴백)
```

#### dB EMA (`audio.rs`)

```
α = 0.1 지수 이동 평균
RMS 1e-6 floor → -∞ 회피
단위: dBFS(0~-∞) → 프론트엔드에서 +94 보정 → dBSPL(가청 범위) 표기
```

#### LiveState 5단계 분류 (`phase.rs`)

| 점수 범위 | 상태 | 모하 표정 |
|-----------|------|-----------|
| 81~100 | Focused | 집중 |
| 61~80 | Calm | 평온 |
| 41~60 | Distracted | 산만 |
| 21~40 | Covering | 숨김 |
| 0~20 | Stressed | 스트레스 |

---

### 5.2 포모도로 Phase 전이 (`timer.rs`)

```
Idle ──focus_start──▶ Focus ──시간 0──▶ Break ──시간 0──▶ Complete ──1tick──▶ Idle
                            └────discard────────────────▶ Discarded ──────────▶ Idle
```

| 전이 | 동작 |
|------|------|
| Focus → Break | `🍅 집중 종료!` OS 알림 + `active_phase = "break"` store 기록 |
| Break → Complete | `🎉 세션 완료!` OS 알림 + 세션 평균 점수 인계 (atomic) + 잔디 기록 |
| Complete → Idle | 다음 tick에서 `on_complete_consumed` → atomic Idle 복귀 |

세션 평균 점수는 Focus phase tick에만 누적(`accumulate_session_score`)되며, Break 진입 시점에 snapshot됩니다.

---

### 5.3 트레이 팝업 위치 계산 (`tray.rs`)

`tray-click` 이벤트의 아이콘 rect를 기반으로 모니터별 scale factor로 logical 좌표를 변환한 뒤 `set_position(LogicalPosition)`을 호출합니다. `show()` 직전에 적용해 기본 좌표 노출 회귀를 방지합니다.

```
popup_left = icon_left_logical
if popup_left + popup_w > monitor_right:
    popup_left = icon_right_logical - popup_w    # Windows 우측 끝 폴백

popup_top = icon_bottom_y_logical               # macOS: 메뉴바 아래
          = icon_top_y_logical - popup_h        # Windows: 작업표시줄 위

clamp([monitor_left .. monitor_right - popup_w], popup_left)
clamp([monitor_top  .. monitor_bottom - popup_h], popup_top)
```

JS측(`src/lib/trayPopup.ts`)도 동일 공식으로 `setPosition`을 보수적으로 한 번 더 호출합니다. Rust와 JS가 같은 좌표를 계산하므로 race condition이 없습니다.

---

## 6. 테스트

### TypeScript 테스트 (Vitest)

```bash
# 전체 실행 (265개)
npm test

# Watch 모드
npm run test:watch

# UI 포함 실행
npm run test:ui
```

테스트 파일은 `src/test/` 및 `src/components/__tests__/`, `src/lib/__tests__/`에 위치합니다.

### Rust 테스트

```bash
# 단위 테스트 (37개) — serial_test로 순차 실행
cargo test --lib --manifest-path src-tauri/Cargo.toml

# 특정 모듈만 실행
cargo test --lib score --manifest-path src-tauri/Cargo.toml
```

> Rust 테스트는 `serial_test`를 사용해 전역 atomic 상태 충돌을 방지합니다.

### 전체 검증

```bash
npm test && cargo test --lib --manifest-path src-tauri/Cargo.toml
```

---

## 7. 빌드

```bash
npm run tauri build
```

빌드 전 `npm run tray:gen`이 자동 실행되어 트레이 아이콘 PNG/ICO를 생성합니다.

**산출물 위치:** `src-tauri/target/release/bundle/`

| 플랫폼 | 산출물 |
|--------|--------|
| macOS | `macos/Mohashim.dmg`, `macos/Mohashim.app` |
| Windows | `msi/Mohashim_*.msi`, `nsis/Mohashim_*.exe` |

---

## 8. 플랫폼 지원

| 플랫폼 | 지원 수준 | 비고 |
|--------|-----------|------|
| macOS 12+ | 1차 타겟 | AVCaptureDevice / AXIsProcessTrusted 직접 호출. 마이크·접근성 권한 다이얼로그 완전 동작 |
| Windows 10+ | 지원 | Trust-on-first-use 권한 정책 적용 (아래 참고). 알림은 winrt Toast |
| Linux | 미지원 | Windows stub과 동일 동작. 공식 QA 없음 |

### Windows 권한 정책 (Trust-on-first-use)

Windows는 OS API로 마이크/접근성 권한 부여 여부를 직접 검증할 수 없으므로 TOFU 정책을 적용합니다 (`src-tauri/src/permissions.rs`).

1. 앱 시작 시 `mic / accessibility = not_determined`
2. 사용자가 토글 클릭 → `ms-settings:privacy-microphone` (또는 `ms-settings:privacy`) 열림 + 해당 권한 `INTERACTED` 플래그 설정
3. 이후 `permission_status` 조회 → `granted` 반환
4. 집중 시작 버튼 활성화

알림은 `tauri-plugin-notification`이 web Notification API로 처리하므로 별도 처리가 필요 없습니다.

---

## 9. 자산 안내

| 경로 | 설명 |
|------|------|
| `src/assets/fonts/Pretendard-*.woff2` | Pretendard v1.3.9 (SIL OFL 1.1). CDN 미사용, 오프라인 보장 |
| `src/assets/tray-master/*.svg` | 트레이 아이콘 5종 SVG 마스터 소스. `npm run tray:gen`으로 PNG/ICO 생성 |
| `src-tauri/icons/` | 앱 아이콘 (32×32, 128×128, 128×128@2x, icon.png, icon.ico) |

트레이 아이콘을 수정할 때는 SVG 마스터를 수정한 뒤 `npm run tray:gen`을 실행하세요. PNG/ICO를 직접 수정하지 마세요.

---

## 10. 릴리즈

태그를 push하면 GitHub Actions(`.github/workflows/release.yml`)가 macOS와 Windows 바이너리를 자동 빌드하여 GitHub Releases에 첨부합니다.

```bash
# 버전 태그 push
git tag v0.1.0
git push origin v0.1.0
```

**빌드 후 GitHub Releases에 자동 첨부되는 파일:**
- `Mohashim.dmg` (macOS universal binary)
- `Mohashim_Windows.msi` (Windows 설치 파일)

릴리즈 전 체크리스트:
- [ ] `package.json`의 `version` 필드 업데이트
- [ ] `src-tauri/Cargo.toml`의 `version` 필드 업데이트
- [ ] `src-tauri/tauri.conf.json`의 `version` 필드 업데이트
- [ ] `npm test` 및 `cargo test --lib` 통과 확인

---

## 11. 기여 가이드

### 브랜치 전략

| 브랜치 패턴 | 용도 |
|-------------|------|
| `main` | 안정 릴리즈 |
| `feat/<기능명>` | 새 기능 개발 |
| `fix/<버그명>` | 버그 수정 |
| `chore/<작업명>` | 빌드·설정·문서 등 비기능 변경 |

### Pull Request 절차

1. 이슈를 열어 변경 사항을 먼저 논의하세요 (작은 버그 수정은 생략 가능).
2. `main`에서 브랜치를 분기하여 작업하세요.
3. 변경 사항에 맞는 테스트를 추가하거나, 기존 테스트가 모두 통과하는지 확인하세요.
4. 커밋 메시지는 한국어 또는 영어 모두 허용하며, 의미 있는 단위로 커밋하세요.
5. PR 제목에 변경 유형을 명시하세요 (예: `feat: 집중도 그래프 내보내기 추가`).

### 코드 스타일

- TypeScript: ESLint + Prettier (설정은 프로젝트 루트 참고)
- Rust: `cargo fmt` + `cargo clippy` 경고 없음
- 새 Rust 모듈은 `src-tauri/src/` 아래에 추가하고 `lib.rs`에 등록하세요.

---

## 12. 컨텍스트 / 명세

| 경로 | 내용 |
|------|------|
| `requirements/기능mvp.md` | MVP 기능 명세 전체 |
| `context/{domain}/architecture.md` | 도메인별 아키텍처 (score/timer/character/grass/todo/tray/lifecycle) |
| `context/{domain}/glossary.md` | 도메인 용어 정의 |
| `.dev/phase-{n}-*/` | 브랜치별 PRD / 설계서 / 코드맵 / Trust Ledger |

---

<div align="center">

[README.md](README.md) · [이슈](https://github.com/rnqhstmd/mohashim/issues) · [릴리즈](https://github.com/rnqhstmd/mohashim/releases)

</div>
