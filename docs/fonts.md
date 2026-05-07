# Fonts

본 문서는 mohashim에 번들/배치되는 폰트의 출처, 라이센스, 배치 경로를 안내한다 (Phase 18 FR-E1~E3, K).

## Pretendard (기본)

- **Path**: `src/assets/fonts/Pretendard-{Regular,Medium,Bold,ExtraBold}.woff2`
- **License**: SIL Open Font License 1.1
- **Source**: https://github.com/orioncactus/pretendard

`@font-face` 선언은 `src/styles.css`의 4개 weight(400/500/700/800)로 등록되어 있으며, Tailwind
`fontFamily.pretendard` 체인은 `Pretendard` → `-apple-system` → `BlinkMacSystemFont` →
`Apple SD Gothic Neo` → `sans-serif` 폴백 순서를 따른다. 본문/UI 전반의 기본 글꼴이다.

## KyoboHandwriting2019 (TodoItem 라벨)

- **Path**: `src/assets/fonts/KyoboHandwriting2019.ttf` (저장소 미동봉 — 사용자가 직접 배치)
- **License**: 인쇄·웹·임베딩 허용. 상세 조건은 아래 Source/Download 링크 참조.
- **Source**: 교보문고 — https://www.kyobobook.co.kr
- **Fallback**: TTF 부재 시 `@font-face` fetch 404 → Tailwind `fontFamily.kyobo`
  체인의 `Pretendard`로 자연 폴백 (Phase 17 FR-D2 / BR-D). 코드 수정 없이 동작한다.
- **Download**: 교보문고 공식 페이지 또는 눈누(https://noonnu.cc)에서 "교보손글씨2019"로 검색.

배치 절차:

1. 위 링크에서 `KyoboHandwriting2019.ttf` 파일 다운로드.
2. `src/assets/fonts/KyoboHandwriting2019.ttf` 경로에 저장.
3. `npm run build` 또는 `npm run dev`로 재빌드.

배치 후 `TodoItem` 라벨 등 `fontFamily.kyobo`를 사용하는 영역이 손글씨로 자동 전환된다.
미배치 상태에서도 앱은 정상 동작하며 모든 텍스트는 Pretendard로 렌더된다.
