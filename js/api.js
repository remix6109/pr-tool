/* 與 Apps Script 後端的薄薄一層通訊。 */
window.API = (function() {

  function getUrl() {
    const u = localStorage.getItem(CONFIG.STORAGE_KEYS.apiUrl);
    if (!u) throw new Error('尚未設定 API URL');
    return u;
  }

  const GET_TIMEOUT_MS = 30000;   // Apps Script 冷啟動可能要十幾秒
  const GET_RETRIES = 2;          // 失敗後最多再試 2 次(讀取可安全重試)

  async function getOnce() {
    const url = getUrl();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GET_TIMEOUT_MS);
    try {
      const res = await fetch(url + '?t=' + Date.now(), { method: 'GET', signal: ctrl.signal });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); }
      catch (_) { throw new Error('伺服器回應異常(可能剛喚醒或暫時忙碌)'); }
      if (!json.ok) { const e = new Error(json.error || '讀取失敗'); e.fatal = true; throw e; }
      return json.data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('連線逾時');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function get() {
    let lastErr;
    for (let i = 0; i <= GET_RETRIES; i++) {
      try { return await getOnce(); }
      catch (e) {
        lastErr = e;
        if (e.fatal || e.message === '尚未設定 API URL') break;   // 後端明確回錯誤,重試沒用
        if (i < GET_RETRIES) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw lastErr;
  }

  async function post(action, data, signal) {
    const url = getUrl();
    // 注意:用 text/plain 避開 CORS preflight;Apps Script 仍能解析 e.postData.contents
    const opts = {
      method: 'POST',
      body: JSON.stringify({ action, data }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow'
    };
    if (signal) opts.signal = signal;
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '寫入失敗');
    return json.data;
  }

  return {
    getAll:        () => get(),
    addPurchase:   (d) => post('add_purchase', d),
    addBank:       (d) => post('add_bank', d),
    addSavings:    (d) => post('add_savings', d),
    addDividend:   (d) => post('add_dividend', d),
    updateSymbol:  (d) => post('update_symbol', d),
    updateRecord:  (sheet, id, patch) => post('update_record', { sheet, id, patch }),
    deleteRecord:  (sheet, id) => post('delete_record', { sheet, id }),
    setMeta:       (key, value) => post('set_meta', { key, value }),
    refreshPrices: (signal) => post('refresh_prices', {}, signal),
    storePrices:   (prices, date, signal) => post('store_prices', { prices, date }, signal),
    takeSnapshot:  () => post('take_snapshot', {})
  };
})();
