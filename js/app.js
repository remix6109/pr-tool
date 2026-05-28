/* === 購買記錄 — 主邏輯 === */
(function() {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const HISTORY_PAGE_SIZE = 15;

  const KEY = CONFIG.STORAGE_KEYS;
  let STATE = { data: null, currentTab: 'purchases', defaultPerson: '黃', editing: null, historyDetailsOpen: false, historyLimit: HISTORY_PAGE_SIZE, filterCategories: [], holdingsSort: null };

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

  // 把 Date 物件格式化為「本地時區」的 yyyy-MM-dd(避免 toISOString 轉 UTC 少 1 天)
  function ymdLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  async function sha256(s) {
    const buf = new TextEncoder().encode(s);
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function showToast(msg, durationMs) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), durationMs || 1800);
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

  // ============== App title ==============

  function getAppTitle() {
    return localStorage.getItem(KEY.appTitle) || CONFIG.APP_TITLE_DEFAULT;
  }
  function setAppTitle(t) {
    const v = String(t || '').trim();
    if (!v || v === CONFIG.APP_TITLE_DEFAULT) {
      localStorage.removeItem(KEY.appTitle);
    } else {
      localStorage.setItem(KEY.appTitle, v);
    }
  }
  function applyAppTitle() {
    const title = getAppTitle();
    document.title = title;
    const el = document.querySelector('.topbar .title');
    if (el) el.textContent = title;
  }
  function renderAppTitleEditor() {
    const input = $('#app-title-input');
    if (!input) return;
    const cur = getAppTitle();
    input.value = (cur === CONFIG.APP_TITLE_DEFAULT) ? '' : cur;
    input.oninput = () => {
      setAppTitle(input.value);
      applyAppTitle();
    };
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

  // ============== Icon choice ==============

  function getCurrentIconId() {
    const id = localStorage.getItem(KEY.iconChoice) || CONFIG.ICON_DEFAULT;
    return CONFIG.ICON_CHOICES.some(i => i.id === id) ? id : CONFIG.ICON_DEFAULT;
  }

  function applyIconChoice(id) {
    if (!CONFIG.ICON_CHOICES.some(i => i.id === id)) id = CONFIG.ICON_DEFAULT;
    const iconUrl     = `icons/${id}.svg`;
    const manifestUrl = `manifest-${id}.json`;
    const setHref = (sel, href) => {
      document.querySelectorAll(sel).forEach(el => { el.href = href; });
    };
    setHref('link[rel="icon"]', iconUrl);
    setHref('link[rel="apple-touch-icon"]', iconUrl);
    setHref('link[rel="manifest"]', manifestUrl);
    localStorage.setItem(KEY.iconChoice, id);
  }

  function renderIconPicker() {
    const wrap = $('#icon-picker');
    if (!wrap) return;
    const cur = getCurrentIconId();
    wrap.innerHTML = CONFIG.ICON_CHOICES.map(c => `
      <button class="icon-swatch ${c.id === cur ? 'active' : ''}" data-icon="${c.id}" title="${escapeHtml(c.name)}">
        <img src="icons/${c.id}.svg" alt="${escapeHtml(c.name)}" />
        <div class="swatch-name">${escapeHtml(c.name)}</div>
      </button>
    `).join('');
    $$('#icon-picker .icon-swatch').forEach(b => {
      b.onclick = () => {
        applyIconChoice(b.dataset.icon);
        renderIconPicker();
      };
    });
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
    applyIconChoice(getCurrentIconId());
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
    applyAppTitle();
    applyPersonLabels();
    bindThemeToggle();
    bindNav();
    bindPersonSwitcher();
    bindAddButtons();
    bindForms();
    bindPurchaseUnitToggle();
    bindPurchaseTypeToggle();
    bindUpdatePriceForm();
    bindGoalForm();
    bindSymbolManagement();
    bindSettings();
    bindHistory();
    bindPullToRefresh();
    bindCardCollapse();
    bindInfoButtons();
    bindHoldingsSort();
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

  // ============== 卡片收合 ==============

  function applyCollapseStates() {
    $$('[data-collapse]').forEach(el => {
      const key = 'pr.collapse.' + el.dataset.collapse;
      el.classList.toggle('collapsed', localStorage.getItem(key) === '1');
    });
  }

  function bindCardCollapse() {
    document.addEventListener('click', (e) => {
      // 點到 modal 內、按鈕、或可互動元素時不觸發
      if (e.target.closest('.modal')) return;
      if (e.target.closest('button, a, input, select, summary')) return;
      const title = e.target.closest('.card > .card-title, .person-card > .name');
      if (!title) return;
      const card = title.closest('[data-collapse]');
      if (!card) return;
      const next = !card.classList.contains('collapsed');
      card.classList.toggle('collapsed', next);
      localStorage.setItem('pr.collapse.' + card.dataset.collapse, next ? '1' : '0');
    });
  }

  // ============== 通用說明 modal ==============

  const INFO_TEXTS = {
    'add-guide': {
      title: '什麼時候用哪個按鈕?',
      body: `
        <p>每個按鈕背後的「同步行為」不同,看這份就知道怎麼選:</p>

        <p><b>🛒 新增 ETF 買賣</b></p>
        <ul>
          <li>用在:任何買進、賣出 ETF</li>
          <li>會自動建一筆對應的銀行紀錄(支出-購買 / 收入-退費),有 🔗 標記</li>
          <li>👉 <b>不用再手動加銀行</b></li>
        </ul>

        <p><b>💵 新增股利發放</b></p>
        <ul>
          <li>用在:領到 ETF 股利</li>
          <li>會自動建一筆對應的銀行紀錄(收入-利息),有 🔗 標記</li>
          <li>👉 <b>不用再手動加銀行</b></li>
          <li>記得每筆股利都要進來,不然「年化 IRR」會被低估</li>
        </ul>

        <p><b>🏦 新增銀行收支</b></p>
        <ul>
          <li>用在:<b>不屬於上面兩類</b>的銀行流水。例如:</li>
          <li>· 薪水入帳</li>
          <li>· 純銀行存款利息(像 $5、$10 那種)</li>
          <li>· 日常開銷、信用卡、餐費</li>
          <li>· 退費、轉帳、其他收支</li>
          <li>👉 ETF 跟股利<b>不要</b>從這裡進(會跟 🔗 自動同步重複)</li>
        </ul>

        <p><b>💰 新增月存記錄</b></p>
        <ul>
          <li>用在:你為「5 年存入計劃」存了多少錢</li>
          <li><b>⚠️ 不會影響銀行餘額</b> — 純粹追蹤目標進度</li>
          <li>👉 如果這筆錢真的有進銀行,要再到「銀行收支」加一筆</li>
          <li>(像「為還貸款而存」這種沒進銀行的也照常記月存就好)</li>
        </ul>

        <p><b>📋 代號管理</b></p>
        <ul>
          <li>用在:新增 / 編輯股票代號(設定除息月份、現價、年配息)</li>
          <li>新買的標的記得先來這裡建,不然 ETF 買賣的下拉選不到</li>
        </ul>

        <p><b>🔗 標記是什麼意思?</b></p>
        <ul>
          <li>銀行分頁裡 🔗 開頭的紀錄 = 系統<b>自動</b>從 ETF / 股利 同步來的</li>
          <li>不能直接編輯/刪除這類 — 要去原始分頁(買賣 / 股利)修改</li>
          <li>沒 🔗 的就是純手動加的銀行紀錄,可以直接編輯</li>
        </ul>
      `
    },
    irr: {
      title: '真實年化 IRR (含股利)',
      body: `
        <p><b>IRR</b>(內部報酬率)回答這個問題:</p>
        <blockquote>「如果把錢放在某個固定利率的銀行,要多少利率,才能完整重現你過去這些投入和收回?」</blockquote>
        <p>那個利率就是 IRR,所以叫「真實年化」。</p>

        <p><b>為什麼比「(現價 − 均價) / 均價」公允?</b></p>
        <ul>
          <li><b>把時間算進去</b> — 5 年漲 50% vs 1 年漲 50% 是兩回事,IRR 會分開</li>
          <li><b>把分批進出算進去</b> — 你不是一次梭哈,每筆錢待在市場時間不同</li>
          <li><b>把股利算進去</b> — 高息股拿到的現金是真實收益,不能漏算</li>
        </ul>

        <p><b>怎麼讀這個數字</b></p>
        <ul>
          <li>持有 <b>&lt; 1 年</b>:數學對,但 1 個月運氣會被放大成全年趨勢,參考性低</li>
          <li>持有 <b>1–3 年</b>:開始有意義,但仍受市場景氣影響</li>
          <li>持有 <b>3–5 年</b>:相對穩定,反映該標的真實表現</li>
          <li>持有 <b>5 年以上</b>:通常涵蓋一輪牛熊,最可信</li>
        </ul>

        <p><b>⚠️ 注意</b></p>
        <ul>
          <li>IRR 含「假設今天全部賣掉」的市值 — 大盤一波動,IRR 立刻變</li>
          <li>這是<b>過去</b>的數字,不能保證未來會繼續這個速度</li>
          <li>顯示「—」代表資料不足以解出有效解</li>
        </ul>
      `
    }
  };

  function showInfoModal(key) {
    const def = INFO_TEXTS[key];
    if (!def) return;
    $('#modal-info-title').textContent = def.title;
    $('#modal-info-body').innerHTML = def.body;
    openModal('modal-info');
  }

  function bindInfoButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-info]');
      if (!btn) return;
      e.stopPropagation();
      showInfoModal(btn.dataset.info);
    });
  }

  // ============== 下拉刷新 ==============

  function bindPullToRefresh() {
    const indicator = $('#ptr-indicator');
    if (!indicator) return;
    const text = indicator.querySelector('.ptr-text');
    const THRESHOLD = 70;          // 拉超過這個 px 才觸發
    const MAX_VISUAL_OFFSET = 90;  // 視覺上指示器最多下移到這個 px
    let startY = 0, pulling = false, refreshing = false;

    function reset() {
      pulling = false;
      indicator.classList.remove('visible', 'ready');
      indicator.style.transform = '';
      if (text) text.textContent = '下拉刷新';
    }

    document.addEventListener('touchstart', (e) => {
      if (refreshing) return;
      // 任何 modal 開著就不觸發
      if (document.querySelector('.modal:not(.hidden)')) return;
      // 只在頁面捲到最頂時開始追蹤
      if (window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { reset(); return; }
      // 阻尼:拉越長越「重」
      const offset = Math.min(MAX_VISUAL_OFFSET, dy * 0.5);
      indicator.classList.add('visible');
      indicator.style.transform = `translate(-50%, ${offset}px)`;
      const ready = dy >= THRESHOLD;
      indicator.classList.toggle('ready', ready);
      if (text) text.textContent = ready ? '放開即可刷新' : '下拉刷新';
    }, { passive: true });

    document.addEventListener('touchend', async () => {
      if (!pulling || refreshing) return;
      const wasReady = indicator.classList.contains('ready');
      pulling = false;
      if (!wasReady) { reset(); return; }
      refreshing = true;
      indicator.classList.remove('ready');
      indicator.classList.add('loading');
      indicator.style.transform = '';
      if (text) text.textContent = '刷新中…';
      try {
        await loadAndRender(true);   // skipCache:使用者下拉時已有畫面,不需先閃舊快取
        if (text) text.textContent = '已更新';
      } catch (e) {
        if (text) text.textContent = '刷新失敗';
      } finally {
        setTimeout(() => {
          indicator.classList.remove('loading');
          reset();
          refreshing = false;
        }, 400);
      }
    }, { passive: true });
  }

  // ============== 載入資料 ==============

  async function loadAndRender(skipCache = false) {
    // 防止並發:同時只跑一個;若已在跑就靜默跳過
    if (loadAndRender._running) return;
    loadAndRender._running = true;
    $('#home-loading').classList.remove('hidden');
    $('#home-content').classList.add('hidden');
    try {
      // 初次載入時先用快取快速顯示;刷新/更新現價時跳過,避免舊數字閃爍
      if (!skipCache) {
        const cached = localStorage.getItem(KEY.cache);
        if (cached) {
          try {
            STATE.data = JSON.parse(cached);
            renderAll();
            $('#home-loading').classList.add('hidden');
            $('#home-content').classList.remove('hidden');
          } catch (_) {}
        }
      }
      // 拉最新資料
      const data = await API.getAll();
      STATE.data = data;
      localStorage.setItem(KEY.cache, JSON.stringify(data));
      renderAll();
      $('#home-loading').classList.add('hidden');
      $('#home-content').classList.remove('hidden');
    } catch (e) {
      $('#home-loading').textContent = '載入失敗:' + e.message;
    } finally {
      loadAndRender._running = false;
    }
  }

  function renderAll() {
    populateSymbolDropdown();
    populateYearMonthDropdown();
    renderDashboard();
  }

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
        <div class="stat"><span class="label">預估年配息</span><span class="val">${fmt.money(s.annualYield)}</span></div>
        <div class="stat"><span class="label">真實年化 IRR <small class="muted">(含股利)</small> <button type="button" class="info-btn" data-info="irr" title="什麼是 IRR?">ⓘ</button></span><span class="val">${irrHtml}</span></div>
        <div class="stat"><span class="label">銀行餘額</span><span class="val">${fmt.money(s.bankBalance)}</span></div>
      </div>
    `;

    renderHoldings(p);
    renderPayoutCalendar(p);
    renderHoldingsChart(p);
    renderNetWorthChart(p);
    renderSavingsProgress(stats);
    applyCollapseStates();
  }

  // 三條線:
  //   A. 累計投入   — 每月底投入成本(100% 準確,純歷史 purchase)
  //   B. 估算市值   — 每月底持股 × 今日價格(以今日價回推,估算)
  //   C. 真實 snap  — _snapshots 寫入點(從今天開始累積)
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
            tension: 0.2, pointRadius: 2, borderWidth: 2, borderDash: [5, 5] },
          { label: '估算市值 (以今日價回推)',
            data: estimatedSeries,
            borderColor: colEstimated, backgroundColor: colEstimated + '22',
            tension: 0.2, pointRadius: 2, borderWidth: 2, fill: true },
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
    (STATE.data.purchases || []).forEach(r => {
      if (personFilter && r.person !== personFilter) return;
      if (!r.symbol) return;
      if (!agg[r.symbol]) agg[r.symbol] = 0;
      agg[r.symbol] += (Number(r.shares) || 0) * (Number((symMap[r.symbol] || {}).current_price) || 0);
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

  async function refreshPricesFlow() {
    const btn = $('#btn-refresh-prices');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 抓取中…';
    showToast('正在從證交所抓最新現價…', 60000);   // 保留至完成
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);  // 45 秒強制超時
    try {
      const result = await API.refreshPrices(ctrl.signal);
      clearTimeout(timer);
      const fetched   = (result && result.fetched)   || 0;
      const notFound  = (result && result.notFound)  || [];
      const priceMap  = (result && result.prices)    || {};

      if (Object.keys(priceMap).length > 0 && STATE.data && STATE.data.symbols) {
        // 新版 Code.gs：POST 直接帶回價格 → 就地更新，不需第二次 GET
        let applied = 0;
        STATE.data.symbols.forEach(s => {
          const p = priceMap[s.symbol];
          if (p && p > 0) { s.current_price = p; applied++; }
        });
        if (applied > 0) {
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();  // 只 render 一次，無 loading 閃爍
        }
      } else if (fetched > 0) {
        // 舊版 Code.gs 相容：沒有 prices 欄位時退回 GET 同步
        await loadAndRender(true);
      }

      if (fetched > 0) {
        const missingNote = notFound.length > 0 ? `　找不到：${notFound.join('、')}` : '';
        showToast(`✅ 已更新 ${fetched} 檔現價${missingNote}`, notFound.length > 0 ? 5000 : 2800);
      } else {
        showToast('⚠️ 所有來源均無回應，現價維持原值', 3500);
      }
    } catch (e) {
      clearTimeout(timer);
      const isTimeout = e.name === 'AbortError';
      const msg = isTimeout ? '連線逾時，請稍後再試' : ('更新失敗：' + e.message);
      showActionToast('❌ ' + msg, '重試', refreshPricesFlow, 6000);
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
          const perPay = ms.length > 0 ? (yPerShare / ms.length) * shares : 0;
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
    const buildEta = (current, target, time) => {
      if (target <= 0 || time.monthsElapsed <= 0 || time.monthsTotal <= 0) return '';
      if (current >= target) {
        return `<div class="eta-line">🎯 已達標</div>`;
      }
      const pace = current / time.monthsElapsed;       // 平均每月增量(NT$)
      if (pace <= 0) return '';
      const monthsNeeded = (target - current) / pace;  // 達標還需多少個月
      const totalMonths  = time.monthsElapsed + monthsNeeded;
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

  // ============== Add forms ==============

  function bindAddButtons() {
    $$('[data-open]').forEach(b => {
      b.onclick = () => {
        const which = b.dataset.open;
        openModal('modal-' + which.replace('add-', ''));
        prefillForm(which);
        updateRepeatLastButtons();
        if (which === 'symbols') renderSymbolList();
      };
    });
    $$('.repeat-last').forEach(b => {
      b.onclick = () => repeatLastEntry(b.dataset.repeat);
    });
    $$('[data-close]').forEach(b => b.onclick = () => closeAllModals());
    $$('.modal').forEach(m => m.addEventListener('click', e => {
      if (e.target === m) closeAllModals();
    }));

    // 在 modal 內的人員 segmented control
    $$('[data-pick]').forEach(b => {
      b.onclick = () => pickPerson(b.dataset.pick, b.dataset.val);
    });
  }

  function openModal(id) {
    $('#' + id).classList.remove('hidden');
    updateRepeatLastButtons();
  }
  function closeAllModals() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
    STATE.editing = null;
    resetModalLabels();
  }

  function prefillForm(which) {
    const today = ymdLocal(new Date());
    if (which === 'add-purchase') {
      $('#purchase-date').value = today;
      pickPerson('purchase-person', STATE.defaultPerson);
      $('#purchase-amount').value = '';
      $('#purchase-price').value = '';
      $('#purchase-shares').value = '';
      $('#purchase-fee').value = '';
      $('#purchase-note').value = '';
      setPurchaseType('buy');
      setPurchaseUnit('stocks');
      updateSharesHint();
    } else if (which === 'add-bank') {
      $('#bank-date').value = today;
      pickPerson('bank-person', STATE.defaultPerson);
      $('#bank-amount').value = '';
      $('#bank-note').value = '';
    } else if (which === 'add-dividend') {
      $('#dividend-date').value = today;
      pickPerson('dividend-person', STATE.defaultPerson);
      $('#dividend-total').value = '';
      $('#dividend-per-share').value = '';
      $('#dividend-shares').value = '';
      $('#dividend-note').value = '';
    } else if (which === 'add-savings') {
      pickPerson('savings-person', STATE.defaultPerson);
      const now = new Date();
      $('#savings-year').value = String(now.getFullYear());
      $('#savings-month').value = String(now.getMonth() + 1);
      $('#savings-amount').value = '';
      $('#savings-note').value = '';
    }
  }

  // 找出當前 defaultPerson 在某張表的最近一筆(以 created_at desc,fallback date desc)
  function findLastEntry(type) {
    if (!STATE.data) return null;
    const person = STATE.defaultPerson;
    const arr =
      type === 'purchase' ? (STATE.data.purchases || []).filter(r => Number(r.amount) > 0)  // 只取買進
      : type === 'bank'    ? (STATE.data.bank || [])
      : type === 'savings' ? (STATE.data.savings || [])
      : type === 'dividend'? (STATE.data.dividends || [])
      : [];
    const mine = arr.filter(r => r.person === person);
    if (mine.length === 0) return null;
    const ts = (r) => {
      const t1 = r.created_at ? new Date(r.created_at).getTime() : 0;
      const t2 = r.date        ? new Date(String(r.date).slice(0, 10)).getTime() : 0;
      return Math.max(t1 || 0, t2 || 0);
    };
    return mine.slice().sort((a, b) => ts(b) - ts(a))[0];
  }

  function updateRepeatLastButtons() {
    const editing = !!STATE.editing;
    $$('.repeat-last').forEach(b => {
      if (editing) {
        b.style.display = 'none';
      } else {
        b.style.display = '';
        const has = !!findLastEntry(b.dataset.repeat);
        b.disabled = !has;
        b.title = has ? '從你最近一筆紀錄帶入欄位' : '還沒有可重複的紀錄';
      }
    });
  }

  function repeatLastEntry(type) {
    const r = findLastEntry(type);
    if (!r) { showToast('沒有可重複的紀錄'); return; }
    if (type === 'purchase') {
      pickPerson('purchase-person', r.person);
      setPurchaseType('buy');
      setPurchaseUnit('stocks');
      const sel = $('#purchase-symbol');
      if (r.symbol && ![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol || '';
      $('#purchase-amount').value = Math.abs(Number(r.amount) || 0);
      $('#purchase-price').value  = r.price || '';
      $('#purchase-shares').value = Math.abs(Number(r.shares) || 0);
      $('#purchase-fee').value    = r.fee || '';
      updateSharesHint();
    } else if (type === 'bank') {
      pickPerson('bank-person', r.person);
      $('#bank-type').value   = r.type || '';
      $('#bank-amount').value = r.amount || '';
    } else if (type === 'savings') {
      pickPerson('savings-person', r.person);
      $('#savings-amount').value = r.amount || '';
    } else if (type === 'dividend') {
      pickPerson('dividend-person', r.person);
      const sel = $('#dividend-symbol');
      if (r.symbol && ![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol || '';
      $('#dividend-total').value     = r.total || '';
      $('#dividend-per-share').value = r.amount_per_share || '';
      $('#dividend-shares').value    = r.shares || '';
    }
    showToast('已帶入上一筆');
  }

  function pickPerson(targetId, val) {
    $('#' + targetId).value = val;
    $$(`[data-pick="${targetId}"]`).forEach(x => x.classList.toggle('active', x.dataset.val === val));
    // 賣出模式時切換購買人 → 代號下拉只顯示該人員持有的
    if (targetId === 'purchase-person' && STATE.purchaseType === 'sell') {
      populatePurchaseSymbolDropdown();
    }
  }

  function populateSymbolDropdown() {
    const symbols = (STATE.data.symbols || []).map(s => s.symbol).filter(Boolean);
    const html = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
    ['#purchase-symbol', '#dividend-symbol'].forEach(sel => {
      const el = $(sel);
      if (el) el.innerHTML = html;
    });
  }

  function populateYearMonthDropdown() {
    $('#savings-year').innerHTML = CONFIG.YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    $('#savings-month').innerHTML = Array.from({length: 12}, (_, i) => i + 1).map(m => `<option value="${m}">${m}</option>`).join('');
  }

  // 購買 modal 的「股 / 張」單位切換
  function setPurchaseUnit(unit) {
    STATE.purchaseUnit = (unit === 'lots') ? 'lots' : 'stocks';
    $$('#purchase-unit-seg .seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.unit === STATE.purchaseUnit));
  }
  function updateSharesHint() {
    const input = $('#purchase-shares');
    const hint  = $('#purchase-shares-hint');
    if (!input || !hint) return;
    const v = Number(input.value);
    if (!v || isNaN(v)) { hint.textContent = ''; return; }
    if (STATE.purchaseUnit === 'lots') {
      hint.textContent = `= ${(v * 1000).toLocaleString('en-US')} 股`;
    } else {
      hint.textContent = `≈ ${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} 張`;
    }
  }
  function bindPurchaseUnitToggle() {
    STATE.purchaseUnit = STATE.purchaseUnit || 'stocks';
    $$('#purchase-unit-seg .seg-btn').forEach(b => {
      b.onclick = () => {
        setPurchaseUnit(b.dataset.unit);
        updateSharesHint();
      };
    });
    const input = $('#purchase-shares');
    if (input) input.addEventListener('input', updateSharesHint);
  }

  // 購買 modal 的「買進 / 賣出」切換
  function setPurchaseType(type) {
    STATE.purchaseType = (type === 'sell') ? 'sell' : 'buy';
    $$('[data-ptype]').forEach(b =>
      b.classList.toggle('active', b.dataset.ptype === STATE.purchaseType));
    const isSell = STATE.purchaseType === 'sell';
    const titleEl = $('#modal-purchase-title');
    const amtLabel = $('#purchase-amount-label');
    if (titleEl)  titleEl.textContent  = isSell ? '新增 ETF 賣出' : '新增 ETF 買進';
    if (amtLabel) amtLabel.textContent = isSell ? '實收金額 (NT$)' : '花費金額 (NT$)';
    populatePurchaseSymbolDropdown();
  }
  function bindPurchaseTypeToggle() {
    STATE.purchaseType = STATE.purchaseType || 'buy';
    $$('[data-ptype]').forEach(b => {
      b.onclick = () => setPurchaseType(b.dataset.ptype);
    });
  }

  // 計算指定人員目前淨持有 > 0 的代號
  function getHeldSymbols(person) {
    const agg = {};
    (STATE.data && STATE.data.purchases || []).forEach(r => {
      if (person && r.person !== person) return;
      if (!r.symbol) return;
      agg[r.symbol] = (agg[r.symbol] || 0) + (Number(r.shares) || 0);
    });
    return Object.keys(agg).filter(s => agg[s] > 0).sort();
  }

  // 依照當前的買 / 賣切換填入購買 modal 的代號下拉
  function populatePurchaseSymbolDropdown() {
    const sel = $('#purchase-symbol');
    if (!sel) return;
    const isSell = STATE.purchaseType === 'sell';
    let symbols;
    if (isSell) {
      const person = $('#purchase-person').value || STATE.defaultPerson;
      symbols = getHeldSymbols(person);
    } else {
      symbols = (STATE.data && STATE.data.symbols || []).map(s => s.symbol).filter(Boolean);
    }
    const cur = sel.value;
    if (symbols.length === 0 && isSell) {
      sel.innerHTML = `<option value="" disabled selected>(目前沒有持股可賣出)</option>`;
    } else {
      sel.innerHTML = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
      if (symbols.includes(cur)) sel.value = cur;
    }
  }

  function bindForms() {
    $('#purchase-submit').onclick = () => {
      const sharesRaw = Number($('#purchase-shares').value) || 0;
      const sharesAsStocks = (STATE.purchaseUnit === 'lots') ? sharesRaw * 1000 : sharesRaw;
      const isSell = STATE.purchaseType === 'sell';
      const sign = isSell ? -1 : 1;
      const data = {
        person: $('#purchase-person').value,
        symbol: $('#purchase-symbol').value,
        amount: sign * (Number($('#purchase-amount').value) || 0),
        price:  Number($('#purchase-price').value)  || 0,
        shares: sign * sharesAsStocks,
        fee:    Number($('#purchase-fee').value)    || 0,
        date:   $('#purchase-date').value,
        note:   $('#purchase-note').value
      };
      if (!data.person) return alert(isSell ? '請選賣出人' : '請選購買人');
      if (!data.symbol) return alert('請選代號');
      if (!data.amount || !data.shares) return alert('請輸入金額和股數');
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
      showToast(editing ? '已更新' : (isSell ? '已新增賣出' : '已新增買進'));
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

    $('#dividend-submit').onclick = () => {
      const data = {
        person: $('#dividend-person').value,
        symbol: $('#dividend-symbol').value,
        total:  Number($('#dividend-total').value) || 0,
        amount_per_share: Number($('#dividend-per-share').value) || 0,
        shares: Number($('#dividend-shares').value) || 0,
        date:   $('#dividend-date').value,
        note:   $('#dividend-note').value
      };
      if (!data.person) return alert('請選人');
      if (!data.symbol) return alert('請選代號');
      if (!data.total)  return alert('請輸入實領金額');
      if (!data.date)   return alert('請選日期');
      const editing = STATE.editing && STATE.editing.type === 'dividend' ? { ...STATE.editing } : null;
      const arr = STATE.data.dividends = STATE.data.dividends || [];
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
      showToast(editing ? '已更新' : '已新增股利');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addDividend({ ...data, created_by: STATE.defaultPerson });
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

  // ----- 最近刪除清單(localStorage) -----
  function getDeletedHistory() {
    try { return JSON.parse(localStorage.getItem(KEY.deletedHistory) || '[]') || []; }
    catch (_) { return []; }
  }
  function saveDeletedHistory(list) {
    localStorage.setItem(KEY.deletedHistory, JSON.stringify(list));
  }
  function pushToDeletedHistory(sheet, removed) {
    const list = getDeletedHistory();
    const entry = {
      sheet,
      deletedAt: new Date().toISOString(),
      data: removed
    };
    list.unshift(entry);
    if (list.length > (CONFIG.DELETED_HISTORY_MAX || 50)) list.length = CONFIG.DELETED_HISTORY_MAX || 50;
    saveDeletedHistory(list);
    return entry;
  }
  function removeFromDeletedHistory(deletedAt) {
    const list = getDeletedHistory().filter(e => e.deletedAt !== deletedAt);
    saveDeletedHistory(list);
  }

  // 復原單筆(toast undo 與「最近刪除」清單共用)
  // 回傳 true 表示有實際復原(API 成功),false 表示使用者取消或失敗
  async function restoreEntry(entry) {
    if (!entry) return false;
    if (!confirm('確認要復原此筆嗎?')) return false;
    const cleaned = { ...entry.data };
    delete cleaned.id;
    delete cleaned.created_at;

    const key = entry.sheet === '_purchases' ? 'purchases'
              : entry.sheet === '_bank'      ? 'bank'
              : entry.sheet === '_dividends' ? 'dividends'
              : 'savings';
    const arr = STATE.data[key] = STATE.data[key] || [];
    const tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    arr.push({ id: tmpId, ...cleaned, created_at: new Date().toISOString() });
    renderAll();
    if ($('#page-history').classList.contains('active')) renderHistory();
    showToast('已復原');

    try {
      let res;
      if      (entry.sheet === '_purchases') res = await API.addPurchase(cleaned);
      else if (entry.sheet === '_bank')      res = await API.addBank(cleaned);
      else if (entry.sheet === '_savings')   res = await API.addSavings(cleaned);
      else if (entry.sheet === '_dividends') res = await API.addDividend(cleaned);
      const i = arr.findIndex(r => r.id === tmpId);
      if (i >= 0 && res && res.id) arr[i] = { ...arr[i], id: res.id };
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      removeFromDeletedHistory(entry.deletedAt);
      return true;
    } catch (e) {
      const i = arr.findIndex(r => r.id === tmpId);
      if (i >= 0) arr.splice(i, 1);
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      alert('復原失敗:' + e.message + '\n建議按「重新載入」同步');
      return false;
    }
  }

  function renderDeletedHistory() {
    const list = $('#deleted-list');
    if (!list) return;
    const items = getDeletedHistory();
    if (items.length === 0) {
      list.innerHTML = `<div class="empty">沒有最近刪除的紀錄</div>`;
      return;
    }
    list.innerHTML = items.map(entry => {
      const r = entry.data || {};
      const tabType = entry.sheet === '_purchases' ? '購買'
                    : entry.sheet === '_bank'      ? '銀行'
                    : entry.sheet === '_dividends' ? '股利'
                    : '月存';
      let title = '', sub = '', amount = 0;
      if (entry.sheet === '_purchases') {
        const fee = Number(r.fee) || 0;
        const rawAmount = Number(r.amount) || 0;
        const rawShares = Number(r.shares) || 0;
        const isSell = rawAmount < 0 || rawShares < 0;
        const sharesAbs = Math.abs(rawShares);
        const amountAbs = Math.abs(rawAmount);
        title = isSell
          ? `<span class="tag-sell">賣</span> ${r.symbol || '?'} × ${fmt.money(sharesAbs)} 股`
          : `${r.symbol || '?'} × ${fmt.money(sharesAbs)} 股`;
        sub = `${fmt.date(r.date)}${fee > 0 ? ' · 手續費 ' + fmt.money(fee) : ''}${r.note ? ' · ' + r.note : ''}`;
        amount = isSell ? (amountAbs - fee) : -(amountAbs + fee);
      } else if (entry.sheet === '_bank') {
        title = r.type || '';
        sub = `${fmt.date(r.date)}${r.note ? ' · ' + r.note : ''}`;
        amount = (String(r.type).startsWith('支出') ? -1 : 1) * Number(r.amount || 0);
      } else if (entry.sheet === '_dividends') {
        title = `${r.symbol || '?'} 股利`;
        const aps = Number(r.amount_per_share) || 0;
        const subParts = [fmt.date(r.date)];
        if (aps > 0) subParts.push(`每股 ${aps.toFixed(2)}`);
        if (r.note) subParts.push(r.note);
        sub = subParts.join(' · ');
        amount = Number(r.total || 0);
      } else if (entry.sheet === '_savings') {
        title = `${r.year} 年 ${r.month} 月`;
        sub = r.note || '月存';
        amount = Number(r.amount || 0);
      }
      const cls = amount >= 0 ? 'pos' : 'neg';
      const personCls = r.person === '黃' ? 'huang' : 'su';
      const dt = new Date(entry.deletedAt);
      const deletedTime = isNaN(dt.getTime()) ? '' :
        dt.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="list-item deleted-item">
        <div class="badge ${personCls}">${escapeHtml(getPersonLabel(r.person)) || '?'}</div>
        <div class="main">
          <div class="row1"><span class="tag-type">${tabType}</span> ${title}</div>
          <div class="row2">${escapeHtml(sub)}</div>
          <div class="deleted-time">已刪除 · ${deletedTime}</div>
        </div>
        <div class="right">
          <div class="amount ${cls}">${fmt.moneySigned(amount)}</div>
          <button class="btn small primary restore-btn" data-restore="${entry.deletedAt}">復原</button>
        </div>
      </div>`;
    }).join('');

    $$('#deleted-list .restore-btn').forEach(b => b.onclick = async () => {
      const ts = b.dataset.restore;
      const entry = getDeletedHistory().find(e => e.deletedAt === ts);
      const ok = await restoreEntry(entry);
      if (ok) renderDeletedHistory();
    });
  }

  function updateDeletedCountBadge() {
    const btn = $('#btn-deleted-history');
    if (!btn) return;
    const count = getDeletedHistory().length;
    btn.textContent = count > 0 ? `📋 最近刪除 (${count})` : '📋 最近刪除';
  }

  function bindHistory() {
    $$('#page-history .seg-btn').forEach(b => {
      b.onclick = () => {
        $$('#page-history .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        STATE.currentTab = b.dataset.tab;
        STATE.historyLimit = HISTORY_PAGE_SIZE;  // 切 tab 時重置分頁
        STATE.filterCategories = [];             // 切 tab 重置代號 / 類型篩選
        $('#filter-year').value     = '';        // 與年度
        $('#filter-category-popover').classList.add('hidden');
        renderHistory();
      };
    });
    let searchTimer = null;
    $('#filter-search').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderHistory, 200);
    };
    $('#filter-year').onchange = renderHistory;

    // 多選 popover 開關
    const popover = $('#filter-category-popover');
    $('#filter-category-btn').onclick = (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
    };
    // 點外面關閉
    document.addEventListener('click', (e) => {
      const wrap = $('#filter-category-wrap');
      if (!wrap || wrap.contains(e.target)) return;
      popover.classList.add('hidden');
    });
    // 全部清除
    $('#filter-category-clear').onclick = () => {
      STATE.filterCategories = [];
      renderHistory();
    };
    // 圖表切換(堆疊 / 並排)— 買賣 / 股利各自記憶
    $$('#dividend-chart-toggle .seg-btn').forEach(b => {
      b.onclick = () => {
        const k = STATE.currentTab === 'purchases' ? KEY.purchaseChartMode
                : STATE.currentTab === 'dividends' ? KEY.dividendChartMode
                : null;
        if (!k) return;
        localStorage.setItem(k, b.dataset.cmode);
        renderHistory();
      };
    });
  }

  function populateYearFilter(tab, raw) {
    const sel = $('#filter-year');
    if (tab !== 'purchases' && tab !== 'bank' && tab !== 'dividends' && tab !== 'realized') {
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
    const list = $('#filter-category-list');
    const btn  = $('#filter-category-btn');
    if (!list || !btn) return;
    let allLabel = '全部', options = [];
    if (tab === 'purchases') {
      allLabel = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'realized') {
      allLabel = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'dividends') {
      allLabel = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'bank') {
      allLabel = '全部類型';
      options = [...new Set(raw.map(r => r.type).filter(Boolean))].sort();
    } else if (tab === 'savings') {
      allLabel = '全部年份';
      options = [...new Set(raw.map(r => String(r.year)).filter(Boolean))].sort();
    }
    // 清掉已不在 options 中的舊選擇(換 tab、換人員等情境)
    STATE.filterCategories = STATE.filterCategories.filter(c => options.includes(c));
    // 渲染勾選列表
    list.innerHTML = options.length === 0
      ? `<div class="ms-item empty">無資料</div>`
      : options.map(o => `<label class="ms-item">
          <input type="checkbox" data-cat="${escapeHtml(o)}" ${STATE.filterCategories.includes(o) ? 'checked' : ''} />
          <span>${escapeHtml(o)}</span>
        </label>`).join('');
    $$('#filter-category-list input[type="checkbox"]').forEach(cb => {
      cb.onchange = () => {
        const cat = cb.dataset.cat;
        if (cb.checked) {
          if (!STATE.filterCategories.includes(cat)) STATE.filterCategories.push(cat);
        } else {
          STATE.filterCategories = STATE.filterCategories.filter(c => c !== cat);
        }
        updateCategoryButtonLabel(allLabel);
        renderHistory();
      };
    });
    updateCategoryButtonLabel(allLabel);
    // 紀錄當前 label 給其他地方用
    btn.dataset.allLabel = allLabel;
  }

  function updateCategoryButtonLabel(allLabel) {
    const btn = $('#filter-category-btn');
    if (!btn) return;
    const fallback = allLabel || btn.dataset.allLabel || '全部';
    const n = STATE.filterCategories.length;
    if (n === 0)      btn.textContent = fallback;
    else if (n === 1) btn.textContent = STATE.filterCategories[0];
    else              btn.textContent = `已選 ${n} 個`;
  }

  function renderHistory() {
    if (!STATE.data) return;
    const tab = STATE.currentTab;
    const personFilter = STATE.defaultPerson;
    const search = $('#filter-search').value.trim().toLowerCase();

    // 先抓「已套用人員篩選」的原始資料(供統計、圖表、分類下拉用)
    let raw = [];
    if (tab === 'purchases')   raw = (STATE.data.purchases || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'realized') raw = computeRealizedPL().filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'dividends') raw = (STATE.data.dividends || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'bank')   raw = (STATE.data.bank || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'savings')raw = (STATE.data.savings || []).filter(r => !personFilter || r.person === personFilter);

    populateCategoryFilter(tab, raw);
    populateYearFilter(tab, raw);
    const cats = STATE.filterCategories || [];
    const year = $('#filter-year').value;

    // 套用代號 / 類型 / 年份篩選 — 統計 + 圖表 + 列表全部一致
    if (cats.length > 0) {
      if (tab === 'purchases')   raw = raw.filter(r => cats.includes(r.symbol));
      else if (tab === 'realized') raw = raw.filter(r => cats.includes(r.symbol));
      else if (tab === 'dividends') raw = raw.filter(r => cats.includes(r.symbol));
      else if (tab === 'bank')   raw = raw.filter(r => cats.includes(r.type));
      else if (tab === 'savings')raw = raw.filter(r => cats.includes(String(r.year)));
    }
    if (year && (tab === 'purchases' || tab === 'bank' || tab === 'dividends' || tab === 'realized')) {
      raw = raw.filter(r => String(r.date || '').slice(0, 4) === year);
    }

    renderHistorySummary(tab, raw, personFilter);
    renderHistoryChart(tab, raw);

    // 列表(再套搜尋)
    let rows = [];
    if (tab === 'purchases') {
      rows = raw.slice().reverse().map(r => {
        const fee = Number(r.fee) || 0;
        const rawAmount = Number(r.amount) || 0;
        const rawShares = Number(r.shares) || 0;
        const isSell = rawAmount < 0 || rawShares < 0;
        const sharesAbs = Math.abs(rawShares);
        const amountAbs = Math.abs(rawAmount);
        const title = isSell
          ? `<span class="tag-sell">賣</span> ${r.symbol} × ${fmt.money(sharesAbs)} 股`
          : `${r.symbol} × ${fmt.money(sharesAbs)} 股`;
        return {
          id: r.id, sheet: '_purchases', person: r.person,
          title,
          sub: `${fmt.date(r.date)} · 均價 ${Number(r.price).toFixed(2)}${fee > 0 ? ' · 手續費 ' + fmt.money(fee) : ''}${r.note ? ' · ' + r.note : ''}`,
          amount: isSell ? (amountAbs - fee) : -(amountAbs + fee),
          searchText: `${r.symbol} ${r.note || ''}`.toLowerCase()
        };
      });
    } else if (tab === 'dividends') {
      rows = raw.slice().reverse().map(r => {
        const aps = Number(r.amount_per_share) || 0;
        const subParts = [fmt.date(r.date)];
        if (aps > 0) subParts.push(`每股 ${aps.toFixed(2)}`);
        if (r.note) subParts.push(r.note);
        return {
          id: r.id, sheet: '_dividends', person: r.person,
          title: `${r.symbol} 股利`,
          sub: subParts.join(' · '),
          amount: Number(r.total),
          searchText: `${r.symbol} ${r.note || ''}`.toLowerCase()
        };
      });
    } else if (tab === 'bank') {
      rows = raw.slice().reverse().map(r => {
        const isLinked = !!r.link_type;
        const prefix = isLinked ? '🔗 ' : '';
        return {
          id: r.id, sheet: '_bank', person: r.person,
          title: prefix + r.type,
          sub: `${fmt.date(r.date)}${r.note ? ' · ' + r.note : ''}${isLinked ? ' · 自動同步' : ''}`,
          amount: (String(r.type).startsWith('支出') ? -1 : 1) * Number(r.amount),
          readonly: isLinked,  // 連動紀錄不顯示編輯/刪除按鈕(去原始分頁編輯)
          searchText: `${r.type} ${r.note || ''}`.toLowerCase()
        };
      });
    } else if (tab === 'savings') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_savings', person: r.person,
        title: `${r.year} 年 ${r.month} 月`,
        sub: r.note || '月存',
        amount: Number(r.amount),
        searchText: `${r.year}/${r.month} ${r.note || ''}`.toLowerCase()
      }));
    } else if (tab === 'realized') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_purchases', person: r.person,
        title: `${r.symbol} × ${fmt.money(r.sold_shares)} 股`,
        sub: `${fmt.date(r.date)} · 售出 ${fmt.money(r.proceeds)} − 成本 ${fmt.money(r.cost_basis)}`,
        amount: r.realized_pl,
        readonly: true,
        searchText: String(r.symbol || '').toLowerCase()
      }));
    }
    if (search) rows = rows.filter(r => r.searchText.includes(search));

    const list = $('#history-list');
    const totalRows = rows.length;
    const limit = STATE.historyLimit || HISTORY_PAGE_SIZE;
    const truncated = totalRows > limit;
    const visibleRows = truncated ? rows.slice(0, limit) : rows;
    if (totalRows === 0) {
      const emptyMsg = tab === 'realized'
        ? '尚未有任何賣出紀錄,所以沒有已實現損益。<br><small>實際賣出後,系統會自動算出每筆賣出的成本基礎與獲利。</small>'
        : '沒有資料';
      list.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    } else {
      const itemsHtml = visibleRows.map(r => {
        const cls = r.amount >= 0 ? 'pos' : 'neg';
        const personCls = r.person === '黃' ? 'huang' : 'su';
        const actionsHtml = r.readonly ? '' : `
            <div class="row-actions">
              <button class="edit-btn"   data-edit-sheet="${r.sheet}" data-edit-id="${r.id}" title="編輯">✏️</button>
              <button class="delete-btn" data-del-sheet="${r.sheet}"  data-del-id="${r.id}"  title="刪除">🗑</button>
            </div>`;
        return `<div class="list-item">
          <div class="badge ${personCls}">${escapeHtml(getPersonLabel(r.person)) || '?'}</div>
          <div class="main">
            <div class="row1">${r.title}</div>
            <div class="row2">${r.sub}</div>
          </div>
          <div class="right">
            <div class="amount ${cls}">${fmt.moneySigned(r.amount)}</div>${actionsHtml}
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
      const key = sheet === '_purchases' ? 'purchases'
                : sheet === '_bank'      ? 'bank'
                : sheet === '_dividends' ? 'dividends'
                : 'savings';
      const arr = STATE.data[key] = STATE.data[key] || [];
      const idx = arr.findIndex(r => String(r.id) === String(id));
      if (idx < 0) return;
      const removed = arr[idx];
      arr.splice(idx, 1);
      renderAll();
      renderHistory();
      const entry = pushToDeletedHistory(sheet, removed);
      showActionToast('已刪除', '復原', () => restoreEntry(entry), 6000);
      (async () => {
        try {
          await API.deleteRecord(sheet, id);
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          // 雲端刪除失敗:還原本地、收掉 undo toast、把這筆從刪除清單移除(沒真的刪)
          const t = $('#toast');
          t.classList.add('hidden');
          t.textContent = '';
          removeFromDeletedHistory(entry.deletedAt);
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
      const isSell = (Number(r.shares) < 0) || (Number(r.amount) < 0);
      pickPerson('purchase-person', r.person);
      $('#purchase-amount').value = Math.abs(Number(r.amount) || 0);
      $('#purchase-price').value  = r.price;
      $('#purchase-shares').value = Math.abs(Number(r.shares) || 0);
      $('#purchase-fee').value    = r.fee || '';
      $('#purchase-date').value   = String(r.date || '').slice(0, 10);
      $('#purchase-note').value   = r.note || '';
      setPurchaseType(isSell ? 'sell' : 'buy');  // 先設定型別,會 populate 代號下拉
      setPurchaseUnit('stocks');
      updateSharesHint();
      // 編輯既有紀錄時,即使該代號目前不在下拉中(例如已賣光),仍要能選回原值
      const sel = $('#purchase-symbol');
      if (r.symbol && ![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol;
      $('#modal-purchase-title').textContent = isSell ? '編輯 ETF 賣出' : '編輯 ETF 買進';
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
    } else if (sheet === '_dividends') {
      const r = find(STATE.data.dividends);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'dividend' };
      pickPerson('dividend-person', r.person);
      const sel = $('#dividend-symbol');
      if (![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol;
      $('#dividend-total').value     = r.total;
      $('#dividend-per-share').value = r.amount_per_share || '';
      $('#dividend-shares').value    = r.shares || '';
      $('#dividend-date').value      = String(r.date || '').slice(0, 10);
      $('#dividend-note').value      = r.note || '';
      $('#modal-dividend h2').textContent = '編輯股利發放';
      $('#dividend-submit').textContent = '儲存修改';
      openModal('modal-dividend');
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
    $('#modal-purchase-title').textContent = '新增 ETF 買進';
    $('#purchase-submit').textContent   = '儲存';
    $('#modal-bank h2').textContent     = '新增銀行收支';
    $('#bank-submit').textContent       = '儲存';
    $('#modal-savings h2').textContent  = '新增月存記錄';
    $('#savings-submit').textContent    = '儲存';
    $('#modal-dividend h2').textContent = '新增股利發放';
    $('#dividend-submit').textContent   = '儲存';
  }

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

  // ============== Settings ==============

  // 從 JSON 備份還原(智慧合併:已存在的不動、缺的補入)
  async function importJsonFlow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let parsed;
      try {
        const text = await file.text();
        parsed = JSON.parse(text);
      } catch (e) {
        alert('檔案讀取失敗:' + e.message);
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        alert('不是有效的 JSON 檔案');
        return;
      }

      // 計算差異(JSON 有、試算表沒的)
      const types = [
        { key: 'purchases', addFn: API.addPurchase },
        { key: 'bank',      addFn: API.addBank },
        { key: 'savings',   addFn: API.addSavings },
        { key: 'dividends', addFn: API.addDividend }
      ];
      const diff = {};
      types.forEach(t => {
        const fromJson = (parsed[t.key] || []).filter(r => r && r.id);
        const currentIds = new Set((STATE.data[t.key] || []).map(r => String(r.id)));
        diff[t.key] = fromJson.filter(r => !currentIds.has(String(r.id)));
      });
      // 代號用 symbol 名稱比對
      const symFromJson = (parsed.symbols || []).filter(s => s && s.symbol);
      const currentSyms = new Set((STATE.data.symbols || []).map(s => s.symbol));
      diff.symbols = symFromJson.filter(s => !currentSyms.has(s.symbol));

      const counts = {
        purchases: diff.purchases.length,
        bank:      diff.bank.length,
        savings:   diff.savings.length,
        dividends: diff.dividends.length,
        symbols:   diff.symbols.length
      };
      const total = counts.purchases + counts.bank + counts.savings + counts.dividends + counts.symbols;
      if (total === 0) {
        alert('沒有需要匯入的資料 — 所有紀錄都已經存在試算表裡。');
        return;
      }

      const msg = '將補入以下資料(已存在的紀錄不會被覆蓋):\n\n' +
        '購買 ' + counts.purchases + ' 筆\n' +
        '銀行 ' + counts.bank + ' 筆\n' +
        '月存 ' + counts.savings + ' 筆\n' +
        '股利 ' + counts.dividends + ' 筆\n' +
        '代號 ' + counts.symbols + ' 筆\n\n' +
        '總共 ' + total + ' 筆。確定要匯入嗎?';
      if (!confirm(msg)) return;

      closeAllModals();
      showToast('匯入中,請稍候(每筆約 0.5–1 秒)…');
      let success = 0, failed = 0;
      const errors = [];

      // 依序匯入(API 是序列呼叫,避免太多併發)
      for (const t of types) {
        STATE.data[t.key] = STATE.data[t.key] || [];
        for (const r of diff[t.key]) {
          try {
            await t.addFn(r);
            STATE.data[t.key].push(r);
            success++;
          } catch (e) {
            failed++;
            errors.push((t.key) + ': ' + (r.id || '?') + ' → ' + e.message);
          }
        }
      }
      // 代號用 updateSymbol(它是 upsert)
      STATE.data.symbols = STATE.data.symbols || [];
      for (const s of diff.symbols) {
        try {
          await API.updateSymbol(s);
          STATE.data.symbols.push(s);
          success++;
        } catch (e) {
          failed++;
          errors.push('symbols: ' + (s.symbol || '?') + ' → ' + e.message);
        }
      }

      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      renderAll();
      if (failed === 0) {
        alert('✅ 匯入完成,共補入 ' + success + ' 筆。');
      } else {
        alert('匯入結果:\n成功 ' + success + ' 筆\n失敗 ' + failed + ' 筆\n\n失敗詳情:\n' + errors.slice(0, 10).join('\n') +
              (errors.length > 10 ? '\n…(僅顯示前 10 條)' : ''));
      }
    };
    input.click();
  }

  function bindSettings() {
    $('#btn-settings').onclick = () => {
      renderPalettePicker();
      renderIconPicker();
      renderAppTitleEditor();
      renderPersonLabelEditor();
      updateDeletedCountBadge();
      openModal('modal-settings');
    };

    $('#btn-deleted-history').onclick = () => {
      renderDeletedHistory();
      closeAllModals();
      openModal('modal-deleted');
    };

    $('#btn-clear-deleted').onclick = () => {
      const count = getDeletedHistory().length;
      if (count === 0) return;
      if (!confirm(`確定要清空 ${count} 筆「最近刪除」紀錄嗎?清空後就無法再復原。`)) return;
      saveDeletedHistory([]);
      renderDeletedHistory();
      showToast('已清空');
    };

    $('#btn-refresh').onclick = async () => {
      closeAllModals();
      await loadAndRender(true);   // skipCache:手動重新載入不需閃舊快取
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

    $('#btn-import').onclick = importJsonFlow;

    $('#btn-export').onclick = () => {
      if (!STATE.data) return;
      const blob = new Blob([JSON.stringify(STATE.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `購買記錄_${ymdLocal(new Date())}.json`;
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
