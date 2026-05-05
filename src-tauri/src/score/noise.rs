/// 소음 점수 산출 (FR-10, AC-2).
///
/// - NaN → 20 (BR-8 폴백)
/// - db_ema <= 65.0 → 20
/// - db_ema >= 80.0 → 0
/// - 65.0 < db_ema < 80.0 → (19.0 - ((db_ema - 65.0) / 15.0) * 18.0).round() clamp 0..=20
pub fn noise_score(db_ema: f32) -> u8 {
    if db_ema.is_nan() {
        return 20;
    }
    if db_ema <= 65.0 {
        return 20;
    }
    if db_ema >= 80.0 {
        return 0;
    }
    let raw = (19.0 - ((db_ema - 65.0) / 15.0) * 18.0).round();
    raw.clamp(0.0, 20.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ac2_boundary_values() {
        // AC-2 7개 + NaN.
        assert_eq!(noise_score(0.0), 20);
        assert_eq!(noise_score(65.0), 20);
        assert_eq!(noise_score(66.0), 18);
        assert_eq!(noise_score(72.5), 10);
        assert_eq!(noise_score(79.0), 2);
        assert_eq!(noise_score(80.0), 0);
        assert_eq!(noise_score(100.0), 0);
        assert_eq!(noise_score(f32::NAN), 20);
    }
}
