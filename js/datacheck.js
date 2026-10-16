/* 資料檢查 — 掃過購買與股利紀錄,標出疑似打錯或矛盾的地方,可直接點「編輯」修正。
 * 只讀取、不會自動改你的資料。所有檔案共用全域範圍,載入順序見 index.html */

  // 回傳 { warns: [...], infos: [...], note }  每項 { sheet, id, title, msg }
  function runDataCheck() {
    const d = STATE.data || {};
    const warns = [], infos = [];
    const today = autodivYmd(new Date());
    const dow = (ymd) => '日一二三四五六'[new Date(ymd + 'T00:00:00').getDay()];
    const ymdOf = (r) => String(r.date || '').slice(0, 10);
    const label = (r) => `${getPersonLabel(r.person)} ${r.symbol || ''} ${ymdOf(r)}`;
    const add = (list, sheet, r, msg) => list.push({ sheet, id: r.id, title: label(r), msg });
    const symbols = new Set((d.symbols || []).map(s => s.symbol));
    const purchases = d.purchases || [], dividends = d.dividends || [];

    // ---- 購買紀錄 ----
    const seen = {};
    purchases.forEach(r => {
      const dt = ymdOf(r);
      const shares = Number(r.shares) || 0, amount = Number(r.amount) || 0, price = Number(r.price) || 0;
      if (!CONFIG.PEOPLE.includes(r.person)) add(warns, '_purchases', r, `人員「${r.person}」不在黃/蘇之中`);
      if (!dt || isNaN(new Date(dt))) add(warns, '_purchases', r, '日期格式不正確');
      else {
        if (dt > today) add(warns, '_purchases', r, '日期在未來');
        else if (dt < '2015-01-01') add(warns, '_purchases', r, '日期太久以前,年份可能打錯');
        const w = dow(dt);
        if (w === '日' || w === '六') add(infos, '_purchases', r, `日期是星期${w}(非交易日)。若實際成交日不同,可能影響除息資格判斷`);
      }
      if (price > 0 && shares !== 0) {
        const expect = Math.abs(price * shares);
        if (Math.abs(Math.abs(amount) - expect) > Math.max(50, expect * 0.02)) {
          add(warns, '_purchases', r, `金額 ${fmt.money(Math.abs(amount))} 與 單價 ${price} × ${fmt.money(Math.abs(shares))} 股 = ${fmt.money(expect)} 差距較大`);
        }
      }
      if (r.symbol && !symbols.has(r.symbol)) add(infos, '_purchases', r, `代號 ${r.symbol} 不在「標的」清單裡(現價、配息估算會缺)`);
      const k = [r.person, r.symbol, dt, amount, shares].join('|');
      (seen[k] = seen[k] || []).push(r);
    });
    Object.values(seen).forEach(list => {
      if (list.length > 1) list.forEach(r => add(warns, '_purchases', r, `與另外 ${list.length - 1} 筆完全相同(人、代號、日期、金額、股數),可能重複輸入`));
    });

    // ---- 賣出超過持有 ----
    const held = {};
    purchases.slice().sort((a, b) => ymdOf(a) < ymdOf(b) ? -1 : ymdOf(a) > ymdOf(b) ? 1 : 0).forEach(r => {
      const key = r.person + '|' + r.symbol;
      held[key] = (held[key] || 0) + (Number(r.shares) || 0);
      if (held[key] < -0.0001) { add(warns, '_purchases', r, `賣出後持股變成 ${fmt.money(held[key])} 股(賣超過持有)`); held[key] = 0; }
    });

    // ---- 股利紀錄 ----
    const history = Array.isArray(_exDiv.list) ? _exDiv.list : null;
    const dseen = {};
    dividends.forEach(r => {
      const dt = ymdOf(r);
      const aps = Number(r.amount_per_share) || 0, sh = Number(r.shares) || 0, total = Number(r.total) || 0;
      if (!dt || isNaN(new Date(dt))) add(warns, '_dividends', r, '日期格式不正確');
      else if (dt > today) add(warns, '_dividends', r, '入帳日期在未來');
      if (aps > 0 && sh > 0) {
        const gross = aps * sh;
        if (total > gross + 5 || total < gross * 0.95 - 30) {
          add(warns, '_dividends', r, `實領 ${fmt.money(total)} 與 每股 ${aps} × ${fmt.money(sh)} 股 = ${fmt.money(gross)} 差距超過一般的費用範圍`);
        }
      }
      if (history && dt) {
        const evs = history.filter(e => e.symbol === r.symbol && e.exDate <= dt && dt <= autodivAddDays(e.exDate, AUTODIV.PAID_WINDOW_DAYS));
        if (evs.length > 0) {
          if (aps > 0 && !evs.some(e => Math.abs(e.perShare - aps) < 0.0005)) {
            add(warns, '_dividends', r, `每股配息填 ${aps},證交所該期是 ${evs.map(e => e.perShare).join(' / ')}`);
          }
          // 你記的股數 vs 依購買紀錄與除息資格推算的股數
          const ev = evs.find(e => aps > 0 && Math.abs(e.perShare - aps) < 0.0005) || evs[evs.length - 1];
          const should = autodivSharesBefore(r.person, r.symbol, ev.exDate);
          if (sh > 0 && should > 0 && sh !== should) {
            add(warns, '_dividends', r, `你記的領息股數 ${fmt.money(sh)},依購買紀錄與除息資格(${ev.exDate} 除息)推算是 ${fmt.money(should)}。購買日期可能有誤`);
          } else if (!(sh > 0) && aps > 0 && should > 0) {
            const gross = should * aps;
            if (Math.abs(total - gross) > Math.max(30, gross * 0.04)) {
              add(infos, '_dividends', r, `依購買紀錄推算應領約 ${fmt.money(gross)},你記 ${fmt.money(total)}`);
            }
          }
        }
      }
      const k = [r.person, r.symbol, dt, total].join('|');
      (dseen[k] = dseen[k] || []).push(r);
    });
    Object.values(dseen).forEach(list => {
      if (list.length > 1) list.forEach(r => add(warns, '_dividends', r, `與另外 ${list.length - 1} 筆完全相同,可能重複輸入`));
    });

    const note = history ? '' : '證交所歷史除息資料還沒載入,每股配息與股數的比對暫時略過(回首頁等幾秒再檢查)。';
    return { warns, infos, note, total: purchases.length + dividends.length };
  }

  function renderDataCheck() {
    const r = runDataCheck();
    const group = (title, list, cls) => list.length === 0 ? '' : `
      <div class="dc-group ${cls}">
        <div class="dc-title">${title}(${list.length})</div>
        ${list.map(it => `
          <div class="dc-item">
            <div class="dc-main"><b>${escapeHtml(it.title)}</b><div class="muted small">${escapeHtml(it.msg)}</div></div>
            <button class="btn ghost small" data-dc-sheet="${it.sheet}" data-dc-id="${escapeHtml(String(it.id))}">編輯</button>
          </div>`).join('')}
      </div>`;
    const summary = r.warns.length === 0
      ? `<div class="dc-ok">✅ 沒有發現需要處理的問題(已檢查 ${r.total} 筆購買與股利紀錄)</div>`
      : `<div class="muted small">已檢查 ${r.total} 筆購買與股利紀錄,有 ${r.warns.length} 項建議處理。</div>`;
    $('#datacheck-body').innerHTML = summary
      + (r.note ? `<div class="muted small" style="margin:6px 0;">⚠️ ${escapeHtml(r.note)}</div>` : '')
      + group('建議處理', r.warns, 'warn') + group('僅供參考', r.infos, 'info');
    $$('#datacheck-body [data-dc-id]').forEach(b => {
      b.onclick = () => { closeAllModals(); openEditModal(b.dataset.dcSheet, b.dataset.dcId); };
    });
  }

  function bindDataCheck() {
    const b = $('#btn-datacheck');
    if (!b) return;
    b.onclick = () => {
      if (!STATE.data) return;
      closeAllModals();
      renderDataCheck();
      openModal('modal-datacheck');
    };
  }
