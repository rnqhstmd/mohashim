/// 작업 점수 산출 (FR-7, FR-8).
///
/// - seconds_idle <= 180 → 80 (Grace Period 유지)
/// - past = seconds_idle - 180; decay = (past / 10) * 5
/// - decay >= 80 → 0
/// - 그 외 80 - decay
pub fn work_score(seconds_idle: u64) -> u8 {
    if seconds_idle <= 180 {
        return 80;
    }
    let past = seconds_idle - 180;
    let decay = (past / 10) * 5;
    if decay >= 80 {
        return 0;
    }
    // decay < 80이 보장되므로 80-decay는 1..=80 범위. u8::try_from으로 의도 명시.
    u8::try_from(80u64 - decay).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ac1_boundary_values() {
        // AC-1 7개.
        assert_eq!(work_score(0), 80);
        assert_eq!(work_score(180), 80);
        assert_eq!(work_score(181), 80);
        assert_eq!(work_score(189), 80);
        assert_eq!(work_score(190), 75);
        assert_eq!(work_score(360), 0);
        assert_eq!(work_score(1000), 0);
    }
}
