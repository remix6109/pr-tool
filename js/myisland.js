/* 我的島 — 參考「HEART 政策島」的玩法做的個人版:一整塊愛心形的島,13 格(作品/家/未來)是地上的色塊,中間上方是主角小豬吉祥物。
 * 作品區 = 做過、正在做的東西;家區 = 黃與蘇的真實記錄;未來區 = 跟著資料長大的目標。
 * 點一格:鏡頭飛過去、下方顯示細項與協作關係;看法可切 全景/清單/時間。兩指或滾輪縮放,右上角按鈕回全景。
 * 可以自己新增格子(先填空地,再往外長)和協作線,一樣存在試算表 _island。
 * 金額只放在下方文字(隱私模式會模糊),3D 看板上不放金額。
 * 在探索頁的「我的島」顯示;three.js 共用 town3d.js 的載入。所有檔案共用全域範圍,載入順序見 index.html */

  const MYI = { s: null, sel: null, view: 'map', failed: false, canvas: null, form: null };
  const MYI_ZONES = {
    work: { name: '作品', color: '#E8875B', desc: '做過、正在做的東西' },
    home: { name: '家', color: '#D9607E', desc: '黃與蘇的真實記錄' },
    future: { name: '未來', color: '#3E93C2', desc: '跟著資料長大的目標' }
  };
  // x:以六邊形寬為單位(奇數列錯開半格);r:第幾列。拼起來是一顆心,尖端朝向鏡頭
  const MYI_TILES = [
    { id: 'app', no: '01', zone: 'work', icon: '📊', name: '理財 APP', kind: 'app', land: '#CFE3C4',
      quote: '把黃和蘇的每一筆買進、每一次配息都記下來,看得到它慢慢長大。',
      tags: ['手機 APP', '試算表後端', '3D'],
      items: [
        { t: '記錄買賣、配息、銀行與月存', when: '4/30 起' },
        { t: '3D 持股小鎮:一筆買進一層樓、時光回放', when: '10/25' },
        { t: '市場頁:新聞、台股群島、國際市場', when: '10/25' },
        { t: '探索群島:AI 與理財課程、測驗', when: '10/26' },
        { t: '每 10 天自動更新課程內容', when: '11/1 起' }
      ] },
    { id: 'sanguo', no: '02', zone: 'work', icon: '⚔️', name: '三國策略遊戲', kind: 'castle', land: '#D8C79E',
      quote: '從一個水墨剪影的槍兵開始,一路做到 3D 公仔和完整劇本。',
      tags: ['策略', '養成', '抽卡', '3D 模型'],
      items: [
        { t: '水墨剪影戰鬥原型:趙雲、關羽、諸葛亮', when: '10/17' },
        { t: 'Blender 算圖、卡通描邊的角色', when: '10 月' },
        { t: '群雄 12 位武將、五星公仔', when: '10/25' },
        { t: '劇本「討伐董卓」:玩董卓這邊', when: '10/26' },
        { t: '自動流程測試 2000 多項', when: '持續' },
        { t: '蜀魏吳 36 把專武 3D 模型(AI 生成、Blender 整理)', when: '10/25' },
        { t: '群雄 12 把專武模型與圖示', when: '10/25' },
        { t: '群雄五星公仔 4 隻', when: '10/25' },
        { t: '武將頁專武 3D 旋轉展示', when: '10/25' }
      ] },
    { id: 'learnisle', no: '03', zone: 'work', icon: '🧭', name: '探索學習', kind: 'learn', land: '#C6DCE6',
      quote: '不只記帳,也要看懂 AI 和理財在做什麼。',
      tags: ['AI', '理財知識', '自動更新'],
      items: [
        { t: 'AI 入門、AI 工具、自動化工坊', when: '10/26' },
        { t: '理財知識:除息、填息、補充保費', when: '10/26' },
        { t: '複習題庫與錯題本', when: '10/26' },
        { t: '雲端每 10 天自動加新課', when: '11/1 起' }
      ] },
    { id: 'ai', no: '04', zone: 'work', icon: '🤖', name: 'AI 工作室', kind: 'ai', land: '#D9D4EE',
      quote: '想法是自己的,程式和模型交給 AI 一起做。',
      tags: ['Claude', '生圖', '3D 生成'],
      items: [
        { t: '用 Claude 寫這個 APP 和三國遊戲', when: '持續' },
        { t: 'AI 生卡面、技能切入圖,再由 AI 歸檔改名', when: '10 月' },
        { t: 'AI 轉 3D 模型,再用 Blender 腳本整理', when: '10 月' },
        { t: '雲端排程:每 10 天自動更新課程', when: '10/26' }
      ] },
    { id: 'home', no: '05', zone: 'home', icon: '🏠', name: '黃與蘇的家', kind: 'home', land: '#F2D6D6',
      quote: '兩個人的存股,合在一起就是這個家的底氣。', tags: ['真實資料'] },
    { id: 'huang', no: '06', zone: 'home', person: 0, icon: '🟡', name: '的房間', kind: 'room', land: '#F3E3B5', roof: '#E0A82E',
      quote: '每一次買進,都是一層樓。', tags: ['真實資料'] },
    { id: 'su', no: '07', zone: 'home', person: 1, icon: '🔵', name: '的房間', kind: 'room', land: '#D5E2F2', roof: '#4F7FC8',
      quote: '每一次買進,都是一層樓。', tags: ['真實資料'] },
    { id: 'vault', no: '08', zone: 'home', icon: '💰', name: '配息小金庫', kind: 'vault', land: '#EFE2B8',
      quote: '不用賣股票,錢自己會來。', tags: ['真實資料'] },
    { id: 'piggy', no: '09', zone: 'home', icon: '🐷', name: '月存撲滿', kind: 'piggy', land: '#F4DCE2',
      quote: '每個月存一點,撲滿會越來越重。', tags: ['真實資料'] },
    { id: 'wealth', no: '10', zone: 'future', icon: '🏗️', name: '資產里程碑', kind: 'tower', land: '#D3E4EE',
      quote: '下一站在哪裡,蓋到哪一層。', tags: ['會長大'] },
    { id: 'income', no: '11', zone: 'future', icon: '⛲', name: '被動收入', kind: 'fountain', land: '#CFE6E8',
      quote: '從月領一千開始,一站一站往上。', tags: ['會長大'] },
    { id: 'study', no: '12', zone: 'future', icon: '🌳', name: '學習之樹', kind: 'tree', land: '#D2E6C8',
      quote: '上完一堂課,樹就長大一點。', tags: ['會長大'] },
    { id: 'next', no: '13', zone: 'future', icon: '🪧', name: '下一步', kind: 'sign', land: '#DDE3EA',
      quote: '接下來想做的事,都插在這塊路牌上。', tags: ['待辦'],
      items: [
        { t: '三國:吳魏新武將(二喬、甄姬、魯肅、許褚)的卡面與專武', when: '進行中' },
        { t: '三國:200 小時以上的長線養成規劃', when: '規劃' },
        { t: '理財 APP:第一次自動內容更新', when: '11/1' }
      ] }
  ];
  // 拼成愛心的位置:x 以六邊形寬為單位(奇數列錯開半格),r 是第幾列;上面兩個圓弧、尖端朝向鏡頭
  const MYI_LAYOUT = {
    sanguo: [0.5, -1], app: [3.5, -1],
    ai: [1, 0], learnisle: [3, 0],
    huang: [1.5, 1], su: [2.5, 1], piggy: [3.5, 1],
    vault: [1, 2], home: [2, 2], wealth: [3, 2],
    income: [1.5, 3], study: [2.5, 3],
    next: [2, 4]
  };
  MYI_TILES.forEach(t => { [t.x, t.r] = MYI_LAYOUT[t.id]; });
  const MYI_LOTS = [[0, 0], [4, 0], [0.5, 1]];   // 空地:只有草地和花,不能點
  // 協作關係:哪兩格互相支援
  const MYI_LINKS = [
    ['app', 'huang', '記錄每一筆買進與配息'],
    ['app', 'su', '記錄每一筆買進與配息'],
    ['app', 'learnisle', '探索群島就在 APP 裡'],
    ['huang', 'home', '兩人的資產合在一起'],
    ['su', 'home', '兩人的資產合在一起'],
    ['huang', 'vault', '配息存進小金庫'],
    ['su', 'vault', '配息存進小金庫'],
    ['vault', 'income', '領到的配息累積成被動收入'],
    ['home', 'wealth', '合計市值推動里程碑'],
    ['learnisle', 'study', '上課與測驗的成績讓樹長大'],
    ['sanguo', 'next', '吳魏新武將、長線養成'],
    ['ai', 'app', '用 Claude 寫程式、雲端排程更新課程'],
    ['ai', 'sanguo', '一起設計玩法、寫測試、AI 生 3D 模型'],
    ['huang', 'piggy', '每個月存一點'],
    ['su', 'piggy', '每個月存一點'],
    ['piggy', 'wealth', '存下來的錢也算底氣']
  ];
  const MYI_EVENTS = [
    { d: '2026-04-30', t: '理財 APP 第一版上線', tile: 'app' },
    { d: '2026-10-17', t: '三國遊戲第一個水墨剪影戰鬥原型', tile: 'sanguo' },
    { d: '2026-10-25', t: '持股小鎮改成 3D、新增市場頁', tile: 'app' },
    { d: '2026-10-25', t: '48 把專武 3D 模型全部完成', tile: 'sanguo' },
    { d: '2026-10-26', t: '探索群島上線:AI 與理財課程', tile: 'learnisle' },
    { d: '2026-10-26', t: '三國劇本「討伐董卓」上線', tile: 'sanguo' },
    { d: '2026-10-26', t: '建立每 10 天自動更新課程的雲端排程', tile: 'ai' },
    { d: '2026-10-27', t: '我的島誕生', tile: 'home' },
    { d: '2026-11-01', t: '第一次自動內容更新', tile: 'learnisle' }
  ];
  const MYI_WEALTH = [1e5, 3e5, 5e5, 1e6, 2e6, 3e6, 5e6, 1e7, 2e7, 5e7];
  const MYI_INCOME = [12e3, 36e3, 6e4, 12e4, 24e4, 36e4, 6e5, 12e5];   // 年配息:月領 1 千、3 千、5 千、1 萬、2 萬、3 萬、5 萬、10 萬

  // ---------- 資料 ----------
  const myiWan = (n) => n >= 1e8 ? (n / 1e8).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' 億'
    : (n / 1e4).toLocaleString('en-US', { maximumFractionDigits: n < 1e5 ? 1 : 0 }) + ' 萬';
  const myiM = (n) => `<span class="town-num">${fmt.money(n)}</span>`;          // 隱私模式會模糊
  const myiW = (n) => `<span class="town-num">${myiWan(n)}</span>`;
  const myiPeople = () => (CONFIG.PEOPLE || []);
  const myiTileName = (t) => t.person !== undefined ? getPersonLabel(myiPeople()[t.person]) + t.name : t.name;
  function myiGoal(list, v) {
    const next = list.find(x => x > v) || list[list.length - 1] * 2;
    return { next, passed: list.filter(x => x <= v), pct: Math.max(0, Math.min(1, v / next)) };
  }
  function myiLessons() {
    const sets = typeof ALL_LESSON_SETS === 'function' ? ALL_LESSON_SETS() : [];
    const prog = typeof learnProgress === 'function' ? learnProgress() : {};
    const isles = ['ai-intro', 'auto', 'finance'];   // 跟 ALL_LESSON_SETS 的順序一樣
    let total = 0, done = 0, quiz = 0, answered = 0, right = 0, wrong = 0, next = null;
    const per = sets.map(([name, L], i) => {
      const d = L.filter(l => prog[l.id]).length;
      total += L.length; done += d;
      L.forEach(l => {
        quiz += (l.quiz || []).length;
        const p = prog[l.id];
        if (p) { answered += p.total || 0; right += p.score || 0; wrong += (p.wrong || []).length; }
        else if (!next) next = { isle: isles[i], id: l.id, title: l.title, icon: l.icon };   // 下一堂還沒上的課
      });
      return { name, done: d, total: L.length };
    });
    return { total, done, quiz, answered, right, wrong, next, per };
  }
  function myiData() {
    if (!STATE.data) return null;
    const P = myiPeople();
    const stats = computePersonStats();
    const buys = (STATE.data.purchases || []).filter(r => Number(r.shares) > 0 && Number(r.amount) >= 0)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const divs = (STATE.data.dividends || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const year = autodivYmd(new Date()).slice(0, 4);
    const per = {};
    P.forEach(p => {
      const b = buys.filter(r => r.person === p);
      const cnt = {};
      b.forEach(r => { cnt[r.symbol] = (cnt[r.symbol] || 0) + 1; });
      const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0];
      const st = stats[p] || {};
      const d = divs.filter(r => r.person === p);
      per[p] = {
        label: getPersonLabel(p), buys: b.length, first: b.length ? String(b[0].date).slice(0, 10) : '',
        top: top ? top[0] : '', topN: top ? top[1] : 0,
        cost: st.totalCost || 0, value: st.marketValue || 0, yearly: st.annualYield || 0,
        held: Object.keys(computeOpenHoldings(p)).length,
        divTotal: d.reduce((a, r) => a + (Number(r.total) || 0), 0), divN: d.length,
        divYear: d.filter(r => String(r.date).slice(0, 4) === year).reduce((a, r) => a + (Number(r.total) || 0), 0)
      };
    });
    const sum = (k) => P.reduce((a, p) => a + (per[p][k] || 0), 0);
    return {
      P, per, buys, divs, stats,
      cost: sum('cost'), value: sum('value'), yearly: sum('yearly'), divTotal: sum('divTotal'), divN: sum('divN'), divYear: sum('divYear'),
      held: Object.keys(computeOpenHoldings()).length, lessons: myiLessons()
    };
  }

  // 每一格的即時內容:sub = 3D 看板上的第二行(不放金額);grow = 0~1 給 3D 長大用;html = 下方細節
  function myiLive(t, D) {
    if (!D) return { sub: MYI_ZONES[t.zone].name, grow: 0.3, html: '' };
    const pct = (a, b) => b ? ((a - b) / b * 100) : 0;
    const chg = (v, c) => { if (!v || !c) return '—'; const x = pct(v, c); return `<span class="${x >= 0 ? 'gain' : 'loss'}">${x >= 0 ? '+' : ''}${x.toFixed(1)}%</span>`; };
    const stat = (k, v) => `<div class="myi-stat"><span class="muted small">${k}</span><b>${v}</b></div>`;
    const bar = (p) => `<div class="myi-bar"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`;
    if (t.id === 'app') return { sub: `${D.buys.length} 筆買進記錄`, grow: 0.6, html: `<div class="myi-stats">${stat('買進記錄', D.buys.length + ' 筆')}${stat('配息記錄', D.divN + ' 筆')}${stat('課程', D.lessons.total + ' 堂')}</div>` };
    if (t.id === 'learnisle') return { sub: `${D.lessons.total} 堂課・${D.lessons.quiz} 題`, grow: 0.6, html: '' };
    if (t.id === 'home') return {
      sub: `兩人・持有 ${D.held} 檔`, grow: 0.6,
      html: `<div class="myi-stats">${stat('合計投入', myiM(D.cost))}${stat('合計市值', D.value ? myiM(D.value) : '—')}${stat('報酬', chg(D.value, D.cost))}${stat('預估年配息', myiM(D.yearly))}</div>`
    };
    if (t.person !== undefined) {
      const x = D.per[D.P[t.person]];
      if (!x) return { sub: '', grow: 0.2, html: '' };
      return {
        sub: `${x.buys} 次買進・${x.held} 檔`, grow: Math.min(1, x.value / 1e6),
        html: `<div class="myi-stats">${stat('投入', myiM(x.cost))}${stat('市值', x.value ? myiM(x.value) : '—')}${stat('報酬', chg(x.value, x.cost))}${stat('預估年配息', myiM(x.yearly))}</div>
          <div class="muted small">${x.first ? `第一次買進:${x.first}` : '還沒有買進記錄'}${x.top ? `・最常買 ${escapeHtml(x.top)}(${x.topN} 次)` : ''}</div>`
      };
    }
    if (t.id === 'piggy') {
      const n = (STATE.data.savings || []).length;
      const save = D.P.reduce((a, p) => a + (D.stats[p] ? D.stats[p].savings || 0 : 0), 0);
      const bank = D.P.reduce((a, p) => a + (D.stats[p] ? D.stats[p].bankBalance || 0 : 0), 0);
      return {
        sub: `存了 ${n} 筆`, grow: Math.min(1, n / 24),
        html: `<div class="myi-stats">${stat('月存累計', myiM(save))}${stat('銀行餘額', myiM(bank))}${stat('筆數', n + ' 筆')}</div>`
      };
    }
    if (t.id === 'vault') {
      const last = D.divs[D.divs.length - 1];
      return {
        sub: `已領 ${D.divN} 次`, grow: Math.min(1, D.divN / 24),
        html: `<div class="myi-stats">${stat('累計領到', myiM(D.divTotal))}${stat('今年', myiM(D.divYear))}${stat('次數', D.divN + ' 次')}</div>
          ${last ? `<div class="muted small">最近一筆:${escapeHtml(String(last.date).slice(0, 10))} ${escapeHtml(getPersonLabel(last.person))} ${escapeHtml(last.symbol || '')}</div>` : ''}`
      };
    }
    if (t.id === 'wealth') {
      const g = myiGoal(MYI_WEALTH, D.value || D.cost);   // 還沒有報價時先用投入金額
      return {
        sub: `下一站進度 ${Math.round(g.pct * 100)}%`, grow: g.pct,
        html: `<div class="muted small">兩人合計${D.value ? '市值 ' + myiM(D.value) : '投入 ' + myiM(D.cost)} → 下一站 ${myiW(g.next)}</div>${bar(g.pct)}
          ${g.passed.length ? `<div class="myi-chips">${g.passed.map(v => `<span class="myi-chip done">✓ ${myiW(v)}</span>`).join('')}</div>` : ''}`
      };
    }
    if (t.id === 'income') {
      const g = myiGoal(MYI_INCOME, D.yearly);
      return {
        sub: `下一站進度 ${Math.round(g.pct * 100)}%`, grow: g.pct,
        html: `<div class="muted small">預估年配息 ${myiM(D.yearly)}(平均每月 ${myiM(D.yearly / 12)})→ 下一站「月領 ${myiW(g.next / 12)}」</div>${bar(g.pct)}
          <div class="muted small">預估年配息用證交所歷史配息推算,實際以發放為準。</div>`
      };
    }
    if (t.id === 'study') {
      const L = D.lessons, p = L.total ? L.done / L.total : 0;
      return {
        sub: `完成 ${L.done}/${L.total} 課${L.wrong ? `・🏮 ${L.wrong}` : ''}`, grow: p, lanterns: L.wrong,
        html: `${bar(p)}<div class="myi-stats">${L.per.map(x => stat(x.name, `${x.done}/${x.total}`)).join('')}</div>
          ${L.answered ? `<div class="muted small">答對 ${L.right}/${L.answered} 題(${Math.round(L.right / L.answered * 100)}%)${L.wrong ? `・樹上掛著 ${L.wrong} 盞錯題燈籠,複習答對就會熄掉` : ''}</div>` : '<div class="muted small">還沒上過課,按「繼續上課」從第一堂開始。</div>'}
          <div class="myi-acts">
            ${L.next ? `<button type="button" class="btn small" data-myi-go="lesson">📖 繼續上課<span class="muted small">${L.next.icon} ${escapeHtml(L.next.title)}</span></button>`
              : '<button type="button" class="btn small" disabled>🎉 全部上完了<span class="muted small">新課每 10 天會自動加進來</span></button>'}
            <button type="button" class="btn ghost small" data-myi-go="review"${L.wrong ? '' : ' disabled'}>📝 複習錯題<span class="muted small">${L.wrong ? `${L.wrong} 題待複習` : '目前沒有錯題'}</span></button>
          </div>`
      };
    }
    if (myiEditable(t)) {
      const items = myiItems(t), done = items.filter(x => x.done).length;
      if (t.custom) return { sub: items.length ? `${done}/${items.length} 完成` : '還沒有進度', grow: items.length ? done / items.length : 0, html: '' };
      return { sub: t.id === 'next' ? `${items.length - done} 項待辦` : `${done}/${items.length} 完成`, grow: 0.5, html: '' };
    }
    return { sub: MYI_ZONES[t.zone].name, grow: 0.5, html: '' };
  }

  // 時間軸:固定的里程碑 + 從資料算出來的(第一次買進、累計投入突破、第一次領配息)
  // ---------- 進度:作品區與下一步可以自己打勾、新增、刪除 ----------
  // 存在試算表 _island:內建細項用 note 'ref:<格子>:<序號>' 記完成日(date 空白 = 沒完成)、'hide:<格子>:<序號>' = 刪掉;
  // note 空白的是自己新增的細項。改動先更新畫面再送後端,失敗就還原。
  const myiEditable = (t) => t.zone === 'work' || t.id === 'next' || !!t.custom;
  const myiDefaultDone = (when) => /^\d{1,2}\/\d{1,2}$|月$/.test(when || '');   // 內建細項寫了日期的 = 已經做完
  const myiIsYmd = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  function myiRows() { return STATE.data && Array.isArray(STATE.data.island) ? STATE.data.island : []; }
  function myiItems(t) {
    const rows = myiRows().filter(r => String(r.tile) === t.id);
    const out = [];
    (t.items || []).forEach((x, i) => {
      const key = t.id + ':' + i;
      if (rows.some(r => r.note === 'hide:' + key)) return;
      const ref = rows.find(r => r.note === 'ref:' + key);
      const done = ref ? (ref.date ? String(ref.date).slice(0, 10) : '') : (t.zone === 'work' && myiDefaultDone(x.when) ? x.when : '');   // 下一步的項目預設都還沒做
      out.push({ key, text: x.t, when: x.when || '', done, ref });
    });
    rows.filter(r => !r.note).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .forEach(r => out.push({ key: 'u:' + r.id, text: String(r.text || ''), when: '', done: r.date ? String(r.date).slice(0, 10) : '', row: r }));
    return out;
  }
  // opts.rebuild:格子或協作線有變,3D 要整個重做;opts.select:做完要選哪一格
  async function myiSave(apply, send, opts) {
    if (MYI.saving) return;
    MYI.saving = true;
    opts = opts || {};
    const prevSel = MYI.sel;
    const undo = apply();
    if (opts.select !== undefined) MYI.sel = opts.select;
    myiAfterEdit(opts.rebuild);
    try {
      await send();
      localStorage.setItem(KEY.cache, JSON.stringify(STATE.data));
      myiAfterEdit();   // 新增的那筆拿到正式 id 後重畫,按鈕才會對到它
    } catch (e) {
      undo();
      if (opts.select !== undefined) MYI.sel = prevSel;
      myiAfterEdit(opts.rebuild);
      alert('儲存失敗:' + e.message + '\n已還原這次修改,建議稍後再試或按「重新載入」同步');
    } finally {
      MYI.saving = false;
    }
  }
  function myiNewRow(t, text, date, note) {
    return { id: 'tmp-' + Date.now(), tile: t.id, text, date, note, created_at: new Date().toISOString() };
  }
  function myiPush(row) {
    const arr = STATE.data.island || (STATE.data.island = []);
    return [() => { arr.push(row); return () => { const i = arr.indexOf(row); if (i >= 0) arr.splice(i, 1); }; },
      async () => { const r = await API.addIsland({ tile: row.tile, text: row.text, date: row.date, note: row.note, created_by: STATE.defaultPerson }); row.id = r.id; }];
  }
  function myiToggle(t, key) {
    const it = myiItems(t).find(x => x.key === key);
    if (!it || !STATE.data) return;
    const next = it.done ? '' : autodivYmd(new Date());
    const row = it.row || it.ref;
    if (row) {
      const prev = row.date;
      myiSave(() => { row.date = next; return () => { row.date = prev; }; }, () => API.updateRecord('_island', row.id, { date: next }));
    } else {
      myiSave(...myiPush(myiNewRow(t, it.text, next, 'ref:' + key)));
    }
  }
  function myiDelete(t, key) {
    const it = myiItems(t).find(x => x.key === key);
    if (!it || !STATE.data || !confirm(`刪除「${it.text}」?`)) return;
    if (it.row) {
      const arr = STATE.data.island, row = it.row;
      let at = -1;
      myiSave(() => { at = arr.indexOf(row); arr.splice(at, 1); return () => arr.splice(at, 0, row); }, () => API.deleteRecord('_island', row.id));
    } else {
      myiSave(...myiPush(myiNewRow(t, it.text, '', 'hide:' + key)));   // 內建細項:記一筆「隱藏」
    }
  }
  function myiAdd(t, text) {
    text = String(text || '').trim().slice(0, 80);
    if (!text || !STATE.data) return;
    myiSave(...myiPush(myiNewRow(t, text, '', '')));
  }
  // 改完:重畫細節、更新那一格的看板;rebuild = 格子或協作線變了,3D 整個重做
  function myiAfterEdit(rebuild) {
    if (MYI.s && rebuild) {
      const keep = MYI.sel;
      myiFill(myiData());
      MYI.sel = null;
      myiSelect(keep && myiTile(keep) ? keep : null);
      return;
    }
    const t = myiTile(MYI.sel);
    if (MYI.s && t) {
      const x = MYI.s.tiles.find(y => y.t.id === t.id);
      if (x) x.sub = myiLive(t, myiData()).sub;
      myiHighlight();
    }
    myiRenderDetail();
  }

  // ---------- 自己新增的格子與協作線(也存在 _island) ----------
  // 格子:tile '_tile'、text = 名稱、note 'tile:{key,icon,zone,quote,pos}';細項的 tile 欄填 key
  // 協作線:tile '_link'、text = 說明、note 'link:<a>><b>';拿掉內建的線 = note 'unlink:<a>><b>'
  const MYI_LAND = { work: '#EADCC6', home: '#F2D6D6', future: '#D3E4EE' };
  const MYI_ICONS = ['🌱', '🎮', '🎨', '📚', '🏃', '✈️', '🎵', '🧪', '📷', '🍳', '💼', '🐾'];
  const myiPosKey = (x, r) => x + ',' + r;
  function myiJson(note, pre) {
    try { return JSON.parse(String(note || '').slice(pre.length)); } catch (_) { return null; }
  }
  // 新格子放哪:先填三塊空地,再從心形外圍由近到遠;上面兩個圓弧中間的凹口最後才填
  let myiSlotCache = null;
  function myiSlots() {
    if (myiSlotCache) return myiSlotCache;
    const used = new Set(MYI_TILES.map(t => myiPosKey(t.x, t.r)));
    const notch = [[2, 0], [1.5, -1], [2.5, -1]];
    const skip = new Set(MYI_LOTS.concat(notch).map(p => myiPosKey(p[0], p[1])));
    const cells = [];
    for (let r = -3; r <= 7; r++) for (let k = -4; k <= 8; k++) {
      const x = k + (r % 2 ? 0.5 : 0), key = myiPosKey(x, r);
      if (!used.has(key) && !skip.has(key)) cells.push([x, r]);
    }
    const far = (p) => { const q = myiPos({ x: p[0], r: p[1] }); return Math.hypot(q.x, q.z * 0.9); };
    cells.sort((a, b) => far(a) - far(b));
    myiSlotCache = MYI_LOTS.map(p => p.slice()).concat(cells, notch.slice(1));   // [2,0] 是主角大愛心的位置,不放格子
    return myiSlotCache;
  }
  function myiCustomTiles() {
    const used = new Set(MYI_TILES.map(t => myiPosKey(t.x, t.r)));
    const out = [];
    myiRows().filter(r => r.tile === '_tile' && /^tile:/.test(r.note || ''))
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .forEach(r => {
        const j = myiJson(r.note, 'tile:');
        if (!j || !j.key) return;
        let pos = Array.isArray(j.pos) && j.pos.length === 2 ? j.pos.map(Number) : null;
        if (!pos || used.has(myiPosKey(pos[0], pos[1]))) pos = myiSlots().find(p => !used.has(myiPosKey(p[0], p[1])));   // 兩台手機同時新增撞位置:往後找空位
        if (!pos) return;
        used.add(myiPosKey(pos[0], pos[1]));
        const zone = MYI_ZONES[j.zone] ? j.zone : 'work';
        out.push({ id: String(j.key), custom: true, row: r, no: String(MYI_TILES.length + out.length + 1).padStart(2, '0'),
          zone, icon: j.icon || '🌱', name: String(r.text || '新的一格'), kind: 'custom', land: MYI_LAND[zone],
          quote: j.quote || '', tags: ['自己新增'], x: pos[0], r: pos[1] });
      });
    return out;
  }
  const myiAllTiles = () => MYI_TILES.concat(myiCustomTiles());
  const myiTile = (id) => id ? myiAllTiles().find(t => t.id === id) : null;
  function myiAllLinks() {
    const rows = myiRows().filter(r => r.tile === '_link');
    const hidden = new Set(rows.filter(r => /^unlink:/.test(r.note || '')).map(r => r.note.slice(7)));
    const ids = new Set(myiAllTiles().map(t => t.id));
    const out = MYI_LINKS.map(([a, b, text]) => ({ a, b, text, key: a + '>' + b })).filter(l => !hidden.has(l.key));
    rows.filter(r => /^link:/.test(r.note || ''))
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .forEach(r => { const [a, b] = r.note.slice(5).split('>'); out.push({ a, b, text: String(r.text || ''), key: 'u:' + r.id, row: r }); });
    return out.filter(l => ids.has(l.a) && ids.has(l.b) && l.a !== l.b);
  }
  const myiIsLinked = (a, b) => myiAllLinks().some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));

  function myiAddTile(v) {
    const name = String(v.name || '').trim().slice(0, 20);
    if (!name || !STATE.data) return;
    const used = new Set(myiAllTiles().map(t => myiPosKey(t.x, t.r)));
    const pos = myiSlots().find(p => !used.has(myiPosKey(p[0], p[1])));
    if (!pos) { alert('島上已經沒有空位了'); return; }
    const key = 't' + Date.now().toString(36);
    const note = 'tile:' + JSON.stringify({ key, icon: v.icon || '🌱', zone: v.zone, quote: String(v.quote || '').trim().slice(0, 60), pos });
    MYI.form = null;
    myiSave(...myiPush({ id: 'tmp-' + Date.now(), tile: '_tile', text: name, date: '', note, created_at: new Date().toISOString() }), { rebuild: true, select: key });
  }
  function myiEditTile(t, v) {
    const name = String(v.name || '').trim().slice(0, 20);
    if (!name || !t.row) return;
    const j = myiJson(t.row.note, 'tile:') || {};
    const note = 'tile:' + JSON.stringify(Object.assign(j, { icon: v.icon || '🌱', zone: v.zone, quote: String(v.quote || '').trim().slice(0, 60) }));
    const row = t.row, prev = { text: row.text, note: row.note };
    MYI.form = null;
    myiSave(() => { Object.assign(row, { text: name, note }); return () => Object.assign(row, prev); },
      () => API.updateRecord('_island', row.id, { text: name, note }), { rebuild: true });
  }
  // 刪格子:連它的細項、牽到它的協作線一起刪
  function myiDeleteTile(t) {
    if (!t.row || !confirm(`刪除「${t.name}」這一格?裡面的進度和協作線也會一起刪掉。`)) return;
    const arr = STATE.data.island;
    const gone = arr.filter(r => r === t.row || String(r.tile) === t.id || (r.tile === '_link' && /^(un)?link:/.test(r.note || '') && r.note.replace(/^(un)?link:/, '').split('>').includes(t.id)));
    let snap = null;
    myiSave(() => { snap = arr.slice(); for (let i = arr.length - 1; i >= 0; i--) if (gone.includes(arr[i])) arr.splice(i, 1); return () => { arr.length = 0; arr.push(...snap); }; },
      async () => {
        await API.deleteRecord('_island', t.row.id);
        for (const r of gone) if (r !== t.row) { try { await API.deleteRecord('_island', r.id); } catch (_) { /* 已經沒有這一格,剩下的列留著也不影響 */ } }
      }, { rebuild: true, select: null });
  }
  function myiAddLink(t, other, text) {
    text = String(text || '').trim().slice(0, 40);
    if (!other || !STATE.data || myiIsLinked(t.id, other)) return;
    myiSave(...myiPush({ id: 'tmp-' + Date.now(), tile: '_link', text: text || '互相支援', date: '', note: 'link:' + t.id + '>' + other, created_at: new Date().toISOString() }), { rebuild: true });
  }
  function myiDeleteLink(key) {
    const l = myiAllLinks().find(x => x.key === key);
    const A = l && myiTile(l.a), B = l && myiTile(l.b);
    if (!l || !confirm(`拿掉「${myiTileName(A)} ↔ ${myiTileName(B)}」這條協作線?`)) return;
    if (l.row) {
      const arr = STATE.data.island, row = l.row;
      let at = -1;
      myiSave(() => { at = arr.indexOf(row); arr.splice(at, 1); return () => arr.splice(at, 0, row); }, () => API.deleteRecord('_island', row.id), { rebuild: true });
    } else {
      myiSave(...myiPush({ id: 'tmp-' + Date.now(), tile: '_link', text: '', date: '', note: 'unlink:' + l.key, created_at: new Date().toISOString() }), { rebuild: true });
    }
  }
  // 新增/編輯格子的表單
  function myiTileFormHtml(t) {
    const v = t ? { name: t.name, icon: t.icon, zone: t.zone, quote: t.quote } : { name: '', icon: '🌱', zone: 'work', quote: '' };
    return `<form class="myi-form" data-myi-form="${t ? 'edit' : 'tile'}">
      <div class="myi-sub" style="margin-top:0;">${t ? '編輯這一格' : '新增一格'}</div>
      <label class="small muted">圖示</label>
      <div class="myi-icons">${MYI_ICONS.map(i => `<button type="button" class="myi-ico${i === v.icon ? ' on' : ''}" data-ico="${i}">${i}</button>`).join('')}
        <input type="text" name="icon" maxlength="4" value="${escapeHtml(v.icon)}" aria-label="自訂圖示" class="myi-ico-in"></div>
      <label class="small muted">名稱</label>
      <input type="text" name="name" maxlength="20" required value="${escapeHtml(v.name)}" placeholder="例如:健身、旅行、新的遊戲">
      <label class="small muted">放在哪一區</label>
      <div class="myi-zpick">${Object.entries(MYI_ZONES).map(([k, z]) => `<label style="--zone:${z.color}"><input type="radio" name="zone" value="${k}"${k === v.zone ? ' checked' : ''}><span>${z.name}</span></label>`).join('')}</div>
      <label class="small muted">一句話(可不填)</label>
      <input type="text" name="quote" maxlength="60" value="${escapeHtml(v.quote)}" placeholder="這一格對你的意義">
      <div class="myi-form-btns"><button type="submit" class="btn small">${t ? '儲存' : '＋ 新增到島上'}</button><button type="button" class="btn ghost small" data-myi-cancel>取消</button></div>
    </form>`;
  }
  function myiBindTileForm(box, t) {
    const f = box.querySelector('[data-myi-form]');
    if (!f) return;
    const icon = f.querySelector('[name=icon]');
    f.querySelectorAll('[data-ico]').forEach(b => {
      b.onclick = () => { icon.value = b.dataset.ico; f.querySelectorAll('[data-ico]').forEach(x => x.classList.toggle('on', x === b)); };
    });
    f.querySelector('[data-myi-cancel]').onclick = () => { MYI.form = null; myiRenderDetail(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      const val = (n) => f.querySelector(`[name=${n}]`).value;   // 不能用 f.name:那是表單自己的 name 屬性
      const v = { name: val('name'), icon: icon.value.trim(), zone: (f.querySelector('[name=zone]:checked') || {}).value || 'work', quote: val('quote') };
      if (t) myiEditTile(t, v); else myiAddTile(v);
    };
  }
  function myiItemsHtml(t) {
    const items = myiItems(t), edit = myiEditable(t);
    if (!items.length && !edit) return '';
    const fmtDone = (d) => myiIsYmd(d) ? `✓ ${+d.slice(5, 7)}/${+d.slice(8)}` : `✓ ${d}`;
    return `<div class="myi-sub">${t.id === 'next' ? '待辦' : '細項'}${edit ? ' <span class="muted small" style="font-weight:400;">・點圓圈打勾,完成的會記到時間軸</span>' : ''}</div>
      <ul class="myi-items${edit ? ' edit' : ''}${t.id === 'next' ? ' todo' : ''}">${items.map(x => `<li class="${x.done ? 'done' : ''}">
        ${edit ? `<button type="button" class="myi-chk" data-chk="${escapeHtml(x.key)}" aria-label="${x.done ? '取消完成' : '標記完成'}">${x.done ? '✓' : ''}</button>` : ''}
        <span class="myi-it">${escapeHtml(x.text)}</span>
        <span class="muted small myi-when">${escapeHtml(x.done ? fmtDone(x.done) : x.when)}</span>
        ${edit ? `<button type="button" class="myi-del" data-del="${escapeHtml(x.key)}" aria-label="刪除">✕</button>` : ''}
      </li>`).join('')}${!items.length ? '<li class="muted small">還沒有項目,在下面新增第一項。</li>' : ''}</ul>
      ${edit ? `<form class="myi-add"><input type="text" maxlength="80" placeholder="${t.id === 'next' ? '新增一件想做的事…' : '新增一項進度…'}" aria-label="新增項目"><button type="submit" class="btn small">＋ 新增</button></form>` : ''}`;
  }

  function myiTimeline(D) {
    const ev = MYI_EVENTS.map(e => Object.assign({}, e));
    // 自己打勾完成的細項(內建或自己新增的)記到完成那天
    myiAllTiles().filter(myiEditable).forEach(t => {
      if (t.custom && t.row.created_at) ev.push({ d: autodivYmd(new Date(t.row.created_at)), t: `🌱 島上多了一格「${t.name}」`, tile: t.id });
      myiItems(t).forEach(x => {
        if ((x.row || x.ref) && myiIsYmd(x.done)) ev.push({ d: x.done, t: '✓ ' + x.text, tile: t.id });
      });
    });
    if (D) {
      D.P.forEach((p, i) => { if (D.per[p].first) ev.push({ d: D.per[p].first, t: `${D.per[p].label}第一次買進`, tile: i ? 'su' : 'huang' }); });
      let cum = 0;
      const ms = MYI_WEALTH.slice();
      D.buys.forEach(r => {
        cum += (Number(r.amount) || 0) + (Number(r.fee) || 0);
        while (ms.length && cum >= ms[0]) { ev.push({ d: String(r.date).slice(0, 10), t: '兩人累計投入突破', money: ms[0], tile: 'wealth' }); ms.shift(); }
      });
      if (D.divs.length) ev.push({ d: String(D.divs[0].date).slice(0, 10), t: '第一次領到配息', tile: 'vault' });
    }
    return ev.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.d)).sort((a, b) => a.d.localeCompare(b.d));
  }

  // ---------- 3D ----------
  // 愛心形狀(探索地圖上的我的島也用這個)
  function myiHeartGeo(k, depth, smooth) {
    const s = new THREE.Shape();
    s.moveTo(0, -k * 0.9);
    s.bezierCurveTo(k * 0.2, -k * 0.6, k, -k * 0.3, k, k * 0.25);
    s.bezierCurveTo(k, k * 0.75, k * 0.45, k * 0.95, 0, k * 0.5);
    s.bezierCurveTo(-k * 0.45, k * 0.95, -k, k * 0.75, -k, k * 0.25);
    s.bezierCurveTo(-k, -k * 0.3, -k * 0.2, -k * 0.6, 0, -k * 0.9);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: k * 0.08, bevelSegments: smooth ? 5 : 2, curveSegments: smooth ? 28 : 10 });
    g.center();
    return g;
  }
  // 浮在格子上的圖示(emoji 畫在 canvas 上當貼圖)
  function myiEmoji(icon) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.1, 1.1, 1);
    return sp;
  }

  const MYI_R = 1.7, MYI_W = Math.sqrt(3) * MYI_R;
  const myiPos = (t) => ({ x: (t.x - 2) * MYI_W, z: (t.r - 1.5) * 1.5 * MYI_R });

  // ---------- 質感:一座島一個色系、整塊愛心島、光影後製 ----------
  // 白天是粉彩黃昏,深色模式是粉彩夜晚;作品/家/未來三區只是地上不同顏色的色塊
  const MYI_PAL = {
    day: { skyTop: '#BDBDF0', skyMid: '#E8D3EE', skyLow: '#FBE0D4', sea: '#7CC3CC', shallow: '#A8E2DA', sand: '#F0D6A8', earth: '#D8B48C',
      grass: '#BCDD9C', hemiSky: '#FFF4EC', hemiGround: '#B496A6', sun: '#FFE8D0', sunI: 1.6, hemiI: 0.36, work: '#F6B486', home: '#F39DB5', future: '#98C3EC', exposure: 1.0 },
    night: { skyTop: '#1A1838', skyMid: '#2E2650', skyLow: '#4E3E66', sea: '#4A4060', shallow: '#6A6488', sand: '#B6A39C', earth: '#7A6070',
      grass: '#5F7E6C', hemiSky: '#D2CAF2', hemiGround: '#3A2A44', sun: '#E2DAFF', sunI: 0.8, hemiI: 0.45, work: '#B9806A', home: '#B47590', future: '#6A8CB8', exposure: 1.15 }
  };
  const myiLin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  // 道具顏色收斂成粉彩:降一點彩度、提一點亮度,整座島才會是同一個色系
  function myiPastel(hex, dark) {
    const c = new THREE.Color(hex), h = {};
    c.getHSL(h);
    c.setHSL(h.h, h.s * (dark ? 0.7 : 0.78), h.l + (1 - h.l) * (dark ? 0.02 : 0.14));
    return c.convertSRGBToLinear();
  }
  // 島的外形:配合格子排法的胖愛心(尖端朝鏡頭);scale 放大就是沙灘、淺水。形狀座標 (x, y) = 世界 (x, -z)
  function myiIslandShape(scale) {
    const kx = 7.9 * scale, ky = 10.3 * scale, c = 0.6;
    const P = (x, y) => [x * kx, y * ky + c];
    const s = new THREE.Shape();
    s.moveTo(...P(0, -0.9));
    s.bezierCurveTo(...P(0.2, -0.6), ...P(1, -0.3), ...P(1, 0.25));
    s.bezierCurveTo(...P(1, 0.75), ...P(0.45, 0.95), ...P(0, 0.5));
    s.bezierCurveTo(...P(-0.45, 0.95), ...P(-1, 0.75), ...P(-1, 0.25));
    s.bezierCurveTo(...P(-1, -0.3), ...P(-0.2, -0.6), ...P(0, -0.9));
    return s;
  }
  let myiHeartPoly = null;
  function myiInHeart(x, z) {   // 格子中心在不在大島裡(留一點邊),不在的就給它一座小離島
    if (!myiHeartPoly) myiHeartPoly = myiIslandShape(0.9).getPoints(90);
    const px = x, py = -z;
    let inside = false;
    for (let i = 0, j = myiHeartPoly.length - 1; i < myiHeartPoly.length; j = i++) {
      const a = myiHeartPoly[i], b = myiHeartPoly[j];
      if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  const MYI_BOX = { minX: -8.6, maxX: 8.6, minY: -0.9 * 10.3 + 0.6 - 0.7, maxY: 0.95 * 10.3 + 0.6 + 0.7 };   // 地面貼圖涵蓋的範圍(形狀座標)
  const myiRand = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // 地面貼圖:底色 + 每一格一團不規則的區域色塊 + 細小雜點,看起來像手繪
  function myiTerrainTex(all, P, size) {
    const B = MYI_BOX, W = B.maxX - B.minX, H = B.maxY - B.minY;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = P.grass; g.fillRect(0, 0, size, size);
    const px = (x) => (x - B.minX) / W * size, py = (z) => (B.maxY + z) / H * size, ps = (r) => r / W * size;
    const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`; };
    const blob = (x, z, r, hex, a) => {
      const gr = g.createRadialGradient(px(x), py(z), 0, px(x), py(z), ps(r));
      gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(0.55, rgba(hex, a)); gr.addColorStop(1, rgba(hex, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(px(x), py(z), ps(r), 0, Math.PI * 2); g.fill();
    };
    all.forEach((t, i) => {
      const p = myiPos(t), rnd = myiRand(i * 97 + 13);
      blob(p.x, p.z, 1.75, P[t.zone], 0.95);
      for (let k = 0; k < 5; k++) { const a = rnd() * Math.PI * 2, d = 0.6 + rnd() * 0.7; blob(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 0.7 + rnd() * 0.5, P[t.zone], 0.8); }
    });
    const rnd = myiRand(7);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(60,40,40,.05)';
      g.beginPath(); g.arc(rnd() * size, rnd() * size, 1 + rnd() * size / 300, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.repeat.set(1 / W, 1 / H); tex.offset.set(-B.minX / W, -B.minY / H);
    tex.anisotropy = 4;
    return tex;
  }
  function myiSkyTex(P) {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, P.skyTop); gr.addColorStop(0.55, P.skyMid); gr.addColorStop(1, P.skyLow);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 光影後製:亮的地方柔柔發光(bloom)、四周微暗;看板另外畫在最上層
  const MYI_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  function myiPostInit(renderer) {
    const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = (o) => new THREE.WebGLRenderTarget(1, 1, Object.assign({ type, depthBuffer: false }, o));
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: MYI_VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const P = { main: rt({ samples: 4, depthBuffer: true }), a: rt(), b: rt(), scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    P.bright = mat(`uniform sampler2D t; uniform float th; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb; float l = dot(c, vec3(.2126, .7152, .0722)); gl_FragColor = vec4(c * smoothstep(th, th + .6, l), 1.); }`,
      { t: { value: null }, th: { value: 0.7 } });
    P.blur = mat(`uniform sampler2D t; uniform vec2 d; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb * .227027;
        c += (texture2D(t, vUv + d * 1.3846).rgb + texture2D(t, vUv - d * 1.3846).rgb) * .3162162;
        c += (texture2D(t, vUv + d * 3.2308).rgb + texture2D(t, vUv - d * 3.2308).rgb) * .0702703;
        gl_FragColor = vec4(c, 1.); }`, { t: { value: null }, d: { value: new THREE.Vector2() } });
    // 這版 three.js 畫進暫存畫面時材質已經做過 ACES 色調,這裡只加柔光、暗角,再轉回 sRGB
    P.comp = mat(`uniform sampler2D t; uniform sampler2D bl; uniform float k; varying vec2 vUv;
      vec3 srgb(vec3 c){ return mix(pow(c, vec3(.41666)) * 1.055 - .055, c * 12.92, vec3(lessThanEqual(c, vec3(.0031308)))); }
      void main(){
        vec3 c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * k;
        vec2 q = vUv - .5; c *= 1. - dot(q, q) * .45;
        gl_FragColor = vec4(srgb(clamp(c, 0., 1.)), 1.); }`, { t: { value: null }, bl: { value: null }, k: { value: 0.5 } });
    P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), P.comp);
    P.quad.frustumCulled = false;
    P.scene.add(P.quad);
    return P;
  }
  function myiPostSize(P, w, h) {
    P.main.setSize(w, h);
    P.a.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    P.b.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }
  function myiRender(s) {
    const r = s.renderer, P = s.post;
    s.camera.layers.set(0);
    if (P) {
      const pass = (m, to) => { P.quad.material = m; r.setRenderTarget(to); r.render(P.scene, P.cam); };
      r.setRenderTarget(P.main);
      r.render(s.scene, s.camera);
      P.bright.uniforms.t.value = P.main.texture; pass(P.bright, P.a);
      for (let i = 1; i <= 2; i++) {
        P.blur.uniforms.t.value = P.a.texture; P.blur.uniforms.d.value.set(i / P.a.width, 0); pass(P.blur, P.b);
        P.blur.uniforms.t.value = P.b.texture; P.blur.uniforms.d.value.set(0, i / P.a.height); pass(P.blur, P.a);
      }
      P.comp.uniforms.t.value = P.main.texture; P.comp.uniforms.bl.value = P.a.texture;
      pass(P.comp, null);
    } else {
      r.render(s.scene, s.camera);
    }
    // 看板(layer 1)最後直接畫上去:不被後製改顏色,也不會被房子擋住
    const bg = s.scene.background;
    s.scene.background = null;
    r.autoClear = false; r.shadowMap.autoUpdate = false;
    s.camera.layers.set(1);
    r.render(s.scene, s.camera);
    s.camera.layers.set(0);
    r.autoClear = true; r.shadowMap.autoUpdate = true;
    s.scene.background = bg;
  }
  // 舊手機:沒有 WebGL2、核心少或記憶體小,就不開後製;localStorage pr.myiFx = on/off 可以強制
  function myiHighQuality(renderer) {
    const force = localStorage.getItem('pr.myiFx');
    if (force === 'on') return true;
    if (force === 'off') return false;
    return renderer.capabilities.isWebGL2 && (navigator.hardwareConcurrency || 4) >= 4 && !(navigator.deviceMemory && navigator.deviceMemory < 4);
  }

  // 小豬吉祥物:全部用多面體拼的(平面著色有切面感,跟島上其他東西同一個風格)
  // 回傳要做動作的部位:body 呼吸、upper(頭和手)跟著起伏、head 轉頭、eyes 眨眼
  function myiPig(flat, mat, dark) {
    const g = new THREE.Group(), upper = new THREE.Group(), head = new THREE.Group();
    const PINK = '#F6A3B8', DEEP = '#F08CA6', LIGHT = '#FCD5DE';
    const put = (parent, geo, material, x, y, z) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const ico = (r) => new THREE.IcosahedronGeometry(r, 2);
    [[-0.38, 0.3], [0.38, 0.3], [-0.38, -0.3], [0.38, -0.3]].forEach(([x, z]) => put(g, new THREE.CylinderGeometry(0.16, 0.18, 0.32, 10), flat(DEEP), x, 0.16, z));
    const body = put(g, ico(0.85), flat(PINK), 0, 0.95, 0);
    body.scale.set(0.96, 0.88, 0.92);
    put(body, ico(0.6), flat(LIGHT), 0, -0.1, 0.48).scale.set(1, 0.95, 0.5);   // 肚子
    put(g, new THREE.TorusGeometry(0.12, 0.035, 6, 14, Math.PI * 1.6), flat(DEEP), 0, 1.0, -0.82);   // 捲尾巴
    g.add(upper);
    [-1, 1].forEach(k => put(upper, ico(0.17), flat(PINK), k * 0.42, 1.12, 0.68));   // 兩隻手抱在胸前
    const love = put(upper, myiHeartGeo(0.3, 0.16, true), new THREE.MeshStandardMaterial({ color: myiLin('#FF8DB0'), emissive: myiLin('#FF5A8C'), emissiveIntensity: dark ? 1.2 : 1.0, roughness: 0.3 }), 0, 1.22, 0.86);
    love.castShadow = false;
    const halo = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,190,215,.9)'); gr.addColorStop(0.4, 'rgba(255,170,205,.35)'); gr.addColorStop(1, 'rgba(255,170,205,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: dark ? 0.95 : 0.7 }));
      sp.scale.set(2.4, 2.4, 1); sp.position.set(0, 1.22, 1.0); return sp;
    })();
    upper.add(halo);
    head.position.y = 2.02;
    head.scale.setScalar(1.2);   // 頭大身體小,Q 版比例比較可愛
    upper.add(head);
    const skull = put(head, ico(0.66), flat(PINK), 0, 0, 0);
    skull.scale.set(1, 0.92, 0.95);
    const snout = put(head, new THREE.CylinderGeometry(0.24, 0.26, 0.2, 16), flat(DEEP), 0, -0.1, 0.62);
    snout.rotation.x = Math.PI / 2;
    const dot = mat(myiLin('#7A3A4A'), { roughness: 0.6 });
    [-1, 1].forEach(k => put(head, new THREE.SphereGeometry(0.045, 8, 6), dot, k * 0.08, -0.1, 0.73));   // 鼻孔
    const eyes = [-1, 1].map(k => {
      const e = put(head, new THREE.SphereGeometry(0.085, 12, 10), mat(myiLin('#241C22'), { roughness: 0.25 }), k * 0.24, 0.1, 0.56);
      put(e, new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.03, 0.035, 0.07);   // 眼睛的反光點
      return e;
    });
    [-1, 1].forEach(k => put(head, new THREE.SphereGeometry(0.11, 10, 8), flat('#FF8EA6', { emissive: '#FF6E8E', emissiveIntensity: 0.15 }), k * 0.42, -0.12, 0.46).scale.set(1, 0.6, 0.4));   // 腮紅
    [-1, 1].forEach(k => { const ear = put(head, new THREE.ConeGeometry(0.2, 0.32, 5), flat(DEEP), k * 0.38, 0.5, 0.05); ear.rotation.set(-0.2, 0, -k * 0.5); });
    put(head, new THREE.BoxGeometry(0.34, 0.05, 0.08), dot, 0, 0.6, -0.05);   // 撲滿的投幣口
    const coin = put(head, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), mat(myiLin('#FFD447'), { metalness: 0.4, roughness: 0.3, emissive: myiLin('#C08A00'), emissiveIntensity: 0.6 }), 0, 1.0, -0.05);
    coin.rotation.x = Math.PI / 2;
    g.scale.setScalar(1.15);
    return { g, body, upper, head, eyes, coin };
  }

  function myiBuild(canvas, D) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const hq = myiHighQuality(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hq ? 2 : 1.5));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 材質直接做 ACES 色調(畫進後製的暫存畫面時也一樣)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
    MYI.s = { renderer, camera, scene: null, tiles: [], links: [], spin: [], flows: [], raf: 0, prev: 0, t: 0, lastTouch: 0, hq, post: hq ? myiPostInit(renderer) : null,
      perf: { n: 0, sum: 0 }, ring: null,
      cam: { theta: Math.PI / 2, phi: 0.6, dist: 28 }, target: new THREE.Vector3(), want: { x: 0, z: 0, dist: 24 }, zoom: 1, ext: 1 };
    myiBindControls(canvas);
    myiFill(D);
  }

  // 把場景內容(島、看板、協作線)依目前資料重做一次
  function myiFill(D) {
    const s = MYI.s;
    if (s.scene && s.scene.background && s.scene.background.dispose) s.scene.background.dispose();
    if (s.scene) s.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    const scene = new THREE.Scene();
    const dark = document.documentElement.dataset.theme === 'dark';
    const P = dark ? MYI_PAL.night : MYI_PAL.day;
    s.renderer.toneMappingExposure = P.exposure;
    scene.background = myiSkyTex(P);
    const sun = new THREE.DirectionalLight(myiLin(P.sun), P.sunI);
    sun.position.set(9, 22, 13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(s.hq ? 2048 : 1024, s.hq ? 2048 : 1024);
    sun.shadow.bias = -0.0004;
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
    scene.add(new THREE.HemisphereLight(myiLin(P.hemiSky), myiLin(P.hemiGround), P.hemiI), sun);
    const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9 }, extra || {}));
    const flat = (color, extra) => {   // 道具:粉彩化、平面著色(低多邊形的面感)
      extra = Object.assign({}, extra || {});
      if (typeof extra.emissive === 'string') extra.emissive = myiLin(extra.emissive);
      return mat(myiPastel(color, dark), Object.assign({ flatShading: true, roughness: 0.82 }, extra));
    };
    // 海:中間一池水,往外淡出到背景的漸層(像漂在粉彩色的空間裡,沒有地平線)
    const fade = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff'); gr.addColorStop(0.85, '#555'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(cv);
    })();
    const sea = new THREE.Mesh(new THREE.CircleGeometry(19, 64), mat(myiLin(P.sea), { roughness: 0.5, metalness: 0.05, transparent: true, alphaMap: fade, depthWrite: false }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.95; sea.receiveShadow = true;
    scene.add(sea);

    // 整塊愛心島:淺水 → 沙灘 → 草地(地面貼圖畫上三區色塊)
    const flatShape = (sh, y, color, opacity) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 48), mat(myiLin(color), { transparent: opacity < 1, opacity, roughness: 0.5 }));
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m); return m;
    };
    flatShape(myiIslandShape(1.28), -0.92, P.shallow, 0.35);
    flatShape(myiIslandShape(1.16), -0.89, P.shallow, 0.5);
    const slab = (sh, depth, bevel, size, top, mats) => {
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: size, bevelSegments: 4, curveSegments: 36 });
      const m = new THREE.Mesh(geo, mats);
      m.rotation.x = -Math.PI / 2; m.position.y = top - depth - bevel; m.receiveShadow = true; m.castShadow = true;
      scene.add(m); return m;
    };
    slab(myiIslandShape(1.06), 1.0, 0.14, 0.45, 0.24, mat(myiLin(P.sand), { roughness: 1 }));
    const spin = [], tiles = [], all = myiAllTiles();
    slab(myiIslandShape(0.985), 0.3, 0.08, 0.2, 0.34, [mat(0xffffff, { map: myiTerrainTex(all, P, s.hq ? 1024 : 512), roughness: 0.95 }), mat(myiLin(P.earth), { roughness: 1 })]);

    // 格子長到心形外面時,全景要拉遠一點才放得下
    s.ext = Math.max(1, ...all.map(t => { const p = myiPos(t); return Math.max(Math.abs(p.x) + MYI_R, Math.abs(p.z) + MYI_R) / 8.1; }));
    all.forEach(t => {
      const p = myiPos(t), live = myiLive(t, D), zone = MYI_ZONES[t.zone];
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      g.userData.tile = t;
      scene.add(g);
      // 點擊用的隱形圓盤(看不到,但點得到)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(MYI_R * 0.9, MYI_R * 0.9, 0.3, 6), mat(0xffffff));
      base.position.y = 0.3; base.visible = false;
      g.add(base);
      if (!myiInHeart(p.x, p.z)) {   // 大島放不下:自己一座圓圓的小離島
        const isl = new THREE.Group();
        isl.position.set(p.x, 0, p.z);
        const sand = new THREE.Mesh(new THREE.CylinderGeometry(MYI_R * 1.12, MYI_R * 1.22, 1.2, 28), mat(myiLin(P.sand), { roughness: 1 }));
        sand.position.y = -0.36;
        const grass = new THREE.Mesh(new THREE.CylinderGeometry(MYI_R * 0.92, MYI_R * 0.98, 0.16, 28), mat(myiLin(P[t.zone]), { roughness: 0.95 }));
        grass.position.y = 0.26;
        const ring = new THREE.Mesh(new THREE.CircleGeometry(MYI_R * 1.6, 32), mat(myiLin(P.shallow), { transparent: true, opacity: 0.6, roughness: 0.5 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = -0.9;
        [sand, grass].forEach(m => { m.receiveShadow = true; m.castShadow = true; });
        isl.add(sand, grass, ring);
        scene.add(isl);
      }
      const T = 0.34;
      const add = (geo, color, x, y, z, extra) => { const m = new THREE.Mesh(geo, flat(color, extra)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
      const box = (w, h, d, color, x = 0, z = 0, y = T) => add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);
      const cyl = (r, h, color, x = 0, z = 0, y = T, seg = 12) => add(new THREE.CylinderGeometry(r, r, h, seg), color, x, y + h / 2, z);
      const roof = (w, h, color, x, z, y) => { const m = add(new THREE.ConeGeometry(w, h, 4), color, x, y + h / 2, z); m.rotation.y = Math.PI / 4; return m; };
      const coin = (x, z, y) => add(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12), '#FFD447', x, y, z, { metalness: 0.35, roughness: 0.3, emissive: '#B07800', emissiveIntensity: 0.35 });
      const grow = live.grow;
      if (t.kind === 'app') {
        [0.35, 0.55, 0.8, 1.15].forEach((h, i) => box(0.28, h, 0.28, i === 3 ? '#E0465C' : '#F08A8A', -0.75 + i * 0.4, 0.15));
        box(0.9, 0.06, 0.55, '#3A4A5A', 0.55, -0.7, T + 0.02).rotation.y = 0.3;
        for (let k = 0; k < 4; k++) coin(-0.2, -0.75, T + 0.04 + k * 0.07);
      } else if (t.kind === 'castle') {
        [[0, -0.75, 1.6, 0.2], [0, 0.75, 1.6, 0.2], [-0.75, 0, 0.2, 1.5], [0.75, 0, 0.2, 1.5]].forEach(([x, z, w, d]) => box(w, 0.45, d, '#9C8D78', x, z));
        box(0.5, 0.9, 0.5, '#8A7A64', 0, 0);
        roof(0.5, 0.4, '#5A3A2A', 0, 0, T + 0.9);
        cyl(0.18, 0.18, '#B8B0A0', 0.42, 0.38);
        const fig = add(new THREE.IcosahedronGeometry(0.17, 0), '#E9B949', 0.42, T + 0.38, 0.38, { metalness: 0.4, roughness: 0.35 });
        spin.push({ m: fig, axis: 'y', speed: 0.8 });
        [[-0.75, -0.75, '#C8473A'], [0.75, -0.75, '#3A7A4A']].forEach(([x, z, c]) => {
          cyl(0.03, 1.1, '#5A4A3A', x, z);
          const f = add(new THREE.BoxGeometry(0.4, 0.26, 0.02), c, x + 0.21, T + 0.95, z);
          spin.push({ m: f, wave: true, base: f.rotation.y });
        });
      } else if (t.kind === 'learn') {
        ['#4F8FD8', '#E8A23A', '#58B368'].forEach((c, i) => { const b = box(0.9 - i * 0.1, 0.18, 0.6, c, -0.2, 0, T + i * 0.18); b.rotation.y = i * 0.25; });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 8, 36), new THREE.MeshBasicMaterial({ color: '#7FD8FF', transparent: true, opacity: 0.85 }));
        ring.rotation.x = Math.PI / 2; ring.position.set(-0.2, T + 1.0, 0); g.add(ring);
        spin.push({ m: ring, axis: 'z', speed: 1.1 });
        cyl(0.12, 1.1, '#F4F1EA', 0.8, -0.5);
        add(new THREE.SphereGeometry(0.14, 10, 8), '#FFE27A', 0.8, T + 1.2, -0.5, { emissive: '#FFC93C', emissiveIntensity: 0.8 });
      } else if (t.kind === 'ai') {
        box(1.3, 0.08, 0.7, '#8A6A4A', 0, 0.2, T + 0.5);
        [[-0.5, -0.05], [0.5, -0.05], [-0.5, 0.45], [0.5, 0.45]].forEach(([x, z]) => box(0.06, 0.5, 0.06, '#6A4A3A', x, z));
        box(0.8, 0.5, 0.06, '#2A3440', 0, -0.05, T + 0.58);
        add(new THREE.BoxGeometry(0.7, 0.4, 0.02), '#9F8CF0', 0, T + 0.83, -0.01, { emissive: '#7A62E8', emissiveIntensity: 0.7 });
        const bub = add(new THREE.SphereGeometry(0.3, 12, 10), '#FFFFFF', 0.55, T + 1.6, 0);
        bub.scale.set(1.3, 0.85, 0.5);
        spin.push({ m: bub, axis: 'y', speed: 0.6, bob: T + 1.6 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#B9A8FF', transparent: true, opacity: 0.8 }));
        ring.position.set(-0.5, T + 1.3, 0); g.add(ring);
        spin.push({ m: ring, axis: 'y', speed: 1.3 });
      } else if (t.kind === 'piggy') {
        const pig = add(new THREE.SphereGeometry(0.55, 14, 10), '#F4A6B8', 0, T + 0.55, 0);
        pig.scale.set(1.25, 0.95, 0.95);
        add(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 12), '#E98AA2', 0.7, T + 0.55, 0).rotation.z = Math.PI / 2;
        [[-0.25, 0.3], [0.25, 0.3]].forEach(([x, z]) => add(new THREE.ConeGeometry(0.13, 0.25, 4), '#E98AA2', x * 0.6 + 0.35, T + 1.02, z * 0.8));
        [[-0.4, -0.3], [-0.4, 0.3], [0.35, -0.3], [0.35, 0.3]].forEach(([x, z]) => cyl(0.09, 0.2, '#E98AA2', x, z, T, 8));
        box(0.3, 0.03, 0.06, '#7A3A4A', 0, 0, T + 1.06);
        const c = coin(0, 0, T + 1.6);
        c.rotation.x = Math.PI / 2;
        spin.push({ m: c, rise: true, phase: 0, low: T + 1.9, top: T + 1.1, r: 0, a: 0 });
      } else if (t.kind === 'home') {
        box(1.1, 0.7, 0.9, '#F7EDE4', 0, -0.1);
        roof(0.95, 0.6, '#C8566E', 0, -0.1, T + 0.7);
        box(0.22, 0.4, 0.04, '#7A4A3A', 0, 0.36);
        box(0.16, 0.4, 0.16, '#8A6A5A', 0.3, -0.3, T + 0.85);
        const h = add(myiHeartGeo(0.32, 0.14), '#E5486A', 0, T + 2.0, 0, { emissive: '#B0203A', emissiveIntensity: 0.35 });
        h.rotation.x = 0; spin.push({ m: h, axis: 'y', speed: 1.2, bob: T + 2.0 });
        if (typeof explorePerson === 'function') [[-0.8, 0.55, '#E0A82E'], [0.8, 0.55, '#4F7FC8']].forEach(([x, z, c]) => { const m = explorePerson(c); m.position.set(x, T, z); g.add(m); });
      } else if (t.kind === 'room') {
        const floors = 1 + Math.round(grow * 4);
        for (let f = 0; f < floors; f++) box(0.85, 0.32, 0.75, f % 2 ? '#F4EFE6' : '#ECE3D3', -0.25, -0.1, T + f * 0.32);
        roof(0.72, 0.45, t.roof, -0.25, -0.1, T + floors * 0.32);
        const pile = Math.max(1, Math.round(grow * 10));
        for (let k = 0; k < pile; k++) coin(0.75 + (k % 2) * 0.05, 0.45, T + 0.04 + k * 0.065);
        if (typeof explorePerson === 'function') { const m = explorePerson(t.roof, true); m.position.set(0.55, T, -0.55); g.add(m); }
      } else if (t.kind === 'vault') {
        box(0.8, 0.45, 0.55, '#9A6A3A', -0.2, 0);
        const lid = box(0.82, 0.12, 0.57, '#B07A40', -0.2, 0, T + 0.45);
        lid.rotation.x = -0.25;
        box(0.12, 0.14, 0.04, '#FFD447', -0.2, 0.29, T + 0.25);
        const stacks = 1 + Math.round(grow * 5);
        for (let i = 0; i < stacks; i++) for (let k = 0; k < 2 + (i % 3); k++) coin(0.55 + (i % 3) * 0.32 - 0.3, -0.5 + Math.floor(i / 3) * 0.5 + 0.25, T + 0.04 + k * 0.065);
      } else if (t.kind === 'tower') {
        const floors = 2 + Math.round(grow * 7);
        for (let f = 0; f < floors; f++) box(0.7, 0.24, 0.7, f % 2 ? '#DCE6EE' : '#C4D4E0', 0, 0, T + f * 0.24);
        const topY = T + floors * 0.24;
        cyl(0.03, 0.6, '#5A4A3A', 0, 0, topY, 6);
        add(new THREE.BoxGeometry(0.35, 0.22, 0.02), '#E0465C', 0.18, topY + 0.48, 0);
        // 還沒蓋到的部分:鷹架虛框
        const left = 9 - floors;
        if (left > 0) {
          const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.72, left * 0.24, 0.72), new THREE.MeshBasicMaterial({ color: '#3E93C2', wireframe: true, transparent: true, opacity: 0.35 }));
          ghost.position.set(0, topY + left * 0.12, 0); g.add(ghost);
        }
        [[-0.75, 0.6], [0.75, -0.6]].forEach(([x, z]) => box(0.2, 0.9, 0.2, '#F2B33D', x, z));
      } else if (t.kind === 'fountain') {
        cyl(0.85, 0.22, '#C9C2B6', 0, 0, T, 16);
        add(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 16), '#6FC1E0', 0, T + 0.2, 0, { emissive: '#2A88B0', emissiveIntensity: 0.25 });
        cyl(0.12, 0.6 + grow * 0.6, '#D8D2C6', 0, 0, T, 8);
        const n = 2 + Math.round(grow * 6);
        for (let k = 0; k < n; k++) {
          const c = coin(0, 0, T + 0.6);
          spin.push({ m: c, rise: true, phase: k / n, top: T + 1.4 + grow * 0.8, low: T + 0.6, r: 0.25 + (k % 3) * 0.12, a: k * 2.4 });
        }
      } else if (t.kind === 'tree') {
        const k = 0.45 + grow * 0.75;
        cyl(0.12 * k + 0.05, 0.9 * k, '#8A5A3A', 0, 0, T, 8);
        [[0, 1.05, 0, 0.55], [-0.3, 0.85, 0.15, 0.4], [0.3, 0.9, -0.1, 0.42]].forEach(([x, y, z, r]) => add(new THREE.IcosahedronGeometry(r * k, 0), '#5FA84A', x * k, T + y * k, z * k));
        if (grow >= 1) add(new THREE.SphereGeometry(0.12, 8, 6), '#E5486A', 0.25, T + 1.25 * k, 0.3);
        // 錯題燈籠:一題一盞(最多 12 盞),掛在樹冠外圍輕輕晃;複習答對後重畫就少一盞
        const n = Math.min(12, live.lanterns || 0);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + 0.4, rr = (0.55 + (i % 2) * 0.12) * k + 0.1, y = T + (0.75 + (i % 3) * 0.18) * k;
          const lan = new THREE.Group();
          lan.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
          const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), flat('#5A4A3A'));
          str.position.y = -0.08;
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: '#FF6A3D', emissive: '#FF4A1A', emissiveIntensity: 0.9 }));
          body.scale.set(1, 1.25, 1); body.position.y = -0.24;
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), flat('#C89A3A'));
          cap.position.y = -0.12;
          lan.add(str, cap, body);
          g.add(lan);
          spin.push({ m: lan, sway: true, phase: i * 1.7 });
        }
      } else if (t.kind === 'sign') {
        cyl(0.06, 1.4, '#7A5A3A', 0, 0, T, 8);
        [[1.15, 0.5, '#E8875B'], [0.85, -0.6, '#3E93C2'], [0.55, 0.9, '#D9607E']].forEach(([y, a, c]) => { const b = box(0.85, 0.2, 0.06, c, 0, 0, T + y); b.rotation.y = a; b.position.x = Math.cos(-a) * 0.3; b.position.z = Math.sin(-a) * 0.3; });
        for (let i = 0; i < 4; i++) cyl(0.16, 0.05, '#BDB4A6', -0.5 + i * 0.25, 0.6 + (i % 2) * 0.12, T, 8);
      } else if (t.kind === 'custom') {
        // 自己新增的格子:台座跟著完成比例長高,上面浮著它的圖示,旁邊插一支區域顏色的旗子
        const h = 0.25 + grow * 0.9;
        cyl(0.62, h, '#F4EFE6', 0, 0, T, 6);
        cyl(0.66, 0.06, zone.color, 0, 0, T + h, 6);
        const ico = myiEmoji(t.icon);
        ico.position.set(0, T + h + 0.75, 0);
        g.add(ico);
        spin.push({ m: ico, bobOnly: true, bob: T + h + 0.75 });
        cyl(0.03, 1.2, '#5A4A3A', 0.95, -0.35);
        const flag = add(new THREE.BoxGeometry(0.4, 0.26, 0.02), zone.color, 1.16, T + 1.05, -0.35);
        spin.push({ m: flag, wave: true, base: flag.rotation.y });
        ['#F28AA0', '#FFD447', '#FFFFFF'].forEach((c, k) => add(new THREE.SphereGeometry(0.07, 6, 5), c, -0.9 + k * 0.2, T + 0.06, 0.7 - (k % 2) * 0.15));
      }
      const label = exploreLabel([{ text: `${t.no} ${t.icon} ${myiTileName(t)}`, bold: true, size: 32 }, { text: live.sub, size: 24, color: zone.color }], 440, 110, 3.0);
      label.position.set(0, 3.2, 0);
      label.layers.set(1);   // 看板最後才畫(見 myiRender),平常藏起來,點了才出現
      label.material.depthTest = false;
      label.material.toneMapped = false;
      g.add(label);
      tiles.push({ t, g, label, base, sub: live.sub });
    });

    // 點綴:空地上的小樹林、沿著海岸的小樹和石頭、花 —— 數量多才有精緻感
    const deco = new THREE.Group();
    scene.add(deco);
    const centers = all.map(myiPos);
    const tree = (x, z, k, c) => {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * k, 0.07 * k, 0.3 * k, 6), flat('#9A6A4A'));
      tr.position.set(x, 0.34 + 0.15 * k, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.3 * k, 0.75 * k, 7), flat(c));
      top.position.set(x, 0.34 + 0.62 * k, z);
      [tr, top].forEach(m => { m.castShadow = true; deco.add(m); });
    };
    const bush = (x, z, k, c) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * k, 0), flat(c));
      m.position.set(x, 0.34 + 0.12 * k, z); m.scale.y = 0.8; m.castShadow = true; deco.add(m);
    };
    const greens = ['#6FAF6A', '#7DBA78', '#5E9F6E', '#8CC07A'];
    const rnd = myiRand(42);
    MYI_LOTS.forEach(([lx, lr]) => {
      if (all.some(t => t.x === lx && t.r === lr)) return;   // 已經蓋了自己新增的格子
      const p = myiPos({ x: lx, r: lr });
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + rnd(), d = 0.35 + rnd() * 0.85; tree(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 0.8 + rnd() * 0.6, greens[k % 4]); }
      for (let k = 0; k < 6; k++) bush(p.x + (rnd() - 0.5) * 2, p.z + (rnd() - 0.5) * 2, 0.4, ['#F6A8BC', '#FFE08A', '#FFFFFF', '#C9B8FF'][k % 4]);
    });
    myiIslandShape(0.93).getSpacedPoints(96).forEach((q, i) => {
      const x = q.x, z = -q.y;
      if (centers.some(c => Math.hypot(c.x - x, c.z - z) < 1.25)) return;   // 不要擋到格子上的東西
      const r = rnd();
      if (r < 0.5) tree(x, z, 0.55 + rnd() * 0.5, greens[i % 4]);
      else if (r < 0.8) bush(x, z, 0.7 + rnd() * 0.6, greens[(i + 1) % 4]);
      else { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + rnd() * 0.12, 0), flat('#C9BFB6')); m.position.set(x, 0.38, z); m.castShadow = true; deco.add(m); }
    });

    // 主角:島中間上方的奶油色台座,上面站著小豬吉祥物
    const hp = myiPos({ x: 2, r: 0 });
    const hero = new THREE.Group();
    hero.position.set(hp.x, 0, hp.z - 0.3);
    hero.scale.setScalar(1.45);   // 主角要夠大,全景一眼就看到
    scene.add(hero);
    [[1.15, 1.25, 0.3, 0.34, '#FFF3E6'], [0.85, 0.95, 0.35, 0.64, '#F9E2D6']].forEach(([r1, r2, h, y, c]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 32), mat(myiLin(c), { roughness: 0.6 }));
      m.position.y = y + h / 2; m.castShadow = true; m.receiveShadow = true; hero.add(m);
    });
    // 小豬吉祥物站在台座上,抱著一顆發光的小愛心(會呼吸、眨眼、轉頭,動作在 myiFrame)
    const pig = myiPig(flat, mat, dark);
    pig.g.position.y = 0.99;
    hero.add(pig.g);
    s.pig = pig;
    // 繞著小豬轉的小光點
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + (i % 3) * 0.02, 8, 6), new THREE.MeshBasicMaterial({ color: myiLin(i % 2 ? '#FFF2B0' : '#FFFFFF') }));
      hero.add(m);
      spin.push({ m, orbit: true, r: 1.7 + (i % 4) * 0.25, a: i * 0.9, y: 1.6 + (i % 5) * 0.35, speed: 0.35 + (i % 3) * 0.1 });
    }
    if (typeof explorePerson === 'function') [[-1.15, 0.7, '#E0A82E'], [1.15, 0.7, '#4F7FC8']].forEach(([x, z, c]) => { const m = explorePerson(c); m.position.set(x, 0.34, z); hero.add(m); });

    // 天上飄的雲
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      const n = 3 + (i % 2);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + (k % 2) * 0.35, 1), new THREE.MeshStandardMaterial({ color: myiLin(dark ? '#8C86B8' : '#FFFFFF'), roughness: 1, flatShading: true, transparent: true, opacity: 0.92 }));
        b.position.set((k - n / 2) * 0.85, (k % 2) * 0.3, (k % 3) * 0.2); b.scale.y = 0.7;
        c.add(b);
      }
      scene.add(c);
      spin.push({ m: c, orbit: true, r: 16 + (i % 3) * 4, a: i * 0.9, y: 4 + (i % 3) * 1.2, speed: 0.012 + (i % 2) * 0.006 });
    }

    // 選到的格子:地上一圈會呼吸的光環
    const ring = new THREE.Mesh(new THREE.RingGeometry(MYI_R * 0.92, MYI_R * 1.05, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false;
    scene.add(ring);
    s.ring = ring;

    // 協作線:兩格之間的拱形管子,選到其中一格時變亮,還有光點流動
    const links = myiAllLinks().map(({ a, b, text }) => {
      const A = myiPos(all.find(x => x.id === a)), B = myiPos(all.find(x => x.id === b));
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x, 0.7, A.z), new THREE.Vector3((A.x + B.x) / 2, 2.6, (A.z + B.z) / 2), new THREE.Vector3(B.x, 0.7, B.z));
      const mat = new THREE.MeshBasicMaterial({ color: '#E5486A', transparent: true, opacity: 0.22, depthWrite: false });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 6), mat);
      scene.add(tube);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
      dot.visible = false; scene.add(dot);
      return { a, b, text, curve, mat, dot };
    });
    Object.assign(s, { scene, tiles, links, spin });
    myiHighlight();
  }

  function myiHighlight() {
    const s = MYI.s;
    if (!s) return;
    s.links.forEach(l => {
      const on = MYI.sel && (l.a === MYI.sel || l.b === MYI.sel);
      l.mat.opacity = MYI.sel ? (on ? 0.95 : 0.05) : 0.16;
      l.dot.visible = !!on;
    });
    // 全景不放看板(畫面乾淨);點了一格才出現它的看板,和有協作關係的格子名稱
    const sel = s.tiles.find(x => x.t.id === MYI.sel);
    if (s.ring) {
      s.ring.visible = !!sel;
      if (sel) s.ring.material.color.copy(myiLin(MYI_ZONES[sel.t.zone].color));
    }
    s.tiles.forEach(x => {
      const on = x.t.id === MYI.sel;
      const title = { text: `${x.t.no} ${x.t.icon} ${myiTileName(x.t)}`, bold: true, size: on ? 34 : 38 };
      x.label.draw(on ? [title, { text: x.sub, size: 24, color: MYI_ZONES[x.t.zone].color }] : [title]);
      const k = on ? 3.4 : 3.0;
      x.label.scale.set(k, k * 110 / 440, 1);
      x.label.position.y = on ? 2.6 : 1.5;
      const linked = MYI.sel && s.links.some(l => (l.a === MYI.sel && l.b === x.t.id) || (l.b === MYI.sel && l.a === x.t.id));
      x.label.visible = !!MYI.sel && (on || linked);
      x.label.material.opacity = MYI.sel && !on ? 0.7 : 1;
    });
  }

  function myiVisible() {
    return !!(MYI.s && MYI.view === 'map' && MYI.canvas && MYI.canvas.isConnected && $('#page-explore').classList.contains('active') && document.visibilityState === 'visible');
  }
  function myiStart() {
    const s = MYI.s;
    if (!s || s.raf || !myiVisible()) return;
    s.prev = 0;
    s.raf = requestAnimationFrame(myiFrame);
  }
  function myiFrame(now) {
    const s = MYI.s;
    if (!s) return;
    if (!myiVisible()) { s.raf = 0; return; }
    const dt = Math.min(0.05, (now - (s.prev || now)) / 1000);
    s.prev = now; s.t += dt;
    s.spin.forEach(x => {
      if (x.wave) x.m.rotation.y = x.base + Math.sin(s.t * 3 + x.m.position.x) * 0.25;
      else if (x.sway) { x.m.rotation.z = Math.sin(s.t * 1.6 + x.phase) * 0.18; x.m.rotation.x = Math.cos(s.t * 1.3 + x.phase) * 0.12; }
      else if (x.rise) {
        const p = (s.t * 0.35 + x.phase) % 1;
        x.m.position.set(Math.cos(x.a + p * 3) * x.r, x.low + (x.top - x.low) * p, Math.sin(x.a + p * 3) * x.r);
        x.m.rotation.x = p * 6;
      } else if (x.bobOnly) x.m.position.y = x.bob + Math.sin(s.t * 2 + x.m.parent.position.x) * 0.12;
      else if (x.orbit) {
        const a = x.a + s.t * x.speed;
        x.m.position.set(Math.cos(a) * x.r, x.y + Math.sin(s.t * 0.8 + x.a) * 0.15, Math.sin(a) * x.r);
      }
      else {
        x.m.rotation[x.axis] += dt * x.speed;
        if (x.bob) x.m.position.y = x.bob + Math.sin(s.t * 2) * 0.12;
      }
    });
    // 選到的那一格浮起來,其他輕輕起伏
    // 選到的那一格輕輕跳起來,地上的光環一呼一吸
    s.tiles.forEach((x) => {
      const want = x.t.id === MYI.sel ? 0.12 + Math.abs(Math.sin(s.t * 2.2)) * 0.12 : 0;
      x.g.position.y += (want - x.g.position.y) * Math.min(1, dt * 6);
      if (x.t.id === MYI.sel && s.ring) {
        s.ring.position.set(x.g.position.x, 0.37, x.g.position.z);
        s.ring.material.opacity = 0.55 + Math.sin(s.t * 3) * 0.3;
        const k = 1 + Math.sin(s.t * 3) * 0.04;
        s.ring.scale.set(k, k, 1);
      }
    });
    s.links.forEach(l => { if (l.dot.visible) l.dot.position.copy(l.curve.getPoint((s.t * 0.45) % 1)); });
    // 小豬:肚子一鼓一鼓地呼吸、頭和手跟著起伏;頭慢慢左右看;每 3.6 秒眨一次眼;頭上的金幣轉圈
    if (s.pig) {
      const p = s.pig, br = Math.sin(s.t * 2.2);
      p.body.scale.set(0.96 * (1 + br * 0.02), 0.88 * (1 + br * 0.035), 0.92 * (1 + br * 0.02));
      p.upper.position.y = br * 0.03;
      p.head.rotation.y = Math.sin(s.t * 0.45) * 0.4 + Math.sin(s.t * 1.3) * 0.05;
      p.head.rotation.z = Math.sin(s.t * 0.7) * 0.06;
      const ph = s.t % 3.6, open = ph < 0.18 ? Math.max(0.1, 1 - Math.sin(ph / 0.18 * Math.PI)) : 1;
      p.eyes.forEach(e => { e.scale.y = open; });
      p.coin.rotation.z += dt * 1.6;
      p.coin.position.y = 1.0 + Math.sin(s.t * 1.8) * 0.08;
    }
    // 鏡頭:飛向選中的格子,沒操作時左右輕輕擺動
    s.target.x += (s.want.x - s.target.x) * Math.min(1, dt * 2.5);
    s.target.z += (s.want.z - s.target.z) * Math.min(1, dt * 2.5);
    const wantDist = (MYI.sel ? s.want.dist : Math.max(29, 31.5 / s.camera.aspect) * s.ext) * s.zoom;   // 畫面窄就拉遠,整顆心放得下;再乘上兩指/滾輪的縮放
    s.cam.phi += ((MYI.sel ? 1.05 : 0.98) - s.cam.phi) * Math.min(1, dt * 2.5);   // 全景斜斜往下看,看得到島的厚度和上面的漸層天空;選一格時再壓低一點
    s.cam.dist += (wantDist - s.cam.dist) * Math.min(1, dt * 2.5);
    const sway = now - s.lastTouch > 3000 ? Math.sin(s.t * 0.25) * 0.1 : 0;
    const theta = s.cam.theta + sway;
    s.camera.position.set(s.target.x + Math.cos(theta) * Math.sin(s.cam.phi) * s.cam.dist, Math.cos(s.cam.phi) * s.cam.dist + 1, s.target.z + Math.sin(theta) * Math.sin(s.cam.phi) * s.cam.dist);
    s.camera.lookAt(s.target.x, MYI.sel ? 1.2 : 0, s.target.z);
    myiRender(s);
    // 開了後製卻跑不動(前 90 格平均超過 34ms):自動關掉後製、降解析度
    const raw = now - (s.perf.last || now);
    s.perf.last = now;
    if (s.post && raw > 0 && raw < 250 && s.perf.n < 90) {
      s.perf.n++; s.perf.sum += raw;
      if (s.perf.n === 90 && s.perf.sum / 90 > 34) { s.post = null; s.renderer.setPixelRatio(1); myiResize(); }
    }
    s.raf = requestAnimationFrame(myiFrame);
  }
  function myiResize() {
    const s = MYI.s;
    if (!s || !MYI.canvas) return;
    const w = MYI.canvas.clientWidth || 320, h = MYI.canvas.clientHeight || 300;
    s.renderer.setSize(w, h, false);
    if (s.post) { const v = s.renderer.getDrawingBufferSize(new THREE.Vector2()); myiPostSize(s.post, v.x, v.y); }
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }
  // 縮放倍數(1 = 原本的距離,越小越近)
  function myiZoom(f) {
    const s = MYI.s;
    if (!s) return;
    s.zoom = Math.max(0.35, Math.min(2.2, s.zoom * f));
    s.lastTouch = performance.now();
  }
  // 平移:手指往哪拖,島就往哪動(依目前鏡頭方向換算成地面上的方向)
  function myiPan(dx, dy) {
    const s = MYI.s;
    if (!s) return;
    const k = s.cam.dist * 0.0022, c = Math.cos(s.cam.theta), n = Math.sin(s.cam.theta);
    const lim = 10 * s.ext;
    s.want.x = Math.max(-lim, Math.min(lim, s.want.x - n * dx * k - c * dy * k));
    s.want.z = Math.max(-lim, Math.min(lim, s.want.z + c * dx * k - n * dy * k));
    s.lastTouch = performance.now();
  }
  // 回全景:取消選取、縮放歸零、鏡頭回到中間
  function myiHome() {
    const s = MYI.s;
    MYI.sel = null;
    if (s) { s.zoom = 1; s.want = { x: 0, z: 0, dist: 28 }; s.lastTouch = 0; }
    myiHighlight();
    myiRenderDetail();
  }
  // 單指左右拖曳旋轉(上下滑仍可捲動頁面);兩指捏合縮放、拖曳平移;滾輪縮放
  // 點格子 = 選它,點海 = 回全景
  function myiBindControls(canvas) {
    let p = null, pinch = null;
    const pts = new Map();
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && MYI.s) { const q = two(); pinch = { d0: q.d, z0: MYI.s.zoom, mx: q.mx, my: q.my }; p = null; }
      else if (pts.size === 1) p = { x: e.clientX, sx: e.clientX, sy: e.clientY, drag: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!MYI.s) return;
      if (pinch && pts.size >= 2) {
        const q = two();
        MYI.s.zoom = Math.max(0.35, Math.min(2.2, pinch.z0 * pinch.d0 / q.d));
        myiPan(q.mx - pinch.mx, q.my - pinch.my);
        pinch.mx = q.mx; pinch.my = q.my;
        return;
      }
      if (!p) return;
      if (!p.drag && Math.abs(e.clientX - p.sx) > 8 && Math.abs(e.clientX - p.sx) > Math.abs(e.clientY - p.sy)) p.drag = true;
      if (p.drag) { MYI.s.cam.theta += (e.clientX - p.x) * 0.008; MYI.s.lastTouch = performance.now(); }
      p.x = e.clientX;
    });
    const lift = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); myiZoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });   // 兩指時不要捲動頁面
    canvas.addEventListener('pointerup', (e) => {
      const s = MYI.s, wasPinch = !!pinch || pts.size > 1;
      lift(e);
      if (wasPinch) { p = null; return; }
      if (p && s && Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) < 8) {
        const r = canvas.getBoundingClientRect();
        v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        ray.setFromCamera(v2, s.camera);
        const hit = ray.intersectObjects(s.tiles.map(x => x.g), true).find(h => h.object.type === 'Mesh');
        let o = hit && hit.object;
        while (o && !o.userData.tile) o = o.parent;
        myiSelect(o ? o.userData.tile.id : null);
      }
      p = null;
    });
    canvas.addEventListener('pointercancel', (e) => { lift(e); p = null; });
  }

  // ---------- 面板 ----------
  function myiSelect(id) {
    MYI.sel = id && MYI.sel === id ? null : id;   // 再點一次同一格 = 回全景
    const s = MYI.s, t = myiTile(MYI.sel);
    if (!t) MYI.sel = null;
    if (MYI.form !== 'tile' || t) MYI.form = null;   // 換格子就收起表單
    if (s) {
      if (t) { const p = myiPos(t); s.want = { x: p.x, z: p.z, dist: 12 }; } else s.want = { x: 0, z: 0, dist: 28 };
      s.zoom = 1;
      s.lastTouch = 0;
    }
    myiHighlight();
    myiRenderDetail();
  }

  function myiDetailHtml(t, D) {
    const zone = MYI_ZONES[t.zone], live = myiLive(t, D), all = myiAllTiles();
    const links = myiAllLinks().filter(l => l.a === t.id || l.b === t.id);
    const others = all.filter(o => o.id !== t.id && !links.some(l => l.a === o.id || l.b === o.id));
    const top = `<div class="myi-top"><button type="button" class="btn ghost small" data-myi-home>← 回全景</button>
      ${t.custom ? `<span><button type="button" class="btn ghost small" data-myi-edit>✏️ 編輯</button> <button type="button" class="btn ghost small" data-myi-deltile>🗑 刪除這一格</button></span>` : ''}</div>`;
    if (t.custom && MYI.form === 'edit') return `<div class="myi-sheet" style="--zone:${zone.color}">${top}${myiTileFormHtml(t)}</div>`;
    return `<div class="myi-sheet" style="--zone:${zone.color}">
      ${top}
      <div class="myi-kicker">TILE ${t.no}・${zone.name}</div>
      <div class="myi-title">${escapeHtml(t.icon)} ${escapeHtml(myiTileName(t))}</div>
      ${t.quote ? `<div class="myi-quote">「${escapeHtml(t.quote)}」</div>` : ''}
      <div class="myi-chips">${(t.tags || []).map(x => `<span class="myi-chip">${escapeHtml(x)}</span>`).join('')}<span class="myi-chip">${links.length} 條協作</span></div>
      ${live.html ? `<div class="myi-live">${live.html}</div>` : ''}
      ${myiItemsHtml(t)}
      <div class="myi-sub">協作關係 <span class="muted small" style="font-weight:400;">・粉紅色的線,點名字可以跳過去</span></div>
      <div class="myi-links">${links.map(l => {
        const o = all.find(x => x.id === (l.a === t.id ? l.b : l.a));
        return `<div class="myi-link-row"><button type="button" class="myi-link" data-myi="${o.id}"><b>${escapeHtml(o.icon)} ${escapeHtml(myiTileName(o))}</b><span class="muted small">${escapeHtml(l.text)}</span></button>
          <button type="button" class="myi-del" data-unlink="${escapeHtml(l.key)}" aria-label="拿掉這條協作線">✕</button></div>`;
      }).join('')}${links.length ? '' : '<div class="muted small">還沒有協作線。</div>'}</div>
      ${others.length ? `<form class="myi-add myi-link-add"><select aria-label="連到哪一格">${others.map(o => `<option value="${o.id}">${o.no} ${escapeHtml(o.icon)} ${escapeHtml(myiTileName(o))}</option>`).join('')}</select>
        <input type="text" maxlength="40" placeholder="怎麼互相支援(可不填)" aria-label="協作說明"><button type="submit" class="btn small">＋ 連線</button></form>` : ''}
    </div>`;
  }

  function myiRenderDetail() {
    const box = $('#myi-detail');
    if (!box) return;
    const D = myiData(), t = myiTile(MYI.sel), n = myiAllTiles().length;
    box.innerHTML = t ? myiDetailHtml(t, D) : MYI.form === 'tile' ? `<div class="myi-sheet">${myiTileFormHtml(null)}</div>` : `<div class="myi-sheet">
      <div class="myi-kicker">HELLO / 我的島</div>
      <div class="myi-title">每一格,都是你的一部分</div>
      <div class="muted small" style="margin:6px 0 10px;">${n} 格拼成一座愛心島,地上的色塊就是一格。點一格(或下面的清單)看細項和名字,粉紅色的線是格子之間的協作關係;家和未來區用的是 APP 裡的真實記錄,會跟著長大。兩指或滾輪可以縮放,右上角 ⌂ 回全景。</div>
      <div class="myi-zones">${Object.values(MYI_ZONES).map(z => `<div class="myi-zone" style="--zone:${z.color}"><b>${z.name}</b><span class="muted small">${z.desc}</span></div>`).join('')}</div>
      <div class="myi-acts"><button type="button" class="btn small" data-myi-newtile>＋ 新增一格<span class="muted small">新作品、新目標都可以,先填空地再往外長</span></button></div>
    </div>`;
    box.querySelectorAll('[data-myi]').forEach(b => { b.onclick = () => { MYI.sel = null; myiSelect(b.dataset.myi); }; });
    const on = (sel, fn) => { const b = box.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-myi-home]', myiHome);
    on('[data-myi-newtile]', () => { MYI.form = 'tile'; myiRenderDetail(); });
    if (MYI.form) myiBindTileForm(box, MYI.form === 'edit' ? t : null);
    if (t) {
      on('[data-myi-edit]', () => { MYI.form = 'edit'; myiRenderDetail(); });
      on('[data-myi-deltile]', () => myiDeleteTile(t));
      box.querySelectorAll('[data-unlink]').forEach(b => { b.onclick = () => myiDeleteLink(b.dataset.unlink); });
      const lf = box.querySelector('.myi-link-add');
      if (lf) lf.onsubmit = (e) => { e.preventDefault(); myiAddLink(t, lf.querySelector('select').value, lf.querySelector('input').value); };
    }
    if (t && myiEditable(t)) {
      box.querySelectorAll('[data-chk]').forEach(b => { b.onclick = () => myiToggle(t, b.dataset.chk); });
      box.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => myiDelete(t, b.dataset.del); });
      const f = box.querySelector('.myi-add:not(.myi-link-add)');
      if (f) f.onsubmit = (e) => { e.preventDefault(); myiAdd(t, f.querySelector('input').value); };
    }
    // 學習之樹:直接開下一堂課,或打開錯題本(只看答錯的)
    box.querySelectorAll('[data-myi-go]').forEach(b => {
      b.onclick = () => {
        const L = myiLessons();
        if (b.dataset.myiGo === 'lesson' && L.next) {
          exploreSelect(L.next.isle);
          EXPLORE.lesson = L.next.id;
          renderExplorePanel();
        } else if (b.dataset.myiGo === 'review') {
          EXPLORE.reviewWrong = true;
          exploreSelect('review');
        }
        $('#explore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }

  function myiRenderList(box, D) {
    box.innerHTML = Object.entries(MYI_ZONES).map(([k, z]) => `<div class="myi-sub" style="color:${z.color}">${z.name}・${z.desc}</div>
      <div class="ex-list">${myiAllTiles().filter(t => t.zone === k).map(t => `<button type="button" class="ex-item" data-myi="${t.id}">
        <span class="ex-ico">${escapeHtml(t.icon)}</span><span><b>${t.no} ${escapeHtml(myiTileName(t))}</b><br><span class="muted small">${escapeHtml(myiLive(t, D).sub)}</span></span></button>`).join('')}</div>`).join('')
      + '<div class="myi-acts"><button type="button" class="btn small" data-myi-newtile>＋ 新增一格<span class="muted small">會切回全景,填好就蓋到島上</span></button></div>';
    const b = box.querySelector('[data-myi-newtile]');
    b.onclick = () => { MYI.view = 'map'; MYI.sel = null; MYI.form = 'tile'; renderExplorePanel(); };
  }

  function myiRenderTime(box, D) {
    const today = autodivYmd(new Date());
    const ev = myiTimeline(D);
    box.innerHTML = `<div class="myi-time">${ev.map(e => {
      const t = myiTile(e.tile) || MYI_TILES[0];
      return `<button type="button" class="myi-ev${e.d > today ? ' soon' : ''}" data-myi="${t.id}" style="--zone:${MYI_ZONES[t.zone].color}">
        <span class="myi-ev-d">${escapeHtml(e.d.slice(0, 4))}<br><b>${escapeHtml(e.d.slice(5).replace('-', '/'))}</b></span>
        <span class="myi-ev-t">${escapeHtml(e.t)}${e.money ? ' ' + myiW(e.money) : ''}${e.d > today ? ' <span class="ex-soon">即將</span>' : ''}<br><span class="muted small">${escapeHtml(t.icon)} ${escapeHtml(myiTileName(t))}</span></span>
      </button>`;
    }).join('')}</div>`;
  }

  // 探索頁面板裡「我的島」的內容
  function myIslandHtml() {
    const tab = (v, label) => `<button type="button" class="chip${MYI.view === v ? ' active' : ''}" data-myi-view="${v}">${label}</button>`;
    return `<div class="myi">
      <div class="myi-tabs">${tab('map', '🗺️ 全景')}${tab('list', '☰ 清單')}${tab('time', '◷ 時間')}</div>
      <div class="myi-stage${MYI.view === 'map' && !MYI.failed ? '' : ' hidden'}" id="myi-stage">
        <div class="myi-ctrl"><button type="button" data-myi-z="in" aria-label="放大">＋</button><button type="button" data-myi-z="out" aria-label="縮小">－</button><button type="button" data-myi-z="home" aria-label="回全景">⌂</button></div>
        <div class="explore-hint small">點一格看看・左右滑動旋轉・兩指縮放</div></div>
      <div id="myi-detail" class="${MYI.view === 'map' ? '' : 'hidden'}"></div>
      <div id="myi-body"></div>
    </div>`;
  }

  async function myIslandMount() {
    const root = $('.myi');
    if (!root) return;
    root.querySelectorAll('[data-myi-view]').forEach(b => { b.onclick = () => { MYI.view = b.dataset.myiView; renderExplorePanel(); }; });
    root.querySelectorAll('[data-myi-z]').forEach(b => {
      b.onclick = () => { const z = b.dataset.myiZ; if (z === 'home') myiHome(); else myiZoom(z === 'in' ? 0.75 : 1 / 0.75); };
    });
    const D = myiData();
    const body = $('#myi-body');
    if (MYI.view === 'list') myiRenderList(body, D);
    else if (MYI.view === 'time') myiRenderTime(body, D);
    body.querySelectorAll('[data-myi]').forEach(b => { b.onclick = () => { MYI.view = 'map'; MYI.sel = null; renderExplorePanel(); myiSelect(b.dataset.myi); }; });
    if (MYI.view !== 'map') return;
    myiRenderDetail();
    if (MYI.failed) return;
    try {
      await town3dLoadThree();
      const stage = $('#myi-stage');
      if (!stage) return;
      if (!MYI.canvas) { MYI.canvas = document.createElement('canvas'); MYI.canvas.id = 'myi-canvas'; }
      stage.prepend(MYI.canvas);
      if (!MYI.s) myiBuild(MYI.canvas, D); else myiFill(D);   // 每次進來都用最新資料重畫
      const keep = MYI.sel;   // 重新套用目前選的格子(myiSelect 對同一格會切回全景,所以先清掉)
      MYI.sel = null;
      myiSelect(keep);
      myiResize();
      myiStart();
    } catch (e) {
      MYI.failed = true;   // 不支援 3D:只留清單和細節
      const st = $('#myi-stage');
      if (st) st.classList.add('hidden');
    }
  }

  window.addEventListener('resize', myiResize);
  setInterval(() => { if (MYI.s && !MYI.s.raf && myiVisible()) myiStart(); }, 800);
