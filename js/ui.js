/* 通用 UI:卡片收合、說明視窗、下拉刷新 — 由 app.js 拆出;所有檔案共用全域範圍,載入順序見 index.html */
  // ============== 卡片收合 ==============

  function applyCollapseStates() {
    $$('[data-collapse]').forEach(el => {
      const key = 'pr.collapse.' + el.dataset.collapse;
      el.classList.toggle('collapsed', localStorage.getItem(key) === '1');
    });
  }

  function bindCardCollapse() {
    document.addEventListener('click', (e) => {
      // 點到 modal 內、按鈕、或可互動元素時不觸發
      if (e.target.closest('.modal')) return;
      if (e.target.closest('button, a, input, select, summary')) return;
      const title = e.target.closest('.card > .card-title, .person-card > .name');
      if (!title) return;
      const card = title.closest('[data-collapse]');
      if (!card) return;
      const next = !card.classList.contains('collapsed');
      card.classList.toggle('collapsed', next);
      localStorage.setItem('pr.collapse.' + card.dataset.collapse, next ? '1' : '0');
    });
  }

  // ============== 通用說明 modal ==============

  const INFO_TEXTS = {
    'add-guide': {
      title: '什麼時候用哪個按鈕?',
      body: `
        <p>每個按鈕背後的「同步行為」不同,看這份就知道怎麼選:</p>

        <p><b>🛒 新增 ETF 買賣</b></p>
        <ul>
          <li>用在:任何買進、賣出 ETF</li>
          <li>會自動建一筆對應的銀行紀錄(支出-購買 / 收入-退費),有 🔗 標記</li>
          <li>👉 <b>不用再手動加銀行</b></li>
        </ul>

        <p><b>💵 新增股利發放</b></p>
        <ul>
          <li>用在:領到 ETF 股利</li>
          <li>會自動建一筆對應的銀行紀錄(收入-利息),有 🔗 標記</li>
          <li>👉 <b>不用再手動加銀行</b></li>
          <li>記得每筆股利都要進來,不然「年化 IRR」會被低估</li>
        </ul>

        <p><b>🏦 新增銀行收支</b></p>
        <ul>
          <li>用在:<b>不屬於上面兩類</b>的銀行流水。例如:</li>
          <li>· 薪水入帳</li>
          <li>· 純銀行存款利息(像 $5、$10 那種)</li>
          <li>· 日常開銷、信用卡、餐費</li>
          <li>· 退費、轉帳、其他收支</li>
          <li>👉 ETF 跟股利<b>不要</b>從這裡進(會跟 🔗 自動同步重複)</li>
        </ul>

        <p><b>💰 新增月存記錄</b></p>
        <ul>
          <li>用在:你為「5 年存入計劃」存了多少錢</li>
          <li><b>⚠️ 不會影響銀行餘額</b> — 純粹追蹤目標進度</li>
          <li>👉 如果這筆錢真的有進銀行,要再到「銀行收支」加一筆</li>
          <li>(像「為還貸款而存」這種沒進銀行的也照常記月存就好)</li>
        </ul>

        <p><b>📋 代號管理</b></p>
        <ul>
          <li>用在:新增 / 編輯股票代號(設定除息月份、現價、年配息)</li>
          <li>新買的標的記得先來這裡建,不然 ETF 買賣的下拉選不到</li>
        </ul>

        <p><b>🔗 標記是什麼意思?</b></p>
        <ul>
          <li>銀行分頁裡 🔗 開頭的紀錄 = 系統<b>自動</b>從 ETF / 股利 同步來的</li>
          <li>不能直接編輯/刪除這類 — 要去原始分頁(買賣 / 股利)修改</li>
          <li>沒 🔗 的就是純手動加的銀行紀錄,可以直接編輯</li>
        </ul>
      `
    },
    irr: {
      title: '真實年化 IRR (含股利)',
      body: `
        <p><b>IRR</b>(內部報酬率)回答這個問題:</p>
        <blockquote>「如果把錢放在某個固定利率的銀行,要多少利率,才能完整重現你過去這些投入和收回?」</blockquote>
        <p>那個利率就是 IRR,所以叫「真實年化」。</p>

        <p><b>為什麼比「(現價 − 均價) / 均價」公允?</b></p>
        <ul>
          <li><b>把時間算進去</b> — 5 年漲 50% vs 1 年漲 50% 是兩回事,IRR 會分開</li>
          <li><b>把分批進出算進去</b> — 你不是一次梭哈,每筆錢待在市場時間不同</li>
          <li><b>把股利算進去</b> — 高息股拿到的現金是真實收益,不能漏算</li>
        </ul>

        <p><b>怎麼讀這個數字</b></p>
        <ul>
          <li>持有 <b>&lt; 1 年</b>:數學對,但 1 個月運氣會被放大成全年趨勢,參考性低</li>
          <li>持有 <b>1–3 年</b>:開始有意義,但仍受市場景氣影響</li>
          <li>持有 <b>3–5 年</b>:相對穩定,反映該標的真實表現</li>
          <li>持有 <b>5 年以上</b>:通常涵蓋一輪牛熊,最可信</li>
        </ul>

        <p><b>⚠️ 注意</b></p>
        <ul>
          <li>IRR 含「假設今天全部賣掉」的市值 — 大盤一波動,IRR 立刻變</li>
          <li>這是<b>過去</b>的數字,不能保證未來會繼續這個速度</li>
          <li>顯示「—」代表資料不足以解出有效解</li>
        </ul>
      `
    }
  };

  function showInfoModal(key) {
    const def = INFO_TEXTS[key];
    if (!def) return;
    $('#modal-info-title').textContent = def.title;
    $('#modal-info-body').innerHTML = def.body;
    openModal('modal-info');
  }

  function bindInfoButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-info]');
      if (!btn) return;
      e.stopPropagation();
      showInfoModal(btn.dataset.info);
    });
  }

  // ============== 下拉刷新 ==============

  function bindPullToRefresh() {
    const indicator = $('#ptr-indicator');
    if (!indicator) return;
    const text = indicator.querySelector('.ptr-text');
    const THRESHOLD = 70;          // 拉超過這個 px 才觸發
    const MAX_VISUAL_OFFSET = 90;  // 視覺上指示器最多下移到這個 px
    let startY = 0, pulling = false, refreshing = false;

    function reset() {
      pulling = false;
      indicator.classList.remove('visible', 'ready');
      indicator.style.transform = '';
      if (text) text.textContent = '下拉刷新';
    }

    document.addEventListener('touchstart', (e) => {
      if (refreshing) return;
      // 任何 modal 開著就不觸發
      if (document.querySelector('.modal:not(.hidden)')) return;
      // 只在頁面捲到最頂時開始追蹤
      if (window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { reset(); return; }
      // 阻尼:拉越長越「重」
      const offset = Math.min(MAX_VISUAL_OFFSET, dy * 0.5);
      indicator.classList.add('visible');
      indicator.style.transform = `translate(-50%, ${offset}px)`;
      const ready = dy >= THRESHOLD;
      indicator.classList.toggle('ready', ready);
      if (text) text.textContent = ready ? '放開即可刷新' : '下拉刷新';
    }, { passive: true });

    document.addEventListener('touchend', async () => {
      if (!pulling || refreshing) return;
      const wasReady = indicator.classList.contains('ready');
      pulling = false;
      if (!wasReady) { reset(); return; }
      refreshing = true;
      indicator.classList.remove('ready');
      indicator.classList.add('loading');
      indicator.style.transform = '';
      if (text) text.textContent = '刷新中…';
      try {
        await loadAndRender(true);   // skipCache:使用者下拉時已有畫面,不需先閃舊快取
        if (text) text.textContent = '已更新';
      } catch (e) {
        if (text) text.textContent = '刷新失敗';
      } finally {
        setTimeout(() => {
          indicator.classList.remove('loading');
          reset();
          refreshing = false;
        }, 400);
      }
    }, { passive: true });
  }

