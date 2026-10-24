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
      if (kind === 'hist') {
        const key = MKT_INTL.map(i => i.sym).concat(marketHeldCodes()).join(',');
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

  // ---------- 小工具 ----------
  const mFmt = (v, d = 2) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const mPct = (v) => v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  const mCls = (v) => v > 0 ? 'gain' : v < 0 ? 'loss' : 'muted';
  const mColor = (v) => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--muted)';
  const twHourNow = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const isNightSession = () => { const h = twHourNow(); return h >= 15 || h < 5; };

  function sparkline(points, w = 96, h = 26) {
    if (!points || points.length < 2) return '';
    const vals = points.map(p => p[1]);
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const d = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(' ');
    const up = vals[vals.length - 1] >= vals[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${up ? 'var(--green)' : 'var(--red)'}" stroke-width="1.5"/></svg>`;
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
    const mine = q ? marketHeldCodes().map(c => q.stocks[c] ? `${c} <span class="${mCls(q.stocks[c].chgPct)}">${mFmt(q.stocks[c].price)} ${mPct(q.stocks[c].chgPct)}</span>` : null).filter(Boolean) : [];
    $('#islands-mine').innerHTML = mine.length ? '你的持股:' + mine.join('・') : '';

    const hist = d && Array.isArray(d.history) ? d.history : [];
    const latest = { cash: (hist.filter(h => h.cash).slice(-1)[0] || {}).cash, fut: (hist.filter(h => h.fut).slice(-1)[0] || {}).fut };
    if (!latest.cash && !latest.fut) { $('#islands-scene').innerHTML = '<div class="muted small">每日籌碼讀取中…</div>'; $('#islands-detail').innerHTML = ''; return; }
    $('#islands-scene').innerHTML = islandsSvg(latest, q);

    const c = latest.cash || {}, f = latest.fut || {};
    const oi = (v) => v === null || v === undefined ? '—' : (v > 0 ? '淨多 ' : '淨空 ') + fmt.money(Math.abs(v)) + ' 口';
    const foreign10 = hist.filter(h => h.cash).slice(-10);
    const bars = foreign10.length ? (() => {
      const max = Math.max(1, ...foreign10.map(h => Math.abs(h.cash.foreign || 0)));
      return '<div class="mk-bars">' + foreign10.map(h => {
        const v = h.cash.foreign || 0, ht = Math.max(2, Math.abs(v) / max * 28);
        return `<span title="${h.date} ${mFmt(v, 1)} 億" style="height:${ht}px;background:${mColor(v)}"></span>`;
      }).join('') + '</div>';
    })() : '';
    $('#islands-detail').innerHTML = `
      <div class="mk-row"><b>外資</b> 現貨 <span class="${mCls(c.foreign)}">${mFmt(c.foreign, 1)} 億</span>・台指期 ${oi(f.txForeignNet)}</div>
      <div class="mk-row"><b>投信</b> 現貨 <span class="${mCls(c.trust)}">${mFmt(c.trust, 1)} 億</span>・台指期 ${oi(f.txTrustNet)}</div>
      <div class="mk-row"><b>自營商</b> 現貨 <span class="${mCls(c.dealer)}">${mFmt(c.dealer, 1)} 億</span>・台指期 ${oi(f.txDealerNet)}</div>
      <div class="mk-row"><b>散戶(小台)</b> ${oi(f.mtxRetailNet)}・多空比 <span class="${mCls(f.mtxRetailRatio)}">${f.mtxRetailRatio === null || f.mtxRetailRatio === undefined ? '—' : (f.mtxRetailRatio > 0 ? '偏多 ' : '偏空 ') + Math.abs(f.mtxRetailRatio).toFixed(1) + '%'}</span></div>
      ${f.night ? `<div class="mk-row"><b>上一個夜盤收盤</b> ${fmt.money(f.night.close)} <span class="${mCls(f.night.chgPct)}">${mPct(f.night.chgPct)}</span></div>` : ''}
      <div class="mk-row muted small">外資近 10 日現貨買賣超 ${bars}</div>
      <div class="muted small">籌碼資料日期:現貨 ${c.date || '—'}、期貨 ${f.date || '—'}(官方盤後公布,非即時)</div>`;
  }

  // ---------- 國際市場 + 連動度 ----------
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
  // 台股某日的報酬,對上「影響它的那一天」的指數報酬:美股收在台股之後,所以取前一個美股交易日
  function correlation(twPoints, idxPoints, lagUS) {
    const tw = dailyReturns(twPoints), ix = dailyReturns(idxPoints);
    const ixDates = Array.from(ix.keys()).sort();
    const a = [], b = [];
    tw.forEach((r, date) => {
      let d = null;
      if (lagUS) { for (let i = ixDates.length - 1; i >= 0; i--) if (ixDates[i] < date) { d = ixDates[i]; break; } }
      else if (ix.has(date)) d = date;
      if (d && ix.has(d)) { a.push(r); b.push(ix.get(d)); }
    });
    return pearson(a.slice(-90), b.slice(-90));
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

    const codes = marketHeldCodes();
    const rows = codes.map(code => {
      const pts = series[code];
      if (!Array.isArray(pts)) return `<tr><td>${code}</td><td colspan="2" class="muted">查無價格歷史</td></tr>`;
      const scores = MKT_INTL.filter(i => i.sym !== 'TWD=X').map(i => ({ i, r: correlation(pts, series[i.sym], i.lagUS) })).filter(x => x.r !== null);
      if (!scores.length) return `<tr><td>${code}</td><td colspan="2" class="muted">資料不足</td></tr>`;
      scores.sort((a, b) => b.r - a.r);
      const top = scores[0];
      const level = top.r >= 0.6 ? '高' : top.r >= 0.3 ? '中' : '低';
      return `<tr><td>${code}</td><td>${top.i.name}${top.i.lagUS ? '<span class="muted small">(前一晚)</span>' : ''}</td><td>${level}(${top.r.toFixed(2)})</td></tr>`;
    }).join('');
    $('#intl-corr').innerHTML = codes.length ? `<div class="breakdown-title">你的持股和哪個市場連動最高</div>
      <div class="table-wrap"><table><thead><tr><th>持股</th><th>連動最高的市場</th><th>程度</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="muted small">用近 90 個交易日的每日漲跌計算相關係數(−1 到 1)。美股收盤在台股之後,所以台股某天是對上「前一晚」的美股。這是過去的關係,不代表未來,也不是投資建議。</div>` : '';
  }

  // ---------- 排程與綁定 ----------
  function marketActive() {
    const open = (id) => { const c = $(id); return c && !c.classList.contains('collapsed'); };
    return document.visibilityState === 'visible' && (open('#card-islands') || open('#card-intl'));
  }

  async function marketTick(force) {
    if (!STATE.data || !marketActive()) return;
    const tasks = [marketLoad('quote', force)];
    if ($('#card-islands') && !$('#card-islands').classList.contains('collapsed')) tasks.push(marketLoad('daily', force));
    if ($('#card-intl') && !$('#card-intl').classList.contains('collapsed')) tasks.push(marketLoad('hist', force));
    renderIslands(); renderIntl();   // 先畫舊資料/讀取中
    await Promise.all(tasks);
    renderIslands(); renderIntl();
  }

  function bindMarketCards() {
    ['#card-islands', '#card-intl'].forEach(id => {
      const card = $(id);
      if (!card) return;
      const key = 'pr.collapse.' + card.dataset.collapse;
      if (localStorage.getItem(key) === null) { localStorage.setItem(key, '1'); card.classList.add('collapsed'); }
      new MutationObserver(() => { if (!card.classList.contains('collapsed')) marketTick(); })
        .observe(card, { attributes: true, attributeFilter: ['class'] });
    });
    if (!MKT.timer) MKT.timer = setInterval(() => marketTick(), MKT_QUOTE_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') marketTick(); });
  }

  // 首頁重繪時呼叫(切換黃/蘇、資料更新)
  function renderMarketCards() {
    renderIslands(); renderIntl();
    marketTick();
  }
