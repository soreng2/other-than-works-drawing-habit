/* ─────────────────────────────────────────────────────────────
   아더댄웍스 6축 진단 · 공용 코어
   대표용 스튜디오(six-axis-studio.html)와 공개 무료 진단(free-diagnosis.html)이
   같은 규칙·문장·리포트를 쓰도록 이 파일 하나에 모았다.
   대표의 실제 기준으로 바꿀 곳: AXES, GENRES, MARKET, CLASSES, CONFIG
   ───────────────────────────────────────────────────────────── */
(function (root) {
"use strict";

/* ═════════ 0. 설정 (링크·가격) ═════════ */
const LINKS = {
  insta: "https://www.instagram.com/other.than.works/",
  notion: "https://otherthanworks.notion.site/Other-than-Works-1ef94681837c801fb46be82f3ce30b67",
  clubForm: "https://docs.google.com/forms/d/e/1FAIpQLSdMA5IyvWvyUHV39iuQckXqlgUk3viVKqgXHVQG7DjlfEi5BQ/viewform",
};
const CONFIG = {
  brand: "아더댄웍스",
  insta: "@other.than.works",
  instaUrl: LINKS.insta,
  price: { report: 29000, launch: 19000 },
  // 비어 있으면 죽이지 않고 폴백한다: report·kakao → 인스타 DM, classes → 공식 노션 (linkFor 참고)
  links: {
    report: "",              // 유료 리포트 결제 (네이버 예약·스마트스토어). 비면 인스타 DM
    classes: LINKS.notion,   // 수업 안내 (공식 노션)
    kakao: "",               // 카카오톡 채널 1:1 문의. 비면 인스타 DM
  },
  leadEndpoint: "", // 구글 Apps Script 웹앱 주소 (lead-collector.gs 배포 후)
  assets: { typeDir: "./assets/types/" }, // 유형 일러스트: {typeDir}{유형 key}.png
};
const isHttps = (u) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);
/* 버튼에 쓸 링크. 비어 있으면 자연스러운 대안으로 바꾼다. via: "link" | "dm" | "notion" */
function linkFor(kind) {
  const L = CONFIG.links;
  if (kind === "report") return isHttps(L.report) ? { url: L.report, label: "유료 리포트 신청", via: "link" } : { url: LINKS.insta, label: "인스타 DM으로 리포트 신청", via: "dm" };
  if (kind === "kakao") return isHttps(L.kakao) ? { url: L.kakao, label: "카카오톡 문의", via: "link" } : { url: LINKS.insta, label: "인스타 DM 문의", via: "dm" };
  if (kind === "classes") return { url: isHttps(L.classes) ? L.classes : LINKS.notion, label: "수업 둘러보기", via: "notion" };
  return { url: LINKS.insta, label: CONFIG.insta, via: "dm" };
}
const typeImage = (key) => CONFIG.assets.typeDir + key + ".png";

/* ═════════ 1. 규칙 ═════════ */
const AXES = [
  { key: "line",    name: "선",   en: "LINE",        left: "러프·스케치",    right: "정돈·클린",
    q: "내 그림의 선은?", lq: "여러 번 겹쳐 긋고 흔적을 남긴다", rq: "한 번에 깔끔하게 정리한다",
    anchor: "0~15 = 연필 크로키처럼 여러 번 겹친 선, 85~100 = 이모티콘처럼 굵기가 일정한 단일 윤곽선" },
  { key: "form",    name: "형태", en: "FORM",        left: "데포르메·단순화", right: "사실·구조",
    q: "사람과 사물의 모양은?", lq: "크게 줄이고 귀엽게 바꾼다", rq: "비율과 구조를 실제에 가깝게 잡는다",
    anchor: "0~15 = 2~3등신, 손발 생략, 85~100 = 해부학 비율과 원근이 정확한 인물" },
  { key: "color",   name: "색",   en: "COLOR",       left: "절제·톤온톤",    right: "대비·고채도",
    q: "색을 고를 때는?", lq: "비슷한 색 몇 개로 조용하게", rq: "보색과 진한 색으로 또렷하게",
    anchor: "0~15 = 흑백이나 한 계열 3색 이하, 85~100 = 원색·보색이 화면 대부분" },
  { key: "texture", name: "질감", en: "TEXTURE",     left: "플랫·디지털",    right: "아날로그·재료감",
    q: "화면의 표면은?", lq: "면을 평평하게 채운다", rq: "종이·붓·연필 결이 보인다",
    anchor: "0~15 = 벡터처럼 균일한 면, 85~100 = 수채 번짐·종이 결·붓자국이 뚜렷" },
  { key: "comp",    name: "구성", en: "COMPOSITION", left: "정적·중앙",      right: "동적·여백·대각",
    q: "한 장을 배치할 때는?", lq: "주인공을 가운데 안정적으로", rq: "치우치거나 기울여 움직임을 만든다",
    anchor: "0~15 = 흰 배경 중앙 단독 캐릭터, 85~100 = 대각 구도·과감한 여백·잘린 프레임" },
  { key: "mood",    name: "정서", en: "MOOD",        left: "담백·관찰",      right: "서사·감정",
    q: "그림이 전하는 건?", lq: "보이는 장면을 차분히 기록", rq: "이야기와 감정이 먼저 보인다",
    anchor: "0~15 = 사물·풍경 관찰 기록, 85~100 = 한 장만 봐도 앞뒤 사건과 감정이 읽힘" },
];

const SIGNALS = [
  { key: "craft",      name: "완성도",       fix: "선 정리와 채색 경계 마감", desc: "선 정리, 채색 경계, 마감이 상업물 수준인가", sq: "마감(선 정리·채색 경계)이 깔끔한 편이다" },
  { key: "character",  name: "캐릭터 고정성", fix: "반복 등장시킬 고정 캐릭터 만들기", desc: "반복 등장시킬 수 있는 알아보기 쉬운 캐릭터가 있는가", sq: "같은 캐릭터를 여러 장 그려 봤고 매번 알아볼 수 있다" },
  { key: "expression", name: "표정·감정 폭", fix: "표정과 몸짓으로 감정 폭 넓히기", desc: "표정과 몸짓으로 감정을 여러 가지로 나눠 보여 주는가", sq: "기쁨·슬픔·화남 같은 표정을 여러 가지로 그릴 수 있다" },
  { key: "narrative",  name: "장면 서사",     fix: "한 장에 앞뒤 이야기 담기", desc: "한 장이 이야기의 한 순간으로 읽히는가", sq: "내 그림 한 장에는 앞뒤 이야기가 있다" },
  { key: "production", name: "상품화 적합",   fix: "윤곽 정리와 작은 크기 식별성", desc: "윤곽이 분명하고 작게 줄여도 알아보며 색 면이 분리되는가 (스티커·인쇄·커팅)", sq: "작게 줄여도 알아볼 수 있고 윤곽이 분명하다" },
];

/* 기본기 8항목 (10점 척도, 그림에서 볼 수 없으면 null = 해당 없음). 형태는 '사실적인가'가 아니라 '고른 그림체 안에서 안정적인가' */
const CRAFT = [
  { key: "drawing", name: "형태 안정감", desc: "고른 그림체 안에서 형태·비율이 흔들리지 않는가 (사실적인지가 아님)",
    digital: "캔버스를 좌우 반전해 보면 어색한 비율이 바로 보여요. 틀어진 곳은 올가미 + '변형 → 휘기'로 고치면 다시 그리지 않아도 돼요." },
  { key: "lineq", name: "선 품질", desc: "선이 정리돼 있고 굵기·끊김이 의도대로인가",
    digital: "브러시의 손떨림 보정(스트림라인)을 올리고 선화 레이어를 따로 두면, 러프는 그대로 두고 선만 다시 그을 수 있어요." },
  { key: "colorh", name: "색 조화", desc: "색끼리 싸우지 않고 한 팔레트로 묶여 있는가 (흑백이면 해당 없음)",
    digital: "마음에 드는 그림에서 스포이트로 5색을 뽑아 팔레트로 저장하고, '색조·채도' 조정으로 전체 톤을 한 번에 맞출 수 있어요." },
  { key: "value", name: "명암·빛", desc: "밝고 어두운 단계로 덩어리와 공간이 보이는가",
    digital: "흑백 확인용 레이어(채도 0)를 맨 위에 켜 두고, 그림자는 곱하기 레이어, 빛은 스크린 레이어로 따로 올리면 언제든 고칠 수 있어요." },
  { key: "compo", name: "구도·배치", desc: "시선이 머물 곳과 흐름, 여백이 계획돼 있는가",
    digital: "작은 캔버스에 썸네일을 여러 개 그린 뒤, 올가미 + 자유 변형으로 주인공 위치를 옮겨 보며 정할 수 있어요. 종이였다면 다시 그려야 했을 일이에요." },
  { key: "finish", name: "마감도", desc: "끝까지 칠했는가, 경계와 디테일이 정리돼 있는가 (미완성은 여기에만 반영)",
    digital: "레이어를 '선·밑색·명암·디테일' 네 장으로 나누면 하루에 한 장씩만 끝내도 완성까지 가요. 마지막에 확대해서 경계만 다듬는 5분을 넣으세요." },
  { key: "digital", name: "디지털 활용", desc: "레이어·브러시·질감 같은 도구의 장점을 쓰고 있는가 (아날로그 그림이면 해당 없음)",
    digital: "브러시는 2~3개만 즐겨찾기로 고정하고, 클리핑 마스크로 칠하면 선 밖으로 안 나가요. 도구를 늘리기보다 줄이는 게 먼저예요." },
  { key: "voice", name: "자기 색", desc: "다른 사람과 구별되는 이 사람만의 선택이 보이는가",
    digital: "잘 나온 그림의 브러시·팔레트·캔버스 크기를 '내 세팅'으로 저장해 두면 매번 같은 출발점에서 그려서 그림체가 빨리 생겨요." },
];
/* 길마다 중요한 기본기 */
const CRAFT_W = {
  picturebook: { colorh: .2, value: .15, compo: .3, finish: .15, voice: .2 },
  emoticon: { lineq: .3, drawing: .25, finish: .3, voice: .15 },
  goods: { lineq: .3, colorh: .2, finish: .35, drawing: .15 },
  instatoon: { drawing: .2, lineq: .2, compo: .2, finish: .2, voice: .2 },
  portfolio: { drawing: .2, colorh: .15, value: .15, compo: .15, finish: .25, voice: .1 },
};
/* 성장 단계: 기본기 평균(10점)으로 정한다. A~D 같은 판정 대신 '지금 어디쯤인지'를 말한다 */
const STAGES = [
  { key: "explore", min: 0, name: "탐색기", line: "손에 익히는 중이에요. 그림 그린 지 얼마 안 됐다면 대부분 여기서 시작해요. 이상한 게 아니라 정상이에요.", next: "도구 하나·주제 하나로 20장 채우기" },
  { key: "base", min: 4.5, name: "기초 다지기", line: "좋아하는 방향은 보이는데, 끝까지 같은 품질로 가는 힘을 기르는 단계예요. 미완성 그림이 많다면 딱 여기예요.", next: "마감 순서를 정해 10장을 '끝까지' 완성하기" },
  { key: "form", min: 6, name: "그림체 형성기", line: "내 그림이라고 부를 만한 선택이 생기고 있어요. 이제 묶음과 일관성이 중요해요.", next: "같은 규칙으로 6장 묶음 만들기" },
  { key: "ready", min: 7.5, name: "상업 준비 단계", line: "상품·외주로 바로 옮길 수 있는 기본기가 있어요. 이제 길과 시장을 고르는 단계예요.", next: "첫 상품 하나를 실제로 팔아 보기" },
];
/* 6축·상업 신호의 약점을 어떤 기본기 팁으로 풀지 */
const TIP_FOR = { line: "lineq", form: "drawing", color: "colorh", texture: "digital", comp: "compo", mood: "voice",
  craft: "finish", character: "voice", expression: "drawing", narrative: "compo", production: "lineq" };

/* 무료·자가 진단용 작업 습관 4문항 → 기본기 점수(답변 기준, 값×2) */
const HABITS = [
  { key: "finish", q: "그리기 시작한 그림을 끝까지 마무리하는 편이다", left: "거의 못 끝내요", right: "대부분 끝내요" },
  { key: "colorh", q: "색을 고를 때 어울리게 고르는 자신이 있다", left: "늘 헤매요", right: "자신 있어요" },
  { key: "compo", q: "그리기 전에 화면 배치·구도를 먼저 생각한다", left: "바로 그려요", right: "먼저 계획해요" },
  { key: "digital", q: "레이어·브러시 저장 같은 디지털 기능을 잘 쓴다", left: "거의 안 써요", right: "잘 써요", na: "아날로그로 그려요" },
];
/* 그림에 대상이 없으면 고를 수 있는 '해당 없음' */
const SIGNAL_NA = { character: "캐릭터를 그리지 않아요", expression: "캐릭터를 그리지 않아요" };

/* target = 6축 목표 위치, w = 6축 가중치, ready = 준비도 가중치 (완성도, 캐릭터, 표정, 서사, 상품화, 일관성) */
const GENRES = [
  { key: "picturebook", name: "그림책", target: [45, 40, 50, 65, 62, 78], w: [.4, .5, .5, .8, .8, 1],
    ready: [.25, .15, .1, .3, 0, .2], product: "픽처포지(그림책반)", extra: "그림책 만들기 자습서 3장 '캐릭터/스타일'부터" },
  { key: "emoticon", name: "이모티콘", target: [76, 15, 66, 22, 32, 80], w: [.8, 1, .5, .7, .4, .6],
    ready: [.1, .25, .45, 0, .1, .1], product: "이모티콘반", extra: "표정 24컷 시트로 선 두께부터 통일" },
  { key: "goods", name: "캐릭터 굿즈", target: [72, 28, 62, 30, 38, 45], w: [1, .8, .6, .7, .4, .5],
    ready: [.2, .3, .05, 0, .3, .15], product: "굿즈반 + 캐릭터 키트", extra: "크리컷 스티커 키트로 첫 샘플 제작" },
  { key: "instatoon", name: "인스타툰", target: [58, 32, 45, 35, 48, 80], w: [.4, .7, .5, .6, .4, 1.4],
    ready: [.1, .25, .2, .3, 0, .15], product: "콘텐츠반(릴스·협찬)", extra: "4컷 3편으로 캐릭터 고정부터" },
  { key: "portfolio", name: "포트폴리오·외주", target: [62, 62, 52, 50, 58, 52], w: [.5, 1.2, .5, .5, .7, .6],
    ready: [.35, .05, .05, .1, .1, .35], product: "포트폴리오반", extra: "같은 그림체로 6장 묶음 만들기" },
];
const MIX = { style: .45, ready: .35, market: .20 };
/* 이모티콘 문턱: 귀엽고 깔끔하다고 이모티콘이 아니다. 대화에 쓰일 표정 폭과 고정 캐릭터가 있어야 한다.
   문턱을 못 넘으면 감점해서 굿즈·그림책 쪽으로 넘긴다. */
const EMOTICON_GATE = { expression: 4, character: 4, line: 62, penalty: { expression: 9, character: 7, line: 5 } };
/* 그림책 만들기 자습서 실제 목차 (4단계) */
const TUTORIAL = [
  { no: 1, title: "기획", does: "누구에게 무슨 이야기를 할지 한 줄로 정하고 16장면의 뼈대를 세워요" },
  { no: 2, title: "글", does: "그림이 말할 것과 글이 말할 것을 나누고, 소리 내어 읽히는 문장으로 다듬어요" },
  { no: 3, title: "캐릭터/스타일", does: "주인공 설정표와 그림체 규칙(선·색·질감)을 고정하고 대표 장면을 완성해요" },
  { no: 4, title: "공모전/투고", does: "더미북과 기획서로 투고 패키지를 만들고 공모전·출판사 일정에 맞춰 보내요" },
];
const TUTORIAL_LINE = TUTORIAL.map(t => `${t.no}.${t.title}`).join(" → ");
// 희망 분야는 다음 프로젝트 선택에만 사용한다.
const ROUTINE = { key: "routine", name: "드로잉 루틴반", why: "위치보다 반복이 먼저예요. 같은 선택을 4주 반복하면 그림체가 생깁니다." };
const GRADE_TXT = { A: "바로 시작할 수 있는 길", B: "3개월 준비하면 열리는 길", C: "기초를 다지면 열리는 길", D: "기초부터 차근차근 쌓을 길" };

const MARKET = {
  picturebook: { attract: 55, asOf: "2026.11",
    size: "2025년 국내 신간 6만 4,991종. 아동 분야 평균 발행 부수는 전년보다 7.4% 줄었어요. 대신 볼로냐 아동도서전에 국내 39개 출판사가 나가는 등 해외 판권 쪽이 커지고 있어요.",
    money: "인세 방식. 흔히 정가의 10%를 글·그림 작가가 나눕니다. 정가 15,000원 책이 3,000부 팔리면 작가 몫은 약 450만 원 (글그림을 혼자 하면 전부).",
    entry: "출판사 투고·공모전. 기획부터 출간까지 1~2년이 흔해서 돈이 늦게 들어와요 (추정).",
    speed: "느림 · 브랜드와 강의 레버리지는 가장 큼",
    first: "더미북 1권 (12~16장면) → 출판사 투고 3곳 + 독립출판 소량 인쇄",
    src: [["출협 2025 출판생산 통계 (뉴시스)", "https://mobile.newsis.com/view/NISX20260529_0003649654"], ["볼로냐아동도서전 K-그림책 (헤럴드경제)", "https://www.heraldk.com/article/2026041217583347719"], ["작가 인세 10% 관행 (경인일보)", "https://www.kyeongin.com/article/1632537"]] },
  emoticon: { attract: 56, asOf: "2026.11",
    size: "카카오 이모티콘 누적 거래 7,000억 원 돌파. 누적 매출 1억 원 이상 이모티콘 2,885개, 10억 원 이상 146개로 보도됐어요. 창작자는 약 1만 명.",
    money: "판매 수익 + 이모티콘 플러스 구독 사용량에 따른 분배. 승인되면 바로 매출이 생겨요.",
    entry: "제안 경쟁이 셉니다. 매주 약 2,000건이 제안되고 100여 건이 출시돼 약 20:1로 보도됐어요.",
    speed: "중간 · 승인까지 반복 제안 필요",
    first: "표정 시안 세트 1종 → 카카오·라인·OGQ 동시 제안",
    src: [["카카오 이모티콘 시장 (조선비즈/다음)", "https://v.daum.net/v/20250530144051820?f=p"], ["7000억 이모티콘 시장 (디아이투데이)", "https://ditoday.com/?p=91918"], ["카카오 이모티콘 10주년 (카카오)", "https://www.kakaocorp.com/page/detail/9609"]] },
  goods: { attract: 65, asOf: "2026.11",
    size: "국내 캐릭터 산업 매출 2024년 7조 958억 원 (2021년 5조 39억 원에서 증가, 문체부 콘텐츠산업조사 인용 보도). 캐릭터 수출도 2025년 12.8% 늘었어요.",
    money: "개당 마진. 재고 부담이 핵심 리스크인데, 3D프린터·크리컷으로 소량 생산하면 재고 없이 시작할 수 있어요.",
    entry: "진입은 쉽고 경쟁이 큽니다. POD 플랫폼 마플샵에만 크리에이터 9만 명 이상 (앱스토어 설명).",
    speed: "빠름 · 첫 판매까지 수주 가능",
    first: "스티커 시트 1종 + 키링 1종 → 플리마켓·마플샵 테스트 판매",
    src: [["캐릭터 산업 7조 958억 (뉴시스)", "https://mobile.newsis.com/view/NISX20260716_0003713011"], ["2025 콘텐츠산업 동향 (아시아경제)", "https://view.asiae.co.kr/article/2026043008302523575"], ["마플샵 (앱스토어)", "https://apps.apple.com/us/app/id1571108536"]] },
  instatoon: { attract: 60, asOf: "2026.11",
    size: "웹툰을 주로 보는 채널로 인스타그램을 꼽은 비중 23.9% (2025 만화산업백서 인용 보도). 뷰티·식품·라이프스타일 브랜드 협업이 늘고 있어요.",
    money: "브랜드 협찬·광고툰 제작. 제작 대행 사례로 컷당 3만 5천~5만 5천 원, 월 4편 패키지 200만 원 (크몽).",
    entry: "팔로워가 쌓여야 협찬이 옵니다. 주 2~3회 연재를 6개월 이상 버티는 게 관건이에요 (추정).",
    speed: "중간 · 연재 지속력이 곧 매출",
    first: "4컷 12편 연재 → 협찬 제안서용 미디어킷",
    src: [["인스타툰 협업 동향 (고구마팜)", "https://gogumafarm.kr/?p=2724"], ["인스타툰 제작 단가 사례 (크몽)", "https://kmong.com/gig/739349"]] },
  portfolio: { attract: 50, asOf: "2026.11",
    size: "외주 일러스트 거래 단가 (크몽 5년 거래 데이터): 간단 캐릭터 2만 원, 배경 포함 12만 원, 브랜딩·복잡 33만 원 이상. 숨고 평균 건당 10만 원.",
    money: "건당·시간 노동형. 단가는 포트폴리오의 일관성과 전문 분야가 정해요.",
    entry: "플랫폼 진입은 쉽지만 저가 경쟁이 심해요. 같은 그림체 6장 이상 묶음이 있어야 단가를 올릴 수 있어요 (추정).",
    speed: "빠름 · 대신 시간을 파는 구조",
    first: "한 분야(출판·브랜드·교육) 포트폴리오 6장 → 크몽 등록 + 출판사 메일 10곳",
    src: [["일러스트 가격 데이터 (크몽)", "https://kmong.com/prices/%EC%9D%BC%EB%9F%AC%EC%8A%A4%ED%8A%B8"], ["일러스트 디자인 평균 비용 (숨고)", "https://soomgo.com/a.%EB%B6%80%EC%82%B0-%EB%8F%99%EA%B5%AC/%EC%9D%BC%EB%9F%AC%EC%8A%A4%ED%8A%B8-%EB%94%94%EC%9E%90%EC%9D%B8"]] },
};

const RX_LIB = {
  line:    { title: "선 한 가지로 7일", how: "브러시 1종·두께 1종으로 매일 사물 3개. 지우개 없이 그린다." },
  form:    { title: "도형 3개로 줄이기", how: "주인공을 원·사각·삼각 3개 도형으로만 다시 그려 비율을 고정한다." },
  color:   { title: "팔레트 4색 고정", how: "주색 1, 보조 2, 포인트 1. 2주 동안 이 4색 밖으로 나가지 않는다." },
  texture: { title: "표면 하나 정하기", how: "플랫이든 연필 결이든 하나만 골라 7장 연속 같은 브러시 세팅으로." },
  comp:    { title: "썸네일 9칸", how: "같은 장면을 3×3 작은 칸에 배치만 바꿔 9번. 가장 마음에 드는 것만 완성." },
  mood:    { title: "한 줄 문장 먼저", how: "그리기 전에 장면의 감정을 한 문장으로 적고, 그 문장에 맞는 표정만 남긴다." },
  craft:      { title: "마감 체크 5분", how: "완성 전 윤곽 끊김·삐져나온 채색·지저분한 경계 3곳을 찾아 고치고 끝낸다." },
  character:  { title: "턴어라운드 1장", how: "주인공을 앞·옆·뒤·3/4 네 방향으로 그려 특징 3가지를 고정한다." },
  expression: { title: "표정 12칸", how: "같은 캐릭터로 기쁨·슬픔·화남·놀람 등 12표정을 한 장에. 눈썹과 입만 바꾼다." },
  narrative:  { title: "앞뒤 한 컷씩", how: "완성한 그림의 바로 앞 장면과 뒷장면을 러프로 한 컷씩 그려 세 컷으로 만든다." },
  production: { title: "2cm 테스트", how: "그림을 2cm로 줄여 출력해 알아보는지 확인하고, 안 보이는 디테일은 지운다." },
  drawing: { title: "반전 체크 10장", how: "그릴 때마다 캔버스를 좌우 반전해 어색한 비율을 바로 고친다. 10장 연속." },
  lineq: { title: "선화 따로 긋기", how: "러프 위에 새 레이어를 만들고 손떨림 보정을 올린 뒤, 한 번에 긋는 선으로만 선화를 다시 그린다. 5장." },
  colorh: { title: "팔레트 5색 저장", how: "좋아하는 그림에서 5색을 뽑아 저장하고 2주 동안 그 안에서만 칠한다." },
  value: { title: "흑백 3단계", how: "채색 전에 밝음·중간·어둠 세 가지 회색으로만 칠해 덩어리를 먼저 잡는다. 5장." },
  compo: { title: "주인공 자리 정하기", how: "화면을 3등분한 선 위에 주인공을 두고, 시선이 향하는 쪽에 여백을 남긴다. 5장." },
  finish: { title: "끝내는 4단계", how: "선 → 밑색 → 명암 → 디테일 레이어로 나누고 하루에 한 단계씩이라도 끝까지 간다. 완성작 5장." },
  digital: { title: "내 세팅 저장", how: "브러시 3개·팔레트 1개·캔버스 크기를 정해 저장하고 2주 동안 그것만 쓴다." },
  voice: { title: "좋아하는 것 3가지", how: "마음에 드는 내 그림 3장의 공통점 3가지를 적고, 다음 그림에 일부러 넣는다." },
};

/* ═════════ 2. 그림체 유형 8종 (선 · 형태 · 정서) ═════════ */
const TYPES = {
  "clean-deform-story": { name: "표정 부자 캐릭터 작가", hook: "한 컷만 봐도 무슨 말을 하는지 들리는 그림", desc: "깔끔한 선, 크게 줄인 형태, 감정이 먼저 보이는 그림이에요. 캐릭터 하나로 여러 장면을 끌고 갈 힘이 있어요." },
  "clean-deform-observe": { name: "단정한 마스코트 메이커", hook: "어디에 붙여도 그 자리에 어울리는 그림", desc: "정돈된 선과 단순한 형태, 차분한 분위기예요. 물건 위에서 빛나는 타입이라 굿즈·브랜드 작업과 잘 맞아요." },
  "clean-real-story": { name: "장면을 설계하는 연출가", hook: "구도부터 감정까지 계산된 한 장", desc: "정확한 형태 위에 이야기를 올리는 그림이에요. 장면 연출력이 강점이라 그림책·출판 일러스트에서 힘을 써요." },
  "clean-real-observe": { name: "정확한 기록자", hook: "보이는 그대로를 가장 깔끔하게", desc: "비율과 마감이 단단한 관찰형 그림이에요. 신뢰가 중요한 외주·교육·정보 일러스트에서 단가를 받기 좋아요." },
  "rough-deform-story": { name: "낙서로 이야기하는 이야기꾼", hook: "대충 그린 것 같은데 자꾸 보게 되는 그림", desc: "자유로운 선과 단순한 형태로 이야기를 던지는 그림이에요. 연재·에세이·그림책 쪽에서 팬이 생기는 타입이에요." },
  "rough-deform-observe": { name: "생활 드로잉 수집가", hook: "오늘 본 것을 가볍게 모아 두는 그림", desc: "손맛 있는 선으로 일상을 단순하게 기록해요. 꾸준히 쌓이면 그 자체가 브랜드가 되는 타입이에요." },
  "rough-real-story": { name: "손맛 짙은 그림책 화가", hook: "종이 냄새가 나는 장면", desc: "재료감 있는 선과 사실적 형태로 감정을 깊게 그려요. 그림책·원화 전시처럼 '한 장의 무게'가 중요한 곳에서 빛나요." },
  "rough-real-observe": { name: "크로키하는 관찰자", hook: "빠르게, 정확하게, 살아 있게", desc: "관찰력과 손의 속도가 강점인 그림이에요. 기초가 탄탄해서 어떤 길로든 방향을 틀기 쉬운 타입이에요." },
};
const TYPE_PROFILE = {
  "clean-deform-story": { strengths: ["감정을 한 컷에 압축하는 힘", "캐릭터 하나로 여러 상황을 끌고 가는 힘", "작은 화면에서도 읽히는 선"],
    pitfalls: ["귀여움에 기대다 장면 설계가 약해지기 쉬워요", "표정은 많은데 이야기가 매번 처음으로 돌아갈 수 있어요"],
    worries: ["캐릭터는 좋다는데 그다음이 없어요", "이모티콘·굿즈·연재 중 뭘 먼저 할지 모르겠어요"],
    tools: "굵기가 고정된 모노라인 브러시, 단색 면 채우기", firstProject: "같은 캐릭터 12표정 시트 → 4컷 1편", pair: "clean-real-story",
    growth: ["캐릭터 설정표로 얼굴·비율 고정", "감정을 상황으로 바꾸는 연재 습관", "한 캐릭터를 굿즈·이모티콘·그림책으로 확장"] },
  "clean-deform-observe": { strengths: ["어디에 놓아도 깨지지 않는 형태", "브랜드가 좋아하는 정돈된 톤", "인쇄·커팅에 강한 윤곽"],
    pitfalls: ["무난함이 개성 부족으로 읽힐 수 있어요", "감정 표현이 얌전해서 팬이 늦게 생겨요"],
    worries: ["예쁘다는데 기억에 안 남는대요", "브랜드 외주와 내 작업 사이에서 고민돼요"],
    tools: "벡터 느낌의 매끈한 브러시, 색 면 분리, 4~5색 팔레트", firstProject: "마스코트 1종 + 포즈 6종 스티커 시트", pair: "rough-deform-story",
    growth: ["마스코트 규칙(비율·색·표정 범위) 정하기", "포즈 6종 굿즈 라인업", "브랜드 협업 포트폴리오"] },
  "clean-real-story": { strengths: ["구도로 감정을 만드는 힘", "정확한 형태 위에 얹는 이야기", "펼침면·포스터처럼 큰 화면에 강함"],
    pitfalls: ["한 장에 공을 너무 들여 속도가 느려요", "캐릭터가 장면마다 조금씩 달라지기 쉬워요"],
    worries: ["완성까지 너무 오래 걸려요", "내 그림이 상업적인지 모르겠어요"],
    tools: "작은 썸네일 구도 스케치, 원근 가이드, 제한 팔레트", firstProject: "16장면 썸네일 스토리보드", pair: "clean-deform-story",
    growth: ["썸네일로 구도 속도 올리기", "주인공 설정표 고정", "그림책·출판 일러스트로 연결"] },
  "clean-real-observe": { strengths: ["믿음직한 비율과 구조", "어떤 스타일로도 바꿀 수 있는 기초", "정보·교육 그림에 바로 쓰이는 정확함"],
    pitfalls: ["정확하지만 '내 그림'이라는 인상이 약할 수 있어요", "감정이 덜 보여 SNS 반응이 느려요"],
    worries: ["잘 그리는데 개성이 없대요", "외주 단가를 못 올리겠어요"],
    tools: "펜 선 + 플랫 채색, 사진 없이 기억으로 다시 그리기", firstProject: "한 분야(교육·출판) 포트폴리오 6장", pair: "rough-deform-story",
    growth: ["분야 하나 정하기", "같은 그림체 6장 묶음", "단가 3단계 가격표"] },
  "rough-deform-story": { strengths: ["힘을 뺀 선의 친근함", "아이디어가 빨리 그림이 되는 속도", "말투처럼 들리는 그림"],
    pitfalls: ["작게 줄이면 선이 지저분해 보여요", "매번 그림체가 달라지기 쉬워요"],
    worries: ["대충 그린 것 같다는 말을 들어요", "굿즈로 만들면 느낌이 안 살아요"],
    tools: "연필·크레용 브러시, 지우개 없이 그리기", firstProject: "주 3회 4컷 연재 12편", pair: "clean-deform-observe",
    growth: ["말투 같은 선을 지키면서 굵기만 고정", "연재 포맷 하나로 고정", "에세이·그림책으로 묶기"] },
  "rough-deform-observe": { strengths: ["일상을 빠르게 그림으로 옮기는 손", "꾸준히 쌓이면 브랜드가 되는 기록", "부담 없는 따뜻함"],
    pitfalls: ["한 장 한 장이 작품보다 메모처럼 보일 수 있어요", "주제가 흩어지기 쉬워요"],
    worries: ["그림은 많은데 팔 게 없어요", "어디서부터 상품이 되는지 모르겠어요"],
    tools: "작은 스케치북 또는 연필 브러시, 하루 1장 기록", firstProject: "주제 하나로 30일 드로잉 묶음", pair: "clean-real-story",
    growth: ["주제 하나로 묶기", "30장 아카이브", "엽서·진·에세이북"] },
  "rough-real-story": { strengths: ["재료감 있는 원화의 무게", "감정의 깊이", "따라 하기 어려운 손맛"],
    pitfalls: ["한 장 완성에 시간이 오래 걸려요", "스캔·인쇄하면 느낌이 줄어들 수 있어요"],
    worries: ["원화는 좋은데 디지털로 옮기면 달라져요", "작업 속도가 안 나요"],
    tools: "수채·과슈·색연필, 스캔 세팅 고정", firstProject: "더미북 12~16장면 러프", pair: "clean-deform-observe",
    growth: ["재료 규칙 고정", "더미북 1권", "원화 전시·그림책 투고"] },
  "rough-real-observe": { strengths: ["빠르고 정확한 관찰", "살아 있는 선", "방향을 바꾸기 쉬운 기초 체력"],
    pitfalls: ["기초가 좋아서 오히려 방향을 못 정해요", "완성작보다 연습장이 많아요"],
    worries: ["뭘 그려야 할지 모르겠어요", "연습만 하다 끝나요"],
    tools: "크로키 연필·목탄 브러시, 타이머 드로잉", firstProject: "같은 인물 크로키 10장 → 완성작 1장", pair: "clean-deform-story",
    growth: ["완성작 비율 늘리기", "주제 정하기", "그림체 굳히기"] },
};
const oppositeKey = (k) => k.split("-").map(x => ({ clean: "rough", rough: "clean", deform: "real", real: "deform", story: "observe", observe: "story" }[x])).join("-");
function typeOf(s) {
  const k = [s.axes.line.position >= 50 ? "clean" : "rough", s.axes.form.position < 50 ? "deform" : "real", s.axes.mood.position > 50 ? "story" : "observe"].join("-");
  const P = TYPE_PROFILE[k];
  return { key: k, ...TYPES[k], ...P, pairName: TYPES[P.pair].name, opposite: oppositeKey(k), oppositeName: TYPES[oppositeKey(k)].name };
}

/* ═════════ 3. 계산 ═════════ */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const avg = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
function hasBatchim(word) {
  const m = String(word).match(/[가-힣](?=[^가-힣]*$)/);
  if (!m) return false;
  return (m[0].charCodeAt(0) - 0xAC00) % 28 !== 0;
}
const josa = (w, withB, noB) => w + (hasBatchim(w) ? withB : noB);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const styleDist = (g, pos) => { let n = 0, d = 0; pos.forEach((p, i) => { n += g.w[i] * Math.abs(p - g.target[i]); d += g.w[i]; }); return n / d; };
/* 그림체 분포(평균 50, 표준편차 22)에서 길마다 거리의 평균·편차를 구해 표준점수로 바꾼다. 가운데 목표를 가진 길이 무조건 유리해지는 쏠림을 없앤다. */
const CAL = (() => { const r = rng(7); return GENRES.map(g => { let s = 0, s2 = 0; const N = 4000;
  for (let i = 0; i < N; i++) { const p = AXES.map(() => clamp(50 + 22 * gauss(r), 0, 100)); const d = styleDist(g, p); s += d; s2 += d * d; }
  const m = s / N; return { m, sd: Math.sqrt(s2 / N - m * m) }; }); })();
/* 길의 준비도 가중치 (scorePaths 결과의 ready는 점수라서 원본 규칙에서 읽는다) */
const readyW = (p) => GENRES.find(g => g.key === p.key).ready;
/* 상업 신호: 기록이 없으면 3(옛 기록 호환), 명시적 null이면 '해당 없음' */
const sigScore = (s, k) => { const o = s.signals && s.signals[k]; if (!o) return 3; if (o.score === null) return null; return o.score != null ? o.score : 3; };
const craftVal = (s, k) => { const o = s.craft && s.craft[k]; const v = o && typeof o === "object" ? o.score : o; return Number.isFinite(v) ? v : null; };
function craftIndex(s) { const v = CRAFT.map(c => craftVal(s, c.key)).filter(x => x != null); return v.length ? avg(v) : null; }
function stageOf(s) {
  const ci = craftIndex(s); if (ci == null) return null;
  let st = STAGES[0]; STAGES.forEach(x => { if (ci >= x.min) st = x; });
  const n = CRAFT.filter(c => craftVal(s, c.key) != null).length;
  // 답변만으로는 '상업 준비 단계'를 주지 않는다: 그림을 보고 확인해야 열리는 단계
  const selfCap = s.mode === "self" && st.key === "ready";
  if (selfCap) st = Object.assign({}, STAGES[2], { line: STAGES[2].line + " 답변으로는 여기까지만 판정해요. 상업 준비 단계인지는 실제 그림을 봐야 알 수 있어요." });
  return Object.assign({}, st, { index: Math.round(ci * 10) / 10, items: n, selfCap, basis: s.mode === "self" ? "답변 기준" : "그림 기준" });
}

function scorePaths(s) {
  const pos = AXES.map(a => s.axes[a.key].position);
  let list;
  const consAvg = avg(AXES.map(a => s.axes[a.key].consistency));
  const consW = s.mixedSubjects ? .5 : 1;
  const st = stageOf(s);
  const gradeCap = st ? { explore: "C", base: "B", form: "A", ready: "A" }[st.key] : null; // 탐색기 최대 C, 기초 다지기 최대 B
  list = GENRES.map((g, i) => {
    const style = Math.round(clamp(50 + 18 * (CAL[i].m - styleDist(g, pos)) / CAL[i].sd, 0, 100));
    let num = 0, den = 0;
    SIGNALS.forEach((x, j) => { const v = sigScore(s, x.key); if (v == null) return; num += g.ready[j] * (v - 1) / 4 * 100; den += g.ready[j]; });
    num += g.ready[5] * consW * (consAvg - 1) / 4 * 100; den += g.ready[5] * consW;
    const sigReady = den ? num / den : 50;
    let cn = 0, cd = 0;
    Object.entries(CRAFT_W[g.key]).forEach(([k, w]) => { const v = craftVal(s, k); if (v == null) return; cn += w * (v - 1) / 9 * 100; cd += w; });
    const ready = Math.round(cd ? .5 * sigReady + .5 * (cn / cd) : sigReady);
    const market = MARKET[g.key].attract;
    let total = MIX.style * style + MIX.ready * ready + MIX.market * market;
    const gate = [];
    if (g.key === "emoticon") {
      const G = EMOTICON_GATE;
      const ex = sigScore(s, "expression"), ch = sigScore(s, "character"); // 캐릭터가 없으면(null) 이모티콘 문턱은 넘지 못한다
      if (ex == null || ex < G.expression) { total -= G.penalty.expression; gate.push(ex == null ? "캐릭터 없음" : "표정 폭"); }
      if (ch == null || ch < G.character) { total -= G.penalty.character; if (ch != null) gate.push("캐릭터 고정성"); }
      // 선의 표현 방식은 완성도나 작은 화면에서의 가독성을 뜻하지 않는다.
    }
    const isGoal = s.goal === g.key;
    const bonus = 0;
    const base = Math.round(clamp(total, 0, 100));
    total = Math.round(clamp(total + bonus, 0, 100));
    let grade = total >= 75 ? "A" : total >= 62 ? "B" : total >= 50 ? "C" : "D";
    const capped = gradeCap && grade < gradeCap; // "A" < "B" < "C" < "D"
    if (capped) grade = gradeCap;
    return { ...g, style, ready, market, base, bonus, total, grade, capped, gate, isGoal, priority: false, scoreRank: 0 };
  }).sort((a, b) => b.total - a.total || b.style - a.style);
  list.forEach((p, i) => { p.scoreRank = i + 1; });
  return list;
}

function recommendation(s, paths) {
  const cons = avg(AXES.map(a => s.axes[a.key].consistency));
  const top = paths[0];
  const goal = paths.find(p => p.key === s.goal);
  if (cons < 2.6) {
    if (goal) return { title: goal.product, classKey: goal.key, line: `${josa(goal.name, "으로", "로")} 가는 길은 열려 있어요. 다만 지금은 그림이 장마다 달라서, 수업 첫 4주는 그림체를 고정하는 루틴 과제로 시작해요.`, then: `루틴 4주 뒤 ${goal.name} 기준으로 재진단`, target: goal };
    return { title: ROUTINE.name, classKey: "routine", line: ROUTINE.why, then: `루틴 4주 뒤 ${top.name} 쪽으로 다시 진단`, target: top };
  }
  if (goal && goal.key !== top.key) {
    if (goal.total >= top.total - 8) return { title: goal.product, classKey: goal.key, line: `하고 싶은 ${josa(goal.name, "과", "와")} 지금 그림이 충분히 가까워요 (${goal.total}점, ${goal.grade}등급).`, then: goal.extra, target: goal };
    return { title: goal.product, classKey: goal.key, line: `하고 싶은 ${josa(goal.name, "은", "는")} 프로젝트로 골랐어요. 추천 분야 ${top.name}에서 이미 가진 강점을 ${josa(goal.name, "으로", "로")} 옮기면 거리가 빨리 줄어요.`, then: `리포트의 '${top.name}에서 ${goal.name}으로 가는 다리'부터`, target: goal };
  }
  if (goal && goal.key === top.key) return { title: goal.product, classKey: goal.key, line: `하고 싶은 ${josa(goal.name, "이", "가")} 지금 그림에도 가장 잘 맞아요 (${goal.total}점, ${goal.grade}등급 · ${GRADE_TXT[goal.grade]}).`, then: goal.extra, target: goal };
  return { title: top.product, classKey: top.key, line: `지금 그림에 가장 맞는 길은 ${josa(top.name, "이에요", "예요")} (${top.total}점, ${top.grade}등급 · ${GRADE_TXT[top.grade]}).`, then: top.extra, target: top };
}
function gapsFor(s, g) {
  const out = [];
  AXES.forEach((a, i) => {
    const d = g.target[i] - s.axes[a.key].position;
    if (Math.abs(d) >= 22 && g.w[i] >= .5) out.push(`${a.name}: 지금 ${s.axes[a.key].position} → ${g.name}에 맞는 위치 ${g.target[i]} 근처 (${d > 0 ? a.right : a.left} 쪽으로)`);
  });
  SIGNALS.forEach((x, j) => {
    const v = sigScore(s, x.key);
    if (v != null && v <= 2 && readyW(g)[j] >= .2) out.push(`${x.name} ${v}/5 → ${x.fix}`);
  });
  return out.slice(0, 4);
}
function judgeItems(s) {
  const mixed = !!s.mixedSubjects;
  return AXES.map(a => ({ key: a.key, name: a.name + (mixed ? " 습관" : ""), v: s.axes[a.key].consistency, raw: s.axes[a.key].consistency, max: 5, kind: "axis" }))
    .concat(SIGNALS.map(x => { const v = sigScore(s, x.key); return { key: x.key, name: x.name, v, raw: v, max: 5, kind: "signal" }; }).filter(x => !(x.key === "craft" && craftVal(s, "finish") != null)))
    .concat(CRAFT.map(c => { const v = craftVal(s, c.key); return { key: c.key, name: c.name, v: v == null ? null : v / 2, raw: v, max: 10, kind: "craft" }; }))
    .filter(x => x.v != null);
}
const fmtScore = (x) => `${x.raw}/${x.max}`;
function weakest(s, n) {
  const all = judgeItems(s);
  const strongKeys = all.length > 4 ? strongest(s, 2).map(x => x.key) : [];
  return all.filter(x => !strongKeys.includes(x.key)).sort((a, b) => a.v - b.v || (a.kind === "craft" ? -1 : 1)).slice(0, n);
}
/* 강점은 항상 찾아 준다. 절대 점수가 낮아도 그 사람 안에서 가장 나은 곳 */
function strongest(s, n) {
  const all = judgeItems(s).sort((a, b) => b.v - a.v || (a.kind === "craft" ? -1 : 1));
  // 축의 일관성은 '흑백만 쓴다' 같은 이유로도 높게 나와서, 기본기·상업 신호에서 먼저 찾고 모자랄 때만 축을 쓴다
  // 그리고 그 사람 평균보다 높은 항목만 '강점'이라 부른다 (거의 안 쓰는 기능을 강점이라 하지 않게)
  const mean = all.length ? avg(all.map(x => x.v)) : 0;
  const above = all.filter(x => x.v > mean);
  const primary = above.filter(x => x.kind !== "axis"), axes = above.filter(x => x.kind === "axis");
  const rest = all.filter(x => !above.includes(x));
  const picked = [];
  primary.concat(axes, rest).forEach(x => {
    // 같은 주제(예: 기본기 '색 조화'와 축 '색')는 하나만
    const topic = x.kind === "axis" ? TIP_FOR[x.key] : x.key;
    if (picked.length < n && !picked.some(p => (p.kind === "axis" ? TIP_FOR[p.key] : p.key) === topic)) picked.push(x);
  });
  return picked;
}
/* 강점 설명: 절대 점수가 낮으면 칭찬하지 않고 '상대적으로 앞서 있다'고 말한다 */
function strengthWhy(x) {
  const good = x.v >= 3.5; // 7/10, 4/5 이상
  if (x.kind === "craft") { const d = CRAFT.find(c => c.key === x.key).desc.replace(/\s*\(.*\)$/, ""); return good ? `${d}. 이 부분은 이미 괜찮아요.` : `${d}. 다른 항목보다 앞서 있어요. 여기서 시작하면 가장 빨리 늘어요.`; }
  if (x.kind === "signal") return good ? SIGNAL_GUIDE[x.key].high.split(". ")[0] + "." : `${x.name}이 다른 신호보다 앞서 있어요. 이 방향으로 한 장 더 그려 보세요.`;
  return good ? "이 축의 선택은 이미 손에 붙었어요. 바꾸지 말고 무기로 쓰세요." : "이 축부터 하나로 고정하면 그림체가 가장 빨리 생겨요. 지금 점수가 가장 덜 흔들리는 쪽이에요.";
}
function digitalTips(s, n) {
  const out = [];
  weakest(s, 8).forEach(w => { const k = w.kind === "craft" ? w.key : TIP_FOR[w.key]; const c = CRAFT.find(x => x.key === k); if (c && !out.some(o => o.key === c.key)) out.push({ key: c.key, name: c.name, for: w.name, tip: c.digital }); });
  return out.slice(0, n);
}
function summarize(s) {
  const pick = (k, l, r) => s.axes[k].position >= 55 ? r : s.axes[k].position <= 45 ? l : null;
  const adj = pick("line", "자유로운 선의", "단정한 선의") || pick("texture", "평면적인", "손맛 있는") || "균형 잡힌";
  const noun = pick("mood", "관찰자", "이야기꾼") || pick("form", "캐릭터 메이커", "묘사가") || "실험가";
  const mid = pick("color", "담백한", "선명한") || pick("comp", "차분한", "역동적인") || "";
  return [adj, mid, noun].filter(Boolean).join(" ");
}
const sideOf = (a, v) => v <= 40 ? a.left : v >= 60 ? a.right : "중간";

/* ═════════ 4. 본인 체크 + AI 합치기 ═════════ */
const MERGE = { position: .6, consistency: .5, signal: .6 }; // AI 비중
const AGREE_TXT = { hi: "높음", mid: "보통", lo: "낮음" };
function computeGaps(s) {
  const src = s.sources; if (!src || !src.ai || !src.self) return null;
  const items = [], dA = [], dS = [];
  AXES.forEach(a => {
    const A = src.ai.axes[a.key].position, S = src.self.axes[a.key] && src.self.axes[a.key].position;
    if (S == null) return; const d = Math.abs(A - S); dA.push(d);
    if (d >= 25) items.push({ kind: "axis", key: a.key, name: a.name, ai: A, self: S, diff: d, w: d });
  });
  SIGNALS.forEach(x => {
    const A = src.ai.signals[x.key], S = src.self.signals[x.key];
    if (S == null || A == null) return; const d = Math.abs(A - S); dS.push(d);
    if (d >= 2) items.push({ kind: "signal", key: x.key, name: x.name, ai: A, self: S, diff: d, w: d * 20 });
  });
  if (!dA.length && !dS.length) return null;
  const score = Math.round(clamp(100 - (dA.length ? avg(dA) : 0) * 1.6 - (dS.length ? avg(dS) : 0) * 12, 0, 100));
  items.sort((x, y) => y.w - x.w);
  return { score, level: score >= 75 ? "hi" : score >= 55 ? "mid" : "lo", items };
}
function gapSentence(it) {
  if (it.kind === "axis") {
    const a = AXES.find(x => x.key === it.key);
    const sS = sideOf(a, it.self), sA = sideOf(a, it.ai);
    const head = `${a.name}: 본인은 ${sS}(${it.self}), 그림은 ${sA}(${it.ai})`;
    const tail = sS !== sA && sS !== "중간" && sA !== "중간" ? "선택한 방향과 제출 그림이 달라요. 제작 단계와 표현 의도를 확인해 보세요." : "방향은 비슷한데 정도 차이가 커요.";
    return { head, tail };
  }
  const head = `${it.name}: 본인 ${it.self}/5 · 그림 ${it.ai}/5`;
  const tail = it.self > it.ai ? "스스로 더 높게 답했어요. 제출한 작업이 평소 작업을 대표하는지 함께 확인해 보세요." : "그림이 본인 생각보다 나아요. 강점으로 써도 됩니다.";
  return { head, tail };
}
function buildResult(base, ai, self) {
  const s = ai ? JSON.parse(JSON.stringify(ai)) : { axes: {}, signals: {}, rx: [] };
  s.name = base.name; s.goal = base.goal; s.isSample = false;
  s.mode = ai && self ? "both" : ai ? "ai" : "self";
  s.sources = {
    ai: ai ? { axes: Object.fromEntries(AXES.map(a => [a.key, { position: ai.axes[a.key].position, consistency: ai.axes[a.key].consistency }])), signals: Object.fromEntries(SIGNALS.map(x => [x.key, ai.signals[x.key].score])) } : null,
    self: self ? { axes: Object.fromEntries(AXES.map(a => [a.key, Object.assign({}, self.axes[a.key])])), signals: Object.assign({}, self.signals) } : null,
  };
  AXES.forEach(a => {
    const A = ai && ai.axes[a.key], S = self && self.axes[a.key];
    if (A) {
      const pos = S && S.position != null ? Math.round(MERGE.position * A.position + (1 - MERGE.position) * S.position) : A.position;
      const cons = S && S.consistency != null ? Math.round(MERGE.consistency * A.consistency + (1 - MERGE.consistency) * S.consistency) : A.consistency;
      s.axes[a.key] = { position: pos, consistency: clamp(cons, 1, 5), evidence: A.evidence };
    } else {
      s.axes[a.key] = { position: S.position, consistency: S.consistency, evidence: `본인 응답: ${sideOf(a, S.position)} 쪽, 일관성 ${S.consistency}/5` };
    }
  });
  SIGNALS.forEach(x => {
    const A = ai && ai.signals[x.key] ? ai.signals[x.key].score : undefined, S = self ? self.signals[x.key] : undefined;
    const note = ai && ai.signals[x.key] ? ai.signals[x.key].note : "본인 응답";
    let score;
    if (A != null && S != null) score = clamp(Math.round(MERGE.signal * A + (1 - MERGE.signal) * S), 1, 5);
    else if (A != null) score = A;
    else if (S != null) score = S; // 그림엔 없지만(예: 캐릭터 없는 그림) 본인은 그린다고 답한 경우
    else score = null;            // 그림에도 답에도 없으면 해당 없음
    s.signals[x.key] = { score, note: A === null && S == null ? "이 그림들에서는 볼 수 없어서 평가하지 않았어요" : note };
  });
  s.craft = {};
  CRAFT.forEach(c => {
    const A = ai && ai.craft && ai.craft[c.key] ? ai.craft[c.key].score : null, S = self && self.craft ? self.craft[c.key] : null;
    let score = null;
    if (Number.isFinite(A) && Number.isFinite(S)) score = Math.round(.7 * A + .3 * S);
    else if (Number.isFinite(A)) score = A; else if (Number.isFinite(S)) score = S;
    s.craft[c.key] = { score, note: ai && ai.craft && ai.craft[c.key] ? ai.craft[c.key].note || "" : (Number.isFinite(S) ? "본인 응답" : "") };
  });
  if (ai) { s.mixedSubjects = !!ai.mixedSubjects; s.images = ai.images || []; }
  if (!ai) {
    s.summary = summarize(s);
    s.strengths = strongest(s, 2).map(x => `• ${x.name}: ${fmtScore(x)}`).join("\n");
    const weak = weakest(s, 3);
    s.blockers = weak.slice(0, 2).map(w => `• ${josa(w.name, "이", "가")} 아직 약해요 (${fmtScore(w)})`).join("\n");
    s.rx = [];
    weakest(s, 8).forEach(w => { const r = RX_LIB[w.key]; if (r && s.rx.length < 3 && !s.rx.some(x => x.title === r.title)) s.rx.push(Object.assign({}, r)); });
  }
  const g = computeGaps(s);
  const topAxis = g && g.items.find(it => it.kind === "axis");
  if (topAxis && !s.rx.some(r => r.title === RX_LIB[topAxis.key].title)) {
    s.rx = [{ title: RX_LIB[topAxis.key].title, how: `${RX_LIB[topAxis.key].how} (본인 생각과 그림이 ${topAxis.diff}점 달라서 1순위)` }].concat(s.rx).slice(0, 3);
  }
  return s;
}

/* ═════════ 5. 장문 리포트 문장 라이브러리 ═════════ */
const AXIS_GUIDE = {
  line: { left: "러프한 선은 그림에 '사람 손'을 남겨요. 그림책·에세이 삽화·원화 전시에서는 이게 곧 개성이 됩니다. 대신 작게 줄이면 지저분해 보여서 스티커·이모티콘처럼 작은 화면에서는 손해를 봐요.",
          mid: "선이 러프와 클린 사이에 있어요. 장면에 따라 골라 쓸 수 있다는 장점이 있지만, 아직 '이 사람 선'이라고 부를 만한 기준이 없다는 뜻이기도 해요.",
          right: "정돈된 선은 바로 상품이 되는 선이에요. 굿즈·이모티콘·브랜드 작업에서 손이 덜 가고, 인쇄·커팅 사고도 적어요. 대신 감정의 떨림이 줄어서 그림책에서는 차갑게 읽힐 수 있어요.",
          drill: "같은 사물 하나를 '한 번에 긋기'와 '세 번 겹쳐 긋기'로 각각 10번 그려 보고, 어느 쪽이 내 그림 같은지 고르세요. 고른 쪽 브러시 설정을 저장해 2주간 그것만 씁니다." },
  form: { left: "크게 줄인 형태는 캐릭터의 기본기예요. 2~3등신 비율은 귀여움을 만들고, 작은 크기에서도 실루엣이 살아 있어 굿즈·이모티콘에 유리합니다.",
          mid: "형태가 단순화와 사실 사이에 있어요. 범용성은 좋지만, 보는 사람이 '귀엽다'와 '잘 그렸다' 중 어느 쪽으로 기억할지 아직 정해지지 않았어요.",
          right: "구조를 잡는 형태는 신뢰를 줘요. 교육·정보 일러스트, 출판 삽화, 외주에서 단가를 받기 좋고, 어떤 스타일로도 바꿀 수 있는 기초 체력이 됩니다.",
          drill: "주인공을 원·사각·삼각 세 도형으로만 다시 그린 뒤, 그 도형 비율을 숫자로 적어 두세요 (예: 머리 1 : 몸 1.2). 이 숫자가 캐릭터 설정표의 첫 줄이에요." },
  color: { left: "절제된 색은 분위기를 오래 끌고 가요. 그림책·에세이처럼 여러 장이 이어지는 작업에서 피로감이 적고, '그 사람 톤'으로 기억되기 쉬워요.",
           mid: "색이 절제와 대비 사이에 있어요. 장면마다 색 전략이 달라지고 있을 가능성이 커요.",
           right: "선명한 대비는 스크롤을 멈추게 해요. 인스타·굿즈·이모티콘처럼 작은 화면에서 눈에 띄는 데 유리하지만, 여러 장이 이어지면 쉽게 피곤해질 수 있어요.",
           drill: "지금까지 그린 그림 10장에서 가장 많이 쓴 색 4개를 스포이트로 뽑아 팔레트로 고정하세요. 2주 동안 그 4색 밖으로 나가지 않는 게 규칙이에요." },
  texture: { left: "플랫한 면은 복제와 상품화에 강해요. 인쇄·커팅·애니메이션으로 옮길 때 손실이 거의 없어요.",
             mid: "질감이 플랫과 아날로그 사이에 있어요. 한 화면 안에서 섞여 있으면 '두 사람이 그린 그림'처럼 보일 수 있어요.",
             right: "재료감은 '원화의 가치'를 만들어요. 그림책·전시·아트 프린트처럼 한 장의 무게가 중요한 곳에서 강하고, 따라 하기 어려운 차별점이 됩니다.",
             drill: "브러시 세팅을 하나만 저장하고 7장을 연속으로 그리세요. 배경과 인물이 같은 표면인지 마지막에 확대해서 확인합니다." },
  comp: { left: "중앙의 안정된 구도는 캐릭터를 가장 또렷하게 보여 줘요. 굿즈·이모티콘·프로필처럼 '주인공 하나'가 중요한 곳에 맞아요.",
          mid: "구도가 정적과 동적 사이에 있어요. 장면이 무난하게 읽히지만 넘기고 싶은 힘은 아직 약할 수 있어요.",
          right: "치우친 구도와 여백은 시선을 움직여요. 그림책 펼침면·연재 컷·포스터처럼 '다음 장면'이 있는 작업에서 힘을 써요.",
          drill: "같은 장면을 3×3 썸네일로 배치만 바꿔 9번 그리세요. 그중 대각 구도 3개를 골라 완성 후보로 남깁니다." },
  mood: { left: "담백한 관찰은 보는 사람에게 해석을 맡겨요. 생활 드로잉·정보 일러스트·브랜드 작업에서 오래 질리지 않는 그림이 됩니다.",
          mid: "정서가 관찰과 서사 사이에 있어요. 그림은 예쁜데 '그래서 무슨 이야기야?'라는 질문이 남을 수 있어요.",
          right: "이야기가 먼저 보이는 그림은 팬을 만들어요. 그림책·인스타툰·이모티콘처럼 감정이 상품인 곳에서 가장 큰 무기예요.",
          drill: "그리기 전에 '이 장면의 감정 한 문장'을 먼저 적고, 그 문장에 없는 소품은 지우세요. 2주간 매 그림마다 문장을 남겨 두면 그게 연재 소재 노트가 됩니다." },
};
const CONS_TXT = {
  1: "그림마다 이 선택이 달라요. 지금은 위치보다 '하나로 정하기'가 먼저예요.",
  2: "가끔 같은 선택을 하지만 아직 습관은 아니에요.",
  3: "절반쯤 굳었어요. 2~4주 의식해서 반복하면 내 것이 됩니다.",
  4: "거의 굳었어요. 이 축은 이미 그림체의 일부예요.",
  5: "완전히 내 것이에요. 이 축은 바꾸지 말고 무기로 쓰세요.",
};
const SIGNAL_GUIDE = {
  craft: { low: "마감이 아직 취미 그림 수준이에요. 상품이 되려면 윤곽 끊김, 채색 경계, 삐져나온 선부터 정리해야 해요. 실력보다 '끝내는 습관'의 문제인 경우가 많아요.",
           high: "마감이 이미 상업물 수준이에요. 같은 그림을 그대로 인쇄하거나 납품해도 손볼 곳이 적어요." },
  character: { low: "반복해서 쓸 고정 캐릭터가 아직 없어요. 굿즈·이모티콘·연재는 모두 '같은 얼굴이 계속 나오는 것'에서 돈이 생겨요.",
               high: "알아볼 수 있는 고정 캐릭터가 있어요. 이건 IP의 시작이라 굿즈·연재·라이선스로 확장할 수 있는 자산이에요." },
  expression: { low: "표정과 감정의 폭이 좁아요. 이모티콘·인스타툰은 대화에 쓰일 감정이 상품이라, 이 신호가 낮으면 그 길은 아직 이릅니다.",
                high: "감정을 여러 갈래로 나눠 그릴 수 있어요. 이모티콘·연재·그림책에서 바로 쓰이는 능력이에요." },
  narrative: { low: "한 장이 이야기의 한 순간으로 읽히지는 않아요. 그림책·연재를 원한다면 '앞뒤 장면'을 상상하며 그리는 연습이 필요해요.",
               high: "한 장만 봐도 앞뒤 사건이 느껴져요. 그림책·인스타툰에서 가장 귀한 능력이에요." },
  production: { low: "작게 줄이거나 커팅하면 알아보기 어려운 그림이에요. 굿즈를 원하면 윤곽을 굵게, 디테일은 덜어내는 연습이 먼저예요.",
                high: "작게 줄여도 알아보고 색 면이 분리돼요. 스티커·키링·인쇄물로 바로 옮길 수 있어요." },
};

/* 길별 상세 가이드: 유료 리포트의 본문 */
const PATH_GUIDE = {
  picturebook: {
    tagline: "한 장이 아니라 열두 장면을 끌고 가는 사람의 길",
    needs: ["장면 서사 4점 이상: 한 장이 이야기의 한 순간으로 읽혀야 해요", "질감·색이 16장면 내내 같은 손으로 보이는 일관성", "장면마다 같은 얼굴로 알아볼 수 있는 캐릭터"],
    routes: [["출판사 투고", "더미북과 원화 3장을 보내는 정공법. 계약까지 길게는 1년 이상 걸리지만 유통과 인세가 안정적이에요."], ["공모전", "마감이 있어 완성 동기가 생기고, 수상하면 출간과 홍보가 같이 따라와요. 공모전마다 판형·분량 규정이 달라 미리 확인해야 해요."], ["독립출판", "300~500부 소량 인쇄로 시작해 북페어·온라인으로 팝니다. 수익보다 '책을 낸 사람'이 되는 효과가 커서 강의·외주로 이어집니다. 아더댄웍스 출판 라인과 붙일 수 있어요."]],
    revenue: (s) => [
      ["출판 인세 (혼자 글·그림)", "정가 15,000원 × 10% × 초판 2,000부", "약 300만 원"],
      ["출판 인세 (글 작가와 나눔)", "정가 15,000원 × 5% × 3,000부", "약 225만 원"],
      ["독립출판", "정가 15,000원 × 300부 − 제작비 (부당 6,000~8,000원 추정)", "약 210~270만 원"],
      ["2차 수익", "그림책 수업·도서관 강연·원화 전시·아트 프린트", "책 한 권이 명함이 되어 계속 발생"],
    ],
    roadmap: [["1~2주 · 1.기획", "이야기 한 줄 요약 + 16장면 썸네일 스토리보드 (펼침면 단위로 넘김의 리듬 만들기)"], ["3~4주 · 2.글", "장면별 글 초안 → 소리 내어 읽기 → 그림이 이미 말하는 문장 덜어내기"], ["5~6주 · 3.캐릭터/스타일", "주인공 설정표 (도형 비율·특징 3가지·말버릇) + 그림체 규칙 (선·팔레트·질감) 고정"], ["7~8주 · 3.캐릭터/스타일", "대표 장면 원화 3장 + 러프 더미북 1권"], ["9~10주 · 4.공모전/투고", "주변 독자 5명 피드백 반영, 투고 패키지 (기획서 1쪽, 더미북 PDF, 원화 3장)"], ["11~12주 · 4.공모전/투고", "공모전 일정표 정리 + 출판사 10곳 투고"]],
    checklist: ["같은 캐릭터가 나오는 장면 3장 이상", "펼침면 구도 1장 (왼쪽 → 오른쪽으로 시선이 넘어가는지)", "감정이 바뀌는 연속 장면 2장", "표지 시안 1장", "글과 그림이 서로 다른 것을 말하는 장면 1장"],
    mistakes: ["예쁜 한 장만 모으기: 출판사는 '이야기를 끌고 갈 사람'을 찾아요", "캐릭터가 장면마다 달라지기: 머리 비율·옷 색이 바뀌면 다른 인물로 읽혀요", "글이 그림을 설명만 하기: 그림이 보여 주는 걸 글이 또 말하면 지루해져요", "계약 조건을 모른 채 서명하기: 2차 저작물·원화 소유권 조항부터 확인하세요"],
    refs: ["서점 그림책 코너에서 같은 출판사 책 5권의 판형·쪽수·글밥을 메모하기", "볼로냐 라가치상 수상작 목록 훑어보기", "가고 싶은 출판사 3곳의 투고 안내 페이지 저장하기"],
  },
  emoticon: {
    tagline: "그림 한 장보다 대화에 쓰일 표정 스물네 개로 승부하는 길",
    needs: ["표정·감정 폭 4점 이상: '귀엽다'가 아니라 '대화에 쓰고 싶다'가 기준이에요", "캐릭터 고정성 4점 이상: 작은 화면에서도 같은 캐릭터로 보여야 해요", "선 정돈 62 이상: 작은 크기에서 지저분해 보이지 않는 선"],
    routes: [["카카오 이모티콘 스튜디오", "가장 큰 시장이지만 경쟁도 가장 세요. 반려되면 피드백 없이 끝나는 경우가 많아 여러 번 제안할 각오가 필요해요."], ["라인 크리에이터스 마켓", "심사 문턱이 비교적 낮고 해외 사용자가 있어요. 카카오 반려작을 다듬어 올리는 경로로 많이 씁니다."], ["OGQ 마켓", "네이버 블로그·카페 스티커로 쓰여요. 판매 단가는 낮지만 포트폴리오와 첫 매출을 만들기 좋아요."]],
    revenue: (s) => [
      ["승인 전", "제안 단계 매출", "0원 (제안 경쟁 약 20:1 보도)"],
      ["시장 분포", "누적 매출 1억 원 이상 이모티콘 2,885개 vs 창작자 약 1만 명", "상위권 쏠림이 큰 시장"],
      ["분산 전략", "같은 세트를 카카오·라인·OGQ에 맞게 다듬어 동시 판매", "한 곳 반려에도 매출 경로 유지"],
      ["2차 수익", "승인된 캐릭터로 스티커·굿즈 확장", "이모티콘이 캐릭터 홍보판이 됨"],
    ],
    roadmap: [["1주", "캐릭터 1종 확정 + 2cm 실루엣 테스트"], ["2~3주", "대화 빈도로 감정 24개 고르기 (인사·감사·사과·놀람·거절이 먼저)"], ["4~5주", "러프 24개, 표정은 눈썹·입·몸짓 세 가지로만 구분"], ["6~7주", "선 두께·색 통일 클린업"], ["8주", "지인 10명에게 단톡방에서 써 보게 하고 '쓰고 싶은 것' 투표"], ["9주", "카카오 제안"], ["10주", "라인·OGQ 규격으로 변환해 제안"], ["11~12주", "반려 시 투표 결과로 2차 세트 구성"]],
    checklist: ["같은 캐릭터 표정 24개가 한 시트에 있는지", "2cm로 줄였을 때 감정이 구분되는지", "글자 없이도 뜻이 통하는 컷이 절반 이상인지", "배경 없이 캐릭터만으로 성립하는지", "실제 대화에서 자주 쓰는 말 순서로 골랐는지"],
    mistakes: ["귀여운 캐릭터 = 이모티콘이라고 생각하기: 대화에 쓸 표정이 없으면 반려돼요", "한 장씩 공들인 일러스트 24장 만들기: 작은 화면에선 디테일이 안 보여요", "유행 캐릭터 따라 하기: 비슷한 제안이 수천 개라 묻혀요", "한 곳만 제안하고 기다리기: 동시에 여러 플랫폼을 두드리세요"],
    refs: ["단톡방에서 내가 가장 자주 보내는 이모티콘 10개를 캡처해 공통점 적기", "카카오 이모티콘 스튜디오 제안 가이드 읽기", "라인 크리에이터스 마켓 이미지 규격 확인하기"],
  },
  goods: {
    tagline: "그림이 물건이 되어 손에 잡히는 길",
    needs: ["상품화 적합 4점 이상: 윤곽이 분명하고 색 면이 나뉘어야 커팅·인쇄가 돼요", "캐릭터 고정성 4점 이상: 사람들은 그림이 아니라 '그 캐릭터'를 사요", "선 정돈: 작은 크기에서 지저분해 보이지 않는 선"],
    routes: [["직접 제작 + 소량 판매", "크리컷·3D프린터로 10~30개씩 만들어 플리마켓·지인에게 먼저 팝니다. 재고 위험이 없어서 아더댄웍스 '준공장'과 가장 잘 맞아요."], ["POD 플랫폼", "마플샵처럼 주문이 들어오면 만들어 보내는 방식. 재고는 없지만 마진이 낮고 경쟁이 커요."], ["일러스트페어·플리마켓", "현장 반응을 바로 볼 수 있어요. 부스비와 준비 시간이 들지만 팬이 생기는 속도가 가장 빨라요."]],
    revenue: (s) => [
      ["스티커 시트", "판매 4,000원 − 재료비 약 800~1,200원 (크리컷 자체 제작 추정)", "개당 약 2,800~3,200원"],
      ["3D 키링", "판매 12,000원 − 필라멘트·고리 약 1,500원 (추정)", "개당 약 1만 원 + 출력 시간"],
      ["월 판매 예시", "스티커 80장 + 키링 20개", "약 45만 원 (재료비 차감 후)"],
      ["키트화", "스티커+키링+엽서를 수업용 키트로 묶어 기관 납품", "30인 세트 단위로 단가 상승"],
    ],
    roadmap: [["1주", "대표 캐릭터 1종 + 포즈 6종"], ["2주", "스티커 시트 1종 디자인 (칼선 여백 2mm 이상)"], ["3주", "크리컷 시제품 10장, 커팅 사고 기록"], ["4주", "3D 키링 프로토타입 2종"], ["5주", "제품 사진 촬영·상세페이지 문구"], ["6주", "지인·수강생 대상 30개 테스트 판매"], ["7~8주", "마플샵 또는 스마트스토어 입점"], ["9~10주", "플리마켓 1회 참가, 현장 반응 기록"], ["11주", "판매 데이터로 2차 디자인 (잘 팔린 포즈 확장)"], ["12주", "세트 상품·키트로 묶기"]],
    checklist: ["2cm로 줄여도 알아보는 실루엣", "칼선·여백 규칙을 지킨 스티커 원본", "같은 캐릭터 포즈 6종 이상", "흰 배경·실사용 사진 둘 다 있는 제품 사진", "원가표 (재료·시간·포장)"],
    mistakes: ["좋아하는 그림을 물건에 그냥 얹기: 상품은 '쓰임'에서 팔려요", "첫 생산을 100개 단위로 하기: 테스트는 10~30개면 충분해요", "원가에 시간을 빼먹기: 커팅·포장 시간까지 계산해야 남아요", "캐릭터 없이 패턴만 팔기: 경쟁이 가장 센 영역이에요"],
    refs: ["좋아하는 굿즈 브랜드 3곳의 상품 구성·가격대를 표로 정리하기", "플리마켓 일정 2곳 찾아 두기", "크리컷 칼선 최소 두께를 내 기계로 직접 테스트하기"],
  },
  instatoon: {
    tagline: "그림 실력보다 연재 근력이 매출을 만드는 길",
    needs: ["장면 서사 4점 이상: 4컷 안에 시작과 반전이 있어야 해요", "캐릭터 고정성 4점 이상: 독자는 캐릭터를 보러 다시 와요", "주 2~3회를 6개월 이상 버틸 수 있는 그림 속도"],
    routes: [["자체 연재", "내 계정에서 시리즈로 팬을 모읍니다. 저장 수가 늘면 협찬 문의가 와요."], ["브랜드 광고툰", "팔로워가 쌓이면 브랜드가 의뢰해요. 제작 대행 단가 사례는 컷당 3.5~5.5만 원이에요."], ["책·굿즈 확장", "연재가 쌓이면 단행본·굿즈로 묶어 팝니다. 팬이 있어야 가능한 단계예요."]],
    revenue: (s) => [
      ["광고툰 1편", "4컷 × 컷당 3.5~5.5만 원 (크몽 제작 대행 사례)", "약 14~22만 원"],
      ["월 4편 패키지", "크몽 사례", "약 200만 원"],
      ["협찬 단가", "팔로워·저장 수·참여율에 따라 편차 큼", "공식 시세 없음, 미디어킷으로 협상"],
      ["확장", "연재 → 단행본·굿즈·이모티콘", "같은 캐릭터로 여러 번 수익"],
    ],
    roadmap: [["1주", "캐릭터·세계관·말투 정하기 (한 줄 자기소개)"], ["2주", "소재 노트 30개 (실제 겪은 일 위주)"], ["3~6주", "주 3편 연재, 총 12편"], ["7주", "반응 분석: 좋아요보다 저장·공유 수 기준"], ["8주", "잘 된 편의 공통 포맷 고정"], ["9~10주", "가상 브랜드 광고툰 2편 (포트폴리오용)"], ["11주", "미디어킷 1장 (팔로워·저장률·대표작)"], ["12주", "브랜드 10곳에 제안 메일"]],
    checklist: ["같은 캐릭터 12편 이상", "4컷 안의 시작·전개·반전 구조", "첫 컷만 봐도 무슨 이야기인지 알 수 있는 제목 컷", "광고툰 샘플 2편", "미디어킷 1장"],
    mistakes: ["한 편마다 공들여 그리다 연재 끊기기: 꾸준함이 그림 실력보다 먼저예요", "좋아요 수만 보기: 브랜드는 저장·공유를 봐요", "캐릭터가 매번 달라지기", "협찬 단가를 먼저 부르지 못하기: 미디어킷으로 기준을 먼저 제시하세요"],
    refs: ["좋아하는 인스타툰 계정 3곳의 연재 주기와 저장 수 기록", "광고툰 사례 5편의 '광고가 등장하는 컷 위치' 분석", "내 일상 소재 30개 목록"],
  },
  portfolio: {
    tagline: "그림체보다 납기와 일관성을 파는 길",
    needs: ["완성도 4점 이상: 납품 즉시 쓸 수 있는 마감", "일관성 평균 4 이상: 6장이 같은 사람 그림으로 보여야 해요", "분야 하나에 맞춘 묶음 (출판·브랜드·교육 중 하나)"],
    routes: [["플랫폼 외주", "크몽·숨고에서 시작해 후기를 쌓습니다. 초반엔 저가 경쟁이라 분야 특화로 빠져나와야 해요."], ["출판사·에이전시 직접 제안", "포트폴리오 PDF를 메일로 보냅니다. 단가가 높고 반복 의뢰가 생겨요."], ["기관·교육 콘텐츠", "학교·기관 교재 삽화. 일정이 안정적이고 아더댄웍스 B2G 경험과 연결돼요."]],
    revenue: (s) => [
      ["간단 캐릭터", "크몽 거래 데이터 기준", "약 2만 원"],
      ["배경 포함 일러스트", "크몽 거래 데이터 기준", "약 12만 원"],
      ["브랜딩·복잡 작업", "크몽 거래 데이터 기준", "33만 원 이상"],
      ["월 예시", "12만 원 × 6건 vs 33만 원 × 4건", "72만 원 vs 132만 원 (분야 특화가 단가를 바꿈)"],
    ],
    roadmap: [["1주", "분야 하나 정하기 (출판·브랜드·교육)"], ["2~5주", "가상 의뢰 브리프로 같은 그림체 6장 제작"], ["6주", "포트폴리오 PDF·노션 페이지"], ["7주", "가격표 3단계 (기본·표준·프리미엄)"], ["8주", "크몽 등록 + 첫 3건은 후기용 가격"], ["9~10주", "출판사·에이전시 20곳 제안 메일"], ["11주", "첫 의뢰 후기·사례 정리"], ["12주", "단가 재조정"]],
    checklist: ["같은 그림체 6장 (분야 하나)", "작업 과정 1장 (러프 → 완성)", "가격표와 수정 횟수 규정", "납기 일정표", "저작권·사용 범위 문구"],
    mistakes: ["모든 스타일을 다 보여 주기: 의뢰인은 '이 사람에게 맡기면 뭐가 나오는지'를 알고 싶어 해요", "수정 횟수 규정 없이 시작하기", "첫 단가를 너무 낮게 잡아 못 올리기", "사용 범위를 적지 않기: 2차 사용료를 놓쳐요"],
    refs: ["가고 싶은 출판사 책 5권의 삽화가 이름 찾아 포트폴리오 보기", "크몽 같은 분야 상위 10명 가격표 비교", "표준 외주 계약서의 저작권 조항 읽기"],
  },
};

/* 수업 소개: 대표가 실제 커리큘럼으로 바꿔 쓰는 곳 */
const CLASSES = {
  routine: { name: "드로잉 루틴반", link: LINKS.notion, promise: "4주 뒤, 매번 바뀌던 그림이 '내 그림'으로 굳어요",
    why: "지금은 어떤 길보다 반복이 먼저예요. 혼자 하면 2주 차에 끊기는 부분을 수업은 매일 과제와 피드백으로 이어 줍니다.",
    steps: ["1주: 내 그림 10장에서 축별 습관 찾기", "2주: 선·색 규칙 고정 (브러시 1종, 팔레트 4색)", "3주: 같은 주인공 매일 1컷", "4주: 6축 재진단으로 변화 확인"],
    outcome: "같은 규칙으로 그린 20장 + 재진단 리포트" },
  picturebook: { name: "픽처포지(그림책반)", link: LINKS.notion, promise: "더미북 한 권과 투고 패키지를 손에 쥐고 끝나요",
    why: "그림책은 '한 장을 잘 그리는 것'과 '열여섯 장면을 끌고 가는 것'이 전혀 다른 기술이에요. 수업에서는 장면 설계와 그림체 고정을 같이 다룹니다.",
    steps: ["1.기획: 이야기 한 줄과 16장면 스토리보드", "2.글: 그림과 글이 할 말 나누기, 낭독 피드백", "3.캐릭터/스타일: 설정표·그림체 규칙·원화 3장", "4.공모전/투고: 더미북과 투고 패키지"],
    outcome: "더미북 1권, 원화 3장, 투고 기획서" },
  emoticon: { name: "이모티콘반", link: LINKS.notion, promise: "제안 가능한 24컷 한 세트로 끝나요",
    why: "이모티콘은 그림 실력보다 '어떤 감정을 고르느냐'에서 승부가 나요. 수업에서는 대화 빈도로 감정을 고르고 작은 화면 가독성을 같이 잡습니다.",
    steps: ["캐릭터 1종 확정과 실루엣 테스트", "감정 24개 고르기", "러프 → 클린업 (선 두께·색 통일)", "플랫폼별 규격 변환과 제안"],
    outcome: "제안용 24컷 세트, 플랫폼별 파일" },
  goods: { name: "굿즈반 + 캐릭터 키트", link: LINKS.notion, promise: "팔 수 있는 굿즈 2종과 원가표로 끝나요",
    why: "굿즈는 그림을 물건에 얹는 일이 아니라 '쓰임'을 디자인하는 일이에요. 아더댄웍스 작업실의 크리컷·3D 프린터로 시제품까지 직접 만들어 봅니다.",
    steps: ["대표 캐릭터와 포즈 6종", "스티커 칼선·인쇄 규칙", "크리컷·3D 시제품 제작", "원가표와 판매 채널 정하기"],
    outcome: "스티커 시트 1종, 키링 1종, 원가표" },
  instatoon: { name: "콘텐츠반(릴스·협찬)", link: LINKS.notion, promise: "12편 연재와 미디어킷으로 끝나요",
    why: "인스타툰은 그림보다 '계속 올리는 구조'가 매출을 만들어요. 소재 노트, 포맷 고정, 협찬 제안까지 한 흐름으로 다룹니다.",
    steps: ["캐릭터·말투·세계관", "소재 노트 30개와 4컷 구조", "12편 연재와 반응 분석", "광고툰 샘플과 미디어킷"],
    outcome: "연재 12편, 광고툰 2편, 미디어킷" },
  portfolio: { name: "포트폴리오반", link: LINKS.notion, promise: "단가를 부를 수 있는 6장 묶음으로 끝나요",
    why: "의뢰인은 실력보다 '맡기면 뭐가 나오는지'를 봐요. 수업에서는 분야 하나를 정해 같은 그림체 6장과 가격표를 만듭니다.",
    steps: ["분야 정하기와 가상 브리프", "같은 그림체 6장 제작", "포트폴리오 PDF·가격표", "제안 메일과 첫 의뢰"],
    outcome: "포트폴리오 6장, PDF, 가격표, 제안 메일 템플릿" },
  vintageClub: { name: "빈티지 온라인 드로잉 클럽", link: LINKS.clubForm, online: true,
    promise: "매주 수요일 저녁 8시 30분 · 프로크리에이트 4주 과정", // 날짜 없이 매 기수 그대로 쓴다. 개강일은 startsAt·closeAt만 바꾸면 D-day 배지가 알아서 계산
    why: "집에서 아이패드로 4주 동안 같은 톤의 그림을 쌓는 클럽이에요. 매주 정해진 시간에 함께 그리니 혼자 할 때 끊기는 2주 차를 넘기기 쉬워요.",
    steps: ["매주 수요일 저녁 8시 30분 온라인 라이브", "주차별 워크시트 과제", "놓친 수업은 녹화본으로 복습", "4주 동안 한 가지 빈티지 톤으로 작품 쌓기"],
    outcome: "같은 톤으로 그린 4주치 작품과 프로크리에이트 작업 습관",
    startsAt: "2026-12-02T20:30:00+09:00", closeAt: "2026-12-02T20:30:00+09:00", cta: "클럽 신청하기" },
  workshop: { name: "1:1 맞춤 워크숍", link: "", online: true,
    promise: "단기 4회 55만 원 · 중기 12회 프로젝트형 · 온라인/오프라인 조율",
    why: "리포트에서 나온 막히는 지점을 내 그림 기준으로 바로 고치는 수업이에요. 단기는 한 가지 문제를 집중 해결하고, 중기는 그림책·굿즈·포트폴리오 같은 프로젝트 하나를 끝까지 완성해요.",
    steps: ["상담: 목표와 지금 그림 확인 (이 리포트를 출발점으로)", "단기 4회 (55만 원): 막힌 지점 하나 집중 해결", "중기 12회 (프로젝트형, 상담 후 안내): 프로젝트 하나 완성", "온라인·오프라인 중 편한 방식으로 일정 조율"],
    outcome: "단기는 고쳐진 그림체 규칙과 작업 루틴, 중기는 완성된 프로젝트 1개",
    cta: "1:1 워크숍 상담" },
};
/* 지금 바로 신청할 수 있는 상품. closeAt이 지나면 자동으로 빠진다 */
const OPEN_NOW = ["vintageClub", "workshop"];
function openProducts(now) {
  const t = now == null ? Date.now() : now;
  return OPEN_NOW.map(k => Object.assign({ key: k }, CLASSES[k])).filter(c => !c.closeAt || Date.parse(c.closeAt) > t).map(c => {
    const link = isHttps(c.link) ? { url: c.link, via: "link" } : { url: LINKS.insta, via: "dm" };
    let badge = "상시 상담";
    if (c.startsAt) {
      const kstDay = (ms) => Math.floor((ms + 9 * 3600000) / 86400000); // 한국 시간 달력 날짜
      const days = kstDay(Date.parse(c.startsAt)) - kstDay(t);
      badge = days > 1 ? `모집 중 · 개강 D-${days}` : days === 1 ? "모집 중 · 내일 개강" : "모집 중 · 오늘 개강";
    }
    return Object.assign(c, { url: link.url, via: link.via, badge, ctaLabel: link.via === "dm" ? `${c.cta} (인스타 DM)` : c.cta });
  });
}
/* 진단 결과에 맞춰 지금 신청 가능한 상품의 순서를 정한다 */
function suggestOpen(s, now) {
  const list = openProducts(now);
  const cons = avg(AXES.map(a => s.axes[a.key].consistency));
  const top = scorePaths(s)[0];
  const workshopFirst = cons >= 2.6 && (top.grade === "A" || top.grade === "B");
  return list.sort((a, b) => (workshopFirst ? (a.key === "workshop" ? -1 : 1) : (a.key === "vintageClub" ? -1 : 1)));
}

/* ═════════ 6. 리포트 빌더 ═════════ */
const won = (n) => n.toLocaleString("ko-KR") + "원";
function axisFavors(s, a) {
  const i = AXES.indexOf(a), v = s.axes[a.key].position;
  return GENRES.filter(g => g.w[i] >= .5).map(g => ({ g, d: Math.abs(v - g.target[i]) })).sort((x, y) => x.d - y.d).slice(0, 2).map(o => o.g.name);
}
function axisParagraph(s, a) {
  const ax = s.axes[a.key], G = AXIS_GUIDE[a.key];
  const side = ax.position <= 40 ? "left" : ax.position >= 60 ? "right" : "mid";
  const where = side === "mid" ? "가운데" : (side === "left" ? a.left : a.right) + " 쪽";
  const parts = [`${a.name} ${ax.position}점, ${josa(where, "이에요", "예요")}.`];
  if (ax.evidence && !/^본인 응답/.test(ax.evidence)) parts.push(`그림에서 본 근거: ${ax.evidence}`);
  parts.push(G[side]);
  parts.push(`일관성 ${ax.consistency}/5. ${CONS_TXT[ax.consistency] || ""}`);
  return parts.join(" ");
}
function whyPath(s, p) {
  const lines = [];
  const close = [], far = [];
  AXES.forEach((a, i) => {
    const d = Math.abs(s.axes[a.key].position - p.target[i]);
    if (p.w[i] >= .6) (d <= 15 ? close : d >= 28 ? far : []).push(a.name);
  });
  if (close.length) lines.push(`${close.join("·")} 축이 이 길의 기준과 가까워요.`);
  if (far.length) lines.push(`${far.join("·")} 축은 이 길의 기준과 거리가 있어요.`);
  const sig = SIGNALS.map((x, j) => ({ x, v: sigScore(s, x.key), w: readyW(p)[j] })).filter(o => o.w >= .2 && o.v != null);
  const hi = sig.filter(o => o.v >= 4).map(o => o.x.name), lo = sig.filter(o => o.v <= 2).map(o => o.x.name);
  if (hi.length) lines.push(`이 길에서 중요한 ${hi.join("·")} 신호가 이미 좋아요.`);
  if (lo.length) lines.push(`이 길에서 중요한 ${lo.join("·")} 신호가 아직 약해요.`);
  if (p.gate && p.gate.length) lines.push(`이모티콘 문턱(${p.gate.join("·")})을 아직 못 넘어서 점수를 낮췄어요. 귀여운 그림이 곧 이모티콘은 아니에요.`);
  if (p.capped) lines.push(`점수로는 한 단계 위 등급이지만, 지금 기본기 단계에서는 ${p.grade}등급까지만 줘요. 기본기가 올라가면 등급도 같이 열려요.`);
  if (p.isGoal) lines.push("직접 선택한 프로젝트 분야예요.");
  return lines.join(" ");
}
const SIG_USE = {
  picturebook: { craft: "원화 3장의 완성도", character: "16장면 내내 같은 주인공", expression: "장면마다 달라지는 감정", narrative: "넘김마다 이어지는 이야기", production: "표지와 굿즈 확장" },
  emoticon: { craft: "작은 화면에서도 깔끔한 마감", character: "24컷 내내 같은 캐릭터", expression: "대화에 쓰일 표정 24개", narrative: "상황 이모티콘의 짧은 이야기", production: "작게 줄여도 읽히는 윤곽" },
  goods: { craft: "인쇄·커팅 사고 없는 마감", character: "사람들이 사는 '그 캐릭터'", expression: "포즈별 굿즈 라인업", narrative: "제품 상세페이지의 짧은 이야기", production: "스티커·키링으로 바로 옮기기" },
  instatoon: { craft: "연재를 버티는 빠른 마감", character: "매회 돌아오는 주인공", expression: "4컷 안의 감정 변화", narrative: "4컷의 시작과 반전", production: "썸네일 한 장의 가독성" },
  portfolio: { craft: "납품 즉시 쓰는 마감", character: "브랜드 마스코트 제안", expression: "교육·출판 삽화의 표정 연기", narrative: "장면 삽화의 설득력", production: "인쇄물 납품 품질" },
};
function bridge(s, top, goal) {
  const have = SIGNALS.map((x, j) => ({ x, v: sigScore(s, x.key), w: readyW(goal)[j] })).filter(o => o.v != null && o.v >= 4 && o.w >= .1).sort((a, b) => b.w - a.w).slice(0, 2);
  const lines = [];
  if (have.length) lines.push(`${top.name} 쪽에서 강하게 나온 ${have.map(o => o.x.name).join("·")}${hasBatchim(have[have.length - 1].x.name) ? "은" : "는"} ${goal.name}에서도 그대로 쓰여요: ${have.map(o => SIG_USE[goal.key][o.x.key]).join(", ")}.`);
  const gl = gapsFor(s, goal);
  if (gl.length) lines.push(`대신 ${goal.name}에는 이것이 더 필요해요: ${gl.slice(0, 2).join(" / ")}.`);
  lines.push(`순서는 이렇게 권해요. ${josa(top.name, "으로", "로")} 빠르게 작은 결과물을 만들어 손을 굳히고, 그 캐릭터와 그림체를 그대로 ${goal.name}에 가져가요. 두 길을 따로 연습하는 것보다 훨씬 빨라요.`);
  return lines;
}
function buildReport(s, opts) {
  opts = opts || {};
  const paths = scorePaths(s);
  const rec = recommendation(s, paths);
  const type = typeOf(s);
  const gaps = computeGaps(s);
  const name = s.name || "작가";
  const date = opts.date || new Date().toISOString().slice(0, 10).replaceAll("-", ".");
  const sections = [];
  const strong = strongest(s, 2), weak = weakest(s, 2), stage = stageOf(s);

  sections.push({ id: "summary", title: "한눈에 보기", blocks: [
    s.ownerNote && String(s.ownerNote).trim() ? { t: "callout", text: `대표 한마디 · ${String(s.ownerNote).trim().slice(0, 600)}` } : null,
    { t: "kv", rows: [
      ["그림체 유형", `${type.name} · ${type.hook}`],
      ["한 줄 정의", s.summary || summarize(s)],
      ["상업성 1~3위", paths.slice(0, 3).map(p => `${p.isGoal ? "★" : ""}${p.name} ${p.total}점(${p.grade})`).join(" · ") + (paths.some(p => p.isGoal) ? " (★ 희망 분야)" : "")],
      stage ? ["지금 단계", `${stage.name} · 기본기 ${stage.index}/10 (${stage.basis})`] : null,
      ["숨은 강점", strong.map(x => `${x.name} ${fmtScore(x)}`).join(", ")],
      [stage && stage.key === "ready" ? "더 올릴 곳" : "가장 먼저 손볼 곳", weak.map(x => `${x.name} ${fmtScore(x)}`).join(", ")],
      gaps ? ["본인 생각과 그림의 일치도", `${gaps.score}점 (${AGREE_TXT[gaps.level]})`] : null,
      ["추천 다음 단계", `${rec.title}. ${rec.line}`],
    ].filter(Boolean) },
    { t: "p", text: type.desc },
  ].filter(Boolean)});

  sections.push({ id: "type", title: `${type.name}형 깊이 보기`, lead: type.hook, blocks: [
    { t: "h", text: "이 유형의 강점" }, { t: "list", items: type.strengths },
    { t: "h", text: "빠지기 쉬운 함정" }, { t: "list", items: type.pitfalls },
    { t: "h", text: "이 유형이 자주 하는 고민과 답" }, { t: "kv", rows: type.worries.map((w, i) => [w, i === 0 ? `대개 이 함정에서 시작돼요. "${type.pitfalls[0]}" 아래 성장 경로 1단계부터 잡으면 풀려요.` : `지금 점수로는 ${josa(paths[0].name, "이", "가")} 가장 빨라요. 이 리포트의 길별 분석을 순서대로 따라가 보세요.`]) },
    { t: "h", text: "성장 경로 3단계" }, { t: "weeks", items: type.growth.map((g, i) => [`${i + 1}단계`, g]) },
    { t: "kv", rows: [["어울리는 도구", type.tools], ["첫 프로젝트", type.firstProject], ["잘 맞는 협업 유형", type.pairName], ["가장 다른 유형", `${type.oppositeName} (이 유형의 그림을 따라 하면 오히려 흔들려요)`]] },
  ]});

  const craftRows = CRAFT.map(c => { const v = craftVal(s, c.key); const note = s.craft && s.craft[c.key] && s.craft[c.key].note; return [c.name, v == null ? "해당 없음" : `${v}/10`, v == null ? "이 그림들에서는 볼 수 없어서 점수에서 뺐어요" : (note && note !== "본인 응답" ? note : c.desc)]; });
  if (craftRows.some(r => r[1] !== "해당 없음")) sections.push({ id: "craft", title: "기본기 8항목", lead: stage ? `지금 단계: ${stage.name}. ${stage.line}` : "", blocks: [
    { t: "table", head: ["항목", "점수", "근거"], rows: craftRows },
    { t: "p", text: "10점 기준: 3 = 막 시작한 손, 5 = 취미로 꾸준히 그린 손, 7 = SNS에서 반응을 받는 수준, 9 = 출판·상업 수준. 형태 점수는 '사실적인가'가 아니라 '고른 그림체 안에서 흔들리지 않는가'를 봐요. 미완성 그림은 마감도에만 반영했어요.", cls: "drill" },
    { t: "h", text: "숨은 강점" }, { t: "list", items: strongest(s, 3).map(x => `${x.name} ${fmtScore(x)}: ${strengthWhy(x)}`) },
    { t: "h", text: "디지털이 대신 해 주는 것" }, { t: "list", items: digitalTips(s, 4).map(t => `${t.name} (${t.for} 보강): ${t.tip}`) },
    stage ? { t: "callout", text: `다음 단계로 가는 가장 빠른 과제: ${stage.next}` } : null,
  ].filter(Boolean) });

  sections.push({ id: "axes", title: "그림체 6축 상세", lead: "축은 우열이 아니라 위치예요. 어느 쪽에 있든 그 위치가 유리한 시장이 따로 있습니다." + (s.mixedSubjects ? " 보내 주신 그림들의 주제가 서로 달라서, 일관성은 주제가 아니라 손의 습관(선 굵기·색 운용·마감 방식)으로만 봤어요." : ""), blocks:
    AXES.flatMap(a => [{ t: "h", text: `${a.name} · ${a.left} ↔ ${a.right}` }, { t: "p", text: axisParagraph(s, a) }, { t: "p", text: `지금 위치가 특히 유리한 길: ${axisFavors(s, a).join(", ")}` }, { t: "p", text: "연습: " + AXIS_GUIDE[a.key].drill, cls: "drill" }]) });

  if (Array.isArray(s.imageNotes) && s.imageNotes.length) sections.push({ id: "images", title: "그림별 한 줄 코멘트", lead: "보내 주신 그림을 한 장씩 따로 봤어요.", blocks: [
    { t: "weeks", items: s.imageNotes.slice(0, 3).map((n, i) => { const im = (s.images || [])[i]; const tag = im && (im.subject || im.stage) ? ` (${[im.subject, im.stage].filter(Boolean).join(" · ")})` : ""; return [`그림 ${i + 1}`, String(n) + tag]; }) } ] });

  sections.push({ id: "signals", title: "상업 신호 5가지", lead: "그림체가 아니라 '팔 수 있는 형태인가'를 봅니다. 그림에서 볼 수 없는 신호(예: 캐릭터가 없는 그림의 표정 폭)는 '해당 없음'으로 두고 점수에서 뺐어요.", blocks:
    SIGNALS.flatMap(x => { const v = sigScore(s, x.key); const nt = s.signals && s.signals[x.key] && s.signals[x.key].note; const note = nt && nt !== "본인 응답" && v != null ? ` 그림에서 본 근거: ${nt}` : "";
      if (v == null) return [{ t: "h", text: `${x.name} · 해당 없음` }, { t: "p", text: "이 그림들에는 이 신호를 볼 대상이 없어서 평가하지 않았어요. 감점도 없어요. 이 길을 원한다면 해당 대상을 넣은 그림 한 장을 더 보내 주세요." }];
      return [{ t: "h", text: `${x.name} ${v}/5` }, { t: "p", text: (v >= 4 ? SIGNAL_GUIDE[x.key].high : v <= 2 ? SIGNAL_GUIDE[x.key].low : `보통이에요. 취미 그림으로는 충분하지만 상품으로 내려면 한 단계 더 올려야 해요. 다음 단계는 ${josa(x.fix, "이에요", "예요")}.`) + note }]; }) });

  if (gaps) {
    sections.push({ id: "gap", title: "본인 생각 vs 실제 그림", lead: `일치도 ${gaps.score}점 (${AGREE_TXT[gaps.level]}). 이 차이가 혼자 연습할 때 가장 오래 헤매는 지점이에요.`, blocks: gaps.items.length
      ? gaps.items.map(it => { const g = gapSentence(it); return { t: "p", text: `${g.head}. ${g.tail}` }; }).concat([{ t: "callout", text: "의도한 것과 그림에 나온 것이 다르면, 연습량을 늘려도 엉뚱한 방향으로 굳어요. 이 차이를 수업 첫 주에 바로잡는 게 가장 빠른 길이에요." }])
      : [{ t: "p", text: "큰 차이가 없어요. 자기 그림을 정확하게 보고 있다는 뜻이고, 혼자 연습해도 방향을 잃지 않을 가능성이 커요." }] });
  }

  const focus = paths.slice(0, 3);
  const chosen = paths.find(p => p.isGoal);
  if (chosen && !focus.includes(chosen)) focus.push(chosen);
  focus.forEach((p, idx) => {
    const G = PATH_GUIDE[p.key], M = MARKET[p.key];
    const label = p.isGoal ? `하고 싶은 길 · ${paths.indexOf(p) + 1}위` : `상업성 ${paths.indexOf(p) + 1}위`;
    sections.push({ id: "path-" + p.key, title: `${p.name} · ${label}`, lead: `${G.tagline}. 종합 ${p.total}점 ${p.grade}등급 (${GRADE_TXT[p.grade]}).`, blocks: [
      { t: "table", head: ["그림체 적합", "상품 준비도", "시장 매력", "종합"], rows: [[p.style, p.ready, p.market, `${p.total} (${p.grade})`]] },
      { t: "h", text: "왜 이 점수인가" }, { t: "p", text: whyPath(s, p) || "모든 축과 신호가 이 길의 기준과 비슷한 거리에 있어요." },
      p.isGoal && paths[0].key !== p.key ? { t: "h", text: `${paths[0].name}에서 ${p.name}으로 가는 다리` } : null,
      p.isGoal && paths[0].key !== p.key ? { t: "list", items: bridge(s, paths[0], p) } : null,
      { t: "table", head: ["축", "지금", "이 길의 기준", "판정"], rows: AXES.map((a, i) => { const v = s.axes[a.key].position, d = Math.abs(v - p.target[i]); return [a.name + (p.w[i] >= .8 ? " ★" : ""), v, p.target[i] + " 근처", d <= 15 ? "맞음" : d <= 27 ? "조금 다름" : "많이 다름"]; }) },
      { t: "p", text: "★ 표시는 이 길에서 특히 중요한 축이에요.", cls: "drill" },
      { t: "h", text: "이 길에 필요한 것" }, { t: "list", items: G.needs },
      { t: "h", text: "시장" }, { t: "kv", rows: [["규모", M.size], ["돈이 들어오는 방식", M.money], ["진입 장벽", M.entry], ["매출 속도", M.speed]] },
      { t: "h", text: "들어가는 경로 3가지" }, { t: "kv", rows: G.routes },
      { t: "h", text: "수익 계산 예시 (추정)" }, { t: "table", head: ["항목", "계산", "결과"], rows: G.revenue(s) },
      { t: "h", text: `${name}님이 바꿀 것` }, { t: "list", items: (gapsFor(s, p).length ? gapsFor(s, p) : ["지금 그림체와 상업 신호 모두 이 길과 크게 어긋나는 곳이 없어요. 바로 첫 상품을 만들어도 됩니다."]) },
      { t: "h", text: "가장 먼저 만들 상품" }, { t: "p", text: M.first },
      { t: "h", text: "12주 로드맵" }, { t: "weeks", items: G.roadmap },
      { t: "h", text: "포트폴리오 체크리스트" }, { t: "list", items: G.checklist, check: true },
      { t: "h", text: "이 길에서 흔한 실수" }, { t: "list", items: G.mistakes },
      p.key === "picturebook" ? { t: "h", text: "그림책 만들기 자습서와 함께 보기" } : null,
      p.key === "picturebook" ? { t: "weeks", items: TUTORIAL.map(x => [`${x.no}. ${x.title}`, x.does]) } : null,
      { t: "h", text: "이번 주에 찾아볼 것" }, { t: "list", items: G.refs },
      { t: "src", items: M.src },
    ].filter(Boolean)});
  });

  const rest = paths.filter(p => !focus.includes(p));
  if (rest.length) sections.push({ id: "rest", title: "지금은 뒤로 미룰 길", blocks: rest.map(p => ({ t: "p", text: `${p.name} ${p.total}점(${p.grade}). ${whyPath(s, p) || "다른 길보다 기준과의 거리가 멀어요."}` })) });

  const rx = (s.rx || []).slice(0, 3);
  sections.push({ id: "rx", title: "2주 처방과 4주 연습표", lead: "처방은 가장 흔들리는 곳부터 고릅니다. 하루 20~30분이면 충분해요.", blocks: [
    { t: "weeks", items: rx.map((r, i) => [`처방 ${i + 1}`, `${r.title}: ${r.how}`]) },
    { t: "table", head: ["주차", "할 일", "확인"], rows: [
      ["1주", rx[0] ? rx[0].title : "규칙 고정", "매일 1장, 같은 규칙"],
      ["2주", rx[1] ? rx[1].title : "반복", "7장 중 마음에 드는 2장 표시"],
      ["3주", rx[2] ? rx[2].title : "확장", "같은 주인공으로 장면 바꾸기"],
      ["4주", "재진단", "같은 그림 3장으로 6축이 얼마나 움직였는지 비교"],
    ] },
  ]});

  const ck = rec.classKey === "routine" ? "routine" : rec.target.key;
  const C = CLASSES[ck];
  const priceLine = "전체 수업 일정은 아래 공식 노션에서 확인할 수 있어요.";
  const open = suggestOpen(s, opts.now);
  sections.push({ id: "class", title: `이 분석으로 배우면: ${C.name}`, lead: C.promise, blocks: [
    { t: "p", text: C.why },
    { t: "p", text: gaps && gaps.items.length ? `특히 ${name}님은 ${gaps.items.slice(0, 2).map(x => x.name).join("·")}에서 본인 생각과 그림이 달라요. 이 부분은 혼자 연습하면 방향을 잃기 쉬워서, 수업 첫 주에 바로 다룹니다.` : `${name}님의 가장 흔들리는 곳(${weak.map(x => x.name).join("·")})을 첫 주 과제로 잡습니다.` },
    { t: "h", text: "배우는 순서" }, { t: "weeks", items: C.steps.map((x, i) => [`${i + 1}단계`, x]) },
    { t: "h", text: "끝나면 손에 남는 것" }, { t: "p", text: C.outcome },
    { t: "callout", text: `이 리포트의 6축 점수가 수업의 출발점이에요. 수업이 끝나면 같은 기준으로 재진단해서 무엇이 바뀌었는지 숫자로 보여 드립니다. ${priceLine}` },
    { t: "links", items: [[`${C.name} 안내 (공식 노션)`, isHttps(C.link) ? C.link : LINKS.notion]] },
  ]});
  if (open.length) sections.push({ id: "open", title: "지금 바로 신청할 수 있는 수업", lead: "리포트를 읽은 지금이 가장 빨리 바뀌는 때예요.", blocks: open.flatMap(o => [
    { t: "h", text: `${o.name} · ${o.badge}` }, { t: "p", text: o.promise }, { t: "p", text: o.why },
    { t: "list", items: o.steps },
    { t: "links", items: [[o.ctaLabel, o.url]] },
  ]) });

  sections.push({ id: "note", title: "리포트를 읽는 법", blocks: [
    { t: "list", items: [
      "점수는 지금 그림 기준이에요. 4주만 연습해도 축과 등급이 움직입니다.",
      "시장 자료는 " + MARKET[paths[0].key].asOf + " 기준 공개 자료와 보도를 인용했고, 수익 계산은 이해를 돕기 위한 추정이에요.",
      s.mode === "both" ? "이 리포트는 그림 AI 관찰과 본인 체크를 합친 뒤 아더댄웍스 대표가 감수했습니다." : s.mode === "ai" ? "이 리포트는 그림 AI 관찰을 바탕으로 아더댄웍스 대표가 감수했습니다." : "이 리포트는 본인 체크 응답을 바탕으로 만들었습니다. 그림을 함께 보내 주시면 더 정확해져요.",
    ] },
  ]});

  return { title: `${name}님의 6축 그림체 리포트`, name, date, type, paths, rec, gaps, sections, open, cta: { classKey: ck, className: C.name, url: isHttps(C.link) ? C.link : LINKS.notion } };
}

/* 무료로 주는 정보 (답변 기준). 순위·점수·시장 정보는 넣지 않는다 */
function freeInsights(s) {
  const type = typeOf(s);
  const axes = AXES.map(a => {
    const v = s.axes[a.key].position, side = v <= 40 ? "left" : v >= 60 ? "right" : "mid";
    return { key: a.key, name: a.name, side: sideOf(a, v), pos: v, consistency: s.axes[a.key].consistency, line: AXIS_GUIDE[a.key][side].split(". ")[0].replace(/\.?$/, ".") };
  });
  const fixed = axes.filter(x => x.consistency >= 4).map(x => x.name), shaky = axes.filter(x => x.consistency <= 2).map(x => x.name);
  const signals = SIGNALS.map(x => ({ key: x.key, name: x.name, v: sigScore(s, x.key), desc: x.desc }));
  const stage = stageOf(s);
  const hidden = strongest(s, 2).map(x => ({ name: x.name, score: fmtScore(x), why: strengthWhy(x) }));
  const tips = digitalTips(s, 3);
  const w = weakest(s, 2), st = strongest(s, 1)[0];
  const rx = (k) => RX_LIB[k] || RX_LIB.line;
  const sevenDay = [
    ["1일", `최근 그림 10장을 한 화면에 모으고, '${w[0].name}' 쪽에서 아쉬운 곳에 표시하기 (미완성 그림도 같이)`],
    ["2일", `${rx(w[0].key).title}: ${rx(w[0].key).how}`],
    ["3일", `어제와 같은 규칙으로 한 장 더. 어제 그림과 나란히 놓고 비교하기`],
    ["4일", `${rx(w[1].key).title}: ${rx(w[1].key).how}`],
    ["5일", `4일 차 규칙을 지키며 좋아하는 소재로 한 장`],
    ["6일", `강점 '${st.name}'을 일부러 더 밀어붙인 한 장 (내 그림이 가장 나다워 보이는 방향). 끝까지 완성하는 게 목표예요`],
    ["7일", `1일 차 그림과 오늘 그림 비교 → 이 진단을 다시 해서 축이 움직였는지 확인`],
  ];
  // 내 유료 리포트 미리보기: 가장 흔들리는 축 문단 (순위·길 정보 없는 부분만)
  const wAxis = weakest(s, 20).find(x => x.kind === "axis");
  const pa = AXES.find(a => a.key === (shaky.length ? axes.find(x => x.consistency <= 2).key : (wAxis ? wAxis.key : "line"))) || AXES[0];
  const preview = { title: `그림체 6축 상세 · ${pa.name}`, text: axisParagraph(s, pa) + " 연습: " + AXIS_GUIDE[pa.key].drill };
  return { type, axes, fixed, shaky, signals, sevenDay, preview, stage, hidden, tips };
}
const FREE_VS_PAID = [
  ["그림체 유형", "유형 프로필 (강점·함정·고민·도구)", "+ 성장 경로 3단계, 자주 하는 고민에 대한 답"],
  ["6축 위치", "답변 기준", "실제 그림 3장 기준 + 그림 속 근거 문장 + 축마다 유리한 길"],
  ["기본기", "작업 습관 4가지로 본 지금 단계", "8항목 10점 척도 + 그림 속 근거 + 항목별 디지털 팁"],
  ["상업 신호 5가지", "답변 기준 (해당 없으면 빼고 계산)", "실제 그림 기준 + 대표 감수"],
  ["본인 생각 vs 실제 그림", "–", "축마다 차이와 해석, 차이가 큰 축을 처방 1순위로"],
  ["돈이 되는 길", "1위 + 하고 싶은 길 순위", "1~5위 점수·등급, 왜 이 점수인지, 1위에서 하고 싶은 길로 가는 다리"],
  ["시장·수익", "–", "길마다 시장 규모, 진입 경로 3가지, 수익 계산 예시"],
  ["연습", "7일 미니 루틴", "2주 처방 3개 + 4주 연습표 + 길마다 12주 로드맵"],
  ["그림별 코멘트", "–", "보낸 그림 3장 각각 한 줄"],
  ["대표 한마디", "–", "17년 차 디자이너가 직접 쓴 코멘트"],
  ["받는 것", "결과 화면 + 카드 1장", "리포트 파일(약 1만 자) + 카드 2장"],
];
const METHOD = [
  "6축(선·형태·색·질감·구성·정서)은 17년 차 디자이너가 수강생 그림을 보며 '그림체가 갈리는 지점'을 정리한 기준이에요. 축은 우열이 아니라 위치예요.",
  "상업 신호 5가지(완성도·캐릭터 고정성·표정 폭·장면 서사·상품화 적합)는 '팔 수 있는 형태인가'를 봐요. 그림체가 비슷한 굿즈와 이모티콘도 여기서 갈려요.",
  "길별 점수는 그림체 적합 45% + 상품 준비도 35% + 시장 매력 20%로 계산하고, 희망 분야는 다음 과제를 고르는 데 사용해요.",
  "그림에서 볼 수 없는 항목(캐릭터가 없는 그림의 표정 폭, 흑백 그림의 색 조화 등)은 0점이 아니라 '해당 없음'으로 빼고 계산해요. 미완성 그림은 마감도에만 반영해요.",
  "무료 진단은 답변만으로 계산해요. 유료 리포트는 실제 그림 3장을 AI가 관찰하고 대표가 감수해서, 답변과 그림이 어디서 다른지까지 봐요.",
];

/* 무료 결과용 티저: 궁금하게 만드는 한 가지 + 잠긴 목차 */
function freeTeaser(s) {
  const paths = scorePaths(s), type = typeOf(s), weak = weakest(s, 1)[0], strong = strongest(s, 1)[0];
  const goal = paths.find(p => p.isGoal);
  const top = paths[0];
  let surprise;
  if (goal && top.key !== goal.key) surprise = `하고 싶은 길은 ${goal.name}인데, 지금 그림은 ${top.name} 쪽이 더 가까워요. ${josa(top.name, "에서", "에서")} ${josa(goal.name, "으로", "로")} 넘어가는 순서가 따로 있어요.`;
  else if (top.key === "goods" && paths.find(p => p.key === "emoticon").base >= top.base - 10) surprise = "귀여운 그림이라 이모티콘 쪽일 것 같지만, 지금 그림은 이모티콘보다 굿즈에 더 가까워요.";
  else if (strong.v >= 5) surprise = `${josa(strong.name, "은", "는")} 이미 완전히 '내 것'이에요. 이걸 무기로 쓰는 길이 따로 있어요.`;
  else surprise = `가장 먼저 손볼 곳은 ${josa(weak.name, "이에요", "예요")}. 여기만 잡아도 상업성 등급이 한 칸 올라가는 경우가 많아요.`;
  // 공개: 유형, 1위, 하고 싶은 길이 몇 위인지. 잠금: 나머지 순위·점수·등급 (값은 아예 넣지 않는다)
  const goalLine = goal ? `희망 프로젝트 · ${goal.name}` : null;
  const locked = goal ? ["나머지 길의 순위", "길별 점수와 상업성 등급", "1위 길과 하고 싶은 길을 잇는 순서"] : ["2위 길", "3위 길", "길별 점수와 상업성 등급"];
  const report = buildReport(s);
  let pathNo = 0;
  const toc = report.sections.map(x => {
    if (x.id.startsWith("path-")) { pathNo++; return `길별 상세 분석 ${pathNo} (시장·수익 계산·12주 로드맵)`; }
    if (x.id === "class") return "이 분석으로 배우면: 맞춤 수업 안내";
    return x.title;
  });
  const chars = report.sections.reduce((n, sec) => n + JSON.stringify(sec).length, 0);
  return { type, surprise, top: { name: top.name, key: top.key }, goalLine, locked, toc, approxChars: Math.round(chars / 2 / 100) * 100 };
}

/* ═════════ 7. 렌더러 ═════════ */
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function blockToHTML(b) {
  switch (b.t) {
    case "p": return `<p${b.cls ? ` class="${b.cls}"` : ""}>${esc(b.text)}</p>`;
    case "h": return `<h3>${esc(b.text)}</h3>`;
    case "callout": return `<div class="callout">${esc(b.text)}</div>`;
    case "list": return `<ul${b.check ? ' class="check"' : ""}>${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "kv": return `<dl class="kv">${b.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
    case "table": return `<div class="tw"><table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "weeks": return `<ol class="weeks">${b.items.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join("")}</ol>`;
    case "links": return `<p class="links">${b.items.filter(([, u]) => isHttps(u)).map(([l, u]) => `<a class="lk" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} →</a>`).join("")}</p>`;
    case "src": return `<p class="src">출처: ${b.items.map(([l, u]) => /^https:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>` : esc(l)).join(" · ")}</p>`;
    default: return "";
  }
}
function reportBodyHTML(r, opt) {
  const art = opt && opt.art && (/^data:image\/(png|jpeg|webp);base64,/.test(opt.art) || /^\.\/assets\/types\/[a-z-]+\.png$/.test(opt.art)) ? `<img class="r-art" src="${esc(opt.art)}" alt="${esc(r.type.name)} 일러스트">` : "";
  return `<header class="r-head">${art}<span class="r-pill">other than works</span><p class="r-eyebrow">6축 그림체 리포트 · ${esc(r.date)}</p><h1>${esc(r.title)}</h1><p class="r-type">${esc(r.type.name)}</p></header>`
    + `<nav class="r-toc"><b>목차</b><ol>${r.sections.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join("")}</ol></nav>`
    + r.sections.map(s => `<section id="${s.id}"><h2>${esc(s.title)}</h2>${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ""}${s.blocks.map(blockToHTML).join("")}</section>`).join("")
    + `<footer class="r-foot">${esc(CONFIG.brand)} · ${esc(CONFIG.insta)}</footer>`;
}
const REPORT_CSS = `
.otw-report{--ink:#16181D;--muted:#5F6A80;--line:#E2E7F0;--navy:#1F3D8F;--lime:#A8D96A;--soft:#F4F6FA;--ice:#E6EDFA;color:var(--ink);font-family:"Gothic A1",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.75;font-size:15.5px;max-width:760px;margin:0 auto}
.otw-report h1{font-family:"Jua","Gothic A1",sans-serif;font-weight:400;font-size:34px;line-height:1.3;margin:6px 0;text-wrap:balance;word-break:keep-all}
.otw-report h2{font-family:"Jua","Gothic A1",sans-serif;font-weight:400;font-size:25px;line-height:1.35;margin:0 0 8px;padding-top:28px;border-top:4px solid var(--ink);text-wrap:balance;word-break:keep-all}
.otw-report h3{font-size:16px;margin:18px 0 4px}
.otw-report p{margin:6px 0}
.otw-report .lead{font-weight:500;color:var(--navy)}
.otw-report .drill{color:var(--muted);font-size:14px;border-left:3px solid var(--lime);padding-left:10px}
.otw-report .r-head{background:var(--navy);color:#fff;padding:28px 24px;margin-bottom:18px;overflow:hidden}
.otw-report .r-art{float:right;width:132px;height:132px;object-fit:contain;margin:0 0 8px 12px}
.otw-report .links{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.otw-report .lk{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;font-weight:700;padding:10px 14px}
.otw-report .r-head h1{color:#fff}
.otw-report .r-pill{display:inline-block;font-family:"Gaegu",sans-serif;font-weight:700;letter-spacing:.18em;background:#F1F4FB;color:#16181D;border-radius:60px;padding:4px 14px}
.otw-report .r-eyebrow{color:#A9B8E4;font-size:13px;letter-spacing:.06em;margin-top:14px}
.otw-report .r-type{color:var(--lime);font-family:"Jua",sans-serif;font-size:22px;margin:0}
.otw-report .r-toc{background:var(--soft);padding:14px 18px;margin-bottom:10px}
.otw-report .r-toc ol{margin:6px 0 0;padding-left:1.3em;columns:2;column-gap:24px}
.otw-report .r-toc a{color:var(--navy)}
.otw-report section{margin:22px 0}
.otw-report ul,.otw-report ol{padding-left:1.2em;margin:6px 0}
.otw-report ul.check{list-style:none;padding-left:0}
.otw-report ul.check li::before{content:"□ ";color:var(--navy);font-weight:700}
.otw-report .kv{margin:8px 0;display:grid;gap:0;border:1px solid var(--line)}
.otw-report .kv div{display:grid;grid-template-columns:9.5em minmax(0,1fr);gap:12px;padding:8px 12px;border-top:1px solid var(--line)}
.otw-report .kv div:first-child{border-top:0}
.otw-report .kv dt{font-weight:700;font-size:13px;color:var(--muted)}
.otw-report .kv dd{margin:0}
.otw-report .tw{overflow-x:auto;margin:8px 0}
.otw-report table{border-collapse:collapse;width:100%;font-size:14px}
.otw-report th,.otw-report td{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
.otw-report th{background:var(--soft);font-size:12.5px;white-space:nowrap}
.otw-report .weeks{list-style:none;padding:0;border-left:3px solid var(--line);margin-left:4px}
.otw-report .weeks li{display:grid;grid-template-columns:5.5em minmax(0,1fr);gap:10px;padding:5px 0 5px 12px}
.otw-report .weeks b{color:var(--navy)}
.otw-report .callout{background:var(--ice);border-left:6px solid var(--navy);padding:12px 14px;margin:10px 0;font-weight:500}
.otw-report .src{font-size:12.5px;color:var(--muted)}
.otw-report .src a{color:var(--muted)}
.otw-report .r-foot{margin-top:30px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media (max-width:560px){.otw-report .kv div{grid-template-columns:minmax(0,1fr);gap:2px}.otw-report .r-toc ol{columns:1}.otw-report .weeks li{grid-template-columns:minmax(0,1fr);gap:0}}
@media print{.otw-report h2{break-before:auto}.otw-report section{break-inside:auto}}`;
function reportToHTMLDoc(r, opt) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)}</title>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gaegu:wght@700&family=Gothic+A1:wght@400;500;700&family=Jua&display=swap">`
    + `<style>body{margin:0;background:#fff;padding:0 16px 48px}${REPORT_CSS}</style></head><body><article class="otw-report">${reportBodyHTML(r, opt)}</article></body></html>`;
}
function blockToText(b) {
  switch (b.t) {
    case "p": case "callout": return b.text;
    case "h": return `\n■ ${b.text}`;
    case "list": return b.items.map(i => (b.check ? "□ " : "• ") + i).join("\n");
    case "kv": return b.rows.map(([k, v]) => `- ${k}: ${v}`).join("\n");
    case "table": return [b.head.join(" | ")].concat(b.rows.map(r => r.join(" | "))).join("\n");
    case "weeks": return b.items.map(([k, v]) => `${k}  ${v}`).join("\n");
    case "src": return "출처: " + b.items.map(([l, u]) => `${l} ${u}`).join(" / ");
    case "links": return b.items.map(([l, u]) => `▶ ${l}: ${u}`).join("\n");
    default: return "";
  }
}
function reportToText(r) {
  return [`${r.title} (${r.date})`, `그림체 유형: ${r.type.name}`, ""].concat(
    r.sections.map(s => [`\n━━ ${s.title} ━━`, s.lead || ""].concat(s.blocks.map(blockToText)).filter(Boolean).join("\n"))
  ).join("\n") + `\n\n${CONFIG.brand} · ${CONFIG.insta}`;
}

const PROJECTS = {
  picturebook: "같은 주인공으로 사건 직전과 직후를 손바닥 크기의 두 장면으로 그려 보세요. 글을 가리고도 무엇이 달라졌는지 확인해요.",
  goods: "그림 하나를 메모지의 왼쪽 아래에 실제 인쇄 크기로 배치해 보세요. 필기 공간을 남기고, 작아졌을 때 사라지는 디테일 하나를 골라요.",
  emoticon: "같은 캐릭터로 ‘알겠어’와 ‘잠깐만’을 그려 보세요. 글을 가리고 작게 줄여도 두 반응이 구분되는지 살펴봐요.",
  instatoon: "오늘 있었던 한 사건을 세 컷으로 그려 보세요. 마지막 컷의 대사를 가린 뒤 앞선 두 컷만으로 상황이 전해지는지 확인해요.",
  portfolio: "그림 한 장을 잡지의 본문 삽화와 표지에 각각 배치해 보세요. 제목 자리를 남긴 뒤 어느 구도에서 그림의 특징이 더 잘 읽히는지 비교해요."
};
const OTW = { PROJECTS, HABITS, SIGNAL_NA, strengthWhy, CRAFT, CRAFT_W, STAGES, TIP_FOR, craftVal, craftIndex, stageOf, judgeItems, fmtScore, digitalTips, TYPE_PROFILE, freeInsights, FREE_VS_PAID, METHOD, axisFavors, bridge, CONFIG, LINKS, TUTORIAL, TUTORIAL_LINE, isHttps, linkFor, typeImage, openProducts, suggestOpen, AXES, SIGNALS, GENRES, MIX, EMOTICON_GATE, ROUTINE, GRADE_TXT, MARKET, RX_LIB, TYPES, MERGE, AGREE_TXT,
  AXIS_GUIDE, SIGNAL_GUIDE, PATH_GUIDE, CLASSES, CAL,
  clamp, avg, hasBatchim, josa, rng, gauss, scorePaths, recommendation, gapsFor, weakest, strongest, summarize, sideOf, typeOf,
  computeGaps, gapSentence, buildResult, buildReport, freeTeaser, reportBodyHTML, reportToHTMLDoc, reportToText, REPORT_CSS, esc, won };
root.OTW = OTW;
if (typeof module !== "undefined" && module.exports) module.exports = OTW;
})(typeof window !== "undefined" ? window : globalThis);
