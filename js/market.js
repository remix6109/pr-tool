/* 市場看板:台股群島(三大法人、散戶、夜盤)+ 國際市場(美日韓指數、匯率、與你持股的連動度)。
 * 資料來自自架的 Cloudflare 中繼站(worker/),因為證交所/期交所/Yahoo 不開放網頁直接讀取。
 * 兩張卡片預設收起;展開且畫面在前景時,即時報價每 30 秒更新一次。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const MKT = {
    quote: null, daily: null, hist: null,
    quoteAt: 0, dailyAt: 0, histAt: 0, histKey: '',
    timer: null, loading: {}
  };
  const MKT_QUOTE_MS = 30 * 1000, MKT_DAILY_MS = 10 * 60 * 1000, MKT_HIST_MS = 60 * 60 * 1000;
  const MKT_INTL = [
    { sym: '^GSPC', name: '標普 500', lagUS: true },
    { sym: '^IXIC', name: '那斯達克', lagUS: true },
    { sym: '^SOX',  name: '費城半導體', lagUS: true },
    { sym: '^N225', name: '日經 225' },
    { sym: '^KS11', name: '韓國 KOSPI' },
    { sym: 'TWD=X', name: '美元/台幣' }
  ];

  function marketApi() {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'http://localhost:8787';
    return CONFIG.MARKET_API_URL || '';
  }

  async function marketGet(path) {
    const base = marketApi();
    if (!base) throw new Error('市場資料中繼站尚未設定');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(base + path, { signal: ctrl.signal });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '中繼站錯誤');
      return j.data;
    } finally { clearTimeout(t); }
  }

  // 目前持有的台股代號(兩人合併,給即時報價用)
  function marketPersonCodes() {
    return Object.keys(computeOpenHoldings(STATE.defaultPerson)).filter(s => /^\d{4,6}[A-Z]?$/.test(s));
  }
  const personName = () => getPersonLabel(STATE.defaultPerson);

  function marketHeldCodes() {
    return Object.keys(computeOpenHoldings()).filter(s => /^\d{4,6}[A-Z]?$/.test(s));
  }

  async function marketLoad(kind, force) {
    if (MKT.loading[kind]) return;
    const now = Date.now();
    try {
      MKT.loading[kind] = true;
      if (kind === 'quote' && (force || now - MKT.quoteAt > MKT_QUOTE_MS - 2000)) {
        MKT.quote = await marketGet('/quote?tw=' + marketHeldCodes().join(','));
        MKT.quoteAt = Date.now();
      }
      if (kind === 'daily' && (force || now - MKT.dailyAt > MKT_DAILY_MS)) {
        MKT.daily = await marketGet('/daily');
        MKT.dailyAt = Date.now();
      }
      if (kind === 'holdings') {
        const key = marketHeldCodes().join(',');
        if (force || now - (MKT.holdAt || 0) > 6 * 3600e3 || key !== MKT.holdKey) {
          MKT.holdings = await marketGet('/holdings?codes=' + encodeURIComponent(key));
          await resolveClientHoldings(MKT.holdings);
          MKT.holdAt = Date.now(); MKT.holdKey = key;
        }
      }
      if (kind === 'news') {
        if (force || now - (MKT.newsAt || 0) > 10 * 60 * 1000) {
          MKT.news = await marketGet('/news?cat=tech,tw,us,world,quick&limit=30');
          MKT.newsAt = Date.now();
        }
      }
      if (kind === 'hist') {
        const key = MKT_INTL.map(i => i.sym).concat(['^TWII'], marketHeldCodes()).join(',');
        if (force || now - MKT.histAt > MKT_HIST_MS || key !== MKT.histKey) {
          MKT.hist = await marketGet('/history?s=' + encodeURIComponent(key));
          MKT.histAt = Date.now(); MKT.histKey = key;
        }
      }
      MKT.error = null;
    } catch (e) {
      MKT.error = e.message;
    } finally {
      MKT.loading[kind] = false;
    }
  }

  // ---------- 成分股:中繼站讀不到、但允許網頁直接讀的投信(目前是國泰) ----------
  async function cathayClientHoldings(fundCode) {
    const ck = 'pr.mkt.cathay.' + fundCode;
    try {
      const c = JSON.parse(localStorage.getItem(ck) || 'null');
      if (c && Date.now() - c.at < 12 * 3600e3) return c.data;
    } catch (_) {}
    // 要指定「有資料的交易日」,從今天(台灣時間)往前找,週末跳過
    const d = new Date(Date.now() + 8 * 3600e3);
    for (let i = 0; i < 8; i++) {
      const ymd = d.toISOString().slice(0, 10), dow = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - 1);
      if (dow === 0 || dow === 6) continue;
      const r = await fetch(`https://cwapi.cathaysite.com.tw/api/ETF/GetETFDetailStockList?FundCode=${encodeURIComponent(fundCode)}&SearchDate=${ymd}&status=1`);
      const j = await r.json();
      if (Array.isArray(j.result) && j.result.length) {
        const stocks = j.result.map(s => {
          const code = String(s.stockCode || '').trim();
          return { code, name: String(s.stockName || '').trim(), weight: parseFloat(String(s.weights).replace(/,/g, '')), foreign: !/^\d{4,6}[A-Z]?$/.test(code) };
        }).filter(s => s.code && s.weight > 0).sort((a, b) => b.weight - a.weight);
        const data = { issuer: '國泰', date: ymd, stocks };
        try { localStorage.setItem(ck, JSON.stringify({ at: Date.now(), data })); } catch (_) {}
        return data;
      }
    }
    throw new Error('國泰近一週查無持股資料');
  }

  async function resolveClientHoldings(h) {
    const funds = (h && h.funds) || {};
    await Promise.all(Object.keys(funds).map(async code => {
      const cf = funds[code] && funds[code].clientFetch;
      if (!cf || cf.source !== 'cathay') return;
      try { funds[code] = await cathayClientHoldings(cf.fundCode); }
      catch (e) { funds[code] = { issuer: '國泰', error: e.message }; }
    }));
  }

  // ---------- 小工具 ----------
  const mFmt = (v, d = 2) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const mPct = (v) => v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  const mCls = (v) => v > 0 ? 'gain' : v < 0 ? 'loss' : 'muted';
  const mColor = (v) => v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--muted)';   // 台股習慣:紅漲綠跌
  const twHourNow = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const isNightSession = () => { const h = twHourNow(); return h >= 15 || h < 5; };

  function sparkline(points, w = 96, h = 26) {
    if (!points || points.length < 2) return '';
    const vals = points.map(p => p[1]);
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const d = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(' ');
    const up = vals[vals.length - 1] >= vals[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="1.5"/></svg>`;
  }

  // ---------- 台股群島 ----------
  function islandsSvg(latest, quote) {
    const cash = latest.cash || {}, fut = latest.fut || {};
    const W = Math.max(320, ($("#islands-scene") || {}).clientWidth || 340), H = 320;
    const cx = W / 2, cy = 152;
    const dx = Math.min(W / 2 - 70, 210), dy = 92;
    const isles = [
      { key: 'foreign', label: '外資', net: cash.foreign, x: cx - dx, y: cy - dy, unit: '億' },
      { key: 'trust',   label: '投信', net: cash.trust,   x: cx + dx, y: cy - dy, unit: '億' },
      { key: 'dealer',  label: '自營商', net: cash.dealer, x: cx - dx, y: cy + dy, unit: '億' },
      { key: 'retail',  label: '散戶(小台)', net: fut.mtxRetailNet, x: cx + dx, y: cy + dy, unit: '口', ratio: fut.mtxRetailRatio }
    ];
    const maxCash = Math.max(1, ...isles.slice(0, 3).map(i => Math.abs(i.net || 0)));
    const night = isNightSession();
    const tx = night ? (quote && quote.txfNight) : (quote && quote.txfDay);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="台股群島">`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="${night ? 'var(--bg)' : 'var(--surface-2)'}"/>`;
    // 海流箭頭:買超 → 從中央流向該島;賣超 → 從該島流向中央
    isles.forEach(it => {
      if (!it.net) return;
      const inbound = it.net > 0;
      const [x1, y1, x2, y2] = inbound ? [cx, cy, it.x, it.y] : [it.x, it.y, cx, cy];
      const mx = x1 + (x2 - x1) * 0.32, my = y1 + (y2 - y1) * 0.32, ex = x1 + (x2 - x1) * 0.68, ey = y1 + (y2 - y1) * 0.68;
      const ang = Math.atan2(ey - my, ex - mx), a = 7;
      s += `<line x1="${mx}" y1="${my}" x2="${ex}" y2="${ey}" stroke="${mColor(it.net)}" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>`;
      s += `<polygon points="${ex},${ey} ${ex - a * Math.cos(ang - .5)},${ey - a * Math.sin(ang - .5)} ${ex - a * Math.cos(ang + .5)},${ey - a * Math.sin(ang + .5)}" fill="${mColor(it.net)}"/>`;
    });
    // 島嶼
    isles.forEach((it, idx) => {
      const r = 44;
      const hex = Array.from({ length: 6 }, (_, k) => { const t = Math.PI / 3 * k + Math.PI / 6; return `${(it.x + r * Math.cos(t)).toFixed(1)},${(it.y + r * 0.62 * Math.sin(t)).toFixed(1)}`; }).join(' ');
      s += `<g class="isle" data-isle="${it.key}">`;
      s += `<polygon points="${hex}" fill="var(--surface)" stroke="${it.net ? mColor(it.net) : 'var(--border)'}" stroke-width="2"/>`;
      // 房子數量 = 金額大小(散戶用多空比)
      const strength = it.key === 'retail' ? Math.min(1, Math.abs(it.ratio || 0) / 40) : Math.abs(it.net || 0) / maxCash;
      const n = Math.max(1, Math.round(strength * 5));
      for (let b = 0; b < n; b++) {
        const bx = it.x - 30 + b * 13, bh = 10 + ((b * 7 + idx * 3) % 3) * 6;
        s += `<rect x="${bx}" y="${it.y - bh + 4}" width="10" height="${bh}" rx="1.5" fill="${it.net > 0 ? 'var(--huang)' : 'var(--bar-bg)'}" opacity="${it.net > 0 ? .8 : 1}"/>`;
      }
      const val = it.net === null || it.net === undefined ? '—'
        : it.key === 'retail' ? `${it.net > 0 ? '淨多' : '淨空'} ${fmt.money(Math.abs(it.net))} 口`
        : `${it.net > 0 ? '買超' : '賣超'} ${mFmt(Math.abs(it.net), 1)} 億`;
      s += `<text x="${it.x}" y="${it.y + 42}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">${it.label}</text>`;
      s += `<text x="${it.x}" y="${it.y + 57}" text-anchor="middle" font-size="11" fill="${mColor(it.net)}">${val}</text>`;
      s += '</g>';
    });
    // 中央燈塔:台指期(日盤或夜盤)
    s += `<rect x="${cx - 7}" y="${cy - 34}" width="14" height="40" rx="3" fill="var(--surface)" stroke="var(--border)"/>`;
    s += `<circle cx="${cx}" cy="${cy - 40}" r="9" fill="${tx ? mColor(tx.chgPct) : 'var(--muted)'}"/>`;
    s += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="11" fill="var(--muted)">${night ? '台指期夜盤' : '台指期'}</text>`;
    s += `<text x="${cx}" y="${cy + 38}" text-anchor="middle" font-size="13" font-weight="700" fill="${tx ? mColor(tx.chgPct) : 'var(--muted)'}">${tx && tx.price ? fmt.money(tx.price) + ' ' + mPct(tx.chgPct) : '—'}</text>`;
    s += '</svg>';
    return s;
  }

  function renderIslands() {
    const card = $('#card-islands');
    if (!card || card.classList.contains('collapsed')) return;
    const q = MKT.quote, d = MKT.daily;
    // 即時列
    const strip = [];
    if (q && q.taiex) strip.push(`加權 <b class="${mCls(q.taiex.chgPct)}">${mFmt(q.taiex.price)} ${mPct(q.taiex.chgPct)}</b>`);
    if (q && q.txfDay) strip.push(`台指期 <b class="${mCls(q.txfDay.chgPct)}">${fmt.money(q.txfDay.price)} ${mPct(q.txfDay.chgPct)}</b>`);
    if (q && q.txfNight && q.txfNight.price) strip.push(`夜盤 <b class="${mCls(q.txfNight.chgPct)}">${fmt.money(q.txfNight.price)} ${mPct(q.txfNight.chgPct)}</b>`);
    $('#islands-live').innerHTML = strip.length ? strip.join('・') + `<span class="muted small">・更新 ${new Date(MKT.quoteAt).toLocaleTimeString('zh-TW', { hour12: false })}</span>`
      : `<span class="muted small">${MKT.error ? '讀取失敗:' + escapeHtml(MKT.error) : '讀取中…'}</span>`;
    // 你的持股即時
    const mine = q ? marketPersonCodes().map(c => q.stocks[c] ? `${c} <span class="${mCls(q.stocks[c].chgPct)}">${mFmt(q.stocks[c].price)} ${mPct(q.stocks[c].chgPct)}</span>` : null).filter(Boolean) : [];
    $('#islands-mine').innerHTML = mine.length ? escapeHtml(personName()) + '的持股:' + mine.join('・') : '';

    const hist = d && Array.isArray(d.history) ? d.history : [];
    const latest = { cash: (hist.filter(h => h.cash).slice(-1)[0] || {}).cash, fut: (hist.filter(h => h.fut).slice(-1)[0] || {}).fut };
    if (!latest.cash && !latest.fut) { $('#islands-scene').innerHTML = '<div class="muted small">每日籌碼讀取中…</div>'; $('#islands-detail').innerHTML = ''; return; }
    $('#islands-scene').innerHTML = islandsSvg(latest, q);
    renderIslandsDetail({ cash: latest.cash || {}, fut: latest.fut || {} });
  }

  // 群島下方的文字明細
  function renderIslandsDetail(row) {
    const hist = MKT.daily && Array.isArray(MKT.daily.history) ? MKT.daily.history : [];
    const c = row.cash || {}, f = row.fut || {};
    const oi = (v) => v === null || v === undefined ? '—' : (v > 0 ? '淨多 ' : '淨空 ') + fmt.money(Math.abs(v)) + ' 口';
    const foreign10 = hist.filter(h => h.cash && (!c.date || h.date <= c.date)).slice(-10);
    const bs = (b, s) => b === undefined || b === null ? '' : `(買 ${mFmt(b, 0)}・賣 ${mFmt(s, 0)})`;
    const bars = foreign10.length ? (() => {
      const max = Math.max(1, ...foreign10.map(h => Math.abs(h.cash.foreign || 0)));
      return '<div class="mk-bars">' + foreign10.map(h => {
        const v = h.cash.foreign || 0, ht = Math.max(2, Math.abs(v) / max * 28);
        return `<span title="${h.date} ${mFmt(v, 1)} 億" style="height:${ht}px;background:${mColor(v)}"></span>`;
      }).join('') + '</div>';
    })() : '';
    $('#islands-detail').innerHTML = `
      <div class="mk-row"><b>外資</b> 現貨 <span class="${mCls(c.foreign)}">${mFmt(c.foreign, 1)} 億</span>${bs(c.foreignBuy, c.foreignSell)}・台指期 ${oi(f.txForeignNet)}</div>
      <div class="mk-row"><b>投信</b> 現貨 <span class="${mCls(c.trust)}">${mFmt(c.trust, 1)} 億</span>${bs(c.trustBuy, c.trustSell)}・台指期 ${oi(f.txTrustNet)}</div>
      <div class="mk-row"><b>自營商</b> 現貨 <span class="${mCls(c.dealer)}">${mFmt(c.dealer, 1)} 億</span>${bs(c.dealerBuy, c.dealerSell)}・台指期 ${oi(f.txDealerNet)}</div>
      <div class="mk-row"><b>散戶(小台)</b> ${oi(f.mtxRetailNet)}・多空比 <span class="${mCls(f.mtxRetailRatio)}">${f.mtxRetailRatio === null || f.mtxRetailRatio === undefined ? '—' : (f.mtxRetailRatio > 0 ? '偏多 ' : '偏空 ') + Math.abs(f.mtxRetailRatio).toFixed(1) + '%'}</span></div>
      ${f.night ? `<div class="mk-row"><b>上一個夜盤收盤</b> ${fmt.money(f.night.close)} <span class="${mCls(f.night.chgPct)}">${mPct(f.night.chgPct)}</span></div>` : ''}
      <div class="mk-row muted small">外資近 10 日現貨買賣超 ${bars}</div>
      <div class="muted small">籌碼資料日期:現貨 ${c.date || '—'}、期貨 ${f.date || '—'}(官方盤後公布,非即時)</div>`;
  }

  // ---------- 國際市場 + 連動度 ----------
  // 用每日漲跌算相關係數,不使用成分股(官方沒有可讓程式讀取的成分股資料)。
  // 台股某天的漲跌,對上「影響它的那一天」:日韓、台股大盤取同一天;美股收在台股之後,取前一個美股交易日。
  const MKT_TWII = { sym: '^TWII', name: '台股大盤' };
  const MKT_CORR_DAYS = 90;

  function dailyReturns(points) {
    const out = new Map();
    for (let i = 1; i < (points || []).length; i++) {
      const p0 = points[i - 1][1], p1 = points[i][1];
      if (p0 > 0 && p1 > 0) out.set(points[i][0], p1 / p0 - 1);
    }
    return out;
  }
  function pearson(a, b) {
    const n = a.length;
    if (n < 30) return null;
    const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
  }
  // 對齊:回傳台股日期 → 指數報酬(美股取前一個交易日)
  function alignTo(twDates, idxReturns, lagUS) {
    const ixDates = Array.from(idxReturns.keys()).sort();
    const out = new Map();
    twDates.forEach(date => {
      let d = null;
      if (lagUS) { for (let i = ixDates.length - 1; i >= 0; i--) if (ixDates[i] < date) { d = ixDates[i]; break; } }
      else if (idxReturns.has(date)) d = date;
      if (d) out.set(date, idxReturns.get(d));
    });
    return out;
  }

  // 一檔持股的完整連動分析
  function analyzeHolding(code, series) {
    const h = dailyReturns(series[code]);
    if (h.size < 30) return null;
    const dates = Array.from(h.keys()).sort().slice(-MKT_CORR_DAYS);
    const pair = (aligned) => {
      const a = [], b = [];
      dates.forEach(d => { if (aligned.has(d)) { a.push(h.get(d)); b.push(aligned.get(d)); } });
      return { a, b, r: pearson(a, b) };
    };
    const markets = [MKT_TWII].concat(MKT_INTL.filter(i => i.sym !== 'TWD=X'));
    const aligned = {};
    markets.forEach(m => { if (Array.isArray(series[m.sym])) aligned[m.sym] = alignTo(dates, dailyReturns(series[m.sym]), m.lagUS); });
    const rows = markets.filter(m => aligned[m.sym]).map(m => ({ m, r: pair(aligned[m.sym]).r })).filter(x => x.r !== null);

    // 對台股大盤的敏感度(beta),以及「扣掉大盤之後」剩下的漲跌,再看跟前一晚美股的關係
    let beta = null;
    const residUS = [];
    const tw = aligned[MKT_TWII.sym];
    if (tw) {
      const p = pair(tw);
      if (p.a.length >= 30) {
        const ma = p.a.reduce((s, v) => s + v, 0) / p.a.length, mb = p.b.reduce((s, v) => s + v, 0) / p.b.length;
        let cov = 0, vb = 0;
        p.a.forEach((v, i) => { cov += (v - ma) * (p.b[i] - mb); vb += (p.b[i] - mb) ** 2; });
        beta = vb > 0 ? cov / vb : null;
        if (beta !== null) {
          const resid = new Map();
          dates.forEach(d => { if (tw.has(d)) resid.set(d, h.get(d) - beta * tw.get(d)); });
          MKT_INTL.filter(i => i.lagUS).forEach(m => {
            if (!aligned[m.sym]) return;
            const a = [], b = [];
            dates.forEach(d => { if (resid.has(d) && aligned[m.sym].has(d)) { a.push(resid.get(d)); b.push(aligned[m.sym].get(d)); } });
            const r = pearson(a, b);
            if (r !== null) residUS.push({ m, r });
          });
        }
      }
    }
    rows.sort((x, y) => y.r - x.r);
    residUS.sort((x, y) => y.r - x.r);
    return { code, rows, beta, residUS, days: dates.length };
  }

  const corrLevel = (r) => r >= 0.6 ? '高' : r >= 0.3 ? '中' : '低';

  // 白話說明
  function describeHolding(a) {
    const out = [];
    const top = a.rows[0];
    const rTW = (a.rows.find(x => x.m.sym === MKT_TWII.sym) || {}).r;
    if (top && top.m.sym === MKT_TWII.sym) out.push(`主要跟台股大盤走(連動${corrLevel(top.r)},${top.r.toFixed(2)})。`);
    else if (top) out.push(`連動最高的是${top.m.name}${top.m.lagUS ? '(前一晚)' : ''}(${corrLevel(top.r)},${top.r.toFixed(2)})${rTW !== undefined ? `,跟台股大盤是 ${rTW.toFixed(2)}` : ''}。`);
    if (a.beta !== null) out.push(`台股大盤漲跌 1%,它平均約漲跌 ${Math.abs(a.beta).toFixed(1)}%${a.beta > 1.15 ? '(比大盤波動大)' : a.beta < 0.85 ? '(比大盤溫和)' : ''}。`);
    const us = a.residUS[0];
    if (us) {
      if (us.r >= 0.25) out.push(`扣掉台股大盤的影響後,仍明顯受前一晚${us.m.name}影響(${us.r.toFixed(2)}):${us.m.name}大跌的隔天,它通常比大盤更弱;大漲的隔天通常比大盤更強。`);
      else if (us.r >= 0.12) out.push(`扣掉台股大盤的影響後,跟前一晚${us.m.name}有一點額外關係(${us.r.toFixed(2)})。`);
      else out.push('扣掉台股大盤的影響後,跟前一晚美股幾乎沒有額外關係。');
    }
    return out.join('');
  }

  function analyzeAll() {
    const series = (MKT.hist && MKT.hist.series) || {};
    return marketPersonCodes().map(code => analyzeHolding(code, series) || { code, missing: true });
  }

  function renderIntl() {
    const card = $('#card-intl');
    if (!card || card.classList.contains('collapsed')) return;
    const q = MKT.quote, series = (MKT.hist && MKT.hist.series) || {};
    $('#intl-list').innerHTML = MKT_INTL.map(it => {
      const v = q && q.intl && q.intl[it.sym];
      const pts = Array.isArray(series[it.sym]) ? series[it.sym].slice(-60) : null;
      const dec = it.sym === 'TWD=X' ? 3 : 2;
      return `<div class="mk-intl">
        <div class="mk-name">${it.name}</div>
        <div class="mk-price">${v && v.price ? mFmt(v.price, dec) : '—'}</div>
        <div class="mk-chg ${mCls(v && v.chgPct)}">${v ? mPct(v.chgPct) : '—'}</div>
        <div class="mk-spark">${sparkline(pts)}</div>
      </div>`;
    }).join('') + `<div class="muted small" style="margin-top:4px;">右側小圖是近 3 個月走勢。部分交易所報價本身延遲約 15 分鐘。</div>`;

    if (!MKT.hist) { $('#intl-corr').innerHTML = '<div class="muted small">連動度計算中…</div>'; return; }
    const list = analyzeAll();
    $('#intl-corr').innerHTML = list.length ? `<div class="breakdown-title">${escapeHtml(personName())}的持股受哪個市場影響</div>
      ${list.map(a => {
        if (a.missing) return `<div class="mk-corr"><div class="mk-corr-head"><b>${escapeHtml(a.code)}</b> <span class="muted">上市時間太短(不到 30 個交易日),還算不出連動度</span></div></div>`;
        const top = a.rows[0];
        const head = top ? (top.m.sym === MKT_TWII.sym ? '主要跟台股大盤走' : '最連動:' + top.m.name) : '資料不足';
        return `<details class="mk-corr">
          <summary><b>${escapeHtml(a.code)}</b> ${head}${top ? ` <span class="muted">(${corrLevel(top.r)})</span>` : ''}</summary>
          <div class="mk-corr-body">
            <div>${describeHolding(a)}</div>
            <div class="mk-corr-grid">${a.rows.map(x => `<span>${x.m.name}${x.m.lagUS ? '<small class="muted">(前一晚)</small>' : ''}</span><span class="mk-corr-bar"><i style="width:${Math.max(0, x.r) * 100}%"></i></span><span>${x.r.toFixed(2)}</span>`).join('')}</div>
          </div>
        </details>`;
      }).join('')}
      <div class="muted small" style="margin-top:6px;">依近 ${MKT_CORR_DAYS} 個交易日的每日漲跌計算(相關係數 −1 到 1,越接近 1 越同步)。用的是實際價格,不是成分股。美股收盤在台股之後,所以對上「前一晚」的美股。這是過去的關係,不代表未來,也不是投資建議。</div>` : '';
  }

  // ---------- 首頁:前一晚美股摘要 ----------
  function renderNightSummary() {
    const el = $('#night-summary');
    if (!el) return;
    const q = MKT.quote;
    const us = ['^GSPC', '^IXIC', '^SOX'].map(s => q && q.intl && q.intl[s]).filter(v => v && v.chgPct !== null && v.chgPct !== undefined);
    if (!us.length) { el.classList.add('hidden'); return; }
    // 報價時間在 30 分鐘內 = 美股正在交易;否則是最近一次收盤(週末、假日也正確)
    const t = Date.parse((q.intl['^GSPC'] || {}).time || '');
    const label = (t && Date.now() - t < 30 * 60 * 1000) ? '美股盤中' : '最近一次美股收盤';
    let html = `<b>🌙 ${label}</b>:` + us.map(v => `${v.name} <span class="${mCls(v.chgPct)}">${mPct(v.chgPct)}</span>`).join('・');
    if (MKT.hist) {
      const sensitive = analyzeAll().filter(a => !a.missing && a.residUS[0] && a.residUS[0].r >= 0.25)
        .map(a => `${a.code}(${a.residUS[0].m.name})`);
      html += '<br>' + (sensitive.length
        ? `<span class="muted">扣掉台股大盤後仍受美股影響較大的持股:</span>${sensitive.join('、')}`
        : '<span class="muted">你的持股主要跟台股大盤走,受前一晚美股的額外影響不大。</span>');
    }
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  // ---------- 我的成分股(依你的持股市值攤開各 ETF 的成分股) ----------
  function etfValues(person) {
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const open = computeOpenHoldings(person);
    const out = {};
    Object.keys(open).forEach(sym => {
      const live = MKT.quote && MKT.quote.stocks && MKT.quote.stocks[sym];
      const price = (live && live.price) || Number((symMap[sym] || {}).current_price) || 0;
      out[sym] = price > 0 ? price * open[sym].shares : open[sym].cost;
    });
    return out;
  }

  function renderLookthrough() {
    const card = $('#card-lookthrough');
    if (!card || card.classList.contains('collapsed')) return;
    const body = $('#lookthrough-body');
    if (!MKT.holdings) { body.innerHTML = `<div class="muted small">${MKT.error ? '讀取失敗:' + escapeHtml(MKT.error) : '成分股讀取中…'}</div>`; return; }
    const person = STATE.defaultPerson;
    const values = etfValues(person);
    const funds = MKT.holdings.funds || {};
    const total = Object.values(values).reduce((s, v) => s + v, 0);
    const covered = [], missing = [];
    const agg = {};
    let coveredValue = 0, foreignValue = 0, stockValue = 0;
    Object.keys(values).forEach(code => {
      const f = funds[code];
      if (!f || !Array.isArray(f.stocks) || !f.stocks.length) { missing.push(code); return; }
      covered.push(code);
      coveredValue += values[code];
      f.stocks.forEach(s => {
        const amt = values[code] * s.weight / 100;
        stockValue += amt;
        if (s.foreign) foreignValue += amt;
        const k = s.code;
        if (!agg[k]) agg[k] = { code: s.code, name: s.name, foreign: s.foreign, amount: 0, from: [] };
        agg[k].amount += amt;
        agg[k].from.push(code);
      });
    });
    if (!covered.length) { body.innerHTML = '<div class="muted small">你持有的 ETF 目前都還沒有支援的成分股資料。</div>'; return; }
    const top = Object.values(agg).sort((a, b) => b.amount - a.amount).slice(0, 15);
    const pctOf = (v) => coveredValue > 0 ? (v / coveredValue * 100) : 0;
    const maxAmt = top.length ? top[0].amount : 1;

    let html = `<div class="small" style="line-height:1.7;"><b>${escapeHtml(personName())}</b>:已攤開 <b>${covered.join('、')}</b>(占 ETF 市值 ${total > 0 ? (coveredValue / total * 100).toFixed(0) : 0}%)。`
      + `其中海外股票約 <b>${pctOf(foreignValue).toFixed(1)}%</b>,現金與期貨等其他資產約 ${Math.max(0, pctOf(coveredValue - stockValue)).toFixed(1)}%。</div>`;
    if (missing.length) html += `<div class="muted small">${missing.join("、")} 的成分股暫時取不到,沒有算進來。</div>`;
    html += '<div class="breakdown-title">' + escapeHtml(personName()) + '實際持有最多的股票</div>';
    html += top.map((s, i) => `<div class="lt-row">
        <span class="lt-rank">${i + 1}</span>
        <span class="lt-name">${escapeHtml(s.name)} <small class="muted">${escapeHtml(s.code)}${s.foreign ? '・海外' : ''}</small><br><small class="muted">來自 ${s.from.join('、')}</small></span>
        <span class="lt-bar"><i style="width:${(s.amount / maxAmt * 100).toFixed(0)}%"></i></span>
        <span class="lt-amt"><span class="lt-money">${fmt.money(s.amount)}</span><br><small class="muted">${pctOf(s.amount).toFixed(1)}%</small></span>
      </div>`).join('');
    html += '<div class="breakdown-title">各 ETF 前十大持股</div>';
    html += covered.map(code => {
      const f = funds[code];
      return `<details class="mk-corr"><summary><b>${code}</b> <span class="muted">${f.issuer || ''}・${f.stocks.length} 檔${f.date ? '・' + f.date : ''}${f.stale ? '・資料可能過期' : ''}</span></summary>
        <div class="mk-corr-body">${f.stocks.slice(0, 10).map(s => `<div class="lt-top"><span>${escapeHtml(s.name)} <small class="muted">${escapeHtml(s.code)}</small></span><span>${s.weight.toFixed(2)}%</span></div>`).join('')}</div>
      </details>`;
    }).join('');
    html += '<div class="muted small" style="margin-top:6px;">金額 = 你持有該 ETF 的市值 × 成分股權重,是依投信公布的申購買回清單估算,不是你直接持有的股數。資料來自各投信官網(非官方開放介面,網站改版時可能暫時取不到)。</div>';
    body.innerHTML = html;
  }

  // ---------- 財經新聞 ----------
  const NEWS_TABS = ['mine', 'tech', 'tw', 'us', 'world'];
  function newsTab() {
    let t = null;
    try { t = localStorage.getItem('pr.newsTab'); } catch (_) {}
    return NEWS_TABS.includes(t) ? t : 'mine';
  }
  function timeAgo(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!(m >= 0)) return '';
    if (m < 60) return m + ' 分鐘前';
    if (m < 24 * 60) return Math.round(m / 60) + ' 小時前';
    return Math.round(m / 1440) + ' 天前';
  }

  // 「與我持股相關」要比對的代號與名稱:持有的 ETF + 攤開後實際持有最多的 30 檔股票
  function myNewsTargets() {
    const codes = new Map();   // 鉅亨網代號格式 → 顯示用說明
    const names = new Map();
    const values = etfValues(STATE.defaultPerson);
    Object.keys(values).forEach(c => codes.set(c, c + '(你持有的 ETF)'));
    const funds = (MKT.holdings && MKT.holdings.funds) || {};
    const agg = {};
    Object.keys(values).forEach(etf => {
      const f = funds[etf];
      if (!f || !Array.isArray(f.stocks)) return;
      f.stocks.forEach(s => {
        const k = s.code;
        if (!agg[k]) agg[k] = { s, amount: 0, from: [] };
        agg[k].amount += values[etf] * s.weight / 100;
        agg[k].from.push(etf);
      });
    });
    Object.values(agg).sort((a, b) => b.amount - a.amount).slice(0, 30).forEach(({ s, from }) => {
      const why = s.name + '(在 ' + from.slice(0, 2).join('、') + (from.length > 2 ? ' 等 ' + from.length + ' 檔' : '') + ' 裡)';
      // 美股代號:成分股是 "NVDA US",鉅亨網是 "US-NVDA"
      const m = s.code.match(/^([A-Z.]+)\s+US$/);
      codes.set(m ? 'US-' + m[1] : s.code, why);
      const short = s.name.replace(/\*|-KY$/g, '').trim();
      if (!s.foreign && short.length >= 2) names.set(short, why);
    });
    return { codes, names };
  }

  function newsItems(tab) {
    const cats = (MKT.news && MKT.news.cats) || {};
    if (tab !== 'mine') return Array.isArray(cats[tab]) ? cats[tab].map(n => ({ n, cat: tab })) : [];
    const { codes, names } = myNewsTargets();
    const seen = new Set(), out = [];
    Object.entries(cats).forEach(([cat, list]) => {
      if (!Array.isArray(list)) return;
      list.forEach(n => {
        if (seen.has(n.id)) return;
        let why = null;
        for (const c of n.stocks || []) { if (codes.has(c)) { why = codes.get(c); break; } }
        if (!why) for (const [nm, w] of names) { if (n.title.includes(nm)) { why = w; break; } }
        if (why) { seen.add(n.id); out.push({ n, why, cat }); }
      });
    });
    return out.sort((a, b) => (b.n.time || '').localeCompare(a.n.time || ''));
  }

  function renderNews() {
    const card = $('#card-news');
    if (!card || card.classList.contains('collapsed')) return;
    const tab = newsTab();
    $$('#news-tabs [data-news-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.newsTab === tab);
      b.onclick = () => { try { localStorage.setItem('pr.newsTab', b.dataset.newsTab); } catch (_) {} renderNews(); };
    });
    const box = $('#news-list');
    if (!MKT.news) { box.innerHTML = `<div class="muted small">${MKT.error ? '讀取失敗:' + escapeHtml(MKT.error) : '新聞讀取中…'}</div>`; return; }
    if (tab === 'mine' && !MKT.holdings) { box.innerHTML = '<div class="muted small">正在讀取你的成分股,用來比對相關新聞…</div>'; return; }
    const items = newsItems(tab).slice(0, 30);
    if (!items.length) {
      box.innerHTML = `<div class="muted small">${tab === 'mine' ? '最近的新聞裡沒有提到你持有的 ETF 或主要成分股。' : '目前沒有新聞。'}</div>`;
      return;
    }
    box.innerHTML = items.map(({ n, why, cat }) => `<a class="news-item" href="${escapeHtml(n.url)}" data-news-id="${n.id}" data-news-cat="${cat}" target="_blank" rel="noopener noreferrer">
        ${n.image ? `<img class="news-img" src="${escapeHtml(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="news-img"></span>'}
        <span class="news-body">
          <span class="news-title">${escapeHtml(n.title)}</span>
          ${why ? `<span class="news-why">相關:${escapeHtml(why)}</span>` : ''}
          <span class="news-meta">${escapeHtml(n.source || '')}・${timeAgo(n.time)}</span>
        </span>
      </a>`).join('') + '<div class="muted small" style="margin-top:6px;">新聞來源:鉅亨網。點新聞在 APP 內閱讀,內文下方有原文連結。「與我持股相關」是比對新聞標註的相關股票與標題,可能漏掉或多抓。</div>';
  }

  // 在 APP 內閱讀:中繼站取出那一篇、清理成安全格式後顯示
  async function openArticle(id, cat, fallbackUrl) {
    const body = $('#article-body');
    $('#article-origin').href = fallbackUrl;
    body.innerHTML = '<div class="muted">讀取中…</div>';
    openModal('modal-article');
    try {
      const a = await marketGet('/article?id=' + encodeURIComponent(id) + '&cat=' + encodeURIComponent(cat));
      body.innerHTML = `<h2 class="article-title">${escapeHtml(a.title)}</h2>
        <div class="muted small">${escapeHtml(a.source)}・${a.time ? new Date(a.time).toLocaleString('zh-TW', { hour12: false }) : ''}</div>
        ${a.image ? `<img class="article-cover" src="${escapeHtml(a.image)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div class="article-content">${a.html}</div>
        <div class="muted small" style="margin-top:12px;">本文出自鉅亨網,版權屬原作者與鉅亨網所有。</div>`;
      body.querySelectorAll('img').forEach(img => img.setAttribute('referrerpolicy', 'no-referrer'));
      body.scrollTop = 0;
    } catch (e) {
      body.innerHTML = `<div class="muted">讀不到內文(${escapeHtml(e.message)}),請按下方「到鉅亨網看原文」。</div>`;
    }
  }
  function bindNewsReader() {
    const list = $('#news-list');
    if (!list || list._bound) return;
    list._bound = true;
    list.addEventListener('click', (e) => {
      const a = e.target.closest('a.news-item');
      if (!a || !a.dataset.newsId) return;
      e.preventDefault();
      openArticle(a.dataset.newsId, a.dataset.newsCat, a.href);
    });
  }

  // ---------- 排程與綁定 ----------
  function marketActive() {
    // 卡片展開且真的顯示在畫面上(在市場頁,或被搬進探索頁的市場島)才更新
    const open = (id) => { const c = $(id); return c && !c.classList.contains('collapsed') && c.offsetParent !== null; };
    return document.visibilityState === 'visible' && (open('#card-news') || open('#card-islands') || open('#card-intl') || open('#card-lookthrough'));
  }

  async function marketTick(force) {
    if (!STATE.data || !marketActive()) return;
    const tasks = [marketLoad('quote', force)];
    if ($('#card-islands') && !$('#card-islands').classList.contains('collapsed')) tasks.push(marketLoad('daily', force));
    if ($('#card-intl') && !$('#card-intl').classList.contains('collapsed')) tasks.push(marketLoad('hist', force));
    const newsOpen = $('#card-news') && !$('#card-news').classList.contains('collapsed');
    if (newsOpen) tasks.push(marketLoad('news', force));
    if (($('#card-lookthrough') && !$('#card-lookthrough').classList.contains('collapsed')) || (newsOpen && newsTab() === 'mine')) tasks.push(marketLoad('holdings', force));
    renderNews(); renderIslands(); renderIntl(); renderLookthrough();   // 先畫舊資料/讀取中
    await Promise.all(tasks);
    renderNews(); renderIslands(); renderIntl(); renderLookthrough(); renderNightSummary();
  }

  // 首頁摘要:卡片收起時也要有資料,但只在打開 APP 時抓一次(之後依快取時間)
  async function marketSummaryLoad() {
    if (!STATE.data || !marketApi() || document.visibilityState !== 'visible') return;
    await Promise.all([marketLoad('quote'), marketLoad('hist')]);
    renderNightSummary();
  }

  function bindMarketCards() {
    // 搬到「市場」頁後預設展開(只重設一次,之後尊重使用者的收合)
    try {
      if (!localStorage.getItem('pr.marketPageV1')) {
        ['news', 'islands', 'intl', 'lookthrough'].forEach(k => localStorage.setItem('pr.collapse.' + k, '0'));
        localStorage.setItem('pr.marketPageV1', '1');
      }
    } catch (_) {}
    bindNewsReader();
    ['#card-news', '#card-islands', '#card-intl', '#card-lookthrough'].forEach(id => {
      const card = $(id);
      if (!card) return;
      card.classList.toggle('collapsed', localStorage.getItem('pr.collapse.' + card.dataset.collapse) === '1');
      new MutationObserver(() => { if (!card.classList.contains('collapsed')) marketTick(); })
        .observe(card, { attributes: true, attributeFilter: ['class'] });
    });
    if (!MKT.timer) MKT.timer = setInterval(() => marketTick(), MKT_QUOTE_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { marketTick(); marketSummaryLoad(); } });
  }

  // 首頁重繪時呼叫(切換黃/蘇、資料更新)
  function renderMarketCards() {
    renderNews(); renderIslands(); renderIntl(); renderLookthrough(); renderNightSummary();
    marketTick();
    marketSummaryLoad();
  }
