/* 持股統計、已實現損益、持股明細 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  function computePersonStats() {
    const out = {};
    CONFIG.PEOPLE.forEach(p => {
      out[p] = { totalShares: 0, totalCost: 0, annualYield: 0, marketValue: 0, bankBalance: 0, savings: 0 };
    });
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);

    (STATE.data.purchases || []).forEach(r => {
      const p = r.person;
      if (!out[p]) return;
      const shares = Number(r.shares) || 0;
      const amount = Number(r.amount) || 0;
      const fee    = Number(r.fee)    || 0;
      out[p].totalShares += shares;
      out[p].totalCost   += amount + fee;
      const sym = symMap[r.symbol];
      if (sym) {
        const y = Number(sym.annual_yield_per_share) || 0;
        const cur = Number(sym.current_price) || 0;
        out[p].annualYield  += y   * shares;  // shares 即「股數」
        out[p].marketValue  += cur * shares;
      }
    });

    (STATE.data.bank || []).forEach(r => {
      const p = r.person;
      if (!out[p]) return;
      const sign = String(r.type).startsWith('支出') ? -1 : 1;
      out[p].bankBalance += sign * (Number(r.amount) || 0);
    });

    (STATE.data.savings || []).forEach(r => {
      const p = r.person;
      if (!out[p]) return;
      out[p].savings += Number(r.amount) || 0;
    });

    return out;
  }

  // 計算每筆「賣出」的已實現損益(用加權平均成本)
  // 回傳 [{ id, person, symbol, date, sold_shares, sell_price, cost_basis, proceeds, fee, realized_pl }, ...]
  function computeRealizedPL() {
    const sells = [];
    const tally = {};  // key = "person|symbol" → { shares, cost }
    const sorted = (STATE.data.purchases || []).slice().sort((a, b) => {
      const da = String(a.date || '').slice(0, 10);
      const db = String(b.date || '').slice(0, 10);
      if (da !== db) return da < db ? -1 : 1;
      const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
      const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ca - cb;
    });
    sorted.forEach(r => {
      const key = (r.person || '') + '|' + (r.symbol || '');
      if (!tally[key]) tally[key] = { shares: 0, cost: 0 };
      const t = tally[key];
      const shares = Number(r.shares) || 0;
      const amount = Number(r.amount) || 0;
      const fee    = Number(r.fee)    || 0;
      const isSell = amount < 0 || shares < 0;
      if (!isSell) {
        t.shares += shares;
        t.cost   += amount + fee;
      } else {
        const soldShares = Math.abs(shares);
        const proceeds  = Math.abs(amount) - fee;
        const prevAvg   = t.shares > 0 ? t.cost / t.shares : 0;
        const costBasis = prevAvg * soldShares;
        sells.push({
          id: r.id, person: r.person, symbol: r.symbol, date: r.date,
          sold_shares: soldShares,
          sell_price:  Number(r.price) || 0,
          cost_basis:  costBasis,
          proceeds,
          fee,
          realized_pl: proceeds - costBasis
        });
        t.shares -= soldShares;
        t.cost   -= costBasis;
        if (t.shares < 0.0001) { t.shares = 0; t.cost = 0; }
      }
    });
    return sells;
  }

  function renderHoldings(personFilter) {
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const agg = {};
    (STATE.data.purchases || []).forEach(r => {
      const k = r.symbol;
      if (!k) return;
      if (personFilter && r.person !== personFilter) return;
      if (!agg[k]) agg[k] = { shares: 0, amount: 0, fee: 0 };
      agg[k].shares += Number(r.shares) || 0;
      agg[k].amount += Number(r.amount) || 0;
      agg[k].fee    += Number(r.fee)    || 0;
    });
    // 先把所有列的數值算好,再排序
    const items = Object.keys(agg).map(sym => {
      const a = agg[sym];
      const totalUnits = a.shares;
      const totalCost  = a.amount + a.fee;
      const avgPrice   = totalUnits > 0 ? totalCost / totalUnits : 0;
      const cur = Number((symMap[sym] || {}).current_price) || 0;
      const marketValue = cur > 0 ? cur * totalUnits : 0;
      const gain    = cur > 0 ? marketValue - totalCost : 0;
      const gainPct = (cur > 0 && avgPrice > 0) ? (cur - avgPrice) / avgPrice * 100 : 0;
      const irr = computeSymbolIrr(sym, personFilter, marketValue);
      return { sym, shares: a.shares, avgPrice, cur, totalCost, marketValue, gain, gainPct, irr };
    });
    const sort = STATE.holdingsSort;
    if (sort && sort.key) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        let va = a[sort.key], vb = b[sort.key];
        // null IRR / 沒現價的列固定排在最後
        const aNull = (va === null || va === undefined || (sort.key !== 'sym' && !isFinite(va)));
        const bNull = (vb === null || vb === undefined || (sort.key !== 'sym' && !isFinite(vb)));
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        if (sort.key === 'sym') return String(va).localeCompare(String(vb)) * dir;
        return (va - vb) * dir;
      });
    } else {
      items.sort((a, b) => String(a.sym).localeCompare(String(b.sym)));
    }
    const tbody = $('#holdings-table tbody');
    const rows = items.map(it => {
      const gainCls = it.gain >= 0 ? 'gain' : 'loss';
      const gainTxt = it.cur > 0 ? `${fmt.moneySigned(it.gain)} <small>(${fmt.pct(it.gainPct)})</small>` : '—';
      const irrCls = it.irr === null ? 'muted' : (it.irr >= 0 ? 'gain' : 'loss');
      const irrTxt = it.irr === null ? '—' : `${(it.irr * 100).toFixed(1)}%`;
      return `<tr data-sym="${it.sym}">
        <td>${it.sym}</td>
        <td>${fmt.money(it.shares)} 股</td>
        <td>${it.avgPrice.toFixed(2)}</td>
        <td class="price">${it.cur > 0 ? it.cur.toFixed(2) : '—'}</td>
        <td>${fmt.money(it.totalCost)}</td>
        <td>${it.cur > 0 ? fmt.money(it.marketValue) : '—'}</td>
        <td class="${gainCls}">${gainTxt}</td>
        <td class="${irrCls}">${irrTxt}</td>
      </tr>`;
    }).join('');
    // 總計列(只有列數 > 0 才顯示)
    let totalsRow = '';
    if (items.length > 0) {
      const totalCost = items.reduce((s, it) => s + it.totalCost, 0);
      const totalMv   = items.reduce((s, it) => s + it.marketValue, 0);
      const totalGain = totalMv - totalCost;
      const totalGainPct = totalCost > 0 ? (totalGain / totalCost * 100) : 0;
      const totalGainCls = totalGain >= 0 ? 'gain' : 'loss';
      const portfolioIrr = computeIrr(personFilter, totalMv);
      const portfolioIrrCls = portfolioIrr === null ? 'muted' : (portfolioIrr >= 0 ? 'gain' : 'loss');
      const portfolioIrrTxt = portfolioIrr === null ? '—' : `${(portfolioIrr * 100).toFixed(1)}%`;
      totalsRow = `<tr class="totals-row">
        <td><b>總計</b></td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td><b>${fmt.money(totalCost)}</b></td>
        <td><b>${fmt.money(totalMv)}</b></td>
        <td class="${totalGainCls}"><b>${fmt.moneySigned(totalGain)}</b> <small>(${fmt.pct(totalGainPct)})</small></td>
        <td class="${portfolioIrrCls}"><b>${portfolioIrrTxt}</b></td>
      </tr>`;
    }
    tbody.innerHTML = (rows + totalsRow) || `<tr><td colspan="8" class="muted">尚無持股資料</td></tr>`;

    // 表頭排序指示
    $$('#holdings-table thead th[data-sort]').forEach(th => {
      const k = th.dataset.sort;
      th.classList.toggle('sort-asc',  sort && sort.key === k && sort.dir === 'asc');
      th.classList.toggle('sort-desc', sort && sort.key === k && sort.dir === 'desc');
    });

    $('#btn-update-prices').onclick = updatePricesFlow;
    const refreshBtn = $('#btn-refresh-prices');
    if (refreshBtn) refreshBtn.onclick = refreshPricesFlow;

    // 顯示「現價截至」時間（從 _meta 讀 last_price_update）
    const timeEl = $('#price-update-time');
    if (timeEl) {
      const ts = STATE.data.meta && STATE.data.meta.last_price_update;
      timeEl.textContent = ts ? '現價截至 ' + fmtPriceTs(ts) : '';
    }
  }

  function bindHoldingsSort() {
    const saved = localStorage.getItem('pr.holdingsSort');
    if (saved) {
      try { STATE.holdingsSort = JSON.parse(saved); } catch (_) {}
    }
    $$('#holdings-table thead th[data-sort]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        const cur = STATE.holdingsSort;
        let next;
        if (!cur || cur.key !== k) next = { key: k, dir: 'desc' };
        else if (cur.dir === 'desc') next = { key: k, dir: 'asc' };
        else next = null;  // 第三次點 → 還原預設(代號 a-z)
        STATE.holdingsSort = next;
        if (next) localStorage.setItem('pr.holdingsSort', JSON.stringify(next));
        else localStorage.removeItem('pr.holdingsSort');
        renderHoldings(STATE.defaultPerson);
      });
    });
  }

  /**
   * 直接從瀏覽器端呼叫 TWSE / TPEX 公開 API 抓取現價。
   * 瀏覽器 IP 不受 TWSE 封鎖（只有 Apps Script 固定 IP 才會被封）。
   * 成功時回傳 { prices: { '0056': 53.8, ... }, date: 'YYYY-MM-DD' }；
   * 所有來源都失敗則回傳 null。
   */
