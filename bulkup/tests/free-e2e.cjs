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
    getRange: (r, c, nr, nc) => ({ createTextFinder: value => ({matchEntireCell: () => ({findNext: () => rows.some(x=>x[c-1]===value)})}), getValues: () => rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)), setValue: v => { rows[r - 1][c - 1] = v; } }) }; };
  const ctx = {
    CacheService:{ getScriptCache:()=>({get:()=>null,put(){}}) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'OWNER_EMAIL' ? 'owner@example.com' : null }) },
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
  const b = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const errors = [];
  const bctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await bctx.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  let posted = null; const posts = [];
  await bctx.route('https://fonts.**/*',r=>r.abort());
  await bctx.route('https://script.google.com/**', async route => { const raw = route.request().postData(); const d = raw.startsWith('{') ? raw : new URLSearchParams(raw).get('payload'); posts.push(JSON.parse(d)); if (JSON.parse(d).kind === 'free-diagnosis') posted = d; await route.fulfill({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } }); });
  await p.goto('file://' + path.join(root, 'public', 'index.html') + '?utm_source=instagram&utm_medium=carousel&utm_campaign=type-quiz&debug=1');
  await p.waitForTimeout(600);
  check(await p.title() === '내 그림체 6축 진단', '빌드된 페이지 제목');
  // 유형 일러스트 규격: 800×800 투명(RGBA) PNG, 500KB 이하, 8개 모두
  const typeKeys = ['clean-deform-story', 'clean-deform-observe', 'clean-real-story', 'clean-real-observe', 'rough-deform-story', 'rough-deform-observe', 'rough-real-story', 'rough-real-observe'];
  const badArt = typeKeys.filter(k => {
    const f = path.join(root, 'public', 'assets', 'types', k + '.png');
    if (!fs.existsSync(f)) return true;
    const buf = fs.readFileSync(f);
    if (buf.length > 500 * 1024) return true;
    return !(buf.slice(1, 4).toString() === 'PNG' && buf.readUInt32BE(16) === 800 && buf.readUInt32BE(20) === 800 && buf[25] === 6);
  });
  check(badArt.length === 0, '유형 일러스트 8개 규격 (800×800 RGBA PNG, 500KB 이하)' + (badArt.length ? ': ' + badArt.join(',') : ''));
  check(await p.locator('.report-link:visible').count() === 0, '첫 방문 유료 신청 숨김');
  const hero = await p.locator('.hero-art').evaluate(img => img.naturalWidth > 0);
  const start = await p.locator('#btn-start').boundingBox();
  check(hero && start.y + start.height <= 844, '첫 화면 캐릭터와 시작 버튼');
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
  check(await p.evaluate(() => document.querySelectorAll('#quiz-body .seg button.na').length === 2), '캐릭터·표정 문항에 "해당 없음" 버튼');
  await p.screenshot({ path: OUT + '/2-quiz.png' });
  await p.click('#btn-next');
  const hbSegs = await p.$$('#quiz-body .seg');
  check(hbSegs.length === 4, '작업 습관 4문항 (마무리·색·구도·디지털)');
  await p.click('#btn-next');
  check((await p.$eval('#quiz-err', e => e.textContent)).includes('골라 주세요'), '습관 안 고르면 안내');
  for (const [i, v] of [4, 4, 3, 4].entries()) await (await hbSegs[i].$$('button'))[v - 1].click();
  await p.selectOption('#f-goal','emoticon');
  await p.click('#btn-next');
  check(await p.locator('#s-result').isVisible() && !posted,'연락처 제출 없이 결과 표시');
  check((await p.locator('#project-task').innerText()).includes('출시 알림'), '선택한 이모티콘 판매 실험');
  check(await p.locator('.deliverables li:visible').count() === 3, '결과 뒤 피드백 항목 공개');
  await p.click('#contact-open');
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

  await (await p.$$('#chips button'))[0].click(); await (await p.$$('#chips button'))[4].click();
  await p.fill('#f-question', '캐릭터가 귀여운데 이모티콘이 계속 반려돼요');
  await p.check('#c-privacy'); await p.check('#c-marketing');
  await p.screenshot({ path: OUT + '/3-lead.png', fullPage: true });
  await p.click('#btn-submit');
  await p.waitForTimeout(800);

  check(await p.$eval('#s-result', e => !e.hidden) && await p.$eval('#s-lead', e => getComputedStyle(e).display === 'none'), '결과 화면만 표시 (연락처 화면 실제로 숨김)');
  const res = await p.evaluate(()=>({type:document.getElementById('r-type').textContent,top:window.OTW.scorePaths(window.__free.state)[0].name}));
  check(res.type==='단정한 마스코트 메이커','작업 성향');
  check((await p.locator('#project-title').innerText()).includes('이모티콘'),'희망 분야로 과제 선택');
  check(await p.locator('#r-axes .axis').count()===6 && await p.locator('#r-rx li').count()===7,'6축 및 7일 연습표');
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
  check((await p.locator('#result-offer .report-link').getAttribute('href')).includes('instagram.com'),'DM 신청');
  await bctx.route('https://www.instagram.com/**', route => route.fulfill({body: 'DM handoff'}));
  const popupPromise = p.waitForEvent('popup');
  await p.locator('#result-offer .report-link').tap();
  const dm = await popupPromise;
  await dm.waitForLoadState();
  check(new URL(dm.url()).pathname === '/other.than.works/', '신청 버튼 터치로 소랭 프로필 열기');
  await dm.close();
  await p.waitForTimeout(150);
  // 일러스트가 있으면 그림, 없으면 기본 캐릭터 (지금은 8장이 다 들어가 있어 그림 쪽을 본다)
  const artKey = await p.evaluate(() => window.OTW.typeOf(window.__free.state).key);
  const artShipped = fs.existsSync(path.join(root, 'public', 'assets', 'types', artKey + '.png'));
  check(await p.evaluate(has => {
    const img = document.getElementById('r-art'), svg = document.getElementById('r-svg');
    const imgShown = getComputedStyle(img).display !== 'none', svgShown = getComputedStyle(svg).display !== 'none';
    return has
      ? imgShown && !svgShown && img.getAttribute('src') === './assets/types/' + window.OTW.typeOf(window.__free.state).key + '.png' && window.__free.cardHasArt === true
      : !imgShown && svgShown && window.__free.cardHasArt === false;
  }, artShipped), artShipped ? '일러스트가 있으면 결과 화면·결과 카드에 그림 표시 (실제 화면 기준)' : '일러스트 파일이 없으면 이미지 자리 숨기고 기본 캐릭터 (실제 화면 기준)');
  check((await p.locator('#send-status').innerText()).includes('새 창'),'서버 영수증에서 결과 확인');
  // 전송된 데이터
  const body = JSON.parse(posted || '{}');
  check(body.kind === 'free-diagnosis' && body.name === '소랭' && body.email === 'hello@example.com' && body.phone === '01012345678', '연락처 전송');
  check(body.interests.length === 2 && body.question.includes('반려') && body.consentMarketing === true, '궁금한 점·관심사·마케팅 동의 전송');
  check(body.utm.source === 'instagram' && body.utm.campaign === 'type-quiz', 'UTM 유입 경로 전송');
  check(body.type === res.type && body.top1 === res.top && body.axes.line === 100 && body.resultText.includes("이모티콘"), '결과·축 값·메일 본문 전송');

  // 2) 수집기 실행
  const r1 = runCollector(body);
  const sheet = r1.sheets['무료진단'], tallyS = r1.sheets['관심사 집계'];
  check(r1.res.ok && sheet.rows.length === 2 && sheet.rows[1][1] === '소랭' && sheet.rows[1][3] === "'01012345678", '시트에 헤더 + 응답 1줄 (전화번호 앞자리 0 보존)');
  check(tallyS.rows.length === 3 && tallyS.rows[1][1] === 1, '관심사 집계 시트 생성');
  check(r1.mails.length === 2 && r1.mails[0][0].to === 'hello@example.com' && r1.mails[1][0] === 'owner@example.com', '방문자 결과 메일 + 대표(owner@example.com) 알림 메일');
  check(sheet.rows[1][sheet.rows[0].indexOf('leadId')] === body.leadId && !!body.leadId, '응답 줄에 leadId 저장');
  const r2 = runCollector({ ...body, name: '=HYPERLINK("x")', email: '' , phone: '01099998888' });
  check(r2.sheets['무료진단'].rows[1][1].startsWith("'="), '수식 주입 방지');
  check(r2.mails.length === 1 && r2.mails[0][0] === 'owner@example.com', '방문자 이메일 없으면 대표 알림만');
  const clickEv = posts.find(x => x.kind === 'cta-click' && x.cta === 'report');
  const r3 = runCollector(clickEv || {});
  check(!!clickEv && r3.res.ok && r3.sheets['클릭'].rows[1][2] === '유료 리포트' && r3.sheets['클릭'].rows[1][3] === '인스타 DM' && r3.sheets['클릭'].rows[1][7] === body.leadId, '클릭 시트: 누른 버튼·연결·leadId 기록');
  check(runCollector({ kind: 'cta-click' }).res.ok === false, '잘못된 클릭 기록 거부');
  check(runCollector({ ...body, consentPrivacy: false }).res.ok === false, '동의 없는 데이터 거부');

  // 3) 공유
  await p.click('#btn-link'); await p.waitForTimeout(150);
  const shareTxt = await p.$eval('#share-status', e => e.textContent);
  check(/복사|ref=share/.test(shareTxt), '공유 링크 (ref=share)');
  // file:// 에서는 일러스트가 캔버스를 오염시켜 toDataURL 이 막힌다 → 앱이 그림 없이 다시 그려 저장하는지 확인
  const card = await p.evaluate(() => { try { return document.getElementById('share-card').toDataURL('image/png').split(',')[1]; } catch (e) { return null; } });
  if (card) fs.writeFileSync(OUT + '/card.png', Buffer.from(card, 'base64'));
  else {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('#btn-card')]);
    check(!!dl && /저장/.test(await p.$eval('#share-status', e => e.textContent)), '일러스트로 캔버스가 막히면 카드 저장은 그림 없이 대체');
  }

  // 4) 스튜디오와 같은 답 → 같은 결과
  const parity = await p.evaluate(() => { const s = window.__free.state; const O = window.OTW; return { top: O.scorePaths(s)[0].key, type: O.typeOf(s).key, axes: O.AXES.map(a => s.axes[a.key].position) }; });
  const O = require(path.join(root, 'otw-core.js'));
  const self = { axes: {}, signals: {}, craft: { finish: 8, colorh: 8, compo: 6, digital: 8 }, complete: true };
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
  await q.goto('file://' + site + '/index.html?debug=1'); await q.waitForTimeout(300);
  await q.click('#btn-start');
  for (const [pv, cv] of AX) { const segs = await q.$$('#quiz-body .seg'); await (await segs[0].$$('button'))[pv - 1].click(); await (await segs[1].$$('button'))[cv - 1].click(); await q.click('#btn-next'); }
  const sg2 = await q.$$('#quiz-body .seg'); for (const [i, v] of [4, 4, 3, 2, 5].entries()) await (await sg2[i].$$('button'))[v - 1].click();
  await q.click('#btn-next');
  const hb2 = await q.$$('#quiz-body .seg'); for (const [i, v] of [4, 4, 3, 4].entries()) await (await hb2[i].$$('button'))[v - 1].click();
  await q.click('#btn-next');

  await q.waitForTimeout(900);
  const artState = await q.evaluate(() => ({ img: getComputedStyle(document.getElementById('r-art')).display !== 'none', svg: getComputedStyle(document.getElementById('r-svg')).display === 'none', src: document.getElementById('r-art').getAttribute('src'), card: window.__free.cardHasArt }));
  console.log('art:', JSON.stringify(artState));
  check(artState.img && artState.svg && artState.src === './assets/types/clean-deform-observe.png' && artState.card, '일러스트가 있으면 결과 화면과 결과 카드에 표시 (./assets/types/{key}.png)');
  await q.screenshot({ path: OUT + '/6-result-art.png' });
  check(await q.evaluate(() => !document.getElementById('r-history').hidden && document.querySelectorAll('#r-history-rows .hist-row').length === 6), '두 번째 진단: 지난 진단과 6축 비교 표시');
  const [dl] = await Promise.all([q.waitForEvent('download', { timeout: 3000 }).catch(() => null), q.click('#btn-card')]);
  await q.waitForFunction(() => document.getElementById('share-status').textContent.trim().length > 0, null, { timeout: 8000 }).catch(() => {});
  const shareSt = await q.$eval('#share-status', e => e.textContent);
  check(!!dl || !(await q.$eval('#share-img', e => e.hidden)), '일러스트 카드 저장 (파일 출처 제한이 걸려도 이미지 없이 저장) · ' + shareSt);
  fs.writeFileSync(OUT + '/card-art.png', Buffer.from(await q.evaluate(() => { try { return document.getElementById('share-card').toDataURL('image/png').split(',')[1]; } catch (e) { return ''; } }), 'base64'));
  await q.close();

  // 4-3) 하고 싶은 길은 항상 2위 안 + 내부 상태는 debug 없이는 숨김
  const plain = await bctx.newPage();
  await plain.goto('file://' + path.join(root, 'public', 'index.html')); await plain.waitForTimeout(300);
  check(await plain.evaluate(() => typeof window.__free === 'undefined' && typeof window.__lastLead === 'undefined'), '일반 방문 시 결과를 담은 전역 변수 없음');
  await plain.close();

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
