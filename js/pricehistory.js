/* 漲跌幅歷史 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== 漲跌幅歷史 ==============

  function renderPriceHistory() {
    // 隱藏不適用的共用 UI
    const wrap    = $('#history-chart-wrap');
    const summary = $('#history-summary');
    const yearSel = $('#filter-year');
    const catWrap = $('#filter-category-wrap');
    const phFilters = $('#ph-filters');
    if (wrap)    wrap.classList.add('hidden');
    if (summary) summary.innerHTML = '';
    if (yearSel) { yearSel.classList.add('hidden'); yearSel.value = ''; }
    if (catWrap) catWrap.style.display = 'none';
    if (phFilters) phFilters.classList.remove('hidden');

    // 事件綁定（只綁一次）
    if (phFilters && !phFilters._bound) {
      phFilters._bound = true;
      $('#ph-held-only').onchange  = renderPriceHistory;
      $('#ph-date-from').oninput   = renderPriceHistory;
      $('#ph-date-to').oninput     = renderPriceHistory;
      $('#ph-stat-btn').onclick    = () => {
        phFilters.dataset.mode = phFilters.dataset.mode === 'stat' ? '' : 'stat';
        renderPriceHistory();
      };
    }

    const statMode = phFilters && phFilters.dataset.mode === 'stat';
    const statBtn  = $('#ph-stat-btn');
    if (statBtn) statBtn.textContent = statMode ? '📋 歷史' : '📊 統計';

    const heldOnly = !!($('#ph-held-only') && $('#ph-held-only').checked);
    const dateFrom = ($('#ph-date-from') || {}).value || '';
    const dateTo   = ($('#ph-date-to')   || {}).value || '';

    const list   = $('#history-list');
    const search = ($('#filter-search').value || '').trim().toLowerCase();

    // 計算持有代號集合（買入 shares > 0）
    let heldSet = null;
    if (heldOnly) {
      heldSet = new Set();
      (STATE.data.purchases || []).forEach(r => {
        if ((Number(r.shares) || 0) > 0) heldSet.add(String(r.symbol || ''));
      });
    }

    // 套用所有篩選
    const history = (STATE.data.price_history || []).filter(r => {
      const date = String(r.date || '').slice(0, 10);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo   && date > dateTo)   return false;
      if (heldSet  && !heldSet.has(String(r.symbol || ''))) return false;
      if (search && !String(r.symbol || '').toLowerCase().includes(search) &&
                    !String(r.name   || '').toLowerCase().includes(search)) return false;
      return true;
    });

    if ((STATE.data.price_history || []).length === 0) {
      list.innerHTML = '<div class="ph-empty">尚無漲跌紀錄<br><small>請先按「抓最新現價」，之後每次抓取都會自動記錄</small></div>';
      return;
    }
    if (history.length === 0) {
      list.innerHTML = '<div class="ph-empty">找不到符合條件的紀錄</div>';
      return;
    }

    // 圖表事件 delegation（只綁一次，innerHTML 替換後仍有效）
    if (!list._chartBound) {
      list._chartBound = true;
      list.addEventListener('click', e => {
        const symBtn = e.target.closest('.ph-sym-btn');
        if (symBtn) { openSymbolChart(symBtn.dataset.sym); return; }
        const dayBtn = e.target.closest('.ph-day-chart-btn');
        if (dayBtn) { toggleDayChart(dayBtn.dataset.date); }
      });
    }

    if (statMode) {
      renderPriceHistoryStat(list, history, dateFrom, dateTo);
    } else {
      renderPriceHistoryByDate(list, history, search);
    }
  }

  // 歷史模式：單日檢視，prev/next 導航
  function renderPriceHistoryByDate(list, history, search) {
    const byDate = {};
    history.forEach(r => {
      const date = String(r.date || '').slice(0, 10);
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(r);
    });
    const dates = Object.keys(byDate).sort();   // 舊→新
    if (dates.length === 0) {
      list.innerHTML = '<div class="ph-empty">找不到符合條件的紀錄</div>';
      return;
    }

    const latestDate = dates[dates.length - 1];
    if (!list._phDate || !dates.includes(list._phDate)) list._phDate = latestDate;
    const cur      = list._phDate;
    const idx      = dates.indexOf(cur);
    const prevDate = idx > 0 ? dates[idx - 1] : null;
    const nextDate = idx < dates.length - 1 ? dates[idx + 1] : null;
    const isLatest = cur === latestDate;

    const rows = (byDate[cur] || [])
      .sort((a, b) => (Number(a.change_pct) || 0) - (Number(b.change_pct) || 0));

    const valid     = rows.filter(r => (Number(r.prev_close) || 0) > 0);
    const avgPct    = valid.length > 0
      ? valid.reduce((s, r) => s + (Number(r.change_pct) || 0), 0) / valid.length : null;
    const upCount   = valid.filter(r => (Number(r.change_pct) || 0) > 0).length;
    const downCount = valid.filter(r => (Number(r.change_pct) || 0) < 0).length;
    const avgCls    = avgPct === null ? '' : avgPct > 0 ? 'gain' : avgPct < 0 ? 'loss' : '';
    const avgStr    = avgPct !== null
      ? `<span class="ph-avg ${avgCls}">${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%</span>` : '';

    let html = `
    <div class="ph-nav">
      <button class="btn ghost small" id="ph-nav-prev" ${!prevDate ? 'disabled' : ''}>‹ 前一天</button>
      <span class="ph-nav-date">${cur}</span>
      <button class="btn ghost small" id="ph-nav-next" ${!nextDate ? 'disabled' : ''}>後一天 ›</button>
      ${!isLatest ? `<button class="btn ghost small ph-nav-latest" id="ph-nav-latest">最新</button>` : ''}
    </div>
    <div class="ph-nav-summary">
      <span>${rows.length}&thinsp;檔</span>
      ${avgStr ? `<span>均&thinsp;${avgStr}</span>` : ''}
      <span class="muted">↑${upCount}&thinsp;↓${downCount}</span>
      <button type="button" class="btn ghost small ph-day-chart-btn" data-date="${cur}">📊</button>
    </div>
    <div class="ph-day-chart-wrap hidden" id="ph-dchart-${cur}"><canvas></canvas></div>
    <div class="table-wrap"><table class="ph-table">
      <thead><tr>
        <th>代號</th><th>名稱</th><th>收盤價</th><th>漲跌</th><th>漲跌幅</th>
      </tr></thead><tbody>`;

    for (const r of rows) {
      const close   = Number(r.close_price) || 0;
      const chg     = Number(r.change_amt)  || 0;
      const pct     = Number(r.change_pct)  || 0;
      const hasPrev = (Number(r.prev_close) || 0) > 0;
      const cls     = !hasPrev ? '' : chg > 0 ? 'gain' : chg < 0 ? 'loss' : '';
      const chgStr  = !hasPrev ? '—' : (chg >= 0 ? '+' : '') + chg.toFixed(2);
      const pctStr  = !hasPrev ? '—' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      html += `<tr>
        <td><button class="ph-sym-btn" data-sym="${escapeHtml(r.symbol || '')}">${escapeHtml(r.symbol || '')}</button></td>
        <td class="muted small">${escapeHtml(r.name || '')}</td>
        <td>${close > 0 ? close.toFixed(2) : '—'}</td>
        <td class="${cls}">${chgStr}</td>
        <td class="${cls} ph-pct">${pctStr}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    list.innerHTML = html;

    // 導航按鈕事件
    const prevBtn   = document.getElementById('ph-nav-prev');
    const nextBtn   = document.getElementById('ph-nav-next');
    const latestBtn = document.getElementById('ph-nav-latest');
    if (prevBtn && prevDate)  prevBtn.onclick  = () => { list._phDate = prevDate;   renderPriceHistoryByDate(list, history, search); };
    if (nextBtn && nextDate)  nextBtn.onclick  = () => { list._phDate = nextDate;   renderPriceHistoryByDate(list, history, search); };
    if (latestBtn)            latestBtn.onclick = () => { list._phDate = latestDate; renderPriceHistoryByDate(list, history, search); };
  }

  // 統計模式：按代號聚合期初→期末漲跌
  function renderPriceHistoryStat(list, history, dateFrom, dateTo) {
    const bySymbol = {};
    history.forEach(r => {
      const sym = String(r.symbol || '');
      if (!sym) return;
      if (!bySymbol[sym]) bySymbol[sym] = { name: '', entries: [] };
      bySymbol[sym].entries.push(r);
      if (r.name && !bySymbol[sym].name) bySymbol[sym].name = r.name;
    });

    const rows = [];
    for (const [sym, data] of Object.entries(bySymbol)) {
      const sorted     = data.entries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const first      = sorted[0];
      const last       = sorted[sorted.length - 1];
      const startPrice = Number(first.close_price) || 0;
      const endPrice   = Number(last.close_price)  || 0;
      const chg        = startPrice > 0 ? +(endPrice - startPrice).toFixed(2) : 0;
      const chgPct     = startPrice > 0 ? +((chg / startPrice) * 100).toFixed(2) : 0;
      rows.push({ sym, name: data.name, startPrice, endPrice, chg, chgPct, days: sorted.length });
    }
    rows.sort((a, b) => a.chgPct - b.chgPct);  // 跌最多 → 漲最多

    const rangeLabel = (dateFrom || dateTo)
      ? `${dateFrom || '…'} ～ ${dateTo || '…'}`
      : '全部資料';

    let html = `<div class="ph-group">
      <div class="ph-date">統計區間：${escapeHtml(rangeLabel)}（共 ${rows.length} 檔）</div>
      <div class="table-wrap"><table class="ph-table">
        <thead><tr>
          <th>代號</th><th>名稱</th><th>期初</th><th>期末</th><th>漲跌</th><th>漲跌幅</th>
        </tr></thead><tbody>`;

    for (const r of rows) {
      const cls    = r.chg > 0 ? 'gain' : r.chg < 0 ? 'loss' : '';
      const chgStr = r.startPrice > 0 ? (r.chg >= 0 ? '+' : '') + r.chg.toFixed(2) : '—';
      const pctStr = r.startPrice > 0 ? (r.chgPct >= 0 ? '+' : '') + r.chgPct.toFixed(2) + '%' : '—';
      html += `<tr>
        <td><strong>${escapeHtml(r.sym)}</strong></td>
        <td class="muted small">${escapeHtml(r.name)}</td>
        <td>${r.startPrice > 0 ? r.startPrice.toFixed(2) : '—'}</td>
        <td>${r.endPrice > 0 ? r.endPrice.toFixed(2) : '—'}</td>
        <td class="${cls}">${chgStr}</td>
        <td class="${cls} ph-pct">${pctStr}</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
    list.innerHTML = html;
  }

  // 切換每日漲跌幅橫條圖
  function toggleDayChart(date) {
    if (!window.Chart) return;
    const wrap   = $(`#ph-dchart-${date}`);
    if (!wrap) return;
    const isOpen = !wrap.classList.contains('hidden');

    // 關閉全部已開著的
    $$('.ph-day-chart-wrap:not(.hidden)').forEach(w => w.classList.add('hidden'));
    if (_charts.dayBar) { _charts.dayBar.destroy(); _charts.dayBar = null; }
    if (isOpen) return;  // 原本開著 → 只關閉

    wrap.classList.remove('hidden');
    const rows = (STATE.data.price_history || [])
      .filter(r => String(r.date || '').slice(0, 10) === date && (Number(r.prev_close) || 0) > 0)
      .sort((a, b) => (Number(a.change_pct) || 0) - (Number(b.change_pct) || 0));
    if (rows.length === 0) { wrap.classList.add('hidden'); return; }

    const css    = getComputedStyle(document.documentElement);
    const up     = css.getPropertyValue('--up').trim()    || '#ef4444';   // 台股習慣:紅漲綠跌
    const down   = css.getPropertyValue('--down').trim()  || '#22c55e';
    const muted  = css.getPropertyValue('--muted').trim()  || '#94a3b8';
    const border = css.getPropertyValue('--border').trim() || 'rgba(0,0,0,.08)';

    const labels = rows.map(r => r.symbol);
    const values = rows.map(r => +(Number(r.change_pct) || 0).toFixed(2));
    const colors = values.map(v => v > 0 ? up : v < 0 ? down : muted);

    _charts.dayBar = new Chart(wrap.querySelector('canvas'), {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw.toFixed(2) + '%' } }
        },
        scales: {
          y: {
            ticks: { color: muted, callback: v => v.toFixed(1) + '%' },
            grid:  { color: border }
          },
          x: { ticks: { color: muted }, grid: { display: false } }
        }
      }
    });
  }

  // 個股收盤價走勢折線圖
  function openSymbolChart(sym) {
    if (!window.Chart) return;
    const rows = (STATE.data.price_history || [])
      .filter(r => String(r.symbol || '') === sym && (Number(r.close_price) || 0) > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (rows.length === 0) { showToast('沒有足夠的歷史資料'); return; }

    const name = (rows.find(r => r.name) || {}).name || '';
    $('#ph-chart-title').textContent = sym + (name ? '  ' + name : '');

    const css    = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#3b82f6';
    const muted  = css.getPropertyValue('--muted').trim()  || '#94a3b8';
    const border = css.getPropertyValue('--border').trim() || 'rgba(0,0,0,.08)';

    if (_charts.priceDetail) { _charts.priceDetail.destroy(); }
    _charts.priceDetail = new Chart($('#chart-price-detail'), {
      type: 'line',
      data: {
        labels: rows.map(r => String(r.date || '').slice(0, 10)),
        datasets: [{
          data: rows.map(r => Number(r.close_price) || null),
          borderColor: accent,
          backgroundColor: accent + '20',
          fill: true, tension: 0.35,
          pointRadius: rows.length > 30 ? 2 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: accent,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => '收盤 ' + (ctx.raw !== null ? ctx.raw.toFixed(2) : '—') } }
        },
        scales: {
          y: {
            ticks: { color: muted, callback: v => v.toFixed(0) },
            grid:  { color: border }
          },
          x: {
            ticks: { color: muted, maxTicksLimit: 8, maxRotation: 30 },
            grid:  { display: false }
          }
        }
      }
    });
    $('#modal-price-chart').classList.remove('hidden');
  }

