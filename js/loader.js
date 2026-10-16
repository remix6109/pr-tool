/* 載入資料並重繪 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== 載入資料 ==============

  // 版本計數器：每次呼叫 loadAndRender 就遞增；
  // GET 回來後若版本不符(更新的呼叫已接管)就丟棄，不覆蓋畫面。
  let _loadSeq = 0;

  async function loadAndRender(skipCache = false) {
    const mySeq = ++_loadSeq;
    $('#home-loading').classList.remove('hidden');
    $('#home-content').classList.add('hidden');
    try {
      // 初次載入時先用快取快速顯示;刷新/更新現價時跳過,避免舊數字閃爍
      if (!skipCache) {
        const cached = localStorage.getItem(KEY.cache);
        if (cached) {
          try {
            if (mySeq === _loadSeq) {
              STATE.data = JSON.parse(cached);
              renderAll();
              $('#home-loading').classList.add('hidden');
              $('#home-content').classList.remove('hidden');
            }
          } catch (_) {}
        }
      }
      // 拉最新資料
      const data = await API.getAll();
      if (mySeq !== _loadSeq) return;   // 已有更新的呼叫接管，丟棄過期結果
      STATE.data = data;
      localStorage.setItem(KEY.cache, JSON.stringify(data));
      renderAll();
      $('#home-loading').classList.add('hidden');
      $('#home-content').classList.remove('hidden');
    } catch (e) {
      if (mySeq !== _loadSeq) return;
      // 連線失敗時退回顯示上次的資料,不要整頁只剩錯誤文字
      let fallback = STATE.data;
      if (!fallback) {
        try { fallback = JSON.parse(localStorage.getItem(KEY.cache) || 'null'); } catch (_) {}
      }
      if (fallback) {
        STATE.data = fallback;
        renderAll();
        $('#home-loading').classList.add('hidden');
        $('#home-content').classList.remove('hidden');
        showToast('連線失敗(' + e.message + '),目前顯示上次資料,下拉可重試', 4500);
      } else {
        $('#home-loading').textContent = '載入失敗:' + e.message + '(下拉或到設定按「重新載入資料」重試)';
      }
    }
  }

  function renderAll() {
    populateSymbolDropdown();
    populateYearMonthDropdown();
    renderDashboard();
  }

