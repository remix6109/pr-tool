/* 現價抓取與更新 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  async function fetchPricesClientSide() {
    const symbols = STATE.data && STATE.data.symbols;
    if (!symbols || symbols.length === 0) return null;
    const codes = symbols.map(s => String(s.symbol || '').replace(/^代號/, '')).filter(Boolean);
    if (codes.length === 0) return null;

    // 每個來源都加上獨立的 AbortController，避免連線卡住時整個流程永遠等待
    function _tFetch(url, ms) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), ms);
      return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
    }

    const merged = {};
    let dataDate = null;

    // ── 嘗試 TWSE MIS（即時行情；瀏覽器 IP 不被 TWSE 封鎖）──
    // CORS 許可時可拿到盤中 / 最新成交價（當日資料）。
    // 若 TWSE 不開放跨域或連線逾時（8s），靜默跳過。
    try {
      const allIds = codes.map(c => 'tse_' + c + '.tw')
                          .concat(codes.map(c => 'otc_' + c + '.tw'))
                          .join('|');
      const misUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=' +
                     encodeURIComponent(allIds) + '&_=' + Date.now();
      const misRes = await _tFetch(misUrl, 8000);
      if (misRes.ok) {
        const data = await misRes.json();
        (data.msgArray || []).forEach(item => {
          const code  = String(item.c || '').trim();
          const price = parseFloat(item.z);
          if (code && price > 0) merged[code] = price;
        });
        if (Object.keys(merged).length > 0) {
          const now = new Date();
          dataDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        }
      }
    } catch (_) { /* CORS、逾時或網路問題，靜默跳過 */ }

    // ── Yahoo Finance（15 分鐘延遲；CORS 開放，有當日資料）──
    // 上市用 .TW、上櫃用 .TWO；一次請求涵蓋全部代號
    const yfMissing = codes.filter(c => !merged[c]);
    if (yfMissing.length > 0) {
      try {
        const yfSyms = yfMissing.flatMap(c => [c + '.TW', c + '.TWO']).join(',');
        const yfRes = await _tFetch(
          'https://query2.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(yfSyms),
          10000
        );
        if (yfRes.ok) {
          const yfJson = await yfRes.json();
          ((yfJson.quoteResponse || {}).result || []).forEach(item => {
            const code  = String(item.symbol || '').replace(/\.(TW|TWO)$/i, '').trim();
            const price = Number(item.regularMarketPrice || 0);
            if (code && price > 0 && !merged[code]) {
              merged[code] = price;
              if (!dataDate && item.regularMarketTime) {
                const d = new Date(item.regularMarketTime * 1000);
                dataDate = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
              }
            }
          });
        }
      } catch (_) { /* Yahoo Finance 失敗，靜默跳過 */ }
    }

    // ── 補充 TWSE OpenAPI（上市 ETF + 股票；收盤後更新，今日或前日資料）──
    const missingTwse = codes.filter(c => !merged[c]);
    if (missingTwse.length > 0) {
      try {
        const tRes = await _tFetch(
          'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL?t=' + Date.now(), 15000);
        if (tRes.ok) {
          const arr = await tRes.json();
          const codeSet = new Set(missingTwse);
          arr.forEach(item => {
            const code  = String(item['Code'] || item['證券代號'] || '').trim();
            if (!codeSet.has(code)) return;
            const price = parseFloat(String(item['ClosingPrice'] || item['Close'] || item['收盤價'] || '').replace(/,/g, ''));
            if (price > 0) {
              merged[code] = price;
              if (!dataDate) {
                const d = String(item['Date'] || '').trim();
                if (d.length === 7) {
                  dataDate = (parseInt(d.substring(0, 3), 10) + 1911) + '-' +
                             d.substring(3, 5) + '-' + d.substring(5, 7);
                }
              }
            }
          });
        }
      } catch (_) { /* OpenAPI 失敗，靜默跳過 */ }
    }

    // ── 補充 TPEX OpenAPI（上櫃股票 + ETF）──
    const missingTpex = codes.filter(c => !merged[c]);
    if (missingTpex.length > 0) {
      try {
        const pRes = await _tFetch(
          'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes?t=' + Date.now(), 12000);
        if (pRes.ok) {
          const arr = await pRes.json();
          const codeSet = new Set(missingTpex);
          arr.forEach(item => {
            const code  = String(item['SecuritiesCompanyCode'] || item['代號'] || item['Code'] || '').trim();
            if (!codeSet.has(code)) return;
            const price = parseFloat(String(item['Close'] || item['收盤價'] || '').replace(/,/g, ''));
            if (price > 0) merged[code] = price;
          });
        }
      } catch (_) { /* TPEX 失敗，靜默跳過 */ }
    }

    if (Object.keys(merged).length === 0) return null;

    if (!dataDate) {
      const now = new Date();
      dataDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    }
    return { prices: merged, date: dataDate };
  }

  async function refreshPricesFlow() {
    // 取消任何進行中的 loadAndRender GET，避免舊資料回來時覆蓋掉我們即將寫入的新現價
    ++_loadSeq;
    const btn = $('#btn-refresh-prices');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 抓取中…';
    showToast('正在從證交所抓最新現價…', 60000);   // 保留至完成
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 70000);  // 70 秒強制超時（TWSE 多層備援需時）
    try {
      // ── 優先從瀏覽器端直接抓取（瀏覽器 IP 不被 TWSE 封鎖）──
      // 成功時只需請 Apps Script 存檔，不需重新發外部請求。
      // 失敗（CORS 封鎖、離線等）時退回讓 Apps Script 完整抓取。
      let result;
      let _clientData = null;
      try { _clientData = await fetchPricesClientSide(); } catch (_) { /* 靜默 */ }

      // 根據瀏覽器端是否取得資料，選擇呼叫哪個 API
      const _apiCall = (_clientData && Object.keys(_clientData.prices).length > 0)
        ? () => API.storePrices(_clientData.prices, _clientData.date, ctrl.signal)
        : () => API.refreshPrices(ctrl.signal);

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await _apiCall();
          break;  // 成功就跳出
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') throw fetchErr;  // 逾時不重試
          if (attempt < 2) {
            showToast(`⚠️ 第 ${attempt} 次失敗，3 秒後重試…`, 3000);
            await new Promise(r => setTimeout(r, 3000));
          } else {
            throw fetchErr;  // 兩次都失敗才丟出
          }
        }
      }
      clearTimeout(timer);
      const fetched   = (result && result.fetched)   || 0;
      const notFound  = (result && result.notFound)  || [];
      const priceMap  = (result && result.prices)    || {};

      // ── 更新 STATE.data.symbols 現價 ──
      if (Object.keys(priceMap).length > 0 && STATE.data && STATE.data.symbols) {
        // 新版 Code.gs：POST 直接帶回價格 → 就地更新，不需第二次 GET
        // 代號可能含「代號」前綴(如「代號0056」)，查表時 strip
        let applied = 0;
        STATE.data.symbols.forEach(s => {
          const key = String(s.symbol || '').replace(/^代號/, '');
          const p = priceMap[key];
          if (p && p > 0) { s.current_price = p; applied++; }
        });
        if (applied > 0) {
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
        } else {
          await loadAndRender(true);  // key 對不上 → 退回 GET
        }
      } else if (fetched > 0) {
        await loadAndRender(true);    // 舊版 Code.gs 相容
      }

      // ── 更新 STATE.data.price_history（讓「漲跌」tab 立即看到新紀錄）──
      const histEntries = (result && result.history) || [];
      if (histEntries.length > 0 && STATE.data) {
        if (!STATE.data.price_history) STATE.data.price_history = [];
        // 移除同日期的舊紀錄（今天的資料換成最新一批）
        const newDates = new Set(histEntries.map(r => String(r.date || '').slice(0, 10)));
        STATE.data.price_history = STATE.data.price_history
          .filter(r => !newDates.has(String(r.date || '').slice(0, 10)))
          .concat(histEntries);
        localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        // 若目前正在看漲跌 tab，立即重繪
        if (STATE.currentTab === 'prices' && $('#page-history').classList.contains('active')) {
          renderPriceHistory();
        }
      }

      if (fetched > 0) {
        // 立刻更新「現價截至」顯示，不需等下次 GET
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        const tsStr = mm + '/' + dd + ' ' + hh + ':' + mi;
        const timeEl = $('#price-update-time');
        if (timeEl) timeEl.textContent = '現價截至 ' + tsStr;
        if (STATE.data && STATE.data.meta) STATE.data.meta.last_price_update = tsStr;

        const missingNote = notFound.length > 0 ? `　找不到：${notFound.join('、')}` : '';
        // 顯示資料來源 + 日期，方便診斷是否取到當日資料
        const _srcDate = _clientData
          ? _clientData.date          // 瀏覽器端路徑
          : (histEntries.length > 0 ? String(histEntries[0].date || '').slice(0, 10) : null);
        const _dateLabel = _srcDate ? ` · ${_srcDate.slice(5).replace('-', '/')} 資料` : '';
        const _srcLabel  = _clientData ? ' (瀏覽器直取)' : ' (伺服器)';
        showToast(`✅ 已更新 ${fetched} 檔現價${_dateLabel}${_srcLabel}${missingNote}`,
                  notFound.length > 0 ? 6000 : 3500);
      } else {
        showToast('⚠️ 所有來源均無回應，現價維持原值', 3500);
      }
    } catch (e) {
      clearTimeout(timer);
      const isTimeout = e.name === 'AbortError';
      const isNetwork = e.message === 'Failed to fetch' || e.message === 'NetworkError when attempting to fetch resource.';
      const msg = isTimeout ? '連線逾時（伺服器忙碌），請稍後再試'
                : isNetwork ? '網路不穩或伺服器暫時無回應，請稍後再試'
                : ('更新失敗：' + e.message);
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

