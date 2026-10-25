/* 3D 持股小鎮 — 嵌在首頁「持股小鎮」卡片裡(取代平面圖;不支援 WebGL 時退回平面圖)。
 * 每檔持股一棟大樓,一筆買進 = 一層樓(越早買越下面,顏色依年份由淺到深),賣出從最上面拆掉。
 * 中間的金幣堆 = 累積配息。卡片展開時大樓依買進順序一層層長出來(只播一次,不用按鈕)。
 * three.js(js/three.min.js)第一次展開才載入;卡片收起、換頁或 APP 在背景時停止繪圖。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const TOWN3D = {
    s: null,              // 場景(renderer 常駐,資料變了只重建內容)
    failed: false,
    loading: null,
    sig: '',
    grow: true,           // 下次重建時播「長高」動畫
    PLAY_MIN: 5, PLAY_MAX: 9, // 時間軸播放秒數(依投資期間長短)
    LEAD: 1.4,            // 開頭留給第一個特效飛/走的時間
    FLY: 0.75,            // 買進:建材箱飛到大樓的秒數
    WALK: 1.3,            // 配息:小人走到中央的秒數
    MAX_H: 9,             // 最高那棟的高度
    MIN_FLOOR: 0.16,      // 金額很小的那層至少這麼厚,才點得到
    YEAR_COLORS: ['#F3E6CC', '#EACB9C', '#DDAA6E', '#C98A52', '#B06C3E', '#8E5533']
  };

  function town3dLoadThree() {
    if (window.THREE) return Promise.resolve();
    if (TOWN3D.loading) return TOWN3D.loading;
    TOWN3D.loading = new Promise((ok, fail) => {
      const sc = document.createElement('script');
      sc.src = 'js/three.min.js';
      sc.onload = ok;
      sc.onerror = () => { TOWN3D.loading = null; fail(new Error('3D 引擎載入失敗')); };
      document.head.appendChild(sc);
    });
    return TOWN3D.loading;
  }

  // ---------- 資料:每檔的樓層(依時間重播買賣) ----------
  function town3dFloors(person) {
    const rows = (STATE.data.purchases || []).filter(r => r.person === person && r.symbol && Number(r.shares))
      .slice().sort((a, b) => {
        const da = String(a.date || '').slice(0, 10), db = String(b.date || '').slice(0, 10);
        if (da !== db) return da < db ? -1 : 1;
        return (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
      });
    const bySym = {};
    rows.forEach(r => {
      const sym = String(r.symbol), shares = Number(r.shares) || 0, amount = Number(r.amount) || 0;
      const floors = bySym[sym] || (bySym[sym] = []);
      if (shares > 0 && amount >= 0) {
        floors.push({ date: String(r.date || '').slice(0, 10), shares, money: amount + (Number(r.fee) || 0) });
      } else {
        // 賣出:從最上面的樓層開始拆(只是畫面呈現;成本計算仍以 portfolio.js 為準)
        let left = Math.abs(shares);
        while (left > 0 && floors.length) {
          const top = floors[floors.length - 1];
          if (top.shares <= left) { left -= top.shares; floors.pop(); }
          else { top.money *= (top.shares - left) / top.shares; top.shares -= left; left = 0; }
        }
      }
    });
    Object.keys(bySym).forEach(k => { if (!bySym[k].length) delete bySym[k]; });
    return bySym;
  }

  // ---------- 素材 ----------
  function town3dWindowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 64, 64);
    [[9, 14], [37, 14]].forEach(([x, y]) => {
      g.fillStyle = '#5A6B73'; g.fillRect(x, y, 18, 30);
      g.fillStyle = '#FFF2C4'; g.fillRect(x + 2, y + 2, 14, 26);
    });
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function town3dLabel() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 104;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(2.9, 1.18, 1);
    sp.renderOrder = 10;
    sp.draw = (title, sub, subColor) => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 104);
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.beginPath(); g.roundRect ? g.roundRect(6, 6, 244, 92, 20) : g.rect(6, 6, 244, 92); g.fill();
      g.textAlign = 'center';
      g.fillStyle = '#2A3938'; g.font = 'bold 40px system-ui, sans-serif'; g.fillText(title, 128, 50);
      g.fillStyle = subColor || '#5C6B6A'; g.font = '26px system-ui, sans-serif'; g.fillText(sub, 128, 84);
      tex.needsUpdate = true;
    };
    return sp;
  }

  function town3dInit(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#6E7F5A', 0.8);
    const sun = new THREE.DirectionalLight('#FFF4E0', 0.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(hemi, sun, camera);
    const content = new THREE.Group();
    scene.add(content);
    TOWN3D.s = {
      renderer, scene, camera, sun, hemi, content, winTex: town3dWindowTex(),
      cam: { theta: 0.9, phi: 1.0 }, R: 5, raf: 0, prev: 0, t: 0, lastTouch: 0,
      floors: [], pile: null, pileWant: 0, growT: 99, picks: [], fx: [], labels: [], bldg: {}
    };
    town3dBindControls(canvas);
  }

  // 依資料重建小鎮內容(renderer 保留)
  function town3dBuild(person, items) {
    const s = TOWN3D.s;
    if (s.deco && s.deco.weather) s.camera.remove(s.deco.weather.grp);
    s.content.children.slice().forEach(o => {
      s.content.remove(o);
      o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material && x.material !== s.sharedMat) { if (x.material.map && x.material.map !== s.winTex) x.material.map.dispose(); x.material.dispose && x.material.dispose(); } });
    });
    const floorsBy = town3dFloors(person);
    const order = items.map(it => it.sym).filter(sym => floorsBy[sym]);
    Object.keys(floorsBy).forEach(sym => { if (!order.includes(sym)) order.push(sym); });
    const n = order.length, R = Math.max(4.6, n * 0.95);
    s.R = R;
    const flat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9 }, extra || {}));

    // 島、廣場、樹
    const dark = document.documentElement.dataset.theme === 'dark';
    const sky = new THREE.Color(dark ? '#22323A' : '#D3E8EF');
    s.scene.background = sky;
    s.scene.fog = new THREE.Fog(sky, R * 4, R * 9);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(R * 9, 40), flat(dark ? '#29495A' : '#9CCADA'));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.35; s.content.add(sea);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(R + 3, R + 3.8, 0.9, 26), flat(dark ? '#55744B' : '#8DB86E'));
    island.position.y = 0.0; island.receiveShadow = true; s.content.add(island);
    const TOP = 0.45;
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.12, 22), flat('#DCD3C3'));
    plaza.position.y = TOP + 0.06; plaza.receiveShadow = true; s.content.add(plaza);
    let seed = n * 31 + 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const treeGeo = new THREE.ConeGeometry(0.45, 1.2, 6), leaf = flat(dark ? '#3F6B4A' : '#5E9A5A');
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, r = R + 1.1 + rnd() * 1.7, k = 0.7 + rnd() * 0.5;
      const t = new THREE.Mesh(treeGeo, leaf);
      t.position.set(Math.cos(a) * r, TOP + 0.6 * k, Math.sin(a) * r); t.scale.setScalar(k); t.castShadow = true;
      s.content.add(t);
    }

    // 樓層
    const years = [...new Set(Object.values(floorsBy).flat().map(f => f.date.slice(0, 4)))].sort();
    // 越早越淺;年份少時把色階拉開,才分得出來
    const yearColor = (y) => { const P = TOWN3D.YEAR_COLORS, i = years.indexOf(y); return P[years.length < 2 ? 2 : Math.round(i * (P.length - 1) / (years.length - 1))]; };
    const totals = order.map(sym => floorsBy[sym].reduce((a, f) => a + f.money, 0));
    const unit = Math.max(1, ...totals) / TOWN3D.MAX_H;
    const allFloors = [];
    s.picks = [];
    s.labels = [];
    s.bldg = {};
    s.fx = [];
    s.TOP = TOP;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const slabGeo = new THREE.BoxGeometry(1.72, 0.07, 1.72), slabMat = flat('#7D6A55');
    const chgColor = (it) => {
      if (!it) return '#9AA5A4';
      if (TOWN.mode === 'chg') return it.chg === null ? '#9AA5A4' : it.chg > 0 ? '#3E9B54' : it.chg < 0 ? '#D2533F' : '#9AA5A4';
      return !it.yld ? '#9AA5A4' : it.yld >= 6 ? '#3F7373' : it.yld >= 3 ? '#6E9AA0' : '#9AA5A4';
    };
    order.forEach((sym, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * R, TOP, Math.sin(a) * R);
      g.rotation.y = -a + Math.PI / 2;
      s.content.add(g);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 2), flat('#CFC7B8'));
      base.position.y = 0.04; base.receiveShadow = true; g.add(base);
      let y = 0.08;
      floorsBy[sym].forEach((f, k) => {
        const h = Math.max(TOWN3D.MIN_FLOOR, f.money / unit);
        const tex = s.winTex.clone(); tex.needsUpdate = true;
        tex.repeat.set(2, Math.max(1, Math.round(h / 0.55)));
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: yearColor(f.date.slice(0, 4)), map: tex, roughness: 0.85 }));
        m.scale.set(1.6, Math.max(0.001, h - 0.035), 1.6);
        m.position.y = y;
        m.castShadow = m.receiveShadow = true;
        m.userData = { kind: 'floor', sym, floor: k + 1, total: floorsBy[sym].length, f };
        g.add(m);
        // 每層上緣一片深色樓板,層與層才分得出來
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.castShadow = true;
        g.add(slab);
        allFloors.push({ m, slab, h: h - 0.035, date: f.date, sym, f });
        s.picks.push(m);
        y += h;
      });
      const it = items.find(x => x.sym === sym);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.8), flat(chgColor(it)));
      roof.position.y = y + 0.08; roof.castShadow = true; g.add(roof);
      const label = town3dLabel();
      label.final = it ? fmt.money(it.value) : '';
      label.draw(sym, TOWN3D.grow ? '' : label.final, '#5C6B6A');   // 播放中只顯示代號,播完才顯示今天市值
      s.labels.push({ label, sym });
      label.position.y = y + 1.05;
      g.add(label);
      g.userData = { roof, label, top: y };
      s.bldg[sym] = g;
    });
    // 時間軸:從第一筆買進到今天,每層在實際買進的那天長出來、配息在入帳那天落進金幣堆
    allFloors.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const divRows = (STATE.data.dividends || []).filter(r => r.person === person && Number(r.total) > 0)
      .map(r => ({ date: String(r.date || '').slice(0, 10), money: Number(r.total), sym: String(r.symbol || '') }))
      .filter(r => r.date).sort((a, b) => a.date < b.date ? -1 : 1);
    const t0 = Date.parse((allFloors[0] || divRows[0] || { date: autodivYmd(new Date()) }).date);
    const t1 = Math.max(t0 + 864e5, Date.parse(autodivYmd(new Date())));
    const days = (t1 - t0) / 864e5;
    s.dur = Math.max(TOWN3D.PLAY_MIN, Math.min(TOWN3D.PLAY_MAX, days / 70));
    s.t0 = t0; s.t1 = t1;
    const atOf = (date) => TOWN3D.LEAD + (Date.parse(date) - t0) / (t1 - t0) * s.dur * 0.96;
    allFloors.forEach(x => { x.at = atOf(x.date); });
    divRows.forEach(d => { d.at = atOf(d.date); });
    s.floors = allFloors;
    s.divRows = divRows;
    s.events = allFloors.map(x => ({ at: x.at, html: `${x.date.replace(/-/g, '/')} 🏗️ 買進 <b>${escapeHtml(x.sym)}</b> ${fmt.money(x.f.shares)} 股` }))
      .concat(divRows.map(d => ({ at: d.at, html: `${d.date.replace(/-/g, '/')} 💰 <b>${escapeHtml(d.sym)}</b> 配息 <span class="town-num">+${fmt.money(d.money)}</span>` })))
      .sort((a, b) => a.at - b.at);

    // 金幣堆(累積配息)
    const div = (STATE.data.dividends || []).filter(r => r.person === person).reduce((a, r) => a + (Number(r.total) || 0), 0);
    const MAXC = 260;
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.065, 12);
    const coinMat = new THREE.MeshStandardMaterial({ color: '#FFD447', metalness: 0.35, roughness: 0.3, emissive: '#B07800', emissiveIntensity: 0.4 });
    const pile = new THREE.InstancedMesh(coinGeo, coinMat, MAXC);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < MAXC; i++) {
      const stack = Math.floor(i / 9), lv = i % 9;
      const a = stack * 2.4, r = stack === 0 ? 0 : 0.26 + 0.22 * Math.sqrt(stack);
      m4.makeTranslation(Math.cos(a) * r, TOP + 0.15 + lv * 0.068 + Math.max(0, 0.35 - r * 0.25), Math.sin(a) * r);
      pile.setMatrixAt(i, m4);
    }
    pile.castShadow = true;
    pile.userData = { kind: 'coins', total: div };
    s.content.add(pile);
    s.pile = pile;
    s.pileWant = div > 0 ? Math.min(MAXC, Math.max(4, Math.round(div / 1000))) : 0;   // 一枚約 1,000 元
    s.picks.push(pile);
    s.div = div;
    s.years = years;
    s.yearColor = yearColor;

    Object.assign(s.sun.position, { x: R * 1.3, y: R * 2.4, z: R * 0.9 });
    Object.assign(s.sun.shadow.camera, { left: -R - 4, right: R + 4, top: R + 4, bottom: -R - 4, near: 1, far: R * 7 });
    s.sun.shadow.camera.updateProjectionMatrix();

    town3dDecorate(person, items);
    s.lastEv = -1; s.lastDay = ''; s.lastYear = '';
    const finalCost = allFloors.reduce((a, x) => a + x.f.money, 0);
    s.msStep = finalCost >= 1e6 ? 5e5 : finalCost >= 2e5 ? 1e5 : 5e4;
    s.msNext = s.msStep;
    if (TOWN3D.grow) { s.growT = 0; TOWN3D.grow = false; s.playing = true; } else { s.growT = 99; s.playing = false; }
    town3dDecoShow(!s.playing);
    town3dApplyGrow(s.growT);
  }

  // 長高動畫:t 秒時每層的高度(ease-out),樓頂和看板跟著最上面那層
  function town3dApplyGrow(t) {
    const s = TOWN3D.s;
    const tops = new Map();
    s.floors.forEach(x => {
      const p = Math.max(0, Math.min(1, (t - x.at) / 0.35));
      const e = 1 - Math.pow(1 - p, 3);
      x.m.scale.y = Math.max(0.001, x.h * e);
      x.m.visible = x.slab.visible = p > 0;
      x.slab.position.y = x.m.position.y + x.m.scale.y;
      const g = x.m.parent;
      const topY = x.m.position.y + x.m.scale.y + 0.035 * e;
      if (p > 0) tops.set(g, Math.max(tops.get(g) || 0.08, topY));
      else if (!tops.has(g)) tops.set(g, 0.08);
    });
    tops.forEach((top, g) => {
      g.userData.roof.position.y = top + 0.08;
      g.userData.label.position.y = top + 1.05 + (g.userData.labelUp || 0);
      g.userData.roof.visible = top > 0.1;
      g.userData.label.visible = top > 0.1;
    });
    let cum = 0;
    s.divRows.forEach(d => { if (d.at <= t) cum += d.money; });
    s.pile.count = s.div > 0 ? Math.round(s.pileWant * Math.min(1, cum / s.div)) : 0;
    if (!s.playing) return;
    // 播放中:左上角日期和累計數字跟著跑,下方顯示剛發生的事
    town3dSpawnFx(t);
    const day = autodivYmd(new Date(s.t0 + Math.max(0, Math.min(1, (t - TOWN3D.LEAD) / (s.dur * 0.96))) * (s.t1 - s.t0)));
    if (day !== s.lastDay) {
      s.lastDay = day;
      const cost = s.floors.reduce((a, x) => a + (x.at <= t ? x.f.money : 0), 0);
      if (cost >= s.msNext) {
        let hit = s.msNext;
        while (cost >= s.msNext) { hit = s.msNext; s.msNext += s.msStep; }
        town3dBanner(`🎉 投入突破 <span class="town-num">${hit / 1e4} 萬</span>!`, 'ms');
        town3dFirework(t, 0); town3dFirework(t + 0.25, 1);
      }
      const yr = day.slice(0, 4);
      if (s.lastYear && yr !== s.lastYear && t > TOWN3D.LEAD) town3dBanner(yr, 'year');
      s.lastYear = yr;
      $('#town3d-hud').innerHTML = `<b class="town3d-date">${day.replace(/-/g, '/')}</b><br>` +
        `投入成本 <span class="town-num">${fmt.money(cost)}</span><br>累積配息 <span class="town-num">${fmt.money(cum)}</span>`;
    }
    let ev = -1;
    s.events.forEach((e, i) => { if (e.at <= t) ev = i; });
    if (ev !== s.lastEv) {
      s.lastEv = ev;
      $('#town-readout').innerHTML = ev < 0 ? '' : s.events.slice(Math.max(0, ev - 1), ev + 1).reverse()
        .map((e, i) => `<div${i ? ' class="muted"' : ''}>${e.html}</div>`).join('') + '<div class="muted small">點畫面直接跳到今天</div>';
    }
    if (t >= TOWN3D.LEAD + s.dur + 0.4 && !s.fx.length) town3dFinish();
  }

  // ---------- 特效:買進丟建材箱、配息小人搬金幣 ----------
  function town3dFxParts() {
    const s = TOWN3D.s;
    if (s.fxParts) return s.fxParts;
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.8 }, extra || {}));
    s.fxParts = {
      crateGeo: new THREE.BoxGeometry(0.5, 0.5, 0.5), crateMat: std('#C98F52'), bandGeo: new THREE.BoxGeometry(0.52, 0.1, 0.52), bandMat: std('#7A5432'),
      bodyGeo: new THREE.CylinderGeometry(0.12, 0.15, 0.4, 8), bodyMat: std('#3F7373'),
      headGeo: new THREE.SphereGeometry(0.13, 10, 8), headMat: std('#F2D2B0'),
      coinGeo: new THREE.CylinderGeometry(0.2, 0.2, 0.07, 14), coinMat: new THREE.MeshStandardMaterial({ color: '#FFD447', metalness: 0.35, roughness: 0.3, emissive: '#B07800', emissiveIntensity: 0.5 })
    };
    return s.fxParts;
  }

  function town3dSpawnFx(t) {
    const s = TOWN3D.s;
    s.floors.forEach(x => { if (!x.fx && t >= x.at - TOWN3D.FLY) { x.fx = true; town3dCrate(x, t); } });
    s.divRows.forEach(d => { if (!d.fx && t >= d.at - TOWN3D.WALK) { d.fx = true; town3dWalker(d, t); } });
  }

  // 建材箱:從鏡頭這一側拋向大樓,落在新樓層的位置
  function town3dCrate(x, t) {
    const s = TOWN3D.s, P = town3dFxParts();
    const box = new THREE.Group();
    box.add(new THREE.Mesh(P.crateGeo, P.crateMat), new THREE.Mesh(P.bandGeo, P.bandMat));
    box.children.forEach(m => { m.castShadow = true; });
    const g = x.m.parent;
    const to = new THREE.Vector3(g.position.x, s.TOP + x.m.position.y + x.h + 0.3, g.position.z);
    const cam = s.camera.position.clone(); cam.y = 0;
    const from = cam.setLength(Math.min(cam.length() * 0.55, s.R + 3)); from.y = 2.5;
    s.content.add(box);
    s.fx.push({ obj: box, start: t, dur: TOWN3D.FLY, update(p) {
      box.position.lerpVectors(from, to, p);
      box.position.y += Math.sin(p * Math.PI) * 2.6;
      box.rotation.set(p * 5, p * 3, 0);
      box.scale.setScalar(p > 0.9 ? 1 - (p - 0.9) * 8 : 1);
    } });
  }

  // 配息小人:從那檔的大樓走到中央金幣堆,頭上頂著金幣
  function town3dWalker(d, t) {
    const s = TOWN3D.s, P = town3dFxParts();
    const man = new THREE.Group();
    const body = new THREE.Mesh(P.bodyGeo, P.bodyMat); body.position.y = 0.22;
    const head = new THREE.Mesh(P.headGeo, P.headMat); head.position.y = 0.55;
    const coin = new THREE.Mesh(P.coinGeo, P.coinMat); coin.position.y = 0.76;
    [body, head, coin].forEach(m => { m.castShadow = true; man.add(m); });
    const g = s.bldg[d.sym];
    const dir = g ? new THREE.Vector3(g.position.x, 0, g.position.z) : new THREE.Vector3(s.R + 1.5, 0, 0);
    const from = dir.clone().setLength(Math.max(1.8, dir.length() - 1.25));
    const to = dir.clone().setLength(1.35);
    from.y = to.y = s.TOP + 0.05;
    man.position.copy(from);
    man.lookAt(to.x, from.y, to.z);
    s.content.add(man);
    s.fx.push({ obj: man, start: t, dur: TOWN3D.WALK, update(p) {
      man.position.lerpVectors(from, to, p);
      man.position.y = from.y + Math.abs(Math.sin(p * Math.PI * 7)) * 0.08;   // 走路上下晃
      coin.rotation.y = p * 12;
      man.scale.setScalar(1.7 * (p > 0.92 ? 1 - (p - 0.92) * 10 : 1));   // 放大一點,遠看才看得到
    } });
  }

  function town3dUpdateFx() {
    const s = TOWN3D.s;
    s.fx = s.fx.filter(e => {
      const p = (s.growT - e.start) / e.dur;
      if (p >= 1 || !s.playing) { s.content.remove(e.obj); return false; }
      e.update(Math.max(0, p));
      return true;
    });
  }

  // 播完(或點畫面略過):停在今天,顯示總市值與說明
  function town3dFinish() {
    const s = TOWN3D.s;
    s.playing = false;
    s.growT = 99;
    town3dUpdateFx();   // 清掉還在飛/走的特效
    s.labels.forEach(x => x.label.draw(x.sym, x.label.final, '#5C6B6A'));
    town3dApplyGrow(99);
    town3dDecoShow(true);
    $('#town3d-hud').innerHTML = (s.finalHud || '') + (s.weatherHtml || '');
    town3dShow(null);
  }

  // ---------- 加分效果:煙火、大字、天氣、除息旗子、待確認小人、賺賠光環 ----------
  function town3dBanner(html, cls) {
    const b = $('#town3d-banner');
    if (!b) return;
    b.className = 'town3d-banner ' + cls;
    b.innerHTML = html;
    void b.offsetWidth;            // 重新觸發動畫
    b.classList.add('show');
  }

  // 煙火:一團彩色光點炸開後往下掉、淡出
  function town3dFirework(t, k) {
    const s = TOWN3D.s, N = 180;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = [];
    const c0 = new THREE.Vector3((k ? 1 : -1) * s.R * 0.45, TOWN3D.MAX_H * 0.9 + k, (k ? -1 : 1) * s.R * 0.25);
    const palette = ['#FFD447', '#FF6B6B', '#6BCBFF', '#9BE36B', '#FF9FF3'].map(c => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2.2 + Math.random() * 1.6);
      vel.push(v);
      const c = palette[(i + k) % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    s.content.add(pts);
    s.fx.push({ obj: pts, start: t, dur: 1.6, update(p) {
      const tt = p * 1.6;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = c0.x + vel[i].x * tt;
        pos[i * 3 + 1] = c0.y + vel[i].y * tt - 1.6 * tt * tt;
        pos[i * 3 + 2] = c0.z + vel[i].z * tt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = p < 0.08 ? 0 : 1 - p;
    } });
  }

  function town3dDecorate(person, items) {
    const s = TOWN3D.s, P = town3dFxParts();
    const deco = { flags: [], halos: [], waiters: [], roofs: [], weather: null, t: 0 };
    const flat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.8 }, extra || {}));
    items.forEach(it => {
      const g = s.bldg[it.sym];
      if (!g) return;
      const top = g.userData.top;
      // 賺賠光環:綠 = 賺、紅 = 賠,越亮報酬率越高(和屋頂的「今日漲跌」不同,這是買進到現在的總報酬)
      if (it.cost > 0) {
        const ret = (it.value - it.cost) / it.cost;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 36),
          new THREE.MeshBasicMaterial({ color: ret >= 0 ? '#45D16A' : '#FF5A47', transparent: true, opacity: Math.min(0.95, 0.3 + Math.abs(ret) * 2.2), depthWrite: false }));
        halo.rotation.x = Math.PI / 2;
        halo.position.y = top + 0.55;
        g.add(halo);
        deco.halos.push({ m: halo, base: top + 0.55 });
      }
      // 30 天內除息:屋頂插旗、屋頂微微發光
      if (it.nextEx) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), flat('#6B5B4B'));
        pole.position.set(0.7, top + 0.75, 0.7);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), flat('#E8A23A', { side: THREE.DoubleSide, emissive: '#7A4A00', emissiveIntensity: 0.4 }));
        flag.geometry.translate(0.5, 0, 0);
        flag.position.set(0.7, top + 1.1, 0.7);
        flag.userData = { kind: 'flag', sym: it.sym, date: it.nextEx };
        g.add(pole, flag);
        s.picks.push(flag);
        deco.flags.push(flag, pole);
        deco.roofs.push(g.userData.roof);
        g.userData.labelUp = 0.9;                    // 看板往上移,才不會擋住旗子
        g.userData.label.position.y = top + 1.05 + 0.9;
      }
    });
    // 待確認配息:小人頂著金幣站在大樓門口等,點他就打開股利表單
    computePendingDividends().forEach((it, i) => {
      const g = s.bldg[it.symbol];
      if (!g) return;
      const man = new THREE.Group();
      const body = new THREE.Mesh(P.bodyGeo, P.bodyMat); body.position.y = 0.22;
      const head = new THREE.Mesh(P.headGeo, P.headMat); head.position.y = 0.55;
      const coin = new THREE.Mesh(P.coinGeo, P.coinMat); coin.position.y = 0.76;
      [body, head, coin].forEach(m => { m.castShadow = true; m.userData = { kind: 'pending', it }; man.add(m); s.picks.push(m); });
      const dir = new THREE.Vector3(g.position.x, 0, g.position.z);
      const at = dir.clone().setLength(Math.max(1.8, dir.length() - 1.3));
      man.position.set(at.x, s.TOP + 0.05, at.z);
      man.lookAt(0, s.TOP + 0.05, 0);
      man.scale.setScalar(1.7);
      const tag = town3dLabel();
      tag.draw('待確認', fmt.money(it.net), '#B07800');
      tag.scale.set(1.5, 0.61, 1);
      tag.position.y = 1.25;
      man.add(tag);
      s.content.add(man);
      deco.waiters.push({ man, coin, k: i });
    });
    deco.weather = town3dWeather(items);
    s.deco = deco;
  }

  // 今日天氣:依持股市值加權的今日漲跌 → 晴(漲)、多雲(小跌)、小雨(跌 1% 以上)
  function town3dWeather(items) {
    const s = TOWN3D.s;
    let wv = 0, w = 0;
    items.forEach(it => { if (it.chg !== null && it.chg !== undefined) { wv += it.value * it.chg; w += it.value; } });
    const chg = w > 0 ? wv / w : null;
    const kind = chg === null ? null : chg >= 0 ? 'sun' : chg > -1 ? 'cloud' : 'rain';
    const grp = new THREE.Group();
    s.camera.add(grp);
    const out = { kind, chg, grp, clouds: [], rain: null, sky0: s.scene.background.clone() };
    if (kind === 'sun') {
      const sunM = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), new THREE.MeshBasicMaterial({ color: '#FFE27A', fog: false }));
      sunM.position.set(7.5, 5.2, -24);
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.6, 32), new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.35, fog: false }));
      glow.position.copy(sunM.position);
      grp.add(sunM, glow);
      out.glow = glow;
    }
    if (kind === 'cloud' || kind === 'rain') {
      const cm = new THREE.MeshStandardMaterial({ color: kind === 'rain' ? '#8E9AA3' : '#F4F6F8', flatShading: true, roughness: 1, fog: false });
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Group();
        [[0, 0, 1.2], [1.1, -0.2, 0.9], [-1.1, -0.25, 0.85], [0.4, 0.5, 0.8]].forEach(([x, y, r]) => {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), cm); b.position.set(x, y, 0); c.add(b);
        });
        c.position.set(-12 + i * 8, 5 + (i % 2) * 1.2, -24 - (i % 3) * 2);
        grp.add(c);
        out.clouds.push(c);
      }
    }
    if (kind === 'rain') {
      const N = 500, pos = new Float32Array(N * 3), R = s.R + 3;
      for (let i = 0; i < N; i++) pos.set([(Math.random() * 2 - 1) * R, Math.random() * 12, (Math.random() * 2 - 1) * R], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#BFD4E6', size: 0.09, transparent: true, opacity: 0.8 }));
      s.content.add(out.rain);
    }
    return out;
  }

  // 播放中先藏起來,播完(停在今天)才顯示
  function town3dDecoShow(on) {
    const s = TOWN3D.s, d = s.deco;
    if (!d) return;
    d.on = on;
    d.halos.forEach(h => { h.m.visible = on; });
    d.flags.forEach(m => { m.visible = on; });
    d.waiters.forEach(w => { w.man.visible = on; });
    const W = d.weather;
    W.grp.visible = on;
    if (W.rain) W.rain.visible = on;
    const dark = document.documentElement.dataset.theme === 'dark';
    const sky = W.sky0.clone();
    if (on && W.kind === 'cloud') sky.lerp(new THREE.Color('#AEB8BF'), 0.5);
    if (on && W.kind === 'rain') sky.lerp(new THREE.Color('#7D8A93'), 0.65);
    s.scene.background = sky;
    s.scene.fog.color = sky;
    const k = !on || !W.kind ? 1 : W.kind === 'sun' ? 1.15 : W.kind === 'cloud' ? 0.75 : 0.55;
    s.sun.intensity = (dark ? 0.75 : 0.9) * k;
    s.hemi.intensity = 0.8 * (0.6 + 0.4 * k);
    if (on && W.chg !== null) {
      const icon = W.kind === 'sun' ? '☀️' : W.kind === 'cloud' ? '⛅' : '🌧️';
      s.weatherHtml = `<br>${icon} 今日 <span class="${W.chg >= 0 ? 'gain' : 'loss'}">${W.chg >= 0 ? '+' : ''}${W.chg.toFixed(2)}%</span>`;
    } else s.weatherHtml = '';
    if (on && s.finalHud) $('#town3d-hud').innerHTML = s.finalHud + s.weatherHtml;
  }

  function town3dDecoTick(dt) {
    const s = TOWN3D.s, d = s.deco;
    if (!d.on) return;
    d.t += dt;
    d.halos.forEach((h, i) => { h.m.rotation.z += dt * 0.8; h.m.position.y = h.base + Math.sin(d.t * 2 + i) * 0.08; });
    d.flags.forEach(m => { if (m.userData.kind === 'flag') m.rotation.y = Math.sin(d.t * 3) * 0.35; });
    d.roofs.forEach(r => { r.material.emissive.set('#E8A23A'); r.material.emissiveIntensity = 0.25 + Math.sin(d.t * 3) * 0.2; });
    d.waiters.forEach(w => { w.man.position.y = s.TOP + 0.05 + Math.abs(Math.sin(d.t * 4 + w.k)) * 0.1; w.coin.rotation.y += dt * 3; });
    const W = d.weather;
    if (W.glow) W.glow.rotation.z += dt * 0.3;
    W.clouds.forEach((c, i) => { c.position.x += dt * (0.4 + i * 0.1); if (c.position.x > 16) c.position.x = -16; });
    if (W.rain) {
      const p = W.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 9; if (y < 0) y += 12; p.setY(i, y); }
      p.needsUpdate = true;
    }
  }

  // ---------- 繪圖迴圈 ----------
  function town3dVisible() {
    const card = $('#card-town');
    return !!(TOWN3D.s && card && !card.classList.contains('collapsed') && $('#page-home').classList.contains('active') && document.visibilityState === 'visible');
  }
  function town3dStart() {
    const s = TOWN3D.s;
    if (!s || s.raf || !town3dVisible()) return;
    s.prev = 0;
    s.raf = requestAnimationFrame(town3dFrame);
  }
  function town3dFrame(now) {
    const s = TOWN3D.s;
    if (!s) return;
    if (!town3dVisible()) {
      s.raf = 0;
      if ($('#card-town').classList.contains('collapsed')) TOWN3D.grow = true;   // 收起後再展開才重播長高
      return;
    }
    const dt = Math.min(0.05, (now - (s.prev || now)) / 1000);
    s.prev = now;
    s.t += dt;
    if (s.playing) { s.growT += dt; town3dApplyGrow(s.growT); }
    if (s.fx.length) town3dUpdateFx();
    if (s.deco) town3dDecoTick(dt);
    if (now - s.lastTouch > 3000) s.cam.theta += dt * 0.1;
    const aspect = s.camera.aspect;
    const dist = Math.max(s.R * 4.3, (s.R + 3.2) / (0.364 * aspect) * 1.35);    // 畫面窄時拉遠(0.364 = tan 20°)
    const { theta, phi } = s.cam;
    s.camera.position.set(Math.cos(theta) * Math.sin(phi) * dist, Math.cos(phi) * dist + 1, Math.sin(theta) * Math.sin(phi) * dist);
    s.camera.lookAt(0, TOWN3D.MAX_H * 0.36, 0);
    s.renderer.render(s.scene, s.camera);
    s.raf = requestAnimationFrame(town3dFrame);
  }
  function town3dResize() {
    const s = TOWN3D.s;
    if (!s) return;
    const c = s.renderer.domElement, w = c.clientWidth || 320, h = c.clientHeight || 300;
    s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }

  // 左右拖曳旋轉(上下滑仍然捲動頁面);點樓層看那筆買進、點金幣看配息
  function town3dBindControls(canvas) {
    let p = null;
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    canvas.addEventListener('pointerdown', (e) => { p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, drag: false }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!p || !TOWN3D.s) return;
      if (!p.drag && Math.abs(e.clientX - p.sx) > 8 && Math.abs(e.clientX - p.sx) > Math.abs(e.clientY - p.sy)) p.drag = true;
      if (p.drag) {
        TOWN3D.s.cam.theta += (e.clientX - p.x) * 0.009;
        TOWN3D.s.lastTouch = performance.now();
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      const s = TOWN3D.s;
      if (p && s && Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) < 8) {
        const r = canvas.getBoundingClientRect();
        v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        ray.setFromCamera(v2, s.camera);
        if (s.playing) { town3dFinish(); p = null; return; }   // 播放中點一下 = 跳到今天
        const hit = ray.intersectObjects(s.picks.filter(o => o.visible), false)[0];
        town3dShow(hit ? hit.object.userData : null);
        s.lastTouch = performance.now();
      }
      p = null;
    });
    canvas.addEventListener('pointercancel', () => { p = null; });
  }

  function town3dShow(d) {
    const s = TOWN3D.s;
    const box = $('#town-readout');
    if (d && d.kind === 'floor') {
      const f = d.f;
      const info = (STATE.data.symbols || []).find(x => x.symbol === d.sym) || {};
      box.innerHTML = `<b>${escapeHtml(d.sym)}</b> ${escapeHtml(info.name || '')}・第 ${d.floor} 層(共 ${d.total} 層)<br>` +
        `${f.date.replace(/-/g, '/')} 買進 ${fmt.money(f.shares)} 股・<span class="town-num">${fmt.money(f.money)} 元</span>`;
      return;
    }
    if (d && d.kind === 'flag') {
      box.innerHTML = `🚩 <b>${escapeHtml(d.sym)}</b> 預計 ${d.date.slice(5).replace('-', '/')} 除息。除息前 2 個營業日(含)以前買進的才領得到。`;
      return;
    }
    if (d && d.kind === 'pending') {
      box.innerHTML = `💰 <b>${escapeHtml(d.it.symbol)}</b> 有一筆配息待確認(預估 <span class="town-num">${fmt.money(d.it.net)} 元</span>),已打開股利表單。`;
      confirmPendingDividend(d.it);
      return;
    }
    if (d && d.kind === 'coins') {
      const last = (STATE.data.dividends || []).filter(r => r.person === STATE.defaultPerson)
        .sort((a, b) => String(a.date) < String(b.date) ? 1 : -1)[0];
      box.innerHTML = `💰 累積配息 <span class="town-num">${fmt.money(s.div)} 元</span>` +
        (last ? `<br>最近一次:${String(last.date).slice(0, 10).replace(/-/g, '/')} ${escapeHtml(last.symbol)} <span class="town-num">${fmt.money(Number(last.total) || 0)} 元</span>` : '');
      return;
    }
    box.innerHTML = s.summary || '';
  }

  // 由 town.js 的 renderTown 呼叫。回傳 true = 3D 接手畫;false = 用平面圖(還在載入或不支援)
  function town3dRender(person, items) {
    if (TOWN3D.failed) return false;
    if (!window.THREE) {
      town3dLoadThree().then(() => renderTown(STATE.defaultPerson)).catch(() => { TOWN3D.failed = true; });
      return false;
    }
    const wrap = $('#town-scene');
    if (!TOWN3D.s) {
      try {
        const canvas = document.createElement('canvas');
        canvas.id = 'town3d-canvas';
        town3dInit(canvas);
        window.addEventListener('resize', town3dResize);
      } catch (e) {
        TOWN3D.failed = true;
        return false;
      }
    }
    const s = TOWN3D.s;
    if (!wrap.querySelector('#town3d-stage')) {
      wrap.innerHTML = `<div id="town3d-stage" class="town3d-stage">
        <div class="town3d-hud small" id="town3d-hud"></div>
        <div class="town3d-years small" id="town3d-years"></div>
        <div class="town3d-banner" id="town3d-banner"></div></div>`;
      $('#town3d-stage').prepend(s.renderer.domElement);
      TOWN3D.grow = true;
    }
    town3dResize();
    const total = items.reduce((a, it) => a + it.value, 0);
    const cost = items.reduce((a, it) => a + it.cost, 0);
    const sig = [person, TOWN.mode, (STATE.data.purchases || []).length, (STATE.data.dividends || []).length, computePendingDividends().length,
      items.map(it => it.sym + it.value + it.chg + it.nextEx).join()].join('|');
    if (sig !== TOWN3D.sig || TOWN3D.grow) {
      TOWN3D.sig = sig;
      town3dBuild(person, items);
    }
    s.finalHud =
      `總市值 <b class="town-num">${fmt.money(total)}</b><br>` +
      `持有成本 <span class="town-num">${fmt.money(cost)}</span><br>` +
      `累積配息 <span class="town-num">${fmt.money(s.div)}</span>`;
    $('#town3d-years').innerHTML = s.years.map(y => `<i style="background:${s.yearColor(y)}"></i>${y}`).join('');
    if (!s.playing) $('#town3d-hud').innerHTML = s.finalHud + (s.weatherHtml || '');
    s.summary = `${escapeHtml(getPersonLabel(person))}的小鎮:${items.length} 棟大樓、共 ${s.floors.length} 層(一筆買進一層)。點樓層看那筆買進,點中間金幣看配息;左右滑動可以旋轉。`;
    if (!s.playing) town3dShow(null);
    town3dStart();
    return true;
  }

  // 換到首頁或 APP 回到前景時,把停掉的繪圖接回來
  setInterval(() => { if (TOWN3D.s && !TOWN3D.s.raf && town3dVisible()) town3dStart(); }, 800);
