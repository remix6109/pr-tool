/* 風險與回測 — 用每一檔的歷史日線(最多 5 年)算:報酬、波動、最大回檔、和大盤比較、買法回測。
 * 資料由市場中繼站的 /prices 提供(收盤價 c、含息還原價 a、配息 div);報酬一律用含息還原價算。
 * 這裡只整理「過去發生的事」,不預測、也不是買賣建議。上市不久的標的數字不穩,畫面上會標資料長度。
 * 在首頁「風險與回測」卡片顯示(展開才去抓資料);資產走勢的「每日」也會用這份資料畫完整的歷史。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const QUANT = { series: null, key: '', at: 0, loading: null, error: '', tab: 'all', BENCH: '0050', INDEX: '^TWII' };
  const quantCode = (s) => String(s || '').replace(/^代號/, '');

  // ---------- 純計算(tests/run.js 有測) ----------
  // 最大回檔:從最高點跌到最低點的幅度。回傳 { pct(負的), peak, trough, recover(漲回高點的日期,還沒就是 null) }
  function quantDrawdown(dates, values) {
    let peak = -Infinity, peakAt = 0, best = null, cur = null;   // cur = 目前這一段回檔
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v >= peak) {                      // 創新高:上一段回檔到這天算漲回來了
        if (cur) cur.recover = dates[i];
        peak = v; peakAt = i; cur = null;
        continue;
      }
      if (!cur) cur = { pct: 0, peak: dates[peakAt], trough: dates[i], recover: null };
      const dd = v / peak - 1;
      if (dd < cur.pct) { cur.pct = dd; cur.trough = dates[i]; }
      if (!best || cur.pct < best.pct) best = cur;
    }
    if (!best) return { pct: 0, peak: dates[0] || '', trough: dates[0] || '', recover: dates[0] || '' };
    return { pct: best.pct * 100, peak: best.peak, trough: best.trough, recover: best.recover };
  }
  // 年化波動度(%):每日報酬的標準差 × √252;不到 60 個交易日不算
  function quantVol(values) {
    if (values.length < 60) return null;
    const r = [];
    for (let i = 1; i < values.length; i++) if (values[i - 1] > 0 && values[i] > 0) r.push(Math.log(values[i] / values[i - 1]));
    const m = r.reduce((a, x) => a + x, 0) / r.length;
    return Math.sqrt(r.reduce((a, x) => a + (x - m) * (x - m), 0) / (r.length - 1)) * Math.sqrt(252) * 100;
  }
  // 一段序列的摘要;fromYmd 之後才算。years < 1 時不給年化(短期間年化會誇大)
  function quantStats(dates, values, fromYmd) {
    let i0 = 0;
    if (fromYmd) { i0 = dates.findIndex(d => d >= fromYmd); if (i0 < 0) return null; }
    const d = dates.slice(i0), v = values.slice(i0);
    if (d.length < 2) return null;
    const years = (Date.parse(d[d.length - 1]) - Date.parse(d[0])) / 864e5 / 365.25;
    const total = v[v.length - 1] / v[0] - 1;
    return {
      days: d.length, from: d[0], to: d[d.length - 1], years,
      total: total * 100, cagr: years >= 1 ? (Math.pow(1 + total, 1 / years) - 1) * 100 : null,
      vol: quantVol(v), dd: quantDrawdown(d, v)
    };
  }
  const quantIndexAt = (s, ymd) => { const i = s.d.findIndex(x => x >= ymd); return i < 0 ? -1 : i; };   // 那天(或之後第一個交易日)

  // 依時間重播買賣:每個交易日的市值、累計投入、當天新投入的錢、當天除息的配息。
  // rows = [{ date, sym, shares, money, price }](已依日期排序);Q = { 代號: { d, c, a, div } }
  function quantReplay(rows, Q) {
    if (!rows.length) return [];
    const start = rows[0].date;
    const all = new Set();
    [...new Set(rows.map(r => r.sym))].forEach(s => { if (Q[s]) Q[s].d.forEach(d => { if (d >= start) all.add(d); }); });
    const dates = [...all].sort();
    const idx = {}, last = {}, shares = {}, divAt = {}, stub = {};
    Object.keys(Q).forEach(s => { idx[s] = 0; divAt[s] = Object.fromEntries(Q[s].div || []); });
    const firstBuy = {};
    rows.forEach(r => { if (!firstBuy[r.sym]) firstBuy[r.sym] = r.date; });
    let i = 0, cost = 0;
    const out = [];
    dates.forEach(dt => {
      let div = 0, flow = 0;
      Object.keys(shares).forEach(s => { if (shares[s] > 0 && divAt[s] && divAt[s][dt]) div += shares[s] * divAt[s][dt]; });   // 除息前就持有的才領得到
      while (i < rows.length && rows[i].date <= dt) {
        const r = rows[i++];
        shares[r.sym] = (shares[r.sym] || 0) + r.shares;
        flow += r.money; cost += r.money;
        if (!(last[r.sym] > 0) && r.price > 0) { last[r.sym] = r.price; stub[r.sym] = true; }   // 還沒有行情時先用成交價
      }
      Object.keys(shares).forEach(s => {
        const q = Q[s]; if (!q) return;
        while (idx[s] < q.d.length && q.d[idx[s]] <= dt) {
          // 行情比買進晚出現(資料缺前幾天):從成交價換成真實收盤價的那一下不算賺賠
          if (stub[s]) { if (q.d[0] > firstBuy[s]) flow += shares[s] * (q.c[idx[s]] - last[s]); stub[s] = false; }
          last[s] = q.c[idx[s]]; idx[s]++;
        }
      });
      const value = Object.keys(shares).reduce((a, s) => a + (shares[s] > 0 ? shares[s] * (last[s] || 0) : 0), 0);
      out.push({ date: dt, value, cost, flow, div });
    });
    return out;
  }
  // 時間加權的報酬指數(起點 100):把每次加碼的影響拿掉,只看持股本身的表現,才能和指數比;配息算進報酬
  function quantTwr(series) {
    const idx = [];
    let cur = 100;
    series.forEach((x, i) => {
      if (i > 0 && series[i - 1].value > 0) cur *= (x.value - x.flow + x.div) / series[i - 1].value;
      idx.push(cur);
    });
    return idx;
  }
  // 回測:同樣的錢,三種買法到今天各值多少(都用含息還原價,等於假設配息再投入,所以「實際買法」不等於帳上的市值)
  //   actual  = 照你實際的日期和標的
  //   monthly = 同樣的標的、同樣的總金額,改成從第一次買那個月起每月第一個交易日平均買
  //   bench   = 同樣的日期、同樣的金額,全部改買 bench
  function quantBacktest(rows, Q, bench) {
    const grow = (sym, date, money) => {
      const q = Q[sym]; if (!q) return null;
      const i = quantIndexAt(q, date);
      return i < 0 ? money : money * q.a[q.a.length - 1] / q.a[i];
    };
    let invested = 0, actual = 0, monthly = 0, benchV = 0;
    const excluded = new Set(), bySym = {};
    rows.forEach(r => {
      const g = grow(r.sym, r.date, r.money);
      if (g === null) { excluded.add(r.sym); return; }
      invested += r.money; actual += g;
      const b = grow(bench, r.date, r.money);
      benchV += b === null ? r.money : b;
      const x = bySym[r.sym] || (bySym[r.sym] = { total: 0, first: r.date });
      x.total += r.money;
    });
    Object.keys(bySym).forEach(sym => {
      const q = Q[sym], x = bySym[sym], firsts = [];
      let prev = '';
      q.d.forEach((d, i) => { const m = d.slice(0, 7); if (m !== prev && m >= x.first.slice(0, 7)) firsts.push(i); prev = m; });
      if (!firsts.length) { monthly += x.total; return; }
      const each = x.total / firsts.length, end = q.a[q.a.length - 1];
      firsts.forEach(i => { monthly += each * end / q.a[i]; });
    });
    return { invested, actual, monthly, bench: benchV, excluded: [...excluded] };
  }

  // ---------- 資料 ----------
  // 某個人(或全部人)的買賣紀錄 → quantReplay / quantBacktest 用的格式
  function quantRows(person) {
    return ((STATE.data && STATE.data.purchases) || []).filter(r => (!person || r.person === person) && r.symbol && Number(r.shares))
      .map(r => ({ date: String(r.date || '').slice(0, 10), sym: quantCode(r.symbol), shares: Number(r.shares) || 0, money: (Number(r.amount) || 0) + (Number(r.fee) || 0), price: Number(r.price) || 0 }))
      .filter(r => r.date).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  // 中繼站的資料只到它上次抓的那天;用試算表裡每天自動記錄的收盤價把最近幾天補上
  function quantMergeRecent(Q) {
    const byS = {};
    ((STATE.data && STATE.data.price_history) || []).forEach(r => {
      const s = quantCode(r.symbol), d = String(r.date || '').slice(0, 10), c = Number(r.close_price);
      if (Q[s] && d && c > 0 && d > Q[s].d[Q[s].d.length - 1]) (byS[s] || (byS[s] = {}))[d] = c;
    });
    Object.keys(byS).forEach(s => {
      const q = Q[s];
      Object.keys(byS[s]).sort().forEach(d => {
        const n = q.d.length, c = byS[s][d];
        q.d.push(d); q.a.push(q.a[n - 1] * c / q.c[n - 1]); q.c.push(c);
      });
    });
    return Q;
  }
  // 抓所有買過的標的 + 0050 + 加權指數的長期日線;一次 6 檔分批要(中繼站一次算太多會超時),一小時內不重抓
  function quantLoad() {
    const codes = [...new Set(((STATE.data && STATE.data.purchases) || []).map(r => quantCode(r.symbol)).filter(Boolean).concat([QUANT.BENCH, QUANT.INDEX]))].sort();
    const key = codes.join(',');
    if (QUANT.series && QUANT.key === key && Date.now() - QUANT.at < 3600e3) return Promise.resolve(QUANT.series);
    if (QUANT.loading && QUANT.loadingKey === key) return QUANT.loading;
    const chunks = [];
    for (let i = 0; i < codes.length; i += 6) chunks.push(codes.slice(i, i + 6));
    QUANT.loadingKey = key;
    QUANT.loading = Promise.all(chunks.map(c => marketGet('/prices?s=' + encodeURIComponent(c.join(','))))).then(res => {
      const Q = {};
      res.forEach(r => Object.entries((r && r.series) || {}).forEach(([s, v]) => { if (v && Array.isArray(v.d) && v.d.length > 1) Q[s] = { d: v.d.slice(), c: v.c.slice(), a: v.a.slice(), div: v.div || [] }; }));
      if (!Object.keys(Q).length) throw new Error('沒有拿到任何歷史股價');
      QUANT.series = quantMergeRecent(Q); QUANT.key = key; QUANT.at = Date.now(); QUANT.error = '';
      return QUANT.series;
    }).catch(e => { QUANT.error = e.message || String(e); QUANT.series = null; throw e; })
      .finally(() => { QUANT.loading = null; });
    return QUANT.loading;
  }

  // ---------- 畫面 ----------
  const quantPct = (v, digits = 1) => v === null || v === undefined || !isFinite(v) ? '—' : `<span class="${v >= 0 ? 'gain' : 'loss'}">${v >= 0 ? '+' : ''}${v.toFixed(digits)}%</span>`;
  const quantMd = (s) => s ? s.slice(0, 4) + '/' + +s.slice(5, 7) + '/' + +s.slice(8, 10) : '';
  const quantSpan = (y) => y >= 1 ? y.toFixed(1) + ' 年' : Math.max(1, Math.round(y * 12)) + ' 個月';

  function quantOverallHtml(person, Q) {
    const series = quantReplay(quantRows(person), Q);
    if (series.length < 2) return '<div class="muted small">還沒有足夠的買進紀錄和歷史股價。</div>';
    const dates = series.map(x => x.date), twr = quantTwr(series), st = quantStats(dates, twr);
    const bench = Q[QUANT.BENCH] && quantStats(Q[QUANT.BENCH].d, Q[QUANT.BENCH].a, st.from);
    const index = Q[QUANT.INDEX] && quantStats(Q[QUANT.INDEX].d, Q[QUANT.INDEX].a, st.from);
    const dd = st.dd;
    const ddDays = Math.round((Date.parse(dd.trough) - Date.parse(dd.peak)) / 864e5);
    const tile = (label, val, sub) => `<div class="q-tile"><span class="muted small">${label}</span><b>${val}</b>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;
    QUANT.chart = { dates, twr, bench: Q[QUANT.BENCH], index: Q[QUANT.INDEX], from: st.from };
    return `<div class="muted small">${escapeHtml(getPersonLabel(person))}:從 ${quantMd(st.from)} 第一筆買進到 ${quantMd(st.to)},共 ${st.days} 個交易日(${quantSpan(st.years)})。</div>
      <div class="q-tiles">
        ${tile('持股報酬(含息)', quantPct(st.total), st.cagr !== null ? `年化 ${quantPct(st.cagr)}` : '不到一年,不算年化')}
        ${tile('年化波動度', st.vol === null ? '—' : st.vol.toFixed(1) + '%', st.vol === null ? '資料不到 60 天' : '數字越大,每天起伏越大')}
        ${tile('最大回檔', dd.pct < 0 ? `<span class="loss">${dd.pct.toFixed(1)}%</span>` : '0%', dd.pct < 0 ? `${quantMd(dd.peak)} → ${quantMd(dd.trough)}(${ddDays} 天)・${dd.recover ? '已在 ' + quantMd(dd.recover) + ' 漲回' : '還沒漲回高點'}` : '還沒有跌破過高點')}
        ${bench ? tile('同期 0050(含息)', quantPct(bench.total), `波動 ${bench.vol === null ? '—' : bench.vol.toFixed(1) + '%'}・最大回檔 ${bench.dd.pct.toFixed(1)}%`) : ''}
        ${index ? tile('同期加權指數', quantPct(index.total), '不含息') : ''}
      </div>
      <div class="chart-wrap q-chart"><canvas id="chart-quant"></canvas></div>
      <div class="muted small">「持股報酬」是<b>時間加權</b>報酬:把每次加碼的影響拿掉、配息算進去,只看持股本身的表現,所以可以和 0050、大盤放在一起比。它和首頁的「總市值/總本金」算法不同,數字不會一樣。</div>`;
  }

  function quantEachHtml(person, Q) {
    const held = Object.keys(computeOpenHoldings(person)).map(quantCode).sort();
    const row = (sym, name) => {
      const q = Q[sym];
      if (!q) return `<tr><td><b>${escapeHtml(sym)}</b></td><td colspan="4" class="muted small">取不到歷史股價</td></tr>`;
      const st = quantStats(q.d, q.a);
      const short = st.years < 1;
      return `<tr${short ? ' class="q-short"' : ''}><td><b>${escapeHtml(name || sym)}</b></td>
        <td class="small">${quantSpan(st.years)}${short ? ' ⚠️' : ''}</td>
        <td>${st.cagr !== null ? quantPct(st.cagr) + '<span class="muted small">/年</span>' : quantPct(st.total) + '<span class="muted small">期間</span>'}</td>
        <td>${st.vol === null ? '<span class="muted small">不足</span>' : st.vol.toFixed(1) + '%'}</td>
        <td>${st.dd.pct < 0 ? `<span class="loss">${st.dd.pct.toFixed(1)}%</span>` : '0%'}</td></tr>`;
    };
    return `<div class="q-table-wrap"><table class="q-table"><thead><tr><th>標的</th><th>資料長度</th><th>含息報酬</th><th>年化波動</th><th>最大回檔</th></tr></thead>
      <tbody>${held.map(s => row(s)).join('')}${held.includes(QUANT.BENCH) ? '' : row(QUANT.BENCH, '0050(對照)')}${row(QUANT.INDEX, '加權指數(不含息)')}</tbody></table></div>
      <div class="muted small">每一檔都是從它的資料起點(最多 5 年,或上市日)算到今天,<b>期間不一樣,不能直接互相比</b>。標 ⚠️ 的上市不到一年,數字還不穩定,只給期間報酬、不算年化。</div>`;
  }

  function quantBacktestHtml(person, Q) {
    const b = quantBacktest(quantRows(person), Q, QUANT.BENCH);
    if (!(b.invested > 0)) return '<div class="muted small">還沒有買進紀錄。</div>';
    const max = Math.max(b.actual, b.monthly, b.bench, b.invested);
    const bar = (label, v, note) => `<div class="q-bt"><div class="q-bt-head"><span>${label}</span><span><b class="town-num">${fmt.money(Math.round(v))}</b> ${quantPct((v / b.invested - 1) * 100)}</span></div>
      <div class="q-bt-bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i><em style="left:${(b.invested / max * 100).toFixed(1)}%"></em></div>${note ? `<div class="muted small">${note}</div>` : ''}</div>`;
    return `<div class="muted small">${escapeHtml(getPersonLabel(person))}累計投入 <span class="town-num">${fmt.money(Math.round(b.invested))}</span> 元(圖上的直線)。同樣這筆錢,三種買法到今天各值多少:</div>
      ${bar('你實際的買法', b.actual, '照你實際買的日期和標的')}
      ${bar('每月平均買', b.monthly, '同樣的標的和總金額,改成從第一次買那個月起,每月第一個交易日平均買')}
      ${bar('同樣的錢全買 0050', b.bench, '同樣的日期和金額,全部改買 0050')}
      ${b.excluded.length ? `<div class="muted small">${b.excluded.map(escapeHtml).join('、')} 取不到歷史股價,沒有算進來。</div>` : ''}
      <div class="muted small">三種都用含息還原價計算,等於假設<b>配息全部再投入</b>,所以「你實際的買法」會比帳上的總市值高(你領到的配息是現金)。這只是回頭看過去,<b>不代表哪一種買法以後比較好</b>。</div>`;
  }

  function quantDrawChart() {
    const cv = $('#chart-quant'), C = QUANT.chart;
    if (!cv || !C || !window.Chart) return;
    const palette = STATE.chartColors || getCurrentPalette().chart;
    const norm = (q) => {   // 指數從同一天起算成 100,對不上的日子沿用前一天
      if (!q) return null;
      let i = quantIndexAt(q, C.from); if (i < 0) return null;
      const base = q.a[i], out = [];
      C.dates.forEach(d => { while (i + 1 < q.d.length && q.d[i + 1] <= d) i++; out.push(q.a[i] / base * 100); });
      return out;
    };
    const step = Math.max(1, Math.ceil(C.dates.length / 260));   // 點太多時抽樣,手機才畫得動
    const pick = (a) => a && a.filter((_, i) => i % step === 0 || i === a.length - 1);
    const line = (label, data, color, extra) => Object.assign({ label, data: pick(data).map(v => Math.round(v * 10) / 10), borderColor: color, backgroundColor: 'transparent', tension: 0.2, pointRadius: 0, borderWidth: 2 }, extra || {});
    const ds = [line('我的持股(含息)', C.twr, palette[0] || '#3b82f6', { borderWidth: 3 })];
    const b = norm(C.bench), ix = norm(C.index);
    if (b) ds.push(line('0050(含息)', b, palette[2] || '#22c55e'));
    if (ix) ds.push(line('加權指數', ix, palette[1] || '#94a3b8', { borderDash: [5, 4] }));
    const opts = chartBarOptions();
    opts.scales.x.ticks.maxTicksLimit = 6;
    opts.scales.y.ticks.callback = (v) => v;
    opts.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}(起點 100)`;
    opts.interaction = { mode: 'index', intersect: false };
    if (_charts.quant) _charts.quant.destroy();
    _charts.quant = new Chart(cv, { type: 'line', data: { labels: pick(C.dates).map(d => d.slice(2).replace(/-/g, '/')), datasets: ds }, options: opts });
  }

  // 首頁卡片:展開才抓資料
  function renderQuant(person) {
    const card = $('#card-quant'), box = $('#quant-body');
    if (!card || !box || !STATE.data) return;
    if (card.classList.contains('collapsed')) return;
    person = person || STATE.defaultPerson;
    const tabs = `<div class="seg seg-mini" id="quant-tabs" style="margin-bottom:10px;">${[['all', '整體'], ['each', '各檔'], ['bt', '回測']].map(([k, n]) => `<button type="button" class="seg-btn${QUANT.tab === k ? ' active' : ''}" data-q="${k}">${n}</button>`).join('')}</div>`;
    const foot = '<div class="muted small q-foot">以上都是用歷史資料算出來的事實,不代表未來,也不是買賣建議。資料來源:Yahoo 日線(收盤價已和證交所抽查核對)。</div>';
    const draw = (inner) => {
      box.innerHTML = tabs + inner + foot;
      box.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { QUANT.tab = b.dataset.q; renderQuant(person); }; });
    };
    if (!QUANT.series) {
      draw(QUANT.error ? `<div class="muted small">歷史股價暫時取不到(${escapeHtml(QUANT.error)})。<button type="button" class="btn ghost small" id="quant-retry">再試一次</button></div>` : '<div class="muted small">正在讀取歷史股價…</div>');
      const retry = $('#quant-retry');
      if (retry) retry.onclick = () => { QUANT.error = ''; renderQuant(person); };
      if (!QUANT.error) quantLoad().then(() => { renderQuant(person); if (networthMode() === 'daily') renderNetWorthChart(person); }).catch(() => renderQuant(person));
      return;
    }
    const Q = QUANT.series;
    draw(QUANT.tab === 'each' ? quantEachHtml(person, Q) : QUANT.tab === 'bt' ? quantBacktestHtml(person, Q) : quantOverallHtml(person, Q));
    if (QUANT.tab === 'all') quantDrawChart();
  }

  // 預設收起(展開才會去抓 5 年的日線);展開的那一下開始畫
  function bindQuantCard() {
    const card = $('#card-quant');
    if (!card) return;
    try { if (localStorage.getItem('pr.collapse.quant') === null) localStorage.setItem('pr.collapse.quant', '1'); } catch (_) {}
    let was = true;
    new MutationObserver(() => {
      const collapsed = card.classList.contains('collapsed');
      if (was && !collapsed && STATE.data) renderQuant(STATE.defaultPerson);
      was = collapsed;
    }).observe(card, { attributes: true, attributeFilter: ['class'] });
  }
