/* 我的島 — 參考「HEART 政策島」的玩法做的個人版:16 塊等大六邊形拼成一顆心。
 * 作品區 = 做過、正在做的東西;家區 = 黃與蘇的真實記錄;未來區 = 跟著資料長大的目標。
 * 點一格:鏡頭飛過去、下方顯示細項與協作關係;看法可切 全景/清單/時間。
 * 金額只放在下方文字(隱私模式會模糊),3D 看板上不放金額。
 * 在探索頁的「我的島」顯示;three.js 共用 town3d.js 的載入。所有檔案共用全域範圍,載入順序見 index.html */

  const MYI = { s: null, sel: null, view: 'map', failed: false, canvas: null };
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
      tags: ['策略', '養成', '抽卡'],
      items: [
        { t: '水墨剪影戰鬥原型:趙雲、關羽、諸葛亮', when: '10/17' },
        { t: 'Blender 算圖、卡通描邊的角色', when: '10 月' },
        { t: '群雄 12 位武將、五星公仔', when: '10/25' },
        { t: '劇本「討伐董卓」:玩董卓這邊', when: '10/26' },
        { t: '自動流程測試 2000 多項', when: '持續' }
      ] },
    { id: 'workshop', no: '03', zone: 'work', icon: '🗿', name: '3D 模型工坊', kind: 'workshop', land: '#D7D2C4',
      quote: 'AI 生出模型,Blender 切割、縮面、畫圖示,一把一把歸檔。',
      tags: ['Tripo', 'Blender'],
      items: [
        { t: '蜀魏吳 36 把專武模型', when: '10/25' },
        { t: '群雄 12 把專武模型與圖示', when: '10/25' },
        { t: '群雄五星公仔 4 隻', when: '10/25' },
        { t: '武將頁專武 3D 旋轉展示', when: '10/25' }
      ] },
    { id: 'tcg', no: '04', zone: 'work', icon: '🃏', name: '卡牌店中文化', kind: 'shop', land: '#E3D3BF',
      quote: '想玩的遊戲沒有中文,那就自己做。',
      tags: ['MOD', '翻譯', '插件'],
      items: [
        { t: 'TCG Card Shop Simulator 的 MOD 介面繁中化', when: '10/12' },
        { t: '自製中文字型插件', when: '10/12' },
        { t: '寶可夢名稱字典 1107 條', when: '10/12' },
        { t: '卡冊近看卡片時的中文資訊面板', when: '10 月' }
      ] },
    { id: 'farm', no: '05', zone: 'work', icon: '🌱', name: '小花瓜種田', kind: 'farm', land: '#C9DDA8',
      quote: '一覺醒來變成種植小花瓜:收成像開盲盒,天氣 × 機率 × 變異。',
      tags: ['規劃中', '休閒', '掛機'],
      items: [
        { t: '休閒種田、可以一天玩很久的節奏', when: '構想' },
        { t: '一張作物圖 + 特效圖層疊加,省下大部分美術', when: '構想' },
        { t: '星光、月光、琥珀等稀有變異', when: '構想' },
        { t: '還沒開工,島上正在搭鷹架', when: '施工中' }
      ] },
    { id: 'learnisle', no: '06', zone: 'work', icon: '🧭', name: '探索學習', kind: 'learn', land: '#C6DCE6',
      quote: '不只記帳,也要看懂 AI 和理財在做什麼。',
      tags: ['AI', '理財知識', '自動更新'],
      items: [
        { t: 'AI 入門、AI 工具、自動化工坊', when: '10/26' },
        { t: '理財知識:除息、填息、補充保費', when: '10/26' },
        { t: '複習題庫與錯題本', when: '10/26' },
        { t: '雲端每 10 天自動加新課', when: '11/1 起' }
      ] },
    { id: 'ai', no: '07', zone: 'work', icon: '🤖', name: 'AI 工作室', kind: 'ai', land: '#D9D4EE',
      quote: '想法是自己的,程式和模型交給 AI 一起做。',
      tags: ['Claude', '生圖', '3D 生成'],
      items: [
        { t: '用 Claude 寫這個 APP、三國遊戲和 MOD 插件', when: '持續' },
        { t: 'AI 生卡面、技能切入圖,再由 AI 歸檔改名', when: '10 月' },
        { t: 'AI 轉 3D 模型,再用 Blender 腳本整理', when: '10 月' },
        { t: '雲端排程:每 10 天自動更新課程', when: '10/26' }
      ] },
    { id: 'home', no: '08', zone: 'home', icon: '🏠', name: '黃與蘇的家', kind: 'home', land: '#F2D6D6',
      quote: '兩個人的存股,合在一起就是這個家的底氣。', tags: ['真實資料'] },
    { id: 'huang', no: '09', zone: 'home', person: 0, icon: '🟡', name: '的房間', kind: 'room', land: '#F3E3B5', roof: '#E0A82E',
      quote: '每一次買進,都是一層樓。', tags: ['真實資料'] },
    { id: 'su', no: '10', zone: 'home', person: 1, icon: '🔵', name: '的房間', kind: 'room', land: '#D5E2F2', roof: '#4F7FC8',
      quote: '每一次買進,都是一層樓。', tags: ['真實資料'] },
    { id: 'vault', no: '11', zone: 'home', icon: '💰', name: '配息小金庫', kind: 'vault', land: '#EFE2B8',
      quote: '不用賣股票,錢自己會來。', tags: ['真實資料'] },
    { id: 'piggy', no: '12', zone: 'home', icon: '🐷', name: '月存撲滿', kind: 'piggy', land: '#F4DCE2',
      quote: '每個月存一點,撲滿會越來越重。', tags: ['真實資料'] },
    { id: 'wealth', no: '13', zone: 'future', icon: '🏗️', name: '資產里程碑', kind: 'tower', land: '#D3E4EE',
      quote: '下一站在哪裡,蓋到哪一層。', tags: ['會長大'] },
    { id: 'income', no: '14', zone: 'future', icon: '⛲', name: '被動收入', kind: 'fountain', land: '#CFE6E8',
      quote: '從月領一千開始,一站一站往上。', tags: ['會長大'] },
    { id: 'study', no: '15', zone: 'future', icon: '🌳', name: '學習之樹', kind: 'tree', land: '#D2E6C8',
      quote: '上完一堂課,樹就長大一點。', tags: ['會長大'] },
    { id: 'next', no: '16', zone: 'future', icon: '🪧', name: '下一步', kind: 'sign', land: '#DDE3EA',
      quote: '接下來想做的事,都插在這塊路牌上。', tags: ['待辦'],
      items: [
        { t: '三國:吳魏新武將(二喬、甄姬、魯肅、許褚)的卡面與專武', when: '進行中' },
        { t: '三國:200 小時以上的長線養成規劃', when: '規劃' },
        { t: '小花瓜:開工寫第一個原型', when: '還沒開始' },
        { t: '理財 APP:第一次自動內容更新', when: '11/1' }
      ] }
  ];
  // 拼成愛心的位置:x 以六邊形寬為單位(奇數列錯開半格),r 是第幾列;上面兩個圓弧、尖端朝向鏡頭
  const MYI_LAYOUT = {
    sanguo: [0.5, -1], app: [3.5, -1],
    workshop: [0, 0], tcg: [1, 0], learnisle: [3, 0], ai: [4, 0],
    farm: [0.5, 1], huang: [1.5, 1], su: [2.5, 1], piggy: [3.5, 1],
    vault: [1, 2], home: [2, 2], wealth: [3, 2],
    income: [1.5, 3], study: [2.5, 3],
    next: [2, 4]
  };
  MYI_TILES.forEach(t => { [t.x, t.r] = MYI_LAYOUT[t.id]; });
  // 協作關係:哪兩格互相支援
  const MYI_LINKS = [
    ['workshop', 'sanguo', '48 把專武與群雄公仔的 3D 模型'],
    ['workshop', 'app', '同一套 3D 做法,做出持股小鎮與群島'],
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
    ['ai', 'sanguo', '一起設計玩法、寫自動測試'],
    ['ai', 'workshop', 'AI 生圖、轉 3D 模型'],
    ['ai', 'tcg', '一起寫 MOD 插件'],
    ['huang', 'piggy', '每個月存一點'],
    ['su', 'piggy', '每個月存一點'],
    ['piggy', 'wealth', '存下來的錢也算底氣'],
    ['farm', 'next', '開工寫第一個原型']
  ];
  const MYI_EVENTS = [
    { d: '2026-04-30', t: '理財 APP 第一版上線', tile: 'app' },
    { d: '2026-10-12', t: 'TCG 卡牌店 MOD 繁中化完成', tile: 'tcg' },
    { d: '2026-10-16', t: '想到種田遊戲「一覺醒來變成種植小花瓜」', tile: 'farm' },
    { d: '2026-10-17', t: '三國遊戲第一個水墨剪影戰鬥原型', tile: 'sanguo' },
    { d: '2026-10-25', t: '持股小鎮改成 3D、新增市場頁', tile: 'app' },
    { d: '2026-10-25', t: '48 把專武 3D 模型全部完成', tile: 'workshop' },
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
    let total = 0, done = 0, quiz = 0, answered = 0, right = 0;
    const per = sets.map(([name, L]) => {
      const d = L.filter(l => prog[l.id]).length;
      total += L.length; done += d;
      L.forEach(l => { quiz += (l.quiz || []).length; const p = prog[l.id]; if (p) { answered += p.total || 0; right += p.score || 0; } });
      return { name, done: d, total: L.length };
    });
    return { total, done, quiz, answered, right, per };
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
        sub: `完成 ${L.done}/${L.total} 課`, grow: p,
        html: `${bar(p)}<div class="myi-stats">${L.per.map(x => stat(x.name, `${x.done}/${x.total}`)).join('')}</div>
          ${L.answered ? `<div class="muted small">答對 ${L.right}/${L.answered} 題(${Math.round(L.right / L.answered * 100)}%)</div>` : '<div class="muted small">還沒上過課,到探索群島的課程島試試看。</div>'}`
      };
    }
    return { sub: t.id === 'farm' ? '🚧 施工中' : MYI_ZONES[t.zone].name, grow: 0.5, html: '' };
  }

  // 時間軸:固定的里程碑 + 從資料算出來的(第一次買進、累計投入突破、第一次領配息)
  function myiTimeline(D) {
    const ev = MYI_EVENTS.map(e => Object.assign({}, e));
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
  function myiHeartGeo(k, depth) {
    const s = new THREE.Shape();
    s.moveTo(0, -k * 0.9);
    s.bezierCurveTo(k * 0.2, -k * 0.6, k, -k * 0.3, k, k * 0.25);
    s.bezierCurveTo(k, k * 0.75, k * 0.45, k * 0.95, 0, k * 0.5);
    s.bezierCurveTo(-k * 0.45, k * 0.95, -k, k * 0.75, -k, k * 0.25);
    s.bezierCurveTo(-k, -k * 0.3, -k * 0.2, -k * 0.6, 0, -k * 0.9);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: k * 0.08, bevelSegments: 2, curveSegments: 10 });
    g.center();
    return g;
  }

  const MYI_R = 1.7, MYI_W = Math.sqrt(3) * MYI_R;
  const myiPos = (t) => ({ x: (t.x - 2) * MYI_W, z: (t.r - 1.5) * 1.5 * MYI_R });

  function myiBuild(canvas, D) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
    MYI.s = { renderer, camera, scene: null, tiles: [], links: [], spin: [], flows: [], raf: 0, prev: 0, t: 0, lastTouch: 0,
      cam: { theta: Math.PI / 2, phi: 0.6, dist: 28 }, target: new THREE.Vector3(), want: { x: 0, z: 0, dist: 24 } };
    myiBindControls(canvas);
    myiFill(D);
  }

  // 把場景內容(島、看板、協作線)依目前資料重做一次
  function myiFill(D) {
    const s = MYI.s;
    if (s.scene) s.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    const scene = new THREE.Scene();
    const dark = document.documentElement.dataset.theme === 'dark';
    const sky = new THREE.Color(dark ? '#1E2E38' : '#F6EDE6');
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 34, 80);
    const sun = new THREE.DirectionalLight('#FFF4E0', dark ? 0.7 : 0.95);
    sun.position.set(10, 24, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#7A6A6A', dark ? 0.55 : 0.75), sun);
    const flat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.85 }, extra || {}));
    const sea = new THREE.Mesh(new THREE.CircleGeometry(90, 48), flat(dark ? '#264656' : '#9CCFDC'));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.45; sea.receiveShadow = true;
    scene.add(sea);

    const spin = [], tiles = [];
    MYI_TILES.forEach(t => {
      const p = myiPos(t), live = myiLive(t, D), zone = MYI_ZONES[t.zone];
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      g.userData.tile = t;
      scene.add(g);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(MYI_R * 0.95, MYI_R * 0.98, 0.6, 6), flat(zone.color));
      base.position.y = -0.1; base.receiveShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(MYI_R * 0.88, MYI_R * 0.9, 0.14, 6), flat(t.land));
      top.position.y = 0.27; top.receiveShadow = true;
      g.add(base, top);
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
        [[-0.75, -0.75, '#C8473A'], [0.75, -0.75, '#3A7A4A']].forEach(([x, z, c]) => {
          cyl(0.03, 1.1, '#5A4A3A', x, z);
          const f = add(new THREE.BoxGeometry(0.4, 0.26, 0.02), c, x + 0.21, T + 0.95, z);
          spin.push({ m: f, wave: true, base: f.rotation.y });
        });
      } else if (t.kind === 'workshop') {
        cyl(0.45, 0.35, '#B8B0A0', 0, 0);
        const st = add(new THREE.IcosahedronGeometry(0.42, 0), '#E9B949', 0, T + 0.85, 0, { metalness: 0.4, roughness: 0.35 });
        spin.push({ m: st, axis: 'y', speed: 0.8 });
        box(0.9, 0.35, 0.45, '#8A6A4A', -0.6, 0.7);
        [[0.7, -0.5], [0.85, 0.35]].forEach(([x, z]) => { const w = box(0.08, 0.9, 0.08, '#9AA5AD', x, z); w.rotation.z = 0.35; });
      } else if (t.kind === 'shop') {
        box(1.2, 0.75, 0.8, '#F2E6D2', 0, -0.2);
        for (let i = 0; i < 6; i++) box(0.2, 0.06, 0.45, i % 2 ? '#F4F1EA' : '#D2533F', -0.5 + i * 0.2, 0.38, T + 0.62);
        ['#E85D5D', '#4F8FD8', '#F2B33D', '#58B368'].forEach((c, i) => box(0.22, 0.04 + i * 0.03, 0.3, c, -0.45 + i * 0.3, 0.8));
      } else if (t.kind === 'farm') {
        for (let i = 0; i < 3; i++) {
          box(1.4, 0.1, 0.25, '#8A5A3A', -0.1, -0.6 + i * 0.45);
          for (let k = 0; k < 4; k++) add(new THREE.ConeGeometry(0.08, 0.22, 5), '#5FAE4A', -0.6 + k * 0.33, T + 0.21, -0.6 + i * 0.45);
        }
        [[0.85, -0.3], [0.85, 0.5], [1.15, -0.3], [1.15, 0.5]].forEach(([x, z]) => cyl(0.03, 1.2, '#C8A060', x - 0.15, z, T, 6));
        box(0.4, 0.04, 0.9, '#B8864A', 0.85, 0.1, T + 0.8);
        box(0.4, 0.04, 0.9, '#B8864A', 0.85, 0.1, T + 0.4);
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
      } else if (t.kind === 'sign') {
        cyl(0.06, 1.4, '#7A5A3A', 0, 0, T, 8);
        [[1.15, 0.5, '#E8875B'], [0.85, -0.6, '#3E93C2'], [0.55, 0.9, '#D9607E']].forEach(([y, a, c]) => { const b = box(0.85, 0.2, 0.06, c, 0, 0, T + y); b.rotation.y = a; b.position.x = Math.cos(-a) * 0.3; b.position.z = Math.sin(-a) * 0.3; });
        for (let i = 0; i < 4; i++) cyl(0.16, 0.05, '#BDB4A6', -0.5 + i * 0.25, 0.6 + (i % 2) * 0.12, T, 8);
      }
      const label = exploreLabel([{ text: `${t.no} ${t.icon} ${myiTileName(t)}`, bold: true, size: 32 }, { text: live.sub, size: 24, color: zone.color }], 440, 110, 3.0);
      label.position.set(0, 3.2, 0);
      g.add(label);
      tiles.push({ t, g, label, base, sub: live.sub });
    });

    // 協作線:兩格之間的拱形管子,選到其中一格時變亮,還有光點流動
    const links = MYI_LINKS.map(([a, b, text]) => {
      const A = myiPos(MYI_TILES.find(x => x.id === a)), B = myiPos(MYI_TILES.find(x => x.id === b));
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
      l.mat.opacity = MYI.sel ? (on ? 0.95 : 0.08) : 0.22;
      l.dot.visible = !!on;
    });
    // 全景:小看板只寫編號和名稱、貼著格子;選到的那格才顯示第二行
    s.tiles.forEach(x => {
      const on = x.t.id === MYI.sel;
      const title = { text: `${x.t.no} ${x.t.icon} ${myiTileName(x.t)}`, bold: true, size: on ? 34 : 38 };
      x.label.draw(on ? [title, { text: x.sub, size: 24, color: MYI_ZONES[x.t.zone].color }] : [title]);
      const k = on ? 3.4 : 3.0;
      x.label.scale.set(k, k * 110 / 440, 1);
      x.label.position.y = on ? 2.6 : 1.5;
      const linked = MYI.sel && MYI_LINKS.some(l => (l[0] === MYI.sel && l[1] === x.t.id) || (l[1] === MYI.sel && l[0] === x.t.id));
      x.label.visible = !MYI.sel || on || linked;   // 拉近時只留有協作關係的格子看板,不然會擋住畫面
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
      else if (x.rise) {
        const p = (s.t * 0.35 + x.phase) % 1;
        x.m.position.set(Math.cos(x.a + p * 3) * x.r, x.low + (x.top - x.low) * p, Math.sin(x.a + p * 3) * x.r);
        x.m.rotation.x = p * 6;
      } else {
        x.m.rotation[x.axis] += dt * x.speed;
        if (x.bob) x.m.position.y = x.bob + Math.sin(s.t * 2) * 0.12;
      }
    });
    // 選到的那一格浮起來,其他輕輕起伏
    s.tiles.forEach((x, i) => {
      const want = x.t.id === MYI.sel ? 0.35 : Math.sin(s.t * 0.8 + i) * 0.04;
      x.g.position.y += (want - x.g.position.y) * Math.min(1, dt * 5);
    });
    s.links.forEach(l => { if (l.dot.visible) l.dot.position.copy(l.curve.getPoint((s.t * 0.45) % 1)); });
    // 鏡頭:飛向選中的格子,沒操作時左右輕輕擺動
    s.target.x += (s.want.x - s.target.x) * Math.min(1, dt * 2.5);
    s.target.z += (s.want.z - s.target.z) * Math.min(1, dt * 2.5);
    const wantDist = MYI.sel ? s.want.dist : Math.max(25, 28 / s.camera.aspect);   // 畫面窄就拉遠,整顆心放得下
    s.cam.phi += ((MYI.sel ? 0.95 : 0.6) - s.cam.phi) * Math.min(1, dt * 2.5);   // 全景接近俯視才看得出愛心;選一格時壓低看細節
    s.cam.dist += (wantDist - s.cam.dist) * Math.min(1, dt * 2.5);
    const sway = now - s.lastTouch > 3000 ? Math.sin(s.t * 0.25) * 0.1 : 0;
    const theta = s.cam.theta + sway;
    s.camera.position.set(s.target.x + Math.cos(theta) * Math.sin(s.cam.phi) * s.cam.dist, Math.cos(s.cam.phi) * s.cam.dist + 1, s.target.z + Math.sin(theta) * Math.sin(s.cam.phi) * s.cam.dist);
    s.camera.lookAt(s.target.x, MYI.sel ? 1.2 : 0, s.target.z);
    s.renderer.render(s.scene, s.camera);
    s.raf = requestAnimationFrame(myiFrame);
  }
  function myiResize() {
    const s = MYI.s;
    if (!s || !MYI.canvas) return;
    const w = MYI.canvas.clientWidth || 320, h = MYI.canvas.clientHeight || 300;
    s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }
  // 左右拖曳旋轉(上下滑仍可捲動頁面);點格子 = 選它,點海 = 回全景
  function myiBindControls(canvas) {
    let p = null;
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    canvas.addEventListener('pointerdown', (e) => { p = { x: e.clientX, sx: e.clientX, sy: e.clientY, drag: false }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!p || !MYI.s) return;
      if (!p.drag && Math.abs(e.clientX - p.sx) > 8 && Math.abs(e.clientX - p.sx) > Math.abs(e.clientY - p.sy)) p.drag = true;
      if (p.drag) { MYI.s.cam.theta += (e.clientX - p.x) * 0.008; MYI.s.lastTouch = performance.now(); }
      p.x = e.clientX;
    });
    canvas.addEventListener('pointerup', (e) => {
      const s = MYI.s;
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
    canvas.addEventListener('pointercancel', () => { p = null; });
  }

  // ---------- 面板 ----------
  function myiSelect(id) {
    MYI.sel = id && MYI.sel === id ? null : id;   // 再點一次同一格 = 回全景
    const s = MYI.s, t = MYI_TILES.find(x => x.id === MYI.sel);
    if (s) {
      if (t) { const p = myiPos(t); s.want = { x: p.x, z: p.z, dist: 12 }; } else s.want = { x: 0, z: 0, dist: 28 };
      s.lastTouch = 0;
    }
    myiHighlight();
    myiRenderDetail();
  }

  function myiDetailHtml(t, D) {
    const zone = MYI_ZONES[t.zone], live = myiLive(t, D);
    const links = MYI_LINKS.filter(l => l[0] === t.id || l[1] === t.id);
    return `<div class="myi-sheet" style="--zone:${zone.color}">
      <div class="myi-kicker">TILE ${t.no}・${zone.name}</div>
      <div class="myi-title">${t.icon} ${escapeHtml(myiTileName(t))}</div>
      <div class="myi-quote">「${escapeHtml(t.quote)}」</div>
      <div class="myi-chips">${(t.tags || []).map(x => `<span class="myi-chip">${escapeHtml(x)}</span>`).join('')}<span class="myi-chip">${links.length} 條協作</span></div>
      ${live.html ? `<div class="myi-live">${live.html}</div>` : ''}
      ${t.items ? `<div class="myi-sub">細項</div><ul class="myi-items">${t.items.map(x => `<li><span>${escapeHtml(x.t)}</span><span class="muted small">${escapeHtml(x.when || '')}</span></li>`).join('')}</ul>` : ''}
      ${links.length ? `<div class="myi-sub">協作關係</div><div class="myi-links">${links.map(l => {
        const o = MYI_TILES.find(x => x.id === (l[0] === t.id ? l[1] : l[0]));
        return `<button type="button" class="myi-link" data-myi="${o.id}"><b>${o.icon} ${escapeHtml(myiTileName(o))}</b><span class="muted small">${escapeHtml(l[2])}</span></button>`;
      }).join('')}</div>` : ''}
    </div>`;
  }

  function myiRenderDetail() {
    const box = $('#myi-detail');
    if (!box) return;
    const D = myiData(), t = MYI_TILES.find(x => x.id === MYI.sel);
    box.innerHTML = t ? myiDetailHtml(t, D) : `<div class="myi-sheet">
      <div class="myi-kicker">HELLO / 我的島</div>
      <div class="myi-title">每一格,都是你的一部分</div>
      <div class="muted small" style="margin:6px 0 10px;">16 塊等大的六邊形拼成一顆心。點一格(或下面的清單)看細項,粉紅色的線是格子之間的協作關係。家和未來區用的是 APP 裡的真實記錄,會跟著長大。</div>
      <div class="myi-zones">${Object.values(MYI_ZONES).map(z => `<div class="myi-zone" style="--zone:${z.color}"><b>${z.name}</b><span class="muted small">${z.desc}</span></div>`).join('')}</div>
    </div>`;
    box.querySelectorAll('[data-myi]').forEach(b => { b.onclick = () => { MYI.sel = null; myiSelect(b.dataset.myi); }; });
  }

  function myiRenderList(box, D) {
    box.innerHTML = Object.entries(MYI_ZONES).map(([k, z]) => `<div class="myi-sub" style="color:${z.color}">${z.name}・${z.desc}</div>
      <div class="ex-list">${MYI_TILES.filter(t => t.zone === k).map(t => `<button type="button" class="ex-item" data-myi="${t.id}">
        <span class="ex-ico">${t.icon}</span><span><b>${t.no} ${escapeHtml(myiTileName(t))}</b><br><span class="muted small">${escapeHtml(myiLive(t, D).sub)}</span></span></button>`).join('')}</div>`).join('');
  }

  function myiRenderTime(box, D) {
    const today = autodivYmd(new Date());
    const ev = myiTimeline(D);
    box.innerHTML = `<div class="myi-time">${ev.map(e => {
      const t = MYI_TILES.find(x => x.id === e.tile) || MYI_TILES[0];
      return `<button type="button" class="myi-ev${e.d > today ? ' soon' : ''}" data-myi="${t.id}" style="--zone:${MYI_ZONES[t.zone].color}">
        <span class="myi-ev-d">${escapeHtml(e.d.slice(0, 4))}<br><b>${escapeHtml(e.d.slice(5).replace('-', '/'))}</b></span>
        <span class="myi-ev-t">${escapeHtml(e.t)}${e.money ? ' ' + myiW(e.money) : ''}${e.d > today ? ' <span class="ex-soon">即將</span>' : ''}<br><span class="muted small">${t.icon} ${escapeHtml(myiTileName(t))}</span></span>
      </button>`;
    }).join('')}</div>`;
  }

  // 探索頁面板裡「我的島」的內容
  function myIslandHtml() {
    const tab = (v, label) => `<button type="button" class="chip${MYI.view === v ? ' active' : ''}" data-myi-view="${v}">${label}</button>`;
    return `<div class="myi">
      <div class="myi-tabs">${tab('map', '🗺️ 全景')}${tab('list', '☰ 清單')}${tab('time', '◷ 時間')}</div>
      <div class="myi-stage${MYI.view === 'map' && !MYI.failed ? '' : ' hidden'}" id="myi-stage"><div class="explore-hint small">點一格看看・左右滑動旋轉</div></div>
      <div id="myi-detail" class="${MYI.view === 'map' ? '' : 'hidden'}"></div>
      <div id="myi-body"></div>
    </div>`;
  }

  async function myIslandMount() {
    const root = $('.myi');
    if (!root) return;
    root.querySelectorAll('[data-myi-view]').forEach(b => { b.onclick = () => { MYI.view = b.dataset.myiView; renderExplorePanel(); }; });
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
