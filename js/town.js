/* 持股小鎮 — 每檔持股一間小店(純 SVG,不用 3D 函式庫,手機負擔很輕)。
 * 房子高度 = 市值、門口人數 = 市值占比、屋頂顏色 = 今日漲跌或殖利率(成本)、
 * 30 天內有除息的掛小旗子。卡片預設收起,展開才會畫。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const TOWN = { mode: 'chg' };   // 'chg' 今日漲跌 | 'yld' 殖利率(成本)

  // 每檔最新一筆漲跌幅(%);沒有資料回傳 null
  function townLatestChange() {
    const latest = {};
    (STATE.data.price_history || []).forEach(r => {
      const d = String(r.date || '').slice(0, 10);
      if (!r.symbol || !d) return;
      if (!latest[r.symbol] || d > latest[r.symbol].d) {
        latest[r.symbol] = { d, pct: (Number(r.prev_close) || 0) > 0 ? Number(r.change_pct) || 0 : null };
      }
    });
    return latest;
  }

  // 30 天內的下一次除息(已知或預估);歷史資料沒載入時回傳空
  function townNextEx(person) {
    if (!Array.isArray(_exDiv.list)) return {};
    const today = autodivYmd(new Date());
    const out = {};
    computePayoutEvents(person, today, autodivAddDays(today, 60)).events.forEach(e => {
      if (e.exDate < today || e.exDate > autodivAddDays(today, 30)) return;
      if (!out[e.symbol] || e.exDate < out[e.symbol]) out[e.symbol] = e.exDate;
    });
    return out;
  }

  function townItems(person) {
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const open = computeOpenHoldings(person);
    const chg = townLatestChange();
    const t12 = trailing12Dividends(person);
    const nextEx = townNextEx(person);
    const items = Object.keys(open).map(sym => {
      const price = Number((symMap[sym] || {}).current_price) || 0;
      const value = price > 0 ? price * open[sym].shares : open[sym].cost;   // 沒現價就用成本
      return {
        sym, name: (symMap[sym] || {}).name || '',
        shares: open[sym].shares, cost: open[sym].cost, value,
        chg: chg[sym] ? chg[sym].pct : null,
        yld: dividendYieldOnCost(t12.bySym[sym] || 0, open[sym].cost),
        nextEx: nextEx[sym] || null
      };
    }).filter(it => it.value > 0);
    return items.sort((a, b) => b.value - a.value);
  }

  function townRoofColor(it) {
    if (TOWN.mode === 'chg') {
      if (it.chg === null) return 'var(--border)';
      return it.chg > 0 ? 'var(--green)' : it.chg < 0 ? 'var(--red)' : 'var(--muted)';
    }
    if (!it.yld) return 'var(--border)';
    return it.yld >= 6 ? 'var(--primary)' : it.yld >= 3 ? 'var(--time)' : 'var(--muted)';
  }

  function renderTown(person) {
    const card = $('#card-town');
    if (!card || !STATE.data) return;
    // 第一次預設收起(收合狀態沿用首頁卡片的機制)
    if (localStorage.getItem('pr.collapse.town') === null) {
      localStorage.setItem('pr.collapse.town', '1');
      card.classList.add('collapsed');
    }
    if (card.classList.contains('collapsed')) return;   // 收起時不畫,省資源

    const items = townItems(person);
    const wrap = $('#town-scene');
    if (items.length === 0) { wrap.innerHTML = '<div class="muted small">目前沒有持股</div>'; $('#town-readout').textContent = ''; return; }

    // 依實際寬度排版(viewBox = 真實像素,字不會被縮小);持股太多時寬度超出就左右滑動
    const n = items.length;
    const avail = Math.max(300, wrap.clientWidth || 340);
    const gap = 10;
    const bw = Math.max(44, Math.min(82, Math.floor((avail - 30) / n) - gap));
    const W = Math.max(avail, n * (bw + gap) + 30), H = 280, G = 226;
    const x0 = (W - (n * bw + (n - 1) * gap)) / 2;
    const maxV = items[0].value;
    const total = items.reduce((s, it) => s + it.value, 0);
    const cols = bw >= 70 ? 3 : bw >= 50 ? 2 : 1;

    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="持股小鎮"><line x1="0" y1="${G}" x2="${W}" y2="${G}" stroke="var(--border)" stroke-width="1.5"/>`;
    items.forEach((it, i) => {
      const h = 46 + (it.value / maxV) * 140, x = x0 + i * (bw + gap), y = G - h;
      s += `<g class="town-shop" data-i="${i}">`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="var(--surface)" stroke="var(--border)"/>`;
      s += `<rect x="${x - 4}" y="${y - 10}" width="${bw + 8}" height="11" rx="2" fill="${townRoofColor(it)}"/>`;
      const rows = Math.max(1, Math.floor((h - 36) / 22)), ww = 14, cw = (bw - 16) / cols;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const lit = ((i * 7 + r * 3 + c * 5) % 4) !== 0;
        s += `<rect x="${x + 8 + c * cw + (cw - ww) / 2}" y="${y + 12 + r * 22}" width="${ww}" height="11" rx="2" fill="${lit ? 'var(--huang)' : 'var(--bar-bg)'}" opacity="${lit ? 0.55 : 1}"/>`;
      }
      s += `<rect x="${x + bw / 2 - 7}" y="${G - 22}" width="14" height="22" rx="2" fill="var(--muted)"/>`;
      const people = Math.max(1, Math.min(14, Math.round(it.value / total * 30)));
      for (let p = 0; p < people; p++) {
        const px = x + 6 + ((p * 37) % Math.max(1, bw - 10)), py = G + 10 + ((p * 13) % 3) * 8;
        s += `<circle cx="${px}" cy="${py}" r="3.5" fill="var(--su)"/><rect x="${px - 2.5}" y="${py + 4}" width="5" height="7" rx="1.5" fill="var(--muted)"/>`;
      }
      if (it.nextEx) {
        const fx = Math.min(x + bw - 6, W - 48);
        s += `<line x1="${fx}" y1="${y - 10}" x2="${fx}" y2="${y - 36}" stroke="var(--muted)" stroke-width="1.5"/>`;
        s += `<rect x="${fx}" y="${y - 36}" width="44" height="15" rx="2" fill="var(--primary)"/>`;
        s += `<text x="${fx + 22}" y="${y - 25}" text-anchor="middle" font-size="10" fill="var(--surface)">${it.nextEx.slice(5).replace('-', '/')}除息</text>`;
      }
      s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="${bw < 56 ? 11 : 12}" fill="var(--text)">${escapeHtml(it.sym)}</text></g>`;
    });
    s += '</svg>';
    wrap.innerHTML = s;

    const show = (i) => {
      const it = items[i];
      const gain = it.value - it.cost;
      $('#town-readout').innerHTML =
        `<b>${escapeHtml(it.sym)}</b> ${escapeHtml(it.name)}<br>` +
        `<span class="town-num">市值 ${fmt.money(it.value)}(占 ${(it.value / total * 100).toFixed(0)}%)・` +
        `損益 <span class="${gain >= 0 ? 'gain' : 'loss'}">${fmt.moneySigned(gain)}</span></span>・` +
        `今日 ${it.chg === null ? '—' : (it.chg > 0 ? '+' : '') + it.chg.toFixed(2) + '%'}・` +
        `殖利率(成本) ${it.yld ? it.yld.toFixed(2) + '%' : '尚無配息'}` +
        (it.nextEx ? `・<b>${it.nextEx.slice(5).replace('-', '/')} 除息</b>` : '');
    };
    $$('#town-scene .town-shop').forEach(g => {
      g.addEventListener('mouseenter', () => show(+g.dataset.i));
      g.addEventListener('click', () => show(+g.dataset.i));
    });
    show(0);
    $$('#town-mode [data-town-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.townMode === TOWN.mode);
      b.onclick = () => { TOWN.mode = b.dataset.townMode; renderTown(person); };
    });
  }

  // 卡片展開時才畫(收合狀態由 ui.js 的點標題機制切換)
  function bindTownCard() {
    const card = $('#card-town');
    if (!card) return;
    new MutationObserver(() => {
      if (!card.classList.contains('collapsed') && STATE.data) renderTown(STATE.defaultPerson);
    }).observe(card, { attributes: true, attributeFilter: ['class'] });
  }
