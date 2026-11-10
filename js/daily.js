/* 每日真實市值與損益 — 用 _price_history 的每日收盤價 × 當天的持股算出來。
 * 後端每個交易日下午會自動記錄收盤價(2026-10-28 起),所以從那天開始每天都有一點;更早只有零星幾天。
 * 損益 = 市值變化 − 這段期間新投入的錢(買進不算賺、賣出不算賠)。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  // 回傳 [{ date, value, cost, flow }]:value = 當天收盤市值、cost = 到當天為止的累計投入、flow = 上一點之後新投入的錢
  function computeDailyValues(person) {
    const d = STATE.data || {};
    const code = (s) => String(s || '').replace(/^代號/, '');
    const byDate = {};
    (d.price_history || []).forEach(r => {
      const dt = String(r.date || '').slice(0, 10), c = Number(r.close_price);
      if (dt && c > 0) (byDate[dt] || (byDate[dt] = {}))[code(r.symbol)] = c;
    });
    const dates = Object.keys(byDate).sort();
    // 買進 = 投入 amount + fee;賣出的 amount 是負的,amount + fee 剛好是「拿回來的錢」的負值
    const rows = (d.purchases || []).filter(r => (!person || r.person === person) && r.symbol && Number(r.shares))
      .map(r => ({ date: String(r.date || '').slice(0, 10), sym: code(r.symbol), shares: Number(r.shares) || 0, money: (Number(r.amount) || 0) + (Number(r.fee) || 0) }))
      .filter(r => r.date).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const last = {}, shares = {}, out = [];
    let i = 0, flow = 0, cost = 0;
    dates.forEach(dt => {
      Object.assign(last, byDate[dt]);
      while (i < rows.length && rows[i].date <= dt) {
        const r = rows[i++];
        shares[r.sym] = (shares[r.sym] || 0) + r.shares;
        flow += r.money; cost += r.money;
      }
      const held = Object.keys(shares).filter(s => shares[s] > 0);
      if (!held.length || held.some(s => !(last[s] > 0))) return;   // 有持股還沒有收盤價:這天算不出真實市值,新投入的錢留到下一點
      out.push({ date: dt, value: held.reduce((a, s) => a + shares[s] * last[s], 0), cost, flow });
      flow = 0;
    });
    return out;
  }

  // 從 startYmd(含)到最新一點的損益;base = startYmd 之前的最後一點。資料不夠回傳 null
  function dailyPnlSince(series, startYmd) {
    const n = series.length;
    if (n < 2 || series[n - 1].date < startYmd) return null;
    let b = -1;
    for (let k = 0; k < n - 1; k++) if (series[k].date < startYmd) b = k;
    if (b < 0) return null;
    const flows = series.slice(b + 1).reduce((a, x) => a + x.flow, 0);
    const pnl = series[n - 1].value - series[b].value - flows;
    const denom = series[b].value + Math.max(0, flows);
    return { pnl, pct: denom > 0 ? pnl / denom * 100 : 0, from: series[b].date };
  }

  // 首頁:今日／本週／本月損益
  function dailyPnlHtml(person) {
    const series = computeDailyValues(person);
    if (series.length < 2) {
      return `<div class="pnl-strip empty muted small">每天的收盤價累積兩天以上後,這裡會顯示今日、本週、本月的損益。</div>`;
    }
    const lastP = series[series.length - 1], today = ymdLocal(new Date());
    const now = new Date(), monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const md = (s) => +s.slice(5, 7) + '/' + +s.slice(8, 10);
    const chip = (label, sub, r) => {
      if (!r) return `<div class="pnl-chip"><span class="pnl-label">${label}<small>${sub}</small></span><span class="pnl-val muted">—</span></div>`;
      const cls = r.pnl >= 0 ? 'gain' : 'loss';
      return `<div class="pnl-chip ${cls}"><span class="pnl-label">${label}<small>${sub}</small></span>
        <span class="pnl-val ${cls}"><span class="town-num">${fmt.moneySigned(Math.round(r.pnl))}</span></span>
        <span class="pnl-pct ${cls}">${r.pnl >= 0 ? '+' : ''}${r.pct.toFixed(2)}%</span></div>`;
    };
    return `<div class="pnl-strip">
        ${chip(lastP.date === today ? '今日' : '最近交易日', md(lastP.date), dailyPnlSince(series, lastP.date))}
        ${chip('本週', '週一起', dailyPnlSince(series, ymdLocal(monday)))}
        ${chip('本月', (now.getMonth() + 1) + ' 月', dailyPnlSince(series, today.slice(0, 8) + '01'))}
      </div>
      <div class="muted small pnl-note">依每日收盤價計算,已扣掉這段期間新投入的錢(截至 ${md(lastP.date)} 收盤)。</div>`;
  }
