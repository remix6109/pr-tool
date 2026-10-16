/* 首頁:XIRR 報酬率、總覽 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== Dashboard ==============

  // XIRR (牛頓法) — 解出年化內部報酬率
  // flows: [{ date: Date, amount: number }];負 = 投入,正 = 收回
  function xirr(flows) {
    if (!flows || flows.length < 2) return null;
    const sorted = flows.slice().sort((a, b) => a.date - b.date);
    const t0 = sorted[0].date.getTime();
    const days = sorted.map(f => (f.date.getTime() - t0) / 86400000);
    const amts = sorted.map(f => f.amount);
    if (!amts.some(a => a > 0) || !amts.some(a => a < 0)) return null;
    let r = 0.1;
    for (let i = 0; i < 100; i++) {
      let f = 0, df = 0;
      for (let j = 0; j < amts.length; j++) {
        const t = days[j] / 365;
        const d = Math.pow(1 + r, t);
        f  += amts[j] / d;
        df -= amts[j] * t / Math.pow(1 + r, t + 1);
      }
      if (Math.abs(f) < 1e-6) return r;
      if (df === 0) return null;
      const next = r - f / df;
      if (!isFinite(next) || next <= -0.999) return null;
      if (Math.abs(next - r) < 1e-7) return next;
      r = next;
    }
    return null;
  }

  // 算單支股票的 XIRR(含股利、含今日市值)
  function computeSymbolIrr(symbol, personFilter, marketValue) {
    const flows = [];
    (STATE.data.purchases || []).forEach(r => {
      if (r.symbol !== symbol) return;
      if (personFilter && r.person !== personFilter) return;
      const dStr = String(r.date || '').slice(0, 10);
      if (!dStr) return;
      const date = new Date(dStr);
      if (isNaN(date)) return;
      const amount = Number(r.amount) || 0;
      const fee    = Number(r.fee)    || 0;
      if (amount > 0) flows.push({ date, amount: -(amount + fee) });
      else if (amount < 0) flows.push({ date, amount: Math.abs(amount) - fee });
    });
    (STATE.data.dividends || []).forEach(r => {
      if (r.symbol !== symbol) return;
      if (personFilter && r.person !== personFilter) return;
      const dStr = String(r.date || '').slice(0, 10);
      if (!dStr) return;
      const date = new Date(dStr);
      if (isNaN(date)) return;
      const t = Number(r.total) || 0;
      if (t > 0) flows.push({ date, amount: t });
    });
    if (marketValue > 0) flows.push({ date: new Date(), amount: marketValue });
    return xirr(flows);
  }

  function computeIrr(person, currentMarketValue) {
    const flows = [];
    (STATE.data.purchases || []).forEach(r => {
      if (r.person !== person) return;
      const dStr = String(r.date || '').slice(0, 10);
      if (!dStr) return;
      const date = new Date(dStr);
      if (isNaN(date)) return;
      const amount = Number(r.amount) || 0;
      const fee    = Number(r.fee)    || 0;
      if (amount > 0) flows.push({ date, amount: -(amount + fee) });        // 買進 = 投入
      else if (amount < 0) flows.push({ date, amount: Math.abs(amount) - fee }); // 賣出 = 收回
    });
    (STATE.data.dividends || []).forEach(r => {
      if (r.person !== person) return;
      const dStr = String(r.date || '').slice(0, 10);
      if (!dStr) return;
      const date = new Date(dStr);
      if (isNaN(date)) return;
      const t = Number(r.total) || 0;
      if (t > 0) flows.push({ date, amount: t });
    });
    // 加上「今天的當前市值」當作期末若全部賣出可拿回多少
    if (currentMarketValue > 0) flows.push({ date: new Date(), amount: currentMarketValue });
    return xirr(flows);
  }

  function renderDashboard() {
    if (!STATE.data) return;
    const stats = computePersonStats();
    const p = STATE.defaultPerson || '黃';
    const cls = p === '黃' ? 'huang' : 'su';
    const s = stats[p];
    const elPeople = $('#cards-people');
    const gain = s.marketValue - s.totalCost;
    const gainCls = gain >= 0 ? 'gain' : 'loss';
    const gainPct = s.totalCost > 0 ? (gain / s.totalCost * 100) : 0;
    const irr = computeIrr(p, s.marketValue);
    const irrHtml = (irr !== null)
      ? `<small class="${irr >= 0 ? 'gain' : 'loss'}">${(irr * 100).toFixed(2)}%</small>`
      : `<small class="muted">資料不足</small>`;
    elPeople.innerHTML = `
      <div class="person-card ${cls} solo" data-collapse="person">
        <div class="name">${escapeHtml(getPersonLabel(p))}</div>
        <div class="stat"><span class="label">總股數</span><span class="val">${fmt.money(s.totalShares)}</span></div>
        <div class="stat"><span class="label">總本金</span><span class="val">${fmt.money(s.totalCost)}</span></div>
        <div class="stat"><span class="label">總市值</span><span class="val">${fmt.money(s.marketValue)} <small class="${gainCls}">(${fmt.moneySigned(gain)} / ${fmt.pct(gainPct)})</small></span></div>
        <div class="stat"><span class="label">預估年配息 <small class="muted">(${s.annualManual ? '含手動設定' : '依實際配息'})</small></span><span class="val">${fmt.money(s.annualYield)}</span></div>
        <div class="stat"><span class="label">真實年化 IRR <small class="muted">(含股利)</small> <button type="button" class="info-btn" data-info="irr" title="什麼是 IRR?">ⓘ</button></span><span class="val">${irrHtml}</span></div>
        <div class="stat"><span class="label">銀行餘額</span><span class="val">${fmt.money(s.bankBalance)}</span></div>
      </div>
    `;

    renderHoldings(p);
    renderPayoutCalendar(p);
    renderHoldingsChart(p);
    renderTown(p);
    renderNetWorthChart(p);
    renderSavingsProgress(stats);
    applyCollapseStates();
    FX.afterRender();
    renderPendingDividends();
  }

  // 三條線:
  //   A. 累計投入   — 每月底投入成本(100% 準確,純歷史 purchase)
  //   B. 估算市值   — 每月底持股 × 今日價格(以今日價回推,估算)
  //   C. 真實 snap  — _snapshots 寫入點(從今天開始累積)
