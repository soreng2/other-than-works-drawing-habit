// 공개 무료 진단 + 수집기 검증
// 실행: node bulkup/tests/free-e2e.cjs  (Playwright 필요)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
require(path.join(root, 'tools', 'build-public.cjs'));
const OUT = require('os').tmpdir() + '/otw-free';
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

/* ── 1) Apps Script 수집기를 가짜 구글 환경에서 실행 ── */
function runCollector(payload) {
  const sheets = {}, mails = [];
  const mkSheet = (name) => { const rows = []; return { name, rows, appendRow: r => rows.push(r), getLastRow: () => rows.length, setFrozenRows() {},
    getRange: (r, c, nr, nc) => ({ getValues: () => rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)), setValue: v => { rows[r - 1][c - 1] = v; } }) }; };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)) }) },
    MailApp: { sendEmail: (...a) => mails.push(a) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: t => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'lead-collector.gs'), 'utf8') + '\nthis.__doPost = doPost;', ctx);
  const res = ctx.__doPost({ postData: { contents: JSON.stringify(payload) } });
  return { res: JSON.parse(res.text), sheets, mails };
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  let posted = null;
  await p.route('https://script.google.com/**', async route => { posted = route.request().postData(); await route.fulfill({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } }); });
  await p.goto('file://' + path.join(root, 'public', 'index.html') + '?utm_source=instagram&utm_medium=carousel&utm_campaign=type-quiz');
  await p.waitForTimeout(600);
  check(await p.title() === '내 그림체 6축 진단', '빌드된 페이지 제목');
  check(await p.$eval('#setup-notice', e => !e.hidden), '수집 주소가 비어 있으면 운영자 안내 표시');
  check((await p.$$('#type-chips span')).length === 8, '훅 화면에 유형 8가지');
  await p.screenshot({ path: OUT + '/1-intro.png' });
  await p.evaluate(() => { window.OTW.CONFIG.leadEndpoint = 'https://script.google.com/macros/s/TEST/exec'; });

  await p.click('#btn-start');
  await p.click('#btn-next');
  check((await p.$eval('#quiz-err', e => e.textContent)).includes('골라 주세요'), '안 고르고 다음 → 안내');
  // 6축: 선 클린(5)/5, 형태 데포르메(1)/4, 색 4/4, 질감 플랫(1)/4, 구성 2/3, 정서 3/3 → 굿즈형
  const AX = [[5, 5], [1, 4], [4, 4], [1, 4], [2, 3], [3, 3]];
  for (const [pv, cv] of AX) {
    const segs = await p.$$('#quiz-body .seg');
    await (await segs[0].$$('button'))[pv - 1].click();
    await (await segs[1].$$('button'))[cv - 1].click();
    await p.click('#btn-next');
  }
  const sigSegs = await p.$$('#quiz-body .seg');
  check(sigSegs.length === 5, '마지막 단계: 상업 신호 5문항');
  for (const [i, v] of [4, 4, 3, 2, 5].entries()) await (await sigSegs[i].$$('button'))[v - 1].click();
  await p.screenshot({ path: OUT + '/2-quiz.png' });
  await p.click('#btn-next');
  check(await p.$eval('#s-lead', e => !e.hidden), '17문항 끝 → 연락처 화면 (결과보다 먼저)');
  check(await p.$eval('#s-result', e => e.hidden && getComputedStyle(e).display === 'none') && await p.$eval('#s-intro', e => getComputedStyle(e).display === 'none'), '연락처 전에는 결과·훅 화면이 실제로 안 보임');

  // 검증 규칙
  await p.click('#btn-submit');
  check((await p.$eval('#lead-err', e => e.textContent)).includes('닉네임'), '닉네임 필수');
  await p.fill('#f-name', '소랭');
  await p.click('#btn-submit');
  check((await p.$eval('#lead-err', e => e.textContent)).includes('이메일이나 휴대폰'), '이메일·휴대폰 중 하나 필수');
  await p.fill('#f-email', 'abc@');
  await p.click('#btn-submit');
  check((await p.$eval('#lead-err', e => e.textContent)).includes('이메일 형식'), '이메일 형식 검사');
  await p.fill('#f-email', 'hello@example.com');
  await p.fill('#f-phone', '010-12');
  await p.click('#btn-submit');
  check((await p.$eval('#lead-err', e => e.textContent)).includes('휴대폰 번호'), '휴대폰 형식 검사');
  await p.fill('#f-phone', '010-1234-5678');
  await p.click('#btn-submit');
  check((await p.$eval('#lead-err', e => e.textContent)).includes('개인정보'), '개인정보 동의 필수');
  await p.fill('#f-insta', '@sorang.draws');
  await p.selectOption('#f-goal', 'emoticon');
  await (await p.$$('#chips button'))[0].click(); await (await p.$$('#chips button'))[4].click();
  await p.fill('#f-question', '캐릭터가 귀여운데 이모티콘이 계속 반려돼요');
  await p.check('#c-privacy'); await p.check('#c-marketing');
  await p.screenshot({ path: OUT + '/3-lead.png', fullPage: true });
  await p.click('#btn-submit');
  await p.waitForTimeout(800);

  check(await p.$eval('#s-result', e => !e.hidden) && await p.$eval('#s-lead', e => getComputedStyle(e).display === 'none'), '결과 화면만 표시 (연락처 화면 실제로 숨김)');
  const res = await p.evaluate(() => ({ type: document.getElementById('r-type').textContent, surprise: document.getElementById('r-surprise').textContent, top: document.getElementById('r-top').textContent,
    locked: [...document.querySelectorAll('.lock .v')].map(x => x.textContent), toc: [...document.querySelectorAll('#r-toc li')].length, launch: document.getElementById('r-launch').textContent,
    send: document.getElementById('send-status').textContent, ctaDisabled: document.getElementById('cta-report').getAttribute('aria-disabled'), note: document.getElementById('cta-note').textContent }));
  console.log('result:', JSON.stringify(res));
  check(res.type === '단정한 마스코트 메이커', '유형 공개: ' + res.type);
  check(res.top === '캐릭터 굿즈', '1위 공개 (이모티콘처럼 보여도 굿즈): ' + res.top);
  check(res.surprise.includes('의외였던 점') && res.surprise.includes('이모티콘'), '의외의 한 가지: 하고 싶은 길(이모티콘)과 1위가 다름');
  check(res.locked.every(v => v === '●●●●●') && res.locked.length === 3, '2·3위·등급은 잠김 (값 노출 없음)');
  check(res.toc >= 9 && res.launch === '19,000원', `유료 리포트 목차 ${res.toc}개 + 런칭가`);
  check(res.ctaDisabled === 'true' && res.note.includes('DM'), '결제 링크 비어 있으면 버튼 비활성 + 인스타 DM 안내');
  check(res.send.includes('(hello@example.com)로도'), '수집 성공 안내: ' + res.send);
  await p.screenshot({ path: OUT + '/4-result.png', fullPage: true });

  // 전송된 데이터
  const body = JSON.parse(posted || '{}');
  check(body.kind === 'free-diagnosis' && body.name === '소랭' && body.email === 'hello@example.com' && body.phone === '01012345678', '연락처 전송');
  check(body.interests.length === 2 && body.question.includes('반려') && body.consentMarketing === true, '궁금한 점·관심사·마케팅 동의 전송');
  check(body.utm.source === 'instagram' && body.utm.campaign === 'type-quiz', 'UTM 유입 경로 전송');
  check(body.type === res.type && body.top1 === res.top && body.axes.line === 100 && /유료 리포트/.test(body.resultText), '결과·축 값·메일 본문 전송');

  // 2) 수집기 실행
  const r1 = runCollector(body);
  const sheet = r1.sheets['무료진단'], tallyS = r1.sheets['관심사 집계'];
  check(r1.res.ok && sheet.rows.length === 2 && sheet.rows[1][1] === '소랭' && sheet.rows[1][3] === "'01012345678", '시트에 헤더 + 응답 1줄 (전화번호 앞자리 0 보존)');
  check(tallyS.rows.length === 3 && tallyS.rows[1][1] === 1, '관심사 집계 시트 생성');
  check(r1.mails.length === 1 && r1.mails[0][0].to === 'hello@example.com', '방문자에게 결과 메일 (대표 메일 비어 있으면 알림 생략)');
  const r2 = runCollector({ ...body, name: '=HYPERLINK("x")', email: '' , phone: '01099998888' });
  check(r2.sheets['무료진단'].rows[1][1].startsWith("'="), '수식 주입 방지');
  check(r2.mails.length === 0, '이메일 없으면 메일 발송 없음');
  check(runCollector({ ...body, consentPrivacy: false }).res.ok === false, '동의 없는 데이터 거부');

  // 3) 공유
  await p.click('#btn-link'); await p.waitForTimeout(150);
  const shareTxt = await p.$eval('#share-status', e => e.textContent);
  check(/복사|ref=share/.test(shareTxt), '공유 링크 (ref=share)');
  const card = await p.evaluate(() => document.getElementById('share-card').toDataURL('image/png').split(',')[1]);
  fs.writeFileSync(OUT + '/card.png', Buffer.from(card, 'base64'));

  // 4) 스튜디오와 같은 답 → 같은 결과
  const parity = await p.evaluate(() => { const s = window.__free.state; const O = window.OTW; return { top: O.scorePaths(s)[0].key, type: O.typeOf(s).key, axes: O.AXES.map(a => s.axes[a.key].position) }; });
  const O = require(path.join(root, 'otw-core.js'));
  const self = { axes: {}, signals: {}, complete: true };
  O.AXES.forEach((a, i) => { self.axes[a.key] = { position: (AX[i][0] - 1) * 25, consistency: AX[i][1] }; });
  ['craft', 'character', 'expression', 'narrative', 'production'].forEach((k, i) => { self.signals[k] = [4, 4, 3, 2, 5][i]; });
  const st2 = O.buildResult({ name: '소랭', goal: 'emoticon' }, null, self);
  check(O.scorePaths(st2)[0].key === parity.top && O.typeOf(st2).key === parity.type, '무료 페이지와 대표 스튜디오가 같은 답에 같은 결과');

  // 5) 다크·좁은 화면·처음부터
  const m = await b.newPage({ viewport: { width: 360, height: 740 }, colorScheme: 'dark' });
  m.on('pageerror', e => errors.push('m: ' + e.message));
  await m.goto('file://' + path.join(root, 'public', 'index.html')); await m.waitForTimeout(400);
  check(await m.evaluate(() => document.documentElement.scrollWidth) <= 360, '360px 화면 가로 넘침 없음');
  await m.screenshot({ path: OUT + '/5-dark.png', fullPage: true });
  await p.click('#btn-restart');
  check(await p.$eval('#s-intro', e => !e.hidden), '처음부터 다시 하기');
  check(errors.length === 0, '콘솔 에러 없음 ' + JSON.stringify(errors));
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS', '· screenshots in', OUT);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
