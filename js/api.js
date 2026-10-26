/* 與 Apps Script 後端的薄薄一層通訊。
 * - 存取密鑰:設定後每個請求都會帶上(後端有設密鑰時才會驗證)。
 * - 新增類請求(add_*)帶 client_id,後端以它去重 → 連點、逾時重送都不會多一筆。
 * - 新增類請求若「沒連上伺服器」(斷線/逾時),先存進本機佇列,連線後自動補送。 */
window.API = (function() {

  const GET_TIMEOUT_MS = 30000;   // Apps Script 冷啟動可能要十幾秒
  const GET_RETRIES = 2;          // 讀取失敗後最多再試 2 次(讀取可安全重試)
  const POST_TIMEOUT_MS = 30000;        // 新增類寫入
  const LONG_POST_TIMEOUT_MS = 120000;  // 抓現價等伺服器端較久的動作

  function getUrl() {
    const u = localStorage.getItem(CONFIG.STORAGE_KEYS.apiUrl);
    if (!u) throw new Error('尚未設定 API URL');
    return u;
  }
  function getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.apiToken) || '';
  }

  function newClientId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // 沒拿到伺服器回應(斷線、逾時、被擋):請求是否到達伺服器不確定
  function isNetworkError(e) {
    return !e.fatal && (e.name === 'AbortError' || e.name === 'TypeError' || /逾時|回應異常/.test(e.message));
  }

  async function getOnce() {
    const url = getUrl();
    const token = getToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GET_TIMEOUT_MS);
    try {
      let res;
      if (token) {
        // 有密鑰時改用 POST,避免密鑰出現在網址(網址會留在紀錄裡)
        res = await fetch(url, {
          method: 'POST', signal: ctrl.signal, redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'get_all', token })
        });
      } else {
        res = await fetch(url + '?t=' + Date.now(), { method: 'GET', signal: ctrl.signal });
      }
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

  // 單次送出(不處理佇列)
  async function postRaw(action, data, signal) {
    const url = getUrl();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), /^add_/.test(action) ? POST_TIMEOUT_MS : LONG_POST_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', () => ctrl.abort());
    try {
      // 注意:用 text/plain 避開 CORS preflight;Apps Script 仍能解析 e.postData.contents
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ action, data, token: getToken() }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        signal: ctrl.signal
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); }
      catch (_) { throw new Error('伺服器回應異常(可能剛喚醒或暫時忙碌)'); }
      if (!json.ok) { const e = new Error(json.error || '寫入失敗'); e.fatal = true; throw e; }
      return json.data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('連線逾時');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- 離線佇列(只收 add_* 新增類請求) ----------
  const QK = () => CONFIG.STORAGE_KEYS.queue;
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QK()) || '[]'); } catch (_) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QK(), JSON.stringify(q)); } catch (_) {}
  }
  function queueSize() { return readQueue().length; }

  let flushing = false;
  // 依序補送;遇到網路問題就停(下次再試),後端明確拒絕的丟掉並回報
  async function flushQueue() {
    if (flushing) return { sent: 0, left: queueSize() };
    flushing = true;
    let sent = 0, dropped = 0;
    try {
      let q = readQueue();
      while (q.length) {
        const item = q[0];
        try {
          await postRaw(item.action, item.data);
          sent++;
        } catch (e) {
          if (isNetworkError(e)) break;
          dropped++;                       // 後端明確回錯誤(例如格式不對),重送也不會成功
        }
        q = readQueue().slice(1);
        writeQueue(q);
      }
    } finally {
      flushing = false;
    }
    if (sent > 0) window.dispatchEvent(new CustomEvent('pr-queue-flushed', { detail: { sent } }));
    if (dropped > 0 && window.showToast) showToast(dropped + ' 筆暫存的紀錄被後端拒絕,已略過');
    return { sent, dropped, left: queueSize() };
  }

  async function post(action, data, signal) {
    if (!/^add_/.test(action)) return postRaw(action, data, signal);
    data = Object.assign({ client_id: newClientId() }, data);   // 呼叫端自帶的 client_id 優先
    try {
      return await postRaw(action, data, signal);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      const q = readQueue();
      q.push({ action, data, at: Date.now() });
      writeQueue(q);
      if (window.showToast) showToast('目前連不上伺服器,已暫存 ' + q.length + ' 筆,連線後自動補送', 4000);
      return { id: data.client_id, queued: true };
    }
  }

  return {
    getAll:        () => get(),
    addPurchase:   (d) => post('add_purchase', d),
    addBank:       (d) => post('add_bank', d),
    addSavings:    (d) => post('add_savings', d),
    addDividend:   (d) => post('add_dividend', d),
    addIsland:     (d) => post('add_island', d),
    updateSymbol:  (d) => post('update_symbol', d),
    updateRecord:  (sheet, id, patch) => post('update_record', { sheet, id, patch }),
    deleteRecord:  (sheet, id) => post('delete_record', { sheet, id }),
    setMeta:       (key, value) => post('set_meta', { key, value }),
    refreshPrices: (signal) => post('refresh_prices', {}, signal),
    storePrices:   (prices, date, signal) => post('store_prices', { prices, date }, signal),
    takeSnapshot:  () => post('take_snapshot', {}),
    flushQueue, queueSize
  };
})();
