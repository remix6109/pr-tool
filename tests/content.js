// 探索群島內容檢查:  node tests/content.js
// 每 10 天的自動內容更新送審前必須通過。規則:舊課程/題目只能修正、不能刪除;新課要有 added 日期;格式要正確。
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'explore-data.js'), 'utf8');
const ctx = {};
new Function('ctx', src + '\n;Object.assign(ctx, { AI_LESSONS, AUTO_LESSONS, FIN_LESSONS, AI_TOOLS, AUTO_TOOLS });')(ctx);
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-baseline.json'), 'utf8'));

let fail = 0;
const bad = (msg) => { fail++; console.log('✗ ' + msg); };
const sets = { ai: ctx.AI_LESSONS, auto: ctx.AUTO_LESSONS, fin: ctx.FIN_LESSONS };
const seen = new Set();
const today = new Date().toISOString().slice(0, 10);

Object.entries(sets).forEach(([name, L]) => {
  L.forEach(l => {
    const where = `${name}/${l.id}`;
    if (!l.id || seen.has(l.id)) bad(`${where}:id 重複或空白`);
    seen.add(l.id);
    if (!l.title || !l.intro || !l.icon) bad(`${where}:缺少 title / intro / icon`);
    if (!Array.isArray(l.sections) || !l.sections.length || l.sections.some(s => !s.h || !s.p)) bad(`${where}:sections 格式錯誤`);
    if (!Array.isArray(l.quiz) || !l.quiz.length) bad(`${where}:至少要有一題測驗`);
    (l.quiz || []).forEach((q, i) => {
      if (!q.q || !Array.isArray(q.options) || q.options.length < 2 || !q.why) bad(`${where} 第 ${i + 1} 題:格式錯誤`);
      if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < (q.options || []).length)) bad(`${where} 第 ${i + 1} 題:answer 超出選項範圍`);
    });
    if (l.added && !/^\d{4}-\d{2}-\d{2}$/.test(l.added)) bad(`${where}:added 日期格式要是 YYYY-MM-DD`);
    if (l.added && l.added > today) bad(`${where}:added 不能是未來日期`);
    const old = baseline.lessons[l.id];
    if (!old && !l.added) bad(`${where}:新課程必須加上 added 日期`);
    if (old && (l.quiz || []).length < old) bad(`${where}:題目變少了(原本 ${old} 題),舊題目不能刪除`);
  });
});
// 舊課程不能被刪除
Object.keys(baseline.lessons).forEach(id => { if (!seen.has(id)) bad(`課程 ${id} 不見了:舊課程不能刪除`); });
// 工具卡
const toolIds = new Set();
ctx.AI_TOOLS.tools.forEach(t => {
  if (!t.id || toolIds.has(t.id)) bad(`工具 ${t.name}:id 重複或空白`);
  toolIds.add(t.id);
  if (!(t.score >= 1 && t.score <= 5)) bad(`工具 ${t.id}:score 要 1~5`);
  if (!/^https:\/\//.test(t.url)) bad(`工具 ${t.id}:url 要是 https`);
  ['what', 'free', 'paid', 'scoreWhy'].forEach(k => { if (!t[k]) bad(`工具 ${t.id}:缺少 ${k}`); });
});
baseline.tools.forEach(id => { if (!toolIds.has(id)) bad(`工具 ${id} 不見了:停止服務的工具請改成「已停止服務」而不是刪除`); });
if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.AI_TOOLS.checkedDate)) bad('AI_TOOLS.checkedDate 格式錯誤');

const n = Object.values(sets).reduce((a, L) => a + L.length, 0);
const qn = Object.values(sets).reduce((a, L) => a + L.reduce((b, l) => b + l.quiz.length, 0), 0);
console.log(`\n${fail === 0 ? '✅ 內容檢查通過' : '❌ 內容檢查失敗'}:${n} 堂課、${qn} 題、${toolIds.size} 張工具卡,${fail} 個問題`);
process.exit(fail ? 1 : 0);
