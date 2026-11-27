/**
 * 아더댄웍스 무료 진단 응답 수집기 (Google Apps Script)
 *
 * 설치 5분:
 * 1. 구글 드라이브에서 새 스프레드시트를 만든다. 이름 예: "아더댄웍스 무료진단 응답"
 * 2. 메뉴 [확장 프로그램] → [Apps Script]를 열고, 기본 코드를 지운 뒤 이 파일 내용을 통째로 붙여 넣는다.
 * 3. 운영 알림이 필요하면 프로젝트 설정의 스크립트 속성 OWNER_EMAIL에 받을 주소를 저장한다.
 * 4. [배포] → [새 배포] → 유형 "웹 앱" → 실행 사용자 "나", 액세스 권한 "모든 사용자" → 배포.
 *    처음 한 번 권한 승인 창이 뜨면 허용한다 (시트 쓰기·메일 보내기 권한).
 * 5. 나온 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 otw-core.js의 CONFIG.leadEndpoint에 붙여 넣는다.
 *
 * 만드는 것:
 * - "무료진단" 시트: 응답 한 줄씩 (연락처, 궁금한 점, 결과, 유입 경로)
 * - "관심사 집계" 시트: 어떤 고민이 많은지 자동 집계 → 다음 콘텐츠·수업 주제로 사용
 * - "클릭" 시트: 결과 화면에서 누른 버튼 (리포트·클럽·워크숍·노션·문의) → 어떤 제안이 먹히는지 확인
 * - 방문자 메일로 결과 발송 (이메일을 적은 경우), 대표 메일로 새 응답 알림
 */
const SEND_RESULT_EMAIL = true;  // 방문자에게 결과 메일 보내기
const SHEET = "무료진단";
const TALLY = "관심사 집계";
const CLICKS = "클릭";
const HEAD = ["받은 시각", "닉네임", "이메일", "휴대폰", "인스타", "하고 싶은 길", "관심사", "질문", "마케팅 동의",
  "유형", "1위", "2위", "3위", "선", "형태", "색", "질감", "구성", "정서",
  "utm_source", "utm_medium", "utm_campaign", "ref", "유입 페이지", "리퍼러", "상태", "메모", "leadId"];
const GOAL = { unknown: "아직 모름", picturebook: "그림책", emoticon: "이모티콘", goods: "캐릭터 굿즈", instatoon: "인스타툰", portfolio: "포트폴리오·외주" };

function doPost(e) {
  const receipt = !!(e.parameter && e.parameter.payload);
  const outcome = acceptSubmission(e, receipt);
  if (!receipt) return json(outcome);
  const message = !outcome.ok ? "접수하지 못했어요. 결과 화면에서 다시 시도해 주세요."
    : outcome.duplicate ? "이미 접수한 요청이에요. 발송 상태는 소랭에게 문의해 주세요."
    : outcome.mailFailed ? "질문과 연락처는 저장됐어요. 결과 메일 발송이 지연돼 소랭이 확인할 예정이에요."
    : outcome.mailed ? "결과를 저장하고 메일을 발송했어요. 받은편지함과 스팸함을 확인해 주세요."
    : "질문과 연락처가 저장됐어요.";
  return HtmlService.createHtmlOutput("<main lang='ko' style='font:18px/1.7 system-ui;max-width:32em;margin:12vh auto;padding:20px'><h1>아더댄웍스 접수 확인</h1><p>" + message + "</p><p>이 창을 닫으면 진단 결과로 돌아갑니다.</p></main>").addMetaTag("viewport","width=device-width, initial-scale=1");
}
function acceptSubmission(e, receipt) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const raw = receipt ? e.parameter.payload : e.postData.contents;
    if (!raw || raw.length > 16000) return {ok:false};
    const d = JSON.parse(raw);
    if (d.kind === "cta-click") return logClick(d);
    if (d.kind !== "free-diagnosis" || !d.name || (!d.email && !d.phone) || d.consentPrivacy !== true) return {ok:false,reason:"invalid"};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
    if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); }
    if (!/^[A-Za-z0-9-]{8,80}$/.test(d.leadId || "") || (d.email && !isEmail(d.email)) || (d.phone && !/^01[016789]\d{7,8}$/.test(d.phone)) || !Array.isArray(d.interests) || d.interests.length > 8) return {ok:false};
    const last = sh.getLastRow();
    if (last > 1 && sh.getRange(2,HEAD.length,last-1,1).createTextFinder(d.leadId).matchEntireCell(true).findNext()) return {ok:true,duplicate:true};
    const cache = CacheService.getScriptCache();
    const key = "mail-" + String(d.email || d.phone).trim().toLowerCase();
    if (cache.get(key)) return {ok:false};
    cache.put(key,"1",300);
    const a = d.axes || {}, u = d.utm || {};
    sh.appendRow([new Date(), d.name, d.email, d.phone ? "'" + d.phone : "", d.insta, GOAL[d.goal] || d.goal, (d.interests || []).join(", "), d.question,
      d.consentMarketing ? "동의" : "미동의", d.type, d.top1, d.top2, d.top3, a.line, a.form, a.color, a.texture, a.comp, a.mood,
      u.source, u.medium, u.campaign, u.ref, d.page, d.referrer, "신규", "", d.leadId || ""].map(safe));
    const row = sh.getLastRow();
    let mailed = false, mailFailed = false;
    if (SEND_RESULT_EMAIL && isEmail(d.email)) {
      try {
        const typeNames = ["표정 부자 캐릭터 작가","단정한 마스코트 메이커","장면을 설계하는 연출가","정확한 기록자","낙서로 이야기하는 이야기꾼","생활 드로잉 수집가","손맛 짙은 그림책 화가","크로키하는 관찰자"];
        const type = typeNames.includes(d.type) ? d.type : "작업 성향 체크";
        const axes = ["선","형태","색","질감","구성","정서"].map((label,i) => {
          const v = a[["line","form","color","texture","comp","mood"][i]];
          return label + " · " + (Number.isFinite(v) && v>=0 && v<=100 ? v : "미확인");
        });
        MailApp.sendEmail({to:d.email,name:"아더댄웍스",subject:"아더댄웍스 작업 성향 카드",
          body:[type, "자가 응답에 따른 6축 위치 (0~100)", ...axes, "희망 프로젝트 · " + (GOAL[d.goal] || "아직 모름"), "문의는 이 메일에 답장해 주세요."].join("\n")});
        mailed = true;
      } catch (err) {mailFailed = true;}
    }
    sh.getRange(row,26).setValue(mailFailed ? "결과메일 재발송 필요" : mailed ? "결과메일 발송" : "질문 접수");
    try { tally(ss,d.interests); } catch (err) { console.warn("관심사 집계 지연"); }
    try {
      const ownerEmail = PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL");
      if (isEmail(ownerEmail)) MailApp.sendEmail(ownerEmail,"[아더댄웍스] 새 진단 접수","무료진단 시트 " + row + "행에서 질문과 발송 상태를 확인해 주세요.");
    }
    catch (err) {console.warn("대표 알림 지연");}
    return {ok:true,mailed,mailFailed};
  } catch (err) {
    return {ok:false};
  } finally {
    lock.releaseLock();
  }
}
const CTA_NAME = { report: "유료 리포트", vintageClub: "빈티지 클럽", workshop: "1:1 워크숍", classes: "수업 둘러보기(노션)", ask: "문의" };
function logClick(d) {
  if (!d.leadId || !Object.prototype.hasOwnProperty.call(CTA_NAME,d.cta)) return {ok:false,reason:"invalid"};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CLICKS) || ss.insertSheet(CLICKS);
  if (sh.getLastRow() === 0) { sh.appendRow(["누른 시각", "닉네임", "누른 버튼", "연결", "유형", "utm_source", "utm_campaign", "leadId"]); sh.setFrozenRows(1); }
  const u = d.utm || {};
  sh.appendRow([new Date(), clip(d.name, 20), CTA_NAME[d.cta] || clip(d.cta, 30), d.via === "dm" ? "인스타 DM" : "링크", clip(d.type, 30), clip(u.source, 40), clip(u.campaign, 60), clip(d.leadId, 60)].map(safe));
  return {ok:true};
}
function tally(ss, items) {
  const sh = ss.getSheetByName(TALLY) || ss.insertSheet(TALLY);
  if (sh.getLastRow() === 0) sh.appendRow(["관심사", "선택 수"]);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
  items.forEach(it => {
    const i = rows.findIndex(r => r[0] === it);
    if (i >= 0) { rows[i][1] = Number(rows[i][1]) + 1; sh.getRange(i + 2, 2).setValue(rows[i][1]); }
    else { rows.push([safe(it), 1]); sh.appendRow([safe(it), 1]); }
  });
}
function safe(v) { const s = v == null ? "" : v; return typeof s === "string" && /^\s*[=+\-@]/.test(s) ? "'" + s : s; } // 수식 주입 방지
function isEmail(v) { return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function clip(v, n) { return String(v || "").slice(0, n); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
