const { chromium } = require('playwright');
const wrap = require('./wrap.cjs');
const fs = require('fs');
const S = require('os').tmpdir() + '/otw-e2e'; fs.mkdirSync(S, { recursive: true });
fs.writeFileSync(S + '/studio.html', wrap(require('path').join(__dirname, '..', 'six-axis-studio.html')));
const MOCK = `
window.__calls = [];
const store = {};
let subs = [];
function snap(){ const docs = Object.entries(store).map(([id,v])=>({id, data:()=>v})).sort((a,b)=>b.data().createdAt-a.data().createdAt); return {docs, size:docs.length, empty:!docs.length}; }
const coll = { add: async (v)=>{ const id='d'+Object.keys(store).length; store[id]=JSON.parse(JSON.stringify(v)); subs.forEach(f=>f(snap())); return {id}; },
  orderBy(){return this}, limit(){return this}, onSnapshot(fn){ subs.push(fn); setTimeout(()=>fn(snap()),50); return ()=>{}; },
  doc(id){ return { delete: async()=>{ delete store[id]; subs.forEach(f=>f(snap())); } }; } };
const sample = async()=>({text:'x'});
sample.limits = async()=>({maxPromptBytes:262144, images:{maxCount:5,maxInputBytes:2e7,mediaTypes:['image/png']}});
sample.json = async (prompt, opts)=>{ window.__calls.push({prompt, n: opts.images.length, tier: opts.modelTier}); await new Promise(r=>setTimeout(r,1500));
  return { summary:"손맛 있는 선명한 이야기꾼", axes:{ line:{position:30,consistency:2,evidence:"윤곽선을 여러 번 겹쳐 그었어요."}, form:{position:20,consistency:4,evidence:"머리가 몸의 절반이에요."},
   color:{position:"80",consistency:4,evidence:"빨강과 청록 보색이에요."}, texture:{position:75,consistency:3,evidence:"크레용 결이 보여요."}, comp:{position:140,consistency:9,evidence:"대각 구도."} },
   strengths:["색 대비가 확실해요","캐릭터 비율이 고정돼 있어요"], blockers:["선 굵기가 장마다 달라요","배경 처리 방식이 매번 달라요"],
   prescriptions:[{title:"선 한 가지로 7일",how:"브러시 하나로 매일 3개"}] }; };
window.claude = { use: async (n)=> n==='sample'? sample : n==='downloads'? {save: async(r)=>{window.__saved=r.filename; return {status:'saved'}}} : n==='db'? {collection:()=>coll} : null };
`;
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.addInitScript(MOCK);
  await p.goto('file://' + S + '/studio.html');
  await p.waitForTimeout(800);
  console.log('initial fit:', await p.$$eval('.fit-row', rs => rs.map(r => r.innerText.replace(/\n/g, ' '))));
  console.log('reco:', await p.$eval('#reco', e => e.innerText.replace(/\n/g, ' | ')));
  await p.screenshot({ path: S + '/s1-desktop.png', fullPage: true });
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#f80'; x.fillRect(20, 20, 160, 160); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(S + '/art.png', Buffer.from(png, 'base64'));
  await p.setInputFiles('#in-files', [S + '/art.png', S + '/art.png']);
  await p.fill('#in-name', '테스트');
  await p.selectOption('#in-goal', 'emoticon');
  console.log('analyze disabled?', await p.$eval('#btn-analyze', b => b.disabled), 'thumbs', await p.$$eval('.thumb', t => t.length));
  await p.click('#btn-analyze');
  await p.waitForTimeout(400);
  console.log('status during:', await p.$eval('#ai-status', e => e.innerText));
  await p.waitForSelector('#ai-status.ok', { timeout: 5000 });
  const st = await p.evaluate(() => window.__otw.state);
  console.log('after AI:', JSON.stringify({ summary: st.summary, comp: st.axes.comp, mood: st.axes.mood, color: st.axes.color, rx: st.rx.map(r => r.title) }));
  console.log('calls:', JSON.stringify(await p.evaluate(() => window.__calls.map(c => ({ n: c.n, tier: c.tier, len: c.prompt.length })))));
  console.log('fit after:', await p.$$eval('.fit-row', rs => rs.map(r => r.innerText.replace(/\n/g, ' '))));
  console.log('reco after:', await p.$eval('#reco', e => e.innerText.replace(/\n/g, ' | ')));
  await p.$eval('#rng-line', e => { e.value = 90; e.dispatchEvent(new Event('input')); });
  await p.click('.axis:nth-child(1) .cons button[data-n="5"]');
  console.log('line after edit:', JSON.stringify((await p.evaluate(() => window.__otw.state)).axes.line));
  await p.click('#btn-png'); await p.waitForTimeout(300);
  console.log('png:', await p.$eval('#png-status', e => e.innerText), await p.evaluate(() => window.__saved));
  await p.click('#btn-save'); await p.waitForTimeout(300);
  console.log('save:', await p.$eval('#save-status', e => e.innerText));
  await p.click('#tab-hist'); await p.waitForTimeout(300);
  console.log('hist:', await p.$$eval('.hist-item', r => r.map(x => x.innerText.replace(/\n/g, ' '))));
  await p.screenshot({ path: S + '/s2-hist.png', fullPage: true });
  await p.click('.hist-item .btn'); await p.waitForTimeout(300);
  console.log('reopened summary:', await p.$eval('#res-summary', e => e.value));
  await p.screenshot({ path: S + '/s3-after-ai.png', fullPage: true });
  await p.click('#tab-self');
  await p.click('#btn-self');
  console.log('self missing:', await p.$eval('#self-status', e => e.innerText));
  const qs = await p.$$('.q');
  for (let i = 0; i < qs.length; i++) { const segs = await qs[i].$$('.seg'); await (await segs[0].$$('button'))[[0, 1, 4, 3, 2, 4][i]].click(); await (await segs[1].$$('button'))[[1, 2, 4, 1, 3, 4][i]].click(); }
  await p.click('#btn-self');
  console.log('self:', await p.$eval('#self-status', e => e.innerText), '|', await p.$eval('#res-summary', e => e.value));
  console.log('self reco:', await p.$eval('#reco', e => e.innerText.replace(/\n/g, ' | ')));
  await p.waitForTimeout(400);
  const px = await p.evaluate(() => { const c = document.getElementById('card'); return Array.from(c.getContext('2d').getImageData(100, 1100, 1, 1).data); });
  console.log('card navy pixel:', px);
  const cardData = await p.evaluate(() => document.getElementById('card').toDataURL('image/png').split(',')[1]);
  fs.writeFileSync(S + '/card.png', Buffer.from(cardData, 'base64'));
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  m.on('pageerror', e => errors.push('m pageerror: ' + e.message));
  await m.goto('file://' + S + '/studio.html'); await m.waitForTimeout(800);
  console.log('mobile scrollWidth', await m.evaluate(() => document.documentElement.scrollWidth));
  await m.screenshot({ path: S + '/s4-mobile-dark.png', fullPage: true });
  const n = await b.newPage({ viewport: { width: 1000, height: 800 } });
  n.on('pageerror', e => errors.push('n pageerror: ' + e.message));
  await n.goto('file://' + S + '/studio.html'); await n.waitForTimeout(500);
  console.log('no-claude note:', await n.$eval('#ai-note', e => e.innerText), '| hist:', await n.$eval('#hist', e => e.innerText));
  console.log('ERRORS:', errors);
  await b.close();
})();
