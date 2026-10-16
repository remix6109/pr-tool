/* 配息自動偵測 — 抓證交所「除權息計算結果表」,依你除息前 2 個營業日的持股算出應領配息,
 * 顯示在首頁「待確認配息」;按「確認入帳」會帶入現有的股利表單,由你核對後才寫入。
 * 資料來源只含除息日與每股配息(沒有發放日),入帳日與實領金額都是預估,確認時可修改。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const AUTODIV = {
    WINDOW_DAYS: 120,       // 「待確認配息」往前看幾天內的除息(超過的不再提醒)
    HISTORY_DAYS: 400,      // 抓多久的歷史除息資料(行事曆推估週期用)
    CHUNK_DAYS: 60,         // 證交所查詢一次的區間長度
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

  // 目前持有(曾買過)的代號集合,以及它的字串鍵(用來判斷快取是否還適用)
  function autodivHeldSet() {
    return new Set((STATE.data.purchases || []).map(r => r.symbol).filter(Boolean));
  }
  function autodivHeldKey() { return Array.from(autodivHeldSet()).sort().join(','); }

  function autodivLoadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY.divExCache) || 'null');
      if (c && c.v === 2 && Array.isArray(c.list)) {
        _exDiv.at = (c.held === autodivHeldKey()) ? (c.at || 0) : 0;   // 持有標的變了就視為過期,但舊資料仍可先顯示
        _exDiv.list = c.list;
      }
    } catch (_) {}
  }

  // 抓過去 HISTORY_DAYS 天、你持有標的的「現金股利(息)」除息資料 → [{ symbol, exDate, perShare }]
  // 證交所一次只給一段區間,所以分段依序抓(每段間隔一下,避免被限流)。任何一段失敗就整體失敗。
  async function fetchExDividends() {
    const held = autodivHeldSet();
    const out = [];
    let to = new Date();
    const first = new Date(); first.setDate(first.getDate() - AUTODIV.HISTORY_DAYS);
    while (to >= first) {
      let from = new Date(to); from.setDate(from.getDate() - AUTODIV.CHUNK_DAYS + 1);
      if (from < first) from = first;
      (await fetchExChunk(from, to)).forEach(e => { if (held.has(e.symbol)) out.push(e); });
      to = new Date(from); to.setDate(to.getDate() - 1);
      if (to >= first) await new Promise(r => setTimeout(r, 400));
    }
    return out;
  }

  async function fetchExChunk(start, end) {
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

  // 往前推 n 個營業日(只略過週六日,不含國定假日)
  function autodivBizDaysBefore(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(y, m - 1, d);
    while (n > 0) {
      t.setDate(t.getDate() - 1);
      if (t.getDay() !== 0 && t.getDay() !== 6) n--;
    }
    return autodivYmd(t);
  }

  // 某人「有資格領息」的股數:買進日須在除息日前 2 個營業日(含)以前(買進 T+2 才交割,
  // 除息日前一個營業日才買進的領不到);賣出已扣除。
  // 已用實際配息紀錄回測驗證(買在除息前一個營業日的那批確實沒領到)。
  function autodivSharesBefore(person, symbol, exDate) {
    const cutoff = autodivBizDaysBefore(exDate, 2);
    let n = 0;
    (STATE.data.purchases || []).forEach(r => {
      if (r.person !== person || r.symbol !== symbol) return;
      const d = String(r.date || '').slice(0, 10);
      if (!d || d > cutoff) return;
      n += Number(r.shares) || 0;
    });
    return n;
  }

  function autodivEstimateNet(gross) {
    const nhi = gross >= AUTODIV.NHI_THRESHOLD ? gross * AUTODIV.NHI_RATE : 0;
    return Math.max(0, Math.round(gross - nhi - AUTODIV.REMIT_FEE));
  }

  function autodivIsRecorded(person, symbol, exDate, perShare, gross) {
    return !!autodivFindRecord(person, symbol, exDate, perShare, gross);
  }

  // 找出已入帳、對應這次除息的股利紀錄(找不到回傳 undefined)
  function autodivFindRecord(person, symbol, exDate, perShare, gross) {
    const endYmd = autodivAddDays(exDate, AUTODIV.PAID_WINDOW_DAYS);
    return (STATE.data.dividends || []).find(d => {
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
    const oldest = autodivAddDays(autodivYmd(new Date()), -AUTODIV.WINDOW_DAYS);
    _exDiv.list.forEach(ev => {
      if (!held.has(ev.symbol) || ev.exDate < oldest) return;
      // 只看目前選的人(跟首頁其他卡片一致);切換黃/蘇時 renderDashboard 會重畫
      [STATE.defaultPerson || CONFIG.PEOPLE[0]].forEach(person => {
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
      try { localStorage.setItem(KEY.divExCache, JSON.stringify({ v: 2, held: autodivHeldKey(), at: _exDiv.at, list })); } catch (_) {}
      drawPendingDividends();
      renderDashboard();   // 行事曆與「預估年配息」都用這份資料,重畫首頁
    }).catch(() => { _exDiv.failedAt = Date.now(); /* 抓不到就維持現狀(或舊快取),不打擾使用者 */ })
      .finally(() => { _exDiv.loading = false; });
  }

  // ============== 配息行事曆推估 ==============

  const _median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const autodivDaysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);

  // 某代號的歷史除息(由舊到新)
  function autodivHistory(symbol) {
    return (_exDiv.list || []).filter(e => e.symbol === symbol)
      .sort((a, b) => a.exDate < b.exDate ? -1 : 1);
  }

  // 由歷史推週期:取最近幾次除息間隔的中位數(月配約 30、季配約 91、半年約 182、年配約 365);
  // 只有一筆或間隔不合理則回傳 null(無法推週期)
  function autodivInterval(hist) {
    if (hist.length < 2) return null;
    const gaps = [];
    for (let i = Math.max(1, hist.length - 4); i < hist.length; i++) {
      gaps.push(autodivDaysBetween(hist[i - 1].exDate, hist[i].exDate));
    }
    const iv = _median(gaps);
    return (iv >= 20 && iv <= 400) ? iv : null;
  }

  // 週期(天):優先用歷史間隔;只有 1 筆歷史時,改用你在「標的」設定的配息月份數推(例如填 4 個月 = 季配)。
  // 配息頻率屬於基金公開說明書的資訊,沒有穩定可直接讀取的資料來源,所以由你填的設定補位。
  function autodivIntervalFor(symbol, hist) {
    const iv = autodivInterval(hist);
    if (iv) return iv;
    if (hist.length === 1) {
      const s = (STATE.data.symbols || []).find(x => x.symbol === symbol);
      const n = s ? String(s.months || '').split(',').map(x => Number(x.trim())).filter(Boolean).length : 0;
      if (n > 0 && n <= 12) return Math.round(365 / n);
    }
    return null;
  }

  // 每股「年配息」推估:最近一年份的配息平均 × 每年次數(次數由週期推得)。
  // 例:季配(間隔約 91 天)→ 取最近 4 次平均 × 4;月配取最近 12 次平均 × 12(新上市只有幾次就用現有的平均)。
  // 歷史資料還沒載入、查無資料或只有一筆(推不出週期)時回傳 null,由呼叫端改用手動設定。
  function autodivAnnualPerShare(symbol) {
    if (!Array.isArray(_exDiv.list)) return null;
    const hist = autodivHistory(symbol);
    const iv = autodivIntervalFor(symbol, hist);
    if (!iv) return null;
    const perYear = Math.max(1, Math.round(365 / iv));
    const recent = hist.slice(-Math.min(hist.length, perYear));
    const avg = recent.reduce((s, e) => s + e.perShare, 0) / recent.length;
    return avg * perYear;
  }

  // 計算 [rangeStart, rangeEnd](YYYY-MM-DD,以預估入帳日判斷)內某人的配息事件。
  // 回傳 { symbol, exDate, payDate, perShare, shares, amount, kind }
  //   kind: 'paid' 已入帳(用你記的實領)| 'ex' 已除息尚未入帳(實際每股配息)| 'est' 預估(最近一次每股配息 × 週期)
  // 沒有歷史資料的代號回傳在 missing 裡,由呼叫端改用手動設定。
  function computePayoutEvents(person, rangeStart, rangeEnd) {
    const events = [], missing = [];
    const open = computeOpenHoldings(person);
    const todayYmd = autodivYmd(new Date());
    Object.keys(open).forEach(symbol => {
      const hist = autodivHistory(symbol);
      if (hist.length === 0) { missing.push(symbol); return; }
      const inRange = (pay) => pay >= rangeStart && pay <= rangeEnd;
      // 已知的除息(含已入帳)
      hist.forEach(ev => {
        const payDate = autodivAddDays(ev.exDate, AUTODIV.PAY_LAG_DAYS);
        if (!inRange(payDate)) return;
        const shares = autodivSharesBefore(person, symbol, ev.exDate);
        if (shares <= 0) return;
        const gross = shares * ev.perShare;
        const rec = autodivFindRecord(person, symbol, ev.exDate, ev.perShare, gross);
        events.push({
          symbol, exDate: ev.exDate, payDate, perShare: ev.perShare, shares,
          amount: rec ? Number(rec.total) || 0 : autodivEstimateNet(gross),
          kind: rec ? 'paid' : 'ex'
        });
      });
      // 未來預估:最後一次除息 + k × 週期
      const iv = autodivIntervalFor(symbol, hist);
      const last = hist[hist.length - 1];
      if (!iv) return;
      for (let k = 1; k <= 8; k++) {
        const exDate = autodivAddDays(last.exDate, iv * k);
        if (exDate <= last.exDate) continue;
        const payDate = autodivAddDays(exDate, AUTODIV.PAY_LAG_DAYS);
        if (payDate > rangeEnd) break;
        if (!inRange(payDate)) continue;
        if (exDate <= todayYmd && hist.some(h => Math.abs(autodivDaysBetween(h.exDate, exDate)) <= 10)) continue;  // 已有實際資料
        const gross = open[symbol].shares * last.perShare;
        events.push({
          symbol, exDate, payDate, perShare: last.perShare, shares: open[symbol].shares,
          amount: autodivEstimateNet(gross), kind: 'est'
        });
      }
    });
    return { events, missing };
  }
