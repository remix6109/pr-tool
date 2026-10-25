/* 歷史紀錄:刪除復原、篩選、列表、編輯視窗 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== History ==============

  // ----- 最近刪除清單(localStorage) -----
  function getDeletedHistory() {
    try { return JSON.parse(localStorage.getItem(KEY.deletedHistory) || '[]') || []; }
    catch (_) { return []; }
  }
  function saveDeletedHistory(list) {
    localStorage.setItem(KEY.deletedHistory, JSON.stringify(list));
  }
  function pushToDeletedHistory(sheet, removed) {
    const list = getDeletedHistory();
    const entry = {
      sheet,
      deletedAt: new Date().toISOString(),
      data: removed
    };
    list.unshift(entry);
    if (list.length > (CONFIG.DELETED_HISTORY_MAX || 50)) list.length = CONFIG.DELETED_HISTORY_MAX || 50;
    saveDeletedHistory(list);
    return entry;
  }
  function removeFromDeletedHistory(deletedAt) {
    const list = getDeletedHistory().filter(e => e.deletedAt !== deletedAt);
    saveDeletedHistory(list);
  }

  // 復原單筆(toast undo 與「最近刪除」清單共用)
  // 回傳 true 表示有實際復原(API 成功),false 表示使用者取消或失敗
  async function restoreEntry(entry) {
    if (!entry) return false;
    if (!confirm('確認要復原此筆嗎?')) return false;
    const cleaned = { ...entry.data };
    delete cleaned.id;
    delete cleaned.created_at;

    const key = entry.sheet === '_purchases' ? 'purchases'
              : entry.sheet === '_bank'      ? 'bank'
              : entry.sheet === '_dividends' ? 'dividends'
              : 'savings';
    const arr = STATE.data[key] = STATE.data[key] || [];
    const tmpId = '__tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    arr.push({ id: tmpId, ...cleaned, created_at: new Date().toISOString() });
    renderAll();
    if ($('#page-history').classList.contains('active')) renderHistory();
    showToast('已復原');

    try {
      let res;
      if      (entry.sheet === '_purchases') res = await API.addPurchase(cleaned);
      else if (entry.sheet === '_bank')      res = await API.addBank(cleaned);
      else if (entry.sheet === '_savings')   res = await API.addSavings(cleaned);
      else if (entry.sheet === '_dividends') res = await API.addDividend(cleaned);
      const i = arr.findIndex(r => r.id === tmpId);
      if (i >= 0 && res && res.id) arr[i] = { ...arr[i], id: res.id };
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      removeFromDeletedHistory(entry.deletedAt);
      return true;
    } catch (e) {
      const i = arr.findIndex(r => r.id === tmpId);
      if (i >= 0) arr.splice(i, 1);
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      renderAll();
      if ($('#page-history').classList.contains('active')) renderHistory();
      alert('復原失敗:' + e.message + '\n建議按「重新載入」同步');
      return false;
    }
  }

  function renderDeletedHistory() {
    const list = $('#deleted-list');
    if (!list) return;
    const items = getDeletedHistory();
    if (items.length === 0) {
      list.innerHTML = `<div class="empty">沒有最近刪除的紀錄</div>`;
      return;
    }
    list.innerHTML = items.map(entry => {
      const r = entry.data || {};
      const tabType = entry.sheet === '_purchases' ? '購買'
                    : entry.sheet === '_bank'      ? '銀行'
                    : entry.sheet === '_dividends' ? '股利'
                    : '月存';
      let title = '', sub = '', amount = 0;
      if (entry.sheet === '_purchases') {
        const fee = Number(r.fee) || 0;
        const rawAmount = Number(r.amount) || 0;
        const rawShares = Number(r.shares) || 0;
        const isSell = rawAmount < 0 || rawShares < 0;
        const sharesAbs = Math.abs(rawShares);
        const amountAbs = Math.abs(rawAmount);
        title = isSell
          ? `<span class="tag-sell">賣</span> ${escapeHtml(r.symbol || '?')} × ${fmt.money(sharesAbs)} 股`
          : `${escapeHtml(r.symbol || '?')} × ${fmt.money(sharesAbs)} 股`;
        sub = `${fmt.date(r.date)}${fee > 0 ? ' · 手續費 ' + fmt.money(fee) : ''}${r.note ? ' · ' + r.note : ''}`;
        amount = isSell ? (amountAbs - fee) : -(amountAbs + fee);
      } else if (entry.sheet === '_bank') {
        title = escapeHtml(r.type || '');
        sub = `${fmt.date(r.date)}${r.note ? ' · ' + r.note : ''}`;
        amount = (String(r.type).startsWith('支出') ? -1 : 1) * Number(r.amount || 0);
      } else if (entry.sheet === '_dividends') {
        title = `${escapeHtml(r.symbol || '?')} 股利`;
        const aps = Number(r.amount_per_share) || 0;
        const subParts = [fmt.date(r.date)];
        if (aps > 0) subParts.push(`每股 ${aps.toFixed(2)}`);
        if (r.note) subParts.push(r.note);
        sub = subParts.join(' · ');
        amount = Number(r.total || 0);
      } else if (entry.sheet === '_savings') {
        title = escapeHtml(`${r.year} 年 ${r.month} 月`);
        sub = r.note || '月存';
        amount = Number(r.amount || 0);
      }
      const cls = amount >= 0 ? 'pos' : 'neg';
      const personCls = r.person === '黃' ? 'huang' : 'su';
      const dt = new Date(entry.deletedAt);
      const deletedTime = isNaN(dt.getTime()) ? '' :
        dt.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="list-item deleted-item">
        <div class="badge ${personCls}">${escapeHtml(getPersonLabel(r.person)) || '?'}</div>
        <div class="main">
          <div class="row1"><span class="tag-type">${tabType}</span> ${title}</div>
          <div class="row2">${escapeHtml(sub)}</div>
          <div class="deleted-time">已刪除 · ${deletedTime}</div>
        </div>
        <div class="right">
          <div class="amount ${cls}">${fmt.moneySigned(amount)}</div>
          <button class="btn small primary restore-btn" data-restore="${entry.deletedAt}">復原</button>
        </div>
      </div>`;
    }).join('');

    $$('#deleted-list .restore-btn').forEach(b => b.onclick = async () => {
      const ts = b.dataset.restore;
      const entry = getDeletedHistory().find(e => e.deletedAt === ts);
      const ok = await restoreEntry(entry);
      if (ok) renderDeletedHistory();
    });
  }

  function updateDeletedCountBadge() {
    const btn = $('#btn-deleted-history');
    if (!btn) return;
    const count = getDeletedHistory().length;
    btn.textContent = count > 0 ? `📋 最近刪除 (${count})` : '📋 最近刪除';
  }

  function bindHistory() {
    $$('#page-history .seg-btn').forEach(b => {
      b.onclick = () => {
        $$('#page-history .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        STATE.currentTab = b.dataset.tab;
        STATE.historyLimit = HISTORY_PAGE_SIZE;  // 切 tab 時重置分頁
        STATE.filterCategories = [];             // 切 tab 重置代號 / 類型篩選
        $('#filter-year').value     = '';        // 與年度
        $('#filter-category-popover').classList.add('hidden');
        // 切走時恢復代號篩選器、隱藏漲跌專用列
        const catWrap   = $('#filter-category-wrap');
        const phFilters = $('#ph-filters');
        if (catWrap)   catWrap.style.display = '';
        if (phFilters) phFilters.classList.add('hidden');
        renderHistory();
      };
    });
    let searchTimer = null;
    $('#filter-search').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderHistory, 200);
    };
    $('#filter-year').onchange = renderHistory;

    // 多選 popover 開關
    const popover = $('#filter-category-popover');
    $('#filter-category-btn').onclick = (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
    };
    // 點外面關閉
    document.addEventListener('click', (e) => {
      const wrap = $('#filter-category-wrap');
      if (!wrap || wrap.contains(e.target)) return;
      popover.classList.add('hidden');
    });
    // 全部清除
    $('#filter-category-clear').onclick = () => {
      STATE.filterCategories = [];
      renderHistory();
    };
    // 圖表切換(堆疊 / 並排)— 買賣 / 股利各自記憶
    $$('#dividend-chart-toggle .seg-btn').forEach(b => {
      b.onclick = () => {
        const k = STATE.currentTab === 'purchases' ? KEY.purchaseChartMode
                : STATE.currentTab === 'dividends' ? KEY.dividendChartMode
                : null;
        if (!k) return;
        localStorage.setItem(k, b.dataset.cmode);
        renderHistory();
      };
    });
  }

  function populateYearFilter(tab, raw) {
    const sel = $('#filter-year');
    if (tab !== 'purchases' && tab !== 'bank' && tab !== 'dividends' && tab !== 'realized') {
      sel.classList.add('hidden');
      sel.value = '';
      return;
    }
    sel.classList.remove('hidden');
    const cur = sel.value;
    const years = [...new Set(raw.map(r => String(r.date || '').slice(0, 4)).filter(Boolean))].sort();
    sel.innerHTML = `<option value="">全部年份</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (years.includes(cur)) sel.value = cur;
  }

  function populateCategoryFilter(tab, raw) {
    const list = $('#filter-category-list');
    const btn  = $('#filter-category-btn');
    if (!list || !btn) return;
    let allLabel = '全部', options = [];
    if (tab === 'purchases') {
      allLabel = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'realized') {
      allLabel = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'dividends') {
      allLabel = '全部代號';
      options = [...new Set(raw.map(r => r.symbol).filter(Boolean))].sort();
    } else if (tab === 'bank') {
      allLabel = '全部類型';
      options = [...new Set(raw.map(r => r.type).filter(Boolean))].sort();
    } else if (tab === 'savings') {
      allLabel = '全部年份';
      options = [...new Set(raw.map(r => String(r.year)).filter(Boolean))].sort();
    }
    // 清掉已不在 options 中的舊選擇(換 tab、換人員等情境)
    STATE.filterCategories = STATE.filterCategories.filter(c => options.includes(c));
    // 渲染勾選列表
    list.innerHTML = options.length === 0
      ? `<div class="ms-item empty">無資料</div>`
      : options.map(o => `<label class="ms-item">
          <input type="checkbox" data-cat="${escapeHtml(o)}" ${STATE.filterCategories.includes(o) ? 'checked' : ''} />
          <span>${escapeHtml(o)}</span>
        </label>`).join('');
    $$('#filter-category-list input[type="checkbox"]').forEach(cb => {
      cb.onchange = () => {
        const cat = cb.dataset.cat;
        if (cb.checked) {
          if (!STATE.filterCategories.includes(cat)) STATE.filterCategories.push(cat);
        } else {
          STATE.filterCategories = STATE.filterCategories.filter(c => c !== cat);
        }
        updateCategoryButtonLabel(allLabel);
        renderHistory();
      };
    });
    updateCategoryButtonLabel(allLabel);
    // 紀錄當前 label 給其他地方用
    btn.dataset.allLabel = allLabel;
  }

  function updateCategoryButtonLabel(allLabel) {
    const btn = $('#filter-category-btn');
    if (!btn) return;
    const fallback = allLabel || btn.dataset.allLabel || '全部';
    const n = STATE.filterCategories.length;
    if (n === 0)      btn.textContent = fallback;
    else if (n === 1) btn.textContent = STATE.filterCategories[0];
    else              btn.textContent = `已選 ${n} 個`;
  }

  function renderHistory() {
    if (!STATE.data) return;
    const tab = STATE.currentTab;
    // 漲跌幅頁面獨立渲染
    if (tab === 'prices') { renderPriceHistory(); return; }

    const personFilter = STATE.defaultPerson;
    const search = $('#filter-search').value.trim().toLowerCase();

    // 先抓「已套用人員篩選」的原始資料(供統計、圖表、分類下拉用)
    let raw = [];
    if (tab === 'purchases')   raw = (STATE.data.purchases || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'realized') raw = computeRealizedPL().filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'dividends') raw = (STATE.data.dividends || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'bank')   raw = (STATE.data.bank || []).filter(r => !personFilter || r.person === personFilter);
    else if (tab === 'savings')raw = (STATE.data.savings || []).filter(r => !personFilter || r.person === personFilter);

    populateCategoryFilter(tab, raw);
    populateYearFilter(tab, raw);
    const cats = STATE.filterCategories || [];
    const year = $('#filter-year').value;

    // 套用代號 / 類型 / 年份篩選 — 統計 + 圖表 + 列表全部一致
    if (cats.length > 0) {
      if (tab === 'purchases')   raw = raw.filter(r => cats.includes(r.symbol));
      else if (tab === 'realized') raw = raw.filter(r => cats.includes(r.symbol));
      else if (tab === 'dividends') raw = raw.filter(r => cats.includes(r.symbol));
      else if (tab === 'bank')   raw = raw.filter(r => cats.includes(r.type));
      else if (tab === 'savings')raw = raw.filter(r => cats.includes(String(r.year)));
    }
    if (year && (tab === 'purchases' || tab === 'bank' || tab === 'dividends' || tab === 'realized')) {
      raw = raw.filter(r => String(r.date || '').slice(0, 4) === year);
    }

    renderHistorySummary(tab, raw, personFilter);
    renderHistoryChart(tab, raw);

    // 列表(再套搜尋)
    let rows = [];
    if (tab === 'purchases') {
      rows = raw.slice().reverse().map(r => {
        const fee = Number(r.fee) || 0;
        const rawAmount = Number(r.amount) || 0;
        const rawShares = Number(r.shares) || 0;
        const isSell = rawAmount < 0 || rawShares < 0;
        const sharesAbs = Math.abs(rawShares);
        const amountAbs = Math.abs(rawAmount);
        const title = isSell
          ? `<span class="tag-sell">賣</span> ${escapeHtml(r.symbol)} × ${fmt.money(sharesAbs)} 股`
          : `${escapeHtml(r.symbol)} × ${fmt.money(sharesAbs)} 股`;
        return {
          id: r.id, sheet: '_purchases', person: r.person,
          title,
          sub: `${fmt.date(r.date)} · 均價 ${Number(r.price).toFixed(2)}${fee > 0 ? ' · 手續費 ' + fmt.money(fee) : ''}${r.note ? ' · ' + r.note : ''}`,
          amount: isSell ? (amountAbs - fee) : -(amountAbs + fee),
          searchText: `${r.symbol} ${r.note || ''}`.toLowerCase()
        };
      });
    } else if (tab === 'dividends') {
      rows = raw.slice().reverse().map(r => {
        const aps = Number(r.amount_per_share) || 0;
        const subParts = [fmt.date(r.date)];
        if (aps > 0) subParts.push(`每股 ${aps.toFixed(2)}`);
        if (r.note) subParts.push(r.note);
        return {
          id: r.id, sheet: '_dividends', person: r.person,
          title: `${escapeHtml(r.symbol)} 股利`,
          sub: subParts.join(' · '),
          amount: Number(r.total),
          searchText: `${r.symbol} ${r.note || ''}`.toLowerCase()
        };
      });
    } else if (tab === 'bank') {
      rows = raw.slice().reverse().map(r => {
        const isLinked = !!r.link_type;
        const prefix = isLinked ? '🔗 ' : '';
        return {
          id: r.id, sheet: '_bank', person: r.person,
          title: prefix + escapeHtml(r.type),
          sub: `${fmt.date(r.date)}${r.note ? ' · ' + r.note : ''}${isLinked ? ' · 自動同步' : ''}`,
          amount: (String(r.type).startsWith('支出') ? -1 : 1) * Number(r.amount),
          readonly: isLinked,  // 連動紀錄不顯示編輯/刪除按鈕(去原始分頁編輯)
          searchText: `${r.type} ${r.note || ''}`.toLowerCase()
        };
      });
    } else if (tab === 'savings') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_savings', person: r.person,
        title: escapeHtml(`${r.year} 年 ${r.month} 月`),
        sub: r.note || '月存',
        amount: Number(r.amount),
        searchText: `${r.year}/${r.month} ${r.note || ''}`.toLowerCase()
      }));
    } else if (tab === 'realized') {
      rows = raw.slice().reverse().map(r => ({
        id: r.id, sheet: '_purchases', person: r.person,
        title: `${escapeHtml(r.symbol)} × ${fmt.money(r.sold_shares)} 股`,
        sub: `${fmt.date(r.date)} · 售出 ${fmt.money(r.proceeds)} − 成本 ${fmt.money(r.cost_basis)}`,
        amount: r.realized_pl,
        readonly: true,
        searchText: String(r.symbol || '').toLowerCase()
      }));
    }
    if (search) rows = rows.filter(r => r.searchText.includes(search));

    const list = $('#history-list');
    const totalRows = rows.length;
    const limit = STATE.historyLimit || HISTORY_PAGE_SIZE;
    const truncated = totalRows > limit;
    const visibleRows = truncated ? rows.slice(0, limit) : rows;
    if (totalRows === 0) {
      const emptyMsg = tab === 'realized'
        ? '尚未有任何賣出紀錄,所以沒有已實現損益。<br><small>實際賣出後,系統會自動算出每筆賣出的成本基礎與獲利。</small>'
        : '沒有資料';
      list.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    } else {
      const itemsHtml = visibleRows.map(r => {
        const cls = r.amount >= 0 ? 'pos' : 'neg';
        const personCls = r.person === '黃' ? 'huang' : 'su';
        const actionsHtml = r.readonly ? '' : `
            <div class="row-actions">
              <button class="edit-btn"   data-edit-sheet="${r.sheet}" data-edit-id="${escapeHtml(r.id)}" title="編輯">✏️</button>
              <button class="delete-btn" data-del-sheet="${r.sheet}"  data-del-id="${escapeHtml(r.id)}"  title="刪除">🗑</button>
            </div>`;
        return `<div class="list-item">
          <div class="badge ${personCls}">${escapeHtml(getPersonLabel(r.person)) || '?'}</div>
          <div class="main">
            <div class="row1">${r.title}</div>
            <div class="row2">${escapeHtml(r.sub)}</div>
          </div>
          <div class="right">
            <div class="amount ${cls}">${fmt.moneySigned(r.amount)}</div>${actionsHtml}
          </div>
        </div>`;
      }).join('');
      const moreHtml = truncated
        ? `<button class="btn ghost wide load-more-btn" id="load-more-history">顯示更多(還有 ${totalRows - limit} 筆)</button>`
        : '';
      list.innerHTML = itemsHtml + moreHtml;
    }
    const moreBtn = $('#load-more-history');
    if (moreBtn) {
      moreBtn.onclick = () => {
        STATE.historyLimit = Infinity;
        renderHistory();
      };
    }

    $$('.delete-btn').forEach(b => b.onclick = () => {
      if (!confirm('確定要刪除這筆?')) return;
      const sheet = b.dataset.delSheet;
      const id = b.dataset.delId;
      const key = sheet === '_purchases' ? 'purchases'
                : sheet === '_bank'      ? 'bank'
                : sheet === '_dividends' ? 'dividends'
                : 'savings';
      const arr = STATE.data[key] = STATE.data[key] || [];
      const idx = arr.findIndex(r => String(r.id) === String(id));
      if (idx < 0) return;
      const removed = arr[idx];
      arr.splice(idx, 1);
      renderAll();
      renderHistory();
      const entry = pushToDeletedHistory(sheet, removed);
      showActionToast('已刪除', '復原', () => restoreEntry(entry), 6000);
      (async () => {
        try {
          await API.deleteRecord(sheet, id);
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
        } catch (e) {
          // 雲端刪除失敗:還原本地、收掉 undo toast、把這筆從刪除清單移除(沒真的刪)
          const t = $('#toast');
          t.classList.add('hidden');
          t.textContent = '';
          removeFromDeletedHistory(entry.deletedAt);
          arr.splice(idx, 0, removed);
          localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
          renderAll();
          renderHistory();
          alert('刪除失敗:' + e.message + '\n已還原此筆,建議按「重新載入」同步');
        }
      })();
    });

    $$('.edit-btn').forEach(b => b.onclick = () => {
      openEditModal(b.dataset.editSheet, b.dataset.editId);
    });
  }

  function openEditModal(sheet, id) {
    const find = (arr) => (arr || []).find(r => String(r.id) === String(id));
    if (sheet === '_purchases') {
      const r = find(STATE.data.purchases);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'purchase' };
      const isSell = (Number(r.shares) < 0) || (Number(r.amount) < 0);
      pickPerson('purchase-person', r.person);
      $('#purchase-amount').value = Math.abs(Number(r.amount) || 0);
      $('#purchase-price').value  = r.price;
      $('#purchase-shares').value = Math.abs(Number(r.shares) || 0);
      $('#purchase-fee').value    = r.fee || '';
      $('#purchase-date').value   = String(r.date || '').slice(0, 10);
      $('#purchase-note').value   = r.note || '';
      setPurchaseType(isSell ? 'sell' : 'buy');  // 先設定型別,會 populate 代號下拉
      setPurchaseUnit('stocks');
      updateSharesHint();
      // 編輯既有紀錄時,即使該代號目前不在下拉中(例如已賣光),仍要能選回原值
      const sel = $('#purchase-symbol');
      if (r.symbol && ![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol;
      $('#modal-purchase-title').textContent = isSell ? '編輯 ETF 賣出' : '編輯 ETF 買進';
      $('#purchase-submit').textContent = '儲存修改';
      openModal('modal-purchase');
    } else if (sheet === '_bank') {
      const r = find(STATE.data.bank);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'bank' };
      pickPerson('bank-person', r.person);
      $('#bank-type').value   = r.type;
      $('#bank-amount').value = r.amount;
      $('#bank-date').value   = String(r.date || '').slice(0, 10);
      $('#bank-note').value   = r.note || '';
      $('#modal-bank h2').textContent = '編輯銀行收支';
      $('#bank-submit').textContent = '儲存修改';
      openModal('modal-bank');
    } else if (sheet === '_dividends') {
      const r = find(STATE.data.dividends);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'dividend' };
      pickPerson('dividend-person', r.person);
      const sel = $('#dividend-symbol');
      if (![...sel.options].some(o => o.value === r.symbol)) {
        sel.add(new Option(r.symbol, r.symbol));
      }
      sel.value = r.symbol;
      $('#dividend-total').value     = r.total;
      $('#dividend-per-share').value = r.amount_per_share || '';
      $('#dividend-shares').value    = r.shares || '';
      $('#dividend-date').value      = String(r.date || '').slice(0, 10);
      $('#dividend-note').value      = r.note || '';
      $('#modal-dividend h2').textContent = '編輯股利發放';
      $('#dividend-submit').textContent = '儲存修改';
      openModal('modal-dividend');
    } else if (sheet === '_savings') {
      const r = find(STATE.data.savings);
      if (!r) return;
      STATE.editing = { sheet, id, type: 'savings' };
      pickPerson('savings-person', r.person);
      $('#savings-year').value   = r.year;
      $('#savings-month').value  = r.month;
      $('#savings-amount').value = r.amount;
      $('#savings-note').value   = r.note || '';
      $('#modal-savings h2').textContent = '編輯月存記錄';
      $('#savings-submit').textContent = '儲存修改';
      openModal('modal-savings');
    }
  }

  function resetModalLabels() {
    $('#modal-purchase-title').textContent = '新增 ETF 買進';
    $('#purchase-submit').textContent   = '儲存';
    $('#modal-bank h2').textContent     = '新增銀行收支';
    $('#bank-submit').textContent       = '儲存';
    $('#modal-savings h2').textContent  = '新增月存記錄';
    $('#savings-submit').textContent    = '儲存';
    $('#modal-dividend h2').textContent = '新增股利發放';
    $('#dividend-submit').textContent   = '儲存';
  }

