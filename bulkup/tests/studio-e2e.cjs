// 6축 진단 스튜디오 검증: 가짜 Claude 런타임을 주입해 규칙·흐름·실험실·렌더를 확인한다.
// 실행: node bulkup/tests/studio-e2e.cjs  (Playwright 필요)
const { chromium } = require('playwright');
const wrap = require('./wrap.cjs');
const fs = require('fs');
const path = require('path');
const S = require('os').tmpdir() + '/otw-e2e';
fs.mkdirSync(S, { recursive: true });
fs.writeFileSync(S + '/studio.html', wrap(path.join(__dirname, '..', 'six-axis-studio.html')));

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
  const size = opts.images[0].size; if (window.__photoSize && size === window.__photoSize) return {error:"not_artwork", reason:"사진"};
  const p = PROTOS[size % PROTOS.length]; const jitter = () => Math.round((Math.random()-.5)*8);
  const ax = {}; for (const [k,[pos,c]] of Object.entries(p.axes)) ax[k] = {position: pos + jitter(), consistency: c, evidence: k+" 근거"};
  const sg = {}; for (const [k,v] of Object.entries(p.signals)) sg[k] = {score: v, note: k+" 메모"};
  return { summary: p.summary, axes: ax, signals: sg, strengths:["강점1","강점2"], blockers:["막힘1","막힘2"], prescriptions:[{title:"선 한 가지로 7일",how:"브러시 하나"}] }; };
window.claude = { use: async (n)=> n==='sample'? sample : n==='downloads'? {save: async(r)=>{window.__saved=r.filename; return {status:'saved'}}} : n==='db'? {collection:()=>coll} : null };
`;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
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
  await p.selectOption('#in-goal', 'unknown');
  await p.click('#btn-analyze'); await p.waitForTimeout(100); await p.waitForSelector('#ai-status.ok', { timeout: 5000 });
  const top = await p.evaluate(() => window.__otw.scorePaths(window.__otw.state)[0].name);
  const mk2 = await p.$eval('#market h4', e => e.textContent);
  check(mk2 === `${top} 시장분석`, `목표 모름이면 1위(${top}) 시장분석`);
  const dmPaid = await p.$eval('#dm', e => e.value);
  check(dmPaid.includes('시장 한눈에') && !/을\(를\)|이\(가\)|은\(는\)/.test(dmPaid), '유료 DM에 시장 요약, 을(를) 같은 깨진 조사 없음');
  console.log('--- DM(유료) ---\n' + dmPaid + '\n---');
  await p.click('#tier-free'); await p.waitForTimeout(200);
  const dmFree = await p.$eval('#dm', e => e.value);
  check(!dmFree.includes('시장 한눈에') && dmFree.includes('유료 리포트'), '무료 DM은 시장분석 없이 유료 안내');
  check(await p.$eval('#market', e => e.hidden) && await p.$eval('#signals', e => e.closest('[data-paid]').hidden), '무료 카드에서 상업 신호·시장분석 숨김');
  await p.click('#tier-paid'); await p.waitForTimeout(400);
  await p.click('#btn-png2'); await p.waitForTimeout(200);
  check((await p.evaluate(() => window.__saved || '')).includes('market'), '카드 2 저장');
  await p.click('#btn-save'); await p.waitForTimeout(200);
  check((await p.$eval('#save-status', e => e.innerText)).includes('저장했어요'), '기록 저장');
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

  // 7) 자가진단 17문항
  await p.click('#tab-self');
  const segs = await p.$$('#self-qs .seg');
  check(segs.length === 17, '자가진단 문항 17개');
  for (let i = 0; i < segs.length; i++) await (await segs[i].$$('button'))[(i * 3) % 5].click();
  await p.selectOption('#self-goal', 'goods');
  await p.click('#btn-self');
  const ss = await p.$eval('#self-status', e => e.innerText);
  check(ss.startsWith('결과가 나왔어요'), '자가진단 결과: ' + ss);
  check((await p.$eval('#market h4', e => e.textContent)) === '캐릭터 굿즈 시장분석', '자가진단 목표=굿즈 → 굿즈 시장분석');

  // 8) 기록에서 다시 열기 (v1 기록 호환: signals 없음)
  const v1 = await p.evaluate(() => { const s = window.__otw.state; return true; });
  await p.click('#tab-hist'); await p.waitForTimeout(200);
  await p.click('.hist-item .btn'); await p.waitForTimeout(300);
  check((await p.$eval('#res-who', e => e.textContent)).startsWith('테스트'), '기록 다시 열기');

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
