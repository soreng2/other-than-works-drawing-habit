// 6축 진단 스튜디오 검증: 가짜 Claude 런타임을 주입해 규칙·흐름·실험실·렌더를 확인한다.
// 실행: node bulkup/tests/studio-e2e.cjs  (Playwright 필요)
const { chromium } = require('playwright');
const wrap = require('./wrap.cjs');
const fs = require('fs');
const path = require('path');
const S = fs.mkdtempSync(require('os').tmpdir() + '/otw-e2e-'); // 실행마다 새 폴더 (이전 실행의 일러스트가 섞이지 않게)
fs.writeFileSync(S + '/studio.html', wrap(path.join(__dirname, '..', 'six-axis-studio.html')));
fs.copyFileSync(path.join(__dirname, '..', 'otw-core.js'), S + '/otw-core.js');

const MOCK = `
window.__calls = 0;
const store = {}; let subs = [];
function snap(){ const docs = Object.entries(store).map(([id,v])=>({id, data:()=>v})).sort((a,b)=>b.data().createdAt-a.data().createdAt); return {docs}; }
const coll = { add: async (v)=>{ const id='d'+Object.keys(store).length; store[id]=JSON.parse(JSON.stringify(v)); subs.forEach(f=>f(snap())); return {id}; },
  orderBy(){return this}, limit(){return this}, onSnapshot(fn){ subs.push(fn); setTimeout(()=>fn(snap()),50); return ()=>{}; },
  doc(id){ return { delete: async()=>{ delete store[id]; subs.forEach(f=>f(snap())); } }; } };
// 그림마다 다른 응답: 파일 크기로 원형을 고른다 (실험실 검증용)
const PROTOS = [
  {summary:"번지는 수채의 이야기꾼", axes:{line:[30,3],form:[40,3],color:[40,4],texture:[85,4],comp:[70,3],mood:[85,4]}, signals:{craft:4,character:3,expression:3,narrative:5,production:2}},
  {summary:"굵은 선의 표정 부자", axes:{line:[88,5],form:[10,5],color:[75,4],texture:[12,5],comp:[25,4],mood:[80,4]}, signals:{craft:4,character:5,expression:5,narrative:2,production:4}},
  {summary:"단단한 실루엣의 마스코트", axes:{line:[85,5],form:[22,4],color:[68,4],texture:[18,4],comp:[28,4],mood:[45,3]}, signals:{craft:4,character:5,expression:2,narrative:1,production:5}},
  {summary:"정확한 비율의 묘사가", axes:{line:[70,4],form:[85,4],color:[55,3],texture:[50,3],comp:[60,3],mood:[45,3]}, signals:{craft:5,character:1,expression:2,narrative:2,production:3}},
  {summary:"수다스러운 일상 기록자", axes:{line:[58,3],form:[28,3],color:[42,3],texture:[30,3],comp:[45,3],mood:[88,4]}, signals:{craft:3,character:4,expression:4,narrative:5,production:2}},
];
const sample = async()=>({text:'x'});
sample.limits = async()=>({maxPromptBytes:262144, images:{maxCount:5,maxInputBytes:2e7,mediaTypes:['image/png']}});
sample.json = async (prompt, opts)=>{ window.__calls++; window.__lastPrompt = prompt; await new Promise(r=>setTimeout(r, 120));
  if (window.__failNext) { const c = window.__failNext; window.__failNext = null; throw {code: c, message: 'x'}; }
  const size = opts.images[0].size; if (window.__photoSize && size === window.__photoSize) return {error:"not_artwork", reason:"사진"};
  const p = PROTOS[size % PROTOS.length]; const jitter = () => Math.round((Math.random()-.5)*8);
  const ax = {}; for (const [k,[pos,c]] of Object.entries(p.axes)) ax[k] = {position: pos + jitter(), consistency: c, evidence: k+" 근거"};
  const sg = {}; for (const [k,v] of Object.entries(p.signals)) sg[k] = {score: v, note: k+" 메모"};
  if (p.signals.character === 1) { sg.character = {score: null, note: "캐릭터가 없어 해당 없음"}; sg.expression = {score: null, note: ""}; }
  const cv = [6,7,7,4,5,4,6,5], craft = {}; ["drawing","lineq","colorh","value","compo","finish","digital","voice"].forEach((k,i) => craft[k] = {score: cv[i], note: k+" 근거"});
  return { summary: p.summary, axes: ax, signals: sg, craft, mixed_subjects: false, strengths:["강점1","강점2"], blockers:["막힘1","막힘2"], prescriptions:[{title:"선 한 가지로 7일",how:"브러시 하나로 매일 3개"}], images: opts.images.map((_, i) => ({subject: "인물·캐릭터", stage: "채색 중", note: "그림 " + (i + 1) + ": 실루엣은 또렷하고 배경 질감이 달라요"})) }; };
window.claude = { use: async (n)=> n==='sample'? sample : n==='downloads'? {save: async(r)=>{window.__saved=r.filename; window.__savedData = typeof r.data === 'string' ? r.data : ''; return {status:'saved'}}} : n==='db'? {collection:()=>coll} : null };
`;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); }); // 일러스트가 없을 때의 404는 정상
  await p.addInitScript(MOCK);
  await p.goto('file://' + S + '/studio.html');
  await p.waitForTimeout(800);

  // 1) 규칙 쏠림: 무작위 5000건 1위 분포
  const sim = await p.evaluate(() => window.__otw.renderSim());
  const shares = Object.fromEntries(Object.entries(sim).map(([k, v]) => [k, +(v / 50).toFixed(1)]));
  console.log('sim shares %:', JSON.stringify(shares));
  check(Math.max(...Object.values(shares)) < 40 && Object.keys(shares).length === 5, '무작위 입력에서 어떤 길도 40%를 넘지 않고 5개 길 모두 1위가 나온다');

  // 2) 아키타입: 그림체 + 상업 신호
  const ARCH = [
    ['picturebook', [35, 40, 40, 80, 65, 80], [4, 3, 3, 5, 2]],
    ['emoticon', [80, 10, 75, 15, 30, 85], [4, 5, 5, 2, 4]],
    ['goods', [85, 20, 70, 20, 30, 50], [4, 5, 2, 1, 5]],
    ['instatoon', [55, 30, 40, 25, 45, 85], [3, 4, 4, 5, 2]],
    ['portfolio', [70, 80, 55, 50, 60, 50], [5, 1, 2, 2, 3]],
  ];
  const archRes = await p.evaluate((ARCH) => ARCH.map(([want, pos, sg]) => {
    const keys = ['line', 'form', 'color', 'texture', 'comp', 'mood'], sk = ['craft', 'character', 'expression', 'narrative', 'production'];
    const s = { axes: {}, signals: {} }; keys.forEach((k, i) => s.axes[k] = { position: pos[i], consistency: 4 }); sk.forEach((k, i) => s.signals[k] = { score: sg[i] });
    const r = window.__otw.scorePaths(s); return { want, got: r[0].key, top3: r.slice(0, 3).map(x => `${x.key}:${x.total}${x.grade}`).join(' ') };
  }), ARCH);
  archRes.forEach(r => check(r.want === r.got, `아키타입 ${r.want} → 1위 ${r.got} (${r.top3})`));

  // 3) 상업 신호만 바꿔도 1위가 바뀌는가 (같은 그림체, 굿즈 vs 이모티콘)
  const flip = await p.evaluate(() => {
    const keys = ['line', 'form', 'color', 'texture', 'comp', 'mood'], pos = [82, 15, 72, 18, 30, 65];
    const mk = (sg) => { const s = { axes: {}, signals: {} }; keys.forEach((k, i) => s.axes[k] = { position: pos[i], consistency: 4 }); ['craft', 'character', 'expression', 'narrative', 'production'].forEach((k, i) => s.signals[k] = { score: sg[i] }); return window.__otw.scorePaths(s)[0].key; };
    return [mk([4, 5, 5, 2, 2]), mk([4, 5, 1, 1, 5])];
  });
  check(flip[0] === 'emoticon' && flip[1] === 'goods', `같은 그림체에서 표정 폭↑ → ${flip[0]}, 상품화↑ → ${flip[1]}`);

  // 3-2) 이모티콘 문턱: 귀엽고 깔끔해도 표정 폭·캐릭터가 약하면 굿즈로
  const gateRes = await p.evaluate(() => {
    const keys = ['line', 'form', 'color', 'texture', 'comp', 'mood'], sk = ['craft', 'character', 'expression', 'narrative', 'production'];
    const mk = (pos, sg) => { const s = { axes: {}, signals: {} }; keys.forEach((k, i) => s.axes[k] = { position: pos[i], consistency: 4 }); sk.forEach((k, i) => s.signals[k] = { score: sg[i] }); return window.__otw.scorePaths(s); };
    return { looksEmoticon: mk([80, 15, 70, 20, 30, 70], [4, 4, 3, 2, 4])[0].key, realEmoticon: mk([82, 10, 75, 15, 30, 85], [4, 5, 5, 2, 4])[0].key, storyCute: mk([55, 20, 50, 70, 60, 80], [4, 4, 3, 4, 2])[0].key };
  });
  check(gateRes.looksEmoticon === 'goods' && gateRes.realEmoticon === 'emoticon' && gateRes.storyCute === 'picturebook', `이모티콘처럼 보이는 그림 → ${gateRes.looksEmoticon}, 진짜 이모티콘 → ${gateRes.realEmoticon}, 이야기 있는 귀여운 그림 → ${gateRes.storyCute}`);
  check(sim.emoticon / 50 < 10, `무작위 입력에서 이모티콘 1위 비율 ${(sim.emoticon / 50).toFixed(1)}% (10% 미만)`);

  // 3-3) 하고 싶은 길 우선 + 그림체가 덜 굳어도 하고 싶은 길 수업 추천
  const goalRes = await p.evaluate(() => {
    const keys = ['line', 'form', 'color', 'texture', 'comp', 'mood'], sk = ['craft', 'character', 'expression', 'narrative', 'production'];
    const mk = (pos, sg, c, goal) => { const s = { goal, axes: {}, signals: {} }; keys.forEach((k, i) => s.axes[k] = { position: pos[i], consistency: c }); sk.forEach((k, i) => s.signals[k] = { score: sg[i] }); return s; };
    const a = mk([80, 15, 70, 20, 30, 70], [4, 5, 5, 2, 4], 4, 'picturebook'); const pa = window.__otw.scorePaths(a);
    const b = mk([80, 15, 70, 20, 30, 70], [4, 5, 5, 2, 4], 2, 'picturebook'); const rb = window.__otw.recommendation(b, window.__otw.scorePaths(b));
    return { rank: pa.findIndex(p => p.key === 'picturebook') + 1, priority: pa.find(p => p.key === 'picturebook').priority, bonus: pa.find(p => p.key === 'picturebook').bonus, lowConsTitle: rb.title };
  });
  check(goalRes.rank <= 2 && goalRes.bonus === 6, `그림책 원하는 이모티콘형 그림 → 그림책 ${goalRes.rank}위 (동기 +${goalRes.bonus}${goalRes.priority ? ', 순위 보정' : ''})`);
  check(goalRes.lowConsTitle === '픽처포지(그림책반)', '그림체가 덜 굳어도 하고 싶은 길 수업 추천: ' + goalRes.lowConsTitle);

  // 4) 조사
  const josa = await p.evaluate(() => ['정서', '선', '완성도', '이야기꾼', '포근한 이야기꾼', '픽처포지(그림책반)', '굿즈반 + 캐릭터 키트'].map(w => w + ':' + window.__otw.hasBatchim(w)));
  console.log('batchim:', josa.join(' '));
  check(josa.join() === '정서:false,선:true,완성도:false,이야기꾼:true,포근한 이야기꾼:true,픽처포지(그림책반):true,굿즈반 + 캐릭터 키트:false', '받침 판별');

  // 5) AI 흐름 + 목표 장르 시장분석
  await p.setInputFiles('#in-files', [{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(1001, 1) }]); // size%5=1 → 이모티콘형
  await p.fill('#in-name', '테스트');
  await p.selectOption('#in-goal', 'picturebook');
  await p.click('#btn-analyze');
  await p.waitForSelector('#ai-status.ok', { timeout: 5000 });
  const mk = await p.$eval('#market', e => e.innerText);
  check(mk.startsWith('그림책 시장분석') && mk.includes('하고 싶다고 고른 길'), '목표=그림책이면 그림책 시장분석이 붙는다');
  check(mk.includes('참고로 지금 점수 1위는'), '목표와 1위가 다르면 1위 길도 언급');
  const prompt = await p.evaluate(() => window.__lastPrompt);
  check(prompt.includes('signals') && prompt.includes('기준점'), '프롬프트에 상업 신호와 기준점 포함');
  check(prompt.includes('기본기 8항목') && prompt.includes('미완성은 craft.finish') && prompt.includes('null') && prompt.includes('mixed_subjects'), '프롬프트: 기본기 8항목 · 미완성은 마감도에만 · 볼 수 없으면 null · 주제 혼합');
  const st1 = await p.evaluate(() => ({ craft: window.__otw.state.craft, stage: document.getElementById('res-stage').textContent, sel: document.getElementById('crs-finish').value }));
  check(st1.craft && st1.craft.finish.score === 4 && st1.sel === '4' && /기본기 \d/.test(st1.stage), 'AI 기본기 8항목 → 결과지 편집칸·단계 칩: ' + st1.stage);
  await p.selectOption('#in-goal', 'unknown');
  await p.click('#btn-analyze'); await p.waitForTimeout(100); await p.waitForSelector('#ai-status.ok', { timeout: 5000 });
  const top = await p.evaluate(() => window.__otw.scorePaths(window.__otw.state)[0].name);
  const mk2 = await p.$eval('#market h4', e => e.textContent);
  check(mk2 === `${top} 시장분석`, `목표 모름이면 1위(${top}) 시장분석`);
  const dmPaid = await p.$eval('#dm', e => e.value);
  check(dmPaid.includes('12주 로드맵') && dmPaid.includes('리포트') && dmPaid.includes('otherthanworks.notion.site') && !/을\(를\)|이\(가\)|은\(는\)/.test(dmPaid), '유료 DM: 리포트 안내 + 공식 노션, 깨진 조사 없음');
  console.log('--- DM(유료) ---\n' + dmPaid + '\n---');
  await p.click('#tier-free'); await p.waitForTimeout(200);
  const dmFree = await p.$eval('#dm', e => e.value);
  console.log('--- DM(무료) ---\n' + dmFree + '\n---');
  check(dmFree.includes('형이에요') && dmFree.includes('의외였던 점') && dmFree.includes('런칭가') && !dmFree.includes('12주 로드맵을'), '무료 DM: 유형 공개 + 의외의 한 가지 + 잠긴 목차 + 가격');
  const openNow = await p.evaluate(() => window.__otw.openProducts().map(o => o.key));
  check(dmFree.includes("이 DM으로 '리포트'") && (openNow.length === 0 || dmFree.includes('[지금 신청할 수 있는 수업]')) && (!openNow.includes('vintageClub') || dmFree.includes('docs.google.com/forms')), `무료 DM: 결제 링크 없으면 DM 신청 + 모집 중 수업 (${openNow.join(', ')})`);
  check(await p.$eval('#market', e => e.hidden) && await p.$eval('#signals', e => e.closest('[data-paid]').hidden), '무료 카드에서 상업 신호·시장분석 숨김');
  await p.click('#tier-paid'); await p.waitForTimeout(400);
  await p.click('#btn-png2'); await p.waitForFunction(() => (window.__saved || '').includes('market'), null, { timeout: 5000 }).catch(() => {});
  check((await p.evaluate(() => window.__saved || '')).includes('market'), '카드 2 저장');
  await p.click('#btn-save'); await p.waitForTimeout(200);
  check((await p.$eval('#save-status', e => e.innerText)).includes('저장했어요'), '기록 저장');
  // 유료 전용: 그림별 코멘트(AI) + 대표 한마디
  check((await p.$eval('#res-images', e => e.value)).startsWith('그림 1:'), '그림별 한 줄 코멘트를 AI가 채움');
  await p.fill('#res-owner', '선이 이미 단단해요. 질감 하나만 정하면 충분히 갑니다.');
  // 장문 리포트
  await p.click('#btn-report'); await p.waitForTimeout(300);
  const rep = await p.evaluate(() => ({ visible: !document.getElementById('report-view').hidden, resultHidden: document.getElementById('result').hidden, h2: [...document.querySelectorAll('#report-body h2')].map(h => h.textContent), len: document.getElementById('report-body').innerText.length, meta: document.getElementById('report-meta').textContent }));
  console.log('report:', rep.meta, '|', rep.h2.join(' / '));
  check(rep.visible && rep.resultHidden && rep.h2.length >= 10 && rep.len > 8000, `유료 리포트 전체 화면: ${rep.h2.length}개 장, ${rep.len}자`);
  check(rep.h2.some(h => h.includes('이 분석으로 배우면')) && rep.h2.filter(h => h.includes('위') || h.includes('하고 싶은 길')).length >= 3, '길별 상세 3개 이상 + 수업 소개 장');
  check(rep.h2.some(h => h.includes('기본기')) && (await p.$eval('#report-body', e => e.innerText.includes('숨은 강점') && e.innerText.includes('디지털이 대신 해 주는 것'))), '리포트: 기본기 8항목 장 + 숨은 강점 + 디지털 팁');
  const deep = await p.evaluate(() => { const b = document.getElementById('report-body').innerText; return { owner: b.includes('대표 한마디 · 선이 이미 단단해요'), images: b.includes('그림별 한 줄 코멘트') && b.includes('그림 1: 실루엣'), type: /형 깊이 보기/.test(b) && b.includes('성장 경로 3단계'), favors: b.includes('지금 위치가 특히 유리한 길') }; });
  check(deep.owner && deep.images && deep.type && deep.favors, '유료 섬세함: 대표 한마디 · 그림별 코멘트 · 유형 깊이 보기(성장 경로) · 축마다 유리한 길 ' + JSON.stringify(deep));
  await p.screenshot({ path: S + '/report-view.png', fullPage: false });
  await p.click('#btn-report-html'); await p.waitForTimeout(200);
  check((await p.evaluate(() => window.__saved || '')).endsWith('.html') && (await p.evaluate(() => (window.__savedData || '').startsWith('<!doctype html>'))), 'HTML 파일 저장 (완결된 문서)');
  const rlinks = await p.evaluate(() => [...document.querySelectorAll('#report-body a.lk')].map(a => a.href));
  check(rlinks.some(h => h.includes('otherthanworks.notion.site')) && (!openNow.includes('vintageClub') || rlinks.some(h => h.includes('docs.google.com/forms'))) && rlinks.every(h => h.startsWith('https://')), `리포트 수업 장: 노션·신청 링크 버튼 ${rlinks.length}개`);
  check(await p.evaluate(() => !document.querySelector('#report-body .r-art')), '일러스트 없으면 리포트 표지 이미지 자리 깔끔히 제거');
  fs.writeFileSync(S + '/report.html', await p.evaluate(() => window.__savedData));
  await p.click('#btn-report-close'); await p.waitForTimeout(200);
  check(await p.evaluate(() => document.getElementById('report-view').hidden && !document.getElementById('result').hidden && !document.getElementById('pane-ai').hidden), '리포트 닫으면 결과지로 복귀');
  const c1 = await p.evaluate(() => document.getElementById('card').toDataURL('image/png').split(',')[1]);
  const c2 = await p.evaluate(() => document.getElementById('card2').toDataURL('image/png').split(',')[1]);
  fs.writeFileSync(S + '/card1.png', Buffer.from(c1, 'base64')); fs.writeFileSync(S + '/card2.png', Buffer.from(c2, 'base64'));
  await p.screenshot({ path: S + '/desk-result.png', fullPage: true });

  // 6) 검증 실험실: 서로 다른 그림 6장 + 사진 1장, 반복 2장
  await p.click('#tab-lab');
  const imgs = [1000, 1001, 1002, 1003, 1004, 1006].map((n, i) => ({ name: `art${i}.png`, mimeType: 'image/png', buffer: Buffer.alloc(n, i) }));
  imgs.push({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.alloc(1234, 9) });
  await p.evaluate(() => { window.__photoSize = 1234; });
  await p.setInputFiles('#lab-files', imgs);
  check((await p.$eval('#lab-cost', e => e.innerText)).includes('호출 11회'), '호출 수 안내 (7장 + 반복 4회)');
  await p.click('#btn-lab');
  await p.waitForFunction(() => document.getElementById('lab-status').className.includes('ok'), null, { timeout: 15000 });
  const checks = await p.$$eval('.chk', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  checks.forEach(c => console.log('  lab:', c));
  check(checks.length === 4 && checks.slice(0, 3).every(c => c.startsWith('통과')) && checks[3].startsWith('통과'), '실험실 4개 판정 모두 통과 (분산·다양성·반복·사진 거름)');
  check(await p.evaluate(() => window.__calls) === 2 + 11, '총 호출 수 일치');
  await p.screenshot({ path: S + '/desk-lab.png', fullPage: true });

  // 7) 통합 진단: 본인 체크 + AI
  await p.click('#tab-ai');
  const fillSelf = async (picks) => { const segs = await p.$$('#self-qs .seg'); for (let i = 0; i < segs.length && i < picks.length; i++) if (picks[i] != null) await (await segs[i].$$('button'))[picks[i] - 1].click(); return segs.length; };
  const clearThumbs = async () => { while (await p.$('.thumb button')) await p.click('.thumb button'); };
  await p.click('#btn-self-reset');
  await clearThumbs();
  // 본인 생각: 선 3(50)/일관3, 형태 2/4, 색 2/4, 질감 4(75)/4, 구성 3/3, 정서 2(25)/3 | 신호 3,3,2,4,3
  const SELF = [3, 3, 2, 4, 2, 4, 4, 4, 3, 3, 2, 3, 3, 3, 2, 4, 3, 2, 4, 3, 3];
  check(await fillSelf(SELF) === 21, '본인 체크 문항 21개 (6축 12 + 신호 5 + 작업 습관 4)');
  check((await p.$eval('#self-progress', e => e.textContent)) === '21/21', '진행 표시 21/21');
  await p.setInputFiles('#in-files', [{ name: 'b.png', mimeType: 'image/png', buffer: Buffer.alloc(1001, 2) }]); // 이모티콘형
  check((await p.$eval('#plan-line', e => e.textContent)).startsWith('본인 체크와 AI 분석을 합쳐'), '안내: 둘 다 합쳐 판정');
  await p.selectOption('#in-goal', 'unknown');
  await p.click('#btn-analyze');
  await p.waitForSelector('#ai-status.ok', { timeout: 5000 });
  const st7 = await p.evaluate(() => window.__otw.state);
  check(st7.mode === 'both' && !!st7.sources.ai && !!st7.sources.self, '결과 모드 = AI + 본인 체크');
  check(st7.craft.finish.score === Math.round((0.7 * 4 + 0.3 * 4) * 10) / 10 || Math.abs(st7.craft.finish.score - 4) <= 0.5, '마감도: AI 4 + 본인 2×2 합산 = ' + st7.craft.finish.score);
  const A = st7.sources.ai.axes.line.position, Sv = st7.sources.self.axes.line.position;
  check(st7.axes.line.position === Math.round(0.6 * A + 0.4 * Sv), `선 합산 = 0.6×AI(${A}) + 0.4×본인(${Sv}) = ${st7.axes.line.position}`);
  check(st7.axes.line.consistency === Math.round(0.5 * st7.sources.ai.axes.line.consistency + 0.5 * 3), '일관성 합산 50:50');
  check(await p.evaluate(() => !document.getElementById('gapbox').hidden), '인식 차이 박스 표시');
  const gapTxt = await p.$eval('#gapbox', e => e.innerText);
  console.log('--- gap ---\n' + gapTxt + '\n---');
  check(/일치도 \d+/.test(gapTxt) && (gapTxt.match(/의도한 방향|정도 차이|본인 생각보다|더 높게/g) || []).length >= 2, '일치도와 차이 항목·해석 표시');
  check((await p.$eval('#src-line', e => e.textContent)).includes('합산'), '축마다 AI·본인·합산 출처 줄');
  check(st7.rx[0].how.includes('1순위'), '차이 가장 큰 축이 처방 1순위: ' + st7.rx[0].title);
  check((await p.$eval('#dm', e => e.value)).includes('일치도는'), '유료 DM에 일치도 포함');
  await p.waitForTimeout(300);
  fs.writeFileSync(S + '/card-merged.png', Buffer.from(await p.evaluate(() => document.getElementById('card').toDataURL('image/png').split(',')[1]), 'base64'));
  await p.screenshot({ path: S + '/desk-merged.png', fullPage: true });
  await p.$eval('#rng-line', e => { e.value = 40; e.dispatchEvent(new Event('input')); });
  check((await p.$eval('#src-line', e => e.textContent)).includes('대표 수정 40'), '대표가 고치면 출처 줄에 표시');
  await p.click('#btn-save'); await p.waitForTimeout(200);

  // 7-2) AI 실패 + 본인 체크 완료 → 본인 체크로 대체
  await p.evaluate(() => { window.__failNext = 'upstream_error'; });
  await p.click('#btn-analyze'); await p.waitForTimeout(500);
  check((await p.$eval('#ai-status', e => e.textContent)).includes('본인 체크만으로'), 'AI 실패 시 본인 체크로 대체');
  check((await p.evaluate(() => window.__otw.state.mode)) === 'self', '대체 결과 모드 = 본인');

  // 7-3) 본인 체크만 (그림 없음)
  await clearThumbs();
  await p.selectOption('#in-goal', 'goods');
  check((await p.$eval('#plan-line', e => e.textContent)).startsWith('본인 체크만으로'), '그림 없으면 본인 체크만 안내');
  await p.click('#btn-analyze'); await p.waitForTimeout(300);
  check((await p.$eval('#ai-status', e => e.textContent)).startsWith('본인 체크로 결과를'), '본인 체크만으로 결과');
  check((await p.$eval('#market h4', e => e.textContent)) === '캐릭터 굿즈 시장분석', '목표=굿즈 → 굿즈 시장분석');
  check(await p.evaluate(() => document.getElementById('gapbox').hidden), '한쪽만 있으면 차이 박스 숨김');

  // 7-4) 본인 체크 일부만 + 그림 없음 → 버튼 잠김
  await p.click('#btn-self-reset'); await fillSelf([3, 3, 3]);
  check(await p.$eval('#btn-analyze', e => e.disabled) && (await p.$eval('#plan-line', e => e.textContent)).includes('지금 3개'), '본인 체크 일부만이면 버튼 잠김');
  // 7-5) 본인 체크 일부 + 그림 → 답한 항목만 합산
  await p.setInputFiles('#in-files', [{ name: 'c.png', mimeType: 'image/png', buffer: Buffer.alloc(1003, 3) }]);
  check((await p.$eval('#plan-line', e => e.textContent)).includes('본인 체크 3개 항목'), '일부 체크 + 그림 안내');
  await p.click('#btn-analyze'); await p.waitForSelector('#ai-status.ok', { timeout: 5000 });
  const st75 = await p.evaluate(() => window.__otw.state);
  check(st75.mode === 'both' && st75.axes.color.position === st75.sources.ai.axes.color.position && st75.axes.form.position === Math.round(0.6 * st75.sources.ai.axes.form.position + 0.4 * 50), '답한 축만 합산, 안 답한 축은 AI 값');

  // 8) 기록에서 다시 열기 (v1 기록 호환: signals 없음)
  await p.click('#tab-hist'); await p.waitForTimeout(200);
  await p.click('.hist-item .btn'); await p.waitForTimeout(300);
  check((await p.$eval('#res-who', e => e.textContent)).startsWith('테스트'), '기록 다시 열기');
  await p.click('#tab-hist'); await p.waitForTimeout(150);
  const metas = await p.$$eval('.hist-item .m', e => e.map(x => x.textContent));
  check(metas.some(m => m.includes('AI+본인') && m.includes('일치')), '기록 목록에 AI+본인·일치도 표시');
  const idx = metas.findIndex(m => m.includes('AI+본인'));
  await (await p.$$('.hist-item'))[idx].$eval('.btn', b => b.click()); await p.waitForTimeout(300);
  check(await p.evaluate(() => !document.getElementById('gapbox').hidden), '저장한 통합 진단을 다시 열면 차이 박스 복원');

  // 8-2) 유형 일러스트 슬롯: 없을 때 숨김, 있을 때 결과지·카드 1·리포트 표지에 표시
  check(await p.evaluate(() => getComputedStyle(document.getElementById('res-art')).display === 'none' && getComputedStyle(document.getElementById('res-svg')).display !== 'none'), '스튜디오: 일러스트 없으면 기본 캐릭터 (실제 화면 기준)');
  const tkey = await p.evaluate(() => window.OTW.typeOf(window.__otw.state).key);
  fs.mkdirSync(S + '/assets/types', { recursive: true });
  const png2 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#A8D96A'; x.fillRect(40, 40, 220, 220); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(`${S}/assets/types/${tkey}.png`, Buffer.from(png2, 'base64'));
  const a2 = await b.newPage({ viewport: { width: 1280, height: 900 } });
  a2.on('pageerror', e => errors.push('art: ' + e.message));
  await a2.addInitScript(MOCK);
  await a2.goto('file://' + S + '/studio.html'); await a2.waitForTimeout(1200);
  const k2 = await a2.evaluate(() => window.OTW.typeOf(window.__otw.state).key);
  if (k2 !== tkey) fs.writeFileSync(`${S}/assets/types/${k2}.png`, Buffer.from(png2, 'base64'));
  await a2.reload(); await a2.waitForTimeout(1200);
  check(await a2.evaluate(() => getComputedStyle(document.getElementById('res-art')).display !== 'none' && getComputedStyle(document.getElementById('res-svg')).display === 'none' && /^\.\/assets\/types\/[a-z-]+\.png$/.test(document.getElementById('res-art').getAttribute('src'))), '스튜디오: 일러스트 있으면 결과지 머리에 표시, 기본 캐릭터는 실제로 숨김');
  await a2.click('#btn-png'); await a2.waitForFunction(() => document.getElementById('png-status').textContent.trim().length > 0, null, { timeout: 8000 }).catch(() => {});
  const pngSt = await a2.$eval('#png-status', e => e.textContent);
  check((await a2.evaluate(() => window.__saved || '')).includes('style'), '스튜디오: 일러스트 카드 저장 (출처 제한 시 이미지 없이 대체) · ' + pngSt);
  await a2.click('#btn-report'); await a2.waitForTimeout(500);
  check(await a2.evaluate(() => !!document.querySelector('#report-body .r-art')), '스튜디오: 리포트 표지에 일러스트');
  await a2.screenshot({ path: S + '/report-art.png' });
  await a2.close();

  // 9) 모바일·다크·Claude 없음
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  m.on('pageerror', e => errors.push('m: ' + e.message));
  await m.goto('file://' + S + '/studio.html'); await m.waitForTimeout(1500);
  check(await m.evaluate(() => document.documentElement.scrollWidth) <= 390, '모바일 가로 넘침 없음');
  await m.screenshot({ path: S + '/mobile-dark.png', fullPage: true });
  check((await m.$eval('#btn-analyze', e => e.disabled)) && (await m.$eval('#btn-lab', e => e.disabled)), 'Claude 없을 때 AI·실험실 버튼 비활성');

  check(errors.length === 0, '콘솔 에러 없음 ' + JSON.stringify(errors));
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS', '· screenshots in', S);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
