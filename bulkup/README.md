# 아더댄웍스 벌크업 패키지

마스터 브리프를 바탕으로 만든 전략 문서, 대표용 진단 도구, 공개 무료 진단 퍼널입니다.

| 파일 | 내용 | 게시본 |
|---|---|---|
| `bulkup-blueprint.html` | 벌크업 설계도: 수익 구조, AI 서비스 기획안, 0원 트랙션 90일, 마케팅 퍼널, 2027 지원사업 로드맵 | https://claude.ai/artifact/EvGxVg3fmuizs4LVZii4DX |
| `six-axis-studio.html` | 대표용 진단 스튜디오: 본인 체크 + 그림 AI 분석 합산, 대표 감수, 상업성 점수, 무료 카드 / 유료 장문 리포트(HTML 파일 저장·텍스트 복사), 검증 실험실, 기록 | https://claude.ai/artifact/EkFy31tQyaVgejNoEWCfy1 |
| `free-diagnosis.html` | 공개 무료 진단: 17문항 → 연락처·궁금한 점·동의 → 그림체 유형 공개 + 잠긴 목차 → 유료 리포트·수업·문의 | (아래 '공개하기' 참고) |
| `otw-core.js` | 두 페이지가 함께 쓰는 규칙·유형·리포트 문장 라이브러리. 대표 기준으로 바꾸는 곳 | – |
| `lead-collector.gs` | 무료 진단 응답을 구글 시트에 쌓고 결과 메일을 보내는 Apps Script | – |
| `tools/build-public.cjs` | 무료 진단을 외부 호스팅용 `public/` 폴더로 묶기 | – |
| `tests/` | `studio-e2e.cjs`(스튜디오), `free-e2e.cjs`(무료 진단 + 수집기) | – |

## 진단 규칙 (otw-core.js)

- **AI는 관찰만** 합니다. 6축 위치·일관성·상업 신호 5가지와 근거 문장을 JSON으로 받습니다.
- **해석은 규칙**입니다. 종합 = 그림체 적합 45% + 상품 준비도 35% + 시장 매력 20%. 그림체 적합은 표준화해서 특정 길로 쏠리지 않게 했습니다.
- **이모티콘 문턱**: 표정 폭 4, 캐릭터 고정성 4, 선 정돈 62를 못 넘으면 감점해 굿즈·그림책 쪽으로 넘깁니다 (`EMOTICON_GATE`).
- **본인 체크 + AI 합산**: 위치·신호는 AI 60%, 일관성은 50:50 (`MERGE`). 차이가 큰 축은 처방 1순위.
- **그림체 유형 8종**: 선(정돈/러프) × 형태(데포르메/사실) × 정서(서사/담백) (`TYPES`).
- **장문 리포트**: `PATH_GUIDE`(길별 시장·경로·수익 계산·12주 로드맵·체크리스트·실수), `AXIS_GUIDE`, `SIGNAL_GUIDE`, `CLASSES`(수업 소개)를 대표의 실제 커리큘럼·말투로 바꿔 쓰면 됩니다.

## 공개하기 (무료 진단)

1. 구글 시트를 만들고 `lead-collector.gs`를 Apps Script 웹 앱으로 배포 (파일 맨 위 순서 참고)
2. `otw-core.js`의 `CONFIG`에 웹 앱 주소, 결제·수업·카카오 링크, 가격 입력
3. `node bulkup/tools/build-public.cjs` → `bulkup/public/` 생성
4. `public` 폴더를 Netlify Drop에 끌어다 놓거나 GitHub Pages로 배포
5. 인스타 프로필 링크에 걸고 게시물마다 `?utm_source=instagram&utm_campaign=게시물이름`

## 테스트

```bash
node bulkup/tests/studio-e2e.cjs   # Playwright 필요
node bulkup/tests/free-e2e.cjs
```
