// 核心計算的自動化測試:  node tests/run.js
// 用假資料驗證持股/已實現損益、配息資格與週期推估、資料檢查。不需要瀏覽器或網路。
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'js');
const store = {};
const ctx = {
  console, Date, Math, Number, String, Set, Map, JSON, Array, Object, parseFloat, Promise,
  setTimeout, clearTimeout, AbortController, URL, Intl, isFinite, isNaN,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, getElementById: () => null, documentElement: { dataset: {} } },
  navigator: {}, matchMedia: () => ({ matches: false }),
  crypto: { subtle: {} }, location: {}, fetch: () => Promise.reject(new Error('no network in tests'))
};
ctx.window = ctx;
vm.createContext(ctx);
// 與 index.html 相同的載入順序(只載入純計算會用到的檔案)
const files = ['config', 'utils', 'appearance', 'portfolio', 'autodiv', 'datacheck'];
const src = files.map(f => fs.readFileSync(path.join(root, f + '.js'), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;this.__t = { STATE, CONFIG, AUTODIV, _exDiv, replayPurchases, computeRealizedPL, computeOpenHoldings, computePersonStats,' +
  ' autodivSharesBefore, autodivBizDaysBefore, autodivEstimateNet, autodivInterval, autodivIntervalFor, autodivAnnualPerShare,' +
  ' computePayoutEvents, computePendingDividends, runDataCheck, autodivParseRoc, trailing12Dividends, dividendYieldOnCost, autodivFindRecord };', ctx);
const T = ctx.__t;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('✗', name, '\n   期望', JSON.stringify(want), '\n   實際', JSON.stringify(got)); }
}
function near(name, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) pass++; else { fail++; console.log('✗', name, '期望', want, '實際', got); }
}
const P = (id, person, symbol, amount, price, shares, fee, date) => ({ id, person, symbol, amount, price, shares, fee, date, created_at: date + 'T00:00:00Z' });
const set = (d) => { T.STATE.data = Object.assign({ purchases: [], bank: [], savings: [], dividends: [], symbols: [], snapshots: [], price_history: [], meta: {} }, d); };

// ---------- 持股 / 已實現 ----------
set({ purchases: [
  P('a', '黃', '0050', 100000, 100, 1000, 20, '2026-01-10'),
  P('b', '黃', '0050', -120000, 120, -1000, 50, '2026-05-10'),   // 全賣
  P('c', '黃', '0056', 70000, 35, 2000, 20, '2026-02-10'),
  P('d', '黃', '0056', -20000, 40, -500, 30, '2026-06-10')       // 部分賣
]});
const open = T.computeOpenHoldings('黃');
eq('全賣的標的不在持股', Object.keys(open), ['0056']);
eq('部分賣後股數', open['0056'].shares, 1500);
near('部分賣後成本(加權平均)', open['0056'].cost, 52515);
const sells = T.computeRealizedPL();
near('全賣已實現損益', sells.find(s => s.symbol === '0050').realized_pl, 19930);
near('部分賣已實現損益', sells.find(s => s.symbol === '0056').realized_pl, 2465);
const stats = T.computePersonStats();
near('總本金只算目前持有', stats['黃'].totalCost, 52515);

// ---------- 除息資格 ----------
eq('除息前 2 個營業日(週三除息)', T.autodivBizDaysBefore('2026-09-16', 2), '2026-09-14');
eq('跨週末', T.autodivBizDaysBefore('2026-09-15', 2), '2026-09-11');
set({ purchases: [
  P('1', '黃', '00919', 1, 25, 10000, 0, '2026-09-10'),
  P('2', '黃', '00919', 1, 25, 1000, 0, '2026-09-14'),   // 除息前 2 個營業日:算
  P('3', '黃', '00919', 1, 25, 2000, 0, '2026-09-15'),   // 除息前一個營業日:不算
  P('4', '黃', '00919', 1, 25, 3000, 0, '2026-09-16')    // 除息當天:不算
]});
eq('除息資格股數', T.autodivSharesBefore('黃', '00919', '2026-09-16'), 11000);

// ---------- 費用估算 ----------
eq('小額:只扣匯費', T.autodivEstimateNet(1100), 1090);
eq('滿 2 萬:扣 2.11% 補充保費與匯費', T.autodivEstimateNet(20000), Math.round(20000 - 20000 * 0.0211 - 10));
eq('民國日期轉換', T.autodivParseRoc('115年09月16日'), '2026-09-16');

// ---------- 週期與年配息 ----------
const hist = (sym, list) => list.map(([d, p]) => ({ symbol: sym, exDate: d, perShare: p }));
T._exDiv.list = [].concat(
  hist('Q', [['2025-09-16', 0.54], ['2025-12-16', 0.54], ['2026-03-17', 0.78], ['2026-06-16', 1], ['2026-09-16', 1.1]]),
  hist('M', [['2026-07-09', 0.12], ['2026-08-05', 0.12], ['2026-09-07', 0.12]]),
  hist('N', [['2026-09-20', 0.5]]),
  hist('S', [['2026-01-22', 1], ['2026-07-21', 0.6]]));
set({ symbols: [{ symbol: 'N', months: '2,5,8,11' }, { symbol: 'X', months: '' }] });
const h = (s) => T._exDiv.list.filter(e => e.symbol === s);
near('季配週期約 91 天', T.autodivInterval(h('Q')), 91, 3);
near('月配週期約 30 天', T.autodivInterval(h('M')), 30, 3);
eq('只有 1 筆:歷史推不出週期', T.autodivInterval(h('N')), null);
near('只有 1 筆:用標的設定月份數補位(4 個月→91 天)', T.autodivIntervalFor('N', h('N')), 91, 1);
near('季配年配息 = 最近 4 次平均 × 4', T.autodivAnnualPerShare('Q'), (0.54 + 0.78 + 1 + 1.1), 0.001);
near('半年配年配息', T.autodivAnnualPerShare('S'), 1.6, 0.001);
near('只有 1 筆+設定季配 → 0.5 × 4', T.autodivAnnualPerShare('N'), 2, 0.001);
eq('沒歷史沒設定 → null', T.autodivAnnualPerShare('X'), null);

// ---------- 配息事件推估與去重 ----------
set({ purchases: [P('1', '黃', 'Q', 1, 25, 1000, 0, '2025-01-01')], dividends: [] });
const ev = T.computePayoutEvents('黃', '2026-09-01', '2027-01-31').events;
eq('已知除息事件(尚未入帳)', ev.find(e => e.exDate === '2026-09-16').kind, 'ex');
eq('未來預估事件存在', ev.some(e => e.kind === 'est'), true);
set({ purchases: [P('1', '黃', 'Q', 1, 25, 1000, 0, '2025-01-01')],
      dividends: [{ id: 'd', person: '黃', symbol: 'Q', total: 1090, amount_per_share: 1.1, shares: 1000, date: '2026-10-14' }] });
const ev2 = T.computePayoutEvents('黃', '2026-09-01', '2026-12-31').events;
eq('已記錄的配息標為已入帳', ev2.find(e => e.exDate === '2026-09-16').kind, 'paid');
eq('已入帳金額用你記的實領', ev2.find(e => e.exDate === '2026-09-16').amount, 1090);

// ---------- 資料檢查 ----------
set({ purchases: [
  P('a', '黃', 'Q', 50000, 100, 100, 0, '2026-04-01'),               // 金額對不上單價×股數
  P('b', '黃', 'Q', -5000, 10, -500, 0, '2026-05-01'),                // 賣超過持有
  P('c', '黃', 'Q', 1000, 10, 100, 0, '2099-01-01'),                  // 未來日期
  P('d', '黃', 'Z', 1000, 10, 100, 0, '2026-03-15'),                  // 週日
  P('e', '黃', 'Z', 1000, 10, 100, 0, '2026-03-15')                   // 與 d 重複
]});
const dc = T.runDataCheck();
const msgs = dc.warns.map(w => w.msg).join('\n');
eq('抓到金額不符', /差距較大/.test(msgs), true);
eq('抓到賣超過持有', /賣超過持有/.test(msgs), true);
eq('抓到未來日期', /日期在未來/.test(msgs), true);
eq('抓到重複', /完全相同/.test(msgs), true);
eq('週日列為參考', dc.infos.some(i => /星期日/.test(i.msg)), true);

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}:${pass} 通過、${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
