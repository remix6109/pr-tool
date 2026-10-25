/* 3D 持股小鎮 + 時光回放 — 每檔持股一棟大樓(高度 = 投入成本),配息時金幣飛進中央金庫。
 * three.js(js/three.min.js,約 600KB)只在打開這個視窗時才載入;視窗關掉就停止繪圖,不耗電。
 * 回放只用你的購買/股利記錄(沒有每天的歷史股價),所以大樓高度是「投入成本」,播到今天才顯示市值。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const T3 = {
    PLAY_SECONDS: 14,          // 從第一筆播到今天大約幾秒
    MAX_FLOORS_H: 10,          // 最高那棟的高度(場景單位)
    COLORS: ['#E8D5B5', '#C9D8C5', '#D6C7E0', '#F2C6B4', '#BFD3E6', '#E6DFA8', '#D9B8B8', '#B8D9D4', '#E0C9A6', '#C7C7E8'],
    s: null                    // 場景狀態(打開時建立)
  };

  // ---------- 資料:把購買/股利記錄排成時間軸 ----------
  function t3Events(person) {
    const ev = [];
    (STATE.data.purchases || []).forEach(r => {
      if (person && r.person !== person) return;
      const date = String(r.date || '').slice(0, 10), shares = Number(r.shares) || 0, amount = Number(r.amount) || 0;
      if (!date || !r.symbol || !shares) return;
      const sell = shares < 0 || amount < 0;
      ev.push({ date, type: sell ? 'sell' : 'buy', sym: String(r.symbol), shares: Math.abs(shares),
        money: Math.abs(amount) + (sell ? 0 : Number(r.fee) || 0), at: r.created_at ? Date.parse(r.created_at) || 0 : 0 });
    });
    (STATE.data.dividends || []).forEach(r => {
      if (person && r.person !== person) return;
      const date = String(r.date || '').slice(0, 10), total = Number(r.total) || 0;
      if (!date || !r.symbol || total <= 0) return;
      ev.push({ date, type: 'div', sym: String(r.symbol), money: total, at: 0 });
    });
    return ev.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at);
  }

  // 套用一筆事件到狀態(賣出依平均成本扣掉成本)
  function t3Apply(st, e) {
    const h = st.hold[e.sym] || (st.hold[e.sym] = { shares: 0, cost: 0, div: 0 });
    if (e.type === 'buy') { h.shares += e.shares; h.cost += e.money; st.invested += e.money; }
    else if (e.type === 'sell') {
      const sold = Math.min(e.shares, h.shares);
      if (h.shares > 0) h.cost -= h.cost * sold / h.shares;
      h.shares -= sold;
      if (h.shares <= 0) { h.shares = 0; h.cost = 0; }
    } else { h.div += e.money; st.div += e.money; }
  }
  const t3Empty = () => ({ hold: {}, invested: 0, div: 0 });

  // ---------- 場景素材 ----------
  function t3WindowTexture(wall) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 58, 64, 6);           // 樓層分隔線
    [[10, 16], [38, 16]].forEach(([x, y]) => {
      g.fillStyle = '#3B4F5C'; g.fillRect(x, y, 16, 24);
      g.fillStyle = 'rgba(255,236,170,.85)'; g.fillRect(x + 2, y + 2, 12, 20);
    });
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function t3Label(sym, name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.beginPath(); g.roundRect ? g.roundRect(8, 8, 240, 80, 18) : g.rect(8, 8, 240, 80); g.fill();
    g.fillStyle = '#2A3938'; g.textAlign = 'center';
    g.font = 'bold 38px system-ui, sans-serif'; g.fillText(sym, 128, 50);
    g.font = '22px system-ui, sans-serif'; g.fillStyle = '#5C6B6A'; g.fillText((name || '').slice(0, 10), 128, 78);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
    sp.scale.set(3.4, 1.28, 1);
    return sp;
  }

  // 固定亂數(每次打開樹的位置都一樣)
  function t3Rand(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  function t3Build(canvas, person) {
    const events = t3Events(person);
    const syms = [];
    const peak = {};                         // 每檔曾經到過的最高成本 → 決定排列順序與高度比例
    const run = t3Empty();
    events.forEach(e => {
      if (e.type === 'div' && !run.hold[e.sym]) return;
      t3Apply(run, e);
      if (!syms.includes(e.sym)) syms.push(e.sym);
      peak[e.sym] = Math.max(peak[e.sym] || 0, run.hold[e.sym].cost);
    });
    syms.sort((a, b) => peak[b] - peak[a]);
    const maxCost = Math.max(1, ...syms.map(s => peak[s]));
    const n = syms.length, R = Math.max(5.5, n * 1.15);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const scene = new THREE.Scene();
    const sky = new THREE.Color(dark ? '#1C2A33' : '#CFE6EE');
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, R * 3, R * 7);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(dark ? '#8FA6C0' : '#FFFFFF', '#6E7F5A', dark ? 0.55 : 0.85));
    const sun = new THREE.DirectionalLight('#FFF4E0', dark ? 0.55 : 0.9);
    sun.position.set(R * 1.2, R * 2.2, R * 0.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -R - 6, right: R + 6, top: R + 6, bottom: -R - 6, near: 1, far: R * 6 });
    scene.add(sun);

    const flat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9 }, extra || {}));
    // 海 + 島 + 廣場 + 環狀道路
    const sea = new THREE.Mesh(new THREE.CircleGeometry(R * 8, 48), flat(dark ? '#20404F' : '#8CC4D6'));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.4; scene.add(sea);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(R + 4.5, R + 5.5, 1.2, 28), flat(dark ? '#4E6B45' : '#9CC07A'));
    island.receiveShadow = true; scene.add(island);
    const TOP = 0.6;
    const road = new THREE.Mesh(new THREE.RingGeometry(R - 1.9, R - 1.2, 64), flat('#B9B2A6'));
    road.rotation.x = -Math.PI / 2; road.position.y = TOP + 0.01; road.receiveShadow = true; scene.add(road);
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.2, 24), flat('#D8D0C2'));
    plaza.position.y = TOP + 0.1; plaza.receiveShadow = true; scene.add(plaza);
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8), flat('#B08D3C', { metalness: 0.3 }));
    vault.position.y = TOP + 0.45; vault.castShadow = true; scene.add(vault);

    // 金幣堆(最多 360 枚,一枚代表固定金額)
    const MAXC = 360;
    const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12);
    const coinMat = new THREE.MeshStandardMaterial({ color: '#FFD447', metalness: 0.35, roughness: 0.3, emissive: '#B07800', emissiveIntensity: 0.45 });
    const pile = new THREE.InstancedMesh(coinGeo, coinMat, MAXC);
    pile.castShadow = true; pile.count = 0; scene.add(pile);
    const coinUnit = Math.max(50, run.div / 300);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < MAXC; i++) {
      const stack = Math.floor(i / 10), lv = i % 10;
      const a = stack * 2.4, r = stack === 0 ? 0 : 0.3 + 0.24 * Math.sqrt(stack);
      m4.makeTranslation(Math.cos(a) * r, TOP + 0.74 + lv * 0.075 - Math.min(0.3, r * 0.2), Math.sin(a) * r);
      pile.setMatrixAt(i, m4);
    }

    // 樹
    const rnd = t3Rand(n * 97 + 13);
    const treeGeo = new THREE.ConeGeometry(0.55, 1.5, 6), trunkGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.4, 5);
    const leaf = flat(dark ? '#3F6B4A' : '#5E9A5A'), bark = flat('#7A5A3A');
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = R + 1 + rnd() * 3;
      const t = new THREE.Mesh(treeGeo, leaf), k = new THREE.Mesh(trunkGeo, bark);
      const s = 0.7 + rnd() * 0.6;
      t.position.set(Math.cos(a) * r, TOP + 0.4 + 0.75 * s, Math.sin(a) * r); t.scale.setScalar(s); t.castShadow = true;
      k.position.set(t.position.x, TOP + 0.2, t.position.z);
      scene.add(t, k);
    }

    // 大樓
    const chg = townLatestChange();
    const symMap = {};
    (STATE.data.symbols || []).forEach(s => symMap[s.symbol] = s);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
    const blds = syms.map((sym, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2, g = new THREE.Group();
      g.position.set(Math.cos(a) * R, TOP, Math.sin(a) * R);
      g.rotation.y = -a + Math.PI / 2;
      const tex = t3WindowTexture(T3.COLORS[i % T3.COLORS.length]);
      const body = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      body.scale.set(1.7, 0.001, 1.7); body.castShadow = body.receiveShadow = true;
      const c = chg[sym] ? chg[sym].pct : null;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 1.95),
        flat(c === null ? '#9AA5A4' : c > 0 ? '#6FA34A' : c < 0 ? '#C8553D' : '#9AA5A4'));
      roof.castShadow = true;
      const label = t3Label(sym, (symMap[sym] || {}).name);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 2.2), flat('#CFC7B8'));
      base.position.y = 0.04; base.receiveShadow = true;
      g.add(base, body, roof, label);
      scene.add(g);
      body.userData.sym = sym;
      return { sym, g, body, roof, label, tex, cur: 0, target: 0, pop: 0 };
    });

    T3.s = {
      renderer, scene, camera, events, blds, pile, coinUnit, TOP, R, maxCost, person,
      start: events.length ? Date.parse(events[0].date) - 3 * 864e5 : Date.now() - 864e5,
      end: Date.parse(autodivYmd(new Date())),
      t: 0, idx: 0, st: t3Empty(), playing: false,
      cam: { theta: 0.6, phi: 1.05, dist: R * 4 }, lastTouch: 0,
      flying: [], coinGeo, coinMat, ticker: [], raf: 0, prev: 0
    };
    T3.s.t = T3.s.end;
    t3Seek(T3.s.end);
  }

  // ---------- 時間軸 ----------
  const t3Day = (ms) => new Date(ms).toISOString().slice(0, 10);

  // 直接跳到某天(不播特效)
  function t3Seek(ms) {
    const s = T3.s;
    s.t = ms; s.st = t3Empty(); s.idx = 0;
    const day = t3Day(ms);
    while (s.idx < s.events.length && s.events[s.idx].date <= day) t3Apply(s.st, s.events[s.idx++]);
    s.ticker = s.events.slice(Math.max(0, s.idx - 3), s.idx).map(t3TickerLine);
    t3SyncTargets(false);
    t3Hud();
  }

  // 播放時往前推進,途經的事件逐筆套用並播特效
  function t3Advance(dt) {
    const s = T3.s;
    s.t = Math.min(s.end, s.t + (s.end - s.start) / T3.PLAY_SECONDS * dt);
    const day = t3Day(s.t);
    let changed = false;
    while (s.idx < s.events.length && s.events[s.idx].date <= day) {
      const e = s.events[s.idx++];
      t3Apply(s.st, e);
      const b = s.blds.find(x => x.sym === e.sym);
      if (b && e.type === 'buy') b.pop = 1;
      if (b && e.type === 'div') t3SpawnCoins(b, e.money);
      s.ticker.push(t3TickerLine(e)); if (s.ticker.length > 3) s.ticker.shift();
      changed = true;
    }
    if (changed) t3SyncTargets(true);
    if (s.t >= s.end) t3SetPlaying(false);
    t3Hud();
  }

  function t3SyncTargets(animatePile) {
    const s = T3.s;
    s.blds.forEach(b => {
      const h = s.st.hold[b.sym];
      b.target = h && h.shares > 0 ? 0.6 + (h.cost / s.maxCost) * T3.MAX_FLOORS_H : 0;
    });
    const want = Math.min(360, Math.round(s.st.div / s.coinUnit));
    if (!animatePile) s.pile.count = want;
    s.pileWant = want;
    s.pile.instanceMatrix.needsUpdate = true;
  }

  function t3TickerLine(e) {
    const d = e.date.slice(2).replace(/-/g, '/');
    const sym = escapeHtml(e.sym);
    if (e.type === 'div') return `${d} 💰 <b>${sym}</b> 配息 <span class="town-num">+${fmt.money(e.money)}</span>`;
    return `${d} ${e.type === 'buy' ? '🏗️ 買進' : '📉 賣出'} <b>${sym}</b> ${fmt.money(e.shares)} 股`;
  }

  function t3Hud() {
    const s = T3.s;
    const atEnd = s.t >= s.end - 864e5;
    const held = Object.keys(s.st.hold).filter(k => s.st.hold[k].shares > 0);
    let value = 0;
    if (atEnd) {
      const symMap = {};
      (STATE.data.symbols || []).forEach(x => symMap[x.symbol] = x);
      held.forEach(k => { const p = Number((symMap[k] || {}).current_price) || 0; value += p > 0 ? p * s.st.hold[k].shares : s.st.hold[k].cost; });
    }
    const cost = held.reduce((a, k) => a + s.st.hold[k].cost, 0);
    $('#t3-date').textContent = t3Day(s.t).replace(/-/g, '/');
    $('#t3-stats').innerHTML =
      `持有 ${held.length} 檔・成本 <span class="town-num">${fmt.money(cost)}</span><br>` +
      `累積配息 <span class="town-num">${fmt.money(s.st.div)}</span>` +
      (atEnd ? `<br>今日市值 <span class="town-num">${fmt.money(value)}</span> <span class="town-num ${value >= cost ? 'gain' : 'loss'}">(${fmt.moneySigned(value - cost)})</span>` : '');
    $('#t3-ticker').innerHTML = s.ticker.slice().reverse().map(l => `<div>${l}</div>`).join('');
    const slider = $('#t3-slider');
    if (document.activeElement !== slider) slider.value = Math.round((s.t - s.start) / Math.max(1, s.end - s.start) * 1000);
  }

  // ---------- 金幣特效 ----------
  function t3SpawnCoins(b, money) {
    const s = T3.s;
    const k = Math.max(3, Math.min(10, Math.round(money / s.coinUnit)));
    const from = new THREE.Vector3();
    b.roof.getWorldPosition(from);
    for (let i = 0; i < k; i++) {
      const m = new THREE.Mesh(s.coinGeo, s.coinMat);
      m.position.copy(from);
      s.scene.add(m);
      s.flying.push({ m, from: from.clone(), to: new THREE.Vector3((Math.random() - 0.5) * 0.8, s.TOP + 1.2, (Math.random() - 0.5) * 0.8),
        t: -i * 0.07, dur: 1.1 + Math.random() * 0.3, peak: 2.5 + Math.random() * 1.5 });
    }
  }

  function t3Frame(now) {
    const s = T3.s;
    if (!s) return;
    if ($('#modal-town3d').classList.contains('hidden')) { t3Stop(); return; }
    const dt = Math.min(0.05, (now - (s.prev || now)) / 1000);
    s.prev = now;
    if (s.playing) t3Advance(dt);

    s.blds.forEach(b => {
      b.cur += (b.target - b.cur) * Math.min(1, dt * 5);
      const h = Math.max(0.001, b.cur);
      const wide = 1.7 * (1 + 0.18 * Math.sin(b.pop * Math.PI));
      b.pop = Math.max(0, b.pop - dt * 2.5);
      b.body.scale.set(wide, h, wide);
      b.tex.repeat.set(2, Math.max(1, Math.round(h / 0.75)));
      const vis = b.cur > 0.03;
      b.body.visible = b.roof.visible = b.label.visible = vis;
      b.roof.position.y = h + 0.11;
      b.label.position.y = h + 1.3;
    });
    // 金幣堆慢慢長到目標數量
    if (s.pileWant !== undefined && s.pile.count !== s.pileWant) {
      s.pile.count += Math.sign(s.pileWant - s.pile.count) * Math.max(1, Math.ceil(Math.abs(s.pileWant - s.pile.count) * dt * 4));
      if (Math.abs(s.pile.count - s.pileWant) < 1) s.pile.count = s.pileWant;
    }
    s.flying = s.flying.filter(c => {
      c.t += dt;
      const p = Math.max(0, c.t / c.dur);
      if (p >= 1) { s.scene.remove(c.m); return false; }
      c.m.position.lerpVectors(c.from, c.to, p);
      c.m.position.y += Math.sin(p * Math.PI) * c.peak;
      c.m.rotation.x += dt * 9; c.m.rotation.z += dt * 5;
      return true;
    });

    // 鏡頭:沒在操作時慢慢繞
    if (now - s.lastTouch > 3000) s.cam.theta += dt * 0.12;
    const { theta, phi } = s.cam;
    const dist = s.cam.dist * Math.max(1, 1.05 / s.camera.aspect);   // 手機直向畫面窄,鏡頭拉遠一點才裝得下
    s.camera.position.set(Math.cos(theta) * Math.sin(phi) * dist, Math.cos(phi) * dist + 1, Math.sin(theta) * Math.sin(phi) * dist);
    s.camera.lookAt(0, 3.5, 0);
    s.renderer.render(s.scene, s.camera);
    s.raf = requestAnimationFrame(t3Frame);
  }

  function t3Resize() {
    const s = T3.s;
    if (!s) return;
    const c = $('#t3-canvas'), w = c.clientWidth || 340, h = c.clientHeight || 400;
    s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }

  function t3SetPlaying(on) {
    const s = T3.s;
    if (on && s.t >= s.end) {                      // 播完再按 = 從頭開始
      t3Seek(s.start);
      s.blds.forEach(b => b.cur = 0);
      s.pile.count = 0;
    }
    s.playing = on;
    $('#t3-play').textContent = on ? '⏸ 暫停' : (s.t >= s.end ? '↺ 重新播放' : '▶ 播放');
  }

  // ---------- 操作:拖曳旋轉、雙指/滾輪縮放、點大樓看細節 ----------
  function t3BindControls(canvas) {
    const pts = new Map();
    let down = null, pinch = 0;
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    canvas.onpointerdown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, moved: 0 };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      T3.s.lastTouch = performance.now();
    };
    canvas.onpointermove = (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !T3.s) return;
      const cam = T3.s.cam, dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      T3.s.lastTouch = performance.now();
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        cam.theta += dx * 0.008;
        cam.phi = Math.max(0.35, Math.min(1.4, cam.phi - dy * 0.006));
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) cam.dist = Math.max(T3.s.R * 1.2, Math.min(T3.s.R * 6, cam.dist * pinch / d));
        pinch = d;
      }
    };
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (down && down.moved < 8 && pts.size === 0 && T3.s) {
        const r = canvas.getBoundingClientRect();
        v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        ray.setFromCamera(v2, T3.s.camera);
        const hit = ray.intersectObjects(T3.s.blds.filter(b => b.body.visible).map(b => b.body))[0];
        if (hit) t3ShowBuilding(hit.object.userData.sym);
      }
      down = null;
    };
    canvas.onpointerup = up;
    canvas.onpointercancel = up;
    canvas.onwheel = (e) => {
      e.preventDefault();
      const cam = T3.s.cam;
      cam.dist = Math.max(T3.s.R * 1.2, Math.min(T3.s.R * 6, cam.dist * (1 + e.deltaY * 0.001)));
      T3.s.lastTouch = performance.now();
    };
  }

  function t3ShowBuilding(sym) {
    const s = T3.s, h = s.st.hold[sym] || { shares: 0, cost: 0, div: 0 };
    const info = (STATE.data.symbols || []).find(x => x.symbol === sym) || {};
    const price = Number(info.current_price) || 0;
    const atEnd = s.t >= s.end - 864e5;
    $('#t3-readout').innerHTML = `<b>${escapeHtml(sym)}</b> ${escapeHtml(info.name || '')}・持有 ${fmt.money(h.shares)} 股・` +
      `成本 <span class="town-num">${fmt.money(h.cost)}</span>・累積配息 <span class="town-num">${fmt.money(h.div)}</span>` +
      (atEnd && price > 0 && h.shares > 0 ? `・市值 <span class="town-num">${fmt.money(price * h.shares)}</span>` : '');
  }

  // ---------- 開關 ----------
  let _threeLoading = null;
  function t3LoadThree() {
    if (window.THREE) return Promise.resolve();
    if (_threeLoading) return _threeLoading;
    _threeLoading = new Promise((ok, fail) => {
      const sc = document.createElement('script');
      sc.src = 'js/three.min.js';
      sc.onload = ok;
      sc.onerror = () => { _threeLoading = null; fail(new Error('3D 引擎載入失敗')); };
      document.head.appendChild(sc);
    });
    return _threeLoading;
  }

  function t3Stop() {
    const s = T3.s;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    s.renderer.dispose();
    s.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    T3.s = null;
    window.removeEventListener('resize', t3Resize);
  }

  async function openTown3d() {
    if (!STATE.data) return;
    const person = STATE.defaultPerson;
    $('#t3-title').textContent = getPersonLabel(person) + '的 3D 小鎮';
    $('#t3-readout').textContent = '點大樓看細節;拖曳旋轉、雙指或滾輪縮放。';
    $('#t3-loading').classList.remove('hidden');
    openModal('modal-town3d');
    try {
      await t3LoadThree();
    } catch (e) {
      $('#t3-loading').textContent = e.message + ',請確認網路後再試一次';
      return;
    }
    $('#t3-loading').classList.add('hidden');
    t3Stop();
    const canvas = $('#t3-canvas');
    t3Build(canvas, person);
    if (!T3.s.events.length) { $('#t3-readout').textContent = '目前沒有購買記錄'; }
    t3Resize();
    window.addEventListener('resize', t3Resize);
    t3BindControls(canvas);
    $('#t3-play').onclick = () => t3SetPlaying(!T3.s.playing);
    $('#t3-slider').oninput = (e) => {
      const s = T3.s;
      t3SetPlaying(false);
      t3Seek(s.start + (s.end - s.start) * e.target.value / 1000);
      $('#t3-play').textContent = s.t >= s.end ? '↺ 重新播放' : '▶ 播放';
    };
    t3SetPlaying(false);
    $('#t3-play').textContent = '▶ 從頭播放';
    $('#t3-play').onclick = () => { if (T3.s.t >= T3.s.end) t3SetPlaying(true); else t3SetPlaying(!T3.s.playing); $('#t3-play').onclick = () => t3SetPlaying(!T3.s.playing); };
    T3.s.raf = requestAnimationFrame(t3Frame);
  }

  function bindTown3d() {
    const b = $('#btn-town3d');
    if (b) b.onclick = (e) => { e.stopPropagation(); openTown3d(); };
  }
