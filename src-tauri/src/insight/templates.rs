//! 5종 월간 템플릿 본문 빌더 (Phase 26 PRD §5종 템플릿 정의).
//!
//! 제목/본문 모두 `{월}월 리포트:` 접두 — 기존 mailbox와 시각 구분.
//! 본문은 통계 수치 중심 (Q&A 결정 1, 2 — 간결성 우선).

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

/// 편지 제목 (PRD §5종 템플릿 정의 표).
pub fn render_letter_title(template: TemplateId, year_month: &str) -> String {
    let m = month_label(year_month);
    match template {
        TemplateId::Standard => {
            // 표준형 제목은 베스트 시간대명을 포함하므로 analysis 없이 호출 불가.
            // 외부 오용 차단 — 반드시 render_letter_title_with_analysis를 사용해야 한다.
            unreachable!(
                "Standard requires render_letter_title_with_analysis (month={})",
                m
            )
        }
        TemplateId::Allrounder => format!("{}월 리포트: 올라운더형", m),
        TemplateId::NightOwl => format!("{}월 리포트: 올빼미형", m),
        TemplateId::NoiseChampion => format!("{}월 리포트: 소음강자형", m),
        TemplateId::Encouragement => format!("{}월 리포트: 시작이 반", m),
    }
}

/// 편지 제목 (Standard일 때 시간대명 채움).
pub fn render_letter_title_with_analysis(analysis: &MonthlyAnalysis, year_month: &str) -> String {
    let m = month_label(year_month);
    match analysis.template {
        TemplateId::Standard => {
            // FR-12: 베스트 시간대 ∈ {오전, 오후, 저녁}.
            let name = analysis
                .best_time_idx
                .map(|i| TIME_RANGES[i].display_name())
                .unwrap_or("");
            format!("{}월 리포트: {} 집중형", m, name)
        }
        _ => render_letter_title(analysis.template, year_month),
    }
}

/// 편지 본문 (PRD §본문 양식 예시).
///
/// 평균 점수는 정수 반올림 표기. 모든 본문은 "{월}월 리포트: ..." 제목과 짝.
pub fn render_letter_body(analysis: &MonthlyAnalysis, _year_month: &str) -> String {
    let stats = &analysis.stats;
    let n = stats.total_sessions;
    let avg = stats.avg_score.round() as i64;

    match analysis.template {
        TemplateId::Standard => {
            let idx = analysis.best_time_idx.unwrap_or(1);
            let name = TIME_RANGES[idx].display_name();
            let range = TIME_RANGES[idx].display_range();
            let bucket_avg = stats.time_buckets[idx].avg_score.round() as i64;
            format!(
                "이번 달 총 {}회 집중하셨네요.\n베스트 시간대는 {}({}) — 평균 {}점.\n전체 평균: {}점.",
                n, name, range, bucket_avg, avg
            )
        }
        TemplateId::Allrounder => {
            let dawn = stats.time_buckets[0].avg_score.round() as i64;
            let morning = stats.time_buckets[1].avg_score.round() as i64;
            let afternoon = stats.time_buckets[2].avg_score.round() as i64;
            let evening = stats.time_buckets[3].avg_score.round() as i64;
            format!(
                "이번 달 총 {}회 집중하셨네요.\n새벽 {}점 / 오전 {}점 / 오후 {}점 / 저녁 {}점 — 어느 시간대든 흔들림이 없어요.\n전체 평균: {}점.",
                n, dawn, morning, afternoon, evening, avg
            )
        }
        TemplateId::NightOwl => {
            let dawn_avg = stats.time_buckets[0].avg_score.round() as i64;
            format!(
                "이번 달 총 {}회 집중하셨네요.\n새벽(00~06) 평균 {}점 — 고요한 시간을 잘 활용하셨어요.\n전체 평균: {}점.",
                n, dawn_avg, avg
            )
        }
        TemplateId::NoiseChampion => {
            let idx = analysis.best_db_idx.unwrap_or(2);
            let name = DB_RANGES[idx].display_name();
            let bucket_avg = stats.db_buckets[idx].avg_score.round() as i64;
            format!(
                "이번 달 총 {}회 집중하셨네요.\n베스트 dB 구간은 '{}' — 평균 {}점.\n전체 평균: {}점.",
                n, name, bucket_avg, avg
            )
        }
        TemplateId::Encouragement => {
            // FR-3: 1~9세션 또는 폴백.
            format!(
                "이번 달 총 {}회 집중하셨네요.\n총 집중 시간: {}분 — 시작이 반이에요.",
                n, stats.total_minutes
            )
        }
    }
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
            },
            best_time_idx: Some(1),
            best_db_idx: Some(0),
        }
    }

    #[test]
    fn title_standard_includes_time_name() {
        let a = make_analysis(TemplateId::Standard, 12, 80.0);
        let title = render_letter_title_with_analysis(&a, "2026-04");
        assert!(title.starts_with("4월 리포트:"));
        assert!(title.contains("오전"));
    }

    #[test]
    fn title_night_owl() {
        let a = make_analysis(TemplateId::NightOwl, 12, 80.0);
        let title = render_letter_title_with_analysis(&a, "2026-04");
        assert_eq!(title, "4월 리포트: 올빼미형");
    }

    #[test]
    fn title_encouragement() {
        let a = make_analysis(TemplateId::Encouragement, 5, 60.0);
        let title = render_letter_title_with_analysis(&a, "2026-12");
        assert_eq!(title, "12월 리포트: 시작이 반");
    }

    #[test]
    fn body_standard_contains_total_and_avg() {
        let a = make_analysis(TemplateId::Standard, 12, 80.0);
        let body = render_letter_body(&a, "2026-04");
        assert!(body.contains("총 12회"));
        assert!(body.contains("전체 평균: 80점"));
        assert!(body.contains("오전"));
    }

    #[test]
    fn body_encouragement_contains_total_minutes() {
        let a = make_analysis(TemplateId::Encouragement, 5, 60.0);
        let body = render_letter_body(&a, "2026-04");
        assert!(body.contains("총 5회"));
        assert!(body.contains("125분"));
    }

    #[test]
    fn month_label_parsing() {
        assert_eq!(month_label("2026-04"), "4");
        assert_eq!(month_label("2026-12"), "12");
        assert_eq!(month_label("2026-01"), "1");
        assert_eq!(month_label("invalid"), "invalid");
    }
}
