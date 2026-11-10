// 流程測試用的本機伺服器:提供 web/ 的靜態檔案 + 假後端(/fake-api)。資料全部是編出來的,不是真實持股。
// 用法:const srv = await startFakeServer();  srv.url / srv.db / srv.calls / srv.failNext('add_bank') / srv.offline = true / srv.close()
// 也可以直接執行(node tests/fake-server.js)開在 8099,用瀏覽器手動看。
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const SYMS = [['0056', '元大高股息', 36], ['00919', '群益台灣精選高息', 23], ['00878', '國泰永續高股息', 22], ['00713', '元大台灣高息低波', 52], ['00918', '大華優利高填息30', 22],
  ['00900', '富邦特選高股息30', 14], ['0050', '元大台灣50', 62], ['00982A', '主動群益台灣強棒', 13], ['00988A', '主動統一全球創新', 11], ['00990A', '主動元大AI新經濟', 12]];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

// 編一份資料:兩個人、10 檔、從去年 2 月買到這個月、每季領息、最近 45 個交易日的每日收盤價
function makeData(today = new Date()) {
  let seed = 20261110;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const T = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y0 = T.getFullYear() - 1;
  const db = { purchases: [], bank: [], savings: [], dividends: [], symbols: [], snapshots: [], price_history: [], meta: {}, island: [] };
  const days = [];
  for (let d = new Date(y0, 0, 2); d <= T; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) days.push(ymd(d));
  const px = {};
  SYMS.forEach(([s, , p0]) => { let p = p0; px[s] = {}; days.forEach(d => { p *= 1 + (rnd() - 0.47) * 0.022; px[s][d] = Math.round(p * 100) / 100; }); });
  const recent = days.slice(-45);
  recent.forEach((d, i) => {
    if (i === 0) return;
    SYMS.forEach(([s, name]) => {
      const c = px[s][d], p = px[s][recent[i - 1]];
      db.price_history.push({ date: d, symbol: s, name, close_price: c, prev_close: p, change_amt: Math.round((c - p) * 100) / 100, change_pct: Math.round((c - p) / p * 10000) / 100 });
    });
  });
  let id = 0;
  ['黃', '蘇'].forEach((person, pi) => {
    const mine = SYMS.filter((_, i) => pi === 0 ? i < 8 : i % 2 === 0 || i > 6);
    for (let m = 0; m < 30; m++) {
      const d0 = new Date(y0, 1 + m, 5 + pi * 6);
      if (d0 > T) break;
      mine.forEach(([s], k) => {
        if ((m + k) % (2 + (k % 3)) !== 0) return;
        const d = new Date(d0); d.setDate(d.getDate() + (k % 4));
        while (!(d.getDay() % 6)) d.setDate(d.getDate() + 1);
        const date = ymd(d), price = px[s][date];
        if (!price) return;
        const shares = (1 + Math.floor(rnd() * 5)) * (k < 2 ? 200 : 100);
        db.purchases.push({ id: 'p' + (++id), person, symbol: s, amount: Math.round(price * shares), price, shares, fee: 20, date, note: '', created_at: date + 'T02:00:00.000Z' });
      });
      if (m % 3 === 2) mine.slice(0, 6).forEach(([s], k) => {
        const d = new Date(y0, 1 + m, 16 + k); if (d > T) return;
        const held = db.purchases.filter(r => r.person === person && r.symbol === s && r.date < ymd(d)).reduce((a, r) => a + r.shares, 0);
        if (held > 0) db.dividends.push({ id: 'd' + (++id), person, symbol: s, amount_per_share: 0.5, shares: held, total: Math.round(held * 0.5), date: ymd(d), note: '' });
      });
      db.savings.push({ id: 's' + (++id), person, amount: 10000, date: ymd(new Date(y0, 1 + m, 1)), note: '' });
    }
  });
  db.symbols = SYMS.map(([s, name]) => ({ symbol: s, name, current_price: px[s][days[days.length - 1]], months: '1,4,7,10', annual_dividend: 2 }));
  db.meta = { last_price_update: pad(T.getMonth() + 1) + '/' + pad(T.getDate()) + ' 14:03' };
  return db;
}

const SHEET = { _purchases: 'purchases', _bank: 'bank', _dividends: 'dividends', _savings: 'savings', _island: 'island' };
const ADD = { add_purchase: 'purchases', add_bank: 'bank', add_dividend: 'dividends', add_savings: 'savings', add_island: 'island' };

function startFakeServer(opts = {}) {
  const db = makeData(opts.today);
  const srv = { db, calls: [], offline: false, _fail: new Set(), failNext(action) { this._fail.add(action); } };
  let nid = 0;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/fake-api')) {
      let body = '';
      req.on('data', c => body += c).on('end', () => {
        if (srv.offline) { req.socket.destroy(); return; }   // 模擬斷線:不回應
        const j = body ? JSON.parse(body) : { action: 'get_all' };
        const d = j.data || {};
        res.setHeader('Content-Type', 'application/json');
        const send = (o) => res.end(JSON.stringify(o));
        if (j.action !== 'get_all') srv.calls.push({ action: j.action, data: d });
        if (srv._fail.has(j.action)) { srv._fail.delete(j.action); return send({ ok: false, error: '測試:後端拒絕' }); }
        if (j.action === 'get_all') return send({ ok: true, data: db });
        if (ADD[j.action]) {
          const arr = db[ADD[j.action]];
          const dup = d.client_id && arr.find(r => r.client_id === d.client_id);
          if (dup) return send({ ok: true, data: { id: dup.id, duplicate: true } });
          const row = Object.assign({}, d, { id: 't' + (++nid), created_at: new Date().toISOString() });
          arr.push(row);
          return send({ ok: true, data: { id: row.id } });
        }
        if (j.action === 'update_record' || j.action === 'delete_record') {
          const arr = db[SHEET[d.sheet]] || [], i = arr.findIndex(x => String(x.id) === String(d.id));
          if (i < 0) return send({ ok: false, error: '找不到 id: ' + d.id });
          if (j.action === 'delete_record') arr.splice(i, 1); else Object.assign(arr[i], d.patch);
          return send({ ok: true, data: {} });
        }
        if (j.action === 'set_meta') { db.meta[d.key] = d.value; return send({ ok: true, data: { key: d.key } }); }
        if (j.action === 'update_symbol') {
          const s = db.symbols.find(x => x.symbol === d.symbol);
          if (s) Object.assign(s, d); else db.symbols.push(Object.assign({}, d));
          return send({ ok: true, data: {} });
        }
        if (j.action === 'store_prices') {
          Object.keys(d.prices || {}).forEach(c => { const s = db.symbols.find(x => x.symbol === c); if (s) s.current_price = d.prices[c]; });
          const history = Object.keys(d.prices || {}).map(c => ({ date: d.date, symbol: c, name: '', close_price: d.prices[c], prev_close: 0, change_amt: 0, change_pct: 0 }));
          return send({ ok: true, data: { fetched: history.length, notFound: [], prices: d.prices, history } });
        }
        send({ ok: true, data: {} });
      });
      return;
    }
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    const p = path.join(ROOT, rel);
    if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
    fs.readFile(p, (e, b) => {
      if (e) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(b);
    });
  });
  return new Promise((ok) => {
    server.listen(opts.port || 0, '127.0.0.1', () => {
      srv.port = server.address().port;
      srv.url = 'http://127.0.0.1:' + srv.port;
      srv.close = () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); });
      ok(srv);
    });
  });
}

module.exports = { startFakeServer, makeData, SYMS };

if (require.main === module) startFakeServer({ port: 8099 }).then(s => console.log('測試伺服器:' + s.url + '(API 網址填 ' + s.url + '/fake-api)'));
