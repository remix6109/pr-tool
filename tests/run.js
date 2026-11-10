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
const files = ['config', 'utils', 'appearance', 'portfolio', 'autodiv', 'datacheck', 'daily', 'quant', 'dca', 'review', 'status'];
const src = files.map(f => fs.readFileSync(path.join(root, f + '.js'), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;this.__t = { STATE, CONFIG, AUTODIV, _exDiv, replayPurchases, computeRealizedPL, computeOpenHoldings, computePersonStats,' +
  ' autodivSharesBefore, autodivBizDaysBefore, autodivEstimateNet, autodivInterval, autodivIntervalFor, autodivAnnualPerShare,' +
  ' computePayoutEvents, computePendingDividends, runDataCheck, autodivParseRoc, trailing12Dividends, dividendYieldOnCost, autodivFindRecord, _payDates, autodivPayDate, twYmd, normalizeDataDates, computeDailyValues, dailyPnlSince, computePendingDca, dcaPlans, computeYearReview, statusExpectedCloseDay, statusLocalChecks, quantDrawdown, quantVol, quantStats, quantReplay, quantTwr, quantBacktest, quantRows, fmt };', ctx);
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

// ---------- 實際發放日 ----------
T._payDates.data = {
  '0056': [{ payDate: '2026-11-11', perShare: 1.72 }, { payDate: '2026-08-10', perShare: 1.35 }],
  '00400A': [{ payDate: '2026-11-05', perShare: 0.12 }, { payDate: '2026-10-05', perShare: 0.12 }, { payDate: '2026-08-31', perShare: 0.12 }]
};
eq('有公告:用實際發放日', T.autodivPayDate('0056', '2026-10-22', 1.72), { date: '2026-11-11', actual: true });
eq('每股配息對不上:改用估算', T.autodivPayDate('0056', '2026-10-22', 1.5).actual, false);
eq('月配每次金額一樣:取除息後最近的一次', T.autodivPayDate('00400A', '2026-10-08', 0.12).date, '2026-11-05');
eq('月配:9 月那次對到 10/05', T.autodivPayDate('00400A', '2026-09-07', 0.12).date, '2026-10-05');
eq('沒資料:除息日 + 28 天', T.autodivPayDate('9999', '2026-10-01', 1), { date: '2026-10-29', actual: false });
T._payDates.data = null;

// ---------- 資料檢查 ----------
set({ purchases: [
  P('a', '黃', 'Q', 50000, 100, 100, 0, '2026-04-01'),               // 金額對不上單價×股數
  P('b', '黃', 'Q', -5000, 10, -500, 0, '2026-05-01'),                // 賣超過持有
  P('c', '黃', 'Q', 1000, 10, 100, 0, '2099-01-01'),                  // 未來日期
  P('d', '黃', 'Z', 1000, 10, 100, 0, '2026-03-15'),                  // 週日
  P('e', '黃', 'Z', 1000, 10, 100, 0, '2026-03-15')                   // 與 d 重複
]});
T._exDiv.list = [{ symbol: 'Z', exDate: '2026-03-17', perShare: 1 }];   // 讓 Z 在 3/15(週日)後兩天除息
const dc = T.runDataCheck();
const msgs = dc.warns.map(w => w.msg).join('\n');
eq('抓到金額不符', /差距較大/.test(msgs), true);
eq('抓到賣超過持有', /賣超過持有/.test(msgs), true);
eq('抓到未來日期', /日期在未來/.test(msgs), true);
eq('抓到重複', /完全相同/.test(msgs), true);
eq('除息前幾天買在週日 → 建議處理', dc.warns.some(w => /星期日/.test(w.msg)), true);
set({ purchases: [P('w', '黃', 'Z', 1000, 10, 100, 0, '2026-02-01')] });   // 週日但離除息很遠
{ const r = T.runDataCheck(); eq('週日但離除息很遠 → 不提醒', r.warns.concat(r.infos).some(x => /星期/.test(x.msg)), false); }

// ---------- 股利對應到正確的除息(月配、每股相同時不能對錯期) ----------
T._exDiv.list = [{ symbol: 'M', exDate: '2026-07-09', perShare: 0.12 }, { symbol: 'M', exDate: '2026-08-05', perShare: 0.12 }];
set({ purchases: [P('a', '蘇', 'M', 100000, 10, 10000, 0, '2026-06-01'), P('b', '蘇', 'M', 90000, 10, 9000, 0, '2026-07-20')],
      dividends: [{ id: 'd1', person: '蘇', symbol: 'M', total: 1190, amount_per_share: 0.12, shares: 10000, date: '2026-07-30' },
                  { id: 'd2', person: '蘇', symbol: 'M', total: 2270, amount_per_share: 0.12, shares: 19000, date: '2026-08-30' }] });
eq('月配兩期都對得上,不誤報', T.runDataCheck().warns.length, 0);
set({ purchases: [P('a', '蘇', 'M', 100000, 10, 10000, 0, '2026-06-01')],
      dividends: [{ id: 'd1', person: '蘇', symbol: 'M', total: 2270, amount_per_share: 0.12, shares: 19000, date: '2026-08-30' }] });
eq('股數對不上才報', T.runDataCheck().warns.some(w => /領息股數/.test(w.msg)), true);

// ---------- 日期(後端舊版傳 UTC,要換算成台灣日期) ----------
eq('UTC 16:00 → 台灣隔天', T.twYmd('2025-03-02T16:00:00.000Z'), '2025-03-03');
eq('跨月跨年', T.twYmd('2025-12-31T16:00:00.000Z'), '2026-01-01');
eq('純日期不動', T.twYmd('2026-03-16'), '2026-03-16');
eq('顯示用 fmt.date', T.fmt.date('2025-03-09T16:00:00.000Z'), '2025-03-10');
const nd = T.normalizeDataDates({ purchases: [{ date: '2025-03-02T16:00:00.000Z', created_at: '2025-03-02T16:00:00.000Z' }], dividends: [{ date: '2026-04-14' }], meta: {} });
eq('整批正規化只改 date 欄', [nd.purchases[0].date, nd.purchases[0].created_at, nd.dividends[0].date], ['2025-03-03', '2025-03-02T16:00:00.000Z', '2026-04-14']);

// ---------- 每日真實市值與損益 ----------
const H = (date, symbol, close_price) => ({ date, symbol, close_price });
set({ purchases: [
  P('a', '黃', '0056', 30000, 30, 1000, 20, '2026-10-01'),
  P('b', '黃', '代號0050', 50000, 100, 500, 20, '2026-11-03'),      // 月中再買一檔
  P('c', '蘇', '0056', 30000, 30, 1000, 20, '2026-10-01')
], price_history: [
  H('2026-10-28', '0056', 31), H('2026-10-29', '0056', 32), H('2026-10-30', '0056', 31.5),
  H('2026-11-03', '0056', 32), H('2026-11-04', '0056', 33), H('2026-11-04', '0050', 102), H('2026-11-05', '0056', 33), H('2026-11-05', '0050', 101)
]});
const dv = T.computeDailyValues('黃');
eq('每日市值:有持股沒收盤價的那天不算', dv.map(x => x.date), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-04', '2026-11-05']);
eq('每日市值:當天持股 × 當天收盤', [dv[0].value, dv[3].value, dv[4].value], [31000, 33000 + 51000, 33000 + 50500]);
eq('累計投入含手續費', [dv[0].cost, dv[4].cost], [30020, 80040]);
eq('新投入的錢記在下一個算得出來的點', dv[3].flow, 50020);
const today1 = T.dailyPnlSince(dv, '2026-11-05');
eq('今日損益 = 市值變化', Math.round(today1.pnl), -500);
const mon = T.dailyPnlSince(dv, '2026-11-01');
eq('本月損益要扣掉新投入的錢', Math.round(mon.pnl), 83500 - 31500 - 50020);
near('本月損益率的分母含新投入', mon.pct, (83500 - 31500 - 50020) / (31500 + 50020) * 100, 0.001);
eq('期間開始前沒有資料 → 算不出來', T.dailyPnlSince(dv, '2026-10-28'), null);
eq('最新一點比期間還早 → 算不出來', T.dailyPnlSince(dv, '2026-11-09'), null);
eq('只算那個人的', T.computeDailyValues('蘇').map(x => x.value), [31000, 32000, 31500, 32000, 33000, 33000]);

// ---------- 定期定額:到期還沒記的才提醒 ----------
const plans = [
  { id: 'a', person: '黃', symbol: '0056', amount: 3000, day: 5, start: '2026-10', on: true },
  { id: 'b', person: '蘇', symbol: '0050', amount: 5000, day: 20, start: '2026-11', on: true },
  { id: 'c', person: '黃', symbol: '00919', amount: 2000, day: 1, start: '2026-01', on: false }
];
delete store['pr.dcaDismissed'];
set({ purchases: [P('a', '黃', '代號0056', 3000, 30, 100, 20, '2026-10-06')], meta: { dca_plans: JSON.stringify(plans) } });
eq('讀得到計畫', T.dcaPlans().length, 3);
eq('10 月買過了、11 月到期還沒買 → 提醒 11 月那筆', T.computePendingDca('2026-11-10').map(x => x.key), ['a|2026-11']);
eq('到期日是那個月的那一天', T.computePendingDca('2026-11-10')[0].due, '2026-11-05');
eq('還沒到那一天不提醒;暫停的不提醒', T.computePendingDca('2026-11-04').length, 0);
eq('開始月份以前的不提醒', T.computePendingDca('2026-11-25').map(x => x.key), ['a|2026-11', 'b|2026-11']);
store['pr.dcaDismissed'] = JSON.stringify(['a|2026-11']);
eq('按過「這個月略過」就不再提醒', T.computePendingDca('2026-11-25').map(x => x.key), ['b|2026-11']);
delete store['pr.dcaDismissed'];
eq('跨年:1 月時會看去年 12 月(依到期日排序)', T.computePendingDca('2027-01-06').map(x => x.key), ['a|2026-12', 'b|2026-12', 'a|2027-01']);
set({ purchases: [], meta: {} });
eq('沒有設定計畫就什麼都沒有', T.computePendingDca('2026-11-10'), []);
set({ purchases: [], meta: { dca_plans: '{壞掉的 JSON' } });
eq('計畫資料壞掉不當機', T.dcaPlans(), []);

// ---------- 年度回顧 ----------
set({ purchases: [
  P('a', '黃', '0056', 60000, 30, 2000, 20, '2025-12-10'),
  P('b', '黃', '0056', 30000, 30, 1000, 20, '2026-01-10'),
  P('c', '蘇', '0050', 50000, 100, 500, 20, '2026-01-20'),       // 累計突破 10 萬
  P('d', '黃', '00919', 10000, 20, 500, 20, '2026-03-05'),
  P('e', '黃', '00919', -6000, 24, -250, 30, '2026-06-01')       // 賣出不算投入
], dividends: [
  { person: '黃', symbol: '0056', total: 1500, date: '2026-04-15' },
  { person: '蘇', symbol: '0050', total: 900, date: '2026-07-20' },
  { person: '黃', symbol: '0056', total: 800, date: '2025-10-15' }
], island: [
  { tile: 'next', text: '做完年度回顧', date: '2026-11-10', note: '' },
  { tile: '_tile', text: '健身', date: '', note: 'tile:{"key":"t1"}' },
  { tile: 'app', text: '舊的事', date: '2025-05-01', note: 'ref:app:0' }
] });
const rv = T.computeYearReview('2026');
eq('今年投入(含手續費,不含賣出)', rv.invested, 30020 + 50020 + 10020);
eq('買進筆數與有買的月份', [rv.buys, rv.activeMonths, rv.symbols], [3, 2, 3]);
eq('賣出拿回的錢另外算', rv.sold, 6000 - 30);
eq('今年配息', [rv.div, rv.divN], [2400, 2]);
eq('買最多的、配息最多的', [rv.topSym.sym, rv.topDiv.sym], ['0050', '0056']);
eq('投入最多的月份', rv.bestMonth.month, 1);
eq('里程碑只算今年跨過的', rv.milestones, [{ date: '2026-01-20', level: 100000 }]);
eq('各自的統計', [rv.per['黃'].invested, rv.per['蘇'].invested, rv.per['蘇'].divN], [40040, 50020, 1]);
eq('島上今年完成的事(不含格子定義)', rv.done, ['做完年度回顧']);
eq('不是今年第一次買', rv.firstBuyThisYear, null);
eq('第一次買進的那一年會標出來', T.computeYearReview('2025').firstBuyThisYear, '2025-12-10');

// ---------- 系統狀態 ----------
const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm);
eq('平日收盤後 → 今天', T.statusExpectedCloseDay(at(2026, 11, 10, 15, 0)), '2026-11-10');
eq('平日收盤前 → 前一個交易日', T.statusExpectedCloseDay(at(2026, 11, 10, 10, 0)), '2026-11-09');
eq('週一早上 → 上週五', T.statusExpectedCloseDay(at(2026, 11, 9, 9, 0)), '2026-11-06');
eq('週末 → 週五', [T.statusExpectedCloseDay(at(2026, 11, 7, 16, 0)), T.statusExpectedCloseDay(at(2026, 11, 8, 16, 0))], ['2026-11-06', '2026-11-06']);
const priceLevel = (latest) => { set({ price_history: [{ date: latest, symbol: '0056', close_price: 30 }] }); return T.statusLocalChecks(at(2026, 11, 10, 15, 0)).find(x => x.label === '每日收盤價').level; };
eq('收盤價有記到今天 → 正常', priceLevel('2026-11-10'), 'ok');
eq('差一天 → 提醒(可能休市)', priceLevel('2026-11-09'), 'warn');
eq('差三天以上 → 排程可能沒跑', priceLevel('2026-11-05'), 'bad');
T.STATE.lastSync = { ok: false, at: Date.now(), error: '連線逾時' };
eq('同步失敗會標出來', T.statusLocalChecks(at(2026, 11, 10, 15, 0)).find(x => x.label === '資料同步').level, 'bad');

// ---------- 風險與回測 ----------
const D7 = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12'];
const dd1 = T.quantDrawdown(D7, [100, 110, 99, 88, 95, 115, 103]);
near('最大回檔:從最高點到最低點', dd1.pct, -20, 0.001);
eq('最大回檔:高點、低點、漲回來的日期', [dd1.peak, dd1.trough, dd1.recover], ['2026-01-05', '2026-01-07', '2026-01-09']);
eq('還沒漲回高點 → recover 是 null', T.quantDrawdown(D7.slice(0, 2), [100, 80]).recover, null);
eq('一路上漲 → 沒有回檔', T.quantDrawdown(D7.slice(0, 3), [100, 101, 102]).pct, 0);
eq('不到 60 個交易日不算波動度', T.quantVol([1, 2, 3]), null);
const steady = Array.from({ length: 80 }, (_, i) => 100 * Math.pow(1.01, i));
near('每天漲一樣多 → 波動度是 0', T.quantVol(steady), 0, 1e-6);
const zig = Array.from({ length: 253 }, (_, i) => i % 2 ? 101 : 100);
near('每天 ±1% 來回 → 年化波動約 15.8%', T.quantVol(zig), Math.log(1.01) * Math.sqrt(252) * 100 * Math.sqrt(252 / 251), 0.2);
const st2 = T.quantStats(['2024-01-02', '2025-01-02', '2026-01-02'], [100, 150, 200]);
near('兩年翻倍 → 年化約 41.4%', st2.cagr, (Math.sqrt(2) - 1) * 100, 0.1);
eq('不到一年不給年化', T.quantStats(['2026-01-02', '2026-06-02'], [100, 120]).cagr, null);
near('可以指定從哪一天開始算', T.quantStats(['2024-01-02', '2025-01-02', '2026-01-02'], [100, 150, 200], '2025-01-01').total, 33.333, 0.01);
// 重播買賣:加碼不算賺,配息要加回來
const QA = { A: { d: D7.slice(0, 5), c: [10, 11, 11, 12.1, 11.6], a: [10, 11, 11, 12.1, 12.1], div: [['2026-01-08', 0.5]] } };
const rowsA = [{ date: '2026-01-02', sym: 'A', shares: 100, money: 1000, price: 10 }, { date: '2026-01-06', sym: 'A', shares: 100, money: 1100, price: 11 }];
const rp = T.quantReplay(rowsA, QA);
eq('每天的市值 = 當天持股 × 當天收盤', rp.map(x => Math.round(x.value)), [1000, 1100, 2200, 2420, 2320]);
eq('累計投入與當天新投入', [rp.map(x => x.cost), rp[2].flow], [[1000, 1000, 2100, 2100, 2100], 1100]);
eq('除息日的配息 = 除息前持有的股數 × 每股配息', rp[4].div, 100);
eq('時間加權:加碼那天不算報酬、除息那天不算虧', T.quantTwr(rp).map(v => Math.round(v * 10) / 10), [100, 110, 110, 121, 121]);
eq('假日記的買進算在下一個交易日', T.quantReplay([{ date: '2026-01-03', sym: 'A', shares: 100, money: 1100, price: 11 }], QA)[0].date, '2026-01-05');
const late = T.quantReplay([{ date: '2026-01-02', sym: 'A', shares: 100, money: 1000, price: 10 }, { date: '2026-01-02', sym: 'L', shares: 100, money: 2000, price: 20 }],
  { A: QA.A, L: { d: D7.slice(2, 5), c: [30, 33, 33], a: [30, 33, 33], div: [] } });
eq('行情比買進晚出現:換成真實收盤價的那一下不算賺賠', T.quantTwr(late).map(v => Math.round(v * 10) / 10), [100, 103.3, 103.3, 113.7, 113.7]);
// 回測
const QB = { A: { d: ['2026-01-02', '2026-02-02', '2026-03-02'], c: [10, 20, 40], a: [10, 20, 40], div: [] }, B: { d: ['2026-01-02', '2026-02-02', '2026-03-02'], c: [10, 10, 20], a: [10, 10, 20], div: [] } };
const bt = T.quantBacktest([{ date: '2026-01-02', sym: 'A', shares: 100, money: 1000 }, { date: '2026-03-02', sym: 'A', shares: 25, money: 1000 }, { date: '2026-02-02', sym: 'Z', shares: 1, money: 500 }], QB, 'B');
eq('回測:沒有歷史股價的標的不算進來', [bt.invested, bt.excluded], [2000, ['Z']]);
near('回測:實際買法', bt.actual, 1000 * 4 + 1000, 0.01);
near('回測:每月平均買', bt.monthly, 2000 / 3 * (4 + 2 + 1), 0.01);
near('回測:同樣的錢買對照標的', bt.bench, 1000 * 2 + 1000, 0.01);
near('回測:假日買的用下一個交易日的價格', T.quantBacktest([{ date: '2026-01-15', sym: 'A', shares: 1, money: 1000 }], QB, 'B').actual, 2000, 0.01);
set({ purchases: [P('a', '黃', '代號0056', 3000, 30, 100, 20, '2026-10-06'), P('b', '蘇', '0050', 5000, 50, 100, 20, '2026-10-07'), P('c', '黃', '0056', -1500, 30, -50, 10, '2026-10-08')] });
eq('quantRows:只取那個人、代號去掉前綴、賣出是負的', T.quantRows('黃').map(r => [r.sym, r.shares, r.money]), [['0056', 100, 3020], ['0056', -50, -1490]]);

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}:${pass} 通過、${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
