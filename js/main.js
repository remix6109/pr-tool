/* 啟動 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== Init ==============

  document.addEventListener('DOMContentLoaded', () => { FX.init(); bootAuth(); });
  window.addEventListener('online', () => API.flushQueue());
  window.addEventListener('pr-queue-flushed', (e) => {
    showToast('已補送 ' + e.detail.sent + ' 筆暫存的紀錄');
    loadAndRender(true);
  });
