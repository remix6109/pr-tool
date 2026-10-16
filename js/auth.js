/* 解鎖流程、進入 APP、導覽與人員切換 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
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
      const tok = ($('#setup-token').value || '').trim();
      if (tok) localStorage.setItem(KEY.apiToken, tok); else localStorage.removeItem(KEY.apiToken);
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
    bindTownCard();
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

