# tray 아키텍처

## 자산 워크플로 (DEC-8)

### 마스터

```
src/assets/tray-master/
├─ potato-focused.svg
├─ potato-calm.svg
├─ potato-distracted.svg
├─ potato-covering.svg
└─ potato-stressed.svg
```

- `viewBox="0 0 22 22"` 라인 아트
- stroke만 검정(`#000`), 면색 비움 — template 변환 호환
- 시안의 `PotatoTrayIcon` 컴포넌트를 SVG 파일로 추출

### 빌드 산출물

```
src-tauri/icons/tray/
├─ mac/
│   ├─ potato-focused@1x.png    (22×22, 단색 + alpha)
│   ├─ potato-focused@2x.png    (44×44)
│   ├─ potato-focused@3x.png    (66×66)
│   └─ … (× 5 states)
└─ win/
    ├─ potato-focused.ico       (16/22/32/48 멀티)
    └─ … (× 5 states)
```

### 변환 파이프라인 (build.rs 또는 npm 스크립트)

- **채택**: npm + sharp + png-to-ico (Phase 7). `scripts/tray-gen.mjs`에서 `prebuild` 훅으로 자동 실행. 산출물은 `.gitignore`로 추적 제외.
- **macOS template**: SVG → 컬러 PNG 렌더 → alpha 채널 추출 → 검정 RGB(R=G=B=0) + alpha 결합 → ICC 미포함 sRGB PNG. `withMetadata({ icc: undefined })`. 1x/2x/3x 3장.
  - 폴백 1: grayscale+alpha 2채널 PNG (`toColourspace("b-w")` + `joinChannel(alpha)`).
  - 폴백 2: `src/assets/tray-master-mono/`에 검정 단색 SVG 별도 작성.
- **Windows 컬러**: SVG → `POTATO_PALETTE.light` 풀컬러 PNG → png-to-ico로 16/22/32/48 멀티 해상도 ICO 합성.
- **`svgo` 사용 보류**: 본 Phase에서는 미사용. 사전 SVG 정규화는 후속 Could 항목.

## 런타임 갱신 (Phase 7 구현 반영)

`src-tauri/src/tray.rs`는 다음 3개 함수로 분리되어 있다:
- `apply_icon(app, state)` — `ICON_CACHE`에서 PNG/ICO를 가져와 `set_icon`. 디스크 I/O 없음.
- `apply_title(app, title)` — `set_title(Option<&str>)`.
- `apply_tooltip_label(app, state)` — 한국어 라벨(집중/평온/산만/가려짐/과부하).

`format_title(phase, time_left) -> Option<String>` helper가 `Focus|Break && time_left>0`일 때만 `mm:ss`(0-패딩)를 반환한다. 0초/그 외 phase는 `None`.

`score::tick_loop`가 `prev_tray_state: Option<LiveState>`와 `prev_title: Option<Option<String>>`를 분리 보유하여:
- tray_state 변경 시에만 `apply_icon` + `apply_tooltip_label` 호출 (BR-T7)
- format_title 결과 변경 시에만 `apply_title` 호출 (None→None 재호출 방지)

### Idle 규칙 (DEC-6) — `final_tray_state`

`src-tauri/src/score/phase.rs::final_tray_state(state, phase, db_ema) -> LiveState`:
- `Phase::Idle && db_ema <= 80.0` → `Calm`
- `Phase::Idle && db_ema > 80.0` → `Stressed`
- 그 외 phase → state 그대로 (Focus/Break는 override 안 함, BR-T2)

### 아이콘 캐시 (`ICON_CACHE`)

`static OnceLock<HashMap<LiveState, Image<'static>>>`. `init_tray` 시점에 5장을 1회 로드.

### Tauri `Image::from_path`는 단일 PNG bytes만 로드 — scale_factor 분기

macOS NSImage `@2x`/`@3x` 자동 인식이 보장되지 않으므로, `init_tray`에서 메인 webview의 `scale_factor()`를 보고 단일 PNG를 결정한다:
- `sf >= 3.0` → `@3x.png`
- `sf >= 2.0` → `@2x.png`
- 그 외 → `@1x.png`

멀티 모니터에서 화면 간 이동 시 해상도 동적 교체는 후속 Phase.

## Idle 트레이 규칙 (DEC-6)

| 상황 | 트레이 표정 | 비고 |
|------|------------|------|
| Idle (db ≤ 80) | `calm` 고정 | 평소 |
| Idle (db > 80) | `stressed` | 소음 경고와 동기 (character의 `noiseLoud`) |
| Focus / Break | Score Engine 5단계 자동 | tick 갱신 |

- Idle에서 키/마우스 후킹은 OFF (`score` 도메인 정책 — 권한 약속·배터리 보호)
- 80dB 임계는 EMA 필터된 값 기준 (순간 노이즈로 깜빡거리지 않게)

## 클릭 동작

- 클릭 → 팝업 윈도우 토글 (열려있으면 닫고, 닫혀있으면 열기)
- macOS: 메뉴바 아이콘 위치 기준 아래로 매달림 (tail 화살표)
- Windows: 시스템 트레이 아이콘 위치 기준 위로 떠오름 (tail 화살표)

### 좌클릭 + Up만 emit (Phase 7)

Tauri v2 `TrayIconEvent::Click`은 모든 버튼/Up·Down에서 발생할 수 있다. 좌클릭 1회당 토글이 두 번 실행되는 것을 방지하기 위해 다음 패턴으로 한정:

```rust
TrayIconEvent::Click {
    button: MouseButton::Left,
    button_state: MouseButtonState::Up,
    rect,
    ..
}
```

### `tray-click` 이벤트 페이로드 (Rust → React)

좌표 단위는 **물리 픽셀, 화면 좌상단 기준**으로 통일. Rust 측에서 `to_physical(scale_factor)`로 단일 변환 후 emit.

```typescript
interface TrayClickPayload {
  x: number;        // 클릭 지점 x (physical px)
  y: number;        // 클릭 지점 y (physical px)
  iconWidth: number;   // 트레이 아이콘 너비 (physical px)
  iconHeight: number;  // 트레이 아이콘 높이 (physical px)
}
```

### React 측 토글 wiring

`src/lib/trayPopup.ts::attachTrayClickListener(os)`:
- `isVisible() === true` → `hide()`
- `isVisible() === false` → `setPosition(new PhysicalPosition(x, y))` + `show()` + `setFocus()`

좌표 계산은 `computePopupPosition` 순수 함수가 담당. monitor.scaleFactor를 사용하여 popup logical(320×460)을 physical로 환산. clamp는 primary monitor + 표준 작업표시줄 위치만 가정 (그 외 비범위).

### drop-shadow wrapper

`src/App.tsx`의 root에 `filter: drop-shadow(0 4px 12px rgba(0,0,0,0.18))`를 적용하여 transparent 윈도우에서 본체와 PopupTail이 통합 그림자로 렌더된다.

## PopupTail 컴포넌트

```ts
<PopupTail position="top|bottom" x={tailX} color="#fdf8e8" />
```

- 20×10 SVG path `M0 10 L10 0 L20 10 Z` (삼각형)
- macOS = top (위로 향함, 팝업 상단에 부착)
- Windows = bottom (아래로 향함, scaleY(-1) 변환)
- 트레이 아이콘 중심에서 50px 좌측에 정렬 (popup width 320 기준 `tailX = 270`)
- 팝업 본체 색과 일치 (드롭 섀도우는 `filter: drop-shadow()` 로 본체+꼬리 통째 처리)
