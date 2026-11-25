// 무료 진단을 외부 호스팅(Netlify Drop, GitHub Pages, 아임웹 등)용 완결 HTML로 묶는다.
// 실행: node bulkup/tools/build-public.cjs  →  bulkup/public/index.html, bulkup/public/otw-core.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'free-diagnosis.html'), 'utf8');
const firstStyle = src.indexOf('<style>');
const headPart = src.slice(0, firstStyle).split('\n').filter(l => /^<(title|meta|link)\b/.test(l.trim())).join('\n');
const body = src.slice(firstStyle);
const out = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${headPart}
</head>
<body style="margin:0">
${body}
</body>
</html>
`;
const dist = path.join(root, 'public');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), out);
fs.copyFileSync(path.join(root, 'otw-core.js'), path.join(dist, 'otw-core.js'));
console.log('built', path.join(dist, 'index.html'), out.length, 'bytes');
