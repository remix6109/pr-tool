/* 外觀:標題、人名、主題配色、圖示 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
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
    document.documentElement.dataset.palette = palette.id;
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

  function renderFxPicker() {
    const wrap = $('#fx-picker');
    if (!wrap) return;
    const cur = FX.getLevel();
    wrap.innerHTML = FX.LEVELS.map(l =>
      `<button data-fx-level="${l.id}" class="${l.id === cur ? 'active' : ''}">${l.name}</button>`
    ).join('');
    $$('#fx-picker button').forEach(b => {
      b.onclick = () => {
        FX.setLevel(b.dataset.fxLevel);
        renderFxPicker();
        if (STATE.data) renderAll();     // 圖表漸層與數字動畫要重畫才會套用
      };
    });
  }

  // 設定頁最下面的狀態:密鑰、暫存佇列、最近一次自動備份
  function renderSettingsStatus() {
    const el = $('#settings-status');
    if (!el) return;
    const lines = [];
    lines.push('存取密鑰:' + (localStorage.getItem(KEY.apiToken) ? '已設定' : '未設定'));
    const q = API.queueSize();
    if (q > 0) lines.push('待補送的暫存紀錄:' + q + ' 筆(連線後自動送出)');
    const bk = STATE.data && STATE.data.meta && STATE.data.meta.last_backup;
    lines.push('最近自動備份:' + (bk ? bk : '尚無(後端需執行 installBackupTrigger)'));
    el.innerHTML = lines.map(escapeHtml).join('<br>');
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

