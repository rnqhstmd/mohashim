# tray 용어 사전

| 용어 | 설명 |
|------|------|
| 트레이/메뉴바 아이콘 | macOS 메뉴바(28px) / Windows 시스템 트레이(48px). 항상 표시, 클릭으로 팝업 토글 |
| Template 이미지 (macOS) | 단색 + alpha PNG. `icon_as_template(true)` 등록 시 시스템이 라이트/다크 모드에 맞춰 자동 반전 |
| ICO 멀티 해상도 (Windows) | 16/22/32/48 픽셀을 한 ICO 파일에 묶음. 시스템이 상황에 맞는 해상도 자동 선택 |
| 마스터 SVG | OS와 무관한 단일 진실 자산. `src/assets/tray-master/potato-{state}.svg` (5장) |
| 빌드 변환 | 마스터 SVG → 빌드 시점에 macOS PNG@1x/2x/3x + Windows ICO 자동 생성 |
| Idle 트레이 규칙 (DEC-6) | Idle 동안 키/마우스 추적 OFF. 트레이 표정은 `calm` 고정, 단 dB EMA가 80 초과 시에만 `stressed`로 전환 |
| 진행 시간 동봉 | 뽀모도로 진행 중에만 아이콘 옆에 "18:22" 형태 텍스트 동봉. 평소엔 아이콘만 |
| set_icon_as_template | Tauri tray API의 macOS 전용 플래그. 자동 색 반전 활성화 |
| PopupTail | 팝업이 메뉴바/트레이에서 매달려 보이게 하는 작은 화살표 SVG (20×10). macOS=상단 ↑, Windows=하단 ↓. 시안 색 `#fdf8e8` |
| 메뉴바 매달림 (macOS) | 팝업이 메뉴바 아이콘 아래 매달리는 형태. 트레이 아이콘 중심에서 ~50px 좌측에 PopupTail 정렬 |
| 트레이 떠오름 (Windows) | 팝업이 시스템 트레이 위에 떠오르는 형태. 동일 정렬 규칙 (반전) |
