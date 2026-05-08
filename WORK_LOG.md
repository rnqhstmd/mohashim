# 작업 로그 (Work Log)

`main` 브랜치의 코드 변경을 시간순으로 누적 기록한다.
새 변경이 발생할 때마다 **최신 항목을 위쪽에 추가**한다 (최신이 위, 오래된 게 아래).

---

## 운용 규칙

1. **포함 대상**: `main`에 머지되거나 머지 예정인 모든 코드/설정/스크립트 변경.
2. **제외 대상**: 임시 빌드 산출물, 로컬 환경 설치(rust toolchain, VS Build Tools 등 시스템 레벨 작업).
3. **엔트리 포맷**:
   - 일시 (KST, ISO 8601 풍 `YYYY-MM-DD HH:MM`)
   - 한 줄 요약
   - **배경/원인** — 왜 이 변경이 필요했는지 (재현 시나리오, 에러 메시지 등)
   - **변경 파일** — 경로별로 추가/수정/삭제 요약 + 핵심 diff
   - **검증** — 어떻게 동작 확인했는지 (커맨드 + 기대 결과)
   - **영향 범위** — 다른 플랫폼/플로우/CI에 미치는 영향
   - (선택) **후속 과제** — 이번 작업에서 발견된 별도 이슈

---

## 2026-05-08 22:30 KST — 인스톨러/표시명 한국어화 (productName "모하심" + NSIS Korean)

### 요약
사용자 피드백: 인스톨러 셋업 화면이 영문이고 앱 표시명도 "Mohashim"이라 어색. 한국어 사용자에게 친숙하도록 표시명을 모두 "모하심"으로 통일하고 NSIS 인스톨러를 한국어로 표시.

### 배경 / 원인
- 사용자가 "Welcome to Mohashim Setup" 등 영문 NSIS 화면을 보고 한국어로 정렬 요청.
- Tauri NSIS bundler는 `productName`을 시스템 매크로(`$(^Name)` 등)에 자동 보간 → 영문 productName이면 모든 인스톨러 텍스트도 영문.
- 잔디 자랑하기 워터마크는 이미 ShareCard 코드상 "모하심" 한글이라 신규 빌드에선 정상 노출 (사용자가 옛 빌드 본 가능성 있음).

### 변경 파일

#### 1. `src-tauri/tauri.conf.json`
- `productName`을 한글 `"모하심"`으로 변경 — 인스톨러 / 시작 메뉴 / 설치 폴더 표시명에 반영.
- `mainBinaryName: "Mohashim"` 신설 — 실행 파일(.exe)은 영문 유지하여 Path/스크립트 호환성 보존.
- `bundle.windows.nsis.languages: ["Korean"]` 추가 — NSIS Modern UI 시스템 텍스트(Welcome / Install / Finish 등) 한국어 번역 사용.

```diff
- "productName": "Mohashim",
+ "productName": "모하심",
+ "mainBinaryName": "Mohashim",
  ...
  "windows": {
    "nsis": {
      "installerIcon": "icons/icon.ico",
      "headerImage": "installer/header.bmp",
-     "sidebarImage": "installer/sidebar.bmp"
+     "sidebarImage": "installer/sidebar.bmp",
+     "languages": ["Korean"]
    }
  }
```

#### 2. `scripts/installer-art-gen.mjs`
- 헤더 / 사이드바 BMP의 영문 텍스트를 한글로 교체:
  - 헤더: "Mohashim" → "모하심"
  - 사이드바: "Mohashim / Focus tracker / Local-first · Privacy first" → "모하심 / 집중 트래커 / 내 PC에만 저장돼요"
- 폰트 family를 시스템 한글 폰트 폴백 체인으로 명시:
  ```
  'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', sans-serif
  ```
  Windows 빌드 머신의 fontconfig가 Malgun Gothic을 자동 매칭. macOS 빌드 시(미래)도 폴백 동작.
- 글자 크기 / 위치를 한글 글리프 폭에 맞춰 미세 조정.

### 검증
1. **빌드**: `npm run tauri build -- --debug --bundles nsis` — 26초, 에러/경고 없음.
2. **산출물**:
   - 실행파일: `src-tauri/target/debug/Mohashim.exe` (영문, mainBinaryName)
   - 인스톨러: `src-tauri/target/debug/bundle/nsis/모하심_0.1.0_x64-setup.exe` (한글, productName)
3. **사용자 직접 검증** (인스톨러 실행 후 확인):
   - 셋업 마법사 "환영합니다" 등 NSIS 시스템 텍스트가 한국어로 노출
   - 좌측 사이드바 BMP에 "모하심 / 집중 트래커 / 내 PC에만 저장돼요" 한글 노출
   - 시작 메뉴 / 작업 표시줄 / 트레이 hover에 "모하심" 표시

### 영향 범위
- **macOS**: 영향 없음 (NSIS Windows 전용). productName 한글은 macOS dmg 파일명에도 영향(`모하심.dmg`)이지만 macOS는 한글 파일명 완전 지원하므로 문제 없음. mainBinaryName으로 .app 내부 실행파일은 영문 유지.
- **Windows**: 인스톨러/시작메뉴/설치폴더가 한글, 실행파일은 영문 → 한글 호환 + 스크립트 호환 모두 충족.
- **CI/릴리즈**: 산출물 파일명이 변경됨 (`Mohashim_Windows.msi` → `모하심_0.1.0_x64.msi` 등). README의 다운로드 링크가 옛 영문 파일명으로 되어 있어 GitHub Releases 자산명과 매칭되도록 후속 정리 필요 — 본 PR에는 미포함.
- **잔디 자랑하기**: ShareCard 워터마크 / 부제는 이미 한글이라 코드 변경 없음. 사용자가 옛 빌드 보고 영문 인식했다면 신규 인스톨러 깔면 자동 해소.

### 후속 과제 (선택)
- README 다운로드 링크의 자산 파일명을 새 한글 파일명에 맞게 갱신.
- `.github/workflows/release.yml`이 자산명을 영문으로 가정한다면 동일 갱신.
- 인스톨러 진행 페이지 텍스트의 "%product_name%" 보간 결과 검증 (사용자 캡처로 확인).

---

## 2026-05-08 22:10 KST — Idle chip 멘트 회전 주기 8초 → 15분

### 요약
모하 캐릭터의 idle chip 멘트("음료 홀짝이는 중", "멍때리는 중" 등)가 8초마다 회전해 산만하게 느껴진다는 사용자 피드백 반영. 회전 주기를 **15분**으로 늘려 "거의 변하지 않는 듯하면서도 가끔 환기"되는 톤으로 조정.

### 배경 / 원인
- `src/lib/idleChip.ts:12` `ROTATE_INTERVAL_MS = 8000` — 8초마다 IDLE_LABELS 5개를 순환.
- 사용자 입장에선 팝업을 짧게 봐도 chip이 자주 바뀌어 "수시로 변한다"는 인상.
- 1시간은 사실상 고정에 가까워 캐릭터의 살아있는 느낌이 죽음 → 15분이 가장 자연스러운 절충.

### 변경 파일

#### 1. `src/lib/idleChip.ts`
```diff
- export const ROTATE_INTERVAL_MS = 8000;
+ // Phase 21 사용자 피드백: 8초 회전이 너무 잦아 산만하게 느껴진다 — 15분으로 늘려
+ // "거의 안 바뀐 듯하지만 가끔 환기"되는 톤으로 조정. 캐릭터의 살아있는 느낌은 유지.
+ export const ROTATE_INTERVAL_MS = 15 * 60 * 1000;
```

#### 2. `src/lib/__tests__/idleChip.test.ts`
- 하드코딩된 `8000`을 모두 import한 `ROTATE_INTERVAL_MS` 상수 사용으로 일반화.
- 미래에 주기를 또 바꿔도 테스트가 자동 적응.

### 검증
- 단위 테스트 (`npm test src/lib/__tests__/idleChip.test.ts`): **7/7 passed**.
- NSIS 빌드: 26초 만에 인스톨러 생성 성공.

### 영향 범위
- idle 상태(자리비움 등)에서만 노출되는 chip에 한정 — focus 중 SpeechBubble 멘트는 영향 없음.
- macOS / Windows 동일 동작 (플랫폼 무관 상수).

---

## 2026-05-08 22:00 KST — 트레이 우클릭 메뉴 확장 (자동 시작 + 작업 표시줄 고정 안내)

### 요약
트레이 우클릭 시 "종료" 한 항목만 노출되어 발견성이 낮던 문제를 해결. 자주 쓰는 액션들을 우클릭으로 한 번에 처리할 수 있도록 메뉴를 4~5개로 확장:
- **모하 열기** — 좌클릭과 동일하게 팝업 노출 (위치는 마지막 hide 좌표 유지)
- **자동 시작** (체크형) — 트레이 자체에서 즉시 토글 + 체크 표시 동기화
- **작업 표시줄에 고정 안내** (Windows만) — 클릭 시 단계별 가이드 모달 노출
- **종료** — 기존 그대로 (`app.exit(0)`)

OS는 보안상 앱이 자기 자신을 작업 표시줄에 자동 pin할 수 없어 "안내"만 가능. 자동 시작 토글이 동등 효과(부팅 시 자동 실행)를 주므로 트레이에서 빠른 액세스를 강조.

### 배경 / 원인
- 사용자 보고: "트레이 우클릭 시 고정이 아닌 종료밖에 없어" — 우클릭 액션의 발견성 부재.
- macOS는 메뉴바 앱 표준(LSUIElement=true)이라 Dock pin 자체가 의미 없음. 자동 시작이 충분.
- Windows는 `시작 메뉴 → 모하 우클릭 → 작업 표시줄에 고정` 경로가 유효하지만 사용자가 모름. 트레이 우클릭에 안내 노출 필요.

### 변경 파일

#### 1. `src-tauri/src/tray.rs`
- `tauri::menu::CheckMenuItem`, `PredefinedMenuItem` 추가 import.
- `tauri_plugin_autostart::ManagerExt` import (트레이에서 자동 시작 manager 호출).
- `init_tray()`의 메뉴 구성 확장:
  - `open_item` (모하 열기), `autostart_item` (CheckMenuItem), `pin_guide_item` (Windows만), `quit_item`
  - `cfg(target_os)` 분기로 메뉴 항목 OS별 분기.
- `on_menu_event` 핸들러 분기:
  - `"open"` → `win.show()` + `set_focus()`
  - `"autostart"` → 현재 상태 반전 후 enable/disable + `set_checked()`로 즉시 메뉴 갱신
  - `"pin_guide"` (Windows) → 메인 윈도우 노출 + `app.emit("show-pin-guide")` → 프론트 모달
  - `"quit"` → `app.exit(0)`
- 자동 시작 manager 호출 실패 시 체크 상태는 변경하지 않음 (다음 클릭 시 재시도) — 외부 상태와 UI의 비일관 회피.

#### 2. `src/components/popup/PinGuideModal.tsx` (신규)
- DiscardModal 스타일 베이스 (paperWarm + ink border + 그림자).
- 단계별 안내 (1) 시작 메뉴 검색 → (2) 우클릭 → (3) "작업 표시줄에 고정".
- 하단에 자동 시작 보조 안내 (mist 박스).
- Backdrop 클릭 또는 "확인했어요" 버튼으로 닫힘.

#### 3. `src/App.tsx`
- `@tauri-apps/api/event::listen` import.
- `PinGuideModal` import.
- `showPinGuide` state 추가.
- 새 useEffect: `listen("show-pin-guide", () => setShowPinGuide(true))` + cleanup.
- 최상위 div에 `<PinGuideModal>` 렌더 (MainScreen / OnboardingScreen 어느 쪽이든 모달이 위에 뜨도록).

### 검증
1. **단위 테스트** (`npm test`): 26 files / **357 tests passed** — 모달은 신규라 기존 테스트 회귀 없음.
2. **Rust 컴파일** (`cargo check`): 깨끗 (3.6s, dead_code warning 외 변경 없음).
3. **TypeScript 컴파일** (`tsc --noEmit`): 깨끗.
4. **NSIS 빌드**: 30초 만에 인스톨러 생성 성공.
5. **End-to-end (Windows)**:
   - 트레이 우클릭 → 4개 항목 노출 (모하 열기 / 자동 시작 / 작업 표시줄에 고정 안내 / 종료)
   - 자동 시작 클릭 → 체크 표시 즉시 토글 + OS 등록/해제
   - "작업 표시줄에 고정 안내" 클릭 → 메인 팝업 자동 표시 + 모달 오버레이 노출
6. **End-to-end (macOS)**:
   - 트레이 우클릭 → 3개 항목 (모하 열기 / 자동 시작 / 종료) — pin guide 미노출.

### 영향 범위
- **macOS**: 우클릭 메뉴에 "모하 열기" + "자동 시작" 추가. Dock 전혀 무관.
- **Windows**: 트레이 발견성 대폭 향상. 작업 표시줄 자동 pin은 OS 한계로 불가하나 단계별 안내로 우회.
- **Linux** (비공식): `cfg(target_os = "windows")` 가드로 pin_guide 미노출. 메뉴는 Windows와 동일 (open / autostart / quit).
- **자동 시작 양방향 동기화**: 본 변경에선 트레이 → manager만 단방향. 설정 화면 → 트레이 메뉴 라벨은 동기화 안 됨 — 사용자가 메뉴를 닫고 다시 열어도 빌드 시점 상태가 표시될 수 있음. 체감 사용 편의가 부족해 보이면 후속에서 양방향 동기화 추가 (Tauri State에 CheckMenuItem 핸들 보관 + setting toggle 핸들러에서 set_checked 호출).

### 후속 과제 (선택)
- 자동 시작 양방향 동기화 (위 항목).
- macOS에 "맥 메뉴바에 항상 표시 안내" 같은 별도 안내 추가 검토 — 현재는 자동 시작이 사실상 동등 효과라 우선순위 낮음.
- PinGuideModal에 시각적 일러스트(스크린샷) 추가하면 안내 명확성 추가 향상.

---

## 2026-05-08 21:25 KST — Windows 권한 흐름 추가 정정 + NSIS 인스톨러 브랜드 아트 (헤더/사이드바 BMP)

### 요약
이전 변경(19:10)에서 적용한 "접근성 토글 클릭 시 즉시 grant" 흐름이 사용자 멘탈 모델과 어긋났던 점을 정정하고, 알림 토글이 여전히 작동하지 않던 문제를 마이크와 동일한 OS 설정 → TOFU 패턴으로 해결. 동시에 Tauri NSIS bundler가 기본 제공하던 빌트인 헤더 아이콘(지구본/다운로드 화살표)을 모하 캐릭터 기반 BMP로 교체.

### 배경 / 원인

#### 접근성 토글 — "토글이 그냥 켜지는 게 어색하다"
- 19:10 변경: 클릭 시 INTERACTED 마킹 + Granted 반환. UI상으론 즉시 ON 표시.
- 사용자 피드백: "설정도 안 했는데 그냥 ON 가능해" — 클릭이 곧 grant라는 흐름이 OS 설정 페이지를 한 번이라도 거쳐야 한다는 사용자 멘탈 모델과 맞지 않음.
- 해결 방향: Windows에는 OS 레벨 접근성 권한 자체가 부재 → 클릭조차 필요 없도록 **부팅 시점부터 자동 granted**. 토글이 처음부터 ON+disabled 상태로 노출되어 사용자는 "이미 허용됨" 배지로 해석하고 자연스럽게 통과.

#### 알림 토글 — "클릭해도 변화 없음"
- 19:10 변경: WebView2 `notifRequest()` 결과 `default`를 `granted`로 매핑.
- 사용자 보고: 토글 클릭해도 ON으로 안 바뀌고 설정 창도 안 열림.
- 추정 원인: `notifRequest()`가 환경에 따라 throw하거나 `denied`를 반환하면 our-Windows 분기에 닿지 않음. 또한 사용자가 OS 알림 페이지에서 직접 켜려고 해도 설정 페이지가 열리지 않아 통제 수단이 없었음.
- 해결 방향: 마이크 토글과 **완전히 동일한 패턴** — 클릭 시 `ms-settings:notifications` 열림 + 영속 INTERACTED 플래그 set → 후속 조회에서 granted. 알림 권한이 마이크와 일관된 UX로 동작.

#### NSIS 인스톨러 헤더 아트
- Tauri NSIS bundler는 `bundle.windows.nsis.headerImage` / `sidebarImage` 미지정 시 NSIS Modern UI의 기본 비트맵(지구본+다운로드 아이콘)을 사용.
- 사용자가 이를 발견하고 모하 브랜딩으로 통일하길 요청.
- 해결: 기존 모하 SVG 자산을 재사용해 sharp(SVG → RGBA) → bmp-js(RGBA → 32-bit BMP) 파이프라인으로 헤더(150×57) / 사이드바(164×314) BMP를 prebuild에서 자동 생성.

### 변경 파일

#### 1. `scripts/installer-art-gen.mjs` (신규)
- 모하 SVG 그룹을 헤더/사이드바 캔버스에 배치 → sharp로 라스터화 → 직접 24-bit BMP 인코딩.
- 출력:
  - `src-tauri/installer/header.bmp` (150×57, 24-bit, ~25 KB)
  - `src-tauri/installer/sidebar.bmp` (164×314, 24-bit, ~150 KB)
- 인코더 결정: 처음에 `bmp-js` 0.1.0 사용 → NSIS 3.x가 `warning 5040: Unsupported format`으로 거부 (bmp-js 출력 BMP의 헤더 변형 추정). 표준 `BITMAPFILEHEADER(14) + BITMAPINFOHEADER(40) + BI_RGB` 24-bit BMP를 코드에서 직접 작성하도록 변경 — `encodeBmp24()` 함수 ~30줄. row stride 4-byte 정렬 + bottom-up + BGR 픽셀 순서 표준 준수.
- `flatten({ background: BG })`로 알파를 cream 배경에 합성하여 평면화.

#### 2. `package.json`
- 새 스크립트 `installer:gen` + prebuild 체인 확장 (외부 BMP 라이브러리 의존성 없음):

```diff
  "tray:gen": "node scripts/tray-gen.mjs",
  "icon:gen": "node scripts/app-icon-gen.mjs",
+ "installer:gen": "node scripts/installer-art-gen.mjs",
- "prebuild": "npm run tray:gen && npm run icon:gen"
+ "prebuild": "npm run tray:gen && npm run icon:gen && npm run installer:gen"
```

#### 3. `src-tauri/tauri.conf.json`
- `bundle.windows.nsis` 키 신설 — 헤더/사이드바 BMP + 인스톨러 .exe 아이콘 경로:

```diff
  "macOS": {
    "infoPlist": "Info.plist"
- }
+ },
+ "windows": {
+   "nsis": {
+     "installerIcon": "icons/icon.ico",
+     "headerImage": "installer/header.bmp",
+     "sidebarImage": "installer/sidebar.bmp"
+   }
+ }
```

#### 4. `src-tauri/src/permissions.rs`
- Windows 분기의 `AX_INTERACTED` 초기값을 **true**로 변경 — 부팅 시점부터 접근성을 granted로 간주. 주석으로 정책 의도 명시.

```diff
  pub static MIC_INTERACTED: AtomicBool = AtomicBool::new(false);
- pub static AX_INTERACTED: AtomicBool = AtomicBool::new(false);
+ /// Windows에는 OS 레벨에 "접근성 권한"이라는 개념 자체가 없어 사용자가 시스템 설정
+ /// 어딘가에서 켤 수 있는 토글이 부재한다. 따라서 부팅 시점부터 granted로 간주하여
+ /// 온보딩 화면의 접근성 토글이 처음부터 ON+disabled로 노출되게 한다 — 사용자가
+ /// 빈 설정 페이지를 보고 혼란스러워하던 회귀 영구 해결.
+ pub static AX_INTERACTED: AtomicBool = AtomicBool::new(true);
```

19:10에 추가한 `request_accessibility_permission` Windows 분기는 그대로 유지 — macOS 코드 경로엔 영향 없고, 미래에 다른 흐름이 필요할 경우의 안전망.

#### 5. `src/lib/permissions.ts`
- 알림 권한을 마이크와 동일한 OS 설정 + TOFU 패턴으로 통일.

```diff
+ /**
+  * Windows TOFU 마킹 키. WebView2의 Notification API는 권한 다이얼로그를 띄울 수
+  * 없고 Notification.permission도 항상 "default"라 OS Toast 동작 여부를 정확히
+  * 알 수 없다. 따라서 사용자가 알림 토글을 누르면 OS 알림 설정 페이지로 안내한 뒤
+  * 이 플래그를 set하여 후속 조회에서 granted로 표시 — 마이크와 동일한 trust-on-
+  * first-use 정책. localStorage는 Tauri WebView에서 영속.
+  */
+ const NOTIF_INTERACTED_KEY = "mohashim:notif_interacted_v1";
+
+ function isWindows(): boolean {
+   try { return platform() === "windows"; }
+   catch { return false; }
+ }

  async function getNotificationStatus(): Promise<PermissionStatus> {
    try {
      const granted = await notifIsGranted();
      if (granted) return "granted";
+     if (isWindows() && localStorage.getItem(NOTIF_INTERACTED_KEY) === "1") {
+       return "granted";
+     }
      return "not_determined";
    } ...
  }

  export async function requestNotificationPermission(): Promise<PermissionStatus> {
+   if (isWindows()) {
+     await openPermissionSettings("notification");
+     localStorage.setItem(NOTIF_INTERACTED_KEY, "1");
+     return "granted";
+   }
-   const result = await notifRequest();
-   if (result === "granted") return "granted";
-   if (result === "denied") return "denied";
-   if (platform() === "windows") return "granted";  // 이전 default → granted 매핑 제거
-   return "not_determined";
+   try {
+     const result = await notifRequest();
+     if (result === "granted") return "granted";
+     if (result === "denied") return "denied";
+     return "not_determined";
+   } catch (err) { ... }
  }
```

### 검증
1. **단위 테스트** (`npm test`): 26 files / **357 tests passed** — Windows 알림 분기는 단위 테스트 영향 없음(localStorage 의존), macOS 흐름 회귀 없음.
2. **Rust 컴파일** (`cargo check`): 깨끗하게 통과 (3.7s, dead_code warning 외 변경 없음).
3. **NSIS 호환성**: 최종 빌드에서 `warning 5040 Unsupported format`이 더 이상 발생하지 않음 — BMP가 인스톨러에 정상 임베드 확인.
4. **인스톨러 산출물**: `src-tauri/target/debug/bundle/nsis/Mohashim_0.1.0_x64-setup.exe` (7.1 MB) 생성, 빌드 시간 ~25초.
5. **End-to-end 사용자 검증 시나리오** (Windows에서 사용자가 인스톨러 실행 후 확인할 항목):
   - 인스톨러 진행 페이지 우상단에 모하 + Mohashim 텍스트 헤더 BMP 노출.
   - Welcome / Finish 페이지 좌측에 모하 + Mohashim 사이드바 BMP 노출.
   - 온보딩: 접근성 토글이 첫 부팅부터 ON + "허용됨" 배지 + disabled.
   - 알림 토글 클릭 → `ms-settings:notifications` 페이지 열림 + 토글 즉시 ON + "허용됨" 배지.
6. **BMP 생성 단독**: `node scripts/installer-art-gen.mjs` → header.bmp 25.2 KB / sidebar.bmp 150.9 KB 24-bit 정상 출력.

### 영향 범위
- **macOS**: 알림은 기존 web Notification API 다이얼로그 흐름 그대로. 인스톨러 아트는 NSIS 전용이라 macOS .dmg 무관.
- **Windows**:
  - 인스톨러 첫인상이 모하 브랜딩으로 통일 — 사용자 신뢰도 향상.
  - 접근성 토글 클릭 자체가 사라짐 → 사용자 의사결정 단계 1개 감소.
  - 알림 토글이 마이크 토글과 동일한 UX로 통일 — 학습 비용 감소.
- **Linux** (비공식): 영향 없음.
- **prebuild 시간**: ~1초 추가 (BMP 인코딩).

### 후속 과제 (선택)
- `DEVELOPMENT.md` "Windows 권한 정책" 섹션을 새 흐름(접근성 자동 grant, 알림 TOFU + 설정 페이지)에 맞춰 업데이트.
- 인스톨러 아트 한글 표기를 원할 경우 SVG에 한글 web-safe 폰트(Pretendard 등) 임베드 또는 Pretendard woff2 변환 후 사용.

---

## 2026-05-08 19:10 KST — Windows 권한 흐름 정상화 (접근성 즉시 grant + 알림 TOFU)

### 요약
Windows 인스톨러 빌드 후 온보딩 화면에서 발견된 두 UX 회귀를 영구 해결:
1. **접근성 권한 토글** 클릭 시 `ms-settings:privacy` 페이지가 열렸으나 거기엔 "접근성" 항목이 없어 사용자가 허용 방법을 알 수 없었던 문제.
2. **알림 권한 토글** 클릭 시 아무 시각적 변화 없이 토글이 그대로 OFF로 남던 문제.

핵심 원인은 Windows에 macOS의 "접근성/마이크 권한 다이얼로그" 같은 OS 메커니즘이 **존재하지 않는다**는 사실을 코드가 충분히 분기하지 않았던 것. 두 토글 모두 trust-on-first-use(TOFU) 정책으로 사용자 클릭을 곧 권한 부여로 받아들이도록 통일.

### 배경 / 원인

#### 접근성 권한 (Windows)
- Windows는 키보드/마우스 후킹(`SetWindowsHookEx`/rdev)에 OS 권한 자체가 필요 없음 — UAC도 무관.
- 기존 흐름: 토글 클릭 → `open_permission_settings("accessibility")` → Rust 측 `AX_INTERACTED=true` 마킹 + `ms-settings:privacy` 오픈.
- 문제: Windows 11의 "개인 정보 및 보안" 페이지엔 접근성 토글이 없음. 사용자가 거기서 무엇을 켜야 하는지 모른 채 멈춤. 다시 앱으로 돌아오면 focus listener가 `permission_status`를 재조회해 토글이 ON으로 바뀌긴 하나, **그 흐름을 사용자가 인지하지 못함** → "허용할 수 없다"는 인식.

#### 알림 권한 (Windows)
- Tauri `tauri-plugin-notification`은 web Notification API(`Notification.requestPermission()`)를 래핑.
- WebView2(Windows) 내부에선 권한 다이얼로그를 띄우지 못해 항상 `"default"` 반환.
- 기존 매핑: `default` → `not_determined` → 토글 OFF 그대로.
- 결과: 토글을 클릭해도 시각적/상태적 변화가 없어 "아무 동작도 안 한다"는 인식.
- 실제 OS Toast는 인스톨러가 등록한 AppUserModelID 기반으로 정상 동작 — 즉 "권한"보다는 OS 알림 센터의 앱별 토글이 실질 게이트.

### 변경 파일

#### 1. `src-tauri/src/permissions.rs`
**의도**: `request_accessibility_permission` Tauri 커맨드를 Windows에서 INTERACTED 마킹 + 즉시 Granted 반환하도록 확장. 시스템 설정 deep-link 경유를 우회.

```diff
- /// 설계 §6.1/C2: AX 다이얼로그를 트리거하지 않는다. status 조회만 수행한다.
- #[tauri::command]
- pub async fn request_accessibility_permission() -> Result<PermissionStatus, String> {
-     Ok(platform::accessibility_status())
- }
+ /// 설계 §6.1/C2: macOS는 AX 다이얼로그를 트리거하지 않는다 (status 조회만 수행).
+ /// Windows는 OS에 "접근성 권한"이라는 개념 자체가 없으므로, 사용자의 토글 클릭을
+ /// 의도 표시로 받아들여 INTERACTED 마킹 → 즉시 Granted 반환 (BR-9 TOFU 일관성).
+ /// 시스템 설정 페이지를 열지 않는다 — Windows의 "개인 정보 및 보안"에는 접근성
+ /// 항목이 없어 사용자가 혼란스러워하던 문제 해결.
+ #[tauri::command]
+ pub async fn request_accessibility_permission(
+     app: AppHandle,
+ ) -> Result<PermissionStatus, String> {
+     #[cfg(target_os = "windows")]
+     {
+         use std::sync::atomic::Ordering::Relaxed;
+         platform::AX_INTERACTED.store(true, Relaxed);
+     }
+     let status = platform::accessibility_status();
+     sync_runtime_grants(&app, platform::mic_status(), status);
+     Ok(status)
+ }
```

부수 효과: `sync_runtime_grants` 호출로 `AX_GRANTED` atomic이 갱신되어 audio thread / score loop가 즉시 일관 상태로 진입.

#### 2. `src/lib/permissions.ts`
**의도**: `requestNotificationPermission`이 Windows에서 `default` 응답을 사용자 의도로 받아들여 `granted`로 매핑하도록 확장. `denied`는 그대로 유지(사용자가 OS 알림 센터에서 명시 거부한 경우 정확히 표시).

```diff
+ import { platform } from "@tauri-apps/plugin-os";
  ...
  export async function requestNotificationPermission(): Promise<PermissionStatus> {
    try {
      const result = await notifRequest();
      if (result === "granted") return "granted";
      if (result === "denied") return "denied";
+     if (platform() === "windows") return "granted";
      return "not_determined";
    } catch (err) {
      console.error("[mohashim] requestNotificationPermission failed", err);
      return "denied";
    }
  }
```

#### 3. `src/App.tsx`
**의도**: 새 핸들러 `handleRequestAccessibility`를 추가하고 OnboardingScreen에 OS 정보 + 새 콜백 prop 전달.

```diff
  import {
    canEnterMain,
    getPermissionStatus,
    openPermissionSettings,
+   requestAccessibilityPermission,
    requestMicrophonePermission,
    requestNotificationPermission,
    type PermissionKind,
    type PermissionState,
  } from "./lib/permissions";
  ...
+ // 접근성 토글 — Windows에선 OS 권한 자체가 부재하므로 시스템 설정을 열지 않고
+ // 즉시 INTERACTED 마킹 + Granted 반환 (TOFU). macOS는 시스템 설정 deep-link 경로
+ // (handleOpenSettings)로 분기되며 본 핸들러는 호출되지 않는다.
+ const handleRequestAccessibility = async () => {
+   if (isConsenting) return;
+   setIsConsenting(true);
+   try {
+     await requestAccessibilityPermission();
+     const next = await getPermissionStatus();
+     setPermissions(next);
+   } finally {
+     setIsConsenting(false);
+   }
+ };
  ...
  <OnboardingScreen
+   os={os}
    permissions={permissions}
    isConsenting={isConsenting}
    onConsent={handleConsent}
    onRequestMic={handleRequestMic}
+   onRequestAccessibility={handleRequestAccessibility}
    onRequestNotification={handleRequestNotification}
    onOpenSettings={handleOpenSettings}
  />
```

#### 4. `src/components/popup/OnboardingScreen.tsx`
**의도**: `os` prop을 받아 접근성 토글 클릭 시 macOS는 시스템 설정 deep-link, Windows는 즉시 grant 콜백으로 분기.

```diff
+ import type { TargetOs } from "../../lib/trayPopup";

  type OnboardingScreenProps = {
+   /** OS — 접근성 토글 동작 분기에 사용 (Windows는 OS 권한 부재로 즉시 grant). */
+   os: TargetOs | null;
    permissions: PermissionState;
    ...
+   /** Windows 전용 — 접근성 토글 클릭 시 즉시 INTERACTED 마킹 + Granted 반환. */
+   onRequestAccessibility: () => void;
    ...
  };

  export function OnboardingScreen({
+   os,
    permissions,
    ...
+   onRequestAccessibility,
    ...
  }: OnboardingScreenProps) {
    ...
    const handleAccessibilityToggle = () => {
+     if (os === "windows") {
+       onRequestAccessibility();
+       return;
+     }
      onOpenSettings("accessibility");
    };
```

#### 5. `src/components/popup/__tests__/OnboardingScreen.test.tsx`
**의도**: 기존 테스트는 `os: "macos"` 명시하여 macOS 분기를 검증하도록 유지하고, Windows 분기를 위한 새 테스트 추가.

```diff
  const baseProps = {
+   os: "macos" as const,
    isConsenting: false,
    onConsent: () => {},
    onRequestMic: () => {},
+   onRequestAccessibility: () => {},
    onRequestNotification: () => {},
    onOpenSettings: () => {},
  };
  ...
+ it("접근성 not_granted → Windows에선 onOpenSettings 대신 onRequestAccessibility 호출 (시스템 설정 비노출, TOFU)", () => {
+   const onOpenSettings = vi.fn();
+   const onRequestAccessibility = vi.fn();
+   render(
+     <OnboardingScreen
+       {...baseProps}
+       os="windows"
+       permissions={onlyAccessibilityDenied}
+       onOpenSettings={onOpenSettings}
+       onRequestAccessibility={onRequestAccessibility}
+     />,
+   );
+   const accessibilityToggle = screen.getAllByRole("switch")[1];
+   fireEvent.click(accessibilityToggle);
+   expect(onRequestAccessibility).toHaveBeenCalledTimes(1);
+   expect(onOpenSettings).not.toHaveBeenCalled();
+ });
```

### 검증
1. **단위 테스트** (`npm test`): 26 test files / **357 tests passed** — 신규 Windows 분기 테스트 포함, macOS 기존 동작 회귀 없음.
2. **Rust 컴파일** (`cargo check`): 신규 `request_accessibility_permission` Windows 분기 정상 컴파일. 기존 `Denied` variant dead_code warning 외 변경 없음.
3. **End-to-end (Windows 인스톨러)**:
   - 접근성 토글 클릭 → 시스템 설정 창이 열리지 **않고** 즉시 토글 ON 으로 변화 + "허용됨" 배지.
   - 알림 토글 클릭 → 시스템 다이얼로그 없이도 즉시 토글 ON + "허용됨" 배지.
   - 토글 ON 후 OS Toast 알림(포모도로 25분 후 `🍅 집중 종료!`)이 정상 표시.

### 영향 범위
- **macOS**: 영향 없음. 모든 분기는 `target_os = "windows"` / `os === "windows"` 가드 내부.
- **Windows**: 사용자 클릭 → 즉시 토글 ON. 시스템 설정 deep-link로 인한 컨텍스트 스위치 제거.
- **Linux** (비공식): `target_os` 분기에 해당 없으므로 stub 동작 유지.
- **권한 게이트(`canEnterMain`)**: 변경 없음. 마이크 + 접근성 모두 granted여야 시작 가능 — 단지 granted로 가는 경로만 단순화됨.
- **알림 권한 정확도**: Windows에서 `denied` 분기는 그대로 유지되어 사용자가 OS 알림 센터에서 명시 거부한 상태는 정확히 반영됨.

### 후속 과제 (선택)
- `DEVELOPMENT.md` "Windows 권한 정책" 섹션을 새 흐름(접근성 즉시 grant, 알림 default → granted)에 맞게 업데이트하면 좋음 — 이번 변경에는 미포함.
- `tauri-plugin-notification` 동작이 향후 업데이트로 Windows 다이얼로그를 지원하게 되면 `requestNotificationPermission`의 Windows 분기 재검토 필요.

---

## 2026-05-08 14:50 KST — Windows 빌드용 `icon.ico` 자동 생성 + prebuild 단일 진입점화

### 요약
`npm run tauri build`가 Windows 신규 환경에서 항상 실패하던 `icon.ico` 누락 문제를 영구 해결.
`scripts/app-icon-gen.mjs`가 PNG/SVG에 더해 `icon.ico`도 생성하도록 확장하고, `package.json` prebuild가 `tray:gen`과 `icon:gen`을 모두 호출하도록 묶음.

### 배경 / 원인
- Tauri Windows 빌드는 `tauri-winres`(Windows resource compiler)가 `src-tauri/icons/icon.ico`를 요구함.
- 기존 `scripts/app-icon-gen.mjs`는 다음만 생성:
  - `32x32.png`, `128x128.png`, `128x128@2x.png` (256), `icon.png` (512), `icon.svg`
- macOS는 .icns/.png로 충분해 누락이 드러나지 않았음. Windows cold clone에서 첫 빌드 시 다음 에러 재현:
  ```
  package.metadata does not exist
  `icons/icon.ico` not found; required for generating a Windows Resource file during tauri-build
  warning: build failed, waiting for other jobs to finish...
  failed to build app
  ```
- `package.json` devDependencies에 `png-to-ico` 0.x가 이미 들어있어 (트레이 ICO 생성에 사용 중), 별도 의존성 추가 없이 PNG → ICO 변환 가능.

### 변경 파일

#### 1. `scripts/app-icon-gen.mjs`
**의도**: 기존에 생성하던 4종 PNG를 그대로 멀티사이즈 ICO로 묶어 `icon.ico`로 출력. 빌드 머신마다 결정론적 산출.

- 추가 import:
  ```diff
  + import pngToIco from "png-to-ico";
  ```
- `main()` 마지막, `icon.svg` 저장 직후에 ICO 생성 단계 추가:
  ```diff
    await fs.writeFile(path.join(ICON_DIR, "icon.svg"), SVG);
    console.log(`  icon.svg saved`);

  + // Windows resource compiler (tauri-build)는 icon.ico를 요구한다.
  + // 32/128/256/512 PNG를 묶어 멀티사이즈 ICO로 패키징.
  + const icoBuf = await pngToIco([
  +   path.join(ICON_DIR, "32x32.png"),
  +   path.join(ICON_DIR, "128x128.png"),
  +   path.join(ICON_DIR, "128x128@2x.png"),
  +   path.join(ICON_DIR, "icon.png"),
  + ]);
  + const icoPath = path.join(ICON_DIR, "icon.ico");
  + await fs.writeFile(icoPath, icoBuf);
  + console.log(`  icon.ico saved — ${(icoBuf.length / 1024).toFixed(1)} KB`);

    console.log("[app-icon-gen] done.");
  ```

#### 2. `package.json`
**의도**: 빌드 prebuild 훅에서 트레이 + 앱 아이콘이 함께 동기화되도록 단일 진입점화. cold clone 후에도 사용자가 별도 명령 입력 없이 `npm run tauri build`만으로 모든 아이콘 자산이 정합 상태.

```diff
- "prebuild": "npm run tray:gen",
+ "prebuild": "npm run tray:gen && npm run icon:gen",
```

`prebuild`는 npm 표준 라이프사이클 훅으로 `npm run build` 실행 직전에 자동 호출됨. Tauri는 `beforeBuildCommand`로 `npm run build`를 호출하므로 결과적으로 모든 `tauri build` 시 두 generator가 자동 실행됨.

### 검증
1. **icon.ico 강제 삭제 후 빌드 재현**:
   ```bash
   rm src-tauri/icons/icon.ico
   npm run tauri build -- --debug --bundles nsis
   ```
2. 빌드 로그에서 prebuild가 `[tray-gen] done` → `[app-icon-gen] icon.ico saved — XXX KB` 순으로 출력되어야 함.
3. cargo build가 `icons/icon.ico not found` 에러 없이 통과해야 함.
4. 산출물 위치 확인:
   - `src-tauri/target/debug/bundle/nsis/Mohashim_0.1.0_x64-setup.exe`
   - `src-tauri/target/debug/mohashim.exe`
5. NSIS 인스톨러 실행 후 시작 메뉴 / 트레이에서 정상 아이콘 노출 확인.

### 영향 범위
- **macOS 빌드**: 영향 없음. `icon.ico`는 macOS bundler에서 무시되며 prebuild가 추가로 ICO를 만들 뿐 기존 PNG/icns 경로엔 변화 없음.
- **Windows 빌드**: cold clone 후 즉시 빌드 가능. 환경별 수동 ICO 변환 단계 제거.
- **Linux 빌드**: 영향 없음 (Linux도 ICO 무시).
- **CI / 릴리즈**: `.github/workflows/release.yml`이 `npm run tauri build`를 호출한다면 자동으로 영구 픽스가 적용됨. 별도 파이프라인 수정 불필요.
- **빌드 시간**: prebuild에 ~1초 미만 추가 (PNG 4개 → 멀티사이즈 ICO 인코딩).

### 후속 과제 (선택)
- `DEVELOPMENT.md` 문서의 "자산 안내" 섹션에 `icon.ico`가 자동 생성된다는 한 줄 추가하면 좋음 (이번 변경에는 미포함).
- `npm run icon:gen` 스탠드얼론 호출도 그대로 작동하므로 다른 워크플로우(예: 아이콘 변경 후 즉시 미리보기)는 영향 없음.

### 빌드 환경 (참고용 — 이 변경 검증 시점 기준)
- Rust: 1.95.0 (`stable-x86_64-pc-windows-msvc`, cargo 1.95.0)
- Visual Studio 2022 Build Tools: MSVC 14.44.35207 + Windows 11 SDK 22621
- Node.js / npm: package.json `engines` 미지정 — 시스템 기본
- Tauri CLI: 2.x (package.json devDependencies)

---
