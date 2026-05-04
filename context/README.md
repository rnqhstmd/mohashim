# mohashim 프로젝트 컨텍스트

키보드/마우스 + 마이크 dB 하이브리드 집중도 측정과 감자 캐릭터 '모하'로 동기부여하는 macOS/Windows 데스크탑 생산성 앱.

## 도메인 (기능 단위 7개)

| 도메인 | 설명 | 상세 |
|--------|------|------|
| score | Rust 백그라운드 점수 엔진 + 입력 후킹 + 마이크 dB + Privacy | [상세](score/README.md) |
| timer | 평상시·집중·휴식 모드 + 세션 라이프사이클 + 슬립 처리 | [상세](timer/README.md) |
| todo | 투두리스트 + 작업/위치 태그 + 자동 정렬 | [상세](todo/README.md) |
| grass | 28일 잔디 통계 + 정방형 공유 카드 (ShareCard) | [상세](grass/README.md) |
| character | 감자 캐릭터 '모하' 5단계 + 멘트 8버킷 | [상세](character/README.md) |
| tray | macOS 메뉴바 / Windows 시스템 트레이 + OS별 자산 워크플로 | [상세](tray/README.md) |
| lifecycle | 권한·초기화·Storage·폰트 번들·앱 재시작 | [상세](lifecycle/README.md) |

## 공통

- [공통 용어 사전](glossary.md)

## 핵심 결정 (전 도메인 공통)

- **Score Engine은 Rust 백그라운드** (트레이 갱신을 위해 상시 실행) → score
- **공유는 캡처 X, 전용 SVG 템플릿 합성** → grass
- **일시정지 미지원** — 짧은 자리비움=grace, 진짜 중단=취소 → timer
- **마이크·접근성 권한 모두 필수** — 거절 시 onboarding 복귀 → lifecycle
- **라이트 모드 only (MVP)** → 전체

## 기술 스택

- Tauri v2 + React 18 + TypeScript + Tailwind CSS
- Rust: rdev (글로벌 후킹), cpal (오디오)
- 플러그인: tauri-plugin-store, tauri-plugin-notification, tauri-plugin-clipboard-manager
- 폰트: Pretendard (앱 번들 동봉, CDN 미사용)
