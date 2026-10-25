/* 3D 台股群島 — 嵌在市場頁「台股群島」卡片裡。
 * 中央是台股本島(燈塔 = 台指期),四周是外資、投信、自營商、散戶四座島。
 * 島和本島之間有兩條航道:綠色光點從島流向本島 = 買進金額,紅色光點從本島流回島 = 賣出金額,
 * 光點越密代表金額越大;島上的柱子是當天買賣超(綠升 = 買超、紅 = 賣超)。散戶用小台指期的多空比。
 * 可以逐日回放近幾十個交易日。three.js 在卡片展開時才載入;收起、換頁或 APP 在背景時就停止繪圖。
 * 讀不到 3D 時(舊手機不支援 WebGL)維持原本的 2D 平面圖。所有檔案共用全域範圍,載入順序見 index.html */

  const I3 = {
    s: null,              // 場景
    days: [],             // [{ date, cash, fut }],cash/fut 缺的那天沿用前一天
    idx: -1,              // 目前顯示第幾天
    follow: true,         // 停在最新一天(新資料進來時自動跟上)
    playing: false,
    failed: false,
    quote: null
  };
  const I3_LANE_N = 36;   // 每條航道最多幾顆光點

  let _threeLoading = null;
  function loadThree() {
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

  // 可重畫的文字看板(canvas 貼圖)
  function i3Board(w, h, scale) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(scale, scale * h / w, 1);
    sp.renderOrder = 10;
    sp.draw = (lines) => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 22) : g.rect(4, 4, w - 8, h - 8); g.fill();
      g.textAlign = 'center';
      const lh = (h - 16) / lines.length;
      lines.forEach((l, i) => {
        g.font = `${l.bold ? 'bold ' : ''}${l.size || 34}px system-ui, sans-serif`;
        g.fillStyle = l.color || '#2A3938';
        g.fillText(l.text, w / 2, 8 + lh * (i + 0.72));
      });
      tex.needsUpdate = true;
    };
    return sp;
  }

  function i3Build(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#4A6658', 0.7);
    const sun = new THREE.DirectionalLight('#FFF4E0', 0.85);
    sun.position.set(10, 22, 12);
    scene.add(hemi, sun);

    const flat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9 }, extra || {}));
    const sea = new THREE.Mesh(new THREE.CircleGeometry(80, 48), flat('#8CC4D6'));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.3; scene.add(sea);

    const GREEN = '#2FA052', RED = '#E04A3A';   // 3D 裡用固定的鮮明色,主題的淡色在場景裡會看不出來

    // 中央本島 + 燈塔(台指期)
    const main = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.9, 0.8, 9), flat('#6E9E5A'));
    scene.add(main);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.8, 9), flat('#5C8A4A'));
    hill.position.set(-0.6, 1.3, -0.4); scene.add(hill);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3, 8), flat('#F4EFE6'));
    tower.position.set(1.1, 1.9, 0.6); scene.add(tower);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshStandardMaterial({ color: '#999', emissive: '#999', emissiveIntensity: 0.8 }));
    lamp.position.set(1.1, 3.65, 0.6); scene.add(lamp);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -3.5, 0); beam.rotation.z = Math.PI / 2;
    const beamPivot = new THREE.Group(); beamPivot.position.copy(lamp.position); beamPivot.add(beam); scene.add(beamPivot);
    const mainBoard = i3Board(320, 120, 4.4); mainBoard.position.set(0, 5.8, 0); scene.add(mainBoard);

    // 四座島
    const D = 8.5;
    const defs = [
      { key: 'foreign', label: '外資',   x: -D, z: -D * 0.75 },
      { key: 'trust',   label: '投信',   x: D,  z: -D * 0.75 },
      { key: 'dealer',  label: '自營商', x: -D, z: D * 0.75 },
      { key: 'retail',  label: '散戶',   x: D,  z: D * 0.75 }
    ];
    const pGeo = new THREE.SphereGeometry(0.24, 10, 8);
    const mkLane = (color) => {
      const m = new THREE.InstancedMesh(pGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 }), I3_LANE_N);
      m.count = 0; scene.add(m); return m;
    };
    const isles = defs.map((d, i) => {
      const g = new THREE.Group(); g.position.set(d.x, 0, d.z); scene.add(g);
      const land = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.8, 0.7, 7), flat(i === 3 ? '#D8C48E' : '#7FB069'));
      g.add(land);
      const houses = [];
      for (let k = 0; k < 4; k++) {
        const hm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), flat('#EDE6D8'));
        hm.geometry.translate(0, 0.275, 0);
        const a = k / 4 * Math.PI * 2 + 0.4;
        hm.position.set(Math.cos(a) * 1.5, 0.35, Math.sin(a) * 1.5);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.4, 4), flat('#B86B4B'));
        roof.position.y = 0.75; roof.rotation.y = Math.PI / 4; hm.add(roof);
        g.add(hm); houses.push(hm);
      }
      // 買賣超柱:綠 = 買超、紅 = 賣超,高度 = 金額
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 10), flat('#999', { emissive: '#000' }));
      pillar.geometry.translate(0, 0.5, 0); pillar.position.y = 0.35; g.add(pillar);
      const board = i3Board(300, 150, 4.4); g.add(board);
      // 兩條航道的端點(島 → 本島),左右錯開
      const from = new THREE.Vector3(d.x, 0.2, d.z), to = new THREE.Vector3(0, 0.2, 0);
      const dir = to.clone().sub(from).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.55);
      const a = from.clone().addScaledVector(dir, 2.6), b = to.clone().addScaledVector(dir, -3.6);
      return Object.assign({}, d, {
        g, houses, pillar, board,
        buy: { mesh: mkLane(GREEN), from: a.clone().add(side), to: b.clone().add(side), n: 0, target: 0 },
        sell: { mesh: mkLane(RED), from: b.clone().sub(side), to: a.clone().sub(side), n: 0, target: 0 },
        h: 0.05, hTarget: 0.05, net: null
      });
    });

    I3.s = { renderer, scene, camera, sea, hemi, sun, lamp, beamPivot, mainBoard, isles, GREEN, RED,
      cam: { theta: Math.PI / 2, phi: 0.95, dist: 27 }, lastTouch: 0, raf: 0, prev: 0, phase: 0, m4: new THREE.Matrix4(), nightK: 0 };
    i3BindControls(canvas);
  }

  // ---------- 資料 → 畫面 ----------
  // 某天的資料:cash/fut 若當天沒有就往前找最近一筆
  function i3Row(i) {
    const days = I3.days;
    let cash = null, fut = null;
    for (let k = i; k >= 0 && (!cash || !fut); k--) {
      if (!cash && days[k].cash) cash = days[k].cash;
      if (!fut && days[k].fut) fut = days[k].fut;
    }
    return { date: days[i].date, cash: cash || {}, fut: fut || {} };
  }

  function i3Apply() {
    const s = I3.s;
    if (!s || I3.idx < 0) return;
    const row = i3Row(I3.idx), c = row.cash, f = row.fut;
    const flows = {
      foreign: { buy: c.foreignBuy, sell: c.foreignSell, net: c.foreign },
      trust:   { buy: c.trustBuy, sell: c.trustSell, net: c.trust },
      dealer:  { buy: c.dealerBuy, sell: c.dealerSell, net: c.dealer }
    };
    const maxFlow = Math.max(1, ...Object.values(flows).flatMap(v => [v.buy || Math.abs(v.net || 0), v.sell || 0]));
    const maxNet = Math.max(1, ...Object.values(flows).map(v => Math.abs(v.net || 0)));
    s.isles.forEach(it => {
      let buyK, sellK, net, lines;
      if (it.key === 'retail') {
        const r = f.mtxRetailRatio;                  // 小台散戶多空比(%):正 = 偏多
        net = r === undefined || r === null ? null : r;
        buyK = net === null ? 0 : Math.max(0, 50 + net / 2) / 100;
        sellK = net === null ? 0 : Math.max(0, 50 - net / 2) / 100;
        it.hTarget = net === null ? 0.05 : 0.3 + Math.abs(net) / 40 * 3.2;
        const approx = c.total === undefined || c.total === null ? '' : `現貨推估 ${-c.total > 0 ? '買' : '賣'}超 ${mFmt(Math.abs(c.total), 0)} 億`;
        lines = [{ text: '散戶(小台)', bold: true, size: 32 },
          { text: net === null ? '—' : `${net > 0 ? '偏多' : '偏空'} ${Math.abs(net).toFixed(1)}%`, bold: true, size: 36, color: net > 0 ? s.GREEN : s.RED },
          { text: approx, size: 22, color: '#5C6B6A' }];
      } else {
        const v = flows[it.key];
        net = v.net === undefined ? null : v.net;
        // 沒有買進/賣出金額(舊資料)時,只用買賣超畫單邊航道
        const buy = v.buy !== undefined && v.buy !== null ? v.buy : Math.max(0, net || 0);
        const sell = v.sell !== undefined && v.sell !== null ? v.sell : Math.max(0, -(net || 0));
        buyK = buy / maxFlow; sellK = sell / maxFlow;
        it.hTarget = net === null ? 0.05 : 0.3 + Math.abs(net) / maxNet * 3.6;
        lines = [{ text: it.label, bold: true, size: 34 },
          { text: net === null ? '—' : `${net > 0 ? '買超' : '賣超'} ${mFmt(Math.abs(net), 1)} 億`, bold: true, size: 36, color: net > 0 ? s.GREEN : net < 0 ? s.RED : '#5C6B6A' },
          { text: v.buy !== undefined && v.buy !== null ? `買 ${mFmt(v.buy, 0)}・賣 ${mFmt(v.sell, 0)} 億` : '', size: 24, color: '#5C6B6A' }];
      }
      it.net = net;
      it.buy.target = Math.round(buyK * I3_LANE_N);
      it.sell.target = Math.round(sellK * I3_LANE_N);
      it.pillar.material.color.set(net > 0 ? s.GREEN : net < 0 ? s.RED : '#9AA5A4');
      it.board.draw(lines);
    });
    // 本島看板:最新一天顯示即時台指期,回放舊日期只顯示日期
    const latest = I3.idx === I3.days.length - 1;
    const night = isNightSession();
    const q = I3.quote, tx = q ? (night ? q.txfNight : q.txfDay) : null;
    const chg = latest && tx ? tx.chgPct : (f.night && f.night.chgPct);
    s.lamp.material.color.set(chg > 0 ? s.GREEN : chg < 0 ? s.RED : '#AAAAAA');
    s.lamp.material.emissive.set(chg > 0 ? s.GREEN : chg < 0 ? s.RED : '#777777');
    s.mainBoard.draw(latest && tx && tx.price
      ? [{ text: night ? '台指期夜盤' : '台指期', size: 30 }, { text: `${fmt.money(tx.price)} ${mPct(tx.chgPct)}`, bold: true, size: 38, color: chg > 0 ? s.GREEN : chg < 0 ? s.RED : '#2A3938' }]
      : [{ text: '台股', bold: true, size: 36 }, { text: row.date.slice(5).replace('-', '/'), size: 30 }]);
    s.nightTarget = latest && night ? 1 : 0;
    $('#i3-date').textContent = row.date.replace(/-/g, '/') + (latest ? '(最新)' : '');
    const sl = $('#i3-slider');
    sl.max = String(I3.days.length - 1);
    if (document.activeElement !== sl) sl.value = String(I3.idx);
    renderIslandsDetail(row);
  }

  // 由 market.js 呼叫:新資料進來
  function islands3dUpdate(hist, quote) {
    I3.quote = quote;
    I3.days = (hist || []).filter(h => h.cash || h.fut);
    if (!I3.days.length) return;
    if (I3.follow || I3.idx < 0 || I3.idx >= I3.days.length) I3.idx = I3.days.length - 1;
    i3Apply();
    i3Start();
  }

  // ---------- 繪圖迴圈 ----------
  function i3Visible() {
    const card = $('#card-islands');
    return !!(I3.s && card && !card.classList.contains('collapsed') && $('#page-market').classList.contains('active') && document.visibilityState === 'visible');
  }
  function i3Start() {
    if (!I3.s || I3.s.raf || !i3Visible()) return;
    I3.s.prev = 0;
    I3.s.raf = requestAnimationFrame(i3Frame);
  }

  function i3Frame(now) {
    const s = I3.s;
    if (!s) return;
    if (!i3Visible()) { s.raf = 0; return; }       // 收起/換頁/背景就停,回來時 renderIslands 會再叫 i3Start
    const dt = Math.min(0.05, (now - (s.prev || now)) / 1000);
    s.prev = now;
    s.phase += dt;

    if (I3.playing) {
      s.playAcc = (s.playAcc || 0) + dt;
      if (s.playAcc > 1.1) {
        s.playAcc = 0;
        if (I3.idx < I3.days.length - 1) { I3.idx++; i3Apply(); }
        else { I3.playing = false; I3.follow = true; $('#i3-play').textContent = '▶ 回放'; }
      }
    }

    s.isles.forEach((it, i) => {
      it.h += (it.hTarget - it.h) * Math.min(1, dt * 4);
      it.pillar.scale.y = Math.max(0.05, it.h);
      it.board.position.set(0, 0.35 + it.h + 1.9, 0);
      it.houses.forEach((hm, k) => { hm.position.y = 0.35 + Math.sin(s.phase * 1.4 + k + i) * 0.02; });
      [it.buy, it.sell].forEach(lane => {
        if (lane.n !== lane.target) lane.n += Math.sign(lane.target - lane.n);
        lane.mesh.count = lane.n;
        for (let k = 0; k < lane.n; k++) {
          const t = ((k / Math.max(1, lane.n)) + s.phase * 0.18) % 1;
          const x = lane.from.x + (lane.to.x - lane.from.x) * t;
          const z = lane.from.z + (lane.to.z - lane.from.z) * t;
          const y = lane.from.y + Math.sin(t * Math.PI) * 0.9;
          s.m4.makeTranslation(x, y, z);
          lane.mesh.setMatrixAt(k, s.m4);
        }
        lane.mesh.instanceMatrix.needsUpdate = true;
      });
    });

    // 夜盤時段天色變暗、燈塔掃光
    s.nightK += ((s.nightTarget || 0) - s.nightK) * Math.min(1, dt * 2);
    const day = new THREE.Color('#CFE6EE'), nightC = new THREE.Color('#16222C');
    const bg = day.lerp(nightC, s.nightK);
    s.scene.background = bg;
    s.sea.material.color.set('#8CC4D6').lerp(new THREE.Color('#1F3B4A'), s.nightK);
    s.hemi.intensity = 0.7 - 0.4 * s.nightK;
    s.sun.intensity = 0.85 - 0.6 * s.nightK;
    s.beamPivot.visible = s.nightK > 0.05;
    s.beamPivot.rotation.y = s.phase * 0.9;

    if (now - s.lastTouch > 3000) s.cam.theta += dt * 0.06;
    const { theta, phi } = s.cam;
    const dist = Math.max(s.cam.dist, 12.5 / (0.364 * s.camera.aspect));   // 畫面窄時拉遠,左右兩座島才裝得下(0.364 = tan 20°)
    s.camera.position.set(Math.cos(theta) * Math.sin(phi) * dist, Math.cos(phi) * dist, Math.sin(theta) * Math.sin(phi) * dist);
    s.camera.lookAt(0, 0.5, 0);
    s.renderer.render(s.scene, s.camera);
    s.raf = requestAnimationFrame(i3Frame);
  }

  function i3Resize() {
    const s = I3.s;
    if (!s) return;
    const c = s.renderer.domElement, w = c.clientWidth || 340, h = c.clientHeight || 320;
    s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }

  // 拖曳左右旋轉、上下改俯角;點島看那座島的說明
  function i3BindControls(canvas) {
    let p = null;
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    canvas.onpointerdown = (e) => { p = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; I3.s.lastTouch = performance.now(); };
    canvas.onpointermove = (e) => {
      if (!p || e.pointerId !== p.id || !I3.s) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.moved < 6) return;
      if (!p.cap) { canvas.setPointerCapture(e.pointerId); p.cap = true; }
      p.x = e.clientX; p.y = e.clientY;
      I3.s.cam.theta += dx * 0.008;
      I3.s.cam.phi = Math.max(0.45, Math.min(1.3, I3.s.cam.phi - dy * 0.005));
      I3.s.lastTouch = performance.now();
    };
    canvas.onpointerup = (e) => {
      if (p && p.moved < 6 && I3.s) {
        const r = canvas.getBoundingClientRect();
        v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        ray.setFromCamera(v2, I3.s.camera);
        const hit = ray.intersectObjects(I3.s.isles.map(it => it.g), true)[0];
        if (hit) {
          const it = I3.s.isles.find(x => { let o = hit.object; while (o) { if (o === x.g) return true; o = o.parent; } return false; });
          if (it) $('#i3-tip').innerHTML = i3Tip(it);
        }
      }
      p = null;
    };
    canvas.onpointercancel = () => { p = null; };
  }

  function i3Tip(it) {
    if (it.key === 'retail') return '<b>散戶(小台指期)</b>:綠點多 = 散戶做多的多、紅點多 = 做空的多。散戶偏多常被視為反向指標(法人在對作)。現貨散戶沒有官方數字,用「三大法人合計的反向」推估。';
    const name = it.label;
    return `<b>${name}</b>:綠色光點從${name}流進台股 = 買進金額,紅色光點流回${name} = 賣出金額,光點越密金額越大。柱子是當天買賣超(綠 = 買超、紅 = 賣超)。`;
  }

  // ---------- 掛載 ----------
  async function islands3dMount() {
    if (I3.s || I3.failed) return !!I3.s;
    const wrap = $('#islands-3d');
    if (!wrap) return false;
    try {
      await loadThree();
      const canvas = document.createElement('canvas');
      canvas.id = 'i3-canvas';
      wrap.querySelector('.i3-stage').prepend(canvas);
      i3Build(canvas);
    } catch (e) {
      I3.failed = true;                // 不支援 WebGL 或載入失敗 → 維持 2D
      wrap.classList.add('hidden');
      return false;
    }
    wrap.classList.remove('hidden');
    $('#islands-scene').classList.add('hidden');
    i3Resize();
    window.addEventListener('resize', () => { i3Resize(); });
    $('#i3-play').onclick = () => {
      if (I3.playing) { I3.playing = false; $('#i3-play').textContent = '▶ 回放'; return; }
      if (I3.idx >= I3.days.length - 1) I3.idx = Math.max(0, I3.days.length - 20);   // 從近 20 個交易日前開始
      I3.playing = true; I3.follow = false; I3.s.playAcc = 0;
      $('#i3-play').textContent = '⏸ 暫停';
      i3Apply();
    };
    $('#i3-slider').oninput = (e) => {
      I3.playing = false; $('#i3-play').textContent = '▶ 回放';
      I3.idx = +e.target.value;
      I3.follow = I3.idx === I3.days.length - 1;
      i3Apply();
    };
    return true;
  }
