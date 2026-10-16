/* 歷史統計摘要 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  function renderHistorySummary(tab, raw, person) {
    const wrap = $('#history-summary');
    if (raw.length === 0) { wrap.innerHTML = ''; return; }
    const personLabel = person ? getPersonLabel(person) : '全部';
    let cards = '', breakdown = '';

    if (tab === 'purchases') {
      const totalShares = raw.reduce((s, r) => s + (Number(r.shares) || 0), 0);
      const totalCost   = raw.reduce((s, r) => s + (Number(r.amount) || 0) + (Number(r.fee) || 0), 0);
      const avgPrice    = totalShares > 0 ? totalCost / totalShares : 0;
      cards = `
        <div class="stat-card"><div class="lbl">筆數</div><div class="val">${raw.length}</div></div>
        <div class="stat-card"><div class="lbl">總股數</div><div class="val">${fmt.money(totalShares)}</div></div>
        <div class="stat-card"><div class="lbl">總本金</div><div class="val">${fmt.money(totalCost)}</div></div>
        <div class="stat-card"><div class="lbl">均單價</div><div class="val">${avgPrice.toFixed(2)}</div></div>
      `;
      const bySym = {};
      raw.forEach(r => {
        const k = r.symbol || '?';
        if (!bySym[k]) bySym[k] = { shares: 0, cost: 0, count: 0 };
        bySym[k].shares += Number(r.shares) || 0;
        bySym[k].cost   += (Number(r.amount) || 0) + (Number(r.fee) || 0);
        bySym[k].count  += 1;
      });
      const rows = Object.keys(bySym).sort().map(k => {
        const a = bySym[k];
        const ap = a.shares > 0 ? a.cost / a.shares : 0;
        return `<tr><td>${k}</td><td>${a.count}</td><td>${fmt.money(a.shares)}</td><td>${fmt.money(a.cost)}</td><td>${ap.toFixed(2)}</td></tr>`;
      }).join('');
      const byYear = {};
      raw.forEach(r => {
        const y = String(r.date || '').slice(0, 4) || '?';
        if (!byYear[y]) byYear[y] = { count: 0, shares: 0, cost: 0 };
        byYear[y].count  += 1;
        byYear[y].shares += Number(r.shares) || 0;
        byYear[y].cost   += (Number(r.amount) || 0) + (Number(r.fee) || 0);
      });
      const yearRows = Object.keys(byYear).sort().map(y => {
        const a = byYear[y];
        return `<tr><td>${y}</td><td>${a.count}</td><td>${fmt.money(a.shares)}</td><td>${fmt.money(a.cost)}</td></tr>`;
      }).join('');

      // 樞紐: 代號 × 年(顯示本金 + 手續費)
      const pivot = {}; const yearSet = new Set();
      raw.forEach(r => {
        const sym = r.symbol || '?';
        const y = String(r.date || '').slice(0, 4) || '?';
        yearSet.add(y);
        if (!pivot[sym]) pivot[sym] = {};
        if (!pivot[sym][y]) pivot[sym][y] = 0;
        pivot[sym][y] += (Number(r.amount) || 0) + (Number(r.fee) || 0);
      });
      const yearList = Array.from(yearSet).sort();
      const pivotHead = `<tr><th>代號</th>${yearList.map(y => `<th>${y}</th>`).join('')}<th>合計</th></tr>`;
      const pivotRows = Object.keys(pivot).sort().map(sym => {
        let typeTot = 0;
        const cells = yearList.map(y => {
          const v = pivot[sym][y];
          if (!v) return '<td>—</td>';
          typeTot += v;
          return `<td>${fmt.money(v)}</td>`;
        }).join('');
        return `<tr><td>${sym}</td>${cells}<td><b>${fmt.money(typeTot)}</b></td></tr>`;
      }).join('');

      breakdown = `<div class="breakdown-title">分代號統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>代號</th><th>筆數</th><th>股數</th><th>本金</th><th>均價</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="breakdown-title">分年度統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>年</th><th>筆數</th><th>股數</th><th>本金</th></tr></thead>
          <tbody>${yearRows}</tbody>
        </table></div>
        <div class="breakdown-title">各代號 × 年度 本金</div>
        <div class="table-wrap"><table>
          <thead>${pivotHead}</thead>
          <tbody>${pivotRows}</tbody>
        </table></div>`;
    }

    else if (tab === 'dividends') {
      const total = raw.reduce((s, r) => s + (Number(r.total) || 0), 0);
      const avg   = raw.length > 0 ? total / raw.length : 0;
      const max   = raw.reduce((m, r) => Math.max(m, Number(r.total) || 0), 0);
      cards = `
        <div class="stat-card"><div class="lbl">筆數</div><div class="val">${raw.length}</div></div>
        <div class="stat-card"><div class="lbl">累計</div><div class="val gain">+${fmt.money(total)}</div></div>
        <div class="stat-card"><div class="lbl">平均</div><div class="val">${fmt.money(avg)}</div></div>
        <div class="stat-card"><div class="lbl">最高單筆</div><div class="val">${fmt.money(max)}</div></div>
      `;
      // 分代號統計
      const bySym = {};
      raw.forEach(r => {
        const k = r.symbol || '?';
        if (!bySym[k]) bySym[k] = { count: 0, total: 0 };
        bySym[k].count += 1;
        bySym[k].total += Number(r.total) || 0;
      });
      const symRows = Object.keys(bySym).sort().map(k => {
        const a = bySym[k];
        return `<tr><td>${k}</td><td>${a.count}</td><td class="gain">+${fmt.money(a.total)}</td></tr>`;
      }).join('');
      // 分年度統計
      const byYear = {};
      raw.forEach(r => {
        const y = String(r.date || '').slice(0, 4) || '?';
        if (!byYear[y]) byYear[y] = { count: 0, total: 0 };
        byYear[y].count += 1;
        byYear[y].total += Number(r.total) || 0;
      });
      const yearRows = Object.keys(byYear).sort().map(y => {
        const a = byYear[y];
        return `<tr><td>${y}</td><td>${a.count}</td><td class="gain">+${fmt.money(a.total)}</td></tr>`;
      }).join('');
      // 樞紐: 代號 × 年
      const pivot = {}; const yearSet = new Set();
      raw.forEach(r => {
        const sym = r.symbol || '?';
        const y = String(r.date || '').slice(0, 4) || '?';
        yearSet.add(y);
        if (!pivot[sym]) pivot[sym] = {};
        if (!pivot[sym][y]) pivot[sym][y] = 0;
        pivot[sym][y] += Number(r.total) || 0;
      });
      const yearList = Array.from(yearSet).sort();
      const pivotHead = `<tr><th>代號</th>${yearList.map(y => `<th>${y}</th>`).join('')}<th>合計</th></tr>`;
      const pivotRows = Object.keys(pivot).sort().map(sym => {
        let symTot = 0;
        const cells = yearList.map(y => {
          const v = pivot[sym][y];
          if (!v) return '<td>—</td>';
          symTot += v;
          return `<td class="gain">+${fmt.money(v)}</td>`;
        }).join('');
        return `<tr><td>${sym}</td>${cells}<td class="gain"><b>+${fmt.money(symTot)}</b></td></tr>`;
      }).join('');
      breakdown = `<div class="breakdown-title">分代號統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>代號</th><th>筆數</th><th>金額</th></tr></thead>
          <tbody>${symRows}</tbody>
        </table></div>
        <div class="breakdown-title">分年度統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>年</th><th>筆數</th><th>金額</th></tr></thead>
          <tbody>${yearRows}</tbody>
        </table></div>
        <div class="breakdown-title">各代號 × 年度</div>
        <div class="table-wrap"><table>
          <thead>${pivotHead}</thead>
          <tbody>${pivotRows}</tbody>
        </table></div>`;
    }

    else if (tab === 'bank') {
      let income = 0, expense = 0;
      raw.forEach(r => {
        const a = Number(r.amount) || 0;
        if (String(r.type).startsWith('支出')) expense += a;
        else income += a;
      });
      const net = income - expense;
      cards = `
        <div class="stat-card"><div class="lbl">筆數</div><div class="val">${raw.length}</div></div>
        <div class="stat-card"><div class="lbl">收入</div><div class="val gain">+${fmt.money(income)}</div></div>
        <div class="stat-card"><div class="lbl">支出</div><div class="val loss">-${fmt.money(expense)}</div></div>
        <div class="stat-card"><div class="lbl">餘額</div><div class="val">${fmt.money(net)}</div></div>
      `;
      const byType = {};
      raw.forEach(r => {
        const k = r.type || '?';
        if (!byType[k]) byType[k] = { count: 0, total: 0 };
        byType[k].count += 1;
        byType[k].total += Number(r.amount) || 0;
      });
      const rows = Object.keys(byType).sort().map(k => {
        const a = byType[k];
        const cls = String(k).startsWith('支出') ? 'loss' : 'gain';
        const sign = String(k).startsWith('支出') ? '-' : '+';
        return `<tr><td>${k}</td><td>${a.count}</td><td class="${cls}">${sign}${fmt.money(a.total)}</td></tr>`;
      }).join('');
      const byYear = {};
      raw.forEach(r => {
        const y = String(r.date || '').slice(0, 4) || '?';
        if (!byYear[y]) byYear[y] = { count: 0, income: 0, expense: 0 };
        byYear[y].count += 1;
        const a = Number(r.amount) || 0;
        if (String(r.type).startsWith('支出')) byYear[y].expense += a;
        else byYear[y].income += a;
      });
      const yearRows = Object.keys(byYear).sort().map(y => {
        const a = byYear[y];
        const net = a.income - a.expense;
        return `<tr>
          <td>${y}</td><td>${a.count}</td>
          <td class="gain">+${fmt.money(a.income)}</td>
          <td class="loss">-${fmt.money(a.expense)}</td>
          <td>${fmt.money(net)}</td>
        </tr>`;
      }).join('');

      // 樞紐: 類型 × 年
      const pivot = {}; const yearSet = new Set();
      raw.forEach(r => {
        const t = r.type || '?';
        const y = String(r.date || '').slice(0, 4) || '?';
        yearSet.add(y);
        if (!pivot[t]) pivot[t] = {};
        if (!pivot[t][y]) pivot[t][y] = 0;
        pivot[t][y] += Number(r.amount) || 0;
      });
      const yearList = Array.from(yearSet).sort();
      const pivotHead = `<tr><th>類型</th>${yearList.map(y => `<th>${y}</th>`).join('')}<th>合計</th></tr>`;
      const pivotRows = Object.keys(pivot).sort().map(t => {
        const isOut = String(t).startsWith('支出');
        const cls = isOut ? 'loss' : 'gain';
        const sign = isOut ? '-' : '+';
        let typeTot = 0;
        const cells = yearList.map(y => {
          const v = pivot[t][y];
          if (!v) return '<td>—</td>';
          typeTot += v;
          return `<td class="${cls}">${sign}${fmt.money(v)}</td>`;
        }).join('');
        return `<tr><td>${t}</td>${cells}<td class="${cls}"><b>${sign}${fmt.money(typeTot)}</b></td></tr>`;
      }).join('');

      breakdown = `<div class="breakdown-title">分類型統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>類型</th><th>筆數</th><th>金額</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="breakdown-title">分年度統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>年</th><th>筆數</th><th>收入</th><th>支出</th><th>餘額</th></tr></thead>
          <tbody>${yearRows}</tbody>
        </table></div>
        <div class="breakdown-title">各類型 × 年度</div>
        <div class="table-wrap"><table>
          <thead>${pivotHead}</thead>
          <tbody>${pivotRows}</tbody>
        </table></div>`;
    }

    else if (tab === 'savings') {
      const total = raw.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const avg   = raw.length > 0 ? total / raw.length : 0;
      const max   = raw.reduce((m, r) => Math.max(m, Number(r.amount) || 0), 0);
      cards = `
        <div class="stat-card"><div class="lbl">筆數</div><div class="val">${raw.length}</div></div>
        <div class="stat-card"><div class="lbl">累計</div><div class="val">${fmt.money(total)}</div></div>
        <div class="stat-card"><div class="lbl">平均</div><div class="val">${fmt.money(avg)}</div></div>
        <div class="stat-card"><div class="lbl">最高</div><div class="val">${fmt.money(max)}</div></div>
      `;
      const byYear = {};
      raw.forEach(r => {
        const k = r.year || '?';
        if (!byYear[k]) byYear[k] = { count: 0, total: 0 };
        byYear[k].count += 1;
        byYear[k].total += Number(r.amount) || 0;
      });
      const rows = Object.keys(byYear).sort().map(k => {
        const a = byYear[k];
        return `<tr><td>${k}</td><td>${a.count}</td><td>${fmt.money(a.total)}</td></tr>`;
      }).join('');
      breakdown = `<div class="breakdown-title">分年度統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>年</th><th>筆數</th><th>金額</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
    }

    else if (tab === 'realized') {
      const totalPL = raw.reduce((s, r) => s + r.realized_pl, 0);
      const totalProceeds = raw.reduce((s, r) => s + r.proceeds, 0);
      const totalBasis    = raw.reduce((s, r) => s + r.cost_basis, 0);
      const wins  = raw.filter(r => r.realized_pl > 0).length;
      const losses = raw.filter(r => r.realized_pl < 0).length;
      const winRate = raw.length > 0 ? (wins / raw.length) * 100 : 0;
      const roiPct  = totalBasis > 0 ? (totalPL / totalBasis) * 100 : 0;
      const plCls = totalPL >= 0 ? 'gain' : 'loss';
      cards = `
        <div class="stat-card"><div class="lbl">賣出筆數</div><div class="val">${raw.length}</div></div>
        <div class="stat-card"><div class="lbl">累計實現損益</div><div class="val ${plCls}">${fmt.moneySigned(totalPL)}</div></div>
        <div class="stat-card"><div class="lbl">報酬率</div><div class="val ${plCls}">${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(2)}%</div></div>
        <div class="stat-card"><div class="lbl">勝率</div><div class="val">${winRate.toFixed(0)}% (${wins}/${raw.length})</div></div>
      `;
      // 分代號統計
      const bySym = {};
      raw.forEach(r => {
        const k = r.symbol || '?';
        if (!bySym[k]) bySym[k] = { count: 0, pl: 0, basis: 0 };
        bySym[k].count += 1;
        bySym[k].pl    += r.realized_pl;
        bySym[k].basis += r.cost_basis;
      });
      const symRows = Object.keys(bySym).sort().map(k => {
        const a = bySym[k];
        const r = a.basis > 0 ? (a.pl / a.basis) * 100 : 0;
        const cls = a.pl >= 0 ? 'gain' : 'loss';
        return `<tr><td>${k}</td><td>${a.count}</td><td class="${cls}">${fmt.moneySigned(a.pl)}</td><td class="${cls}">${r >= 0 ? '+' : ''}${r.toFixed(2)}%</td></tr>`;
      }).join('');
      // 分年度統計
      const byYear = {};
      raw.forEach(r => {
        const y = String(r.date || '').slice(0, 4) || '?';
        if (!byYear[y]) byYear[y] = { count: 0, pl: 0 };
        byYear[y].count += 1;
        byYear[y].pl    += r.realized_pl;
      });
      const yearRows = Object.keys(byYear).sort().map(y => {
        const a = byYear[y];
        const cls = a.pl >= 0 ? 'gain' : 'loss';
        return `<tr><td>${y}</td><td>${a.count}</td><td class="${cls}">${fmt.moneySigned(a.pl)}</td></tr>`;
      }).join('');
      breakdown = `<div class="breakdown-title">分代號統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>代號</th><th>筆數</th><th>實現損益</th><th>報酬率</th></tr></thead>
          <tbody>${symRows}</tbody>
        </table></div>
        <div class="breakdown-title">分年度統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>年</th><th>筆數</th><th>實現損益</th></tr></thead>
          <tbody>${yearRows}</tbody>
        </table></div>`;
    }

    const personCls = person === '黃' ? 'huang' : person === '蘇' ? 'su' : '';
    const detailsBlock = breakdown
      ? `<details class="breakdown-toggle" ${STATE.historyDetailsOpen ? 'open' : ''}>
          <summary>明細統計</summary>
          <div class="breakdown-body">${breakdown}</div>
        </details>`
      : '';
    wrap.innerHTML = `<div class="card history-summary ${personCls}">
      <div class="card-title">${escapeHtml(personLabel)} · 統計</div>
      <div class="stat-row">${cards}</div>
      ${detailsBlock}
    </div>`;
    const det = wrap.querySelector('.breakdown-toggle');
    if (det) {
      det.addEventListener('toggle', () => {
        STATE.historyDetailsOpen = det.open;
        localStorage.setItem(KEY.historyDetailsOpen, det.open ? '1' : '0');
      });
    }
  }

