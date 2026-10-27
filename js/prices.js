/* 現價抓取與更新 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html
 * 來源順序:
 *   1. 市場資料中繼站(Cloudflare Worker,背後是證交所即時行情):盤中 = 最新成交價,收盤後 = 當天 13:30 收盤價
 *   2. 證交所 / 櫃買 OpenAPI(每日收盤資料,常晚一天):只補中繼站沒給的代號
 *   3. 都抓不到才請 Apps Script 自己抓
 * 瀏覽器直接連證交所即時行情(跨站被擋)和 Yahoo(要驗證)一定失敗,已經拿掉。
 * 「舊價格不蓋新價格」:資料日期比試算表 _price_history 裡記錄的還舊,就不寫入。 */
  const priceToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const rocYmd = (s) => { s = String(s || '').trim(); return s.length === 7 ? (parseInt(s.slice(0, 3), 10) + 1911) + '-' + s.slice(3, 5) + '-' + s.slice(5, 7) : null; };
  const priceCodes = () => ((STATE.data && STATE.data.symbols) || []).map(s => String(s.symbol || '').replace(/^代號/, '')).filter(Boolean);

  // 每個代號在 _price_history 記錄到哪一天
  function latestPriceDates() {
    const m = {};
    ((STATE.data && STATE.data.price_history) || []).forEach(r => {
      const c = String(r.symbol || '').replace(/^代號/, ''), d = String(r.date || '').slice(0, 10);
      if (c && d > (m[c] || '')) m[c] = d;
    });
    return m;
  }

  function _tFetch(url, ms) {   // 每個來源都有自己的逾時,避免卡住整個流程
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
  }

  // 抓現價。opts.workerOnly:只問中繼站(打開 APP 自動更新用,快又不吵)
  // 回傳 { got: {代號: {price, date, time}}, groups: [{date, prices}], stale: [比記錄還舊而略過的代號] };一筆都沒有回 null
  async function fetchPricesClientSide(opts = {}) {
    const codes = priceCodes();
    if (codes.length === 0) return null;
    const latest = latestPriceDates();
    const got = {}, stale = [];
    const put = (code, price, date, time) => {
      if (!(price > 0) || !date || got[code]) return;
      if (latest[code] && date < latest[code]) { stale.push(code); return; }   // 比已記錄的還舊:不要倒退
      got[code] = { price, date, time: time || '' };
    };

    // 1. 中繼站;09:00 以前證交所還沒有今天的成交(是試撮價),不採用
    try {
      const q = await marketGet('/quote?tw=' + codes.join(','));
      Object.entries(q.stocks || {}).forEach(([code, x]) => {
        const time = String((x && x.time) || '').slice(0, 5);
        if (x && time >= '09:00') put(code, Number(x.price), x.date, time);
      });
    } catch (_) { /* 中繼站失敗就交給下面的備援 */ }

    if (!opts.workerOnly) {
      // 2. 證交所 OpenAPI(上市)
      let missing = codes.filter(c => !got[c]);
      if (missing.length > 0) {
        try {
          const res = await _tFetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL?t=' + Date.now(), 15000);
          if (res.ok) {
            const set = new Set(missing);
            (await res.json()).forEach(it => {
              const code = String(it.Code || it['證券代號'] || '').trim();
              if (set.has(code)) put(code, parseFloat(String(it.ClosingPrice || it['收盤價'] || '').replace(/,/g, '')), rocYmd(it.Date), '收盤');
            });
          }
        } catch (_) { /* 靜默 */ }
      }
      // 3. 櫃買 OpenAPI(上櫃)
      missing = codes.filter(c => !got[c]);
      if (missing.length > 0) {
        try {
          const res = await _tFetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes?t=' + Date.now(), 12000);
          if (res.ok) {
            const set = new Set(missing);
            (await res.json()).forEach(it => {
              const code = String(it.SecuritiesCompanyCode || it['代號'] || it.Code || '').trim();
              if (set.has(code)) put(code, parseFloat(String(it.Close || it['收盤價'] || '').replace(/,/g, '')), rocYmd(it.Date), '收盤');
            });
          }
        } catch (_) { /* 靜默 */ }
      }
    }

    if (Object.keys(got).length === 0) return stale.length ? { got, groups: [], stale } : null;
    // 不同來源的日期可能不同(例如中繼站是今天、OpenAPI 是前一個交易日):依日期分批存,漲跌才會記在對的那天
    const byDate = {};
    Object.entries(got).forEach(([c, x]) => { (byDate[x.date] || (byDate[x.date] = {}))[c] = x.price; });
    return { got, stale, groups: Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, prices]) => ({ date, prices })) };
  }

  // 「10/27 13:30」:最新那批價格的資料時間(收盤後就是 13:30)
  function priceStamp(got) {
    const best = Object.values(got).reduce((a, x) => (x.date + x.time > a.date + a.time ? x : a), { date: '', time: '' });
    if (!best.date) return '';
    const md = best.date.slice(5).replace('-', '/');
    return md + ' ' + (/^\d\d:\d\d$/.test(best.time) ? best.time : '13:30');   // OpenAPI 的每日收盤資料沒有時間,就是 13:30 收盤
  }
  function priceStampLabel(got) {
    const best = Object.values(got).reduce((a, x) => (x.date + x.time > a.date + a.time ? x : a), { date: '', time: '' });
    const live = best.date === priceToday() && /^\d\d:\d\d$/.test(best.time) && best.time < '13:30';
    return priceStamp(got) + (live ? ' 盤中' : ' 收盤');
  }

  // 把價格套到畫面:更新 symbols 現價、漲跌記錄、「現價截至」
  function applyPrices(priceMap, histEntries, stamp) {
    if (!STATE.data) return 0;
    let applied = 0;
    (STATE.data.symbols || []).forEach(s => {
      const p = priceMap[String(s.symbol || '').replace(/^代號/, '')];
      if (p > 0) { s.current_price = p; applied++; }
    });
    if (histEntries && histEntries.length) {
      // 同一天同代號換成最新那筆(後端 readAll_ 也是這樣去重)
      const key = (r) => String(r.date || '').slice(0, 10) + '|' + String(r.symbol || '').replace(/^代號/, '');
      const fresh = new Set(histEntries.map(key));
      STATE.data.price_history = (STATE.data.price_history || []).filter(r => !fresh.has(key(r))).concat(histEntries);
      if (STATE.currentTab === 'prices' && $('#page-history').classList.contains('active')) renderPriceHistory();
    }
    if (stamp) STATE.data.meta = Object.assign(STATE.data.meta || {}, { last_price_update: stamp });
    localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
    renderAll();
    return applied;
  }

  // 依日期分批存進試算表(每批失敗重試一次);回傳合併後的 { prices, history }
  async function storePriceGroups(groups, signal) {
    const out = { prices: {}, history: [] };
    for (const g of groups) {
      let r;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { r = await API.storePrices(g.prices, g.date, signal); break; }
        catch (e) {
          if (e.name === 'AbortError' || attempt === 2) throw e;
          await new Promise(res => setTimeout(res, 3000));
        }
      }
      Object.assign(out.prices, (r && r.prices) || g.prices);
      out.history = out.history.concat((r && r.history) || []);
    }
    return out;
  }

  async function refreshPricesFlow() {
    // 取消任何進行中的 loadAndRender GET,避免舊資料回來時覆蓋掉我們即將寫入的新現價
    ++_loadSeq;
    const btn = $('#btn-refresh-prices');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 抓取中…';
    showToast('正在抓最新現價…', 60000);   // 保留至完成
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 70000);  // 70 秒強制超時
    try {
      const codes = priceCodes();
      const c = await fetchPricesClientSide().catch(() => null);
      if (c && c.groups.length) {
        const r = await storePriceGroups(c.groups, ctrl.signal);
        applyPrices(r.prices, r.history, priceStamp(c.got));
        const notFound = codes.filter(x => !c.got[x] && !c.stale.includes(x));
        const kept = c.stale.length ? `　${c.stale.length} 檔沒有更新的價格,維持原值` : '';
        showToast(`✅ 已更新 ${Object.keys(c.got).length} 檔現價 · ${priceStampLabel(c.got)}${kept}${notFound.length ? '　找不到:' + notFound.join('、') : ''}`,
          notFound.length || kept ? 6000 : 3500);
      } else if (c && c.stale.length) {
        showToast('目前沒有比記錄更新的價格,現價維持原值', 3500);
      } else {
        // 瀏覽器端完全抓不到(例如中繼站和 OpenAPI 都掛了):請 Apps Script 自己抓
        let result;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try { result = await API.refreshPrices(ctrl.signal); break; }
          catch (e) {
            if (e.name === 'AbortError' || attempt === 2) throw e;
            showToast(`⚠️ 第 ${attempt} 次失敗,3 秒後重試…`, 3000);
            await new Promise(res => setTimeout(res, 3000));
          }
        }
        const fetched = (result && result.fetched) || 0;
        if (fetched > 0) {
          const hist = (result && result.history) || [];
          applyPrices((result && result.prices) || {}, hist, hist.length ? String(hist[0].date).slice(5, 10).replace('-', '/') : '');
          const notFound = (result && result.notFound) || [];
          showToast(`✅ 已更新 ${fetched} 檔現價 (伺服器)${notFound.length ? '　找不到:' + notFound.join('、') : ''}`, notFound.length ? 6000 : 3500);
        } else {
          showToast('⚠️ 所有來源均無回應,現價維持原值', 3500);
        }
      }
    } catch (e) {
      const isTimeout = e.name === 'AbortError';
      const isNetwork = e.message === 'Failed to fetch' || e.message === 'NetworkError when attempting to fetch resource.';
      const msg = isTimeout ? '連線逾時(伺服器忙碌),請稍後再試'
                : isNetwork ? '網路不穩或伺服器暫時無回應,請稍後再試'
                : ('更新失敗:' + e.message);
      showActionToast('❌ ' + msg, '重試', refreshPricesFlow, 6000);
    } finally {
      clearTimeout(timer);
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // 打開 APP(或切回來)時自動更新現價:只問中繼站,5 分鐘最多一次
  // 有變才動:日期比記錄新,或同一天但價格不同。盤中只更新畫面;收盤後(或換了新的一天)才存進試算表
  let _autoPriceBusy = false;
  async function autoRefreshPrices() {
    if (_autoPriceBusy || !STATE.data || !priceCodes().length) return;
    let last = 0;
    try { last = Number(localStorage.getItem('pr.autoPriceAt')) || 0; } catch (_) {}
    if (Date.now() - last < 5 * 60 * 1000) return;
    _autoPriceBusy = true;
    try {
      try { localStorage.setItem('pr.autoPriceAt', String(Date.now())); } catch (_) {}
      const c = await fetchPricesClientSide({ workerOnly: true }).catch(() => null);
      if (!c || !c.groups.length) return;
      const latest = latestPriceDates(), cur = {};
      (STATE.data.symbols || []).forEach(s => { cur[String(s.symbol || '').replace(/^代號/, '')] = Number(s.current_price) || 0; });
      const changed = {};
      Object.entries(c.got).forEach(([code, x]) => {
        if (x.date > (latest[code] || '') || Math.abs(x.price - (cur[code] || 0)) > 1e-9) changed[code] = x;
      });
      if (!Object.keys(changed).length) return;
      const stamp = priceStamp(changed);
      const live = priceStampLabel(changed).endsWith('盤中');
      const prices = {};
      Object.entries(changed).forEach(([code, x]) => { prices[code] = x.price; });
      if (live) {
        applyPrices(prices, null, stamp);   // 盤中價格一直在變,先只更新畫面,不寫試算表
        return;
      }
      const byDate = {};
      Object.entries(changed).forEach(([code, x]) => { (byDate[x.date] || (byDate[x.date] = {}))[code] = x.price; });
      const r = await storePriceGroups(Object.entries(byDate).map(([date, p]) => ({ date, prices: p })));
      applyPrices(r.prices, r.history, stamp);
      showToast(`已自動更新 ${Object.keys(changed).length} 檔現價 · ${priceStampLabel(changed)}`, 3000);
    } catch (_) {
      /* 自動更新失敗不打擾,手動按「抓現價」還是可以 */
    } finally {
      _autoPriceBusy = false;
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoRefreshPrices(); });

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

