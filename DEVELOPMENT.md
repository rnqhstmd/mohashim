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
| macOS 12+ | 1차 타겟 | 마이크/접근성 권한 다이얼로그 + deep link 완전 동작 |
| Windows 10+ | 지원 | 권한 자동 승인(stub), 마이크는 OS 팝업으로 처리 |
| Linux | 미지원 | Windows stub과 동일 동작, 공식 QA 없음 |

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
  tray.rs     — 상태 변경 시에만 트레이 아이콘/타이틀 갱신
  storage.rs  — store 래퍼 (Rust 단일 writer 정책)

[React 프론트엔드]
  App.tsx           — 부트, 권한 flow, 라우팅
  lib/score.ts      — useScoreTick() hook (score-tick 이벤트 구독)
  lib/phrases.ts    — 감자 멘트 버킷 (5단계 × 상황별)
  components/popup/ — MainScreen, PomodoroRunning, GrassTab, TodosTab, SettingsScreen
```

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
