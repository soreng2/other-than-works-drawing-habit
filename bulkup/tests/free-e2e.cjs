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
  check(['이모티콘', '캐릭터 굿즈'].includes(res.top), '1위 공개 (하고 싶은 이모티콘은 동기 +6으로 근소한 굿즈를 넘을 수 있음): ' + res.top);
  check(res.surprise.startsWith('의외였던 점 · ') && res.surprise.length > 20, '의외의 한 가지 공개: ' + res.surprise);
  check(res.locked.every(v => v === '●●●●●') && res.locked.length === 3, '나머지 순위·등급은 잠김 (값 노출 없음)');
  // 무료 고급화: 유형 프로필 · 축 해석 · 굳은/흔들리는 축 · 상업 신호 · 7일 루틴 · 미리보기 · 비교표 · 방법
  const rich = await p.evaluate(() => ({
    strengths: document.querySelectorAll('#r-strengths li').length, pitfalls: document.querySelectorAll('#r-pitfalls li').length, worries: document.querySelectorAll('#r-worries span').length, kv: document.querySelectorAll('#r-kv div').length,
    means: [...document.querySelectorAll('#r-axes .mean')].filter(e => e.textContent.length > 5).length, badges: document.querySelectorAll('#r-axes .cbadge').length,
    fixed: document.querySelectorAll('#r-fixed span').length, shaky: document.querySelectorAll('#r-shaky span').length, sigs: document.querySelectorAll('#r-sigs .sigrow').length,
    seven: document.querySelectorAll('#r-rx li').length, pvOpen: document.getElementById('pv-open').textContent.length, pvBlur: getComputedStyle(document.getElementById('pv-blur')).filter,
    cmp: document.querySelectorAll('#r-compare tr').length, method: document.querySelectorAll('#r-method li').length }));
  console.log('rich:', JSON.stringify(rich));
  check(rich.strengths === 3 && rich.pitfalls === 2 && rich.worries === 2 && rich.kv === 4, '유형 프로필: 강점 3 · 함정 2 · 흔한 고민 2 · 도구/첫 프로젝트/협업/반대 유형');
  check(rich.means === 6 && rich.badges === 6 && rich.fixed >= 1 && rich.shaky >= 1, '6축 한 줄 해석 + 굳음/흔들림 표시 + 축 지도');
  check(rich.sigs === 5 && rich.seven === 7, '상업 신호 5개(답변 기준) + 7일 미니 루틴');
  check(rich.pvOpen <= 96 && /blur/.test(rich.pvBlur), '내 리포트 미리보기: 앞부분만 공개, 나머지 흐림');
  check(rich.cmp === 10 && rich.method === 4, '무료 vs 유료 비교표 10줄 + 진단 방법 4줄');
  check(await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('otw-free-history')).length >= 1; } catch (e) { return false; } }), '이 기기에 진단 기록 저장 (재진단 비교용)');
  const freeTxt = await p.evaluate(() => document.getElementById('s-result').innerText.replace(document.getElementById('r-goal').innerText, ''));
  check(!/(그림책|이모티콘|캐릭터 굿즈|인스타툰|포트폴리오·외주)\s*·?\s*[2-5]위/.test(freeTxt) && !/\d+점\s*\([A-D]\)/.test(freeTxt) && !/[A-D]등급/.test(freeTxt), '무료 화면 전체: 2~5위 길 이름·점수·등급 문구 없음');
  // 새는 곳 점검: 무료 화면 어디에도 1위·하고 싶은 길 말고 다른 길 이름이 나오면 안 된다
  const leakTxt = await p.evaluate(() => ['r-locked', 'r-toc', 'r-size', 'r-top', 'r-goalrow', 'r-locknote', 'r-surprise', 'r-rx', 'r-type', 'r-hook', 'r-desc'].map(id => document.getElementById(id).innerText).join(' | '));
  const others = ['그림책', '이모티콘', '캐릭터 굿즈', '인스타툰', '포트폴리오·외주'].filter(n => n !== res.top && n !== '이모티콘' && leakTxt.includes(n));
  console.log('free text:', leakTxt.slice(0, 600));
  check(others.length === 0, '무료 결과·잠긴 목차에 1위와 하고 싶은 길 말고 다른 길 이름 없음' + (others.length ? ' → 샘: ' + others.join(',') : ''));
  check(await p.evaluate(() => !document.getElementById('r-goalrow').hidden && document.getElementById('r-goal').textContent.startsWith('이모티콘 · ') && /[12]위 ✓/.test(document.getElementById('r-goal').textContent)), '하고 싶은 길(이모티콘)이 몇 위인지만 공개 (1~2위)');
  const html = await p.content();
  check(!/상업성 [123]위/.test(html) && !html.includes('2위 길</span><span class="v">' ) , '잠긴 목차에 길 이름+순위 문구 없음');
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
  await q.goto('file://' + site + '/index.html?debug=1'); await q.waitForTimeout(300);
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
  check(await q.evaluate(() => !document.getElementById('r-history').hidden && document.querySelectorAll('#r-history-rows .hist-row').length === 6), '두 번째 진단: 지난 진단과 6축 비교 표시');
  const [dl] = await Promise.all([q.waitForEvent('download', { timeout: 3000 }).catch(() => null), q.click('#btn-card')]);
  await q.waitForFunction(() => document.getElementById('share-status').textContent.trim().length > 0, null, { timeout: 8000 }).catch(() => {});
  const shareSt = await q.$eval('#share-status', e => e.textContent);
  check(!!dl || !(await q.$eval('#share-img', e => e.hidden)), '일러스트 카드 저장 (파일 출처 제한이 걸려도 이미지 없이 저장) · ' + shareSt);
  fs.writeFileSync(OUT + '/card-art.png', Buffer.from(await q.evaluate(() => { try { return document.getElementById('share-card').toDataURL('image/png').split(',')[1]; } catch (e) { return ''; } }), 'base64'));
  await q.close();

  // 4-3) 하고 싶은 길은 항상 2위 안 + 내부 상태는 debug 없이는 숨김
  const O3 = require(path.join(root, 'otw-core.js'));
  const rr = O3.rng(5); let worst = 0;
  for (const goal of O3.GENRES.map(g => g.key)) for (let i = 0; i < 3000; i++) {
    const s = { goal, axes: {}, signals: {} };
    O3.AXES.forEach(a => { s.axes[a.key] = { position: O3.clamp(50 + 22 * O3.gauss(rr), 0, 100), consistency: 1 + Math.floor(rr() * 5) }; });
    ['craft', 'character', 'expression', 'narrative', 'production'].forEach(k => { s.signals[k] = { score: 1 + Math.floor(rr() * 5) }; });
    worst = Math.max(worst, O3.scorePaths(s).findIndex(p => p.key === goal) + 1);
  }
  check(worst <= 2, `하고 싶은 길 5종 × 무작위 3,000명: 가장 낮은 순위 ${worst}위 (2위 안 보장)`);
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
