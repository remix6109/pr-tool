/* 配息行事曆、5 年計劃進度、標的與目標管理 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // 手動設定的估算(標的設定裡的配息月份 / 年配息):只在沒有證交所歷史資料時當備援
  function manualPayoutAmount(s, payMonth, shares) {
    if (!s || shares <= 0) return null;
    // 配息月份 +1 (除息月→實際入帳月,例如 1.4.7.10月 配息實際在 2.5.8.11 月入帳)
    const ms = String(s.months || '').split(',').map(x => Number(x.trim())).filter(Boolean).map(x => (x % 12) + 1);
    if (!ms.includes(payMonth)) return null;
    return ((Number(s.annual_yield_per_share) || 0) / ms.length) * shares;
  }

  const PAYOUT_TAGS = { paid: '已入帳', ex: '已除息', est: '預估', manual: '手動' };

  function renderPayoutCalendar(personFilter) {
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const persons = personFilter ? [personFilter] : CONFIG.PEOPLE.slice();
    const now = new Date();
    const hasHistory = Array.isArray(_exDiv.list);
    const pad = n => String(n).padStart(2, '0');

    const html = [0, 1, 2].map(off => {
      const first = new Date(now.getFullYear(), now.getMonth() + off, 1);
      const last  = new Date(now.getFullYear(), now.getMonth() + off + 1, 0);
      const m = first.getMonth() + 1;
      const rangeStart = autodivYmd(first), rangeEnd = autodivYmd(last);

      const items = [];                       // { symbol, kind, amount, detail }
      persons.forEach(p => {
        const open = computeOpenHoldings(p);
        let covered = new Set();
        if (hasHistory) {
          const r = computePayoutEvents(p, rangeStart, rangeEnd);
          r.events.forEach(e => items.push({
            symbol: e.symbol, kind: e.kind, amount: e.amount,
            detail: `${e.symbol} ${PAYOUT_TAGS[e.kind]} · ${e.exDate.slice(5).replace('-', '/')} 除息 · ${fmt.money(e.shares)} 股 × ${e.perShare}`
          }));
          covered = new Set(Object.keys(open).filter(sym => !r.missing.includes(sym)));
        }
        // 沒有歷史資料的代號(或歷史還沒載入):改用手動設定
        Object.keys(open).forEach(sym => {
          if (covered.has(sym)) return;
          const amt = manualPayoutAmount(symMap[sym], m, open[sym].shares);
          if (amt !== null) items.push({ symbol: sym, kind: 'manual', amount: amt, detail: `${sym} 手動設定估算(標的設定的配息月份與年配息)` });
        });
      });

      // 同代號合併(多人時)
      const bySym = {};
      items.forEach(it => {
        const k = it.symbol + '|' + it.kind;
        if (!bySym[k]) bySym[k] = { symbol: it.symbol, kind: it.kind, amount: 0 };
        bySym[k].amount += it.amount;
      });
      const chips = Object.values(bySym).sort((a, b) => a.symbol < b.symbol ? -1 : 1);
      const sum = chips.reduce((t, c) => t + c.amount, 0);
      const isThis = off === 0 ? ' (本月)' : '';
      return `<div class="payout-month">
        <div class="month-label">${m} 月${isThis}</div>
        <div class="symbols">${chips.length ? chips.map(c => `<span class="pc pc-${c.kind}">${escapeHtml(c.symbol)}<small>${PAYOUT_TAGS[c.kind]}</small></span>`).join(' ') : '—'}</div>
        <div class="amount">${chips.length ? fmt.money(sum) : ''}</div>
        ${items.length ? `<div class="pc-detail">${items.map(it => escapeHtml(it.detail) + '・' + fmt.money(it.amount)).join('<br>')}</div>` : ''}
      </div>`;
    }).join('');
    $('#payout-calendar').innerHTML = html;
  }

  // 把 meta 裡的日期值轉成 Date(吃 YYYY-MM-DD 與 ISO 兩種格式)
  function parsePlanDate(v, isEnd) {
    if (!v) return null;
    const s = String(v);
    let d;
    if (s.indexOf('T') >= 0 || s.indexOf('Z') >= 0) {
      d = new Date(s);
    } else {
      d = new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00'));
    }
    return isNaN(d.getTime()) ? null : d;
  }
  // 把 Date 格式化成 YYYY-MM-DD(本地時區)
  function formatYMD(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 計算時間進度(輸入起訖日字串,可為 YYYY-MM-DD 或 ISO)
  function computeTimeProgress(startStr, endStr) {
    const start = parsePlanDate(startStr, false);
    const end   = parsePlanDate(endStr,   true);
    if (!start || !end) {
      return { pct: 0, monthsTotal: 0, monthsElapsed: 0, startStr: '', endStr: '' };
    }
    const now   = new Date();
    const totalMs   = end - start;
    const elapsedMs = Math.max(0, Math.min(totalMs, now - start));
    const pct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
    const monthsTotal = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    const monthsElapsed = Math.max(0, Math.min(monthsTotal,
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1));
    return {
      pct,
      monthsTotal,
      monthsElapsed,
      startStr: formatYMD(start),
      endStr:   formatYMD(end)
    };
  }

  function renderSavingsProgress(stats) {
    const meta = STATE.data.meta || {};
    const titleEl = $('#savings-title');
    if (titleEl) titleEl.textContent = meta.savings_title || CONFIG.TITLE_DEFAULT;
    const goal = Number(meta.savings_goal) || CONFIG.GOAL_DEFAULT;
    const marketGoal = Number(meta.market_goal) || CONFIG.MARKET_GOAL_DEFAULT;
    const huangCur = stats['黃'].savings;
    const suCur = stats['蘇'].savings;
    const total = huangCur + suCur;
    const moneyPct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
    const huangPct = goal > 0 ? (huangCur / goal) * 100 : 0;
    const suPct    = goal > 0 ? (suCur    / goal) * 100 : 0;

    // 總市值進度
    const huangMv = stats['黃'].marketValue;
    const suMv    = stats['蘇'].marketValue;
    const totalMv = huangMv + suMv;
    const mvPct      = marketGoal > 0 ? Math.min(100, (totalMv / marketGoal) * 100) : 0;
    const mvHuangPct = marketGoal > 0 ? (huangMv / marketGoal) * 100 : 0;
    const mvSuPct    = marketGoal > 0 ? (suMv    / marketGoal) * 100 : 0;

    // 兩套獨立的時間進度
    const savTime = computeTimeProgress(
      meta.plan_start || CONFIG.PLAN_START_DEFAULT,
      meta.plan_end   || CONFIG.PLAN_END_DEFAULT
    );
    const mvTime = computeTimeProgress(
      meta.market_plan_start || meta.plan_start || CONFIG.PLAN_START_DEFAULT,
      meta.market_plan_end   || meta.plan_end   || CONFIG.PLAN_END_DEFAULT
    );
    const expectedSaved = goal * (savTime.pct / 100);
    const diff = total - expectedSaved;
    const diffPct = moneyPct - savTime.pct;

    // 領先/落後比較,使用對應的時間進度
    const buildCmp = (curPct, expectedDiff, time) => {
      if (time.pct <= 0 || time.pct >= 100) return '';
      const cls = expectedDiff >= 0 ? 'gain' : 'loss';
      const label = expectedDiff >= 0 ? '✅ 領先進度' : '⚠️ 落後進度';
      return `<div class="cmp-line ${cls}">
        ${label} ${fmt.moneySigned(expectedDiff)} (${fmt.pct(curPct - time.pct)})
      </div>`;
    };
    // 達成預測:依當前每月增量速度線性外推
    // 注意:用 pct 換算有效已過月數,與 buildCmp 的 expectedSaved 基準一致,避免矛盾
    const buildEta = (current, target, time) => {
      if (target <= 0 || time.pct <= 0 || time.monthsTotal <= 0) return '';
      if (current >= target) {
        return `<div class="eta-line">🎯 已達標</div>`;
      }
      const monthsElapsedEff = time.monthsTotal * (time.pct / 100); // 與 buildCmp 同基準
      const pace = current / monthsElapsedEff;         // 平均每月增量(NT$)
      if (pace <= 0) return '';
      const monthsNeeded = (target - current) / pace;  // 達標還需多少個月
      const totalMonths  = monthsElapsedEff + monthsNeeded;
      const diff = time.monthsTotal - totalMonths;     // > 0 = 提前;< 0 = 落後
      const cls = diff >= 0 ? 'gain' : 'loss';
      const tag = diff >= 0
        ? `提前 ${diff.toFixed(1)} 個月達標`
        : `落後 ${Math.abs(diff).toFixed(1)} 個月`;
      return `<div class="eta-line ${cls}">
        🔮 依目前速度推算 ${monthsNeeded.toFixed(1)} 個月後達標 · ${tag}
      </div>`;
    };
    const savingsCmpHtml = buildCmp(moneyPct, total - expectedSaved, savTime);
    const savingsEtaHtml = buildEta(total,   goal,       savTime);
    const expectedMv = marketGoal * (mvTime.pct / 100);
    const marketCmpHtml  = buildCmp(mvPct, totalMv - expectedMv, mvTime);
    const marketEtaHtml  = buildEta(totalMv, marketGoal, mvTime);

    const buildTimeBar = (time) => `
      <div class="prog-block">
        <div class="prog-head"><span class="prog-label">時間進度</span>
          <span class="num">已過 ${time.monthsElapsed} / ${time.monthsTotal} 個月 (${time.pct.toFixed(1)}%)</span>
        </div>
        <div class="bar">
          <div class="seg time" style="width:${Math.min(100, time.pct)}%"></div>
        </div>
        <div class="legend muted">
          ${time.startStr} → ${time.endStr}
        </div>
      </div>
    `;

    $('#savings-progress').innerHTML = `
      <div class="savings-shared">
        <div class="prog-block">
          <div class="prog-head"><span class="prog-label">存入進度</span>
            <span class="num">${fmt.money(total)} / ${fmt.money(goal)} (${moneyPct.toFixed(1)}%)</span>
          </div>
          <div class="bar stacked">
            <div class="seg huang" style="width:${huangPct}%" title="黃 ${fmt.money(huangCur)}"></div>
            <div class="seg su"    style="width:${suPct}%"    title="蘇 ${fmt.money(suCur)}"></div>
          </div>
          <div class="legend">
            <span class="dot huang"></span>黃 ${fmt.money(huangCur)}
            <span class="dot su"></span>蘇 ${fmt.money(suCur)}
          </div>
        </div>
        ${buildTimeBar(savTime)}
        ${savingsCmpHtml}
        ${savingsEtaHtml}

        <div class="prog-divider"></div>

        <div class="prog-block">
          <div class="prog-head"><span class="prog-label">總市值進度</span>
            <span class="num">${fmt.money(totalMv)} / ${fmt.money(marketGoal)} (${mvPct.toFixed(1)}%)</span>
          </div>
          <div class="bar stacked">
            <div class="seg huang" style="width:${mvHuangPct}%" title="黃 ${fmt.money(huangMv)}"></div>
            <div class="seg su"    style="width:${mvSuPct}%"    title="蘇 ${fmt.money(suMv)}"></div>
          </div>
          <div class="legend">
            <span class="dot huang"></span>黃 ${fmt.money(huangMv)}
            <span class="dot su"></span>蘇 ${fmt.money(suMv)}
          </div>
        </div>
        ${buildTimeBar(mvTime)}
        ${marketCmpHtml}
        ${marketEtaHtml}
      </div>
    `;
    const btn = $('#btn-edit-goal');
    if (btn) btn.onclick = editGoalFlow;
  }

  function editGoalFlow() {
    const meta = STATE.data.meta || {};
    // 把 meta 裡可能是 ISO 的日期值轉成 YYYY-MM-DD 給 <input type="date"> 用
    const toYMD = (v, fallback) => {
      const d = parsePlanDate(v, false);
      return d ? formatYMD(d) : fallback;
    };
    $('#goal-title').value         = meta.savings_title || CONFIG.TITLE_DEFAULT;
    $('#goal-amount').value        = Number(meta.savings_goal) || CONFIG.GOAL_DEFAULT;
    $('#goal-market').value        = Number(meta.market_goal)  || CONFIG.MARKET_GOAL_DEFAULT;
    $('#goal-start').value         = toYMD(meta.plan_start, CONFIG.PLAN_START_DEFAULT);
    $('#goal-end').value           = toYMD(meta.plan_end,   CONFIG.PLAN_END_DEFAULT);
    // 總市值計劃預設沿用存入計劃的起訖日(可獨立調整)
    $('#goal-market-start').value  = toYMD(meta.market_plan_start || meta.plan_start, CONFIG.PLAN_START_DEFAULT);
    $('#goal-market-end').value    = toYMD(meta.market_plan_end   || meta.plan_end,   CONFIG.PLAN_END_DEFAULT);
    openModal('modal-goal');
    setTimeout(() => $('#goal-title').focus(), 100);
  }

  function inferFreq(months) {
    const ms = String(months || '').split(',').map(x => Number(x.trim())).filter(n => n >= 1 && n <= 12);
    if (ms.length === 12) return '月配';
    if (ms.length === 4)  return '季配';
    if (ms.length === 1)  return '年配';
    if (ms.length > 0)    return '其他';
    return '不定';
  }

  function renderSymbolList() {
    const list = $('#sym-list');
    const symbols = (STATE.data.symbols || []).slice().sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    if (symbols.length === 0) {
      list.innerHTML = `<div class="empty">尚未建立任何代號</div>`;
      return;
    }
    list.innerHTML = symbols.map(s => {
      const months = s.months ? String(s.months) : '—';
      const price  = Number(s.current_price) || 0;
      const ypp    = Number(s.annual_yield_per_share) || 0;
      return `<div class="sym-item" data-sym="${s.symbol}">
        <div class="sym-row">
          <div class="sym-code">${s.symbol}</div>
          <div class="sym-actions">
            <button class="btn ghost small" data-act="edit" data-sym="${s.symbol}">編輯</button>
            <button class="btn ghost small" data-act="del"  data-sym="${s.symbol}">🗑</button>
          </div>
        </div>
        <div class="sym-meta">
          <span>${s.freq || inferFreq(s.months)}</span>
          <span>除息月: ${months}</span>
          <span>現價: ${price ? price.toFixed(2) : '—'}</span>
          <span>年配/股: ${ypp ? ypp.toFixed(2) : '—'}</span>
        </div>
      </div>`;
    }).join('');

    $$('#sym-list [data-act="del"]').forEach(b => b.onclick = async () => {
      const sym = b.dataset.sym;
      if (!confirm(`確定要刪除代號 ${sym}?\n(已存在的購買記錄不會一起刪除)`)) return;
      try {
        await API.deleteRecord('_symbols', sym);
        STATE.data.symbols = (STATE.data.symbols || []).filter(s => s.symbol !== sym);
        localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        renderSymbolList();
        renderDashboard();
        showToast(`已刪除 ${sym}`);
      } catch (e) { alert('刪除失敗:' + e.message); }
    });

    $$('#sym-list [data-act="edit"]').forEach(b => b.onclick = () => {
      const sym = b.dataset.sym;
      const target = (STATE.data.symbols || []).find(s => s.symbol === sym);
      if (!target) return;
      $('#sym-code').value   = target.symbol;
      $('#sym-code').readOnly = true;  // 編輯時 code 不可改
      $('#sym-months').value = target.months || '';
      syncMonthsPreset();
      $('#sym-price').value  = target.current_price || '';
      $('#sym-yield').value  = target.annual_yield_per_share || '';
      $('#sym-add-submit').textContent = '儲存修改';
      $('#sym-code').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function resetSymbolForm() {
    $('#sym-code').value = '';
    $('#sym-code').readOnly = false;
    $('#sym-months').value = '';
    $('#sym-months-preset').value = '';
    $('#sym-price').value = '';
    $('#sym-yield').value = '';
    $('#sym-add-submit').textContent = '儲存代號';
  }

  function syncMonthsPreset() {
    // 依照目前 sym-months 的內容,自動把 preset 下拉選到對應選項(若無則選自訂)
    const sel = $('#sym-months-preset');
    const current = $('#sym-months').value.trim();
    const match = [...sel.options].find(o => o.value === current && o.value !== '__custom__');
    sel.value = match ? match.value : (current ? '__custom__' : '');
  }

  function bindSymbolManagement() {
    $('#sym-months-preset').onchange = () => {
      const v = $('#sym-months-preset').value;
      if (v === '__custom__') {
        $('#sym-months').focus();
        return;
      }
      $('#sym-months').value = v;
    };

    $('#sym-add-submit').onclick = async () => {
      const code = $('#sym-code').value.trim();
      if (!code) return alert('請輸入代號');
      const months = $('#sym-months').value.trim();
      const price = Number($('#sym-price').value) || 0;
      const ypp   = Number($('#sym-yield').value) || 0;
      const ms = months.split(',').map(x => Number(x.trim())).filter(n => n >= 1 && n <= 12);
      const data = {
        symbol: code, name: '', freq: inferFreq(months), months: ms.join(','),
        current_price: price, annual_yield_per_share: ypp
      };
      try {
        await API.updateSymbol(data);
        STATE.data.symbols = STATE.data.symbols || [];
        const idx = STATE.data.symbols.findIndex(s => s.symbol === code);
        if (idx >= 0) STATE.data.symbols[idx] = { ...STATE.data.symbols[idx], ...data };
        else          STATE.data.symbols.push(data);
        localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        showToast(`已儲存 ${code}`);
        resetSymbolForm();
        renderSymbolList();
        renderDashboard();
      } catch (e) { alert('儲存失敗:' + e.message); }
    };
  }

  function bindGoalForm() {
    $('#goal-submit').onclick = async () => {
      const title = $('#goal-title').value.trim() || CONFIG.TITLE_DEFAULT;
      const n  = Number($('#goal-amount').value);
      const mn = Number($('#goal-market').value);
      const start  = $('#goal-start').value;
      const end    = $('#goal-end').value;
      const mStart = $('#goal-market-start').value;
      const mEnd   = $('#goal-market-end').value;
      if (isNaN(n)  || n  <= 0) { alert('請輸入正確的存入目標金額'); return; }
      if (isNaN(mn) || mn <= 0) { alert('請輸入正確的總市值目標'); return; }
      if (!start  || !end)  { alert('請選擇存入計劃的起始與結束日'); return; }
      if (!mStart || !mEnd) { alert('請選擇總市值計劃的起始與結束日'); return; }
      if (start  >= end)    { alert('存入計劃起始日必須早於結束日'); return; }
      if (mStart >= mEnd)   { alert('總市值計劃起始日必須早於結束日'); return; }
      try {
        await API.setMeta('savings_title',     title);
        await API.setMeta('savings_goal',      n);
        await API.setMeta('market_goal',       mn);
        await API.setMeta('plan_start',        start);
        await API.setMeta('plan_end',          end);
        await API.setMeta('market_plan_start', mStart);
        await API.setMeta('market_plan_end',   mEnd);
        if (!STATE.data.meta) STATE.data.meta = {};
        STATE.data.meta.savings_title     = title;
        STATE.data.meta.savings_goal      = n;
        STATE.data.meta.market_goal       = mn;
        STATE.data.meta.plan_start        = start;
        STATE.data.meta.plan_end          = end;
        STATE.data.meta.market_plan_start = mStart;
        STATE.data.meta.market_plan_end   = mEnd;
        localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        closeAllModals();
        renderDashboard();
        showToast('已更新計劃');
      } catch (e) { alert('更新失敗:' + e.message); }
    };
  }

