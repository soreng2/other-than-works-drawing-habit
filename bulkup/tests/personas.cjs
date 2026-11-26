// 페르소나 검증: "사람들이 의아해할 결과"가 나오지 않는지 규칙 엔진을 점검한다.
// 실행: node bulkup/tests/personas.cjs
const O = require('../otw-core.js');
const K = O.AXES.map(a => a.key), SK = O.SIGNALS.map(x => x.key), CK = O.CRAFT.map(c => c.key);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

// AI가 새 프롬프트를 따랐을 때 돌려줄 법한 관찰값 (pos, consistency) / 신호(null = 해당 없음) / 기본기(null = 해당 없음)
function aiState(p) {
  const s = { axes: {}, signals: {}, craft: {}, mixedSubjects: !!p.mixed, images: p.images || [], rx: [], summary: p.summary || '테스트', strengths: '', blockers: '' };
  K.forEach((k, i) => { s.axes[k] = { position: p.axes[i][0], consistency: p.axes[i][1], evidence: k + ' 근거' }; });
  SK.forEach((k, i) => { s.signals[k] = { score: p.sig[i], note: p.sig[i] == null ? '' : k + ' 메모' }; });
  CK.forEach((k, i) => { s.craft[k] = { score: p.craft[i], note: p.craft[i] == null ? '' : k + ' 근거' }; });
  return s;
}
const PERSONAS = [
  { id: '초보 풍경화가 (캐릭터 없음, 미완성 많음)', mode: 'ai', goal: 'unknown',
    axes: [[40, 3], [55, 3], [35, 4], [70, 3], [60, 3], [35, 3]], sig: [2, null, null, 3, 2], craft: [5, 4, 6, 5, 6, 3, 4, 5],
    expect: { stageIn: ['기초 다지기'], topIn: ['picturebook', 'portfolio', 'instatoon'], notTop2: ['emoticon'], weakHas: '마감도', strongAny: ['색 조화', '구도·배치', '색'] } },
  { id: '마무리 못 하는 캐릭터 낙서러', mode: 'ai', goal: 'unknown',
    axes: [[60, 2], [20, 3], [60, 2], [30, 3], [40, 3], [70, 3]], sig: [2, 3, 4, 3, 3], craft: [5, 4, 5, 3, 4, 2, 4, 6],
    expect: { stageIn: ['탐색기', '기초 다지기'], weakHas: '마감도', tipHas: 'finish', strongAny: ['자기 색', '표정·감정 폭'] } },
  { id: '주제가 섞인 그림 (풍경·정물·캐릭터)', mode: 'ai', goal: 'picturebook', mixed: true,
    axes: [[50, 3], [45, 3], [50, 3], [55, 3], [50, 3], [55, 3]], sig: [3, 2, 2, 3, 3], craft: [5, 5, 5, 5, 5, 4, 5, 4],
    expect: { stageIn: ['기초 다지기'], goalTop2: true, mixedNote: true } },
  { id: '숙련 일러스트레이터', mode: 'ai', goal: 'unknown',
    axes: [[75, 5], [30, 5], [65, 4], [25, 5], [40, 4], [70, 4]], sig: [5, 5, 4, 4, 5], craft: [9, 9, 8, 8, 8, 9, 9, 8],
    expect: { stageIn: ['상업 준비 단계'], topGradeIn: ['A', 'B'] } },
  { id: '연필 흑백 정물 초보 (아날로그)', mode: 'ai', goal: 'unknown',
    axes: [[30, 3], [70, 3], [10, 4], [85, 4], [35, 3], [20, 3]], sig: [3, null, null, 1, 2], craft: [6, 5, null, 6, 5, 4, null, 4],
    expect: { stageIn: ['기초 다지기'], notTop2: ['emoticon'], weakNot: ['색 조화', '디지털 활용'], strongNot: ['색'] } },
  { id: '패턴 작가 (상업 신호 대부분 해당 없음)', mode: 'ai', goal: 'goods',
    axes: [[80, 4], [20, 4], [70, 4], [15, 4], [30, 4], [30, 3]], sig: [4, null, null, null, 5], craft: [7, 7, 7, null, 6, 7, 7, 6],
    expect: { stageIn: ['그림체 형성기'], goalTop2: true } },
];
const SELF = [
  { id: '무료 · 막 시작한 사람 (마무리 거의 못 함)', goal: 'unknown',
    axes: [[3, 2], [2, 2], [3, 2], [2, 3], [3, 2], [4, 3]], sig: [1, 2, 2, 3, 2], habits: { finish: 1, colorh: 2, compo: 2, digital: 2 },
    expect: { stageIn: ['탐색기'], weakHas: '마감도' } },
  { id: '무료 · 풍경 초보 (캐릭터 해당 없음, 디지털 거의 안 씀)', goal: 'unknown',
    axes: [[2, 2], [3, 3], [2, 3], [4, 2], [2, 3], [2, 3]], sig: [2, null, null, 2, 2], habits: { finish: 1, colorh: 3, compo: 2, digital: 2 },
    expect: { stageIn: ['탐색기'], weakHas: '마감도', notTop2: ['emoticon'], strongNot: ['디지털 활용'] } },
  { id: '무료 · 캐릭터를 안 그리는 사람 (해당 없음 선택)', goal: 'picturebook',
    axes: [[2, 3], [4, 3], [2, 4], [4, 3], [4, 3], [2, 3]], sig: [3, null, null, 3, 2], habits: { finish: 3, colorh: 4, compo: 3, digital: null },
    expect: { stageIn: ['기초 다지기', '그림체 형성기'], weakNot: ['캐릭터 고정성', '표정·감정 폭', '디지털 활용'], goalTop2: true } },
  { id: '무료 · 자기 평가를 후하게 하는 사람 (전부 5)', goal: 'unknown',
    axes: [[5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 5]], sig: [5, 5, 5, 5, 5], habits: { finish: 5, colorh: 5, compo: 5, digital: 5 },
    expect: { stageIn: ['그림체 형성기'] } },
];
function selfSource(p) {
  const out = { axes: {}, signals: {}, craft: {}, complete: true };
  K.forEach((k, i) => { out.axes[k] = { position: (p.axes[i][0] - 1) * 25, consistency: p.axes[i][1] }; });
  SK.forEach((k, i) => { out.signals[k] = p.sig[i]; });
  Object.entries(p.habits).forEach(([k, v]) => { out.craft[k] = v == null ? null : v * 2; });
  return out;
}
function audit(label, s, ex) {
  const paths = O.scorePaths(s), stage = O.stageOf(s), strong = O.strongest(s, 2), weak = O.weakest(s, 3), tips = O.digitalTips(s, 3);
  const r = O.buildReport(s), txt = O.reportToText(r), free = O.freeInsights(s), tz = O.freeTeaser(s);
  console.log(`\n── ${label}\n   단계: ${stage ? stage.name + ' ' + stage.index : '-'} | 1~3위: ${paths.slice(0, 3).map(p => p.name + p.total + p.grade).join(' ')} | 강점: ${strong.map(x => x.name + ' ' + O.fmtScore(x)).join(', ')} | 약점: ${weak.map(x => x.name + ' ' + O.fmtScore(x)).join(', ')} | 팁: ${tips.map(t => t.name).join(', ')}`);
  const shown = [txt, free.hidden.map(h => h.name + h.score + h.why).join(' '), free.tips.map(x => x.name + x.for + x.tip).join(' '), free.sevenDay.flat().join(' '), free.preview.text, free.stage ? free.stage.name + free.stage.line : '', tz.surprise, tz.toc.join(' '), tz.locked.join(' '), tz.goalLine || ''].join(' | ');
  check(!/\bnull\b|undefined|NaN|\[object/.test(shown), `${label}: 화면에 보이는 글에 null/undefined/NaN 없음`);
  check(!/지금은 다른 길이 유리/.test(shown), `${label}: 모든 길이 낮아도 '다른 길이 유리' 같은 모순 문구 없음`);
  check(!(O.weakest(s, 3).some(w => w.name === '완성도') && O.weakest(s, 3).some(w => w.name === '마감도')), `${label}: 완성도·마감도 중복 없음`);
  const sk = O.strongest(s, 2).map(x => x.key);
  check(!O.weakest(s, 3).some(w => sk.includes(w.key)), `${label}: 같은 항목이 강점과 약점에 동시에 나오지 않음`);
  check(O.strongest(s, 2).every(x => x.v >= 3.5 || !O.strengthWhy(x).includes('이미 괜찮아요')), `${label}: 낮은 점수를 '이미 괜찮다'고 칭찬하지 않음`);
  const mean = O.judgeItems(s).reduce((t, x) => t + x.v, 0) / O.judgeItems(s).length;
  check(O.strongest(s, 2).every(x => x.v >= mean - 0.25), `${label}: 강점은 본인 평균(${mean.toFixed(2)}) 이상이거나 근접한 항목만`);
  if (stage && stage.key === 'explore') check(paths.every(p => p.grade >= 'C'), `${label}: 탐색기면 어떤 길도 A·B 등급이 아님`);
  if (stage && stage.key === 'base') check(paths.every(p => p.grade >= 'B'), `${label}: 기초 다지기면 A 등급 없음`);
  check(strong.length >= 2 && tips.length >= 2, `${label}: 숨은 강점 2개 이상, 디지털 팁 2개 이상`);
  check(paths.every(p => Number.isFinite(p.total)), `${label}: 모든 길 점수 계산됨`);
  if (ex.stageIn) check(stage && ex.stageIn.includes(stage.name), `${label}: 단계 ${stage && stage.name} ∈ ${ex.stageIn.join('/')}`);
  if (ex.topIn) check(ex.topIn.includes(paths[0].key), `${label}: 1위 ${paths[0].name}`);
  if (ex.notTop2) check(!paths.slice(0, 2).some(p => ex.notTop2.includes(p.key)), `${label}: ${ex.notTop2.join(',')}가 1~2위에 없음`);
  if (ex.weakHas) check(O.weakest(s, 3).some(w => w.name.startsWith(ex.weakHas)), `${label}: 약점에 ${ex.weakHas}`);
  if (ex.weakNot) check(!O.weakest(s, 6).some(w => ex.weakNot.includes(w.name)), `${label}: 해당 없음 항목(${ex.weakNot.join(',')})이 약점에 없음`);
  if (ex.strongAny) check(O.strongest(s, 3).some(x => ex.strongAny.some(n => x.name.startsWith(n))), `${label}: 강점에 ${ex.strongAny.join('/')} 중 하나`);
  if (ex.strongNot) check(!O.strongest(s, 2).some(x => ex.strongNot.includes(x.name)), `${label}: 흑백 그림의 '색 일관성'을 강점으로 내밀지 않음`);
  if (ex.tipHas) check(tips.some(t => t.key === ex.tipHas), `${label}: ${ex.tipHas} 디지털 팁`);
  if (ex.goalTop2) check(paths.slice(0, 2).some(p => p.isGoal), `${label}: 하고 싶은 길 2위 안`);
  if (ex.topGradeIn) check(ex.topGradeIn.includes(paths[0].grade), `${label}: 1위 등급 ${paths[0].grade}`);
  if (ex.mixedNote) check(txt.includes('손의 습관') && O.weakest(s, 3).every(w => w.kind !== 'axis' || w.name.endsWith('습관')), `${label}: 주제 혼합 안내 + 일관성은 '습관'으로 표기`);
  // 캐릭터가 없는데 캐릭터 관련 약점/처방이 나오면 의아하다
  if (O.sigScoreNull && false) {}
  const noChar = s.signals.character && s.signals.character.score == null;
  if (noChar) check(!txt.includes('캐릭터 고정성 1/5') && !txt.includes('캐릭터 고정성 2/5') && !/턴어라운드|표정 12칸/.test(s.rx.map(x => x.title).join(' ')), `${label}: 캐릭터 없는 그림에 캐릭터 처방·감점 없음`);
}
PERSONAS.forEach(p => { const ai = aiState(p); const s = O.buildResult({ name: '테스트', goal: p.goal }, ai, null); s.rx = O.weakest(s, 8).map(w => O.RX_LIB[w.key]).filter(Boolean).slice(0, 3); audit(p.id, s, p.expect); });
SELF.forEach(p => { const s = O.buildResult({ name: '테스트', goal: p.goal }, null, selfSource(p)); audit(p.id, s, p.expect); });
// 무작위 400건: 어떤 조합에서도 깨진 글·모순이 없는지 (조용히 돌리고 실패만 출력)
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (lo, hi, pNull) => rnd() < pNull ? null : lo + Math.floor(rnd() * (hi - lo + 1));
const quiet = console.log; let fuzzFails = 0;
for (let i = 0; i < 400; i++) {
  const p = { mixed: rnd() < .3, axes: K.map(() => [Math.floor(rnd() * 101), 1 + Math.floor(rnd() * 5)]), sig: SK.map(k => pick(1, 5, k === 'craft' ? 0 : .25)), craft: CK.map(k => pick(1, 10, ['colorh', 'digital', 'value'].includes(k) ? .2 : 0)) };
  if (p.sig[1] == null) p.sig[2] = null;
  const goal = ['unknown', 'picturebook', 'emoticon', 'goods', 'instatoon', 'portfolio'][Math.floor(rnd() * 6)];
  const s = O.buildResult({ name: '퍼즈', goal }, aiState(p), null); s.rx = O.weakest(s, 8).map(w => O.RX_LIB[w.key]).filter(Boolean).slice(0, 3);
  const before = fails; console.log = () => {}; try { audit('퍼즈 ' + i, s, goal === 'unknown' ? {} : { goalTop2: true }); } catch (e) { fails++; quiet('FAIL 퍼즈 ' + i + ' 예외: ' + e.message); } console.log = quiet;
  if (fails > before) { fuzzFails++; if (fuzzFails <= 5) quiet('FAIL 퍼즈 ' + i + ' ' + JSON.stringify({ goal, ...p })); }
}
console.log(`\n무작위 400건 중 실패 ${fuzzFails}건`);
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
