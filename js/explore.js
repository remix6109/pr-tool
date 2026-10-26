/* 探索分頁 — 3D 群島地圖。點一座島,鏡頭飛過去,下方展開那座島的內容。
 * AI 入門島(課程+測驗,進度存在這台裝置)、AI 工具島(工具卡)、小鎮島(連到首頁 3D 小鎮)、
 * 配息島/市場島(捷徑)、自動化工坊島/理財知識島(即將推出)。
 * three.js 共用 town3d.js 的載入;不支援 3D 時只顯示下方的島嶼清單。只在探索分頁顯示時繪圖。
 * 內容資料在 explore-data.js。所有檔案共用全域範圍,載入順序見 index.html */

  const EXPLORE = { s: null, sel: null, lesson: null, toolCat: '全部', failed: false };
  const EXPLORE_ISLANDS = [
    { id: 'ai-intro', name: 'AI 入門島', icon: '🤖', desc: 'AI 是什麼、會錯在哪、怎麼問才問得好', x: -7.5, z: -3, kind: 'robot', land: '#9DC88A' },
    { id: 'ai-tools', name: 'AI 工具島', icon: '🧰', desc: '各家 AI 工具的強項、價格與實用度', x: 0.5, z: -7.5, kind: 'tools', land: '#A9C98C' },
    { id: 'auto', name: '自動化工坊島', icon: '⚙️', desc: '把 AI 串起來自動做事', x: 8, z: -3, kind: 'gears', land: '#B9BFA0' },
    { id: 'town', name: '小鎮島', icon: '🏙️', desc: '你的 3D 持股小鎮', x: -3.5, z: 4.5, kind: 'town', land: '#8DB86E' },
    { id: 'dividend', name: '配息島', icon: '💰', desc: '待確認配息與配息行事曆', x: 4.5, z: 5, kind: 'coins', land: '#D8C48E' },
    { id: 'market', name: '市場島', icon: '🌊', desc: '三大法人、夜盤與國際市場', x: 11, z: 5.5, kind: 'lighthouse', land: '#9DC88A' },
    { id: 'finance', name: '理財知識島', icon: '📚', desc: '除息、填息、補充保費一次搞懂', x: -11, z: 5, kind: 'books', land: '#A9C98C' }
  ];

  // ---------- 學習進度(存在這台裝置) ----------
  function learnProgress() {
    try { return JSON.parse(localStorage.getItem('pr.learn') || '{}'); } catch (_) { return {}; }
  }
  function learnSave(p) { try { localStorage.setItem('pr.learn', JSON.stringify(p)); } catch (_) {} }
  // 有課程的島 → 課程清單(定義在 explore-data.js)
  const islandLessons = (id) => ({ 'ai-intro': AI_LESSONS, auto: typeof AUTO_LESSONS !== 'undefined' ? AUTO_LESSONS : [], finance: typeof FIN_LESSONS !== 'undefined' ? FIN_LESSONS : [] })[id] || null;
  const curLessons = () => islandLessons(EXPLORE.sel) || [];
  const learnDoneCount = (list) => list.filter(l => learnProgress()[l.id]).length;

  // ---------- 3D 場景 ----------
  function exploreLabel(lines, w = 300, h = 120, scale = 4.6) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(scale, scale * h / w, 1);
    sp.renderOrder = 10;
    sp.draw = (ls) => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.93)';
      g.beginPath(); g.roundRect ? g.roundRect(6, 6, w - 12, h - 12, 24) : g.rect(6, 6, w - 12, h - 12); g.fill();
      g.textAlign = 'center';
      const lh = (h - 20) / ls.length;
      ls.forEach((l, i) => {
        g.font = `${l.bold ? 'bold ' : ''}${l.size || 36}px system-ui, sans-serif`;
        g.fillStyle = l.color || '#2A3938';
        g.fillText(l.text, w / 2, 10 + lh * (i + 0.74));
      });
      tex.needsUpdate = true;
    };
    sp.draw(lines);
    return sp;
  }

  function exploreBuild(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const dark = document.documentElement.dataset.theme === 'dark';
    const sky = new THREE.Color(dark ? '#1E2E38' : '#CFE7F0');
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 40, 90);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    const sun = new THREE.DirectionalLight('#FFF4E0', dark ? 0.7 : 0.95);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#5E7A6A', dark ? 0.55 : 0.75), sun);

    const flat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.85 }, extra || {}));
    const sea = new THREE.Mesh(new THREE.CircleGeometry(120, 48), flat(dark ? '#264656' : '#86C1D6'));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.35; sea.receiveShadow = true;
    scene.add(sea);

    const spin = [];        // 會轉動的東西(齒輪、光環、燈塔光)
    const islands = EXPLORE_ISLANDS.map(def => {
      const g = new THREE.Group();
      g.position.set(def.x, 0, def.z);
      scene.add(g);
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.3, 0.5, 9), flat('#E6D6AE'));
      sand.receiveShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.45, 9), flat(def.land));
      top.position.y = 0.25; top.receiveShadow = true;
      g.add(sand, top);
      const T = 0.48;
      const box = (w, h, d, color, x = 0, z = 0, y = T) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
        m.position.set(x, y + h / 2, z); m.castShadow = true; g.add(m); return m;
      };
      if (def.kind === 'robot') {
        box(1.1, 1.3, 0.9, '#DDE6EE');
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), flat('#EEF3F7'));
        head.position.y = T + 1.9; head.castShadow = true; g.add(head);
        [-0.22, 0.22].forEach(x => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: '#5FE3FF', emissive: '#2AC8F0', emissiveIntensity: 1 }));
          eye.position.set(x, T + 1.95, 0.55); g.add(eye);
        });
        const ant = box(0.06, 0.5, 0.06, '#8895A0', 0, 0, T + 2.45);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: '#7FD8FF', transparent: true, opacity: 0.8 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = T + 1.2; g.add(ring);
        spin.push({ m: ring, axis: 'z', speed: 1.2 }); void ant;
      } else if (def.kind === 'tools') {
        box(1.6, 0.9, 1.1, '#C9563F', -0.3, 0.2);
        box(1.6, 0.18, 1.15, '#8E3A2A', -0.3, 0.2, T + 0.9);
        box(0.55, 0.55, 0.55, '#4F8FD8', 1.1, -0.6);
        box(0.55, 0.55, 0.55, '#F2B33D', 1.1, 0.3);
        box(0.55, 0.55, 0.55, '#58B368', 1.1, 0.3, T + 0.55);
        const w = box(0.14, 1.4, 0.14, '#9AA5AD', -1.3, 1.0); w.rotation.z = 0.5;
      } else if (def.kind === 'gears') {
        [[-0.6, 1.3, 0.7], [0.75, 0.85, 0.5]].forEach(([x, y, r], i) => {
          const gear = new THREE.Group();
          gear.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 16), flat('#9AA0A6')));
          for (let k = 0; k < 10; k++) {
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.25), flat('#80878E'));
            const a = k / 10 * Math.PI * 2;
            tooth.position.set(Math.cos(a) * (r + 0.1), 0, Math.sin(a) * (r + 0.1)); tooth.rotation.y = -a;
            gear.add(tooth);
          }
          gear.rotation.x = Math.PI / 2;
          gear.position.set(x, T + y, 0);
          gear.children.forEach(c => { c.castShadow = true; });
          g.add(gear);
          spin.push({ m: gear, axis: 'y', speed: i ? -1.4 : 1 });
        });
      } else if (def.kind === 'town') {
        [[-1, -0.5, 1.6, '#EACB9C'], [0.1, -0.8, 2.4, '#F3E6CC'], [1.1, -0.3, 1.2, '#DDAA6E'], [-0.2, 0.8, 1.0, '#C98A52']].forEach(([x, z, h, c]) => {
          box(0.75, h, 0.75, c, x, z);
          box(0.85, 0.12, 0.85, '#E07A5F', x, z, T + h);
        });
      } else if (def.kind === 'coins') {
        for (let i = 0; i < 26; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 14), new THREE.MeshStandardMaterial({ color: '#FFD447', metalness: 0.35, roughness: 0.3, emissive: '#B07800', emissiveIntensity: 0.35 }));
          const st = Math.floor(i / 6), lv = i % 6, a = st * 2.3, r = st ? 0.4 + st * 0.12 : 0;
          c.position.set(Math.cos(a) * r, T + 0.05 + lv * 0.085, Math.sin(a) * r); c.castShadow = true;
          g.add(c);
        }
      } else if (def.kind === 'lighthouse') {
        for (let k = 0; k < 4; k++) {
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.42 - k * 0.05, 0.47 - k * 0.05, 0.6, 12), flat(k % 2 ? '#D9483B' : '#F4F1EA'));
          seg.position.y = T + 0.3 + k * 0.6; seg.castShadow = true; g.add(seg);
        }
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: '#FFE9A8', emissive: '#FFD45A', emissiveIntensity: 1 }));
        lamp.position.y = T + 2.75; g.add(lamp);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
        beam.geometry.translate(0, -2.5, 0); beam.rotation.z = Math.PI / 2;
        const pivot = new THREE.Group(); pivot.position.y = T + 2.75; pivot.add(beam); g.add(pivot);
        spin.push({ m: pivot, axis: 'y', speed: 0.9 });
      } else if (def.kind === 'books') {
        ['#3F7373', '#B85042', '#E8A23A', '#5C8C7D', '#7D6A55'].forEach((c, i) => {
          const b = box(1.5 - i * 0.12, 0.28, 1.0, c, 0, 0, T + i * 0.28); b.rotation.y = i * 0.18;
        });
      }
      // 樹
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + def.x, tr = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6), flat(dark ? '#3F6B4A' : '#5E9A5A'));
        tr.position.set(Math.cos(a) * 2.05, T + 0.45, Math.sin(a) * 2.05); tr.castShadow = true; g.add(tr);
      }
      const label = exploreLabel(exploreLabelLines(def));
      label.position.y = 5.0;
      g.add(label);
      g.userData.def = def;
      return { def, g, label };
    });

    // 島上散步的小人(每座島 2~3 個,沿著島邊走、偶爾停下來)
    const SHIRTS = ['#3F7373', '#D2533F', '#E8A23A', '#5C8C7D', '#7B6BB0', '#4F8FD8'];
    const walkers = [];
    islands.forEach((it, i) => {
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k++) {
        const man = explorePerson(SHIRTS[(i * 3 + k) % SHIRTS.length], it.def.kind === 'coins');
        it.g.add(man);
        walkers.push({ man, a: k / n * Math.PI * 2 + i, r: 1.45 + (k % 2) * 0.35, speed: (k % 2 ? -1 : 1) * (0.35 + 0.1 * k), pause: 0, phase: i + k });
      }
    });

    // 渡輪:載著小人在島之間來回(停靠一下再開往下一座)
    const ferry = new THREE.Group();
    const fHull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), flat('#F4F1EA'));
    const fCabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.6), flat('#4F8FD8')); fCabin.position.set(-0.4, 0.37, 0);
    ferry.add(fHull, fCabin);
    [0.25, 0.65].forEach((x, k) => { const p = explorePerson(SHIRTS[k + 2]); p.position.set(x, 0.17, k ? 0.15 : -0.15); p.scale.setScalar(0.85); ferry.add(p); });
    ferry.children.forEach(c => { c.castShadow = true; });
    scene.add(ferry);
    const route = [0, 3, 4, 5, 2, 1].map(i => islands[i].def);

    // 一艘繞著群島的小船
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.45), flat('#7A5432')); hull.position.y = 0.0;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.95, 3), flat('#F4F1EA')); sail.position.y = 0.6;
    boat.add(hull, sail); boat.children.forEach(c => { c.castShadow = true; });
    scene.add(boat);

    EXPLORE.s = {
      renderer, scene, camera, islands, spin, boat, walkers, ferry, route, leg: 0, legT: 0, raf: 0, prev: 0, t: 0, lastTouch: 0,
      cam: { theta: Math.PI / 2, phi: 0.92, dist: 32 },
      target: new THREE.Vector3(0, 0, 0), want: { x: 0, z: 0, dist: 32 }
    };
    exploreBindControls(canvas);
  }

  // 低多邊形小人(身體+頭,可選頭頂金幣)
  function explorePerson(shirt, coin) {
    const m = new THREE.Group();
    const std = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.34, 8), std(shirt)); body.position.y = 0.17;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), std('#F2D2B0')); head.position.y = 0.44;
    m.add(body, head);
    if (coin) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#FFD447', metalness: 0.35, roughness: 0.3, emissive: '#B07800', emissiveIntensity: 0.4 }));
      c.position.y = 0.6; m.add(c);
    }
    m.children.forEach(c => { c.castShadow = true; });
    m.scale.setScalar(1.25);
    return m;
  }

  function exploreLabelLines(def) {
    const L = islandLessons(def.id);
    const sub = def.soon ? '即將推出' : L && L.length ? `已完成 ${learnDoneCount(L)}/${L.length} 課` : def.desc.slice(0, 11);
    return [{ text: `${def.icon} ${def.name}`, bold: true, size: 38 }, { text: sub, size: 26, color: def.soon ? '#B07800' : '#5C6B6A' }];
  }

  function exploreVisible() {
    return !!(EXPLORE.s && $('#page-explore').classList.contains('active') && document.visibilityState === 'visible');
  }
  function exploreStart() {
    const s = EXPLORE.s;
    if (!s || s.raf || !exploreVisible()) return;
    s.prev = 0;
    s.raf = requestAnimationFrame(exploreFrame);
  }
  function exploreFrame(now) {
    const s = EXPLORE.s;
    if (!s) return;
    if (!exploreVisible()) { s.raf = 0; return; }
    const dt = Math.min(0.05, (now - (s.prev || now)) / 1000);
    s.prev = now; s.t += dt;
    s.spin.forEach(x => { x.m.rotation[x.axis] += dt * x.speed; });
    // 小船繞圈
    const a = s.t * 0.12;
    s.boat.position.set(Math.cos(a) * 15, -0.2 + Math.sin(s.t * 2) * 0.05, Math.sin(a) * 11);
    s.boat.rotation.y = -a;
    // 島輕輕上下浮動
    s.islands.forEach((it, i) => { it.g.position.y = Math.sin(s.t * 0.9 + i) * 0.06; });
    // 小人散步:沿著島邊走,走一陣子停一下
    s.walkers.forEach(w => {
      if (w.pause > 0) w.pause -= dt;
      else {
        w.a += w.speed * dt / w.r;
        if (Math.random() < dt * 0.15) w.pause = 1 + Math.random() * 2;
      }
      const moving = w.pause <= 0;
      w.man.position.set(Math.cos(w.a) * w.r, 0.48 + (moving ? Math.abs(Math.sin(s.t * 8 + w.phase)) * 0.05 : 0), Math.sin(w.a) * w.r);
      w.man.rotation.y = -w.a + (w.speed > 0 ? Math.PI : 0);
    });
    // 渡輪:開 6 秒到下一座島,停 2 秒
    s.legT += dt;
    const from = s.route[s.leg % s.route.length], to = s.route[(s.leg + 1) % s.route.length];
    const p = Math.min(1, s.legT / 6), e = p * p * (3 - 2 * p);
    const off = (d) => { const l = Math.hypot(d.x, d.z) || 1; return { x: d.x + d.x / l * 3.6, z: d.z + d.z / l * 3.6 }; };   // 停在島外側的碼頭
    const A = off(from), B = off(to);
    s.ferry.position.set(A.x + (B.x - A.x) * e, -0.18 + Math.sin(s.t * 2.2) * 0.04, A.z + (B.z - A.z) * e);
    s.ferry.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    if (s.legT > 8) { s.leg++; s.legT = 0; }
    // 鏡頭:飛向選中的島(或回到全景),沒在操作時慢慢繞
    s.target.x += (s.want.x - s.target.x) * Math.min(1, dt * 2.5);
    s.target.z += (s.want.z - s.target.z) * Math.min(1, dt * 2.5);
    const aspect = s.camera.aspect;
    const wantDist = EXPLORE.sel ? s.want.dist : Math.max(s.want.dist, 13.5 / (0.364 * aspect));   // 全景時畫面窄就拉遠
    s.cam.dist += (wantDist - s.cam.dist) * Math.min(1, dt * 2.5);
    if (now - s.lastTouch > 3000) s.cam.theta += dt * (EXPLORE.sel ? 0.12 : 0.05);
    const { theta, phi, dist } = s.cam;
    s.camera.position.set(s.target.x + Math.cos(theta) * Math.sin(phi) * dist, Math.cos(phi) * dist + 1, s.target.z + Math.sin(theta) * Math.sin(phi) * dist);
    s.camera.lookAt(s.target.x, EXPLORE.sel ? 1.6 : 0.5, s.target.z);
    s.renderer.render(s.scene, s.camera);
    s.raf = requestAnimationFrame(exploreFrame);
  }
  function exploreResize() {
    const s = EXPLORE.s;
    if (!s) return;
    const c = s.renderer.domElement, w = c.clientWidth || 320, h = c.clientHeight || 300;
    s.renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }

  // 左右拖曳旋轉(上下滑仍可捲動頁面);點島 = 選它
  function exploreBindControls(canvas) {
    let p = null;
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    canvas.addEventListener('pointerdown', (e) => { p = { x: e.clientX, sx: e.clientX, sy: e.clientY, drag: false }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!p || !EXPLORE.s) return;
      if (!p.drag && Math.abs(e.clientX - p.sx) > 8 && Math.abs(e.clientX - p.sx) > Math.abs(e.clientY - p.sy)) p.drag = true;
      if (p.drag) { EXPLORE.s.cam.theta += (e.clientX - p.x) * 0.008; EXPLORE.s.lastTouch = performance.now(); }
      p.x = e.clientX;
    });
    canvas.addEventListener('pointerup', (e) => {
      const s = EXPLORE.s;
      if (p && s && Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) < 8) {
        const r = canvas.getBoundingClientRect();
        v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        ray.setFromCamera(v2, s.camera);
        const hit = ray.intersectObjects(s.islands.map(it => it.g), true)[0];
        if (hit) {
          let o = hit.object;
          while (o && !o.userData.def) o = o.parent;
          if (o) exploreSelect(o.userData.def.id);
        }
      }
      p = null;
    });
    canvas.addEventListener('pointercancel', () => { p = null; });
  }

  // ---------- 選島 / 面板 ----------
  function exploreSelect(id) {
    EXPLORE.sel = id;
    EXPLORE.lesson = null;
    const s = EXPLORE.s, def = EXPLORE_ISLANDS.find(d => d.id === id);
    if (s && def) { s.want = { x: def.x, z: def.z, dist: 11 }; s.lastTouch = 0; }
    // 拉近時選中那座島的看板縮小、放低,才不會擋住畫面
    if (s) s.islands.forEach(it => { const k = it.def.id === id ? 0.55 : 1; it.label.scale.set(4.6 * k, 4.6 * k * 120 / 300, 1); it.label.position.y = it.def.id === id ? 3.6 : 5.0; });
    if (s && !def) s.want = { x: 0, z: 0, dist: 32 };
    $('#explore-back').classList.toggle('hidden', !def);
    renderExplorePanel();
    if (def) $('#explore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exploreRefreshLabels() {
    if (!EXPLORE.s) return;
    EXPLORE.s.islands.forEach(it => it.label.draw(exploreLabelLines(it.def)));
  }

  // 小鎮/配息/市場島:直接把原本頁面上的卡片「搬」進島的面板(同一張卡片,功能完全一樣);
  // 換島、回地圖或離開探索頁時搬回原位。
  const EXPLORE_EMBED = {
    town: ['#card-town'],
    dividend: ['#card-pending-div', '[data-collapse="payout"]'],
    market: ['#card-islands', '#card-intl']
  };
  const _embedded = [];   // [{ el, ph }] ph = 原位置的記號
  function exploreRestore() {
    while (_embedded.length) {
      const { el, ph } = _embedded.pop();
      ph.replaceWith(el);
    }
  }
  function exploreEmbed(id) {
    const box = $('#ex-embed');
    if (!box) return;
    EXPLORE_EMBED[id].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      const ph = document.createComment('explore:' + sel);
      el.before(ph);
      _embedded.push({ el, ph });
      box.appendChild(el);
      if (el.classList.contains('collapsed')) { const t = el.querySelector('.card-title'); if (t) t.click(); }
    });
    if (id === 'town') { if (typeof TOWN3D !== 'undefined') TOWN3D.grow = true; renderTown(STATE.defaultPerson); }
    if (id === 'market') marketTick();
    if (id === 'dividend' && $('#card-pending-div').classList.contains('hidden')) {
      const empty = $('#ex-embed-empty');
      empty.textContent = '目前沒有待確認的配息。';
      empty.classList.remove('hidden');
      box.prepend(empty);
    }
  }

  function renderExplorePanel() {
    exploreRestore();                 // 先把搬進來的卡片放回原位,再重畫面板
    const box = $('#explore-panel');
    const def = EXPLORE_ISLANDS.find(d => d.id === EXPLORE.sel);
    if (!def) {
      box.innerHTML = `<div class="card-title">🗺️ 群島地圖 <small class="muted" style="font-weight:500;font-size:.75em;">(點地圖上的島,或點下面的清單)</small></div>
        <div class="ex-list">${EXPLORE_ISLANDS.map(d => `<button type="button" class="ex-item" data-isle="${d.id}">
          <span class="ex-ico">${d.icon}</span><span><b>${escapeHtml(d.name)}</b>${d.soon ? ' <span class="ex-soon">即將推出</span>' : ''}<br><span class="muted small">${escapeHtml(d.desc)}</span></span></button>`).join('')}</div>`;
      box.querySelectorAll('[data-isle]').forEach(b => { b.onclick = () => exploreSelect(b.dataset.isle); });
      return;
    }
    let body = '';
    const L = islandLessons(def.id);
    if (L && L.length) body = (def.id === 'auto' && !EXPLORE.lesson ? renderAutoIntro() : '') + (EXPLORE.lesson ? renderLesson(EXPLORE.lesson) : renderLessonList());
    else if (def.id === 'ai-tools') body = renderTools();
    else if (EXPLORE_EMBED[def.id]) body = '<div id="ex-embed" class="ex-embed"></div><div id="ex-embed-empty" class="muted small hidden"></div>';
    box.innerHTML = `<div class="ex-head"><div class="card-title" style="margin:0;">${def.icon} ${escapeHtml(def.name)}</div>
      <button type="button" class="btn ghost small" id="ex-back2">← 地圖</button></div>${body}`;
    $('#ex-back2').onclick = () => (EXPLORE.lesson ? (EXPLORE.lesson = null, renderExplorePanel()) : exploreSelect(null));
    if (L && L.length) bindLessonUi(box);
    if (def.id === 'ai-tools') bindToolsUi(box);
    if (EXPLORE_EMBED[def.id]) exploreEmbed(def.id);
  }

  // ---------- AI 入門島:課程 ----------
  function renderLessonList() {
    const prog = learnProgress();
    const L = curLessons();
    return `<p class="muted small">${L.length} 堂短課,每堂約 3 分鐘,最後有小測驗。進度存在這台裝置。</p>
      <div class="ex-list">${L.map((l, i) => {
        const p = prog[l.id];
        return `<button type="button" class="ex-item" data-lesson="${l.id}"><span class="ex-ico">${l.icon}</span>
          <span><b>第 ${i + 1} 課 ${escapeHtml(l.title)}</b>${p ? ` <span class="ex-done">✓ ${p.score}/${p.total}</span>` : ''}<br><span class="muted small">${escapeHtml(l.intro)}</span></span></button>`;
      }).join('')}</div>`;
  }

  function renderLesson(id) {
    const L = curLessons();
    const l = L.find(x => x.id === id);
    const idx = L.indexOf(l);
    return `<div class="ex-lesson">
      <h3>${l.icon} 第 ${idx + 1} 課 ${escapeHtml(l.title)}</h3>
      <p class="muted">${escapeHtml(l.intro)}</p>
      ${l.meta ? `<div class="ex-meta">${l.meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</div>` : ''}
      ${l.sections.map(sec => `<h4>${escapeHtml(sec.h)}</h4><p>${escapeHtml(sec.p)}</p>`).join('')}
      ${l.flow ? `<h4>🔁 流程圖</h4><div class="ex-flow">${l.flow.map((st, i) => `<div class="ex-step"><b>${i + 1}. ${escapeHtml(st.t)}</b><span>${escapeHtml(st.d)}</span></div>`).join('<div class="ex-arrow">↓</div>')}</div>` : ''}
      ${l.calc && EXPLORE_CALC[l.calc] ? `<div class="ex-calc"><b>🧮 用你的持股算算看(${escapeHtml(getPersonLabel(STATE.defaultPerson))})</b>${EXPLORE_CALC[l.calc]()}</div>` : ''}
      ${l.example ? `<div class="ex-example"><b>📝 ${escapeHtml(l.example.title)}</b>
        <div class="ex-bad"><span>✗ 普通問法</span>${escapeHtml(l.example.bad)}</div>
        <div class="ex-good"><span>✓ 更好的問法</span>${escapeHtml(l.example.good)}</div></div>` : ''}
      <h4>🧩 小測驗</h4>
      ${l.quiz.map((q, qi) => `<div class="ex-q" data-q="${qi}"><div class="ex-qt">${qi + 1}. ${escapeHtml(q.q)}</div>
        ${q.options.map((o, oi) => `<button type="button" class="ex-opt" data-opt="${oi}">${escapeHtml(o)}</button>`).join('')}
        <div class="ex-why hidden"></div></div>`).join('')}
      <div id="ex-result" class="ex-result hidden"></div>
    </div>`;
  }

  function bindLessonUi(box) {
    box.querySelectorAll('[data-lesson]').forEach(b => { b.onclick = () => { EXPLORE.lesson = b.dataset.lesson; renderExplorePanel(); $('#explore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    if (!EXPLORE.lesson) return;
    const L = curLessons();
    const l = L.find(x => x.id === EXPLORE.lesson);
    const answers = {};
    box.querySelectorAll('.ex-q').forEach(qEl => {
      const qi = +qEl.dataset.q, q = l.quiz[qi];
      qEl.querySelectorAll('.ex-opt').forEach(btn => {
        btn.onclick = () => {
          if (answers[qi] !== undefined) return;            // 每題只能答一次
          const oi = +btn.dataset.opt;
          answers[qi] = oi === q.answer;
          qEl.querySelectorAll('.ex-opt').forEach(b2 => {
            const k = +b2.dataset.opt;
            b2.classList.toggle('right', k === q.answer);
            b2.classList.toggle('wrong', k === oi && oi !== q.answer);
            b2.disabled = true;
          });
          const why = qEl.querySelector('.ex-why');
          why.innerHTML = `${answers[qi] ? '✅ 答對了!' : '❌ 再想想。'}${escapeHtml(q.why)}`;
          why.classList.remove('hidden');
          if (Object.keys(answers).length === l.quiz.length) {
            const score = Object.values(answers).filter(Boolean).length;
            const prog = learnProgress();
            prog[l.id] = { score, total: l.quiz.length, at: autodivYmd(new Date()) };
            learnSave(prog);
            exploreRefreshLabels();
            const next = L[L.indexOf(l) + 1];
            const res = $('#ex-result');
            res.innerHTML = `<b>${score === l.quiz.length ? '🎉 全對!' : `答對 ${score}/${l.quiz.length} 題`}</b> 這堂課完成了。
              ${next ? `<button type="button" class="btn primary small" id="ex-next">下一課:${escapeHtml(next.title)} →</button>` : '<span>🏆 所有課程都上完了!</span>'}`;
            res.classList.remove('hidden');
            if (next) $('#ex-next').onclick = () => { EXPLORE.lesson = next.id; renderExplorePanel(); $('#explore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
          }
        };
      });
    });
  }

  // ---------- 理財知識島:用你的持股試算 ----------
  const fmtD = (ymd) => ymd ? ymd.slice(5).replace('-', '/') : '';
  const EXPLORE_CALC = {
    // 接下來的除息與最晚買進日
    exdiv() {
      if (!Array.isArray(_exDiv.list)) return '<p class="muted small">除權息資料讀取中,稍後再打開這一課。</p>';
      const today = autodivYmd(new Date());
      const ev = computePayoutEvents(STATE.defaultPerson, today, autodivAddDays(today, 120)).events
        .filter(e => e.exDate >= today).sort((a, b) => a.exDate < b.exDate ? -1 : 1).slice(0, 5);
      if (!ev.length) return '<p class="muted small">未來 4 個月內查不到你持股的除息日。</p>';
      return `<table class="ex-table"><tr><th>代號</th><th>除息日</th><th>最晚買進日</th><th>每股約</th></tr>${ev.map(e =>
        `<tr><td>${escapeHtml(e.symbol)}</td><td>${fmtD(e.exDate)}${e.kind === 'est' ? '(估)' : ''}</td><td>${fmtD(autodivBizDaysBefore(e.exDate, 1))}</td><td>${e.perShare.toFixed(2)}</td></tr>`).join('')}</table>
        <p class="muted small">最晚買進日 = 除息日的前一個營業日(只略過週末,遇國定假日要再往前)。「(估)」是依過去週期推估的日期。</p>`;
    },
    // 近一年每筆配息是否達補充保費門檻
    nhi() {
      const since = autodivAddDays(autodivYmd(new Date()), -365);
      const rows = (STATE.data.dividends || []).filter(r => r.person === STATE.defaultPerson && String(r.date || '').slice(0, 10) >= since)
        .sort((a, b) => String(a.date) < String(b.date) ? 1 : -1);
      const pend = computePendingDividends();
      if (!rows.length && !pend.length) return '<p class="muted small">近一年沒有配息記錄。</p>';
      const line = (sym, date, amt, tag) => `<tr><td>${escapeHtml(sym)}</td><td>${fmtD(date)}${tag || ''}</td><td class="town-num">${fmt.money(amt)}</td><td>${amt >= 20000 ? '<b>可能要扣</b>' : '不用'}</td></tr>`;
      return `<table class="ex-table"><tr><th>代號</th><th>日期</th><th>金額</th><th>補充保費</th></tr>
        ${pend.map(p => line(p.symbol, p.payDate, p.gross, '(待入帳)')).join('')}
        ${rows.slice(0, 8).map(r => line(r.symbol, String(r.date).slice(0, 10), Number(r.total) || 0)).join('')}</table>
        <p class="muted small">判斷用的是「單次發放金額」,不是全年加總。實際扣多少,要看這次配息裡「股利所得」占多少(收益平準金、資本利得不扣),以入帳金額為準。</p>`;
    },
    // 交易成本:已付手續費、現在全部賣出要付的證交稅與手續費
    cost() {
      const mine = (STATE.data.purchases || []).filter(r => r.person === STATE.defaultPerson);
      const fees = mine.reduce((a, r) => a + (Number(r.fee) || 0), 0);
      const buys = mine.filter(r => Number(r.shares) > 0).length;
      const items = townItems(STATE.defaultPerson);
      const value = items.reduce((a, it) => a + it.value, 0);
      return `<table class="ex-table"><tr><td>買賣筆數</td><td>${mine.length} 筆(買進 ${buys} 筆)</td></tr>
        <tr><td>已付手續費合計</td><td class="town-num">${fmt.money(fees)} 元</td></tr>
        <tr><td>目前市值</td><td class="town-num">${fmt.money(value)} 元</td></tr>
        <tr><td>若現在全部賣出:證交稅(ETF 0.1%)</td><td class="town-num">約 ${fmt.money(value * 0.001)} 元</td></tr>
        <tr><td>若現在全部賣出:手續費(0.1425%,未打折)</td><td class="town-num">約 ${fmt.money(value * 0.001425)} 元</td></tr></table>
        <p class="muted small">證交稅以 ETF 的 0.1% 估算(個股是 0.3%);手續費多數券商電子下單有折扣,實際以券商為準。</p>`;
    },
    // 每檔的殖利率(以成本計)
    yield() {
      const items = townItems(STATE.defaultPerson);
      if (!items.length) return '<p class="muted small">目前沒有持股。</p>';
      return `<table class="ex-table"><tr><th>代號</th><th>持有成本</th><th>近一年配息</th><th>殖利率(成本)</th></tr>${items.map(it => {
        const t12 = trailing12Dividends(STATE.defaultPerson).bySym[it.sym] || 0;
        return `<tr><td>${escapeHtml(it.sym)}</td><td class="town-num">${fmt.money(it.cost)}</td><td class="town-num">${fmt.money(t12)}</td><td>${it.yld ? it.yld.toFixed(2) + '%' : '—'}</td></tr>`;
      }).join('')}</table><p class="muted small">「殖利率(成本)」= 近一年實際領到的配息 ÷ 你的買進成本。持有不滿一年的,數字會偏低。</p>`;
    }
  };

  // ---------- 自動化工坊島:工具一覽(放在課程清單上方) ----------
  function renderAutoIntro() {
    if (typeof AUTO_TOOLS === 'undefined' || !AUTO_TOOLS.tools.length) return '';
    return `<details class="ex-auto"><summary><b>🧰 串接工具一覽</b> <span class="muted small">(點開比較,查證日期 ${escapeHtml(AUTO_TOOLS.checkedDate)})</span></summary>
      ${AUTO_TOOLS.tools.map(t => `<div class="ex-tool"><div class="ex-thead"><b>${escapeHtml(t.name)}</b>
        <span class="ex-stars" title="上手難度 ${t.difficulty}/5">難度 ${'●'.repeat(t.difficulty)}${'○'.repeat(5 - t.difficulty)}</span></div>
        <div>${escapeHtml(t.what)}</div>
        <div class="ex-tags">${t.strengths.map(x => `<span class="ex-tag">💪 ${escapeHtml(x)}</span>`).join('')}</div>
        <div class="small"><b>適合:</b>${escapeHtml(t.bestFor)}</div>
        <div class="small"><b>免費:</b>${escapeHtml(t.free)}</div>
        <div class="small"><b>付費:</b>${escapeHtml(t.paid)}</div>
        ${/^https:\/\//.test(t.url) ? `<a class="small" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">官方網站 ↗</a>` : ''}</div>`).join('')}
    </details>`;
  }

  // ---------- AI 工具島:工具卡 ----------
  const TOOL_CATS = ['全部', '聊天助理', '圖片', '影片與音樂', '工作效率', '寫程式', '怎麼選'];
  function renderTools() {
    if (!AI_TOOLS.tools.length) return '<p class="muted">工具資料整理中…</p>';
    const cat = EXPLORE.toolCat;
    const chips = `<div class="ex-chips">${TOOL_CATS.map(c => `<button type="button" class="chip${c === cat ? ' active' : ''}" data-tcat="${c}">${c}</button>`).join('')}</div>`;
    const note = `<p class="muted small">資料查證日期:${escapeHtml(AI_TOOLS.checkedDate)}。AI 工具的價格和功能變化很快,使用前請以官網為準。實用度是編者主觀評分(1–5)。</p>`;
    if (cat === '怎麼選') {
      return chips + note + `<div class="ex-choose">${AI_TOOLS.choose.map(r => `<div class="ex-crow"><b>${escapeHtml(r.need)}</b>
        <div>${r.picks.map(p => `<span class="ex-pick">${escapeHtml(p)}</span>`).join('')}</div><div class="muted small">${escapeHtml(r.why)}</div></div>`).join('')}</div>`;
    }
    const zhLabel = { good: '中文佳', ok: '中文可', limited: '中文弱' };
    const list = AI_TOOLS.tools.filter(t => cat === '全部' || t.category === cat);
    return chips + note + list.map(t => `<div class="ex-tool">
      <div class="ex-thead"><div><b>${escapeHtml(t.name)}</b> <span class="muted small">${escapeHtml(t.maker)}・${escapeHtml(t.category)}</span></div>
        <div class="ex-stars" title="實用度 ${t.score}/5">${'★'.repeat(t.score)}${'☆'.repeat(5 - t.score)}</div></div>
      <div>${escapeHtml(t.what)}</div>
      <div class="ex-tags">${t.strengths.map(x => `<span class="ex-tag">💪 ${escapeHtml(x)}</span>`).join('')}</div>
      <div class="small"><b>適合:</b>${t.bestFor.map(escapeHtml).join('、')}</div>
      <div class="small"><b>免費:</b>${escapeHtml(t.free)}</div>
      <div class="small"><b>付費:</b>${escapeHtml(t.paid)}</div>
      <div class="small"><b>${zhLabel[t.zh] || ''}</b>${t.zhNote ? ':' + escapeHtml(t.zhNote) : ''}</div>
      <div class="small"><b>要注意:</b>${t.weakness.map(escapeHtml).join(';')}</div>
      <div class="small muted">實用度 ${t.score}/5:${escapeHtml(t.scoreWhy)}</div>
      ${/^https:\/\//.test(t.url) ? `<a class="small" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">官方網站 ↗</a>` : ''}
    </div>`).join('');
  }
  function bindToolsUi(box) {
    box.querySelectorAll('[data-tcat]').forEach(b => { b.onclick = () => { EXPLORE.toolCat = b.dataset.tcat; renderExplorePanel(); }; });
  }

  // ---------- 進入探索分頁 ----------
  async function exploreShow() {
    renderExplorePanel();
    if (EXPLORE.failed) return;
    if (!EXPLORE.s) {
      try {
        await town3dLoadThree();
        const canvas = document.createElement('canvas');
        canvas.id = 'explore-canvas';
        $('#explore-stage').prepend(canvas);
        exploreBuild(canvas);
        window.addEventListener('resize', exploreResize);
        $('#explore-back').onclick = () => exploreSelect(null);
      } catch (e) {
        EXPLORE.failed = true;               // 不支援 3D:只留下面的島嶼清單
        $('#explore-stage').classList.add('hidden');
        return;
      }
    }
    exploreResize();
    exploreRefreshLabels();
    exploreStart();
  }

  // APP 回到前景時接回繪圖
  setInterval(() => { if (EXPLORE.s && !EXPLORE.s.raf && exploreVisible()) exploreStart(); }, 800);
