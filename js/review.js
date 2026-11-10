/* 年度回顧 — 把一整年的買進、配息、里程碑整理成一頁,可以存成一張圖。
 * 放在探索頁「我的島」的「✨ 回顧」分頁(由 myisland.js 呼叫 reviewRender)。算的是兩個人合計,下面再分開列。
 * 隱私模式開著時,存出來的圖片會把金額遮掉。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const REVIEW = { year: null };
  const REVIEW_LEVELS = [1e5, 3e5, 5e5, 1e6, 2e6, 3e6, 5e6, 1e7, 2e7, 5e7];   // 累計投入的里程碑

  function reviewYears() {
    const ys = new Set();
    const d = STATE.data || {};
    (d.purchases || []).concat(d.dividends || []).forEach(r => { const y = String(r.date || '').slice(0, 4); if (/^\d{4}$/.test(y)) ys.add(y); });
    return [...ys].sort();
  }

  // 一整年的統計(兩人合計 + 各自);year 是 'YYYY'
  function computeYearReview(year) {
    const d = STATE.data || {}, Y = String(year);
    const code = (s) => String(s || '').replace(/^代號/, '');
    const ymd = (r) => String(r.date || '').slice(0, 10);
    const people = CONFIG.PEOPLE || [];
    const per = {};
    people.forEach(p => { per[p] = { invested: 0, buys: 0, sold: 0, div: 0, divN: 0 }; });
    const bySym = {}, divBySym = {}, months = Array.from({ length: 12 }, () => ({ invested: 0, div: 0 }));
    const all = (d.purchases || []).filter(r => ymd(r) && Number(r.shares)).slice().sort((a, b) => ymd(a) < ymd(b) ? -1 : ymd(a) > ymd(b) ? 1 : 0);
    let cum = 0;
    const levels = REVIEW_LEVELS.slice(), milestones = [];
    all.forEach(r => {
      const shares = Number(r.shares) || 0, amount = Number(r.amount) || 0, fee = Number(r.fee) || 0;
      const isBuy = shares > 0 && amount >= 0, inYear = ymd(r).slice(0, 4) === Y, x = per[r.person];
      if (isBuy) {
        cum += amount + fee;
        while (levels.length && cum >= levels[0]) { const lv = levels.shift(); if (inYear) milestones.push({ date: ymd(r), level: lv }); }
        if (inYear && x) {
          x.invested += amount + fee; x.buys++;
          bySym[code(r.symbol)] = (bySym[code(r.symbol)] || 0) + amount + fee;
          months[+ymd(r).slice(5, 7) - 1].invested += amount + fee;
        }
      } else if (inYear && x) x.sold += Math.abs(amount) - fee;
    });
    (d.dividends || []).forEach(r => {
      const t = Number(r.total) || 0, x = per[r.person];
      if (ymd(r).slice(0, 4) !== Y || !(t > 0) || !x) return;
      x.div += t; x.divN++;
      divBySym[code(r.symbol)] = (divBySym[code(r.symbol)] || 0) + t;
      months[+ymd(r).slice(5, 7) - 1].div += t;
    });
    const sum = (k) => people.reduce((a, p) => a + per[p][k], 0);
    const top = (o) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return e ? { sym: e[0], money: e[1] } : null; };
    const best = months.reduce((b, m, i) => m.invested > b.money ? { month: i + 1, money: m.invested } : b, { month: 0, money: 0 });
    // 我的島上這一年完成的事(打勾完成的細項、自己新增的格子)
    const island = (Array.isArray(d.island) ? d.island : []);
    const done = island.filter(r => String(r.date || '').slice(0, 4) === Y && r.text && !/^(hide|tile|link|unlink):/.test(r.note || '')).map(r => String(r.text));
    const firstBuy = all.find(r => Number(r.shares) > 0);
    return {
      year: Y, per,
      invested: sum('invested'), buys: sum('buys'), sold: sum('sold'), div: sum('div'), divN: sum('divN'),
      activeMonths: months.filter(m => m.invested > 0).length, months,
      topSym: top(bySym), topDiv: top(divBySym), symbols: Object.keys(bySym).length,
      bestMonth: best.month ? best : null, milestones, done,
      firstBuyThisYear: !!(firstBuy && ymd(firstBuy).slice(0, 4) === Y) ? ymd(firstBuy) : null
    };
  }

  // 今年(還沒過完):到今天的市值與報酬;以前的年份不顯示(沒有當時的市值)
  function reviewNow(year) {
    if (String(year) !== ymdLocal(new Date()).slice(0, 4) || typeof computePersonStats !== 'function') return null;
    const st = computePersonStats();
    let cost = 0, value = 0;
    (CONFIG.PEOPLE || []).forEach(p => { if (st[p]) { cost += st[p].totalCost || 0; value += st[p].marketValue || 0; } });
    return cost > 0 && value > 0 ? { cost, value, pct: (value - cost) / cost * 100 } : null;
  }

  function reviewRender(box) {
    const years = reviewYears();
    if (!years.length) { box.innerHTML = '<div class="myi-sheet"><div class="muted small">還沒有買進或配息紀錄,有了之後這裡會整理成年度回顧。</div></div>'; return; }
    if (!REVIEW.year || !years.includes(REVIEW.year)) REVIEW.year = years[years.length - 1];
    const R = computeYearReview(REVIEW.year), now = reviewNow(REVIEW.year);
    const M = (n) => `<span class="town-num">${fmt.money(Math.round(n))}</span>`;
    const stat = (icon, label, val, sub) => `<div class="rv-stat"><span class="rv-ico">${icon}</span><span class="muted small">${label}</span><b>${val}</b>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;
    const maxM = Math.max(1, ...R.months.map(m => Math.max(m.invested, m.div)));
    const names = (CONFIG.PEOPLE || []).map(p => getPersonLabel(p)).join('與');
    box.innerHTML = `<div class="rv">
      <div class="rv-years">${years.map(y => `<button type="button" class="chip${y === REVIEW.year ? ' active' : ''}" data-rv-year="${y}">${y}</button>`).join('')}</div>
      <div class="rv-hero"><div class="rv-kicker">YEAR IN REVIEW</div><div class="rv-title">${R.year} 年回顧</div>
        <div class="rv-sub">${escapeHtml(names)}的一年${R.year === ymdLocal(new Date()).slice(0, 4) ? '(到今天為止)' : ''}</div></div>
      <div class="rv-grid">
        ${stat('🧱', '這一年投入', M(R.invested), `買進 ${R.buys} 筆・${R.activeMonths} 個月有買`)}
        ${stat('💰', '領到配息', M(R.div), `共 ${R.divN} 次`)}
        ${R.topSym ? stat('🏆', '買最多的', escapeHtml(R.topSym.sym), `投入 ${M(R.topSym.money)}・共買了 ${R.symbols} 檔`) : ''}
        ${R.topDiv ? stat('🎁', '配息最多的', escapeHtml(R.topDiv.sym), `領了 ${M(R.topDiv.money)}`) : ''}
        ${R.bestMonth ? stat('📅', '投入最多的月份', R.bestMonth.month + ' 月', M(R.bestMonth.money)) : ''}
        ${now ? stat('📈', '到今天的總市值', M(now.value), `累計報酬 <span class="${now.pct >= 0 ? 'gain' : 'loss'}">${now.pct >= 0 ? '+' : ''}${now.pct.toFixed(1)}%</span>`) : ''}
      </div>
      <div class="myi-sub">每個月的投入與配息</div>
      <div class="rv-bars">${R.months.map((m, i) => `<div class="rv-bar"><div class="rv-bar-col">
          <i class="inv" style="height:${(m.invested / maxM * 100).toFixed(1)}%"></i><i class="div" style="height:${(m.div / maxM * 100).toFixed(1)}%"></i></div><span>${i + 1}</span></div>`).join('')}</div>
      <div class="muted small rv-legend"><i class="inv"></i>投入　<i class="div"></i>配息</div>
      ${R.milestones.length || R.firstBuyThisYear ? `<div class="myi-sub">這一年的里程碑</div><ul class="rv-list">
        ${R.firstBuyThisYear ? `<li>🌱 ${R.firstBuyThisYear.slice(5).replace('-', '/')} 第一次買進</li>` : ''}
        ${R.milestones.map(x => `<li>🎉 ${x.date.slice(5).replace('-', '/')} 累計投入突破 <span class="town-num">${x.level >= 1e8 ? x.level / 1e8 + ' 億' : x.level / 1e4 + ' 萬'}</span></li>`).join('')}</ul>` : ''}
      <div class="myi-sub">兩個人各自</div>
      <div class="rv-people">${(CONFIG.PEOPLE || []).map(p => `<div class="rv-person"><b>${escapeHtml(getPersonLabel(p))}</b>
        <span class="muted small">投入 ${M(R.per[p].invested)}・${R.per[p].buys} 筆</span><span class="muted small">配息 ${M(R.per[p].div)}・${R.per[p].divN} 次</span></div>`).join('')}</div>
      ${R.done.length ? `<div class="myi-sub">島上完成的事</div><ul class="rv-list">${R.done.slice(0, 8).map(t => `<li>✓ ${escapeHtml(t)}</li>`).join('')}${R.done.length > 8 ? `<li class="muted small">…還有 ${R.done.length - 8} 件</li>` : ''}</ul>` : ''}
      <div class="myi-acts"><button type="button" class="btn small" id="rv-save">🖼️ 做成一張圖<span class="muted small">做好後長按圖片就能儲存或分享</span></button></div>
      <div id="rv-image"></div>
    </div>`;
    box.querySelectorAll('[data-rv-year]').forEach(b => { b.onclick = () => { REVIEW.year = b.dataset.rvYear; reviewRender(box); }; });
    box.querySelector('#rv-save').onclick = () => {
      const url = reviewImage(R, now, names).toDataURL('image/png');
      box.querySelector('#rv-image').innerHTML = `<img src="${url}" alt="${R.year} 年回顧" class="rv-img">
        <a class="btn ghost small" href="${url}" download="review-${R.year}.png">⬇️ 下載圖片</a>`;
      box.querySelector('#rv-image').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  // 畫成一張 1080 × 1350 的圖;隱私模式開著時金額用 ＊＊＊ 代替
  function reviewImage(R, now, names) {
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const hide = document.documentElement.dataset.privacy === 'on';   // 隱私模式(fx.js 會設這個屬性)
    const money = (n) => hide ? '＊＊＊' : 'NT$ ' + fmt.money(Math.round(n));
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#C9C4F4'); bg.addColorStop(0.55, '#F3D9EC'); bg.addColorStop(1, '#FDE5D2');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    [[880, 190, 260, 'rgba(255,255,255,.35)'], [140, 1180, 320, 'rgba(255,255,255,.28)']].forEach(([x, y, r, c]) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });
    const F = (w, s) => `${w} ${s}px system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#7A5C9E'; g.font = F(700, 30); g.fillText('YEAR IN REVIEW', 80, 120);
    g.fillStyle = '#3A3142'; g.font = F(800, 96); g.fillText(R.year + ' 年回顧', 80, 230);
    g.fillStyle = '#6B6472'; g.font = F(500, 36); g.fillText(names + '的一年', 80, 290);
    const tiles = [
      ['🧱 這一年投入', money(R.invested), `買進 ${R.buys} 筆・${R.activeMonths} 個月有買`],
      ['💰 領到配息', money(R.div), `共 ${R.divN} 次`],
      R.topSym ? ['🏆 買最多的', R.topSym.sym, `共買了 ${R.symbols} 檔`] : null,
      R.topDiv ? ['🎁 配息最多的', R.topDiv.sym, `領了 ${money(R.topDiv.money)}`] : null,
      R.bestMonth ? ['📅 投入最多的月份', R.bestMonth.month + ' 月', money(R.bestMonth.money)] : null,
      now ? ['📈 累計報酬', (now.pct >= 0 ? '+' : '') + now.pct.toFixed(1) + '%', '到今天為止'] : (R.milestones.length ? ['🎉 里程碑', R.milestones.length + ' 個', '累計投入一路往上'] : null)
    ].filter(Boolean);
    const TW = 440, TH = 180, GX = 40, GY = 26, X0 = 80, Y0 = 340;
    tiles.forEach((t, i) => {
      const x = X0 + (i % 2) * (TW + GX), y = Y0 + Math.floor(i / 2) * (TH + GY);
      g.shadowColor = 'rgba(80,50,110,.16)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
      g.fillStyle = 'rgba(255,255,255,.78)'; rr(x, y, TW, TH, 34); g.fill();
      g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.fillStyle = '#6B6472'; g.font = F(600, 30); g.fillText(t[0], x + 32, y + 52);
      g.fillStyle = '#3A3142'; g.font = F(800, t[1].length > 12 ? 44 : 56); g.fillText(t[1], x + 32, y + 114);
      g.fillStyle = '#8A8292'; g.font = F(500, 26); g.fillText(t[2], x + 32, y + 154);
    });
    // 每月長條
    const BY = Y0 + Math.ceil(tiles.length / 2) * (TH + GY) + 10, BH = 170, BW = W - 160;
    g.fillStyle = 'rgba(255,255,255,.6)'; rr(80, BY, BW, BH + 84, 34); g.fill();
    g.fillStyle = '#6B6472'; g.font = F(600, 28); g.fillText('每個月的投入', 112, BY + 46);
    const maxM = Math.max(1, ...R.months.map(m => m.invested));
    R.months.forEach((m, i) => {
      const bw = (BW - 64) / 12, x = 112 + i * bw, h = Math.max(4, m.invested / maxM * (BH - 30));
      const gr = g.createLinearGradient(0, BY + 60 + BH - 30 - h, 0, BY + 60 + BH - 30);
      gr.addColorStop(0, '#F08CA6'); gr.addColorStop(1, '#B9A8FF');
      g.fillStyle = m.invested > 0 ? gr : 'rgba(120,100,140,.18)';
      rr(x + 8, BY + 60 + BH - 30 - h, bw - 16, h, 10); g.fill();
      g.fillStyle = '#8A8292'; g.font = F(500, 22); g.textAlign = 'center'; g.fillText(String(i + 1), x + bw / 2, BY + 60 + BH + 4); g.textAlign = 'left';
    });
    g.fillStyle = '#7A5C9E'; g.font = F(600, 28); g.fillText('🐷 我的島・購買記錄', 80, H - 44);
    return cv;
  }
