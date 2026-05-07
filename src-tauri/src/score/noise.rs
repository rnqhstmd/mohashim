/// 소음 점수 산출 (FR-A1, AC-A1~A4).
///
/// Phase 18 단순화: 7단계 비례 분기 → 이진 임계값. 80dB 이하 조용함, 초과 시끄러움.
/// - NaN → 20 (BR-A1 폴백)
/// - db_ema <= 80.0 → 20
/// - db_ema > 80.0 → 0
pub fn noise_score(db_ema: f32) -> u8 {
    if db_ema.is_nan() {
        return 20;
    }
    if db_ema <= 80.0 {
        20
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// FR-A2 / AC-A1~A5: 이진 분기 7개 경계값 + NaN 폴백.
    /// 기존 7단계 비례 테스트(0/65/66/72.5/79/80/100)에서 이진 기준으로 교체.
    #[test]
    fn ac_a_boundary_values() {
        // AC-A1: 80.0 정확히 → 20 (조용함 유지).
        assert_eq!(noise_score(80.0), 20);
        // AC-A2: 80을 초과한 즉시 → 0.
        assert_eq!(noise_score(80.001), 0);
        // AC-A3 / FR-A3: 65 < db <= 80 중간값(72.5)도 20점 (기존 10에서 변경).
        assert_eq!(noise_score(72.5), 20);
        // AC-A4: NaN → 20 폴백.
        assert_eq!(noise_score(f32::NAN), 20);
        // 추가 경계: 매우 작은 값 / 65dB / 100dB.
        assert_eq!(noise_score(0.0), 20);
        assert_eq!(noise_score(65.0), 20);
        assert_eq!(noise_score(100.0), 0);
    }
}
