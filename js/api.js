/* 與 Apps Script 後端的薄薄一層通訊。 */
window.API = (function() {

  function getUrl() {
    const u = localStorage.getItem(CONFIG.STORAGE_KEYS.apiUrl);
    if (!u) throw new Error('尚未設定 API URL');
    return u;
  }

  async function get() {
    const url = getUrl();
    const res = await fetch(url + '?t=' + Date.now(), { method: 'GET' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '讀取失敗');
    return json.data;
  }

  async function post(action, data) {
    const url = getUrl();
    // 注意:用 text/plain 避開 CORS preflight;Apps Script 仍能解析 e.postData.contents
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action, data }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow'
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '寫入失敗');
    return json.data;
  }

  return {
    getAll:        () => get(),
    addPurchase:   (d) => post('add_purchase', d),
    addBank:       (d) => post('add_bank', d),
    addSavings:    (d) => post('add_savings', d),
    updateSymbol:  (d) => post('update_symbol', d),
    updateRecord:  (sheet, id, patch) => post('update_record', { sheet, id, patch }),
    deleteRecord:  (sheet, id) => post('delete_record', { sheet, id }),
    setMeta:       (key, value) => post('set_meta', { key, value })
  };
})();
