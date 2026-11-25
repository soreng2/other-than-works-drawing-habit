# 아더댄웍스 벌크업 패키지

마스터 브리프를 바탕으로 만든 전략 문서와 바로 쓸 수 있는 MVP입니다.

| 파일 | 내용 | 게시본 |
|---|---|---|
| `bulkup-blueprint.html` | 벌크업 설계도: 수익 구조, AI 서비스 기획안(스펙·와이어프레임·프롬프트), 0원 트랙션 90일, 2027 지원사업 로드맵 | https://claude.ai/artifact/EvGxVg3fmuizs4LVZii4DX |
| `six-axis-studio.html` | 6축 그림체 진단 스튜디오: 그림 업로드 → Claude 관찰 → 대표 감수 → 길별 적합도·추천 → 1080×1350 결과 카드 PNG · 2주 처방 · DM 문구 · 진단 기록 | https://claude.ai/artifact/EkFy31tQyaVgejNoEWCfy1 |
| `tests/studio-e2e.cjs` | 가짜 Claude 런타임을 주입해 AI 진단·감수·카드·저장·기록·자가진단·모바일 렌더를 확인하는 Playwright 테스트 | – |

## 진단 스튜디오 구조

- **AI는 관찰만** 합니다. 6축 위치(0–100), 일관성(1–5), 근거 문장, 강점·막힘·처방 초안을 JSON으로 받습니다.
- **해석은 규칙**입니다. 길별 적합도(`GENRES`), 수업 추천(`recommendation`), 기본 처방(`RX_LIB`)은 코드 안의 아더댄웍스 규칙으로 계산합니다.
- **대표가 서명**합니다. 슬라이더·일관성·문장을 고치면 적합도와 카드가 즉시 다시 계산됩니다.
- 그림 원본은 저장하지 않고, 결과만 소유자·편집자 전용 기록(`diagnoses`)에 남깁니다.

### 실제 6축으로 바꾸기

`six-axis-studio.html` 스크립트 맨 위의 `AXES` 배열만 바꾸면 결과지, 카드, 자가진단 문항, AI 프롬프트가 함께 바뀝니다. 길별 목표값(`GENRES.target`)은 같은 순서를 따릅니다.

## 테스트

```bash
node bulkup/tests/studio-e2e.cjs   # Playwright 필요
```
