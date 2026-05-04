# score 용어 사전

| 용어 | 설명 |
|------|------|
| 하이브리드 집중도 | 작업 활동 점수(최대 80) + 소음 환경 점수(최대 20) = 0~100점 |
| 작업 활동 점수 | 글로벌 키보드/마우스 입력 발생 여부로 산출. 내용 비수집 |
| 3분 스마트 유예 (Grace Period) | 입력이 멈춰도 인강 시청/독서로 간주하여 3분간 80점 유지. 입력 발생 시 즉시 리셋 |
| 점수 감점 룰 | grace 초과 후 10초당 -5점. 입력 발생 시 즉시 80점 복구 |
| 소음 환경 점수 | EMA 필터링된 dB로 산출. 0~65dB=20, 66~80dB=19~1 비례, 80dB+=0 |
| EMA (Exponential Moving Average) | dB 측정값을 부드럽게 만드는 지수 이동 평균 필터. 순간 노이즈 흡수 |
| Grace State | active(active 입력 중) / looking(grace 끝, 두리번) / gone(자리 비움). 캐릭터 표정·문구 분기에 사용 |
| score-tick (이벤트) | Rust → WebView 1Hz emit. 페이로드 `{ total, work, noise, state, db, secondsIdle, grace, phase, timeLeft }` |
| 비수집 보장 (Privacy) | rdev 콜백에서 `event.event_type` 미매치, timestamp만 갱신. keycode·좌표 변수 미보관, IPC 페이로드에 키 필드 부재 |
| cpal | Rust 크로스 플랫폼 오디오 입출력 라이브러리. 마이크 dB 측정에 사용 |
| 라이트 모드 only (MVP) | v0.1은 라이트 모드만 |
| 환경 라벨 (envFromDb) | dB 값을 6단계 환경으로 매핑. ≤40=📚도서관 / ≤55=🏠집 / ≤65=☕조용한 카페 / ≤75=🗣시끄러운 카페 / ≤85=👥군중 소음 / >85=🚧굉음. 팝업 NoiseMeter 옆에 아이콘+라벨로 표시 |
| NoiseMeter | 팝업 안 가로 게이지. dB 30~100을 0~100% 폭으로 변환, 65dB 임계 틱 + 위험(>65) 시 빨간 색 |
| ScoreBreakdown | 호버 시 표시되는 작업80 / 소음20 분리 게이지. Focus 모드 hero 영역에서 토글 |
