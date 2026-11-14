// 操作流程測試:用假資料把 APP 打開,像真人一樣點按鈕,檢查「該出現的有沒有出現、數字有沒有變對」。
//   node tests/flow.js            全部跑
//   node tests/flow.js 現價 我的島   只跑名稱含這些字的流程
//   node tests/flow.js --show      開著瀏覽器視窗跑(看得到它在點)
// run.js 驗的是計算對不對;這支抓的是「按了沒反應、畫面壞掉、存了沒進後端」這種不一定會報錯的問題。
// 需要電腦上有 Chrome,和上一層資料夾的 playwright-core(npm i -D playwright-core)。資料都是假的,不會碰到真的試算表。
const crypto = require('crypto');
const { chromium } = require('playwright-core');
const { startFakeServer, SYMS } = require('./fake-server.js');

const args = process.argv.slice(2);
const SHOW = args.includes('--show');
const only = args.filter(a => !a.startsWith('--'));
const pad = (n) => String(n).padStart(2, '0');
const now = new Date(), TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
const QUOTE = {};   // 假的市場中繼站報價:每檔都比資料裡的現價高一點,看得出有沒有更新
SYMS.forEach(([s, name, p0], i) => { QUOTE[s] = { name, price: p0 + 1.11 + i, prev: p0, chgPct: 1, time: '13:30:00', date: TODAY }; });

// 假的長期日線:最近 420 個平日,每檔一條固定的隨機漫步(每次跑都一樣)
function fakePrices(sym) {
  let seed = [...sym].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 2147483647 || 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const d = [], c = [], a = [], div = [];
  let p = (QUOTE[sym] ? QUOTE[sym].prev : 100) * 0.8, adj = 1;
  for (let k = 599; k >= 0; k--) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
    if (t.getDay() % 6 === 0) continue;
    const ymd = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    p *= 1 + (rnd() - 0.47) * 0.02;
    if (QUOTE[sym] && d.length && d.length % 63 === 0) { div.push([ymd, 0.3]); adj *= 1 + 0.3 / p; }
    d.push(ymd); c.push(Math.round(p * 100) / 100); a.push(Math.round(p * adj * 10000) / 10000);
  }
  return { d, c, a, div };
}
let pricesDown = false;   // 模擬中繼站的歷史股價暫時取不到
let newsExtra = 0;        // 假新聞:多出幾則「剛發布」的(模擬有新新聞進來)
function fakeNews(cat, origin) {
  const list = [];
  for (let i = 0; i < newsExtra; i++) list.push({ id: cat + '-new-' + i, title: `【${cat}】剛發布的新聞 ${i + 1}`, url: 'https://news.cnyes.com/news/id/9' + i, time: new Date(Date.now() - 60e3).toISOString(), source: '鉅亨網', image: origin + '/icon.svg', stocks: [] });
  for (let i = 0; i < 8; i++) list.push({ id: cat + '-' + i, title: `【${cat}】測試新聞第 ${i + 1} 則`, url: 'https://news.cnyes.com/news/id/' + i, time: new Date(Date.now() - (i + 1) * 600e3).toISOString(), source: '鉅亨網', image: origin + '/icon.svg', stocks: [] });
  return list;
}

(async () => {
  const srv = await startFakeServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: !SHOW, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const pinHash = crypto.createHash('sha256').update('1357').digest('hex');
  await ctx.addInitScript(([api, hash]) => {
    if (localStorage.getItem('pr.pinHash')) return;      // 只在第一次開啟時設定;之後重新整理要保留 APP 自己存的東西
    localStorage.setItem('pr.apiUrl', api);
    localStorage.setItem('pr.pinHash', hash);
    localStorage.setItem('pr.sessionUntil', String(Date.now() + 864e5));
    localStorage.setItem('pr.autoPriceAt', String(Date.now() + 9e9));   // 先關掉「打開自動抓現價」,由流程自己測
  }, [srv.url + '/fake-api', pinHash]);
  // 只讓 APP 連到測試伺服器;市場中繼站回假資料;其他對外連線一律擋掉(測試不依賴網路)
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.host === '127.0.0.1:' + srv.port) return route.continue();
    if (u.host === 'localhost:8787') {
      const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
      if (u.pathname === '/quote') {
        const stocks = {};
        (u.searchParams.get('tw') || '').split(',').forEach(c => { if (QUOTE[c]) stocks[c] = QUOTE[c]; });
        return json({ ok: true, data: { at: new Date().toISOString(), taiex: null, stocks, txfDay: null, txfNight: null, intl: {}, errors: [] } });
      }
      if (u.pathname === '/news') {
        const cats = {};
        (u.searchParams.get('cat') || '').split(',').forEach(c => { cats[c] = fakeNews(c, srv.url); });
        return json({ ok: true, data: { at: new Date().toISOString(), cats } });
      }
      if (u.pathname === '/prices') {
        if (pricesDown) return json({ ok: false, error: '測試:暫時取不到' });
        const series = {};
        (u.searchParams.get('s') || '').split(',').slice(0, 6).forEach(c => { series[c] = fakePrices(c); });
        return json({ ok: true, data: { at: new Date().toISOString(), series } });
      }
      return json({ ok: false, error: '測試環境沒有這個資料' });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const pageErrors = [], dialogs = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_|ERR_FAILED/.test(m.text())) pageErrors.push('console: ' + m.text()); });
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

  let passN = 0, cur = '';
  const fails = [], skips = [];
  const ok = (cond, msg) => { if (cond) passN++; else fails.push(`【${cur}】${msg}`); return !!cond; };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const until = async (fn, arg, ms = 5000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (_) { return false; } };
  const called = async (action, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (srv.calls.some(c => c.action === action)) return true; await page.waitForTimeout(50); } return false; };
  const lastCall = (action) => srv.calls.filter(c => c.action === action).pop();
  const count = (action) => srv.calls.filter(c => c.action === action).length;
  const calledMore = async (action, n0, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (count(action) > n0) return true; await page.waitForTimeout(50); } return false; };
  const dialogSaid = async (text, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (dialogs.some(d => d.includes(text))) return true; await page.waitForTimeout(50); } return false; };
  const kept = {};   // 流程之間要記住的東西(例如刪掉的是哪一筆)
  const nav = async (p) => { await page.click(`.nav-btn[data-page="${p}"]`); await until((x) => document.querySelector('#page-' + x).classList.contains('active'), p); };
  const closeModals = () => ev(() => closeAllModals());
  const toast = () => ev(() => { const t = document.querySelector('#toast'); return t ? t.textContent : ''; });
  const openSettings = async () => { await closeModals(); await page.click('#btn-settings'); await until(() => !document.querySelector('#modal-settings').classList.contains('hidden')); };
  // 3D 畫面上的某個世界座標 → 螢幕座標,真的用滑鼠點下去
  const clickWorld = async (which, pos) => {
    const pt = await ev(([w, p]) => {
      const s = w === 'town' ? TOWN3D.s : MYI.s, c = s.renderer.domElement;
      c.scrollIntoView({ block: 'center' });
      const r = c.getBoundingClientRect(), v = new THREE.Vector3(p[0], p[1], p[2]).project(s.camera);
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }, [which, pos]);
    await page.mouse.click(pt.x, pt.y);
  };

  const FLOWS = {
    async '開啟與首頁'() {
      ok(await until(() => !!document.querySelector('#cards-people .person-card')), '首頁沒有出現個人卡片');
      ok(await ev(() => document.querySelector('#screen-app') && !document.querySelector('#screen-app').classList.contains('hidden')), '沒有進到 APP 畫面(卡在設定或解鎖)');
      const st = await ev(() => { const s = computePersonStats()[STATE.defaultPerson]; return { cost: s.totalCost, value: s.marketValue, shares: s.totalShares }; });
      ok(st.cost > 0 && st.value > 0 && st.shares > 0, `總本金/市值/股數應該大於 0,實際 ${JSON.stringify(st)}`);
      ok(await until((t) => document.querySelector('.person-card').textContent.includes(t), st.shares.toLocaleString('en-US')), '個人卡片上沒有顯示總股數');   // 數字有滾動動畫,等它跑完
      ok(await ev(() => STATE.lastSync && STATE.lastSync.ok), '沒有記錄到資料同步成功');
    },

    async '今日本週本月損益'() {
      ok(await page.locator('.pnl-strip .pnl-chip').count() === 3, '損益應該有三格(今日/本週/本月)');
      const txt = await page.textContent('.pnl-strip');
      ok(/[+-][\d,]+/.test(txt) && /%/.test(txt), `損益沒有顯示金額和百分比:${txt.replace(/\s+/g, ' ').slice(0, 60)}`);
      const sum = await ev(() => { const s = computeDailyValues(STATE.defaultPerson); const a = s[s.length - 1], b = s[s.length - 2]; return { calc: Math.round(a.value - b.value - a.flow), shown: document.querySelector('.pnl-chip .town-num').textContent }; });
      ok(Number(sum.shown.replace(/[^\d-]/g, '')) === sum.calc, `今日損益顯示 ${sum.shown},算出來是 ${sum.calc}`);
    },

    async '切換人員'() {
      const a = await page.textContent('.person-card .name');
      await page.click('#chip-su');
      ok(await until((x) => document.querySelector('.person-card .name').textContent !== x, a), '按了「蘇」個人卡片沒有換人');
      ok(await ev(() => STATE.defaultPerson) === '蘇', 'STATE.defaultPerson 應該是 蘇');
      await page.click('#chip-huang');
      ok(await until(() => STATE.defaultPerson === '黃' && document.querySelector('.person-card.huang')), '按了「黃」沒有切回來');
    },

    async '新增買進'() {
      const before = await ev(() => ({ n: STATE.data.purchases.length, shares: computePersonStats()['黃'].totalShares }));
      await nav('add');
      await page.click('[data-open="add-purchase"]');
      ok(await until(() => !document.querySelector('#modal-purchase').classList.contains('hidden')), '買進表單沒有打開');
      await ev(() => setPurchaseType('buy'));
      const sym = await ev(() => document.querySelector('#purchase-symbol').options[0].value);
      await page.selectOption('#purchase-symbol', sym);
      await page.fill('#purchase-amount', '3000'); await page.fill('#purchase-price', '30');
      const unit = await ev(() => STATE.purchaseUnit);
      await page.fill('#purchase-shares', unit === 'lots' ? '0.1' : '100');
      await page.fill('#purchase-fee', '20'); await page.fill('#purchase-note', '流程測試');
      await page.click('#purchase-submit');
      ok(await until(() => document.querySelector('#modal-purchase').classList.contains('hidden')), '按儲存後表單沒有關掉');
      ok(await called('add_purchase'), '後端沒有收到 add_purchase');
      const c = lastCall('add_purchase');
      ok(c && c.data.symbol === sym && c.data.amount === 3000 && c.data.shares === 100 && c.data.fee === 20 && c.data.date === TODAY && !!c.data.client_id,
        `送到後端的內容不對:${JSON.stringify(c && c.data)}`);
      ok(await until(() => { const r = STATE.data.purchases[STATE.data.purchases.length - 1]; return r && !String(r.id).startsWith('__tmp_'); }), '新增的那筆沒有換成後端給的正式 id');
      const after = await ev(() => ({ n: STATE.data.purchases.length, shares: computePersonStats()['黃'].totalShares }));
      ok(after.n === before.n + 1, `買賣紀錄應該多 1 筆(${before.n} → ${after.n})`);
      ok(after.shares === before.shares + 100, `總股數應該多 100(${before.shares} → ${after.shares})`);
      ok(srv.db.purchases.some(r => r.note === '流程測試'), '後端資料裡找不到這筆');
      kept.addId = await ev(() => String(STATE.data.purchases[STATE.data.purchases.length - 1].id));
    },

    async '新增賣出'() {
      const before = await ev(() => computePersonStats()['黃'].totalShares);
      await nav('add');
      await page.click('[data-open="add-purchase"]');
      await page.click('[data-ptype="sell"]');
      ok((await page.textContent('#modal-purchase-title')).includes('賣出'), '切到賣出後標題沒有變');
      const sym = await ev(() => document.querySelector('#purchase-symbol').value);
      ok(!!sym, '賣出的代號下拉應該只列出有持股的,結果是空的');
      await page.fill('#purchase-amount', '500'); await page.fill('#purchase-price', '50');
      await page.fill('#purchase-shares', (await ev(() => STATE.purchaseUnit)) === 'lots' ? '0.01' : '10');
      const n0 = count('add_purchase');
      await page.click('#purchase-submit');
      ok(await calledMore('add_purchase', n0), '後端沒有收到賣出');
      const c = lastCall('add_purchase');
      ok(c.data.amount === -500 && c.data.shares === -10, `賣出應該送負的金額和股數:${JSON.stringify(c.data)}`);
      ok(await ev(() => computePersonStats()['黃'].totalShares) === before - 10, '賣出後總股數應該少 10');
      await ev(() => setPurchaseType('buy'));
    },

    async '新增配息'() {
      const before = await ev(() => STATE.data.dividends.length);
      await nav('add');
      await page.click('[data-open="add-dividend"]');
      ok(await until(() => !document.querySelector('#modal-dividend').classList.contains('hidden')), '股利表單沒有打開');
      await page.fill('#dividend-total', '520');
      await page.click('#dividend-submit');
      ok(await called('add_dividend'), '後端沒有收到 add_dividend');
      ok(lastCall('add_dividend').data.total === 520, '配息金額沒有送對');
      ok(await ev(() => STATE.data.dividends.length) === before + 1, '股利紀錄應該多 1 筆');
    },

    async '儲存失敗會還原'() {
      const before = await ev(() => (STATE.data.bank || []).length);
      await nav('add');
      await page.click('[data-open="add-bank"]');
      await page.fill('#bank-amount', '999');
      srv.failNext('add_bank'); dialogs.length = 0;
      await page.click('#bank-submit');
      ok(await called('add_bank'), '後端沒有收到 add_bank');
      ok(await dialogSaid('儲存失敗'), '後端拒絕時沒有跳出「儲存失敗」');
      ok(await ev(() => (STATE.data.bank || []).length) === before, '儲存失敗後那筆應該被還原(不能留在畫面上)');
    },

    async '斷線時暫存、連線後補送'() {
      await nav('add');
      await page.click('[data-open="add-savings"]');
      await page.fill('#savings-amount', '1234');
      srv.offline = true;
      const n0 = count('add_savings');
      await page.click('#savings-submit');
      ok(await until(() => API.queueSize() === 1, null, 8000), '斷線時新增的紀錄沒有進暫存佇列');
      ok((await toast()).includes('暫存'), '斷線時沒有提示「已暫存」');
      srv.offline = false;
      await ev(() => API.flushQueue());
      ok(await until(() => API.queueSize() === 0), '連線後暫存的紀錄沒有補送出去');
      ok(count('add_savings') === n0 + 1 && lastCall('add_savings').data.amount === 1234, '補送到後端的內容不對(或重複送了)');
    },

    async '抓現價'() {
      await nav('home');
      await page.locator('#btn-refresh-prices').scrollIntoViewIfNeeded();
      const n0 = count('store_prices');
      await page.click('#btn-refresh-prices');
      ok(await until(() => /已更新 \d+ 檔現價/.test(document.querySelector('#toast').textContent), null, 15000), `沒有出現「已更新 N 檔現價」:${await toast()}`);
      ok((await toast()).includes('13:30'), '提示裡沒有標出價格是幾點的');
      ok(await calledMore('store_prices', n0), '後端沒有收到 store_prices');
      const c = lastCall('store_prices');
      ok(c.data.date === TODAY && Object.keys(c.data.prices).length === SYMS.length, `存進後端的日期或檔數不對:${c.data.date} / ${Object.keys(c.data.prices).length} 檔`);
      const bad = await ev((q) => STATE.data.symbols.filter(s => Math.abs(s.current_price - q[s.symbol].price) > 1e-6).map(s => s.symbol), QUOTE);
      ok(bad.length === 0, `這幾檔的現價沒有更新:${bad.join('、')}`);
      ok((await page.textContent('#price-update-time')).includes('13:30'), '「現價截至」沒有更新成 13:30');
      ok(await ev(() => !document.querySelector('#btn-refresh-prices').disabled), '抓完後按鈕沒有恢復');
    },

    async '打開自動更新現價'() {
      await ev(() => { STATE.data.symbols[0].current_price = 1; localStorage.removeItem('pr.autoPriceAt'); });
      const n0 = count('store_prices');
      await ev(() => autoRefreshPrices());
      ok(await until((q) => Math.abs(STATE.data.symbols[0].current_price - q) < 1e-6, QUOTE[SYMS[0][0]].price), '自動更新沒有把被改掉的價格修回來');
      ok(count('store_prices') === n0 + 1, '收盤後的自動更新應該存一次到後端');
      const at = await ev(() => localStorage.getItem('pr.autoPriceAt'));
      await ev(() => autoRefreshPrices());
      ok(await ev(() => localStorage.getItem('pr.autoPriceAt')) === at, '5 分鐘內不應該再抓一次');
    },

    async '資產走勢切換'() {
      await nav('home');
      await page.locator('#networth-mode').scrollIntoViewIfNeeded();
      await page.click('#networth-mode [data-nw="daily"]');
      ok(await until(() => _charts.networth && /真實/.test(_charts.networth.data.datasets[0].label)), '切到「每日」後圖表沒有換成真實市值');
      ok(await ev(() => _charts.networth.data.labels.length) >= 2, '每日走勢應該至少有兩個點');
      await page.click('#networth-mode [data-nw="month"]');
      ok(await until(() => _charts.networth && _charts.networth.data.datasets.length === 3), '切回「長期」後應該是三條線');
    },

    async '風險與回測'() {
      await nav('home');
      ok(await ev(() => document.querySelector('#card-quant').classList.contains('collapsed')), '「風險與回測」預設應該是收起來的(展開才抓資料)');
      pricesDown = true;
      await ev(() => { QUANT.series = null; QUANT.error = ''; QUANT.at = 0; });   // 前面的流程可能已經抓過,清掉才測得到「取不到」的畫面
      await page.locator('#card-quant > .card-title').scrollIntoViewIfNeeded();
      await page.click('#card-quant > .card-title');
      ok(await until(() => !!document.querySelector('#quant-retry')), '歷史股價取不到時,應該顯示說明和「再試一次」');
      pricesDown = false;
      await page.click('#quant-retry');
      ok(await until(() => document.querySelectorAll('#quant-body .q-tile').length >= 4, null, 15000), '重試後沒有顯示整體的風險指標');
      const tiles = await ev(() => [...document.querySelectorAll('#quant-body .q-tile')].map(t => t.textContent.replace(/\s+/g, ' ')));
      ok(tiles.some(t => t.includes('持股報酬') && /[+-]\d/.test(t)) && tiles.some(t => t.includes('最大回檔')) && tiles.some(t => t.includes('0050')), `整體指標不完整:${tiles.join(' | ').slice(0, 120)}`);
      ok(await until(() => !!_charts.quant && _charts.quant.data.datasets.length === 3), '報酬走勢圖應該有三條線(我的持股、0050、加權指數)');
      const chk = await ev(() => { const s = quantReplay(quantRows(STATE.defaultPerson), QUANT.series), t = quantTwr(s); return { n: s.length, first: s[0].date, firstBuy: quantRows(STATE.defaultPerson)[0].date, last: Math.round(s[s.length - 1].value), shown: t[t.length - 1] }; });
      ok(chk.n > 100 && chk.first >= chk.firstBuy, `整體序列應該從第一筆買進開始(${chk.first} / ${chk.firstBuy},${chk.n} 天)`);
      await page.click('#quant-tabs [data-q="each"]');
      const held = await ev(() => Object.keys(computeOpenHoldings(STATE.defaultPerson)).length);
      const extra = await ev(() => Object.keys(computeOpenHoldings(STATE.defaultPerson)).includes(QUANT.BENCH) ? 1 : 2);   // 自己有買 0050 就不重複列
      ok(await until((n) => document.querySelectorAll('#quant-body .q-table tbody tr').length === n, held + extra), '「各檔」應該列出每一檔持股,加上 0050(沒持有時)和加權指數');
      await page.click('#quant-tabs [data-q="bt"]');
      ok(await until(() => document.querySelectorAll('#quant-body .q-bt').length === 3), '「回測」應該有三種買法');
      const bt = await ev(() => { const b = quantBacktest(quantRows(STATE.defaultPerson), QUANT.series, QUANT.BENCH); return { actual: Math.round(b.actual), shown: document.querySelector('#quant-body .q-bt .town-num').textContent }; });
      ok(Number(bt.shown.replace(/[^\d-]/g, '')) === bt.actual, `回測顯示 ${bt.shown},算出來是 ${bt.actual}`);
      ok((await page.textContent('#quant-body')).includes('不是買賣建議'), '下方應該有「不是買賣建議」的說明');
      // 資產走勢的「每日」要變成從第一筆買進開始
      await page.locator('#networth-mode').scrollIntoViewIfNeeded();
      await page.click('#networth-mode [data-nw="daily"]');
      ok(await until(() => _charts.networth && _charts.networth.data.labels.length > 100), '有長期日線後,「每日」走勢應該從第一筆買進開始(超過 100 個點)');
      ok((await page.textContent('#networth-note')).includes('第一筆買進'), '「每日」走勢下方的說明沒有更新');
      await page.click('#networth-mode [data-nw="month"]');
      await page.click('#quant-tabs [data-q="all"]');
    },

    async '持股小鎮'() {
      await nav('home');
      if (await ev(() => document.querySelector('#card-town').classList.contains('collapsed'))) await page.click('#card-town > .card-title');
      await until(() => !!TOWN3D.s || TOWN3D.failed, null, 15000);
      if (await ev(() => TOWN3D.failed || !TOWN3D.s)) { skips.push('持股小鎮:這個環境開不了 3D,只確認了平面版'); ok(await ev(() => !!document.querySelector('#town-scene').innerHTML), '3D 開不了時應該退回平面圖'); return; }
      ok(await until(() => TOWN3D.s.playing === true || TOWN3D.s.growT >= 99), '展開後沒有開始播放');
      const t1 = await ev(() => TOWN3D.s.t);
      ok(await until((t) => TOWN3D.s.t > t + 0.2, t1), '3D 畫面沒有在動(繪圖迴圈停了)');
      await ev(() => town3dFinish());
      ok((await page.textContent('#town3d-hud')).includes('總市值'), '播完後左上角沒有顯示總市值');
      ok(await ev(() => TOWN3D.s.groups.length) === await ev(() => Object.keys(computeOpenHoldings(STATE.defaultPerson)).length), '大樓數應該等於持股檔數');
      // 點一層樓:先把鏡頭停住,再點那層樓面向鏡頭的那一面
      const p = await ev(() => {
        const s = TOWN3D.s; s.lastTouch = performance.now() + 60000;
        const fl = s.floors.filter(x => !x.f.gone && x.h > 0.35).sort((a, b) => b.h - a.h)[0];
        const w = new THREE.Vector3(); fl.m.getWorldPosition(w); w.y += fl.h / 2;
        const g = fl.m.parent, d = s.camera.position.clone().sub(g.position).setY(0).normalize().multiplyScalar(0.79);
        return { pos: [w.x + d.x, w.y, w.z + d.z], sym: fl.sym };
      });
      await page.waitForTimeout(150);
      await clickWorld('town', p.pos);
      ok(await until((s) => document.querySelector('#town-readout').textContent.includes('買進') && document.querySelector('#town-readout').textContent.includes(s), p.sym), `點樓層後下方沒有顯示那筆買進(${(await page.textContent('#town-readout')).slice(0, 40)})`);
      await clickWorld('town', [0, 0.85, 0]);
      ok(await until(() => document.querySelector('#town-readout').textContent.includes('累積配息')), '點中間的金幣沒有顯示累積配息');
      await page.click('[data-town-mode="yld"]');
      ok(await until(() => document.querySelector('[data-town-mode="yld"]').classList.contains('active') && TOWN.mode === 'yld'), '切到「殖利率」沒有反應');
      await page.click('[data-town-mode="chg"]');
      await ev(() => { if (TOWN3D.s.playing) town3dFinish(); TOWN3D.s.lastTouch = 0; });
    },

    async '歷史頁'() {
      await nav('history');
      ok(await until(() => document.querySelectorAll('#history-list .list-item').length > 0), '買賣分頁沒有列出紀錄');
      for (const tab of ['realized', 'bank', 'dividends', 'savings', 'prices', 'purchases']) {
        await page.click(`#page-history [data-tab="${tab}"]`);
        ok(await until((t) => document.querySelector(`#page-history [data-tab="${t}"]`).classList.contains('active'), tab), `分頁「${tab}」點了沒有反應`);
        await page.waitForTimeout(120);
      }
      // 編輯清單最後一筆的備註(最舊的那筆,不會動到前面流程新增的)
      kept.editId = await page.locator('#history-list .edit-btn').last().getAttribute('data-edit-id');
      await page.locator('#history-list .edit-btn').last().click();
      ok(await until(() => !document.querySelector('#modal-purchase').classList.contains('hidden') && !!STATE.editing), '按編輯沒有打開表單');
      await page.fill('#purchase-note', '改過的備註');
      await page.click('#purchase-submit');
      ok(await called('update_record'), '後端沒有收到 update_record');
      ok(lastCall('update_record').data.patch.note === '改過的備註' && String(lastCall('update_record').data.id) === String(kept.editId), '編輯的內容沒有送到後端,或改到別筆');
      ok(await until((id) => (STATE.data.purchases.find(r => String(r.id) === String(id)) || {}).note === '改過的備註', kept.editId), '編輯後畫面上的資料沒有跟著變');
      // 刪除倒數第二筆
      const before = await ev(() => STATE.data.purchases.length);
      const delId = await page.locator('#history-list .delete-btn').nth(-2).getAttribute('data-del-id');
      await page.locator('#history-list .delete-btn').nth(-2).click();
      ok(await called('delete_record'), '後端沒有收到 delete_record');
      ok(String(lastCall('delete_record').data.id) === String(delId), '刪掉的不是按的那一筆');
      kept.delId = delId;
      ok(await until((n) => STATE.data.purchases.length === n - 1, before), '刪除後買賣紀錄應該少 1 筆');
    },

    async '探索課程與測驗'() {
      await nav('explore');
      ok(await until(() => document.querySelectorAll('#explore-panel [data-isle]').length >= 5), '探索頁沒有列出島');
      await page.click('#explore-panel [data-isle="ai-intro"]');
      ok(await until(() => document.querySelectorAll('#explore-panel [data-lesson]').length > 0), '點進 AI 入門島沒有列出課程');
      const id = await page.locator('#explore-panel [data-lesson]').first().getAttribute('data-lesson');
      await page.locator('#explore-panel [data-lesson]').first().click();
      ok(await until(() => !!document.querySelector('.ex-lesson .ex-q')), '點課程沒有打開內容和測驗');
      const n = await page.locator('.ex-lesson .ex-q').count();
      for (let i = 0; i < n; i++) await page.locator('.ex-lesson .ex-q').nth(i).locator('.ex-opt').first().click();
      ok(await until(() => !document.querySelector('#ex-result').classList.contains('hidden')), '全部答完沒有出現成績');
      ok(await ev((x) => { const p = learnProgress()[x]; return !!p && p.total > 0; }, id), '答完後沒有記錄這堂課完成');
    },

    async '我的島'() {
      await nav('explore');
      await ev(() => exploreSelect(null));
      await page.click('#explore-panel [data-isle="me"]');
      await until(() => !!MYI.s || MYI.failed, null, 15000);
      ok(await until(() => !!document.querySelector('#myi-detail .myi-title')), '我的島沒有顯示說明');
      const has3d = await ev(() => !!MYI.s && !MYI.failed);
      if (!has3d) skips.push('我的島:這個環境開不了 3D,只測了清單和表單');
      if (has3d) {
        const t1 = await ev(() => MYI.s.t);
        ok(await until((t) => MYI.s.t > t + 0.2, t1), '3D 畫面沒有在動');
        ok(await ev(() => MYI.s.tiles.length) === 13, '島上應該有 13 格');
        await page.waitForTimeout(1500);      // 等鏡頭飛到全景的位置
        const pos = await ev(() => { MYI.s.lastTouch = performance.now() + 60000; const g = MYI.s.tiles.find(x => x.t.id === 'home').g.position; return [g.x, 0.4, g.z]; });
        await page.waitForTimeout(200);
        await clickWorld('myi', pos);
        ok(await until(() => MYI.sel === 'home'), `點「家」那一格沒有選到(選到 ${await ev(() => MYI.sel)})`);
        ok((await page.textContent('#myi-detail .myi-title')).includes('家'), '選了之後下方沒有顯示那一格');
        await page.click('#myi-detail [data-myi-home]');
        ok(await until(() => MYI.sel === null), '按「回全景」沒有回去');
        await page.click('[data-myi-z="in"]');
        ok(await ev(() => MYI.s.zoom < 1), '按 ＋ 沒有放大');
        await page.click('[data-myi-z="home"]');
        ok(await ev(() => MYI.s.zoom === 1), '按 ⌂ 沒有回到原本大小');
      }
      // 新增一格 → 加一項進度 → 打勾 → 連線 → 刪掉
      await page.click('#myi-detail [data-myi-newtile]');
      await page.fill('[data-myi-form="tile"] [name=name]', '流程測試格');
      await page.click('[data-myi-form="tile"] button[type=submit]');
      ok(await called('add_island'), '後端沒有收到新增格子');
      ok(await until(() => myiCustomTiles().length === 1 && MYI.sel === myiCustomTiles()[0].id && !MYI.saving), '新增後沒有出現新格子或沒有選到它');
      if (has3d) ok(await ev(() => MYI.s.tiles.length) === 14, '3D 上應該變成 14 格');
      await page.fill('#myi-detail .myi-add:not(.myi-link-add) input', '第一步');
      await page.click('#myi-detail .myi-add:not(.myi-link-add) button');
      ok(await until(() => document.querySelectorAll('#myi-detail .myi-items li [data-chk]').length === 1 && !MYI.saving), '新增進度後清單沒有出現那一項');
      await page.click('#myi-detail [data-chk]');
      ok(await until(() => !!document.querySelector('#myi-detail .myi-items li.done') && !MYI.saving), '打勾後沒有變成完成');
      const links0 = await ev(() => myiAllLinks().length);
      await page.selectOption('#myi-detail .myi-link-add select', 'study');
      await page.fill('#myi-detail .myi-link-add input', '一起長大');
      await page.click('#myi-detail .myi-link-add button');
      ok(await until((n) => myiAllLinks().length === n + 1 && !MYI.saving, links0), '新增協作線後數量沒有加 1');
      await page.click('#myi-detail [data-myi-deltile]');
      ok(await until(() => myiCustomTiles().length === 0 && !MYI.saving), '刪除格子後它還在');
      ok(await ev((n) => myiAllLinks().length === n, links0), '刪除格子後,連到它的協作線應該一起不見');
      ok(srv.db.island.length === 0, `後端的 _island 應該清乾淨,還剩 ${srv.db.island.length} 筆`);
      // 清單、時間
      await page.click('[data-myi-view="list"]');
      ok(await until(() => document.querySelectorAll('#myi-body .ex-item').length >= 13), '清單分頁沒有列出 13 格');
      await page.click('[data-myi-view="time"]');
      ok(await until(() => document.querySelectorAll('#myi-body .myi-ev').length > 0), '時間分頁沒有內容');
    },

    async '年度回顧'() {
      await nav('explore');
      if (!await ev(() => !!document.querySelector('[data-myi-view="review"]'))) { await ev(() => exploreSelect(null)); await page.click('#explore-panel [data-isle="me"]'); await until(() => !!document.querySelector('[data-myi-view="review"]')); }
      await page.click('[data-myi-view="review"]');
      ok(await until(() => document.querySelectorAll('#myi-body .rv-stat').length >= 4), '回顧分頁沒有顯示統計');
      const y = String(now.getFullYear());
      ok((await page.textContent('.rv-title')).includes(y), '預設應該是今年');
      const inv = await ev((yy) => computeYearReview(yy).invested, y);
      ok((await page.textContent('#myi-body .rv-stat')).includes(Math.round(inv).toLocaleString('en-US')), '「這一年投入」顯示的金額和算出來的不一樣');
      await page.click(`[data-rv-year="${now.getFullYear() - 1}"]`);
      ok(await until((yy) => document.querySelector('.rv-title').textContent.includes(yy), String(now.getFullYear() - 1)), '切到去年沒有反應');
      await page.click('#rv-save');
      ok(await until(() => { const i = document.querySelector('.rv-img'); return i && i.naturalWidth === 1080 && i.naturalHeight === 1350; }), '「做成一張圖」沒有產生 1080×1350 的圖');
      await page.click('[data-myi-view="map"]');
    },

    async '設定:系統狀態與資料檢查'() {
      await openSettings();
      await page.click('#btn-status');
      ok(await until(() => document.querySelectorAll('#status-body .st-row').length >= 6 && !!document.querySelector('.st-sum'), null, 15000), '系統狀態沒有列出檢查結果');
      const rows = await ev(() => [...document.querySelectorAll('#status-body .st-row')].map(r => r.className + '|' + r.textContent.replace(/\s+/g, ' ').slice(0, 50)));
      ok(rows.some(r => /st-row ok.*市場中繼站/.test(r)), `市場中繼站應該是正常:${rows.filter(r => r.includes('中繼站'))}`);
      ok(rows.some(r => /st-row ok.*資料同步/.test(r)), '資料同步應該是正常');
      ok(!rows.some(r => r.includes('st-row bad')), `不應該有 ❌ 的項目:${rows.filter(r => r.includes('st-row bad'))}`);
      await page.click('#status-recheck');
      ok(await until(() => !!document.querySelector('.st-sum'), null, 15000), '按「重新檢查」後沒有結果');
      await openSettings();
      await page.click('#btn-datacheck');
      ok(await until(() => !document.querySelector('#modal-datacheck').classList.contains('hidden') && document.querySelector('#datacheck-body').textContent.trim().length > 0), '資料檢查沒有顯示結果');
      await closeModals();
    },

    async '定期定額'() {
      await nav('home');
      ok(await ev(() => document.querySelector('#card-pending-dca').classList.contains('hidden')), '沒有設定計畫時,首頁不應該出現「待確認買進」');
      await openSettings();
      await page.click('#btn-dca');
      ok(await until(() => !!document.querySelector('#dca-form')), '定期定額計畫的視窗沒有打開');
      const sym = SYMS[9][0];                      // 測試資料裡 黃 沒有買這一檔
      await page.selectOption('#dca-symbol', sym);
      await page.fill('#dca-amount', '3000'); await page.fill('#dca-day', '1');
      await page.click('#dca-form button[type=submit]');
      ok(await called('set_meta'), '後端沒有收到計畫(set_meta)');
      ok(await until(() => document.querySelectorAll('#dca-list .dca-row').length === 1), '新增後清單沒有出現計畫');
      ok(JSON.parse(srv.db.meta.dca_plans)[0].symbol === sym, '存進後端的計畫內容不對');
      // 讓它從這個月開始算(1 號一定已經到了) → 首頁要出現提醒
      await ev(async () => { const p = dcaPlans(); p[0].start = ymdLocal(new Date()).slice(0, 7); await dcaSavePlans(p); renderPendingDca(); });
      await closeModals();
      ok(await until(() => !document.querySelector('#card-pending-dca').classList.contains('hidden')), '到期了首頁卻沒有出現「待確認買進」');
      await page.click('#pending-dca-list [data-dca="confirm"]');
      ok(await until(() => !document.querySelector('#modal-purchase').classList.contains('hidden')), '按「記一筆買進」沒有打開表單');
      const f = await ev(() => ({ sym: document.querySelector('#purchase-symbol').value, amount: document.querySelector('#purchase-amount').value, date: document.querySelector('#purchase-date').value, note: document.querySelector('#purchase-note').value }));
      ok(f.sym === sym && f.amount === '3000' && f.date === TODAY.slice(0, 8) + '01' && f.note === '定期定額', `表單帶入的內容不對:${JSON.stringify(f)}`);
      await closeModals();
      await page.click('#pending-dca-list [data-dca="skip"]');
      ok(await until(() => document.querySelector('#card-pending-dca').classList.contains('hidden')), '按「這個月略過」後提醒還在');
      await openSettings(); await page.click('#btn-dca');
      await page.click('#dca-list [data-dca-act="del"]');
      ok(await until(() => dcaPlans().length === 0), '刪除計畫後它還在');
      await closeModals();
    },

    async '隱私模式與深色模式'() {
      await nav('home');
      await page.click('#btn-privacy');
      ok(await ev(() => document.documentElement.dataset.privacy === 'on'), '按眼睛沒有開啟隱私模式');
      ok(await ev(() => getComputedStyle(document.querySelector('.person-card .val')).filter.includes('blur')), '隱私模式下個人卡片的金額沒有模糊');
      ok(await ev(() => getComputedStyle(document.querySelector('.pnl-chip .town-num') || document.body).filter.includes('blur')), '隱私模式下損益金額沒有模糊');
      await page.click('#btn-privacy');
      ok(await ev(() => document.documentElement.dataset.privacy !== 'on'), '再按一次沒有關掉隱私模式');
      const t0 = await ev(() => document.documentElement.dataset.theme || '');
      await page.click('#btn-theme');
      ok(await until((t) => (document.documentElement.dataset.theme || '') !== t, t0), '按主題按鈕沒有切換');
      await page.waitForTimeout(400);
      await page.click('#btn-theme');
    },

    async '新聞列表不會一直重建(不閃爍)'() {
      await nav('market');
      if (await ev(() => document.querySelector('#card-news').classList.contains('collapsed'))) await page.click('#card-news > .card-title');
      await page.click('[data-news-tab="tw"]');
      ok(await until(() => document.querySelectorAll('#news-list a.news-item').length === 8, null, 10000), '新聞分頁沒有列出新聞');
      // 在每一則和它的縮圖上做記號;如果列表被整個重建,記號就會不見
      await ev(() => document.querySelectorAll('#news-list a.news-item').forEach((a, i) => { a.__mark = 'm' + i; const img = a.querySelector('img'); if (img) img.__mark = 'm' + i; }));
      const marks = () => ev(() => [...document.querySelectorAll('#news-list a.news-item')].map(a => (a.__mark || '-') + '/' + ((a.querySelector('img') || {}).__mark || '-')).join(','));
      const before = await marks();
      await ev(async () => { await marketTick(true); await marketTick(true); renderMarketCards(); renderNews(); });
      ok(await marks() === before, '市場頁定時更新後,新聞列表被整個重建了(縮圖會重新載入,看起來會閃)');
      // 「幾分鐘前」要照樣更新
      await ev(() => { MKT.news.cats.tw[0].time = new Date(Date.now() - 3 * 3600e3).toISOString(); renderNews(); });
      ok((await page.textContent('#news-list a.news-item .news-meta')).includes('3 小時前'), '新聞的時間沒有跟著更新');
      ok(await marks() === before, '只更新時間時不應該重建列表');
      // 有新的新聞進來:補在最上面,原本的 8 則沿用(記號還在)
      newsExtra = 2;
      await ev(async () => { await marketLoad('news', true); renderNews(); });
      ok(await until(() => document.querySelectorAll('#news-list a.news-item').length === 10), '有新新聞時列表沒有更新');
      const after = (await marks()).split(',');
      ok(after.slice(0, 2).every(x => x === '-/-') && after.slice(2).join(',') === before, `新的兩則應該在最上面,原本的 8 則要沿用舊元素:${after.join(',')}`);
      ok((await page.textContent('#news-list a.news-item .news-title')).includes('剛發布'), '最上面應該是剛發布的新聞');
      // 切到別的分頁再切回來
      await page.click('[data-news-tab="us"]');
      ok(await until(() => (document.querySelector('#news-list a.news-item .news-title') || {}).textContent.includes('【us】')), '切換新聞分頁後內容沒有換');
      await page.click('[data-news-tab="tw"]');
      ok(await until(() => (document.querySelector('#news-list a.news-item .news-title') || {}).textContent.includes('【tw】')), '切回原本的分頁後內容不對');
      newsExtra = 0;
    },

    async '市場頁'() {
      await nav('market');
      ok(await ev(() => document.querySelector('#page-market').classList.contains('active')), '市場頁沒有打開');
      await page.waitForTimeout(800);
      ok(await ev(() => document.querySelector('#page-market').textContent.trim().length > 50), '市場頁是空的');
    },

    async '重新整理後資料還在'() {
      await page.reload();
      ok(await until(() => typeof STATE !== 'undefined' && !!STATE.data && !!STATE.lastSync && STATE.lastSync.ok, null, 15000), '重新整理後沒有載入資料');
      const n = await ev(() => ({ p: STATE.data.purchases.length, d: STATE.data.dividends.length, s: STATE.data.savings.length }));
      ok(n.p === srv.db.purchases.length && n.d === srv.db.dividends.length && n.s === srv.db.savings.length, `畫面上的筆數和後端不一樣:${JSON.stringify(n)} vs ${srv.db.purchases.length}/${srv.db.dividends.length}/${srv.db.savings.length}`);
      if (kept.addId) ok(await ev((id) => STATE.data.purchases.some(r => String(r.id) === id), kept.addId), '新增的買進重新整理後不見了');
      if (kept.editId) ok(await ev((id) => (STATE.data.purchases.find(r => String(r.id) === String(id)) || {}).note === '改過的備註', kept.editId), '編輯過的備註重新整理後不見了');
      if (kept.delId) ok(await ev((id) => !STATE.data.purchases.some(r => String(r.id) === String(id)), kept.delId), '刪掉的那筆重新整理後又出現了');
      if (count('add_savings')) ok(await ev(() => STATE.data.savings.filter(r => Number(r.amount) === 1234).length) === 1, '斷線時補送的那筆重新整理後不見了(或變成兩筆)');
    }
  };

  const t0 = Date.now();
  await page.goto(srv.url + '/');
  for (const name of Object.keys(FLOWS)) {
    if (only.length && !only.some(o => name.includes(o)) && name !== '開啟與首頁') continue;
    cur = name;
    const e0 = pageErrors.length, f0 = fails.length, tt = Date.now();
    try { await FLOWS[name](); } catch (e) { fails.push(`【${name}】流程中斷:${String(e.message || e).split('\n')[0]}`); }
    pageErrors.slice(e0).forEach(m => fails.push(`【${name}】畫面報錯:${m}`));
    console.log(`${fails.length === f0 ? '✓' : '✗'} ${name}(${((Date.now() - tt) / 1000).toFixed(1)} 秒)`);
    await ev(() => { try { closeAllModals(); } catch (_) {} }).catch(() => {});
  }
  await browser.close();
  await srv.close();
  if (fails.length) console.log('\n' + fails.map(f => '  ✗ ' + f).join('\n'));
  if (skips.length) console.log('\n' + skips.map(s => '  （略過）' + s).join('\n'));
  console.log(`\n${fails.length === 0 ? '✅ 流程測試全部通過' : '❌ 流程測試有失敗'}:${passN} 項檢查通過、${fails.length} 項失敗,共 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  process.exit(fails.length === 0 ? 0 : 1);
})().catch(e => { console.error('流程測試跑不起來:', e.message); process.exit(2); });
