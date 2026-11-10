/* 定期定額 — 設定「每月幾號、誰、買哪一檔、多少錢」,時間到了首頁出現「待確認買進」,
 * 按「記一筆買進」會帶入買進表單,填上實際成交價和股數後才寫入(不會自動幫你記帳)。
 * 計畫存在試算表 _meta 的 dca_plans(JSON),兩支手機會同步;「這個月略過」只記在這支手機。
 * 沒有設定任何計畫時,首頁完全不會出現這張卡。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const DCA_DISMISS_KEY = 'pr.dcaDismissed';

  // 計畫:[{ id, person, symbol, amount, day(1~28), start('YYYY-MM'), on }]
  function dcaPlans() {
    const raw = STATE.data && STATE.data.meta && STATE.data.meta.dca_plans;
    if (!raw) return [];
    try {
      const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(list) ? list.filter(p => p && p.id && p.symbol && p.person) : [];
    } catch (_) { return []; }
  }
  async function dcaSavePlans(plans) {
    const json = JSON.stringify(plans);
    const meta = STATE.data.meta || (STATE.data.meta = {});
    const prev = meta.dca_plans;
    meta.dca_plans = json;                       // 先更新畫面,失敗再還原
    try {
      await API.setMeta('dca_plans', json);
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      return true;
    } catch (e) {
      meta.dca_plans = prev;
      alert('儲存失敗:' + e.message);
      return false;
    }
  }
  function dcaDismissed() {
    try { return new Set(JSON.parse(localStorage.getItem(DCA_DISMISS_KEY) || '[]')); } catch (_) { return new Set(); }
  }
  function dcaDismiss(key) {
    const s = dcaDismissed(); s.add(key);
    try { localStorage.setItem(DCA_DISMISS_KEY, JSON.stringify(Array.from(s).slice(-200))); } catch (_) {}
  }

  // 目前該買還沒記的 → [{ key, plan, month, due }];只看這個月和上個月,那個月已經有那檔的買進紀錄就不算
  function computePendingDca(todayYmd) {
    if (!STATE.data) return [];
    const today = todayYmd || ymdLocal(new Date());
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    const months = [m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'), today.slice(0, 7)];
    const dismissed = dcaDismissed();
    const code = (s) => String(s || '').replace(/^代號/, '');
    const bought = new Set();   // 人|代號|年月
    (STATE.data.purchases || []).forEach(r => {
      if (Number(r.shares) > 0) bought.add(r.person + '|' + code(r.symbol) + '|' + String(r.date || '').slice(0, 7));
    });
    const out = [];
    dcaPlans().forEach(p => {
      if (p.on === false) return;
      months.forEach(mo => {
        if (p.start && mo < p.start) return;
        const due = mo + '-' + String(Math.min(28, Math.max(1, Number(p.day) || 1))).padStart(2, '0');
        const key = p.id + '|' + mo;
        if (due > today || dismissed.has(key) || bought.has(p.person + '|' + code(p.symbol) + '|' + mo)) return;
        out.push({ key, plan: p, month: mo, due });
      });
    });
    return out.sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
  }

  // 首頁的「待確認買進」
  function renderPendingDca() {
    const card = $('#card-pending-dca');
    if (!card || !STATE.data) return;
    const items = computePendingDca();
    if (items.length === 0) { card.classList.add('hidden'); return; }
    $('#pending-dca-list').innerHTML = items.map((it, i) => `<div class="pdiv-row" data-i="${i}">
        <div class="pdiv-main">
          <div><b>${escapeHtml(it.plan.symbol)}</b> · ${escapeHtml(getPersonLabel(it.plan.person))}
            <span class="muted small">${+it.due.slice(5, 7)}/${+it.due.slice(8, 10)} 到期</span></div>
          <div class="muted small">每月 ${Number(it.plan.day)} 號・預計 <span class="pdiv-amt">${fmt.money(Number(it.plan.amount) || 0)}</span> 元</div>
        </div>
        <div class="pdiv-actions">
          <button class="btn primary small" data-dca="confirm">記一筆買進</button>
          <button class="btn ghost small" data-dca="skip">這個月略過</button>
        </div>
      </div>`).join('');
    card.classList.remove('hidden');
    $$('#pending-dca-list .pdiv-row').forEach(row => {
      const it = items[Number(row.dataset.i)];
      row.querySelector('[data-dca="confirm"]').onclick = () => confirmPendingDca(it);
      row.querySelector('[data-dca="skip"]').onclick = () => { dcaDismiss(it.key); renderPendingDca(); };
    });
  }

  // 帶入買進表單:金額和日期先填好,成交價和股數由你填實際的
  function confirmPendingDca(it) {
    openModal('modal-purchase');
    prefillForm('add-purchase');
    setPurchaseType('buy');
    pickPerson('purchase-person', it.plan.person);
    $('#purchase-symbol').value = it.plan.symbol;
    $('#purchase-amount').value = Number(it.plan.amount) || '';
    $('#purchase-date').value = it.due;
    $('#purchase-note').value = '定期定額';
    showToast('已帶入金額和日期,請填實際成交價和股數再儲存', 4500);
  }

  // ---------- 管理計畫(設定 → 定期定額計畫) ----------
  function renderDcaManager() {
    const box = $('#dca-body');
    if (!box) return;
    const plans = dcaPlans();
    const symbols = (STATE.data.symbols || []).map(s => s.symbol).filter(Boolean);
    const people = CONFIG.PEOPLE || [];
    box.innerHTML = `
      <div class="muted small" style="margin-bottom:10px;">設定後,每個月到了那一天,首頁會出現「待確認買進」提醒你記帳。<b>不會自動下單,也不會自動記帳</b>;那個月已經有那一檔的買進紀錄就不會再提醒。</div>
      <div id="dca-list">${plans.length ? plans.map(p => `<div class="dca-row${p.on === false ? ' off' : ''}" data-id="${escapeHtml(p.id)}">
          <div class="dca-main"><b>${escapeHtml(p.symbol)}</b> · ${escapeHtml(getPersonLabel(p.person))}
            <div class="muted small">每月 ${Number(p.day)} 號・<span class="pdiv-amt">${fmt.money(Number(p.amount) || 0)}</span> 元${p.start ? '・' + escapeHtml(p.start.replace('-', '/')) + ' 起' : ''}${p.on === false ? '・已暫停' : ''}</div></div>
          <button type="button" class="btn ghost small" data-dca-act="toggle">${p.on === false ? '恢復' : '暫停'}</button>
          <button type="button" class="btn ghost small" data-dca-act="del">刪除</button>
        </div>`).join('') : '<div class="muted small" style="padding:8px 0;">還沒有任何計畫。</div>'}</div>
      <form id="dca-form" class="dca-form">
        <div class="palette-section-label">新增計畫</div>
        <div class="seg seg-mini" id="dca-person">${people.map((p, i) => `<button type="button" class="seg-btn${(STATE.defaultPerson || people[0]) === p ? ' active' : ''}" data-val="${escapeHtml(p)}">${escapeHtml(getPersonLabel(p))}</button>`).join('')}</div>
        <label class="small muted">標的<select id="dca-symbol">${symbols.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}</select></label>
        <label class="small muted">每月金額 (NT$)<input id="dca-amount" type="number" inputmode="numeric" min="1" placeholder="例如 3000"></label>
        <label class="small muted">每月幾號 (1~28)<input id="dca-day" type="number" inputmode="numeric" min="1" max="28" value="5"></label>
        <button type="submit" class="btn primary small">＋ 新增計畫</button>
      </form>`;
    const person = () => { const b = box.querySelector('#dca-person .seg-btn.active'); return b ? b.dataset.val : people[0]; };
    box.querySelectorAll('#dca-person .seg-btn').forEach(b => {
      b.onclick = () => box.querySelectorAll('#dca-person .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    });
    const after = async (plansNext) => { if (await dcaSavePlans(plansNext)) { renderDcaManager(); renderPendingDca(); } };
    box.querySelectorAll('[data-dca-act]').forEach(b => {
      b.onclick = () => {
        const id = b.closest('.dca-row').dataset.id, cur = dcaPlans();
        if (b.dataset.dcaAct === 'del') {
          const p = cur.find(x => x.id === id);
          if (!p || !confirm(`刪除「${p.symbol} 每月 ${p.day} 號」這個計畫?`)) return;
          after(cur.filter(x => x.id !== id));
        } else {
          after(cur.map(x => x.id === id ? Object.assign({}, x, { on: x.on === false }) : x));
        }
      };
    });
    box.querySelector('#dca-form').onsubmit = (e) => {
      e.preventDefault();
      const amount = Math.round(Number($('#dca-amount').value)), day = Math.round(Number($('#dca-day').value));
      const symbol = $('#dca-symbol').value;
      if (!symbol) { alert('請先到「標的管理」新增標的'); return; }
      if (!(amount > 0)) { alert('請輸入每月金額'); return; }
      if (!(day >= 1 && day <= 28)) { alert('日期請填 1 到 28'); return; }
      // 這個月的那一天已經過了,就從下個月開始提醒(不然一設定完馬上跳出一筆)
      const now = new Date(), from = day < now.getDate() ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
      after(dcaPlans().concat([{ id: 'dca' + Date.now().toString(36), person: person(), symbol, amount, day, start: ymdLocal(from).slice(0, 7), on: true }]));
    };
  }
