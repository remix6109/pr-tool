/* 配息自動偵測 — 抓證交所「除權息計算結果表」,依你除息前一天的持股算出應領配息,
 * 顯示在首頁「待確認配息」;按「確認入帳」會帶入現有的股利表單,由你核對後才寫入。
 * 資料來源只含除息日與每股配息(沒有發放日),入帳日與實領金額都是預估,確認時可修改。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const AUTODIV = {
    WINDOW_DAYS: 120,       // 往前看幾天內的除息(超過的不再提醒)
    PAID_WINDOW_DAYS: 60,   // 除息後多少天內的股利紀錄視為「已入帳」
    PAY_LAG_DAYS: 28,       // 預估入帳日 = 除息日 + 這麼多天(ETF 常見約 3~5 週)
    NHI_RATE: 0.0211,       // 二代健保補充保費
    NHI_THRESHOLD: 20000,   // 單次配息達此金額才扣
    REMIT_FEE: 10,          // 匯費(估)
    CACHE_MS: 6 * 3600 * 1000,
    TIMEOUT_MS: 12000
  };
  const _exDiv = { at: 0, list: null, loading: false, failedAt: 0 };

  function autodivYmd(d) { return ymdLocal(d); }
  function autodivAddDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    return autodivYmd(new Date(y, m - 1, d + n));
  }

  // "115年09月16日" → "2026-09-16"
  function autodivParseRoc(s) {
    const m = String(s || '').match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return null;
    return `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  function autodivLoadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY.divExCache) || 'null');
      if (c && Array.isArray(c.list)) { _exDiv.at = c.at || 0; _exDiv.list = c.list; }
    } catch (_) {}
  }

  // 抓區間內所有「現金股利(息)」的除息資料 → [{ symbol, exDate, perShare }]
  async function fetchExDividends() {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - AUTODIV.WINDOW_DAYS);
    const q = d => autodivYmd(d).replace(/-/g, '');
    const url = 'https://www.twse.com.tw/rwd/zh/exRight/TWT49U?response=json&startDate=' + q(start) + '&endDate=' + q(end);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AUTODIV.TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const j = await res.json();
      if (!j || !Array.isArray(j.data)) return [];
      const f = j.fields || [];
      const iDate = f.indexOf('資料日期'), iCode = f.indexOf('股票代號');
      const iVal = f.indexOf('權值+息值'), iKind = f.indexOf('權/息');
      if (iDate < 0 || iCode < 0 || iVal < 0 || iKind < 0) throw new Error('除權息資料格式改變');
      const out = [];
      j.data.forEach(r => {
        if (String(r[iKind]).trim() !== '息') return;       // 只處理純現金股利(含股票股利的不自動算)
        const exDate = autodivParseRoc(r[iDate]);
        const perShare = parseFloat(String(r[iVal]).replace(/,/g, ''));
        if (!exDate || !(perShare > 0)) return;
        out.push({ symbol: String(r[iCode]).trim(), exDate, perShare });
      });
      return out;
    } finally {
      clearTimeout(timer);
    }
  }

  // 某人在除息日「前一天」仍持有的股數(買進日須早於除息日;賣出已扣除)
  function autodivSharesBefore(person, symbol, exDate) {
    let n = 0;
    (STATE.data.purchases || []).forEach(r => {
      if (r.person !== person || r.symbol !== symbol) return;
      const d = String(r.date || '').slice(0, 10);
      if (!d || d >= exDate) return;
      n += Number(r.shares) || 0;
    });
    return n;
  }

  function autodivEstimateNet(gross) {
    const nhi = gross >= AUTODIV.NHI_THRESHOLD ? gross * AUTODIV.NHI_RATE : 0;
    return Math.max(0, Math.round(gross - nhi - AUTODIV.REMIT_FEE));
  }

  function autodivIsRecorded(person, symbol, exDate, perShare, gross) {
    const endYmd = autodivAddDays(exDate, AUTODIV.PAID_WINDOW_DAYS);
    return (STATE.data.dividends || []).some(d => {
      if (d.person !== person || d.symbol !== symbol) return false;
      const dd = String(d.date || '').slice(0, 10);
      if (dd < exDate || dd > endYmd) return false;
      const aps = Number(d.amount_per_share) || 0;
      if (aps && Math.abs(aps - perShare) < 0.0005) return true;
      const t = Number(d.total) || 0;
      return Math.abs(t - gross) <= Math.max(30, gross * 0.03);   // 沒填每股配息的舊紀錄:用金額比對
    });
  }

  function autodivDismissed() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY.divDismissed) || '[]')); } catch (_) { return new Set(); }
  }
  function autodivDismiss(key) {
    const s = autodivDismissed(); s.add(key);
    try { localStorage.setItem(KEY.divDismissed, JSON.stringify(Array.from(s).slice(-200))); } catch (_) {}
  }

  // 目前待確認的配息 → [{ key, person, symbol, exDate, perShare, shares, gross, net, payDate }]
  function computePendingDividends() {
    if (!STATE.data || !_exDiv.list) return [];
    const held = new Set((STATE.data.purchases || []).map(r => r.symbol).filter(Boolean));
    const skip = autodivDismissed();
    const out = [];
    _exDiv.list.forEach(ev => {
      if (!held.has(ev.symbol)) return;
      CONFIG.PEOPLE.forEach(person => {
        const shares = autodivSharesBefore(person, ev.symbol, ev.exDate);
        if (shares <= 0) return;
        const key = [person, ev.symbol, ev.exDate].join('|');
        if (skip.has(key)) return;
        const gross = shares * ev.perShare;
        if (autodivIsRecorded(person, ev.symbol, ev.exDate, ev.perShare, gross)) return;
        out.push({
          key, person, symbol: ev.symbol, exDate: ev.exDate, perShare: ev.perShare, shares,
          gross: Math.round(gross), net: autodivEstimateNet(gross),
          payDate: autodivAddDays(ev.exDate, AUTODIV.PAY_LAG_DAYS)
        });
      });
    });
    return out.sort((a, b) => a.exDate < b.exDate ? 1 : -1);
  }

  function drawPendingDividends() {
    const card = $('#card-pending-div');
    if (!card) return;
    const items = computePendingDividends();
    if (items.length === 0) { card.classList.add('hidden'); return; }
    const today = autodivYmd(new Date());
    $('#pending-div-list').innerHTML = items.map((it, i) => {
      const arrived = today >= it.payDate;
      return `<div class="pdiv-row" data-i="${i}">
        <div class="pdiv-main">
          <div><b>${escapeHtml(it.symbol)}</b> · ${escapeHtml(getPersonLabel(it.person))}
            <span class="muted small">除息 ${it.exDate.slice(5).replace('-', '/')}</span></div>
          <div class="muted small">${fmt.money(it.shares)} 股 × ${it.perShare} = ${fmt.money(it.gross)}</div>
          <div>應領約 <b class="pdiv-amt">${fmt.money(it.net)}</b>
            <small class="muted">(${arrived ? '應已入帳' : '預估 ' + it.payDate.slice(5).replace('-', '/') + ' 入帳'}・已扣費用估算)</small></div>
        </div>
        <div class="pdiv-actions">
          <button class="btn primary small" data-pdiv="confirm">確認入帳</button>
          <button class="btn ghost small" data-pdiv="skip">略過</button>
        </div>
      </div>`;
    }).join('');
    card.classList.remove('hidden');
    $$('#pending-div-list .pdiv-row').forEach(row => {
      const it = items[Number(row.dataset.i)];
      row.querySelector('[data-pdiv="confirm"]').onclick = () => confirmPendingDividend(it);
      row.querySelector('[data-pdiv="skip"]').onclick = () => {
        if (!confirm('略過後這筆不會再提醒。確定嗎?')) return;
        autodivDismiss(it.key);
        drawPendingDividends();
      };
    });
  }

  // 帶入現有的股利表單,由使用者核對金額與日期後再儲存
  function confirmPendingDividend(it) {
    openModal('modal-dividend');
    prefillForm('add-dividend');
    pickPerson('dividend-person', it.person);
    $('#dividend-symbol').value = it.symbol;
    $('#dividend-total').value = it.net;
    $('#dividend-per-share').value = it.perShare;
    $('#dividend-shares').value = it.shares;
    $('#dividend-date').value = it.payDate;
    $('#dividend-note').value = '自動偵測(除息 ' + it.exDate + ',金額為預估,請依實際入帳修改)';
  }

  // 每次首頁重繪呼叫:先用快取畫,過期才重新抓
  function renderPendingDividends() {
    if (!STATE.data) return;
    if (_exDiv.list === null) autodivLoadCache();
    drawPendingDividends();
    if (_exDiv.loading || Date.now() - _exDiv.failedAt < 5 * 60 * 1000) return;   // 失敗後 5 分鐘內不重試
    if (_exDiv.list && Date.now() - _exDiv.at < AUTODIV.CACHE_MS) return;
    _exDiv.loading = true;
    fetchExDividends().then(list => {
      _exDiv.list = list; _exDiv.at = Date.now();
      try { localStorage.setItem(KEY.divExCache, JSON.stringify({ at: _exDiv.at, list })); } catch (_) {}
      drawPendingDividends();
    }).catch(() => { _exDiv.failedAt = Date.now(); /* 抓不到就維持現狀(或舊快取),不打擾使用者 */ })
      .finally(() => { _exDiv.loading = false; });
  }
