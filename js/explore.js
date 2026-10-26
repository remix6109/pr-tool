/* 探索分頁 — 3D 群島地圖。點一座島,鏡頭飛過去,下方展開那座島的內容。
 * AI 入門島(課程+測驗,進度存在這台裝置)、AI 工具島(工具卡)、小鎮島(連到首頁 3D 小鎮)、
 * 配息島/市場島(捷徑)、自動化工坊島/理財知識島(即將推出)。
 * three.js 共用 town3d.js 的載入;不支援 3D 時只顯示下方的島嶼清單。只在探索分頁顯示時繪圖。
 * 內容資料在 explore-data.js。所有檔案共用全域範圍,載入順序見 index.html */

  const EXPLORE = { s: null, sel: null, lesson: null, toolCat: '全部', failed: false };
  const EXPLORE_ISLANDS = [
    { id: 'ai-intro', name: 'AI 入門島', icon: '🤖', desc: 'AI 是什麼、會錯在哪、怎麼問才問得好', x: -7.5, z: -3, kind: 'robot', land: '#9DC88A' },
    { id: 'ai-tools', name: 'AI 工具島', icon: '🧰', desc: '各家 AI 工具的強項、價格與實用度', x: 0.5, z: -7.5, kind: 'tools', land: '#A9C98C' },
    { id: 'auto', name: '自動化工坊島', icon: '⚙️', desc: '把 AI 串起來自動做事', x: 8, z: -3, kind: 'gears', land: '#B9BFA0', soon: true },
    { id: 'town', name: '小鎮島', icon: '🏙️', desc: '你的 3D 持股小鎮', x: -3.5, z: 4.5, kind: 'town', land: '#8DB86E' },
    { id: 'dividend', name: '配息島', icon: '💰', desc: '待確認配息與配息行事曆', x: 4.5, z: 5, kind: 'coins', land: '#D8C48E' },
    { id: 'market', name: '市場島', icon: '🌊', desc: '三大法人、夜盤與國際市場', x: 11, z: 5.5, kind: 'lighthouse', land: '#9DC88A' },
    { id: 'finance', name: '理財知識島', icon: '📚', desc: '除息、填息、補充保費一次搞懂', x: -11, z: 5, kind: 'books', land: '#A9C98C', soon: true }
  ];

  // ---------- 學習進度(存在這台裝置) ----------
  function learnProgress() {
    try { return JSON.parse(localStorage.getItem('pr.learn') || '{}'); } catch (_) { return {}; }
  }
  function learnSave(p) { try { localStorage.setItem('pr.learn', JSON.stringify(p)); } catch (_) {} }
  const learnDoneCount = () => AI_LESSONS.filter(l => learnProgress()[l.id]).length;

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

    // 一艘繞著群島的小船
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.45), flat('#7A5432')); hull.position.y = 0.0;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.95, 3), flat('#F4F1EA')); sail.position.y = 0.6;
    boat.add(hull, sail); boat.children.forEach(c => { c.castShadow = true; });
    scene.add(boat);

    EXPLORE.s = {
      renderer, scene, camera, islands, spin, boat, raf: 0, prev: 0, t: 0, lastTouch: 0,
      cam: { theta: Math.PI / 2, phi: 0.92, dist: 32 },
      target: new THREE.Vector3(0, 0, 0), want: { x: 0, z: 0, dist: 32 }
    };
    exploreBindControls(canvas);
  }

  function exploreLabelLines(def) {
    const sub = def.soon ? '即將推出' : def.id === 'ai-intro' ? `已完成 ${learnDoneCount()}/${AI_LESSONS.length} 課` : def.desc.slice(0, 11);
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
    if (s && !def) s.want = { x: 0, z: 0, dist: 32 };
    $('#explore-back').classList.toggle('hidden', !def);
    renderExplorePanel();
    if (def) $('#explore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exploreRefreshLabels() {
    if (!EXPLORE.s) return;
    EXPLORE.s.islands.forEach(it => it.label.draw(exploreLabelLines(it.def)));
  }

  function goPage(page) {
    const b = document.querySelector(`.nav-btn[data-page="${page}"]`);
    if (b) b.click();
  }
  function goHomeCard(sel) {
    goPage('home');
    setTimeout(() => {
      const card = $(sel);
      if (!card) return;
      if (card.classList.contains('collapsed')) { const t = card.querySelector('.card-title'); if (t) t.click(); }
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  function renderExplorePanel() {
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
    if (def.id === 'ai-intro') body = EXPLORE.lesson ? renderLesson(EXPLORE.lesson) : renderLessonList();
    else if (def.id === 'ai-tools') body = renderTools();
    else if (def.id === 'town') body = `<p>你的持股小鎮在首頁:一筆買進一層樓,展開時會從第一筆自動播到今天。</p><button type="button" class="btn primary wide" data-go="town">🏙️ 前往我的小鎮</button>`;
    else if (def.id === 'dividend') body = `<p>待確認配息、配息行事曆都在首頁。</p><button type="button" class="btn primary wide" data-go="dividend">💰 看配息行事曆</button>`;
    else if (def.id === 'market') body = `<p>三大法人買進/賣出、台指期夜盤、國際市場與財經新聞。</p><button type="button" class="btn primary wide" data-go="market">🌊 前往市場頁</button>`;
    else if (def.id === 'auto') body = `<p class="muted">這座島正在建設中,預計會有:</p><ul class="ex-ul"><li>n8n、Make、Zapier、Apple 捷徑是什麼、怎麼選</li><li>AI 代理人(agent)與 MCP 的白話說明</li><li>實作範例:每天自動整理新聞傳到 LINE、YouTube 影片自動做筆記、拍收據自動記帳</li></ul>`;
    else if (def.id === 'finance') body = `<p class="muted">這座島正在建設中,預計會有:</p><ul class="ex-ul"><li>除息、填息、殖利率是什麼</li><li>補充保費怎麼算、什麼時候會扣</li><li>ETF 成分股、月配與季配的差別(用你自己的持股當例子)</li></ul>`;
    box.innerHTML = `<div class="ex-head"><div class="card-title" style="margin:0;">${def.icon} ${escapeHtml(def.name)}</div>
      <button type="button" class="btn ghost small" id="ex-back2">← 地圖</button></div>${body}`;
    $('#ex-back2').onclick = () => (EXPLORE.lesson ? (EXPLORE.lesson = null, renderExplorePanel()) : exploreSelect(null));
    box.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const go = b.dataset.go;
        if (go === 'town') { if (typeof TOWN3D !== 'undefined') TOWN3D.grow = true; goHomeCard('#card-town'); }
        else if (go === 'dividend') goHomeCard('[data-collapse="payout"]');
        else goPage('market');
      };
    });
    if (def.id === 'ai-intro') bindLessonUi(box);
    if (def.id === 'ai-tools') bindToolsUi(box);
  }

  // ---------- AI 入門島:課程 ----------
  function renderLessonList() {
    const prog = learnProgress();
    return `<p class="muted small">${AI_LESSONS.length} 堂短課,每堂約 3 分鐘,最後有小測驗。進度存在這台裝置。</p>
      <div class="ex-list">${AI_LESSONS.map((l, i) => {
        const p = prog[l.id];
        return `<button type="button" class="ex-item" data-lesson="${l.id}"><span class="ex-ico">${l.icon}</span>
          <span><b>第 ${i + 1} 課 ${escapeHtml(l.title)}</b>${p ? ` <span class="ex-done">✓ ${p.score}/${p.total}</span>` : ''}<br><span class="muted small">${escapeHtml(l.intro)}</span></span></button>`;
      }).join('')}</div>`;
  }

  function renderLesson(id) {
    const l = AI_LESSONS.find(x => x.id === id);
    const idx = AI_LESSONS.indexOf(l);
    return `<div class="ex-lesson">
      <h3>${l.icon} 第 ${idx + 1} 課 ${escapeHtml(l.title)}</h3>
      <p class="muted">${escapeHtml(l.intro)}</p>
      ${l.sections.map(sec => `<h4>${escapeHtml(sec.h)}</h4><p>${escapeHtml(sec.p)}</p>`).join('')}
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
    const l = AI_LESSONS.find(x => x.id === EXPLORE.lesson);
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
            const next = AI_LESSONS[AI_LESSONS.indexOf(l) + 1];
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
