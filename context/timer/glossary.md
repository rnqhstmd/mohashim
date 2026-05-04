# timer 용어 사전

| 용어 | 설명 |
|------|------|
| 평상시 모드 (Idle) | 투두 관리 + 소음 모니터링만. 키보드/마우스 추적 OFF. 80dB 초과 시 소음 경고 |
| 집중 모드 (Focus) | 사용자 설정 집중 시간 동안 하이브리드 점수 측정 ON |
| 휴식 모드 (Break) | 사용자 설정 휴식 시간. 시간만 카운트, 점수 측정은 동결 |
| 완료 (Complete) | 집중+휴식 모두 종료된 시점. 평균 점수가 잔디에 적재됨 |
| 폐기 (Discarded) | 도중 취소·슬립 grace 초과·재시작으로 미완료 처리. 잔디 미기록 |
| 일시정지 (미지원) | MVP에서 제거. 짧은 자리비움=grace, 진짜 중단=취소(discard) |
| 우상단 상태 chip | 팝업 내부 우상단 위치 (트레이 옆 X). Idle=7개 라벨 8초 회전 / Focus="집중 중" 고정 / Break="휴식 중" 고정 |
| Idle 라벨 7종 | 음료 홀짝이는 중 / 웹 서핑 중 / 멍때리는 중 / 애인 생각 중 / 딴 생각 중 / 상상 중 / 명상 중 |
| 자동 discard (슬립) | 시스템 슬립 후 깨어남 시 wall-clock 차이가 grace(180초) 초과면 자동 discard |
| 자동 discard (재시작) | 앱 종료 후 재시작 시 진행 중이던 세션 무조건 discard |
| 진행 중 알림 미발송 | 뽀모도로 진행 중 OS 알림 차단. 휴식 시작/완료 시점에만 발송 |
| BottomTabBar | 팝업 하단 3개 탭 (오늘 할 일 / 잔디 / 설정). pill 스타일 active 표시 |
| Mode chip pulse | 우상단 chip 좌측 6px 닷이 mhpulse 키프레임으로 1.2s 깜빡임. Focus·Break 시 활성, paused 미사용(DEC-2) |
| 모드 chip 색 | Idle = 회색, Focus = `#dc4646` 빨강, Break = `#d68a6a` 코랄 |
| Discard 확인 모달 | "이번 세션 기록 못 해요" + stressed 모하 + "계속할래 / 포기" 두 버튼. 포기 시에만 phase=Discarded |
