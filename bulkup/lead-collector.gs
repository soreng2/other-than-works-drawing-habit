/**
 * 아더댄웍스 무료 진단 응답 수집기 (Google Apps Script)
 *
 * 설치 5분:
 * 1. 구글 드라이브에서 새 스프레드시트를 만든다. 이름 예: "아더댄웍스 무료진단 응답"
 * 2. 메뉴 [확장 프로그램] → [Apps Script]를 열고, 기본 코드를 지운 뒤 이 파일 내용을 통째로 붙여 넣는다.
 * 3. 아래 OWNER_EMAIL에 알림 받을 메일 주소를 적고 저장한다.
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
const OWNER_EMAIL = "mon.mut.friends@gmail.com"; // 새 응답 알림 받을 메일 (비우면 알림 없음)
const SEND_RESULT_EMAIL = true;  // 방문자에게 결과 메일 보내기
const SHEET = "무료진단";
const TALLY = "관심사 집계";
const CLICKS = "클릭";
const HEAD = ["받은 시각", "닉네임", "이메일", "휴대폰", "인스타", "하고 싶은 길", "관심사", "질문", "마케팅 동의",
  "유형", "1위", "2위", "3위", "선", "형태", "색", "질감", "구성", "정서",
  "utm_source", "utm_medium", "utm_campaign", "ref", "유입 페이지", "리퍼러", "상태", "메모", "leadId"];
const GOAL = { unknown: "아직 모름", picturebook: "그림책", emoticon: "이모티콘", goods: "캐릭터 굿즈", instatoon: "인스타툰", portfolio: "포트폴리오·외주" };

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents || "{}");
    if (d.kind === "cta-click") return logClick(d);
    if (d.kind !== "free-diagnosis" || !d.name || (!d.email && !d.phone) || d.consentPrivacy !== true) return json({ ok: false, reason: "invalid" });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
    if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); }
    const a = d.axes || {}, u = d.utm || {};
    sh.appendRow([new Date(), d.name, d.email, d.phone ? "'" + d.phone : "", d.insta, GOAL[d.goal] || d.goal, (d.interests || []).join(", "), d.question,
      d.consentMarketing ? "동의" : "미동의", d.type, d.top1, d.top2, d.top3, a.line, a.form, a.color, a.texture, a.comp, a.mood,
      u.source, u.medium, u.campaign, u.ref, d.page, d.referrer, "신규", "", d.leadId || ""].map(safe));
    tally(ss, d.interests || []);
    if (SEND_RESULT_EMAIL && isEmail(d.email)) {
      MailApp.sendEmail({ to: d.email, name: "아더댄웍스", subject: `[아더댄웍스] ${clip(d.name, 20)}님의 그림체 유형 결과`,
        body: `${String(d.resultText || "").slice(0, 3000)}\n\n궁금한 점이 있으면 이 메일에 답장해 주세요. 대표가 직접 읽어요.\n\n이 메일은 6축 그림체 무료 진단을 신청하신 분께만 보내 드렸어요.` });
    }
    if (isEmail(OWNER_EMAIL)) {
      MailApp.sendEmail(OWNER_EMAIL, `[무료진단] ${clip(d.name, 20)} · ${d.type} · 1위 ${d.top1}`,
        `연락처: ${d.email || "-"} / ${d.phone || "-"} / ${d.insta || "-"}\n하고 싶은 길: ${GOAL[d.goal] || d.goal}\n관심사: ${(d.interests || []).join(", ")}\n질문: ${d.question || "-"}\n마케팅 동의: ${d.consentMarketing ? "예" : "아니오"}\n유입: ${u.source || "-"} / ${u.campaign || "-"}`);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, reason: String(err) });
  } finally {
    lock.releaseLock();
  }
}
const CTA_NAME = { report: "유료 리포트", vintageClub: "빈티지 클럽", workshop: "1:1 워크숍", classes: "수업 둘러보기(노션)", ask: "문의" };
function logClick(d) {
  if (!d.leadId || !d.cta) return json({ ok: false, reason: "invalid" });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CLICKS) || ss.insertSheet(CLICKS);
  if (sh.getLastRow() === 0) { sh.appendRow(["누른 시각", "닉네임", "누른 버튼", "연결", "유형", "utm_source", "utm_campaign", "leadId"]); sh.setFrozenRows(1); }
  const u = d.utm || {};
  sh.appendRow([new Date(), clip(d.name, 20), CTA_NAME[d.cta] || clip(d.cta, 30), d.via === "dm" ? "인스타 DM" : "링크", clip(d.type, 30), clip(u.source, 40), clip(u.campaign, 60), clip(d.leadId, 60)].map(safe));
  return json({ ok: true });
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
function safe(v) { const s = v == null ? "" : v; return typeof s === "string" && /^[=+\-@]/.test(s) ? "'" + s : s; } // 수식 주입 방지
function isEmail(v) { return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function clip(v, n) { return String(v || "").slice(0, n); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
