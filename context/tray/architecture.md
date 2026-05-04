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

- **macOS template**: SVG → 검정 단색 + alpha PNG. 빌드 시 1x/2x/3x 3장
- **Windows 컬러**: SVG → `POTATO_PALETTE.light` 풀컬러로 채워서 PNG → ICO 멀티 해상도

## 런타임 갱신

```rust
// src-tauri/src/tray.rs
fn on_score_change(state: PotatoState, phase: Phase, time_left: Option<u64>) {
    let icon_path = icon_for(state);
    tray.set_icon(load_icon(icon_path))?;
    #[cfg(target_os = "macos")]
    tray.set_icon_as_template(true)?;
    
    // 뽀모도로 진행 중에만 시간 텍스트
    let title = match phase {
        Phase::Focus | Phase::Break => time_left.map(format_mmss),
        _ => None,
    };
    tray.set_title(title)?;
}
```

- Score Engine의 state 변경 이벤트에 hooked
- 빌드 시점 변환된 PNG/ICO 파일을 런타임에 단순 로드만 (런타임 SVG 파싱 X)

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

## PopupTail 컴포넌트

```ts
<PopupTail position="top|bottom" x={tailX} color="#fdf8e8" />
```

- 20×10 SVG path `M0 10 L10 0 L20 10 Z` (삼각형)
- macOS = top (위로 향함, 팝업 상단에 부착)
- Windows = bottom (아래로 향함, scaleY(-1) 변환)
- 트레이 아이콘 중심에서 50px 좌측에 정렬 (popup width 320 기준 `tailX = 270`)
- 팝업 본체 색과 일치 (드롭 섀도우는 `filter: drop-shadow()` 로 본체+꼬리 통째 처리)
