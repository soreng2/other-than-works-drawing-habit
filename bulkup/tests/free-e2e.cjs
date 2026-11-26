// 공개 무료 진단 + 수집기 검증
// 실행: node bulkup/tests/free-e2e.cjs  (Playwright 필요)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
require(path.join(root, 'tools', 'build-public.cjs'));
const OUT = fs.mkdtempSync(require('os').tmpdir() + '/otw-free-'); // 실행마다 새 폴더
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
  const bctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await bctx.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  let posted = null; const posts = [];
  await p.route('https://script.google.com/**', async route => { const d = route.request().postData(); posts.push(JSON.parse(d)); if (JSON.parse(d).kind === 'free-diagnosis') posted = d; await route.fulfill({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } }); });
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
  const cta = await p.evaluate(() => ['cta-report', 'cta-classes', 'cta-kakao'].map(id => { const a = document.getElementById(id); return { href: a.href, text: a.textContent, dis: a.getAttribute('aria-disabled'), via: a.dataset.via }; }));
  console.log('cta:', JSON.stringify(cta));
  check(cta[0].href === 'https://www.instagram.com/other.than.works/' && cta[0].text.includes('인스타 DM') && cta[0].dis === null, '결제 링크가 비면 리포트 버튼은 인스타 DM으로 (비활성 아님)');
  check(cta[1].href.startsWith('https://otherthanworks.notion.site/') && cta[2].text === '인스타 DM 문의', '수업 둘러보기 = 공식 노션, 문의 = 인스타 DM');
  const O2 = require(path.join(root, 'otw-core.js'));
  const expectOpen = O2.openProducts(Date.now()).map(o => o.key);
  const openUI = await p.evaluate(() => ({ hidden: document.getElementById('open-box').hidden, items: [...document.querySelectorAll('#open-list .open-item')].map(x => ({ t: x.querySelector('h3').textContent, b: x.querySelector('.badge').textContent, href: x.querySelector('a').href, cta: x.querySelector('a').dataset.cta })) }));
  console.log('open:', JSON.stringify(openUI));
  check(openUI.items.length === expectOpen.length && openUI.items.every(it => expectOpen.includes(it.cta)), `지금 신청 가능한 수업 ${openUI.items.length}개 (오늘 날짜 기준)`);
  const club = openUI.items.find(i => i.cta === 'vintageClub');
  if (expectOpen.includes('vintageClub')) check(!!club && club.href.startsWith('https://docs.google.com/forms/d/e/1FAIpQLSdMA5IyvWvyUHV39iuQckXqlgUk3viVKqgXHVQG7DjlfEi5BQ/viewform') && /모집 중/.test(club.b), '빈티지 클럽: 구글폼 신청 + 개강 D-day');
  const ws = openUI.items.find(i => i.cta === 'workshop');
  check(!!ws && ws.href === 'https://www.instagram.com/other.than.works/' && ws.b === '상시 상담', '1:1 맞춤 워크숍: 인스타 DM 상담');
  check(O2.openProducts(Date.parse('2026-12-02T20:30:00+09:00')).every(o => o.key !== 'vintageClub') && O2.openProducts(Date.parse('2026-12-01T10:00:00+09:00'))[0].badge === '모집 중 · 내일 개강', '개강 시각이 지나면 클럽 자동 마감, 전날은 "내일 개강"');
  // 리포트 버튼 누르면 신청 문구 복사 + 클릭 기록
  const [popup] = await Promise.all([p.waitForEvent('popup').catch(() => null), p.click('#cta-report')]);
  if (popup) await popup.close();
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(clip.startsWith('[6축 리포트 신청] 소랭 /') && (await p.$eval('#cta-note', e => e.textContent)).includes('복사했어요'), 'DM 신청 문구 자동 복사: ' + clip);
  check(posts.some(x => x.kind === 'cta-click' && x.cta === 'report' && x.via === 'dm' && x.leadId && x.leadId === JSON.parse(posted).leadId), '버튼 클릭 기록 전송 (같은 leadId)');
  check(await p.evaluate(() => getComputedStyle(document.getElementById('r-art')).display === 'none' && getComputedStyle(document.getElementById('r-svg')).display !== 'none' && window.__free.cardHasArt === false), '일러스트 파일이 없으면 이미지 자리 숨기고 기본 캐릭터 (실제 화면 기준)');
  const before = posts.filter(x => x.kind === 'free-diagnosis').length;
  await p.evaluate(() => document.getElementById('lead-form').dispatchEvent(new Event('submit', { cancelable: true })));
  await p.waitForTimeout(200);
  check(posts.filter(x => x.kind === 'free-diagnosis').length === before, '중복 제출 방지');

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
  check(r1.mails.length === 2 && r1.mails[0][0].to === 'hello@example.com' && r1.mails[1][0] === 'mon.mut.friends@gmail.com', '방문자 결과 메일 + 대표(mon.mut.friends@gmail.com) 알림 메일');
  check(sheet.rows[1][sheet.rows[0].indexOf('leadId')] === body.leadId && !!body.leadId, '응답 줄에 leadId 저장');
  const r2 = runCollector({ ...body, name: '=HYPERLINK("x")', email: '' , phone: '01099998888' });
  check(r2.sheets['무료진단'].rows[1][1].startsWith("'="), '수식 주입 방지');
  check(r2.mails.length === 1 && r2.mails[0][0] === 'mon.mut.friends@gmail.com', '방문자 이메일 없으면 대표 알림만');
  const clickEv = posts.find(x => x.kind === 'cta-click' && x.cta === 'report');
  const r3 = runCollector(clickEv || {});
  check(!!clickEv && r3.res.ok && r3.sheets['클릭'].rows[1][2] === '유료 리포트' && r3.sheets['클릭'].rows[1][3] === '인스타 DM' && r3.sheets['클릭'].rows[1][7] === body.leadId, '클릭 시트: 누른 버튼·연결·leadId 기록');
  check(runCollector({ kind: 'cta-click' }).res.ok === false, '잘못된 클릭 기록 거부');
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

  // 4-2) 유형 일러스트가 있을 때: 별도 사이트 폴더에 PNG를 넣고 확인 (레포 파일은 건드리지 않음)
  const site = OUT + '/site';
  fs.mkdirSync(site + '/assets/types', { recursive: true });
  fs.copyFileSync(path.join(root, 'public', 'index.html'), site + '/index.html');
  fs.copyFileSync(path.join(root, 'public', 'otw-core.js'), site + '/otw-core.js');
  const artPng = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#F6B8A8'; x.beginPath(); x.arc(200, 200, 160, 0, Math.PI * 2); x.fill(); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(site + '/assets/types/clean-deform-observe.png', Buffer.from(artPng, 'base64'));
  const q = await bctx.newPage();
  q.on('pageerror', e => errors.push('art page: ' + e.message));
  await q.goto('file://' + site + '/index.html'); await q.waitForTimeout(300);
  await q.click('#btn-start');
  for (const [pv, cv] of AX) { const segs = await q.$$('#quiz-body .seg'); await (await segs[0].$$('button'))[pv - 1].click(); await (await segs[1].$$('button'))[cv - 1].click(); await q.click('#btn-next'); }
  const sg2 = await q.$$('#quiz-body .seg'); for (const [i, v] of [4, 4, 3, 2, 5].entries()) await (await sg2[i].$$('button'))[v - 1].click();
  await q.click('#btn-next');
  await q.fill('#f-name', '테스트'); await q.fill('#f-phone', '010-2222-3333'); await q.check('#c-privacy'); await q.click('#btn-submit');
  await q.waitForTimeout(900);
  const artState = await q.evaluate(() => ({ img: getComputedStyle(document.getElementById('r-art')).display !== 'none', svg: getComputedStyle(document.getElementById('r-svg')).display === 'none', src: document.getElementById('r-art').getAttribute('src'), card: window.__free.cardHasArt }));
  console.log('art:', JSON.stringify(artState));
  check(artState.img && artState.svg && artState.src === './assets/types/clean-deform-observe.png' && artState.card, '일러스트가 있으면 결과 화면과 결과 카드에 표시 (./assets/types/{key}.png)');
  await q.screenshot({ path: OUT + '/6-result-art.png' });
  const [dl] = await Promise.all([q.waitForEvent('download', { timeout: 3000 }).catch(() => null), q.click('#btn-card')]);
  await q.waitForFunction(() => document.getElementById('share-status').textContent.trim().length > 0, null, { timeout: 8000 }).catch(() => {});
  const shareSt = await q.$eval('#share-status', e => e.textContent);
  check(!!dl || !(await q.$eval('#share-img', e => e.hidden)), '일러스트 카드 저장 (파일 출처 제한이 걸려도 이미지 없이 저장) · ' + shareSt);
  fs.writeFileSync(OUT + '/card-art.png', Buffer.from(await q.evaluate(() => { try { return document.getElementById('share-card').toDataURL('image/png').split(',')[1]; } catch (e) { return ''; } }), 'base64'));
  await q.close();

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
