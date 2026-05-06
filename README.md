<div align="center">

<img src="src-tauri/icons/128x128.png" alt="모하심 아이콘" width="96"/>

# 모하심 (Mohashim)

**감자 캐릭터 '모하'가 내 집중력을 지켜봐 주는 Mac/Windows 생산성 앱**

[![GitHub release](https://img.shields.io/github/v/release/rnqhstmd/mohashim?style=flat-square)](https://github.com/rnqhstmd/mohashim/releases/latest)
[![License](https://img.shields.io/github/license/rnqhstmd/mohashim?style=flat-square)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)

</div>

---

<!--
  스크린샷 자리입니다. 실제 앱 캡처 이미지로 교체해 주세요.
  예: <img src="docs/screenshot.png" width="320"/>
-->
> 스크린샷 준비 중입니다.

---

## 다운로드

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/rnqhstmd/mohashim/releases/latest/download/Mohashim.dmg">
        <img src="https://img.shields.io/badge/macOS-다운로드_(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white"/>
      </a>
      <br/>
      <sub>macOS 12 이상</sub>
    </td>
    <td align="center">
      <a href="https://github.com/rnqhstmd/mohashim/releases/latest/download/Mohashim_Windows.msi">
        <img src="https://img.shields.io/badge/Windows-다운로드_(.msi)-0078D4?style=for-the-badge&logo=windows&logoColor=white"/>
      </a>
      <br/>
      <sub>Windows 10 이상</sub>
    </td>
  </tr>
</table>

> **macOS 사용자 참고** — 첫 실행 시 "개발자를 확인할 수 없음" 경고가 뜰 수 있습니다.  
> `시스템 설정 → 개인정보 보호 및 보안` 에서 **그래도 열기**를 눌러주세요. ([자세히 →](#faq))

---

## 이런 분께 추천해요

- 공부·작업 중 딴짓을 줄이고 싶은 분
- 포모도로를 쓰지만 "진짜 집중했는지" 불안한 분
- 오늘 얼마나 집중했는지 한눈에 확인하고 싶은 분

---

## 주요 기능

### 🎯 하이브리드 집중도 측정
키보드·마우스 활동(최대 80점)과 마이크 소음(최대 20점)을 1초마다 복합 분석합니다.  
실제로 손을 움직이고, 조용한 환경에서 집중할수록 높은 점수를 받습니다.

### 🍅 포모도로 타이머
집중 / 휴식 사이클을 자동으로 전환합니다.  
세션이 끝나면 알림으로 알려드리고, 완료된 세션은 잔디로 기록됩니다.

### 🌱 잔디 그래프
최근 28일간의 집중 세션을 GitHub 스타일 잔디로 시각화합니다.  
하루에 많이, 집중도 높게 완료할수록 진한 색으로 표시됩니다.

### 🥔 감자 캐릭터 '모하'
집중도에 따라 5단계 표정으로 반응하고, 상황에 맞는 멘트로 동기를 줍니다.  
트레이 아이콘도 함께 바뀌어 한눈에 내 상태를 확인할 수 있습니다.

---

## FAQ

<details>
<summary><b>집중도는 어떻게 측정하나요?</b></summary>

키보드·마우스 입력이 없는 시간(idle)이 길어질수록 점수가 줄고,  
마이크로 감지되는 주변 소음이 클수록(80dB 이상) 소음 점수가 0이 됩니다.  
짧은 자리비움(grace period)은 집중 중으로 처리되므로 음수는 없습니다.

</details>

<details>
<summary><b>마이크 권한이 왜 필요한가요?</b></summary>

주변 소음을 dB로 측정해 집중 환경을 평가하기 위해 사용합니다.  
녹음하거나 저장하지 않으며, 음량 수치만 실시간으로 분석합니다.

</details>

<details>
<summary><b>접근성 권한이 왜 필요한가요?</b></summary>

키보드·마우스 입력 감지를 위해 macOS 접근성 API가 필요합니다.  
입력 내용(어떤 키를 눌렀는지 등)은 수집하지 않고, 활동 여부만 감지합니다.

</details>

<details>
<summary><b>데이터는 어디에 저장되나요?</b></summary>

모든 데이터는 내 컴퓨터에만 저장됩니다. 외부 서버로 전송되지 않습니다.  
저장 위치: `~/.local/share/com.mohashim.app/` (macOS: `~/Library/Application Support/com.mohashim.app/`)

</details>

<details>
<summary><b>macOS에서 "개발자를 확인할 수 없음" 오류가 떠요</b></summary>

코드 서명 없이 배포된 앱에서 발생하는 macOS Gatekeeper 경고입니다.  
해결 방법:
1. `시스템 설정 → 개인정보 보호 및 보안` 으로 이동
2. "mohashim이(가) 차단되었습니다" 옆의 **그래도 열기** 클릭
3. 또는 터미널에서: `xattr -cr /Applications/Mohashim.app`

</details>

---

<div align="center">

[개발 문서](DEVELOPMENT.md) · [이슈 / 피드백](https://github.com/rnqhstmd/mohashim/issues) · [릴리즈 노트](https://github.com/rnqhstmd/mohashim/releases)

</div>
