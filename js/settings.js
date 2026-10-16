/* 設定頁、JSON 匯入 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== Settings ==============

  // 從 JSON 備份還原(智慧合併:已存在的不動、缺的補入)
  async function importJsonFlow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let parsed;
      try {
        const text = await file.text();
        parsed = JSON.parse(text);
      } catch (e) {
        alert('檔案讀取失敗:' + e.message);
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        alert('不是有效的 JSON 檔案');
        return;
      }

      // 計算差異(JSON 有、試算表沒的)
      const types = [
        { key: 'purchases', addFn: API.addPurchase },
        { key: 'bank',      addFn: API.addBank },
        { key: 'savings',   addFn: API.addSavings },
        { key: 'dividends', addFn: API.addDividend }
      ];
      const diff = {};
      types.forEach(t => {
        const fromJson = (parsed[t.key] || []).filter(r => r && r.id);
        const currentIds = new Set((STATE.data[t.key] || []).map(r => String(r.id)));
        diff[t.key] = fromJson.filter(r => !currentIds.has(String(r.id)));
      });
      // 代號用 symbol 名稱比對
      const symFromJson = (parsed.symbols || []).filter(s => s && s.symbol);
      const currentSyms = new Set((STATE.data.symbols || []).map(s => s.symbol));
      diff.symbols = symFromJson.filter(s => !currentSyms.has(s.symbol));

      const counts = {
        purchases: diff.purchases.length,
        bank:      diff.bank.length,
        savings:   diff.savings.length,
        dividends: diff.dividends.length,
        symbols:   diff.symbols.length
      };
      const total = counts.purchases + counts.bank + counts.savings + counts.dividends + counts.symbols;
      if (total === 0) {
        alert('沒有需要匯入的資料 — 所有紀錄都已經存在試算表裡。');
        return;
      }

      const msg = '將補入以下資料(已存在的紀錄不會被覆蓋):\n\n' +
        '購買 ' + counts.purchases + ' 筆\n' +
        '銀行 ' + counts.bank + ' 筆\n' +
        '月存 ' + counts.savings + ' 筆\n' +
        '股利 ' + counts.dividends + ' 筆\n' +
        '代號 ' + counts.symbols + ' 筆\n\n' +
        '總共 ' + total + ' 筆。確定要匯入嗎?';
      if (!confirm(msg)) return;

      closeAllModals();
      showToast('匯入中,請稍候(每筆約 0.5–1 秒)…');
      let success = 0, failed = 0;
      const errors = [];

      // 依序匯入(API 是序列呼叫,避免太多併發)
      for (const t of types) {
        STATE.data[t.key] = STATE.data[t.key] || [];
        for (const r of diff[t.key]) {
          try {
            await t.addFn(r);
            STATE.data[t.key].push(r);
            success++;
          } catch (e) {
            failed++;
            errors.push((t.key) + ': ' + (r.id || '?') + ' → ' + e.message);
          }
        }
      }
      // 代號用 updateSymbol(它是 upsert)
      STATE.data.symbols = STATE.data.symbols || [];
      for (const s of diff.symbols) {
        try {
          await API.updateSymbol(s);
          STATE.data.symbols.push(s);
          success++;
        } catch (e) {
          failed++;
          errors.push('symbols: ' + (s.symbol || '?') + ' → ' + e.message);
        }
      }

      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      renderAll();
      if (failed === 0) {
        alert('✅ 匯入完成,共補入 ' + success + ' 筆。');
      } else {
        alert('匯入結果:\n成功 ' + success + ' 筆\n失敗 ' + failed + ' 筆\n\n失敗詳情:\n' + errors.slice(0, 10).join('\n') +
              (errors.length > 10 ? '\n…(僅顯示前 10 條)' : ''));
      }
    };
    input.click();
  }

  function bindSettings() {
    $('#btn-settings').onclick = () => {
      renderPalettePicker();
      renderFxPicker();
      renderIconPicker();
      renderAppTitleEditor();
      renderPersonLabelEditor();
      updateDeletedCountBadge();
      openModal('modal-settings');
    };

    $('#btn-deleted-history').onclick = () => {
      renderDeletedHistory();
      closeAllModals();
      openModal('modal-deleted');
    };

    $('#btn-clear-deleted').onclick = () => {
      const count = getDeletedHistory().length;
      if (count === 0) return;
      if (!confirm(`確定要清空 ${count} 筆「最近刪除」紀錄嗎?清空後就無法再復原。`)) return;
      saveDeletedHistory([]);
      renderDeletedHistory();
      showToast('已清空');
    };

    $('#btn-refresh').onclick = async () => {
      closeAllModals();
      await loadAndRender(true);   // skipCache:手動重新載入不需閃舊快取
      showToast('已重新載入');
    };

    $('#btn-change-pin').onclick = async () => {
      const newPin = prompt('輸入新 PIN(4–8 位數字):');
      if (!newPin) return;
      if (!/^\d{4,8}$/.test(newPin)) { alert('PIN 必須是 4–8 位數字'); return; }
      localStorage.setItem(KEY.pinHash, await sha256(newPin));
      showToast('PIN 已更新');
    };

    $('#btn-change-api').onclick = () => {
      const cur = localStorage.getItem(KEY.apiUrl) || '';
      const next = prompt('輸入新的 API URL:', cur);
      if (!next) return;
      if (!next.startsWith('https://')) { alert('必須以 https:// 開頭'); return; }
      localStorage.setItem(KEY.apiUrl, next.trim());
      showToast('API URL 已更新');
      loadAndRender();
    };

    $('#btn-import').onclick = importJsonFlow;

    $('#btn-export').onclick = () => {
      if (!STATE.data) return;
      const blob = new Blob([JSON.stringify(STATE.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `購買記錄_${ymdLocal(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    $('#btn-logout').onclick = () => {
      if (!confirm('確定要登出?系統會清除本機所有設定(資料還在試算表)。')) return;
      Object.values(KEY).forEach(k => localStorage.removeItem(k));
      location.reload();
    };
  }

