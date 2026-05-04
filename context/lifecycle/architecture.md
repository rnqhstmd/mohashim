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

## 라이트 모드 only (DEC-13)

- 시스템 다크 모드 감지 무관, 항상 라이트 팔레트
- macOS 메뉴바 template 이미지는 시스템 모드에 맞춰 자동 반전 (예외)
- 추후 다크 모드 추가 시 별도 도메인/팔레트 분리 예정
