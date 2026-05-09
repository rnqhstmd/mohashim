# lifecycle 용어 사전

| 용어 | 설명 |
|------|------|
| 권한 게이팅 | 마이크·접근성 권한 둘 다 받기 전엔 메인 팝업 진입 차단. OnboardingScreen 강제 노출 |
| OnboardingScreen | 첫 실행 + 권한 미허용 상태에서 표시. 권한 카드 2개 + 동의 버튼 |
| 양 권한 필수 정책 (DEC-9) | 마이크·접근성 둘 중 하나라도 거절되면 메인 진입 X. 부분 거절 동작 미지원 |
| 첫 실행 플래그 | store에 `onboarding_completed: bool`. true면 onboarding 건너뜀. 단 시스템 권한이 거절 상태면 플래그 무시하고 강제 노출 |
| OS 설정 deep link | macOS `x-apple.systempreferences:` URL / Windows 설정 URI. 사용자를 권한 화면으로 직접 안내 |
| 자동 discard (재시작) | 앱 종료 후 재시작 시 진행 중이던 세션 무조건 discard. phase/timeLeft 보존 X |
| 데이터 초기화 | store JSON 전체 삭제 → 메모리 리셋 → onboarding 리부팅 |
| 위험 영역 초기화 (DEC-12) | SettingsScreen 최하단 빨간 텍스트 버튼. 모달에서 "모하" 타이핑해야 활성화 (실수 방지 friction) |
| tauri-plugin-store | 오프라인 로컬 JSON 저장 플러그인. 본 앱의 모든 영속 데이터 |
| Pretendard 번들 (DEC-1) | woff2 폰트 파일을 `src/assets/fonts/`에 동봉. CDN 미사용 → 오프라인 보장 |
| 라이트 모드 only (DEC-13) | v0.1은 라이트 모드만. 다크 모드는 추후 |
| Privacy badge | OnboardingScreen 카드 하단 "🔒 모든 데이터는 내 컴퓨터에만" pill. BLUE_LIGHT 배경 + BLUE_DEEP 보더 |
| 권한 점수 분배 표시 | OnboardingScreen 권한 카드 우측 — 마이크 카드="20점" / 접근성 카드="80점" 초록 pill |
| monthly_check (Phase 26) | 부팅 setup의 spawn 안에서 yearly_cleanup 앞에 실행되는 월간 인사이트 분석 진입점. last_monthly_letter_year_month 기반 동월 멱등 + 다중 비활성 달 순회 |
| analyze_monthly_pattern | 순수 함수. session_logs(raw JSON)와 year_month("YYYY-MM")를 받아 5종 템플릿 중 하나로 분류한 MonthlyAnalysis 또는 None 반환. 0세션 → None, 1~9세션 → Encouragement, ≥10세션 → 시간대/dB 분기 |
| 5종 템플릿 우선순위 | ③NightOwl > ④NoiseChampion > ②Allrounder > ①Standard > ⑤Encouragement. PRD AC-7 충족을 위해 Allrounder가 Standard 앞에 배치됨 |
| last_monthly_letter_year_month | 월간 편지 발송 추적 키 ("YYYY-MM" 또는 null). insight 모듈만 write (단일 writer). reset_all에서 null로 초기화 (정책 예외) |
| ml-monthly-{YYYY-MM} | 월간 편지 ID 형식. 동월 중복 발송 방어용 (BR-2) |
| 3단 윈도우 활성화 (P-M11) | 알림 클릭 시 win.show() → win.unminimize() → win.set_focus() 순서로 호출. hide/minimize 상태에서도 가시화 보장. 각 단계 실패는 eprintln 후 다음 진행 |
| LAST_NOTIF_AT_MS swap | 알림 발화 시각을 atomic으로 기록. Focused 핸들러 진입 시 swap(0)으로 1회 사용 후 reset → 자체 호출 시 발생하는 추가 Focused 이벤트는 last==0이라 분기 미진입 (self-loop 자연 차단) |
| economy-updated | 새싹 잔액 변경 시 발화되는 Tauri 이벤트. timer/shop/economy 3개 발생원에서 store.save() 성공 직후 emit. UI는 onEconomyUpdated 헬퍼로 구독하여 즉시 갱신 |
| MainHeader (Phase 26) | 메인 화면 우상단 공통 헤더. ModeChip + 편지함(unread dot) + 톱니바퀴 가로 배치. 전체 탭 공통 노출. overlayScreen=null 상태에서만 렌더 |
| overlayScreen | MainScreen의 오버레이 라우팅 state. "mailbox" \| "settings" \| null. 오버레이 활성 시 BottomTabBar/MainHeader 숨김 + 풀스크린 진입. 좌상단 ← 버튼으로 메인 복귀 |
