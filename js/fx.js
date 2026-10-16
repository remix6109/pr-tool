/* 視覺特效:數字滾動、漲跌閃爍、隱私模式、觸覺回饋、圖表漸層。
 * 效果等級 full / lite / off 存在 localStorage;系統開「減少動態」時預設 off。 */
window.FX = (function() {
  const K = CONFIG.STORAGE_KEYS;
  const root = document.documentElement;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LEVELS = [
    { id: 'full', name: '完整' },
    { id: 'lite', name: '精簡' },
    { id: 'off',  name: '關閉' }
  ];
  let level = 'full';
  const prevVals = new Map();   // 標籤 → 上一次的數字(用來決定從哪滾到哪、漲或跌)

  function getLevel() {
    let v = null;
    try { v = localStorage.getItem(K.fxLevel); } catch (_) {}
    if (LEVELS.some(l => l.id === v)) return v;
    return reduceMotion ? 'off' : 'full';
  }

  function setLevel(id) {
    level = LEVELS.some(l => l.id === id) ? id : 'full';
    try { localStorage.setItem(K.fxLevel, level); } catch (_) {}
    root.dataset.fx = level;
  }

  // ---------- 隱私模式 ----------
  function isPrivate() {
    try { return localStorage.getItem(K.privacy) === '1'; } catch (_) { return false; }
  }
  function applyPrivacy() {
    const on = isPrivate();
    if (on) root.dataset.privacy = 'on'; else delete root.dataset.privacy;
    const b = document.getElementById('btn-privacy');
    if (b) { b.textContent = on ? '🙈' : '👁️'; b.title = on ? '顯示金額' : '隱藏金額'; }
  }
  function togglePrivacy() {
    try { localStorage.setItem(K.privacy, isPrivate() ? '0' : '1'); } catch (_) {}
    applyPrivacy();
    haptic(12);
  }

  // ---------- 觸覺回饋 ----------
  function haptic(ms) {
    if (level === 'full' && navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (_) {} }
  }

  // ---------- 數字滾動 + 漲跌閃爍 ----------
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function animateNode(node, prefix, from, to, decimals, suffix, finalText) {
    const t0 = performance.now();
    const dur = 700;
    function frame(now) {
      const t = Math.min(1, (now - t0) / dur);
      const v = from + (to - from) * easeOut(t);
      if (t < 1) {
        node.nodeValue = prefix + Math.round(v).toLocaleString('en-US') + suffix;
        requestAnimationFrame(frame);
      } else {
        node.nodeValue = finalText;     // 結束時還原成原本字串,避免捨入誤差
      }
    }
    requestAnimationFrame(frame);
  }

  function enhanceStats(scope) {
    if (level === 'off') return;
    (scope || document).querySelectorAll('.person-card .stat').forEach(st => {
      const lab = (st.querySelector('.label') || {}).textContent;
      const val = st.querySelector('.val');
      if (!lab || !val) return;
      const node = Array.from(val.childNodes).find(n => n.nodeType === 3 && /\d/.test(n.nodeValue));
      if (!node) return;
      const m = node.nodeValue.match(/^(\s*-?)([\d,]+)(\D*)$/);
      if (!m) return;
      const to = parseFloat(m[2].replace(/,/g, ''));
      const key = lab.trim();
      const had = prevVals.has(key);
      const from = had ? prevVals.get(key) : 0;
      prevVals.set(key, to);
      if (from === to) return;
      if (had) {
        val.classList.remove('flash-up', 'flash-down');
        void val.offsetWidth;                      // 重新觸發動畫
        val.classList.add(to > from ? 'flash-up' : 'flash-down');
      }
      if (level === 'full') animateNode(node, m[1], from, to, 0, m[3], node.nodeValue);
    });
  }

  // 每次首頁重繪完呼叫
  function afterRender() {
    enhanceStats(document.getElementById('cards-people'));
  }

  // ---------- 圖表 ----------
  // 折線圖面積填色:由上往下淡出的漸層
  function gradient(color) {
    if (level === 'off') return color + '22';
    return (ctx) => {
      const area = ctx.chart.chartArea;
      if (!area) return color + '22';
      const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, color + '66');
      g.addColorStop(1, color + '00');
      return g;
    };
  }
  const lineTension = () => level === 'off' ? 0.2 : 0.38;

  // 甜甜圈中央顯示總額
  function centerTextPlugin(text, sub) {
    return {
      id: 'centerText',
      afterDraw(chart) {
        const a = chart.chartArea;
        if (!a) return;
        const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
        const c = chart.ctx;
        const css = getComputedStyle(root);
        c.save();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = css.getPropertyValue('--text').trim() || '#000';
        c.font = '700 16px -apple-system, "Microsoft JhengHei", sans-serif';
        c.fillText(text, cx, cy - 7);
        c.fillStyle = css.getPropertyValue('--muted').trim() || '#888';
        c.font = '400 11px -apple-system, "Microsoft JhengHei", sans-serif';
        c.fillText(sub, cx, cy + 11);
        c.restore();
      }
    };
  }

  function init() {
    setLevel(getLevel());
    applyPrivacy();
    const b = document.getElementById('btn-privacy');
    if (b) b.onclick = togglePrivacy;
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.btn, .big-btn, .nav-btn, .chip, .icon-btn')) haptic(8);
    });
  }

  return { LEVELS, getLevel, setLevel, init, afterRender, gradient, lineTension, centerTextPlugin,
           isPrivate, applyPrivacy, togglePrivacy, haptic };
})();
