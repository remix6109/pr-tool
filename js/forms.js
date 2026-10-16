/* 新增/編輯表單 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== Add forms ==============

  function bindAddButtons() {
    $$('[data-open]').forEach(b => {
      b.onclick = () => {
        const which = b.dataset.open;
        openModal('modal-' + which.replace('add-', ''));
        prefillForm(which);
        updateRepeatLastButtons();
        if (which === 'symbols') renderSymbolList();
      };
    });
    $$('.repeat-last').forEach(b => {
      b.onclick = () => repeatLastEntry(b.dataset.repeat);
    });
    $$('[data-close]').forEach(b => b.onclick = () => closeAllModals());
    $$('.modal').forEach(m => m.addEventListener('click', e => {
      if (e.target === m) closeAllModals();
    }));

    // 在 modal 內的人員 segmented control
    $$('[data-pick]').forEach(b => {
      b.onclick = () => pickPerson(b.dataset.pick, b.dataset.val);
    });
  }

  function openModal(id) {
    $('#' + id).classList.remove('hidden');
    updateRepeatLastButtons();
  }
  function closeAllModals() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
    STATE.editing = null;
    resetModalLabels();
  }

  function prefillForm(which) {
    const today = ymdLocal(new Date());
    if (which === 'add-purchase') {
      $('#purchase-date').value = today;
      pickPerson('purchase-person', STATE.defaultPerson);
      $('#purchase-amount').value = '';
      $('#purchase-price').value = '';
      $('#purchase-shares').value = '';
      $('#purchase-fee').value = '';
      $('#purchase-note').value = '';
      setPurchaseType('buy');
      setPurchaseUnit('stocks');
      updateSharesHint();
    } else if (which === 'add-bank') {
      $('#bank-date').value = today;
      pickPerson('bank-person', STATE.defaultPerson);
      $('#bank-amount').value = '';
      $('#bank-note').value = '';
    } else if (which === 'add-dividend') {
      $('#dividend-date').value = today;
      pickPerson('dividend-person', STATE.defaultPerson);
      $('#dividend-total').value = '';
      $('#dividend-per-share').value = '';
      $('#dividend-shares').value = '';
      $('#dividend-note').value = '';
    } else if (which === 'add-savings') {
      pickPerson('savings-person', STATE.defaultPerson);
      const now = new Date();
      $('#savings-year').value = String(now.getFullYear());
      $('#savings-month').value = String(now.getMonth() + 1);
      $('#savings-amount').value = '';
      $('#savings-note').value = '';
    }
  }

  // 找出當前 defaultPerson 在某張表的最近一筆(以 created_at desc,fallback date desc)
  function findLastEntry(type) {
    if (!STATE.data) return null;
    const person = STATE.defaultPerson;
    const arr =
      type === 'purchase' ? (STATE.data.purchases || []).filter(r => Number(r.amount) > 0)  // 只取買進
      : type === 'bank'    ? (STATE.data.bank || [])
      : type === 'savings' ? (STATE.data.savings || [])
      : type === 'dividend'? (STATE.data.dividends || [])
      : [];
    const mine = arr.filter(r => r.person === person);
    if (mine.length === 0) return null;
    const ts = (r) => {
      const t1 = r.created_at ? new Date(r.created_at).getTime() : 0;
      const t2 = r.date        ? new Date(String(r.date).slice(0, 10)).getTime() : 0;
      return Math.max(t1 || 0, t2 || 0);
    };
    return mine.slice().sort((a, b) => ts(b) - ts(a))[0];
  }

  function updateRepeatLastButtons() {
    const editing = !!STATE.editing;
    $$('.repeat-last').forEach(b => {
      if (editing) {
        b.style.display = 'none';
      } else {
        b.style.display = '';
        const has = !!findLastEntry(b.dataset.repeat);
        b.disabled = !has;
        b.title = has ? '從你最近一筆紀錄帶入欄位' : '還沒有可重複的紀錄';
      }
    });
  }

  function repeatLastEntry(type) {
    const r = findLastEntry(type);
    if (!r) { showToast('沒有可重複的紀錄'); return; }
    if (type === 'purchase') {
      pickPerson('purchase-person', r.person);
      setPurchaseType('buy');
      setPurchaseUnit('stocks');
      const sel = $('#purchase-symbol');
      if (r.symbol && ![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol || '';
      $('#purchase-amount').value = Math.abs(Number(r.amount) || 0);
      $('#purchase-price').value  = r.price || '';
      $('#purchase-shares').value = Math.abs(Number(r.shares) || 0);
      $('#purchase-fee').value    = r.fee || '';
      updateSharesHint();
    } else if (type === 'bank') {
      pickPerson('bank-person', r.person);
      $('#bank-type').value   = r.type || '';
      $('#bank-amount').value = r.amount || '';
    } else if (type === 'savings') {
      pickPerson('savings-person', r.person);
      $('#savings-amount').value = r.amount || '';
    } else if (type === 'dividend') {
      pickPerson('dividend-person', r.person);
      const sel = $('#dividend-symbol');
      if (r.symbol && ![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol || '';
      $('#dividend-total').value     = r.total || '';
      $('#dividend-per-share').value = r.amount_per_share || '';
      $('#dividend-shares').value    = r.shares || '';
    }
    showToast('已帶入上一筆');
  }

  function pickPerson(targetId, val) {
    $('#' + targetId).value = val;
    $$(`[data-pick="${targetId}"]`).forEach(x => x.classList.toggle('active', x.dataset.val === val));
    // 賣出模式時切換購買人 → 代號下拉只顯示該人員持有的
    if (targetId === 'purchase-person' && STATE.purchaseType === 'sell') {
      populatePurchaseSymbolDropdown();
    }
  }

  function populateSymbolDropdown() {
    const symbols = (STATE.data.symbols || []).map(s => s.symbol).filter(Boolean);
    const html = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
    ['#purchase-symbol', '#dividend-symbol'].forEach(sel => {
      const el = $(sel);
      if (el) el.innerHTML = html;
    });
  }

  function populateYearMonthDropdown() {
    $('#savings-year').innerHTML = CONFIG.YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    $('#savings-month').innerHTML = Array.from({length: 12}, (_, i) => i + 1).map(m => `<option value="${m}">${m}</option>`).join('');
  }

  // 購買 modal 的「股 / 張」單位切換
  function setPurchaseUnit(unit) {
    STATE.purchaseUnit = (unit === 'lots') ? 'lots' : 'stocks';
    $$('#purchase-unit-seg .seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.unit === STATE.purchaseUnit));
  }
  function updateSharesHint() {
    const input = $('#purchase-shares');
    const hint  = $('#purchase-shares-hint');
    if (!input || !hint) return;
    const v = Number(input.value);
    if (!v || isNaN(v)) { hint.textContent = ''; return; }
    if (STATE.purchaseUnit === 'lots') {
      hint.textContent = `= ${(v * 1000).toLocaleString('en-US')} 股`;
    } else {
      hint.textContent = `≈ ${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} 張`;
    }
  }
  function bindPurchaseUnitToggle() {
    STATE.purchaseUnit = STATE.purchaseUnit || 'stocks';
    $$('#purchase-unit-seg .seg-btn').forEach(b => {
      b.onclick = () => {
        setPurchaseUnit(b.dataset.unit);
        updateSharesHint();
      };
    });
    const input = $('#purchase-shares');
    if (input) input.addEventListener('input', updateSharesHint);
  }

  // 購買 modal 的「買進 / 賣出」切換
  function setPurchaseType(type) {
    STATE.purchaseType = (type === 'sell') ? 'sell' : 'buy';
    $$('[data-ptype]').forEach(b =>
      b.classList.toggle('active', b.dataset.ptype === STATE.purchaseType));
    const isSell = STATE.purchaseType === 'sell';
    const titleEl = $('#modal-purchase-title');
    const amtLabel = $('#purchase-amount-label');
    if (titleEl)  titleEl.textContent  = isSell ? '新增 ETF 賣出' : '新增 ETF 買進';
    if (amtLabel) amtLabel.textContent = isSell ? '實收金額 (NT$)' : '花費金額 (NT$)';
    populatePurchaseSymbolDropdown();
  }
  function bindPurchaseTypeToggle() {
    STATE.purchaseType = STATE.purchaseType || 'buy';
    $$('[data-ptype]').forEach(b => {
      b.onclick = () => setPurchaseType(b.dataset.ptype);
    });
  }

  // 計算指定人員目前淨持有 > 0 的代號
  function getHeldSymbols(person) {
    const agg = {};
    (STATE.data && STATE.data.purchases || []).forEach(r => {
      if (person && r.person !== person) return;
      if (!r.symbol) return;
      agg[r.symbol] = (agg[r.symbol] || 0) + (Number(r.shares) || 0);
    });
    return Object.keys(agg).filter(s => agg[s] > 0).sort();
  }

  // 依照當前的買 / 賣切換填入購買 modal 的代號下拉
  function populatePurchaseSymbolDropdown() {
    const sel = $('#purchase-symbol');
    if (!sel) return;
    const isSell = STATE.purchaseType === 'sell';
    let symbols;
    if (isSell) {
      const person = $('#purchase-person').value || STATE.defaultPerson;
      symbols = getHeldSymbols(person);
    } else {
      symbols = (STATE.data && STATE.data.symbols || []).map(s => s.symbol).filter(Boolean);
    }
    const cur = sel.value;
    if (symbols.length === 0 && isSell) {
      sel.innerHTML = `<option value="" disabled selected>(目前沒有持股可賣出)</option>`;
    } else {
      sel.innerHTML = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
      if (symbols.includes(cur)) sel.value = cur;
    }
  }

  function bindForms() {
    $('#purchase-submit').onclick = () => {
      const sharesRaw = Number($('#purchase-shares').value) || 0;
      const sharesAsStocks = (STATE.purchaseUnit === 'lots') ? sharesRaw * 1000 : sharesRaw;
      const isSell = STATE.purchaseType === 'sell';
      const sign = isSell ? -1 : 1;
      const data = {
        person: $('#purchase-person').value,
        symbol: $('#purchase-symbol').value,
        amount: sign * (Number($('#purchase-amount').value) || 0),
        price:  Number($('#purchase-price').value)  || 0,
        shares: sign * sharesAsStocks,
        fee:    Number($('#purchase-fee').value)    || 0,
        date:   $('#purchase-date').value,
        note:   $('#purchase-note').value
      };
      if (!data.person) return alert(isSell ? '請選賣出人' : '請選購買人');
      if (!data.symbol) return alert('請選代號');
      if (!data.amount || !data.shares) return alert('請輸入金額和股數');
      const editing = STATE.editing && STATE.editing.type === 'purchase' ? { ...STATE.editing } : null;
      const arr = STATE.data.purchases = STATE.data.purchases || [];
      let optimisticIdx = -1, prevSnapshot = null, tmpId = null;
      if (editing) {
        optimisticIdx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (optimisticIdx >= 0) {
          prevSnapshot = arr[optimisticIdx];
          arr[optimisticIdx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
        optimisticIdx = arr.length - 1;
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : (isSell ? '已新增賣出' : '已新增買進'));
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addPurchase({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };

    $('#bank-submit').onclick = () => {
      const data = {
        person: $('#bank-person').value,
        type:   $('#bank-type').value,
        amount: Number($('#bank-amount').value) || 0,
        date:   $('#bank-date').value,
        note:   $('#bank-note').value
      };
      if (!data.person) return alert('請選人');
      if (!data.amount) return alert('請輸入金額');
      const editing = STATE.editing && STATE.editing.type === 'bank' ? { ...STATE.editing } : null;
      const arr = STATE.data.bank = STATE.data.bank || [];
      let prevSnapshot = null, tmpId = null;
      if (editing) {
        const idx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (idx >= 0) {
          prevSnapshot = arr[idx];
          arr[idx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : '已新增收支');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addBank({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };

    $('#savings-submit').onclick = () => {
      const data = {
        person: $('#savings-person').value,
        year:   Number($('#savings-year').value),
        month:  Number($('#savings-month').value),
        amount: Number($('#savings-amount').value) || 0,
        note:   $('#savings-note').value
      };
      if (!data.person) return alert('請選人');
      if (!data.amount) return alert('請輸入金額');
      const editing = STATE.editing && STATE.editing.type === 'savings' ? { ...STATE.editing } : null;
      const arr = STATE.data.savings = STATE.data.savings || [];
      let prevSnapshot = null, tmpId = null;
      if (editing) {
        const idx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (idx >= 0) {
          prevSnapshot = arr[idx];
          arr[idx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : '已新增月存');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addSavings({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };

    $('#dividend-submit').onclick = () => {
      const data = {
        person: $('#dividend-person').value,
        symbol: $('#dividend-symbol').value,
        total:  Number($('#dividend-total').value) || 0,
        amount_per_share: Number($('#dividend-per-share').value) || 0,
        shares: Number($('#dividend-shares').value) || 0,
        date:   $('#dividend-date').value,
        note:   $('#dividend-note').value
      };
      if (!data.person) return alert('請選人');
      if (!data.symbol) return alert('請選代號');
      if (!data.total)  return alert('請輸入實領金額');
      if (!data.date)   return alert('請選日期');
      const editing = STATE.editing && STATE.editing.type === 'dividend' ? { ...STATE.editing } : null;
      const arr = STATE.data.dividends = STATE.data.dividends || [];
      let prevSnapshot = null, tmpId = null;
      if (editing) {
        const idx = arr.findIndex(r => String(r.id) === String(editing.id));
        if (idx >= 0) {
          prevSnapshot = arr[idx];
          arr[idx] = { ...prevSnapshot, ...data };
        }
      } else {
        tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        arr.push({
          id: tmpId, ...data,
          created_at: new Date().toISOString(), created_by: STATE.defaultPerson
        });
      }
      closeAllModals();
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      showToast(editing ? '已更新' : '已新增股利');
      (async () => {
        try {
          if (editing) {
            await API.updateRecord(editing.sheet, editing.id, data);
          } else {
            const res = await API.addDividend({ ...data, created_by: STATE.defaultPerson });
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr[i] = { ...arr[i], id: res.id };
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          if (editing) {
            const i = arr.findIndex(r => String(r.id) === String(editing.id));
            if (i >= 0 && prevSnapshot) arr[i] = prevSnapshot;
          } else {
            const i = arr.findIndex(r => r.id === tmpId);
            if (i >= 0) arr.splice(i, 1);
          }
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          if ($('#page-history').classList.contains('active')) renderHistory();
          alert('儲存失敗:' + e.message + '\n已還原此筆變更,建議按「重新載入」同步');
        }
      })();
    };
  }

