/// EMA smoothing factor (FR-9).
pub const ALPHA: f32 = 0.1;

/// RMS 하한 (BR-8). RMS=0 → -∞ dB 회피.
pub const RMS_FLOOR: f32 = 1e-6;

/// RMS → dB 변환. RMS_FLOOR 이하 입력은 floor 적용.
pub fn rms_to_db(rms: f32) -> f32 {
    20.0 * rms.max(RMS_FLOOR).log10()
}

/// EMA 갱신: db_ema = α * sample + (1-α) * prev. NaN/±∞ 폴백 적용.
pub fn update_ema(prev: f32, sample_db: f32) -> f32 {
    sanitize(ALPHA * sample_db + (1.0 - ALPHA) * prev)
}

/// NaN/-∞/+∞ 등 비유한값을 0.0으로 클램핑.
pub fn sanitize(db: f32) -> f32 {
    if db.is_finite() {
        db
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ac3_ema_converges_to_input() {
        // 초기 0.0, 60.0 입력 20회 → ≥ 50.0.
        let mut v = 0.0f32;
        for _ in 0..20 {
            v = update_ema(v, 60.0);
        }
        assert!(v >= 50.0, "expected ema >= 50.0 after 20 iters, got {v}");
    }

    #[test]
    fn sanitize_nan_to_zero() {
        assert_eq!(sanitize(f32::NAN), 0.0);
    }

    #[test]
    fn sanitize_neg_infinity_to_zero() {
        assert_eq!(sanitize(f32::NEG_INFINITY), 0.0);
    }

    #[test]
    fn sanitize_pos_infinity_to_zero() {
        assert_eq!(sanitize(f32::INFINITY), 0.0);
    }

    #[test]
    fn sanitize_passthrough_finite() {
        assert_eq!(sanitize(42.0), 42.0);
        assert_eq!(sanitize(-12.0), -12.0);
        assert_eq!(sanitize(0.0), 0.0);
    }

    #[test]
    fn rms_to_db_floor_applied_at_zero() {
        // RMS=0 → 1e-6 floor → 20*log10(1e-6) = -120dB 근방.
        let db = rms_to_db(0.0);
        assert!((db - (-120.0)).abs() < 0.01, "expected ~-120dB, got {db}");
    }

    #[test]
    fn update_ema_is_finite_for_finite_inputs() {
        let v = update_ema(40.0, 50.0);
        assert!(v.is_finite());
    }
}
