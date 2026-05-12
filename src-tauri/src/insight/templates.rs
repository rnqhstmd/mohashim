//! 5종 월간 템플릿 본문 빌더 (Phase 27 PRD §템플릿 표 정성 문안 교체).
//!
//! Phase 26: 수치 중심 단문. Phase 27 FR-1/FR-2: v2-확장기능.md의 정성적 감성 문안으로 교체.
//! 5종 모두 새 제목(이모지 포함) + 신규 변수 {총새싹}/{총시간} 사용.
//! BR-1~7 정책 따름 — {총시간}은 format_total_time, {베스트_시간대}는 format_time_range_label,
//! {베스트_dB구간}은 format_db_range_label로 포맷.

use super::buckets::{DbRange, MonthlyAnalysis, TemplateId, TimeRange};

const TIME_RANGES: [TimeRange; 4] = [
    TimeRange::Dawn,
    TimeRange::Morning,
    TimeRange::Afternoon,
    TimeRange::Evening,
];

const DB_RANGES: [DbRange; 4] = [
    DbRange::Quiet,
    DbRange::Normal,
    DbRange::SomewhatLoud,
    DbRange::Loud,
];

/// "2026-04" → "4". 비파싱 시 입력 그대로 사용.
fn month_label(year_month: &str) -> String {
    if let Some(month_str) = year_month.split('-').nth(1) {
        if let Ok(m) = month_str.parse::<u32>() {
            return m.to_string();
        }
    }
    year_month.to_string()
}

/// {총시간} 포맷터 (Phase 27 BR-2).
///
/// - `mins < 60` → "N분" (예: 25 → "25분", 0 → "0분")
/// - `mins % 60 == 0` → "N시간" (예: 60 → "1시간", 120 → "2시간")
/// - 그 외 → "N시간 N분" (예: 90 → "1시간 30분")
pub fn format_total_time(mins: u32) -> String {
    if mins < 60 {
        return format!("{}분", mins);
    }
    let hours = mins / 60;
    let remainder = mins % 60;
    if remainder == 0 {
        format!("{}시간", hours)
    } else {
        format!("{}시간 {}분", hours, remainder)
    }
}

/// {베스트_시간대} 라벨 포맷터.
///
/// 가독성 개선: zero-padding 제거(`06시` → `6시`) + 시간대 이름 자연스럽게 + 괄호 앞 공백.
/// 예: idx=3 → "저녁 (18시~24시)".
fn format_time_range_label(idx: usize) -> String {
    match TIME_RANGES[idx] {
        TimeRange::Dawn => "새벽 (0시~6시)".to_string(),
        TimeRange::Morning => "오전 (6시~12시)".to_string(),
        TimeRange::Afternoon => "오후 (12시~18시)".to_string(),
        TimeRange::Evening => "저녁 (18시~24시)".to_string(),
    }
}

/// {베스트_dB구간} 라벨 포맷터.
///
/// 가독성 개선: 환경 묘사 단어 추가("조용한 환경/보통 소음/약간/매우 시끄러운 환경").
/// 예: idx=2 → "약간 시끄러운 환경 (60~80dB)".
fn format_db_range_label(idx: usize) -> String {
    match DB_RANGES[idx] {
        DbRange::Quiet => "조용한 환경 (40dB 이하)".to_string(),
        DbRange::Normal => "보통 소음 (40~60dB)".to_string(),
        DbRange::SomewhatLoud => "약간 시끄러운 환경 (60~80dB)".to_string(),
        DbRange::Loud => "매우 시끄러운 환경 (80dB 이상)".to_string(),
    }
}

/// 편지 제목 (Phase 27 FR-2 — 5종 모두 정성 제목 + 이모지).
///
/// Standard도 단순 format이므로 _with_analysis 분기 불필요. 호환을 위해 함수는 유지하되
/// 모든 분기가 단순 format으로 동작.
pub fn render_letter_title(template: TemplateId, year_month: &str) -> String {
    let m = month_label(year_month);
    match template {
        TemplateId::Standard => format!("🌱 {}월의 모하 관찰 일기 도착!", m),
        TemplateId::Allrounder => format!("⚖️ 기복 없는 집중러, {}월의 너에게", m),
        TemplateId::NightOwl => format!("🦉 새벽의 감성을 좋아하는 {}월의 너에게", m),
        TemplateId::NoiseChampion => format!("🎧 무소의 뿔처럼 집중하는 {}월의 너에게", m),
        TemplateId::Encouragement => format!("👀 {}월, 우리 조금 더 친해지자!", m),
    }
}

/// 편지 제목 (with_analysis — 호환 유지). Phase 27부터 모든 분기가 단순 format이므로
/// analysis 인자는 미사용이지만 호출자(insight/mod.rs::build_letter) 시그니처 보존을 위해 유지.
pub fn render_letter_title_with_analysis(analysis: &MonthlyAnalysis, year_month: &str) -> String {
    render_letter_title(analysis.template, year_month)
}

/// 태그 인사이트 라벨 (라벨 룩업 결과, build_letter에서 주입).
///
/// - `top_work`: 최다 작업 태그 (label, count). 없으면 None → 관련 행 생략.
/// - `best_score_work`: count >= 3 + 평균 점수 최고 작업 (label, avg). 없으면 None.
/// - `top_location`: 최다 위치 (label, count). 없으면 None.
pub struct TagLabels {
    pub top_work: Option<(String, u32)>,
    pub best_score_work: Option<(String, i64)>,
    pub top_location: Option<(String, u32)>,
}

/// 빈 TagLabels (모든 후보 None) — 본 helper로 테스트/디버그 호출자 편의 제공.
impl Default for TagLabels {
    fn default() -> Self {
        Self {
            top_work: None,
            best_score_work: None,
            top_location: None,
        }
    }
}

/// 5종 템플릿별 끝맺음 응원 멘트 — 다음 달 활동 기대 톤으로 통일.
/// 데이터 부재 시에도 항상 합성되어 letter가 자연스럽게 마무리되도록 한다.
fn render_closing(template: TemplateId) -> &'static str {
    match template {
        TemplateId::Standard => "다음 달도 이 페이스 그대로 함께 가보자!",
        TemplateId::Allrounder => "이 꾸준함, 다음 달에도 보여줄 거지? 기대하고 있을게!",
        TemplateId::NightOwl => "다음 달에도 너의 고요한 시간 옆에서 응원할게!",
        TemplateId::NoiseChampion => "어떤 환경이든 굴하지 않는 너, 다음 달도 변함없이 빛날 거야!",
        TemplateId::Encouragement => "기다리고 있을게. 다음 달엔 더 자주 만나자!",
    }
}

/// 5종 템플릿별 태그 인사이트 한 줄 합성. 모든 후보 None이면 None 반환 → 본문에서 자연 생략.
fn render_tag_insight(template: TemplateId, t: &TagLabels) -> Option<String> {
    match template {
        TemplateId::Standard => match (&t.top_work, &t.top_location) {
            (Some((w, c)), Some((l, _))) => Some(format!(
                "이번 달 가장 많이 한 건 [{}]({}세션)! 주 활동지는 바로 [{}]!",
                w, c, l
            )),
            (Some((w, c)), None) => Some(format!(
                "이번 달 가장 많이 한 건 [{}]({}세션)!",
                w, c
            )),
            (None, Some((l, _))) => Some(format!("주 활동지는 바로 [{}]!", l)),
            (None, None) => None,
        },
        TemplateId::Allrounder => match (&t.best_score_work, &t.top_work) {
            (Some((w, s)), _) => Some(format!(
                "점수가 가장 좋았던 건 [{}]! 평균 [{}점]이나 됐네!",
                w, s
            )),
            (None, Some((w, _))) => {
                Some(format!("이번 달 가장 많이 한 건 [{}]!", w))
            }
            (None, None) => None,
        },
        TemplateId::NightOwl => match (&t.top_work, &t.top_location) {
            (Some((w, _)), Some((l, _))) => Some(format!(
                "새벽엔 주로 [{}]에 시간을 썼네! 주로 머문 곳은 [{}]!",
                w, l
            )),
            (Some((w, _)), None) => {
                Some(format!("새벽엔 주로 [{}]에 시간을 썼네!", w))
            }
            (None, Some((l, _))) => {
                Some(format!("주로 머문 곳은 [{}]!", l))
            }
            (None, None) => None,
        },
        TemplateId::NoiseChampion => match (&t.best_score_work, &t.top_work) {
            (Some((w, s)), _) => Some(format!(
                "시끄러운 환경에서도 흔들리지 않은 건 [{}]! 평균 [{}점]이나 유지했네!",
                w, s
            )),
            (None, Some((w, _))) => {
                Some(format!("자주 했던 작업은 바로 [{}]!", w))
            }
            (None, None) => None,
        },
        TemplateId::Encouragement => match (&t.top_location, &t.top_work) {
            (Some((l, _)), _) => Some(format!(
                "적은 횟수지만 가장 자주 만난 곳은 바로 [{}]! 익숙해지면 더 자주 보자!",
                l
            )),
            (None, Some((w, _))) => Some(format!(
                "적은 횟수지만 자주 한 건 [{}]! 다음 달엔 더 자주 해보자!",
                w
            )),
            (None, None) => None,
        },
    }
}

/// 편지 본문 — 5종 분기 + 태그 인사이트 행 (옵셔널).
///
/// 변수 치환:
/// - {총세션} = stats.total_sessions
/// - {총시간} = format_total_time(stats.total_minutes)
/// - {총새싹} = stats.total_sprouts
/// - {평균_점수} = stats.avg_score 정수 반올림
/// - {베스트_점수} = best 버킷의 avg_score 정수 반올림
/// - {베스트_시간대} = format_time_range_label(best_time_idx)
/// - {베스트_dB구간} = format_db_range_label(best_db_idx)
///
/// 태그 인사이트(`tag_labels`)는 데이터 부재 시 행 자체 생략으로 자연스럽게 녹아든다.
pub fn render_letter_body(
    analysis: &MonthlyAnalysis,
    _year_month: &str,
    tag_labels: &TagLabels,
) -> String {
    let stats = &analysis.stats;
    let total_sessions = stats.total_sessions;
    let total_time = format_total_time(stats.total_minutes);
    let total_sprouts = stats.total_sprouts;
    let avg_score = stats.avg_score.round() as i64;

    let base_body = match analysis.template {
        TemplateId::Standard => {
            // ① 표준형 — 베스트 시간대/점수 + 베스트 dB 구간.
            let time_idx = analysis.best_time_idx.unwrap_or(1);
            let time_label = format_time_range_label(time_idx);
            let best_score = stats.time_buckets[time_idx].avg_score.round() as i64;
            let db_idx = analysis.best_db_idx.unwrap_or(0);
            let db_label = format_db_range_label(db_idx);
            format!(
                "이번 달 우리는 총 [{}번], [{}]을 함께했고, 새싹 [{}개]를 수확했어!\n지켜보니까 너는 [{}]에 집중력(평균 [{}점])이 제일 좋더라고! 그리고 주변 소음이 [{}]일 때 점수가 제일 높았어. 너만의 집중 공식을 찾은 것 같아 매우 기쁨 기쁨 기쁨!!",
                total_sessions, total_time, total_sprouts, time_label, best_score, db_label
            )
        }
        TemplateId::Allrounder => {
            // ② 올라운더형 — 시간대 편차 적음 + 베스트 dB.
            let db_idx = analysis.best_db_idx.unwrap_or(0);
            let db_label = format_db_range_label(db_idx);
            format!(
                "이번 달 우리는 총 [{}번], [{}]을 함께했고, 새싹 [{}개]를 수확했어!\n이번 달 네 데이터를 분석해 봤는데, 넌 특정 시간대를 타지 않고 언제든(전체 평균 [{}점]) 집중을 잘 유지했어. 기복 없이 꾸준한 모습, 꽤 믓짐. 그래도 소음만큼은 [{}]일 때 효율이 가장 좋았으니, 다음 달 환경 세팅할 때 참고해!",
                total_sessions, total_time, total_sprouts, avg_score, db_label
            )
        }
        TemplateId::NightOwl => {
            // ③ 올빼미형 — 라벨 통일: "[새벽 시간 (0시~6시)]"로 가독성 개선.
            let dawn_avg = stats.time_buckets[0].avg_score.round() as i64;
            format!(
                "이번 달 우리는 총 [{}번], [{}]을 함께했고, 새싹 [{}개]를 수확했어!\n근데 너... 밤에 안 자고 뭐해? 남들 다 자는 [새벽 시간 (0시~6시)]에 평균 점수가 [{}점]으로 제일 높더라구. 고요한 밤의 감성이 너랑 잘 맞나 봐. 집중도 좋지만, 다음 달엔 건강도 생각해서 잠은 꼭 챙겨 자!!",
                total_sessions, total_time, total_sprouts, dawn_avg
            )
        }
        TemplateId::NoiseChampion => {
            // ④ 소음강자형 — 라벨 통일: "[약간 시끄러운 환경 (60~80dB)]"로 가독성 개선.
            let db_idx = analysis.best_db_idx.unwrap_or(2);
            let best_score = stats.db_buckets[db_idx].avg_score.round() as i64;
            format!(
                "이번 달 우리는 총 [{}번], [{}]을 함께했고, 새싹 [{}개]를 수확했어!\n진짜 놀라운 점,,, 너는 주변 소음이 [약간 시끄러운 환경 (60~80dB)]일 때 오히려 집중 점수([{}점])가 가장 높았다는 거야. 백색소음을 즐기는 스타일이구나? 어디서든 굴하지 않고 몰입하는 거 진짜 믓져!! 내가 다 뿌듯해.",
                total_sessions, total_time, total_sprouts, best_score
            )
        }
        TemplateId::Encouragement => {
            // ⑤ 격려형 — 1~9세션 또는 폴백.
            format!(
                "이번 달 우리는 총 [{}번], [{}]을 함께했고, 새싹 [{}개]를 수확했어!\n함께한 시간이 조금 짧아서 내가 네 집중 패턴을 완벽하게 파악하진 못했어. 하지만 네가 바쁜 와중에도 나랑 같이 몰입하려고 노력한 건 똑똑히 기억해. 다음 달에는 조금 더 자주 만나서 너만의 집중 황금 시간대를 꼭 찾아보자. 내가 옆에서 계속 지켜볼게!",
                total_sessions, total_time, total_sprouts
            )
        }
    };

    // 태그 인사이트 행(옵셔널) + 끝맺음 응원(항상).
    let with_tag = match render_tag_insight(analysis.template, tag_labels) {
        Some(line) => format!("{}\n{}", base_body, line),
        None => base_body,
    };
    format!("{}\n{}", with_tag, render_closing(analysis.template))
}

#[cfg(test)]
mod tests {
    use super::super::buckets::{BucketStats, MonthlyAnalysis, MonthlyStats, TemplateId};
    use super::*;

    fn make_analysis(template: TemplateId, n: u32, avg: f64) -> MonthlyAnalysis {
        MonthlyAnalysis {
            template,
            stats: MonthlyStats {
                total_sessions: n,
                total_minutes: n * 25,
                avg_score: avg,
                time_buckets: [
                    BucketStats { count: n / 4, avg_score: avg },
                    BucketStats { count: n / 4, avg_score: avg },
                    BucketStats { count: n / 4, avg_score: avg },
                    BucketStats { count: n / 4, avg_score: avg },
                ],
                db_buckets: [
                    BucketStats { count: n, avg_score: avg },
                    BucketStats::default(),
                    BucketStats::default(),
                    BucketStats::default(),
                ],
                total_sprouts: 42,
                work_tag_stats: std::collections::HashMap::new(),
                location_stats: std::collections::HashMap::new(),
            },
            best_time_idx: Some(1),
            best_db_idx: Some(0),
        }
    }

    // ─── format_total_time (BR-2, AC-9) ────────────────────────────

    #[test]
    fn format_total_time_zero_returns_zero_min() {
        assert_eq!(format_total_time(0), "0분");
    }

    #[test]
    fn format_total_time_under_60_returns_minutes() {
        assert_eq!(format_total_time(25), "25분");
    }

    #[test]
    fn format_total_time_exact_hour() {
        assert_eq!(format_total_time(60), "1시간");
    }

    #[test]
    fn format_total_time_hour_and_minutes() {
        assert_eq!(format_total_time(90), "1시간 30분");
    }

    #[test]
    fn format_total_time_two_hours_exact() {
        assert_eq!(format_total_time(120), "2시간");
    }

    // ─── format_time_range_label (가독성 개선: zero-pad 제거 + 괄호 앞 공백) ────────

    #[test]
    fn format_time_range_label_evening() {
        assert_eq!(format_time_range_label(3), "저녁 (18시~24시)");
    }

    #[test]
    fn format_time_range_label_dawn() {
        assert_eq!(format_time_range_label(0), "새벽 (0시~6시)");
    }

    // ─── format_db_range_label (가독성 개선: 환경 묘사 단어 추가) ──────────────

    #[test]
    fn format_db_range_label_somewhat_loud() {
        assert_eq!(
            format_db_range_label(2),
            "약간 시끄러운 환경 (60~80dB)"
        );
    }

    #[test]
    fn format_db_range_label_quiet() {
        assert_eq!(format_db_range_label(0), "조용한 환경 (40dB 이하)");
    }

    // ─── 5종 제목 (FR-2, AC-6, AC-7) ────────────────────────────────

    #[test]
    fn title_standard_includes_emoji_and_month() {
        let a = make_analysis(TemplateId::Standard, 12, 80.0);
        let title = render_letter_title_with_analysis(&a, "2026-04");
        assert_eq!(title, "🌱 4월의 모하 관찰 일기 도착!");
    }

    #[test]
    fn title_night_owl_full_form() {
        let a = make_analysis(TemplateId::NightOwl, 12, 80.0);
        let title = render_letter_title_with_analysis(&a, "2026-04");
        assert_eq!(title, "🦉 새벽의 감성을 좋아하는 4월의 너에게");
    }

    #[test]
    fn title_allrounder() {
        let a = make_analysis(TemplateId::Allrounder, 40, 80.0);
        let title = render_letter_title_with_analysis(&a, "2026-04");
        assert_eq!(title, "⚖️ 기복 없는 집중러, 4월의 너에게");
    }

    #[test]
    fn title_noise_champion() {
        let a = make_analysis(TemplateId::NoiseChampion, 12, 80.0);
        let title = render_letter_title_with_analysis(&a, "2026-04");
        assert_eq!(title, "🎧 무소의 뿔처럼 집중하는 4월의 너에게");
    }

    #[test]
    fn title_encouragement() {
        let a = make_analysis(TemplateId::Encouragement, 5, 60.0);
        let title = render_letter_title_with_analysis(&a, "2026-12");
        assert_eq!(title, "👀 12월, 우리 조금 더 친해지자!");
    }

    // ─── 5종 본문 키워드 (FR-1, AC-1~5, AC-8) ──────────────────────

    #[test]
    fn body_standard_contains_total_session_sprouts_and_jubilation() {
        let a = make_analysis(TemplateId::Standard, 12, 80.0);
        let body = render_letter_body(&a, "2026-04", &TagLabels::default());
        // AC-1: "총세션", "총새싹", "기쁨 기쁨 기쁨" 포함.
        assert!(body.contains("총 [12번]"));
        assert!(body.contains("42개")); // {총새싹} 치환 (AC-8)
        assert!(body.contains("기쁨 기쁨 기쁨"));
    }

    #[test]
    fn body_night_owl_contains_signature_phrase() {
        // AC-2: "밤에 안 자고 뭐해" 포함 + Dawn 평균 정수 표기.
        let a = make_analysis(TemplateId::NightOwl, 12, 80.0);
        let body = render_letter_body(&a, "2026-04", &TagLabels::default());
        assert!(body.contains("밤에 안 자고 뭐해"));
        assert!(body.contains("새벽 시간 (0시~6시)"));
        assert!(body.contains("80점"));
        assert!(body.contains("42개")); // {총새싹}
    }

    #[test]
    fn body_noise_champion_contains_mutjeo() {
        // AC-3: "믓져" 포함.
        let a = make_analysis(TemplateId::NoiseChampion, 12, 80.0);
        let body = render_letter_body(&a, "2026-04", &TagLabels::default());
        assert!(body.contains("믓져"));
        assert!(body.contains("약간 시끄러운 환경 (60~80dB)"));
        assert!(body.contains("42개")); // {총새싹}
    }

    #[test]
    fn body_encouragement_contains_watching_phrase() {
        // AC-4: "내가 옆에서 계속 지켜볼게" 포함.
        let a = make_analysis(TemplateId::Encouragement, 5, 60.0);
        let body = render_letter_body(&a, "2026-04", &TagLabels::default());
        assert!(body.contains("내가 옆에서 계속 지켜볼게"));
        assert!(body.contains("총 [5번]"));
        assert!(body.contains("42개")); // {총새싹}
    }

    #[test]
    fn body_allrounder_contains_mutjim() {
        // AC-5: "믓짐" 포함.
        let a = make_analysis(TemplateId::Allrounder, 40, 80.0);
        let body = render_letter_body(&a, "2026-04", &TagLabels::default());
        assert!(body.contains("믓짐"));
        assert!(body.contains("42개")); // {총새싹}
    }

    #[test]
    fn body_total_sprouts_substitution() {
        // AC-8: {총새싹}=42 fixture로 본문 "42" 포함 검증.
        for tid in [
            TemplateId::Standard,
            TemplateId::Allrounder,
            TemplateId::NightOwl,
            TemplateId::NoiseChampion,
            TemplateId::Encouragement,
        ] {
            let a = make_analysis(tid, 12, 80.0);
            let body = render_letter_body(&a, "2026-04", &TagLabels::default());
            assert!(
                body.contains("42"),
                "template {:?} body must contain total_sprouts=42",
                tid
            );
        }
    }

    #[test]
    fn month_label_parsing() {
        assert_eq!(month_label("2026-04"), "4");
        assert_eq!(month_label("2026-12"), "12");
        assert_eq!(month_label("2026-01"), "1");
        assert_eq!(month_label("invalid"), "invalid");
    }
}
