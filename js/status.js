/* 系統狀態 — 設定頁裡的「🩺 系統狀態」:一眼看出 APP、資料同步、現價、自動排程、市場中繼站是不是正常。
 * 只讀取、不會改任何資料。每一項回傳 { level: 'ok' | 'warn' | 'bad', label, detail }。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  // 最近一個「應該已經有收盤價」的交易日:平日下午 2:30 以後算今天,否則往前找平日(不認得國定假日)
  function statusExpectedCloseDay(now) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const afterClose = now.getHours() * 60 + now.getMinutes() >= 14 * 60 + 30;
    if (!afterClose || d.getDay() % 6 === 0) d.setDate(d.getDate() - 1);
    while (d.getDay() % 6 === 0) d.setDate(d.getDate() - 1);
    return ymdLocal(d);
  }

  // 不用連網就能判斷的項目
  function statusLocalChecks(now) {
    now = now || new Date();
    const d = STATE.data || {}, out = [];
    const md = (s) => s ? +s.slice(5, 7) + '/' + +s.slice(8, 10) : '';
    // 資料同步
    const sync = STATE.lastSync;
    if (sync && sync.ok) {
      const min = Math.round((now.getTime() - sync.at) / 60000);
      out.push({ level: 'ok', label: '資料同步', detail: `${min < 1 ? '剛剛' : min + ' 分鐘前'}和試算表同步成功(花了 ${(sync.ms / 1000).toFixed(1)} 秒)` });
    } else if (sync && !sync.ok) {
      out.push({ level: 'bad', label: '資料同步', detail: '上次連不上試算表(' + sync.error + '),目前顯示的是這支手機上次存的資料' });
    } else out.push({ level: 'warn', label: '資料同步', detail: '這次開啟還沒同步過' });
    // 每日收盤價(下午自動排程)
    const dates = (d.price_history || []).map(r => String(r.date || '').slice(0, 10)).filter(Boolean).sort();
    const latest = dates[dates.length - 1] || '', expect = statusExpectedCloseDay(now);
    const upd = d.meta && d.meta.last_price_update ? (typeof fmtPriceTs === 'function' ? fmtPriceTs(d.meta.last_price_update) : d.meta.last_price_update) : '';
    if (!latest) out.push({ level: 'warn', label: '每日收盤價', detail: '還沒有任何收盤價紀錄' });
    else if (latest >= expect) out.push({ level: 'ok', label: '每日收盤價', detail: `已記錄到 ${md(latest)}${upd ? '(最後更新 ' + upd + ')' : ''},下午的自動排程正常` });
    else {
      const gap = Math.round((Date.parse(expect) - Date.parse(latest)) / 864e5);
      out.push({ level: gap >= 3 ? 'bad' : 'warn', label: '每日收盤價',
        detail: `只記錄到 ${md(latest)},${md(expect)} 的還沒有。${gap >= 3 ? '下午 2 點的自動排程可能沒在跑' : '如果那天休市就是正常的'};可以按首頁的「抓現價」補上` });
    }
    // 待補送
    const q = typeof API !== 'undefined' && API.queueSize ? API.queueSize() : 0;
    out.push(q > 0 ? { level: 'warn', label: '待補送的紀錄', detail: `有 ${q} 筆離線時新增的紀錄還沒送出,連上網路會自動補送` }
      : { level: 'ok', label: '待補送的紀錄', detail: '沒有,新增的紀錄都已經寫進試算表' });
    // 課程內容(雲端每月 1、11、21 日自動更新)
    if (typeof ALL_LESSON_SETS === 'function') {
      const lessons = ALL_LESSON_SETS().reduce((a, x) => a.concat(x[1]), []);
      const last = lessons.map(l => l.added || '').sort().pop() || '';
      const days = last ? Math.round((Date.parse(ymdLocal(now)) - Date.parse(last)) / 864e5) : null;
      out.push({ level: days !== null && days > 14 ? 'warn' : 'ok', label: '課程內容',
        detail: `共 ${lessons.length} 堂課${last ? `,最近一次新增在 ${md(last)}` : ''}。${days !== null && days > 14 ? '超過兩週沒有新課,每 10 天的自動更新可能沒在跑' : '每月 1、11、21 日會自動加新課'}` });
    }
    // 資料量
    out.push({ level: 'ok', label: '資料量', detail: `買賣 ${(d.purchases || []).length} 筆・配息 ${(d.dividends || []).length} 筆・收盤價 ${(d.price_history || []).length} 筆・標的 ${(d.symbols || []).length} 檔` });
    return out;
  }

  // 要連網的項目:APP 版本、市場中繼站
  async function statusRemoteChecks() {
    const out = [];
    try {
      let mine = '';
      if (window.caches) mine = ((await caches.keys()).filter(k => /^pr-app-/.test(k)).sort().pop() || '').replace('pr-app-', '');
      const res = await fetch('sw.js?t=' + Date.now(), { cache: 'no-store' });
      const m = (await res.text()).match(/CACHE_VERSION = '([^']+)'/);
      const online = m ? m[1] : '';
      if (!online) out.push({ level: 'warn', label: 'APP 版本', detail: '讀不到線上版本' });
      else if (!mine) out.push({ level: 'ok', label: 'APP 版本', detail: `線上是 ${online}(這個瀏覽器沒有安裝離線版)` });
      else if (mine === online) out.push({ level: 'ok', label: 'APP 版本', detail: `${mine},已經是最新版` });
      else out.push({ level: 'warn', label: 'APP 版本', detail: `這支手機是 ${mine},線上已經有 ${online};把 APP 完全關掉再打開就會更新` });
    } catch (e) {
      out.push({ level: 'warn', label: 'APP 版本', detail: '目前離線,沒辦法確認是不是最新版' });
    }
    try {
      const t0 = Date.now();
      const q = await marketGet('/quote?tw=0056');
      const ms = Date.now() - t0, x = q && q.stocks && q.stocks['0056'];
      out.push(x && x.price > 0 ? { level: 'ok', label: '市場中繼站', detail: `正常(${(ms / 1000).toFixed(1)} 秒),證交所報價 ${x.date ? +x.date.slice(5, 7) + '/' + +x.date.slice(8, 10) : ''} ${String(x.time || '').slice(0, 5)}` }
        : { level: 'warn', label: '市場中繼站', detail: '連得上,但證交所沒有回報價(盤前或維護中)' });
    } catch (e) {
      out.push({ level: 'bad', label: '市場中繼站', detail: '連不上(' + (e.message || e) + ');現價、新聞、台股群島會受影響' });
    }
    return out;
  }

  async function renderStatus() {
    const box = $('#status-body');
    if (!box) return;
    const row = (x) => `<div class="st-row ${x.level}"><span class="st-dot">${x.level === 'ok' ? '✅' : x.level === 'warn' ? '⚠️' : '❌'}</span>
      <span><b>${escapeHtml(x.label)}</b><br><span class="muted small">${escapeHtml(x.detail)}</span></span></div>`;
    const local = statusLocalChecks();
    box.innerHTML = local.map(row).join('') + '<div class="muted small" id="status-wait" style="padding:8px 0;">正在檢查 APP 版本和市場中繼站…</div>';
    const remote = await statusRemoteChecks();
    if (!$('#status-body')) return;
    const all = remote.concat(local);
    const bad = all.filter(x => x.level === 'bad').length, warn = all.filter(x => x.level === 'warn').length;
    box.innerHTML = `<div class="st-sum ${bad ? 'bad' : warn ? 'warn' : 'ok'}">${bad ? `有 ${bad} 項不正常` : warn ? `大致正常,有 ${warn} 項要留意` : '全部正常'}</div>`
      + all.map(row).join('')
      + '<div class="muted small" style="margin-top:8px;">檢查時間 ' + new Date().toLocaleTimeString('zh-TW', { hour12: false }) + '。這一頁只讀取狀態,不會改任何資料。</div>';
  }
