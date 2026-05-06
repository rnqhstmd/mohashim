# lifecycle 아키텍처

## 첫 실행 흐름

```
앱 실행
   ↓
store에서 onboarding_completed 읽기
   ↓
시스템 권한(마이크·접근성) 상태 확인
   ↓
┌─────────────────────────────────────┐
│ 둘 다 OK + 플래그 true   → 메인 팝업  │
│ 그 외                    → Onboarding │
└─────────────────────────────────────┘
```

- 시스템 권한이 사용자에 의해 OS 설정에서 OFF되어 있으면 플래그와 무관하게 onboarding 강제 노출
- 권한 거절 시 OS 설정 deep link 버튼 제공

## 권한 게이팅 (DEC-9)

```ts
type PermissionState = { mic: boolean; accessibility: boolean };

function canEnterMain(p: PermissionState): boolean {
  return p.mic && p.accessibility;
}
```

- 부분 거절 동작 미지원 — 둘 다 필수
- 거절 즉시 onboarding 화면으로 되돌림

## 앱 재시작 처리 (DEC-11)

- 앱 종료 시: 진행 중 세션 정보를 저장하지 않음
- 앱 시작 시: phase = Idle 으로 시작
- 잔디·투두·설정·태그는 store에서 정상 복원
- 단순함 우선 — 세션 복원 로직 미구현

## 데이터 초기화 (DEC-12)

### 진입점

- Settings 탭 최하단 위험 영역
- 빨간 텍스트 버튼 "모든 데이터 초기화"

### Friction 모달

```
┌──────────────────────────────────┐
│  ⚠ 정말 다 지울거야?             │
│                                  │
│  "모하" 라고 입력해줘            │
│  ┌────────────┐                  │
│  │            │                  │
│  └────────────┘                  │
│                                  │
│  [취소]  [지우기]  ← 입력 일치만  │
└──────────────────────────────────┘
```

### 처리 순서

1. 진행 중 세션 있으면 자동 discard (timer 도메인 호출)
2. store JSON 파일 전체 삭제
3. 메모리 상태 리셋
4. onboarding_completed = false
5. OnboardingScreen으로 리부팅

## Storage (tauri-plugin-store)

```
~/Library/Application Support/mohashim/.store.json   (macOS)
%APPDATA%\mohashim\.store.json                         (Windows)
```

### 키 목록

| 키 | 타입 | 도메인 |
|----|------|--------|
| `onboarding_completed` | bool | lifecycle |
| `focus_minutes` | number (5~90) | timer |
| `break_minutes` | number (3~30) | timer |
| `todos` | Todo[] | todo |
| `work_tags` | WorkTag[] | todo |
| `locations` | Location[] | todo |
| `sessions` | Map<date, SessionRecord> | grass |
| `notifications_enabled` | bool | timer |
| `auto_launch_enabled` | bool | lifecycle (PR #9) |

## 폰트 번들 (DEC-1)

```
src/assets/fonts/
├─ Pretendard-Regular.woff2   (500)
├─ Pretendard-Medium.woff2    (500/600)
├─ Pretendard-Bold.woff2      (700)
└─ Pretendard-ExtraBold.woff2 (800)
```

- `index.html` 또는 글로벌 CSS에서 `@font-face`로 로컬 경로 등록
- CDN URL 절대 사용 X (`@import url('https://...')` 금지)
- ShareCard SVG 합성 시에도 동일 번들 폰트 사용 (외부 fetch 0건)

## OnboardingScreen 레이아웃

```
┌──────────────────────────────────┐
│  WELCOME TO                      │
│  모하심                          │
│       [ Potato calm 84px ]       │
│   ◀ "시작하려면 권한 두 개 줘!"  │  ← SpeechBubble (character)
│                                  │
│  ┌────────────────────────┐      │
│  │ 🎤  마이크 권한          [20점] │ ← BLUE_LIGHT 카드 + 초록 pill
│  │     음량(dB)만 측정 …    │      │
│  └────────────────────────┘      │
│  ┌────────────────────────┐      │
│  │ ⌨  접근성 권한          [80점] │
│  │     입력 발생 여부만 …   │      │
│  └────────────────────────┘      │
│                                  │
│  🔒 모든 데이터는 내 컴퓨터에만   │ ← Privacy badge
│  [→ 권한 허용하고 시작]          │
└──────────────────────────────────┘
```

- 권한 카드 우측 점수 pill — 마이크=20점 / 접근성=80점 (점수 비중 시각화)
- Privacy badge — BLUE_LIGHT 배경 + BLUE_DEEP 보더 + 자물쇠 이모지
- 동의 버튼 클릭 → 두 권한 순차 요청 → 둘 다 OK 시 메인 진입, 한 쪽이라도 거절 시 onboarding 유지

## 트레이 정체성 (PR #9)

`visible:false` + `LSUIElement` + `prevent_close` 세 변경의 결합 효과로 모하심을 트레이 전용 앱으로 정착시킨다.

- **`tauri.conf.json` `visible: false`** — 부팅 시점에 메인 윈도우 자동 노출 안 함. 부팅 깜빡임 제거.
- **`Info.plist` `LSUIElement = true`** — macOS Dock 아이콘 + Cmd+Tab 앱 전환 목록에서 제외 (메뉴바 전용 앱 동작).
- **`on_close_requested` → `api.prevent_close()` + `window.hide()`** — 창 닫기(X)는 종료가 아니라 숨김. 트레이 "종료" 메뉴(`app.exit(0)`)만 실 종료 경로.

### 첫 실행 윈도우 show

`lib.rs` setup에서 `storage::get_onboarding_completed`로 값을 읽어 `false`이면 `attempt_show`로 메인 윈도우를 show + set_focus한다.

- `attempt_show`는 `app.get_webview_window("main")`이 None일 경우 `tauri::async_runtime::spawn`으로 100ms sleep 후 1회 재시도, 그래도 실패하면 eprintln 후 종료
- store open 실패는 conservative fallback으로 `attempt_show`를 그대로 호출 (신규 설치 가능성으로 간주, 영구 invisible 회피)

### Cmd+Q 정책

본 Phase 범위 외. `prevent_close`는 `WindowEvent::CloseRequested`만 처리하며, macOS Cmd+Q는 `ApplicationShouldTerminate` 별도 경로로 종료 가능. `LSUIElement=true`로 메뉴바가 사라져 발화 빈도는 감소하나 완전 차단은 아님 — 후속 Phase에서 결정.

## autostart 백엔드 (PR #9)

`tauri-plugin-autostart` v2를 도입하여 사용자 설정으로 OS 자동 실행을 제어한다 (UI 토글은 후속 Phase).

- macOS launcher = **`LaunchAgent`** — 사용자 단위 plist (`~/Library/LaunchAgents/`)에 등록
- 기본값 = **`auto_launch_enabled: false`** — 신규 설치 시 OFF 상태. 사용자가 명시적으로 켜야 자동 실행
- Rust 단일 writer 정책 — `set_auto_launch` IPC만 store.set 수행. setup의 `sync_autolaunch`는 read만 하고 OS API enable/disable로 정렬
- 동기화 실패는 `eprintln!` 후 부트 진행 (기존 setup 정책 일관)
- `reset_all`도 store false 리셋과 함께 `app.autolaunch().disable()` 호출하여 OS↔store 정합 유지

## 라이트 모드 only (DEC-13)

- 시스템 다크 모드 감지 무관, 항상 라이트 팔레트
- macOS 메뉴바 template 이미지는 시스템 모드에 맞춰 자동 반전 (예외)
- 추후 다크 모드 추가 시 별도 도메인/팔레트 분리 예정
