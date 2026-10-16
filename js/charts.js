/* 圖表:淨值、持股、歷史圖 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  function renderNetWorthChart(personFilter) {
    const canvas = $('#chart-networth');
    const empty  = $('#networth-empty');
    if (!canvas || !window.Chart) return;
    const purchases = (STATE.data.purchases || []).filter(r => !personFilter || r.person === personFilter);
    const snaps = ((STATE.data && STATE.data.snapshots) || []).filter(r => !personFilter || r.person === personFilter);
    if (purchases.length === 0) {
      if (empty) { empty.classList.remove('hidden'); empty.textContent = '尚未有購買紀錄,無法畫資產走勢。'; }
      canvas.style.display = 'none';
      if (_charts.networth) { _charts.networth.destroy(); _charts.networth = null; }
      return;
    }
    const purchaseDates = purchases.map(r => String(r.date || '').slice(0, 10)).filter(Boolean).sort();
    if (purchaseDates.length === 0) return;
    if (empty) empty.classList.add('hidden');
    canvas.style.display = '';

    const earliest = new Date(purchaseDates[0]);
    const today = new Date();
    const todayStr = ymdLocal(today);

    // 生成月底日期序列(每月最後一天,直到今天)+ 今天 + snapshot 日期
    const dateSet = new Set();
    let y = earliest.getFullYear(), m = earliest.getMonth();
    while (true) {
      const monthEnd = new Date(y, m + 1, 0);  // 該月最後一天
      if (monthEnd > today) break;
      dateSet.add(ymdLocal(monthEnd));
      m++; if (m > 11) { m = 0; y++; }
    }
    dateSet.add(todayStr);
    snaps.forEach(r => {
      const d = String(r.date || '').slice(0, 10);
      if (d) dateSet.add(d);
    });
    const dates = [...dateSet].sort();

    const priceMap = {};
    (STATE.data.symbols || []).forEach(s => priceMap[s.symbol] = Number(s.current_price) || 0);

    const snapByDate = {};
    snaps.forEach(r => {
      const d = String(r.date || '').slice(0, 10);
      if (!d) return;
      snapByDate[d] = (snapByDate[d] || 0) + (Number(r.market_value) || 0);
    });

    // 從最早日期開始累計
    const sortedP = purchases.slice().sort((a, b) => {
      const da = String(a.date || '').slice(0, 10);
      const db = String(b.date || '').slice(0, 10);
      return da < db ? -1 : (da > db ? 1 : 0);
    });
    let runCost = 0;
    const runShares = {};
    let pIdx = 0;
    const investedSeries = [], estimatedSeries = [], snapshotSeries = [];
    dates.forEach(d => {
      while (pIdx < sortedP.length) {
        const pd = String(sortedP[pIdx].date || '').slice(0, 10);
        if (pd > d) break;
        const r = sortedP[pIdx];
        runCost += (Number(r.amount) || 0) + (Number(r.fee) || 0);
        runShares[r.symbol] = (runShares[r.symbol] || 0) + (Number(r.shares) || 0);
        pIdx++;
      }
      investedSeries.push(Math.round(runCost));
      let est = 0;
      Object.keys(runShares).forEach(sym => {
        est += runShares[sym] * (priceMap[sym] || 0);
      });
      estimatedSeries.push(Math.round(est));
      snapshotSeries.push(snapByDate[d] !== undefined ? Math.round(snapByDate[d]) : null);
    });

    const palette = STATE.chartColors || getCurrentPalette().chart;
    const colInvested  = palette[1] || '#94a3b8';
    const colEstimated = palette[0] || '#3b82f6';
    const colSnap      = palette[2] || '#22c55e';
    if (_charts.networth) _charts.networth.destroy();
    _charts.networth = new Chart(canvas, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label: '累計投入',
            data: investedSeries,
            borderColor: colInvested, backgroundColor: 'transparent',
            tension: FX.lineTension(), pointRadius: 2, borderWidth: 2, borderDash: [5, 5] },
          { label: '估算市值 (以今日價回推)',
            data: estimatedSeries,
            borderColor: colEstimated, backgroundColor: FX.gradient(colEstimated),
            tension: FX.lineTension(), pointRadius: 2, borderWidth: 2, fill: true },
          { label: '真實快照',
            data: snapshotSeries,
            borderColor: colSnap, backgroundColor: colSnap,
            tension: 0.2, pointRadius: 5, borderWidth: 3, spanGaps: false }
        ]
      },
      options: chartBarOptions()
    });
  }

  // 圖表實例(用以重複渲染時銷毀舊的)
  const _charts = {};

  function renderHoldingsChart(personFilter) {
    const canvas = $('#chart-holdings');
    if (!canvas || !window.Chart) return;
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const agg = {};
    const open = computeOpenHoldings(personFilter);
    Object.keys(open).forEach(sym => {
      agg[sym] = open[sym].shares * (Number((symMap[sym] || {}).current_price) || 0);
    });
    const labels = Object.keys(agg).sort();
    const data   = labels.map(k => Math.round(agg[k]));
    if (data.every(v => v === 0)) {
      canvas.parentElement.parentElement.classList.add('hidden');
      return;
    }
    canvas.parentElement.parentElement.classList.remove('hidden');
    const colors = STATE.chartColors || getCurrentPalette().chart;
    if (_charts.holdings) _charts.holdings.destroy();
    _charts.holdings = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      plugins: [FX.centerTextPlugin(fmt.money(data.reduce((a, v) => a + v, 0)), '總市值')],
      options: {
        cutout: '62%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: getCssVar('--text'), boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${fmt.money(ctx.parsed)} (${(ctx.parsed / data.reduce((s,v)=>s+v,0) * 100).toFixed(1)}%)`
            }
          }
        }
      }
    });
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2A3938';
  }

  function renderHistoryChart(tab, raw) {
    const wrap = $('#history-chart-wrap');
    const canvas = $('#chart-history');
    if (!canvas || !window.Chart) return;
    // 只在「買賣」與「股利」分頁顯示堆疊/並排切換鈕(銀行 / 月存沒這需求)
    const toggle = $('#dividend-chart-toggle');
    if (toggle && tab !== 'dividends' && tab !== 'purchases') toggle.classList.add('hidden');
    // 已實現損益分頁:不畫圖(以摘要卡呈現)
    if (tab === 'realized') { wrap.classList.add('hidden'); return; }
    if (tab === 'purchases') {
      // 月份 × 代號(買進向上、賣出向下)
      const byMonth = {};
      const symbolSet = new Set();
      raw.forEach(r => {
        const m = String(r.date || '').slice(0, 7);
        if (!m) return;
        const sym = r.symbol || '?';
        symbolSet.add(sym);
        if (!byMonth[m]) byMonth[m] = {};
        if (!byMonth[m][sym]) byMonth[m][sym] = { buy: 0, sell: 0 };
        const amt = Number(r.amount) || 0;
        if (amt < 0) byMonth[m][sym].sell += -amt;
        else         byMonth[m][sym].buy  += amt;
      });
      const months = Object.keys(byMonth).sort();
      if (months.length === 0) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');
      const symbols = Array.from(symbolSet).sort();
      const palette = STATE.chartColors || getCurrentPalette().chart;
      const hasSell = months.some(m => symbols.some(s => byMonth[m][s] && byMonth[m][s].sell > 0));
      const mode = localStorage.getItem(KEY.purchaseChartMode) === 'grouped' ? 'grouped' : 'stacked';
      const toggle = $('#dividend-chart-toggle');
      if (toggle) {
        toggle.classList.remove('hidden');
        $$('#dividend-chart-toggle .seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.cmode === mode);
          b.disabled = false;
          b.title = '';
        });
      }
      $('#history-chart-title').textContent = mode === 'stacked'
        ? (hasSell ? '每月買賣金額(堆疊,分代號)' : '每月買進金額(堆疊,分代號)')
        : (hasSell ? '每月買賣金額(並排,分代號)' : '每月買進金額(並排,分代號)');

      const datasets = [];
      if (mode === 'stacked') {
        // 堆疊模式:每代號的買、賣分開為獨立 dataset
        // 買的全部 stack 到 'buy'(向上堆),賣的全部 stack 到 'sell'(向下堆)
        // 「(賣)」dataset 只對真的賣過的代號才生成,避免雜訊
        symbols.forEach((sym, i) => {
          datasets.push({
            label: sym,
            stack: 'buy',
            data: months.map(m => (byMonth[m][sym] && byMonth[m][sym].buy) || 0),
            backgroundColor: palette[i % palette.length]
          });
        });
        symbols.forEach((sym, i) => {
          const symHasSell = months.some(m => byMonth[m][sym] && byMonth[m][sym].sell > 0);
          if (!symHasSell) return;
          datasets.push({
            label: sym + ' (賣)',
            stack: 'sell',
            data: months.map(m => -((byMonth[m][sym] && byMonth[m][sym].sell) || 0)),
            backgroundColor: palette[i % palette.length],
            borderColor: '#FFFFFF',
            borderWidth: 1
          });
        });
      } else {
        // 並排模式:每代號 1 個 dataset,值 = 該月買金額 − 賣金額(淨值)
        // 月份只有買 → 正值;有賣多於買 → 負值;只有賣 → 負值
        symbols.forEach((sym, i) => {
          datasets.push({
            label: sym,
            data: months.map(m => {
              const v = byMonth[m][sym];
              return v ? (v.buy - v.sell) : 0;
            }),
            backgroundColor: palette[i % palette.length]
          });
        });
      }
      const opts = chartBarOptions();
      if (mode === 'stacked') {
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
      }
      if (_charts.history) _charts.history.destroy();
      _charts.history = new Chart(canvas, {
        type: 'bar',
        data: { labels: months, datasets },
        options: opts
      });
    } else if (tab === 'dividends') {
      // 月份 × 代號 累計(每代號一個顏色 → 可切換 stacked / grouped)
      const byMonthSymbol = {};
      const symbolSet = new Set();
      raw.forEach(r => {
        const m = String(r.date || '').slice(0, 7);
        if (!m) return;
        const sym = r.symbol || '?';
        symbolSet.add(sym);
        if (!byMonthSymbol[m]) byMonthSymbol[m] = {};
        byMonthSymbol[m][sym] = (byMonthSymbol[m][sym] || 0) + (Number(r.total) || 0);
      });
      const months = Object.keys(byMonthSymbol).sort();
      if (months.length === 0) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');
      const mode = localStorage.getItem(KEY.dividendChartMode) === 'grouped' ? 'grouped' : 'stacked';
      const toggle = $('#dividend-chart-toggle');
      if (toggle) {
        toggle.classList.remove('hidden');
        $$('#dividend-chart-toggle .seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.cmode === mode);
          b.disabled = false;
          b.title = '';
        });
      }
      $('#history-chart-title').textContent = mode === 'stacked'
        ? '每月股利金額(堆疊)'
        : '每月股利金額(並排)';
      const symbols = Array.from(symbolSet).sort();
      const palette = STATE.chartColors || getCurrentPalette().chart;
      const datasets = symbols.map((sym, i) => ({
        label: sym,
        data: months.map(m => byMonthSymbol[m][sym] || 0),
        backgroundColor: palette[i % palette.length]
      }));
      const opts = chartBarOptions();
      if (mode === 'stacked') {
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
      }
      if (_charts.history) _charts.history.destroy();
      _charts.history = new Chart(canvas, {
        type: 'bar',
        data: { labels: months, datasets },
        options: opts
      });
    } else if (tab === 'bank') {
      // 月份收入 vs 支出
      const byMonth = {};
      raw.forEach(r => {
        const m = String(r.date || '').slice(0, 7);
        if (!m) return;
        if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 };
        const a = Number(r.amount) || 0;
        if (String(r.type).startsWith('支出')) byMonth[m].expense += a;
        else byMonth[m].income += a;
      });
      const months = Object.keys(byMonth).sort();
      if (months.length === 0) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');
      $('#history-chart-title').textContent = '每月收入 vs 支出';
      if (_charts.history) _charts.history.destroy();
      _charts.history = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: months,
          datasets: [
            { label: '收入', data: months.map(m => byMonth[m].income),  backgroundColor: getCssVar('--green') },
            { label: '支出', data: months.map(m => -byMonth[m].expense), backgroundColor: getCssVar('--red') }
          ]
        },
        options: chartBarOptions()
      });
    } else if (tab === 'savings') {
      const byMonth = {};
      raw.forEach(r => {
        const k = `${r.year}-${String(r.month).padStart(2,'0')}`;
        byMonth[k] = (byMonth[k] || 0) + (Number(r.amount) || 0);
      });
      const months = Object.keys(byMonth).sort();
      if (months.length === 0) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');
      $('#history-chart-title').textContent = '每月存入金額';
      if (_charts.history) _charts.history.destroy();
      _charts.history = new Chart(canvas, {
        type: 'bar',
        data: { labels: months, datasets: [{ label: '存入', data: months.map(m => byMonth[m]), backgroundColor: getCssVar('--purple') }] },
        options: chartBarOptions()
      });
    }
  }

  function chartBarOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: getCssVar('--text') } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt.money(ctx.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: getCssVar('--muted') }, grid: { color: getCssVar('--border') } },
        y: { ticks: { color: getCssVar('--muted'), callback: (v) => fmt.money(v) }, grid: { color: getCssVar('--border') } }
      }
    };
  }

