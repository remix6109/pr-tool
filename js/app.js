/* === 購買記錄 — 主邏輯 === */
(function() {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const HISTORY_PAGE_SIZE = 15;

  const KEY = CONFIG.STORAGE_KEYS;
  let STATE = { data: null, currentTab: 'purchases', defaultPerson: '黃', editing: null, historyDetailsOpen: false, historyLimit: HISTORY_PAGE_SIZE };

  // ============== Utils ==============

  const fmt = {
    money: (n) => {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return Math.round(n).toLocaleString('en-US');
    },
    moneySigned: (n) => (n >= 0 ? '+' : '') + fmt.money(n),
    pct: (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%',
    date: (s) => {
      if (!s) return '';
      const d = String(s).slice(0, 10);
      return d;
    }
  };

  async function sha256(s) {
    const buf = new TextEncoder().encode(s);
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function showActionToast(msg, actionLabel, actionFn, durationMs) {
    const el = $('#toast');
    el.textContent = '';  // 清掉舊內容(包括之前可能殘留的按鈕)
    const span = document.createElement('span');
    span.textContent = msg;
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = actionLabel;
    el.appendChild(span);
    el.appendChild(btn);
    el.classList.remove('hidden');
    clearTimeout(el._t);
    let used = false;
    btn.onclick = () => {
      if (used) return;
      used = true;
      el.classList.add('hidden');
      el.textContent = '';
      try { actionFn(); } catch (_) {}
    };
    el._t = setTimeout(() => {
      el.classList.add('hidden');
      el.textContent = '';
    }, durationMs || 6000);
  }

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.add('hidden'));
    $('#' + id).classList.remove('hidden');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============== Person labels ==============

  function readPersonLabels() {
    try { return JSON.parse(localStorage.getItem(KEY.personLabels) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function getPersonLabel(key) {
    if (!key) return '';
    const stored = readPersonLabels();
    return stored[key] || key;
  }
  function setPersonLabel(key, label) {
    const stored = readPersonLabels();
    if (!label || label === key) delete stored[key];
    else stored[key] = label;
    localStorage.setItem(KEY.personLabels, JSON.stringify(stored));
  }
  function applyPersonLabels() {
    // 更新靜態 HTML 元素(topbar chips、modal 內人員選擇按鈕)
    CONFIG.PEOPLE.forEach(p => {
      const label = getPersonLabel(p);
      $$(`.chip[data-person="${p}"]`).forEach(el => el.textContent = label);
      $$(`[data-pick][data-val="${p}"]`).forEach(el => el.textContent = label);
    });
  }
  function renderPersonLabelEditor() {
    const wrap = $('#person-labels');
    if (!wrap) return;
    const cls = (i) => i === 0 ? 'huang' : 'su';
    wrap.innerHTML = CONFIG.PEOPLE.map((p, i) => {
      const cur = getPersonLabel(p);
      const val = (cur === p) ? '' : cur;
      return `<label class="person-label-row">
        <span class="dot ${cls(i)}"></span>
        <span class="label-key">${escapeHtml(p)}</span>
        <span class="label-arrow">→</span>
        <input type="text" data-person="${escapeHtml(p)}" value="${escapeHtml(val)}" placeholder="${escapeHtml(p)}" maxlength="12" />
      </label>`;
    }).join('');
    let timer = null;
    $$('#person-labels input').forEach(input => {
      input.oninput = () => {
        const key = input.dataset.person;
        setPersonLabel(key, input.value.trim());
        applyPersonLabels();
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (STATE.data) {
            renderDashboard();
            if ($('#page-history').classList.contains('active')) renderHistory();
          }
        }, 200);
      };
    });
  }

  // ============== Theme + Palette ==============

  function getCurrentPalette() {
    const id = localStorage.getItem(KEY.palette) || window.THEMES_DEFAULT_ID;
    return (window.THEMES || []).find(p => p.id === id) || window.THEMES[0];
  }

  function applyPalette(id, opts) {
    opts = opts || {};
    const palette = (window.THEMES || []).find(p => p.id === id) || window.THEMES[0];
    if (!palette) return;
    const lightVars = Object.entries(palette.light).map(([k, v]) => `${k}:${v};`).join('');
    const darkVars  = Object.entries(palette.dark ).map(([k, v]) => `${k}:${v};`).join('');
    let style = document.getElementById('theme-vars');
    if (!style) {
      style = document.createElement('style');
      style.id = 'theme-vars';
      document.head.appendChild(style);
    }
    style.textContent = `:root{${lightVars}} [data-theme="dark"]{${darkVars}}`;
    STATE.chartColors = palette.chart;
    STATE.paletteId   = palette.id;
    localStorage.setItem(KEY.palette, palette.id);
    // 同步 PWA 標題列顏色
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      meta.setAttribute('content', isDark ? palette.metaDark : palette.metaLight);
    }
    if (opts.rerender !== false && STATE.data) {
      renderAll();
      if ($('#page-history') && $('#page-history').classList.contains('active')) renderHistory();
    }
  }

  function applyTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else              document.documentElement.removeAttribute('data-theme');
    const btn = $('#btn-theme');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    const palette = getCurrentPalette();
    if (meta) meta.setAttribute('content', t === 'dark' ? palette.metaDark : palette.metaLight);
  }

  function getInitialTheme() {
    const saved = localStorage.getItem(KEY.theme);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function bindThemeToggle() {
    $('#btn-theme').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY.theme, next);
      applyTheme(next);
    };
  }

  function renderPalettePicker() {
    const wrap = $('#palette-picker');
    if (!wrap) return;
    const cur = STATE.paletteId || getCurrentPalette().id;
    wrap.innerHTML = (window.THEMES || []).map(p => `
      <button class="palette-swatch ${p.id === cur ? 'active' : ''}" data-palette="${p.id}">
        <div class="swatch-row">
          ${p.swatch.map(c => `<span style="background:${c}"></span>`).join('')}
        </div>
        <div class="swatch-name">${p.name}</div>
      </button>
    `).join('');
    $$('#palette-picker .palette-swatch').forEach(b => {
      b.onclick = () => {
        applyPalette(b.dataset.palette);
        renderPalettePicker();
      };
    });
  }

  // ============== Auth flow ==============

  async function bootAuth() {
    applyPalette(localStorage.getItem(KEY.palette) || window.THEMES_DEFAULT_ID, { rerender: false });
    applyTheme(getInitialTheme());
    const apiUrl = localStorage.getItem(KEY.apiUrl);
    const pinHash = localStorage.getItem(KEY.pinHash);
    if (!apiUrl || !pinHash) {
      bindSetup();
      showScreen('screen-setup');
      return;
    }
    const sessionUntil = Number(localStorage.getItem(KEY.sessionUntil) || 0);
    if (sessionUntil > Date.now()) {
      enterApp();
      return;
    }
    bindLock();
    showScreen('screen-lock');
    setTimeout(() => $('#pin-input').focus(), 50);
  }

  function bindSetup() {
    $('#setup-save').onclick = async () => {
      const url = $('#setup-api').value.trim();
      const pin = $('#setup-pin').value.trim();
      const pin2 = $('#setup-pin2').value.trim();
      const err = $('#setup-err');
      err.textContent = '';
      if (!url.startsWith('https://')) { err.textContent = 'API URL 必須以 https:// 開頭'; return; }
      if (!/^\d{4,8}$/.test(pin))     { err.textContent = 'PIN 必須是 4–8 位數字'; return; }
      if (pin !== pin2)                { err.textContent = '兩次輸入的 PIN 不一致'; return; }
      localStorage.setItem(KEY.apiUrl, url);
      localStorage.setItem(KEY.pinHash, await sha256(pin));
      localStorage.setItem(KEY.sessionUntil, String(Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000));
      enterApp();
    };
  }

  function bindLock() {
    const submit = async () => {
      const pin = $('#pin-input').value.trim();
      const err = $('#pin-err');
      err.textContent = '';
      if (!pin) { err.textContent = '請輸入 PIN'; return; }
      const stored = localStorage.getItem(KEY.pinHash);
      const got = await sha256(pin);
      if (got !== stored) { err.textContent = 'PIN 錯誤'; return; }
      localStorage.setItem(KEY.sessionUntil, String(Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000));
      enterApp();
    };
    $('#pin-submit').onclick = submit;
    $('#pin-input').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    $('#pin-reset').onclick = () => {
      if (confirm('確認要重設嗎?系統會清除本機的 API URL 與 PIN(資料還在你們的 Google 試算表)。')) {
        localStorage.removeItem(KEY.apiUrl);
        localStorage.removeItem(KEY.pinHash);
        localStorage.removeItem(KEY.sessionUntil);
        location.reload();
      }
    };
  }

  // ============== App ==============

  async function enterApp() {
    showScreen('screen-app');
    STATE.historyDetailsOpen = localStorage.getItem(KEY.historyDetailsOpen) === '1';
    applyPersonLabels();
    bindThemeToggle();
    bindNav();
    bindPersonSwitcher();
    bindAddButtons();
    bindForms();
    bindUpdatePriceForm();
    bindGoalForm();
    bindSymbolManagement();
    bindSettings();
    bindHistory();
    await loadAndRender();
  }

  function bindNav() {
    $$('.nav-btn').forEach(btn => {
      btn.onclick = () => {
        const page = btn.dataset.page;
        $$('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
        $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
        if (page === 'history') renderHistory();
      };
    });
  }

  function bindPersonSwitcher() {
    const savedPerson = localStorage.getItem(KEY.defaultPerson) || '黃';
    STATE.defaultPerson = savedPerson;
    const refresh = () => {
      $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.person === STATE.defaultPerson));
    };
    refresh();
    $$('.chip').forEach(c => c.onclick = () => {
      STATE.defaultPerson = c.dataset.person;
      localStorage.setItem(KEY.defaultPerson, STATE.defaultPerson);
      refresh();
      if (!STATE.data) return;
      renderDashboard();
      if ($('#page-history').classList.contains('active')) renderHistory();
    });
  }

  // ============== 載入資料 ==============

  async function loadAndRender() {
    $('#home-loading').classList.remove('hidden');
    $('#home-content').classList.add('hidden');
    try {
      // 先用快取的資料快速顯示
      const cached = localStorage.getItem(KEY.cache);
      if (cached) {
        try {
          STATE.data = JSON.parse(cached);
          renderAll();
          $('#home-loading').classList.add('hidden');
          $('#home-content').classList.remove('hidden');
        } catch (_) {}
      }
      // 再背景拉新資料
      const data = await API.getAll();
      STATE.data = data;
      localStorage.setItem(KEY.cache, JSON.stringify(data));
      renderAll();
      $('#home-loading').classList.add('hidden');
      $('#home-content').classList.remove('hidden');
    } catch (e) {
      $('#home-loading').textContent = '載入失敗:' + e.message;
    }
  }

  function renderAll() {
    populateSymbolDropdown();
    populateYearMonthDropdown();
    renderDashboard();
  }

  // ============== Dashboard ==============

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
    elPeople.innerHTML = `
      <div class="person-card ${cls} solo">
        <div class="name">${escapeHtml(getPersonLabel(p))}</div>
        <div class="stat"><span class="label">總張數</span><span class="val">${fmt.money(s.totalShares)}</span></div>
        <div class="stat"><span class="label">總本金</span><span class="val">${fmt.money(s.totalCost)}</span></div>
        <div class="stat"><span class="label">總市值</span><span class="val">${fmt.money(s.marketValue)} <small class="${gainCls}">(${fmt.moneySigned(gain)} / ${fmt.pct(gainPct)})</small></span></div>
        <div class="stat"><span class="label">預估年配息</span><span class="val">${fmt.money(s.annualYield)}</span></div>
        <div class="stat"><span class="label">銀行餘額</span><span class="val">${fmt.money(s.bankBalance)}</span></div>
      </div>
    `;

    renderHoldings(p);
    renderPayoutCalendar(p);
    renderHoldingsChart(p);
    renderSavingsProgress(stats);
  }

  // 圖表實例(用以重複渲染時銷毀舊的)
  const _charts = {};

  function renderHoldingsChart(personFilter) {
    const canvas = $('#chart-holdings');
    if (!canvas || !window.Chart) return;
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const agg = {};
    (STATE.data.purchases || []).forEach(r => {
      if (personFilter && r.person !== personFilter) return;
      if (!r.symbol) return;
      if (!agg[r.symbol]) agg[r.symbol] = 0;
      agg[r.symbol] += (Number(r.shares) || 0) * 1000 * (Number((symMap[r.symbol] || {}).current_price) || 0);
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
      options: {
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
    if (tab === 'purchases') {
      // 月份累計購買金額
      const byMonth = {};
      raw.forEach(r => {
        const m = String(r.date || '').slice(0, 7);
        if (!m) return;
        byMonth[m] = (byMonth[m] || 0) + (Number(r.amount) || 0);
      });
      const months = Object.keys(byMonth).sort();
      if (months.length === 0) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');
      $('#history-chart-title').textContent = '每月購買金額';
      if (_charts.history) _charts.history.destroy();
      _charts.history = new Chart(canvas, {
        type: 'bar',
        data: { labels: months, datasets: [{ label: '本金', data: months.map(m => byMonth[m]), backgroundColor: getCssVar('--primary') }] },
        options: chartBarOptions()
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
      out[p].totalShares += shares;
      out[p].totalCost   += amount;
      const sym = symMap[r.symbol];
      if (sym) {
        const y = Number(sym.annual_yield_per_share) || 0;
        const cur = Number(sym.current_price) || 0;
        out[p].annualYield  += y   * shares * 1000;  // 1 張 = 1000 股
        out[p].marketValue  += cur * shares * 1000;
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

  function renderHoldings(personFilter) {
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const agg = {};
    (STATE.data.purchases || []).forEach(r => {
      const k = r.symbol;
      if (!k) return;
      if (personFilter && r.person !== personFilter) return;
      if (!agg[k]) agg[k] = { shares: 0, amount: 0 };
      agg[k].shares += Number(r.shares) || 0;
      agg[k].amount += Number(r.amount) || 0;
    });
    const tbody = $('#holdings-table tbody');
    const rows = Object.keys(agg).sort().map(sym => {
      const a = agg[sym];
      const totalUnits = a.shares * 1000;
      const avgPrice = totalUnits > 0 ? a.amount / totalUnits : 0;
      const cur = Number((symMap[sym] || {}).current_price) || 0;
      const gain = cur > 0 ? (cur - avgPrice) * totalUnits : 0;
      const gainCls = gain >= 0 ? 'gain' : 'loss';
      const gainTxt = cur > 0 ? `${fmt.moneySigned(gain)} <small>(${fmt.pct((cur - avgPrice) / avgPrice * 100)})</small>` : '—';
      return `<tr data-sym="${sym}">
        <td>${sym}</td>
        <td>${fmt.money(a.shares)}</td>
        <td>${avgPrice.toFixed(2)}</td>
        <td class="price">${cur > 0 ? cur.toFixed(2) : '—'}</td>
        <td class="${gainCls}">${gainTxt}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows || `<tr><td colspan="5" class="muted">尚無持股資料</td></tr>`;

    $('#btn-update-prices').onclick = updatePricesFlow;
    const refreshBtn = $('#btn-refresh-prices');
    if (refreshBtn) refreshBtn.onclick = refreshPricesFlow;
  }

  async function refreshPricesFlow() {
    const btn = $('#btn-refresh-prices');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 抓取中…';
    showToast('正在從 Google 抓現價(約 5 秒)…');
    try {
      await API.refreshPrices();
      await loadAndRender();
      showToast('✅ 現價已更新');
    } catch (e) {
      alert('更新失敗:' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function updatePricesFlow() {
    const person = STATE.defaultPerson;
    const heldSet = new Set();
    (STATE.data.purchases || []).forEach(r => {
      if (person && r.person !== person) return;
      const shares = Number(r.shares) || 0;
      if (shares > 0) heldSet.add(r.symbol);
    });
    const symbols = (STATE.data.symbols || []).filter(s => heldSet.has(s.symbol));
    if (symbols.length === 0) { showToast(`${person} 目前沒有持股`); return; }
    const sel = $('#price-symbol');
    sel.innerHTML = symbols.map(s => `<option value="${s.symbol}">${s.symbol}</option>`).join('');
    const refreshCurrent = () => {
      const target = symbols.find(s => s.symbol === sel.value);
      $('#price-current').value = target ? Number(target.current_price || 0).toFixed(2) : '';
      $('#price-new').value = '';
    };
    sel.onchange = refreshCurrent;
    refreshCurrent();
    openModal('modal-update-price');
    setTimeout(() => $('#price-new').focus(), 100);
  }

  function bindUpdatePriceForm() {
    $('#price-submit').onclick = async () => {
      const sym = $('#price-symbol').value;
      const n = Number($('#price-new').value);
      if (!sym) { alert('請選代號'); return; }
      if (isNaN(n) || n <= 0) { alert('請輸入正確的價格'); return; }
      try {
        await API.updateSymbol({ symbol: sym, current_price: n });
        const target = (STATE.data.symbols || []).find(s => s.symbol === sym);
        if (target) target.current_price = n;
        localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        closeAllModals();
        renderDashboard();
        showToast('已更新 ' + sym);
      } catch (e) { alert('更新失敗:' + e.message); }
    };
  }

  function renderPayoutCalendar(personFilter) {
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const shareMap = {};
    (STATE.data.purchases || []).forEach(r => {
      if (personFilter && r.person !== personFilter) return;
      if (!shareMap[r.symbol]) shareMap[r.symbol] = 0;
      shareMap[r.symbol] += Number(r.shares) || 0;
    });
    const months = [0, 1, 2].map(off => ((curMonth - 1 + off) % 12) + 1);
    const html = months.map(m => {
      const list = [];
      let sum = 0;
      Object.keys(symMap).forEach(sym => {
        const s = symMap[sym];
        // 配息月份 +1 (除息月→實際入帳月,例如 1.4.7.10月 配息實際在 2.5.8.11 月入帳)
        const ms = String(s.months || '').split(',')
          .map(x => Number(x.trim()))
          .filter(Boolean)
          .map(x => (x % 12) + 1);
        if (ms.includes(m)) {
          const shares = shareMap[sym] || 0;
          if (shares <= 0) return;
          const yPerShare = Number(s.annual_yield_per_share) || 0;
          const perPay = ms.length > 0 ? (yPerShare / ms.length) * shares * 1000 : 0;
          sum += perPay;
          list.push(sym);
        }
      });
      const isThis = m === curMonth ? ' (本月)' : '';
      return `<div class="payout-month">
        <div class="month-label">${m} 月${isThis}</div>
        <div class="symbols">${list.length ? list.join(', ') : '—'}</div>
        <div class="amount">${list.length ? fmt.money(sum) : ''}</div>
      </div>`;
    }).join('');
    $('#payout-calendar').innerHTML = html;
  }

  function renderSavingsProgress(stats) {
    const meta = STATE.data.meta || {};
    const titleEl = $('#savings-title');
    if (titleEl) titleEl.textContent = meta.savings_title || CONFIG.TITLE_DEFAULT;
    const goal = Number(meta.savings_goal) || CONFIG.GOAL_DEFAULT;
    const startStr = meta.plan_start || CONFIG.PLAN_START_DEFAULT;
    const endStr   = meta.plan_end   || CONFIG.PLAN_END_DEFAULT;
    const huangCur = stats['黃'].savings;
    const suCur = stats['蘇'].savings;
    const total = huangCur + suCur;
    const moneyPct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
    const huangPct = goal > 0 ? (huangCur / goal) * 100 : 0;
    const suPct    = goal > 0 ? (suCur    / goal) * 100 : 0;

    // 時間進度
    const start = new Date(startStr + 'T00:00:00');
    const end   = new Date(endStr   + 'T23:59:59');
    const now   = new Date();
    const totalMs   = end - start;
    const elapsedMs = Math.max(0, Math.min(totalMs, now - start));
    const timePct   = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
    const monthsTotal = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    const monthsElapsed = Math.max(0, Math.min(monthsTotal,
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1));
    const expectedSaved = goal * (timePct / 100);
    const diff = total - expectedSaved;
    const diffPct = moneyPct - timePct;

    let cmpHtml = '';
    if (timePct > 0 && timePct < 100) {
      const cls = diff >= 0 ? 'gain' : 'loss';
      const label = diff >= 0 ? '✅ 領先進度' : '⚠️ 落後進度';
      cmpHtml = `<div class="cmp-line ${cls}">
        ${label} ${fmt.moneySigned(diff)} (${fmt.pct(diffPct)})
      </div>`;
    }

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

        <div class="prog-block">
          <div class="prog-head"><span class="prog-label">時間進度</span>
            <span class="num">已過 ${monthsElapsed} / ${monthsTotal} 個月 (${timePct.toFixed(1)}%)</span>
          </div>
          <div class="bar">
            <div class="seg time" style="width:${Math.min(100, timePct)}%"></div>
          </div>
          <div class="legend muted">
            ${startStr} → ${endStr}
          </div>
        </div>

        ${cmpHtml}
      </div>
    `;
    const btn = $('#btn-edit-goal');
    if (btn) btn.onclick = editGoalFlow;
  }

  function editGoalFlow() {
    const meta = STATE.data.meta || {};
    $('#goal-title').value  = meta.savings_title || CONFIG.TITLE_DEFAULT;
    $('#goal-amount').value = Number(meta.savings_goal) || CONFIG.GOAL_DEFAULT;
    $('#goal-start').value  = meta.plan_start || CONFIG.PLAN_START_DEFAULT;
    $('#goal-end').value    = meta.plan_end   || CONFIG.PLAN_END_DEFAULT;
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
      const n = Number($('#goal-amount').value);
      const start = $('#goal-start').value;
      const end   = $('#goal-end').value;
      if (isNaN(n) || n <= 0) { alert('請輸入正確的目標金額'); return; }
      if (!start || !end) { alert('請選擇起始與結束日'); return; }
      if (start >= end)   { alert('起始日必須早於結束日'); return; }
      try {
        await API.setMeta('savings_title', title);
        await API.setMeta('savings_goal', n);
        await API.setMeta('plan_start',  start);
        await API.setMeta('plan_end',    end);
        if (!STATE.data.meta) STATE.data.meta = {};
        STATE.data.meta.savings_title = title;
        STATE.data.meta.savings_goal  = n;
        STATE.data.meta.plan_start    = start;
        STATE.data.meta.plan_end      = end;
        localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        closeAllModals();
        renderDashboard();
        showToast('已更新計劃');
      } catch (e) { alert('更新失敗:' + e.message); }
    };
  }

  // ============== Add forms ==============

  function bindAddButtons() {
    $$('[data-open]').forEach(b => {
      b.onclick = () => {
        const which = b.dataset.open;
        openModal('modal-' + which.replace('add-', ''));
        prefillForm(which);
        if (which === 'symbols') renderSymbolList();
      };
    });
    $$('[data-close]').forEach(b => b.onclick = () => closeAllModals());
    $$('.modal').forEach(m => m.addEventListener('click', e => {
      if (e.target === m) closeAllModals();
    }));

    // 在 modal 內的人員 segmented control
    $$('[data-pick]').forEach(b => {
      b.onclick = () => {
        const target = b.dataset.pick;
        const val = b.dataset.val;
        $('#' + target).value = val;
        $$(`[data-pick="${target}"]`).forEach(x => x.classList.toggle('active', x === b));
      };
    });
  }

  function openModal(id) { $('#' + id).classList.remove('hidden'); }
  function closeAllModals() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
    STATE.editing = null;
    resetModalLabels();
  }

  function prefillForm(which) {
    const today = new Date().toISOString().slice(0, 10);
    if (which === 'add-purchase') {
      $('#purchase-date').value = today;
      pickPerson('purchase-person', STATE.defaultPerson);
      $('#purchase-amount').value = '';
      $('#purchase-price').value = '';
      $('#purchase-shares').value = '';
      $('#purchase-note').value = '';
    } else if (which === 'add-bank') {
      $('#bank-date').value = today;
      pickPerson('bank-person', STATE.defaultPerson);
      $('#bank-amount').value = '';
      $('#bank-note').value = '';
    } else if (which === 'add-savings') {
      pickPerson('savings-person', STATE.defaultPerson);
      const now = new Date();
      $('#savings-year').value = String(now.getFullYear());
      $('#savings-month').value = String(now.getMonth() + 1);
      $('#savings-amount').value = '';
      $('#savings-note').value = '';
    }
  }

  function pickPerson(targetId, val) {
    $('#' + targetId).value = val;
    $$(`[data-pick="${targetId}"]`).forEach(x => x.classList.toggle('active', x.dataset.val === val));
  }

  function populateSymbolDropdown() {
    const sel = $('#purchase-symbol');
    const symbols = (STATE.data.symbols || []).map(s => s.symbol).filter(Boolean);
    sel.innerHTML = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  function populateYearMonthDropdown() {
    $('#savings-year').innerHTML = CONFIG.YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    $('#savings-month').innerHTML = Array.from({length: 12}, (_, i) => i + 1).map(m => `<option value="${m}">${m}</option>`).join('');
  }

  function bindForms() {
    $('#purchase-submit').onclick = () => {
      const data = {
        person: $('#purchase-person').value,
        symbol: $('#purchase-symbol').value,
        amount: Number($('#purchase-amount').value) || 0,
        price:  Number($('#purchase-price').value)  || 0,
        shares: Number($('#purchase-shares').value) || 0,
        date:   $('#purchase-date').value,
        note:   $('#purchase-note').value
      };
      if (!data.person) return alert('請選購買人');
      if (!data.symbol) return alert('請選代號');
      if (!data.amount || !data.shares) return alert('請輸入金額和張數');
      const editing = STATE.editing && STATE.editing.type === 'purchase' ? { ...STATE.editing } : null;
      const arr = STATE.data.purchases = STATE.data.purchases || [];
      let optimisticIdx = -1, prevSnapshot = null, tmpId = null;
      if (editing) {
        optimisticIdx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (optimisticIdx >= 0) {
          prevSnapshot = arr[optimisticIdx];
          arr[optimisticIdx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
        optimisticIdx = arr.length - 1;
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : '已新增購買');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addPurchase({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };

    $('#bank-submit').onclick = () => {
      const data = {
        person: $('#bank-person').value,
        type:   $('#bank-type').value,
        amount: Number($('#bank-amount').value) || 0,
        date:   $('#bank-date').value,
        note:   $('#bank-note').value
      };
      if (!data.person) return alert('請選人');
      if (!data.amount) return alert('請輸入金額');
      const editing = STATE.editing && STATE.editing.type === 'bank' ? { ...STATE.editing } : null;
      const arr = STATE.data.bank = STATE.data.bank || [];
      let prevSnapshot = null, tmpId = null;
      if (editing) {
        const idx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (idx >= 0) {
          prevSnapshot = arr[idx];
          arr[idx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : '已新增收支');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addBank({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };

    $('#savings-submit').onclick = () => {
      const data = {
        person: $('#savings-person').value,
        year:   Number($('#savings-year').value),
        month:  Number($('#savings-month').value),
        amount: Number($('#savings-amount').value) || 0,
        note:   $('#savings-note').value
      };
      if (!data.person) return alert('請選人');
      if (!data.amount) return alert('請輸入金額');
      const editing = STATE.editing && STATE.editing.type === 'savings' ? { ...STATE.editing } : null;
      const arr = STATE.data.savings = STATE.data.savings || [];
      let prevSnapshot = null, tmpId = null;
      if (editing) {
        const idx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (idx >= 0) {
          prevSnapshot = arr[idx];
          arr[idx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : '已新增月存');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addSavings({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };
  }

  // ============== History ==============

  async function undoDelete(sheet, removed) {
    if (!confirm('確認要復原此筆嗎?')) return;
    const key = sheet === '_purchases' ? 'purchases' : sheet === '_bank' ? 'bank' : 'savings';
    // 拿掉舊 id / created_at,讓後端產生新的
    const cleaned = { ...removed };
    delete cleaned.id;
    delete cleaned.created_at;

    const arr = STATE.data[key] = STATE.data[key] || [];
    const tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    arr.push({ id: tmpId, ...cleaned, created_at: new Date().toISOString() });
    renderAll();
    if ($('#page-history').classList.contains('active')) renderHistory();
    showToast('已復原');

    try {
      let res;
      if      (sheet === '_purchases') res = await API.addPurchase(cleaned);
      else if (sheet === '_bank')      res = await API.addBank(cleaned);
      else if (sheet === '_savings')   res = await API.addSavings(cleaned);
      const i = arr.findIndex(r => r.id === tmpId);
      if (i >= 0 && res && res.id) arr[i] = { ...arr[i], id: res.id };
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
    } catch (e) {
      const i = arr.findIndex(r => r.id === tmpId);
      if (i >= 0) arr.splice(i, 1);
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      alert('復原失敗:' + e.message + '\n建議按「重新載入」同步');
    }
  }

  function bindHistory() {
    $$('#page-history .seg-btn').forEach(b => {
      b.onclick = () => {
        $$('#page-history .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        STATE.currentTab = b.dataset.tab;
        STATE.historyLimit = HISTORY_PAGE_SIZE;  // 切 tab 時重置分頁
        $('#filter-category').value = '';  // 切 tab 時重置分類
        $('#filter-year').value     = '';  // 與年度
        renderHistory();
      };
    });
    let searchTimer = null;
    $('#filter-search').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderHistory, 200);
    };
    $('#filter-category').onchange = renderHistory;
    $('#filter-year').onchange     = renderHistory;
  }

  function populateYearFilter(tab, raw) {
    const sel = $('#filter-year');
    if (tab !== 'purchases' && tab !== 'bank') {
      sel.classList.add('hidden');
      sel.value = '';
      return;
    }
    sel.classList.remove('hidden');
    const cur = sel.value;
    const years = [...new Set(raw.map(r => String(r.date || '').slice(0, 4)).filter(Boolean))].sort();
    sel.innerHTML = `<option value="">全部年份</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (years.includes(cur)) sel.value = cur;
  }

  function populateCategoryFilter(tab, raw) {
    const sel = $('#filter-category');
    const cur = sel.value;
    let label = '全部', options = [];
    if (tab === 'purchases') {
      label = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'bank') {
      label = '全部類型';
      options = [...new Set(raw.map(r => r.type).filter(Boolean))].sort();
    } else if (tab === 'savings') {
      label = '全部年份';
      options = [...new Set(raw.map(r => String(r.year)).filter(Boolean))].sort();
    }
    sel.innerHTML = `<option value="">${label}</option>` + options.map(o => `<option value="${o}">${o}</option>`).join('');
    if (options.includes(cur)) sel.value = cur;
  }

  function renderHistory() {
    if (!STATE.data) return;
    const tab = STATE.currentTab;
    const personFilter = STATE.defaultPerson;
    const search = $('#filter-search').value.trim().toLowerCase();

    // 先抓「已套用人員篩選」的原始資料(供統計、圖表、分類下拉用)
    let raw = [];
    if (tab === 'purchases')   raw = (STATE.data.purchases || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'bank')   raw = (STATE.data.bank || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'savings')raw = (STATE.data.savings || []).filter(r => !personFilter || r.person === personFilter);

    populateCategoryFilter(tab, raw);
    populateYearFilter(tab, raw);
    const category = $('#filter-category').value;
    const year     = $('#filter-year').value;

    // 統計與圖表用「未套用分類篩選」的資料(不變)
    renderHistorySummary(tab, raw, personFilter);
    renderHistoryChart(tab, raw);

    // 列表才套用分類篩選
    if (category) {
      if (tab === 'purchases')   raw = raw.filter(r => r.symbol === category);
      else if (tab === 'bank')   raw = raw.filter(r => r.type === category);
      else if (tab === 'savings')raw = raw.filter(r => String(r.year) === category);
    }
    if (year && (tab === 'purchases' || tab === 'bank')) {
      raw = raw.filter(r => String(r.date || '').slice(0, 4) === year);
    }

    // 列表(再套搜尋)
    let rows = [];
    if (tab === 'purchases') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_purchases', person: r.person,
        title: `${r.symbol} × ${r.shares} 張`,
        sub: `${fmt.date(r.date)} · 均價 ${Number(r.price).toFixed(2)}${r.note ? ' · ' + r.note : ''}`,
        amount: -Number(r.amount),
        searchText: `${r.symbol} ${r.note || ''}`.toLowerCase()
      }));
    } else if (tab === 'bank') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_bank', person: r.person,
        title: r.type,
        sub: `${fmt.date(r.date)}${r.note ? ' · ' + r.note : ''}`,
        amount: (String(r.type).startsWith('支出') ? -1 : 1) * Number(r.amount),
        searchText: `${r.type} ${r.note || ''}`.toLowerCase()
      }));
    } else if (tab === 'savings') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_savings', person: r.person,
        title: `${r.year} 年 ${r.month} 月`,
        sub: r.note || '月存',
        amount: Number(r.amount),
        searchText: `${r.year}/${r.month} ${r.note || ''}`.toLowerCase()
      }));
    }
    if (search) rows = rows.filter(r => r.searchText.includes(search));

    const list = $('#history-list');
    const totalRows = rows.length;
    const limit = STATE.historyLimit || HISTORY_PAGE_SIZE;
    const truncated = totalRows > limit;
    const visibleRows = truncated ? rows.slice(0, limit) : rows;
    if (totalRows === 0) {
      list.innerHTML = `<div class="empty">沒有資料</div>`;
    } else {
      const itemsHtml = visibleRows.map(r => {
        const cls = r.amount >= 0 ? 'pos' : 'neg';
        const personCls = r.person === '黃' ? 'huang' : 'su';
        return `<div class="list-item">
          <div class="badge ${personCls}">${escapeHtml(getPersonLabel(r.person)) || '?'}</div>
          <div class="main">
            <div class="row1">${r.title}</div>
            <div class="row2">${r.sub}</div>
          </div>
          <div class="right">
            <div class="amount ${cls}">${fmt.moneySigned(r.amount)}</div>
            <div class="row-actions">
              <button class="edit-btn"   data-edit-sheet="${r.sheet}" data-edit-id="${r.id}" title="編輯">✏️</button>
              <button class="delete-btn" data-del-sheet="${r.sheet}"  data-del-id="${r.id}"  title="刪除">🗑</button>
            </div>
          </div>
        </div>`;
      }).join('');
      const moreHtml = truncated
        ? `<button class="btn ghost wide load-more-btn" id="load-more-history">顯示更多(還有 ${totalRows - limit} 筆)</button>`
        : '';
      list.innerHTML = itemsHtml + moreHtml;
    }
    const moreBtn = $('#load-more-history');
    if (moreBtn) {
      moreBtn.onclick = () => {
        STATE.historyLimit = Infinity;
        renderHistory();
      };
    }

    $$('.delete-btn').forEach(b => b.onclick = () => {
      if (!confirm('確定要刪除這筆?')) return;
      const sheet = b.dataset.delSheet;
      const id = b.dataset.delId;
      const key = sheet === '_purchases' ? 'purchases' : sheet === '_bank' ? 'bank' : 'savings';
      const arr = STATE.data[key] = STATE.data[key] || [];
      const idx = arr.findIndex(r => String(r.id) === String(id));
      if (idx < 0) return;
      const removed = arr[idx];
      arr.splice(idx, 1);
      renderAll();
      renderHistory();
      showActionToast('已刪除', '復原', () => undoDelete(sheet, removed), 6000);
      (async () => {
        try {
          await API.deleteRecord(sheet, id);
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          // 雲端刪除失敗:還原本地、收掉 undo toast(已沒意義)
          const t = $('#toast');
          t.classList.add('hidden');
          t.textContent = '';
          arr.splice(idx, 0, removed);
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          renderHistory();
          alert('刪除失敗:' + e.message + '\n已還原此筆,建議按「重新載入」同步');
        }
      })();
    });

    $$('.edit-btn').forEach(b => b.onclick = () => {
      openEditModal(b.dataset.editSheet, b.dataset.editId);
    });
  }

  function openEditModal(sheet, id) {
    const find = (arr) => (arr || []).find(r => String(r.id) === String(id));
    if (sheet === '_purchases') {
      const r = find(STATE.data.purchases);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'purchase' };
      pickPerson('purchase-person', r.person);
      // 確保下拉選單有此代號
      const sel = $('#purchase-symbol');
      if (![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol;
      $('#purchase-amount').value = r.amount;
      $('#purchase-price').value  = r.price;
      $('#purchase-shares').value = r.shares;
      $('#purchase-date').value   = String(r.date || '').slice(0, 10);
      $('#purchase-note').value   = r.note || '';
      $('#modal-purchase h2').textContent = '編輯 ETF 購買';
      $('#purchase-submit').textContent = '儲存修改';
      openModal('modal-purchase');
    } else if (sheet === '_bank') {
      const r = find(STATE.data.bank);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'bank' };
      pickPerson('bank-person', r.person);
      $('#bank-type').value   = r.type;
      $('#bank-amount').value = r.amount;
      $('#bank-date').value   = String(r.date || '').slice(0, 10);
      $('#bank-note').value   = r.note || '';
      $('#modal-bank h2').textContent = '編輯銀行收支';
      $('#bank-submit').textContent = '儲存修改';
      openModal('modal-bank');
    } else if (sheet === '_savings') {
      const r = find(STATE.data.savings);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'savings' };
      pickPerson('savings-person', r.person);
      $('#savings-year').value   = r.year;
      $('#savings-month').value  = r.month;
      $('#savings-amount').value = r.amount;
      $('#savings-note').value   = r.note || '';
      $('#modal-savings h2').textContent = '編輯月存記錄';
      $('#savings-submit').textContent = '儲存修改';
      openModal('modal-savings');
    }
  }

  function resetModalLabels() {
    $('#modal-purchase h2').textContent = '新增 ETF 購買';
    $('#purchase-submit').textContent   = '儲存';
    $('#modal-bank h2').textContent     = '新增銀行收支';
    $('#bank-submit').textContent       = '儲存';
    $('#modal-savings h2').textContent  = '新增月存記錄';
    $('#savings-submit').textContent    = '儲存';
  }

  function renderHistorySummary(tab, raw, person) {
    const wrap = $('#history-summary');
    if (raw.length === 0) { wrap.innerHTML = ''; return; }
    const personLabel = person ? getPersonLabel(person) : '全部';
    let cards = '', breakdown = '';

    if (tab === 'purchases') {
      const totalShares = raw.reduce((s, r) => s + (Number(r.shares) || 0), 0);
      const totalCost   = raw.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const avgPrice    = totalShares > 0 ? totalCost / (totalShares * 1000) : 0;
      cards = `
        <div class="stat-card"><div class="lbl">筆數</div><div class="val">${raw.length}</div></div>
        <div class="stat-card"><div class="lbl">總張數</div><div class="val">${fmt.money(totalShares)}</div></div>
        <div class="stat-card"><div class="lbl">總本金</div><div class="val">${fmt.money(totalCost)}</div></div>
        <div class="stat-card"><div class="lbl">均單價</div><div class="val">${avgPrice.toFixed(2)}</div></div>
      `;
      const bySym = {};
      raw.forEach(r => {
        const k = r.symbol || '?';
        if (!bySym[k]) bySym[k] = { shares: 0, cost: 0, count: 0 };
        bySym[k].shares += Number(r.shares) || 0;
        bySym[k].cost   += Number(r.amount) || 0;
        bySym[k].count  += 1;
      });
      const rows = Object.keys(bySym).sort().map(k => {
        const a = bySym[k];
        const ap = a.shares > 0 ? a.cost / (a.shares * 1000) : 0;
        return `<tr><td>${k}</td><td>${a.count}</td><td>${fmt.money(a.shares)}</td><td>${fmt.money(a.cost)}</td><td>${ap.toFixed(2)}</td></tr>`;
      }).join('');
      const byYear = {};
      raw.forEach(r => {
        const y = String(r.date || '').slice(0, 4) || '?';
        if (!byYear[y]) byYear[y] = { count: 0, shares: 0, cost: 0 };
        byYear[y].count  += 1;
        byYear[y].shares += Number(r.shares) || 0;
        byYear[y].cost   += Number(r.amount) || 0;
      });
      const yearRows = Object.keys(byYear).sort().map(y => {
        const a = byYear[y];
        return `<tr><td>${y}</td><td>${a.count}</td><td>${fmt.money(a.shares)}</td><td>${fmt.money(a.cost)}</td></tr>`;
      }).join('');

      // 樞紐: 代號 × 年(顯示本金)
      const pivot = {}; const yearSet = new Set();
      raw.forEach(r => {
        const sym = r.symbol || '?';
        const y = String(r.date || '').slice(0, 4) || '?';
        yearSet.add(y);
        if (!pivot[sym]) pivot[sym] = {};
        if (!pivot[sym][y]) pivot[sym][y] = 0;
        pivot[sym][y] += Number(r.amount) || 0;
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
          <thead><tr><th>代號</th><th>筆數</th><th>張數</th><th>本金</th><th>均價</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="breakdown-title">分年度統計</div>
        <div class="table-wrap"><table>
          <thead><tr><th>年</th><th>筆數</th><th>張數</th><th>本金</th></tr></thead>
          <tbody>${yearRows}</tbody>
        </table></div>
        <div class="breakdown-title">各代號 × 年度 本金</div>
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

  // ============== Settings ==============

  function bindSettings() {
    $('#btn-settings').onclick = () => {
      renderPalettePicker();
      renderPersonLabelEditor();
      openModal('modal-settings');
    };

    $('#btn-refresh').onclick = async () => {
      closeAllModals();
      await loadAndRender();
      showToast('已重新載入');
    };

    $('#btn-change-pin').onclick = async () => {
      const newPin = prompt('輸入新 PIN(4–8 位數字):');
      if (!newPin) return;
      if (!/^\d{4,8}$/.test(newPin)) { alert('PIN 必須是 4–8 位數字'); return; }
      localStorage.setItem(KEY.pinHash, await sha256(newPin));
      showToast('PIN 已更新');
    };

    $('#btn-change-api').onclick = () => {
      const cur = localStorage.getItem(KEY.apiUrl) || '';
      const next = prompt('輸入新的 API URL:', cur);
      if (!next) return;
      if (!next.startsWith('https://')) { alert('必須以 https:// 開頭'); return; }
      localStorage.setItem(KEY.apiUrl, next.trim());
      showToast('API URL 已更新');
      loadAndRender();
    };

    $('#btn-export').onclick = () => {
      if (!STATE.data) return;
      const blob = new Blob([JSON.stringify(STATE.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `購買記錄_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    $('#btn-logout').onclick = () => {
      if (!confirm('確定要登出?系統會清除本機所有設定(資料還在試算表)。')) return;
      Object.values(KEY).forEach(k => localStorage.removeItem(k));
      location.reload();
    };
  }

  // ============== Init ==============

  document.addEventListener('DOMContentLoaded', bootAuth);
})();
