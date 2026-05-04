# character 용어 사전

| 용어 | 설명 |
|------|------|
| 모하 (Moha) | 감자 캐릭터. 둥글둥글한 호빵형 몸통 + 머리 위 새싹 + 5단계 표정 |
| 5단계 표정 | focused(81~100) / calm(61~80) / distracted(41~60) / covering(21~40) / stressed(0~20) |
| 새싹 (Sprout) | 머리 위 작은 잎. 점수 높을수록 파릇파릇, 낮을수록 시들시들 |
| 새싹 5단계 색 | sproutVivid(focused) → sproutFresh(calm) → sproutNeutral(distracted) → sproutDry(covering) → sproutWilt(stressed) |
| 멘트 버킷 (8종) | idle / focusHigh(80~100) / focusLow(40~79) / focusBroken(0~39) / break / sessionComplete / noiseLoud(80dB+ idle) / discarded(중도 취소) |
| pickPhrase | 버킷 내에서 seed 기반 무작위 선택. 같은 점수 구간 내 중복 회피 |
| 표정 표현 요소 | 눈(웃는/점/X형 등) · 볼(분홍 타원) · 입(반달/처짐/원형) · 땀방울(stressed 한정) · 눈물(covering 한정) |
| 트레이 모노 아이콘 | 22×22 라인 아트 버전. macOS template / Windows 컬러로 빌드 시 변환 |
| Idle 멘트 라벨 7종 | 음료 홀짝이는 중 / 웹 서핑 중 / 멍때리는 중 / 애인 생각 중 / 딴 생각 중 / 상상 중 / 명상 중 — `timer` 도메인의 우상단 chip에 회전 표시 |
| SpeechBubble | 모하 옆 말풍선 컴포넌트. 둥근 라운딩 + 1.5px ink 보더 + 2px offset shadow + 좌하단 꼬리(45° 회전 사각). Onboarding과 멘트 표시에 사용 |
| mh-bob 애니메이션 | 캐릭터 위아래 가벼운 떠오름 모션. 3.2s ease-in-out infinite, transform translateY(-3px) + 1° 회전 |
| mh-pulse 애니메이션 | 점수 변화·진행 중 표시기 깜빡임. 0.6s ease-in-out infinite, opacity 0.85↔1 |
| 새싹 5단계 SVG | focused=두 잎 위로 vivid / calm=한 잎 살짝 기울 fresh / distracted=처짐 neutral / covering=옆으로 늘어짐 dry / stressed=아래로 늘어짐 wilt |
| 표정 좌표 | viewBox 200×200 기준 — 눈은 cy=108~110 / 볼은 cy=120~124 / 입은 cy=121~126 |
