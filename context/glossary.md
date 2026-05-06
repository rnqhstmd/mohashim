# 공통 용어 사전

> 도메인 가리지 않고 쓰이는 용어. 도메인별 용어는 `{도메인}/glossary.md`.

| 용어 | 설명 |
|------|------|
| 모하심 | 제품명. 감자 캐릭터 '모하'의 츤데레 멘트 "아 모하심~~" 에서 유래 |
| 모하 (Moha) | 본 앱의 감자 캐릭터. 5단계 표정으로 점수 표현 |
| Tauri v2 | Rust 백엔드 + 웹뷰 프론트엔드 데스크탑 앱 프레임워크 |
| Pretendard | 한글/영문 UI 기본 폰트. 앱 번들에 woff2 동봉, CDN 미사용 |
| 5단계 캐릭터 상태 | focused(81~100) / calm(61~80) / distracted(41~60) / covering(21~40) / stressed(0~20) |
| 세션 (Session) | 집중 시간 + 휴식 시간을 모두 마쳐야 1세션. 도중 취소 시 미기록 (discarded) |
| 모드 | Idle(평상시) / Focus(집중) / Break(휴식) / Discarded / Complete |
| Score Engine | Rust 백그라운드에서 1Hz로 점수를 산출하는 모듈. 트레이 갱신과 score-tick 이벤트 emit을 담당 |
| score-tick 이벤트 | Rust → WebView로 emit되는 1Hz 페이로드 `{ total, work, noise, state, db, secondsIdle, grace, phase, timeLeft }` |
| 디자인 팔레트 | Sky `#7aa3e6` · Mist `#d8e4f7` · Deep `#445478` · Sun `#f4d160` · Peach `#e89a82` · Ink `#2b2520` |
| 라이트 모드 only (MVP) | v0.1은 라이트 모드만. 다크 모드는 추후 |
| 모노레포 | 프론트엔드(React/TS)와 백엔드(Rust)를 단일 git 레포에서 함께 관리 |
| 트레이 정체성 | `visible:false` + `LSUIElement` + `prevent_close` 세 변경의 결합 효과로 메뉴바/시스템 트레이 전용 앱처럼 동작하는 상태 (PR #9) |
| LaunchAgent | macOS 자동 실행 등록 방식. 사용자 단위 `~/Library/LaunchAgents/` plist. tauri-plugin-autostart 채택 (PR #9) |
| LSUIElement | macOS Info.plist 키. true이면 Dock 아이콘 + Cmd+Tab 목록에서 앱 제외. 메뉴바 전용 앱 동작 (PR #9) |
| prevent_close | Tauri `WindowEvent::CloseRequested` 핸들러에서 `api.prevent_close()` 호출하여 종료 차단. 모하심은 X 클릭 시 hide로 유도 (PR #9) |
