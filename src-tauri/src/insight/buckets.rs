//! 월간 인사이트 버킷 분류 + 5종 템플릿 분기 (Phase 26 FR-1~13).
//!
//! 순수 함수 모듈 — store / AppHandle 무의존. analyze_monthly_pattern은 session_logs와
//! 대상 연월(YYYY-MM)을 받아 5종 템플릿 중 하나를 선택하거나 None(0세션) 반환.
//!
//! BR-4: avg_db=0 세션도 Quiet 구간(0~40)에 포함 — 예외 처리 없음.
//! BR-5: start_at 파싱 실패 세션은 분석에서 제외.
//! FR-9: 우선순위 ③NightOwl > ④NoiseChampion > ②Allrounder > ①Standard > ⑤Encouragement.
//! (Allrounder를 Standard 앞에 두어 4구간 균형형이 도달 가능 — AC-7.)

use chrono::DateTime;
use std::collections::HashMap;

/// 4구간 시간대(00~06/06~12/12~18/18~24).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimeRange {
    /// 새벽 00~06 (FR-5).
    Dawn = 0,
    /// 오전 06~12.
    Morning = 1,
    /// 오후 12~18.
    Afternoon = 2,
    /// 저녁 18~24.
    Evening = 3,
}

impl TimeRange {
    /// 표시명 (PRD §템플릿 정의).
    pub fn display_name(self) -> &'static str {
        match self {
            TimeRange::Dawn => "새벽",
            TimeRange::Morning => "오전",
            TimeRange::Afternoon => "오후",
            TimeRange::Evening => "저녁",
        }
    }

    /// 표시 범위 (예: "00~06").
    pub fn display_range(self) -> &'static str {
        match self {
            TimeRange::Dawn => "00~06",
            TimeRange::Morning => "06~12",
            TimeRange::Afternoon => "12~18",
            TimeRange::Evening => "18~24",
        }
    }
}

/// 4구간 dB(0~40/40~60/60~80/80+).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DbRange {
    /// 조용 0~40 (FR-6, BR-4).
    Quiet = 0,
    /// 보통 40~60.
    Normal = 1,
    /// 다소 시끄러움 60~80.
    SomewhatLoud = 2,
    /// 시끄러움 80+.
    Loud = 3,
}

impl DbRange {
    pub fn display_name(self) -> &'static str {
        match self {
            DbRange::Quiet => "조용",
            DbRange::Normal => "보통",
            DbRange::SomewhatLoud => "다소 시끄러움",
            DbRange::Loud => "시끄러움",
        }
    }
}

/// 4구간 통계 (count + 평균 score).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BucketStats {
    pub count: u32,
    pub avg_score: f64,
}

impl Default for BucketStats {
    fn default() -> Self {
        Self {
            count: 0,
            avg_score: 0.0,
        }
    }
}

/// 월간 통계 (4시간대 + 4dB 버킷 + 총합 + 태그/위치 매트릭스).
#[derive(Clone, Debug)]
pub struct MonthlyStats {
    pub total_sessions: u32,
    pub total_minutes: u32,
    pub avg_score: f64,
    pub time_buckets: [BucketStats; 4],
    pub db_buckets: [BucketStats; 4],
    /// Phase 27 FR-3 / BR-1: 해당 월 session_logs.earned_sprouts 합계.
    /// 5종 본문의 {총새싹} 변수에 사용.
    pub total_sprouts: u32,
    /// 태그 인사이트: 작업 태그 ID → BucketStats (해당 월 한정 집계).
    /// 부재 세션(work_tag_id=None)은 집계 제외 → 빈 HashMap이면 태그 행 생략.
    pub work_tag_stats: HashMap<String, BucketStats>,
    /// 태그 인사이트: 위치 태그 ID → BucketStats (해당 월 한정 집계).
    pub location_stats: HashMap<String, BucketStats>,
}

/// 5종 템플릿 ID (FR-9 우선순위 분기).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TemplateId {
    Standard,
    Allrounder,
    NightOwl,
    NoiseChampion,
    Encouragement,
}

/// 분석 결과: 선택된 템플릿 + 통계 + best 인덱스.
#[derive(Clone, Debug)]
pub struct MonthlyAnalysis {
    pub template: TemplateId,
    pub stats: MonthlyStats,
    /// 베스트 시간대 인덱스 (0~3). count=0이면 None.
    pub best_time_idx: Option<usize>,
    /// 베스트 dB 인덱스 (0~3). count=0이면 None.
    pub best_db_idx: Option<usize>,
}

/// 시간대 인덱스 매핑 (FR-5).
pub fn classify_hour(hour: u32) -> usize {
    match hour {
        0..=5 => 0,   // 새벽
        6..=11 => 1,  // 오전
        12..=17 => 2, // 오후
        _ => 3,       // 18~23 저녁
    }
}

/// dB 인덱스 매핑 (FR-6, BR-4).
///
/// **Phase 27 FR-14 경계값 PRD 근거**: 4구간 임계값(40/60/80)은 v2-확장기능.md의 "60dB 이상
/// (다소 시끄러움)" 표현과 일반적 음향 분류 관행을 따른다 — 0~40 조용한 도서관/침실 수준,
/// 40~60 일상 대화/사무실, 60~80 카페/번화가, 80+ 시끄러운 거리/지하철. NoiseChampion
/// 템플릿이 "60dB 이상"을 정의에 사용하므로 SomewhatLoud(60~80)와 Loud(80+) 두 구간 모두
/// "베스트 dB가 시끄러움 계열"로 묶여 분류된다. 임계값 변경 시 PRD §템플릿 표 갱신 필요.
pub fn classify_db(avg_db: u32) -> usize {
    if avg_db < 40 {
        0 // 조용
    } else if avg_db < 60 {
        1 // 보통
    } else if avg_db < 80 {
        2 // 다소 시끄러움
    } else {
        3 // 시끄러움
    }
}

/// RFC3339 시각 문자열에서 Local hour 추출 (BR-5).
///
/// 파싱 실패 시 None — 호출자가 해당 세션을 분석에서 제외한다.
pub fn parse_local_hour(start_at: &str) -> Option<u32> {
    use chrono::Timelike;
    let dt = DateTime::parse_from_rfc3339(start_at).ok()?;
    let local: DateTime<chrono::Local> = dt.with_timezone(&chrono::Local);
    Some(local.hour())
}

/// 4구간 베스트 인덱스 선택 (FR-7, FR-8).
///
/// 평균 score 최댓값 구간. 동률 시 count 큰 쪽 우선. 모든 버킷 count=0이면 None.
pub fn pick_best_index(buckets: &[BucketStats; 4]) -> Option<usize> {
    let mut best: Option<usize> = None;
    for (i, b) in buckets.iter().enumerate() {
        if b.count == 0 {
            continue;
        }
        match best {
            None => best = Some(i),
            Some(j) => {
                let cur = &buckets[j];
                // FR-7/8: 평균 score 큰 쪽. 동률 시 count 큰 쪽 우선.
                // 부동소수점 비교는 f64::EPSILON 허용 — 동일 합/카운트라도 누적 순서에 따른
                // 미세 오차가 동률 판단을 깨뜨릴 가능성 차단.
                if b.avg_score > cur.avg_score
                    || ((b.avg_score - cur.avg_score).abs() < f64::EPSILON
                        && b.count > cur.count)
                {
                    best = Some(i);
                }
            }
        }
    }
    best
}

/// 태그 인사이트: count 최댓값 후보 선택. 동률 시 avg_score 큰 쪽 우선.
/// 모든 BucketStats가 count=0이거나 빈 맵이면 None.
pub fn pick_top_tag(stats: &HashMap<String, BucketStats>) -> Option<(String, u32)> {
    stats
        .iter()
        .filter(|(_, b)| b.count > 0)
        .max_by(|a, b| {
            a.1.count.cmp(&b.1.count).then_with(|| {
                a.1
                    .avg_score
                    .partial_cmp(&b.1.avg_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
        })
        .map(|(k, v)| (k.clone(), v.count))
}

/// 태그 인사이트: count >= min_count 필터 후 avg_score 최댓값 후보 선택.
/// 의미 있는 표본 보장을 위해 min_count는 호출자가 지정 (보통 3).
pub fn pick_best_tag(
    stats: &HashMap<String, BucketStats>,
    min_count: u32,
) -> Option<(String, i64)> {
    stats
        .iter()
        .filter(|(_, b)| b.count >= min_count)
        .max_by(|a, b| {
            a.1
                .avg_score
                .partial_cmp(&b.1.avg_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(k, v)| (k.clone(), v.avg_score.round() as i64))
}

/// 올라운더 판정 — 모집단 표준편차 σ ≤ 5 + 모든 구간 ≥ 5세션.
///
/// 사용자 피드백 반영: 임계값 10 → 5로 완화 (총 20세션부터 도달 가능, 이전 40세션 → 절반).
/// 보다 자주 발동하여 균형형 사용자가 적절한 인사이트를 받도록 조정.
///
/// 1단계 가드: count<5 버킷이 하나라도 있으면 즉시 false (short-circuit).
/// 2단계: σ 계산 후 ≤ 5 검증.
pub fn is_allrounder(buckets: &[BucketStats; 4]) -> bool {
    // 1. 전 구간 ≥ 5세션 가드.
    if buckets.iter().any(|b| b.count < 5) {
        return false;
    }
    // 2. 가드 통과 시에만 모집단 표준편차 σ 계산.
    let mean = buckets.iter().map(|b| b.avg_score).sum::<f64>() / 4.0;
    let variance = buckets
        .iter()
        .map(|b| (b.avg_score - mean).powi(2))
        .sum::<f64>()
        / 4.0;
    variance.sqrt() <= 5.0
}

/// 월간 패턴 분석 (FR-1~13).
///
/// 입력: 전체 session_logs (serde_json::Value 배열) + 대상 연월("YYYY-MM").
/// 출력: 5종 템플릿 중 하나 또는 None(0세션).
///
/// 1. 대상 연월 세션만 필터 (date 필드 prefix YYYY-MM 비교).
/// 2. 0세션 → None (FR-2).
/// 3. 1~9세션 → Encouragement (FR-3).
/// 4. ≥10세션 → 시간대/dB 버킷 집계 + 우선순위 분기 (FR-9).
pub fn analyze_monthly_pattern(
    logs: &[serde_json::Value],
    year_month: &str,
) -> Option<MonthlyAnalysis> {
    // 1. 대상 연월 세션 필터. start_at 파싱 실패 세션 제외 (BR-5).
    //    note: date 필드 prefix(YYYY-MM)로 1차 필터, hour 분류는 start_at 기준 (FR-5).
    let mut total_sessions: u32 = 0;
    let mut total_minutes: u32 = 0;
    let mut total_sprouts: u32 = 0;
    let mut score_sum: f64 = 0.0;
    let mut time_counts: [u32; 4] = [0; 4];
    let mut time_score_sums: [f64; 4] = [0.0; 4];
    let mut db_counts: [u32; 4] = [0; 4];
    let mut db_score_sums: [f64; 4] = [0.0; 4];
    // 태그 인사이트 집계: (tag_id) → (count, score_sum) 누적 후 마지막에 BucketStats로 변환.
    let mut work_tag_counts: HashMap<String, (u32, f64)> = HashMap::new();
    let mut loc_counts: HashMap<String, (u32, f64)> = HashMap::new();

    // YYYY-MM- 접두사로 비교 — date="2026-04"(일자 없는 형식)이 "2026-04" 모든 달에
    // 매칭되는 오용 방지. 정상 형식은 항상 "YYYY-MM-DD"이므로 접두사 매칭에 영향 없음.
    let prefix = format!("{}-", year_month);
    for log in logs {
        let date = log.get("date").and_then(|v| v.as_str()).unwrap_or("");
        if !date.starts_with(&prefix) {
            continue;
        }
        // Phase 27 PR review (BR-1 정합): earned_sprouts는 date 필터 통과 후 무조건 누적.
        // start_at 파싱 실패 시 시간대/dB 분류만 skip하고 earned_sprouts는 누락하지 않는다 —
        // {총새싹} = 해당 월 session_logs.earned_sprouts 합계 정의 준수.
        // u64 → u32 saturating 변환: u32::MAX 초과 시 truncation 방지.
        let earned_sprouts = log
            .get("earned_sprouts")
            .and_then(|v| v.as_u64())
            .map(|v| u32::try_from(v).unwrap_or(u32::MAX))
            .unwrap_or(0);
        total_sprouts = total_sprouts.saturating_add(earned_sprouts);

        let start_at = log.get("start_at").and_then(|v| v.as_str()).unwrap_or("");
        let hour = match parse_local_hour(start_at) {
            Some(h) => h,
            None => continue, // BR-5: 파싱 실패 시 시간대/dB 분류만 제외 (earned_sprouts는 위에서 누적).
        };
        let score = log
            .get("score")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let avg_db = log
            .get("avg_db")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let duration_mins = log
            .get("duration_mins")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        total_sessions += 1;
        total_minutes = total_minutes.saturating_add(duration_mins);
        score_sum += score as f64;

        let t_idx = classify_hour(hour);
        time_counts[t_idx] += 1;
        time_score_sums[t_idx] += score as f64;

        let d_idx = classify_db(avg_db);
        db_counts[d_idx] += 1;
        db_score_sums[d_idx] += score as f64;

        // 태그 인사이트 집계 — 부재(work_tag_id=None) / 빈 문자열은 자연 skip.
        if let Some(tag) = log
            .get("work_tag_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            let entry = work_tag_counts
                .entry(tag.to_string())
                .or_insert((0, 0.0));
            entry.0 += 1;
            entry.1 += score as f64;
        }
        if let Some(loc) = log
            .get("location_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            let entry = loc_counts.entry(loc.to_string()).or_insert((0, 0.0));
            entry.0 += 1;
            entry.1 += score as f64;
        }
    }

    // 2. 0세션 → None (FR-2).
    if total_sessions == 0 {
        return None;
    }

    let avg_score = score_sum / (total_sessions as f64);
    let time_buckets: [BucketStats; 4] = [
        bucket(time_counts[0], time_score_sums[0]),
        bucket(time_counts[1], time_score_sums[1]),
        bucket(time_counts[2], time_score_sums[2]),
        bucket(time_counts[3], time_score_sums[3]),
    ];
    let db_buckets: [BucketStats; 4] = [
        bucket(db_counts[0], db_score_sums[0]),
        bucket(db_counts[1], db_score_sums[1]),
        bucket(db_counts[2], db_score_sums[2]),
        bucket(db_counts[3], db_score_sums[3]),
    ];

    let work_tag_stats: HashMap<String, BucketStats> = work_tag_counts
        .into_iter()
        .map(|(k, (c, s))| {
            (
                k,
                BucketStats {
                    count: c,
                    avg_score: if c == 0 { 0.0 } else { s / c as f64 },
                },
            )
        })
        .collect();
    let location_stats: HashMap<String, BucketStats> = loc_counts
        .into_iter()
        .map(|(k, (c, s))| {
            (
                k,
                BucketStats {
                    count: c,
                    avg_score: if c == 0 { 0.0 } else { s / c as f64 },
                },
            )
        })
        .collect();

    let stats = MonthlyStats {
        total_sessions,
        total_minutes,
        avg_score,
        time_buckets,
        db_buckets,
        total_sprouts,
        work_tag_stats,
        location_stats,
    };

    // 3. 1~9세션 → Encouragement (FR-3).
    if total_sessions < 10 {
        return Some(MonthlyAnalysis {
            template: TemplateId::Encouragement,
            stats,
            best_time_idx: pick_best_index(&time_buckets),
            best_db_idx: pick_best_index(&db_buckets),
        });
    }

    // 4. ≥10세션 → 우선순위 분기 (FR-9).
    let best_time_idx = pick_best_index(&time_buckets);
    let best_db_idx = pick_best_index(&db_buckets);

    // ③ NightOwl: 베스트 시간대 == 새벽 (FR-10).
    if best_time_idx == Some(0) {
        return Some(MonthlyAnalysis {
            template: TemplateId::NightOwl,
            stats,
            best_time_idx,
            best_db_idx,
        });
    }
    // ④ NoiseChampion: 베스트 dB ∈ {SomewhatLoud, Loud} (FR-11).
    if matches!(best_db_idx, Some(2) | Some(3)) {
        return Some(MonthlyAnalysis {
            template: TemplateId::NoiseChampion,
            stats,
            best_time_idx,
            best_db_idx,
        });
    }
    // ② Allrounder: σ ≤ 5 + 전 구간 ≥ 10 (FR-13). Standard보다 먼저 검사하여
    //    4구간 균형형이 도달 가능 (AC-7) — Standard는 best_time_idx ∈ {1,2,3} 모두 매칭.
    if is_allrounder(&time_buckets) {
        return Some(MonthlyAnalysis {
            template: TemplateId::Allrounder,
            stats,
            best_time_idx,
            best_db_idx,
        });
    }
    // ① Standard: 베스트 시간대 ∈ {오전, 오후, 저녁} (FR-12).
    if matches!(best_time_idx, Some(1) | Some(2) | Some(3)) {
        return Some(MonthlyAnalysis {
            template: TemplateId::Standard,
            stats,
            best_time_idx,
            best_db_idx,
        });
    }
    // 폴백: Encouragement (앞선 4개 미해당 시 — 사실상 베스트 시간대가 None일 때).
    Some(MonthlyAnalysis {
        template: TemplateId::Encouragement,
        stats,
        best_time_idx,
        best_db_idx,
    })
}

fn bucket(count: u32, score_sum: f64) -> BucketStats {
    if count == 0 {
        BucketStats {
            count: 0,
            avg_score: 0.0,
        }
    } else {
        BucketStats {
            count,
            avg_score: score_sum / (count as f64),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn classify_hour_boundaries() {
        assert_eq!(classify_hour(0), 0);
        assert_eq!(classify_hour(5), 0);
        assert_eq!(classify_hour(6), 1);
        assert_eq!(classify_hour(11), 1);
        assert_eq!(classify_hour(12), 2);
        assert_eq!(classify_hour(17), 2);
        assert_eq!(classify_hour(18), 3);
        assert_eq!(classify_hour(23), 3);
    }

    #[test]
    fn classify_db_boundaries_includes_zero_in_quiet() {
        // BR-4: avg_db=0 → Quiet 구간.
        assert_eq!(classify_db(0), 0);
        assert_eq!(classify_db(39), 0);
        assert_eq!(classify_db(40), 1);
        assert_eq!(classify_db(59), 1);
        assert_eq!(classify_db(60), 2);
        assert_eq!(classify_db(79), 2);
        assert_eq!(classify_db(80), 3);
        assert_eq!(classify_db(120), 3);
    }

    #[test]
    fn parse_local_hour_valid_rfc3339() {
        // Local 변환 결과는 시스템 timezone에 의존하므로 None이 아님만 검증.
        let result = parse_local_hour("2026-04-15T09:30:00+09:00");
        assert!(result.is_some());
        let h = result.unwrap();
        assert!(h < 24);
    }

    #[test]
    fn parse_local_hour_invalid_returns_none() {
        assert!(parse_local_hour("not-a-date").is_none());
        assert!(parse_local_hour("").is_none());
        assert!(parse_local_hour("2026-04-15").is_none()); // 시각 부재.
    }

    #[test]
    fn pick_best_all_zero_returns_none() {
        let buckets = [
            BucketStats::default(),
            BucketStats::default(),
            BucketStats::default(),
            BucketStats::default(),
        ];
        assert_eq!(pick_best_index(&buckets), None);
    }

    #[test]
    fn pick_best_simple_max() {
        let buckets = [
            BucketStats { count: 5, avg_score: 70.0 },
            BucketStats { count: 5, avg_score: 85.0 },
            BucketStats { count: 5, avg_score: 60.0 },
            BucketStats { count: 5, avg_score: 50.0 },
        ];
        assert_eq!(pick_best_index(&buckets), Some(1));
    }

    #[test]
    fn pick_best_tie_prefers_higher_count() {
        // FR-7: 평균 동률 시 count 큰 쪽.
        let buckets = [
            BucketStats { count: 5, avg_score: 80.0 },
            BucketStats { count: 10, avg_score: 80.0 },
            BucketStats { count: 0, avg_score: 0.0 },
            BucketStats { count: 0, avg_score: 0.0 },
        ];
        assert_eq!(pick_best_index(&buckets), Some(1));
    }

    #[test]
    fn is_allrounder_short_circuits_when_any_count_under_5() {
        // 1단계 가드: count<5 버킷이 있으면 즉시 false (임계값 10 → 5 완화).
        let buckets = [
            BucketStats { count: 4, avg_score: 80.0 },
            BucketStats { count: 10, avg_score: 80.0 },
            BucketStats { count: 10, avg_score: 80.0 },
            BucketStats { count: 10, avg_score: 80.0 },
        ];
        assert!(!is_allrounder(&buckets));
    }

    #[test]
    fn is_allrounder_passes_when_sigma_under_5_and_all_ge_5() {
        // 평균 80, 편차 적음 → σ ≤ 5. count 임계값 10 → 5 완화 적용.
        let buckets = [
            BucketStats { count: 10, avg_score: 78.0 },
            BucketStats { count: 12, avg_score: 80.0 },
            BucketStats { count: 11, avg_score: 82.0 },
            BucketStats { count: 15, avg_score: 80.0 },
        ];
        assert!(is_allrounder(&buckets));
    }

    #[test]
    fn is_allrounder_fails_when_sigma_over_5() {
        // 큰 편차 → σ > 5.
        let buckets = [
            BucketStats { count: 10, avg_score: 50.0 },
            BucketStats { count: 10, avg_score: 80.0 },
            BucketStats { count: 10, avg_score: 90.0 },
            BucketStats { count: 10, avg_score: 60.0 },
        ];
        assert!(!is_allrounder(&buckets));
    }

    fn make_log(date: &str, start_at: &str, score: u32, avg_db: u32, dur: u32) -> serde_json::Value {
        json!({
            "id": format!("sl-{}-{}", date, score),
            "date": date,
            "start_at": start_at,
            "end_at": start_at,
            "duration_mins": dur,
            "score": score,
            "todos_done": [],
            "avg_db": avg_db,
            "earned_sprouts": 0,
        })
    }

    #[test]
    fn analyze_zero_sessions_returns_none() {
        let logs: Vec<serde_json::Value> = vec![];
        assert!(analyze_monthly_pattern(&logs, "2026-04").is_none());
    }

    #[test]
    fn analyze_other_month_only_returns_none() {
        let logs = vec![make_log(
            "2026-03-15",
            "2026-03-15T09:00:00+09:00",
            80,
            0,
            25,
        )];
        assert!(analyze_monthly_pattern(&logs, "2026-04").is_none());
    }

    #[test]
    fn analyze_1_to_9_returns_encouragement() {
        let logs: Vec<serde_json::Value> = (0..5)
            .map(|i| {
                make_log(
                    "2026-04-15",
                    &format!("2026-04-15T09:{:02}:00+09:00", i),
                    80,
                    0,
                    25,
                )
            })
            .collect();
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        assert_eq!(analysis.template, TemplateId::Encouragement);
        assert_eq!(analysis.stats.total_sessions, 5);
        assert_eq!(analysis.stats.total_minutes, 125);
    }

    #[test]
    fn analyze_unparseable_start_at_excluded() {
        // BR-5: start_at 파싱 실패 세션 제외.
        let logs = vec![
            make_log("2026-04-15", "invalid", 80, 0, 25),
            make_log("2026-04-15", "2026-04-15T09:00:00+09:00", 80, 0, 25),
        ];
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        assert_eq!(analysis.stats.total_sessions, 1);
    }

    /// Phase 27 PR review (BR-1 정합):
    /// start_at 파싱 실패 세션도 earned_sprouts는 누적되어야 한다.
    #[test]
    fn analyze_total_sprouts_includes_unparseable_start_at() {
        let logs = vec![
            json!({
                "id": "sl-bad",
                "date": "2026-04-15",
                "start_at": "invalid",
                "end_at": "invalid",
                "duration_mins": 25,
                "score": 80,
                "todos_done": [],
                "avg_db": 30,
                "earned_sprouts": 5,
            }),
            json!({
                "id": "sl-ok",
                "date": "2026-04-15",
                "start_at": "2026-04-15T10:00:00+09:00",
                "end_at": "2026-04-15T10:25:00+09:00",
                "duration_mins": 25,
                "score": 80,
                "todos_done": [],
                "avg_db": 30,
                "earned_sprouts": 3,
            }),
        ];
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        // start_at 파싱 실패 세션은 시간대 분석 제외, 정상 세션만 1건 → Encouragement.
        assert_eq!(analysis.stats.total_sessions, 1);
        // 단 earned_sprouts는 5+3=8 누적 (BR-1: date 필터 통과 후 무조건 누적).
        assert_eq!(
            analysis.stats.total_sprouts, 8,
            "start_at 파싱 실패도 earned_sprouts 누적되어야 함"
        );
    }

    #[test]
    fn analyze_night_owl_priority() {
        // FR-10: 새벽 시간대가 베스트 → NightOwl.
        // 새벽 12세션 (점수 90), 오전 11세션 (점수 70).
        let mut logs = Vec::new();
        for i in 0..12 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T03:{:02}:00+09:00", i),
                90,
                0,
                25,
            ));
        }
        for i in 0..11 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T09:{:02}:00+09:00", i),
                70,
                0,
                25,
            ));
        }
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        assert_eq!(analysis.template, TemplateId::NightOwl);
    }

    #[test]
    fn analyze_night_owl_beats_noise_champion() {
        // FR-9 / AC-5: 새벽 + 시끄러운 dB 동시 매칭 시 NightOwl 우선.
        let mut logs = Vec::new();
        // 새벽 + 시끄러움 12세션 (점수 90).
        for i in 0..12 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T03:{:02}:00+09:00", i),
                90,
                85,
                25,
            ));
        }
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        // best_db_idx == Loud지만 best_time_idx == Dawn이므로 NightOwl 선택.
        assert_eq!(analysis.template, TemplateId::NightOwl);
    }

    #[test]
    fn analyze_noise_champion() {
        // FR-11: 베스트 dB가 다소시끄러움/시끄러움 + 새벽 미해당 → NoiseChampion.
        let mut logs = Vec::new();
        // 오전 + 시끄러움 12세션 (점수 90).
        for i in 0..12 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T09:{:02}:00+09:00", i),
                90,
                85,
                25,
            ));
        }
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        assert_eq!(analysis.template, TemplateId::NoiseChampion);
    }

    #[test]
    fn analyze_standard() {
        // FR-12: 베스트 시간대 오전/오후/저녁, 새벽·시끄러움 미해당 → Standard.
        let mut logs = Vec::new();
        for i in 0..12 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T09:{:02}:00+09:00", i),
                90,
                0,
                25,
            ));
        }
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        assert_eq!(analysis.template, TemplateId::Standard);
        assert_eq!(analysis.best_time_idx, Some(1));
    }

    #[test]
    fn analyze_allrounder_requires_all_buckets_ge_5() {
        // 4구간 모두 ≥5 + σ ≤ 5 검증 (임계값 10 → 5 완화).
        let buckets = [
            BucketStats { count: 10, avg_score: 78.0 },
            BucketStats { count: 12, avg_score: 80.0 },
            BucketStats { count: 11, avg_score: 82.0 },
            BucketStats { count: 15, avg_score: 80.0 },
        ];
        assert!(is_allrounder(&buckets));

        let buckets2 = [
            BucketStats { count: 4, avg_score: 80.0 }, // count<5
            BucketStats { count: 12, avg_score: 80.0 },
            BucketStats { count: 11, avg_score: 80.0 },
            BucketStats { count: 15, avg_score: 80.0 },
        ];
        assert!(!is_allrounder(&buckets2));
    }

    #[test]
    fn analyze_allrounder_via_analyze() {
        // AC-7: 4구간 모두 ≥10세션 + σ≤5 + 새벽·시끄러움 미해당이면 Allrounder 선택.
        // 우선순위 ②Allrounder가 ①Standard보다 앞에 있으므로 best_time_idx ∈ {1,2,3}이어도
        // is_allrounder 통과 시 Allrounder가 선택되어야 한다.
        let mut logs = Vec::new();
        // 새벽 10세션 (점수 80, 조용 dB).
        for i in 0..10 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T03:{:02}:00+09:00", i),
                80,
                0,
                25,
            ));
        }
        // 오전 11세션 (점수 82).
        for i in 0..11 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T09:{:02}:00+09:00", i),
                82,
                0,
                25,
            ));
        }
        // 오후 12세션 (점수 80).
        for i in 0..12 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T13:{:02}:00+09:00", i),
                80,
                0,
                25,
            ));
        }
        // 저녁 10세션 (점수 78).
        for i in 0..10 {
            logs.push(make_log(
                "2026-04-15",
                &format!("2026-04-15T19:{:02}:00+09:00", i),
                78,
                0,
                25,
            ));
        }
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        assert_eq!(analysis.template, TemplateId::Allrounder);
    }

    #[test]
    fn analyze_total_sprouts_saturates_on_u32_overflow() {
        // u32::MAX(=4294967295) 초과 값을 u64로 전달 → u32::MAX로 saturating 변환.
        let logs = vec![
            json!({
                "id": "sl-overflow",
                "date": "2026-04-15",
                "start_at": "2026-04-15T10:00:00+09:00",
                "end_at": "2026-04-15T10:25:00+09:00",
                "duration_mins": 25,
                "score": 80,
                "todos_done": [],
                "avg_db": 30,
                "earned_sprouts": 5_000_000_000_u64,
            }),
        ];
        let result = analyze_monthly_pattern(&logs, "2026-04");
        assert!(result.is_some());
        if let Some(a) = result {
            // u32::MAX = 4294967295. saturating 변환되어 그대로 보존.
            assert_eq!(
                a.stats.total_sprouts,
                u32::MAX,
                "u32::MAX 초과 → saturating 변환되어야 함"
            );
        }
    }

    #[test]
    fn analyze_excludes_date_without_day() {
        // 회귀: date="2026-04"(일자 없음)는 정상 형식이 아니므로 매칭 제외.
        let logs = vec![
            json!({
                "id": "sl-bad",
                "date": "2026-04",
                "start_at": "2026-04-15T10:00:00+09:00",
                "end_at": "2026-04-15T10:25:00+09:00",
                "duration_mins": 25,
                "score": 80,
                "todos_done": [],
                "avg_db": 30,
                "earned_sprouts": 0,
            }),
            make_log("2026-04-15", "2026-04-15T10:00:00+09:00", 80, 30, 25),
        ];
        let analysis = analyze_monthly_pattern(&logs, "2026-04").expect("Some");
        // 정상 형식 1세션만 카운트 → Encouragement.
        assert_eq!(analysis.stats.total_sessions, 1);
        assert_eq!(analysis.template, TemplateId::Encouragement);
    }
}
