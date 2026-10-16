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
      if (mySeq === _loadSeq) $('#home-loading').textContent = '載入失敗:' + e.message;
    }
  }

  function renderAll() {
    populateSymbolDropdown();
    populateYearMonthDropdown();
    renderDashboard();
  }

