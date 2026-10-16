/* 工具:DOM 選取、狀態、格式化、toast — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const HISTORY_PAGE_SIZE = 15;

  const KEY = CONFIG.STORAGE_KEYS;
  let STATE = { data: null, currentTab: 'purchases', defaultPerson: '黃', editing: null, historyDetailsOpen: false, historyLimit: HISTORY_PAGE_SIZE, filterCategories: [], holdingsSort: null };

  // ============== Utils ==============

  const fmt = {
    money: (n) => {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return Math.round(n).toLocaleString('en-US');
    },
    moneySigned: (n) => (n >= 0 ? '+' : '') + fmt.money(n),
    pct: (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%',
    date: (s) => {
      if (!s) return '';
      const d = String(s).slice(0, 10);
      return d;
    }
  };

  // 把 Date 物件格式化為「本地時區」的 yyyy-MM-dd(避免 toISOString 轉 UTC 少 1 天)
  function ymdLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  async function sha256(s) {
    const buf = new TextEncoder().encode(s);
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function showToast(msg, durationMs) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), durationMs || 1800);
  }

  function showActionToast(msg, actionLabel, actionFn, durationMs) {
    const el = $('#toast');
    el.textContent = '';  // 清掉舊內容(包括之前可能殘留的按鈕)
    const span = document.createElement('span');
    span.textContent = msg;
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = actionLabel;
    el.appendChild(span);
    el.appendChild(btn);
    el.classList.remove('hidden');
    clearTimeout(el._t);
    let used = false;
    btn.onclick = () => {
      if (used) return;
      used = true;
      el.classList.add('hidden');
      el.textContent = '';
      try { actionFn(); } catch (_) {}
    };
    el._t = setTimeout(() => {
      el.classList.add('hidden');
      el.textContent = '';
    }, durationMs || 6000);
  }

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.add('hidden'));
    $('#' + id).classList.remove('hidden');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 把各種格式的時間戳（ISO UTC 或本地字串）統一顯示為台灣時間 MM/DD HH:mm
  function fmtPriceTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;   // 解析不了就原樣顯示
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false
    }).replace(/\//g, '/');
  }

