# grass 용어 사전

| 용어 | 설명 |
|------|------|
| 잔디 (Contribution Graph) | 28일(최근 4주) 일자별 세션 기록을 GitHub 스타일 격자로 표시 |
| 잔디 레벨 | Lv0(빈) / Lv1(1~2 세션) / Lv2(3+세션 평균<60) / Lv3(3~5세션 평균≥60) / Lv4(6+세션 평균≥70) |
| 28일 윈도우 | 오늘부터 거슬러 28일 (4주). MVP 표시 범위 |
| 평균 집중 점수 | 한 세션 동안의 점수 평균. 세션 종료 시 1건 적재 |
| 잔디 자랑하기 (공유 카드) | 화면 캡처 X. 전용 `<ShareCard>` SVG → Canvas → PNG → clipboard |
| ShareCard | 공유 전용 SVG 컴포넌트. 화면에 렌더되지 않고 메모리 합성용 |
| 1080×1080 | ShareCard 출력 크기. SNS 호환 정방형 |
| 합성 파이프라인 | XMLSerializer → data:image/svg+xml → `<img>` decode → Canvas drawImage → toBlob('image/png') → clipboard.writeImage |
| ContributionGraph | 잔디 그래프 컴포넌트. 7열(일~토) 그리드, 일자별 셀 hover 시 1.15× 확대 + 툴팁(날짜·세션·평균) |
| 월간 네비게이션 | ContributionGraph 헤더의 ← 이전 / → 다음 화살표. monthOffset 정수(0=현재월, -1=지난달). 다음 달은 disabled (미래 표시 안 함) |
| 최근 세션 리스트 | HistoryScreen 하단. 시간·길이·점수·환경(예: ☕ 58dB) 카드 형태. 점수에 따라 5단계 컬러 도트 |
| 통계 카드 | HistoryScreen 상단 2개 카드 — "이 달의 집중 시간"(BLUE_DEEP 배경) / "평균 점수"(ACCENT 배경) |
