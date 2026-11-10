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
    STEP: 0.75,           // 每個有買進/配息的日子停留秒數(事件很多時自動縮短,總長約 40 秒內)
    STEP_DIV: 0.35,       // 有配息的日子多停一點
    MAX_TOTAL: 40,
    LEAD: 1.4,            // 開頭留給第一個特效飛/走的時間
    FLY: 0.75,            // 買進:建材箱飛到大樓的秒數
    WALK: 1.3,            // 配息:小人走到中央的秒數
    MAX_H: 9,             // 最高那棟的高度
    MIN_FLOOR: 0.16,      // 金額很小的那層至少這麼厚,才點得到
    YEAR_COLORS: ['#FFF4E2', '#FFE3C4', '#FFD0B0', '#FFC2AC', '#FAB0B0', '#F2A7B8']   // 越早越淺:奶油 → 蜜桃 → 珊瑚 → 玫瑰
  };
  // 配色:白天是晴朗的粉彩藍天,深色模式是有星星的紫色夜晚(窗戶和路燈會亮);陰天、下雨再往灰色靠
  const TOWN3D_PAL = {
    day: { skyTop: '#8FBDF0', skyMid: '#C9E2F7', skyLow: '#FDEBD9', sea: '#7CC3CC', shallow: '#A8E2DA', sand: '#F0D6A8', earth: '#D8B48C',
      grass: '#BFE0A0', grass2: '#A6D389', path: '#F2E3C4', plaza: '#FAF0DE', grey: '#B4BCC8', cloud: '#FFFFFF', rainCloud: '#C2CAD4',
      hemiSky: '#FFF4EC', hemiGround: '#B4A696', sun: '#FFE8D0', sunI: 1.6, hemiI: 0.36, exposure: 1.0, lamp: 0.25 },
    night: { skyTop: '#141633', skyMid: '#2A2552', skyLow: '#4E3E66', sea: '#3D3A5E', shallow: '#5B5A82', sand: '#A8998F', earth: '#6E5A68',
      grass: '#5C7C6A', grass2: '#4F6F60', path: '#9A8E84', plaza: '#B0A69C', grey: '#3A3C4C', cloud: '#8C86B8', rainCloud: '#5E5A80',
      hemiSky: '#D2CAF2', hemiGround: '#3A2A44', sun: '#E2DAFF', sunI: 0.8, hemiI: 0.45, exposure: 1.15, lamp: 3.0 }
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
    const bySym = {}, stacks = {};
    rows.forEach(r => {
      const sym = String(r.symbol), shares = Number(r.shares) || 0, amount = Number(r.amount) || 0;
      const date = String(r.date || '').slice(0, 10);
      const floors = bySym[sym] || (bySym[sym] = []);
      const stack = stacks[sym] || (stacks[sym] = []);
      if (shares > 0 && amount >= 0) {
        const fl = { date, shares, money: amount + (Number(r.fee) || 0) };
        floors.push(fl); stack.push(fl);
      } else {
        // 賣出:從最上面的樓層開始拆,整層賣掉的記下賣出日(播放時那天拆掉);只賣一部分的直接縮小
        // (只是畫面呈現;成本計算仍以 portfolio.js 為準)
        let left = Math.abs(shares);
        while (left > 0 && stack.length) {
          const top = stack[stack.length - 1];
          if (top.shares <= left) { left -= top.shares; top.gone = date; stack.pop(); }
          else { top.money *= (top.shares - left) / top.shares; top.shares -= left; left = 0; }
        }
      }
    });
    return bySym;
  }

  // ---------- 素材 ----------
  // 窗戶貼圖:一張 4 扇 × 2 排。map = 白天的樣子(牆的顏色由材質決定);glow = 晚上哪幾扇亮著(有幾扇是暗的,才不會整面一樣)
  function town3dWindowTex() {
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.encoding = THREE.sRGBEncoding;
      return t;
    };
    const cells = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) cells.push([5 + k * 32, 9 + r * 64, 22, 42]);
    const rr = (g, x, y, w, h, rad) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, rad) : g.rect(x, y, w, h); g.fill(); };
    const map = mk(g => {
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128);
      cells.forEach(([x, y, w, h]) => {
        g.fillStyle = 'rgba(90,70,60,.10)'; g.fillRect(x - 3, y + h + 3, w + 6, 3);          // 窗台的影子
        g.fillStyle = '#8E9AA6'; rr(g, x, y, w, h, 4);                                        // 窗框
        const gr = g.createLinearGradient(x, y, x + w, y + h);
        gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#D6ECF7');   // 貼圖會乘上牆的顏色,玻璃要夠淺才不會變髒
        g.fillStyle = gr; rr(g, x + 2, y + 2, w - 4, h - 4, 3);                               // 玻璃
        g.fillStyle = 'rgba(150,200,230,.35)'; g.beginPath(); g.moveTo(x + 3, y + h - 3); g.lineTo(x + w - 3, y + 12); g.lineTo(x + w - 3, y + h - 3); g.fill();   // 玻璃下半的淡藍
        g.fillStyle = '#A9B4BE'; g.fillRect(x + 2, y + h / 2 - 1, w - 4, 2);                  // 窗格
        g.fillStyle = '#F6EFE3'; g.fillRect(x - 2, y + h, w + 4, 3);                          // 窗台
      });
    });
    const glow = mk(g => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
      cells.forEach(([x, y, w, h], i) => {
        if (i === 2 || i === 5) return;                                                       // 這兩扇沒開燈
        g.fillStyle = i % 3 ? '#FFFFFF' : '#C9C9C9'; rr(g, x + 2, y + 2, w - 4, h - 4, 3);
      });
    });
    return { map, glow };
  }

  function town3dLabel() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 104;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(2.9, 1.18, 1);
    sp.renderOrder = 10;
    sp.layers.set(1);   // 看板在柔光算完之後才畫(見 luxRender),字才不會糊、也不會發光
    sp.draw = (title, sub, subColor) => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 104);
      g.shadowColor = 'rgba(50,35,60,.28)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
      g.fillStyle = 'rgba(255,255,255,.96)';
      g.beginPath(); g.roundRect ? g.roundRect(12, 8, 232, 84, 26) : g.rect(12, 8, 232, 84); g.fill();
      g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.textAlign = 'center';
      g.fillStyle = '#3A3142'; g.font = 'bold 38px system-ui, sans-serif'; g.fillText(title, 128, 49);
      g.fillStyle = subColor || '#6B6472'; g.font = '25px system-ui, sans-serif'; g.fillText(sub, 128, 80);
      tex.needsUpdate = true;
    };
    return sp;
  }

  // 天空:依天氣調整(陰天、下雨往灰色靠);晴朗的夜晚有星星
  function town3dSetSky(kind) {
    const s = TOWN3D.s, P = s.pal;
    if (s.scene.background && s.scene.background.dispose) s.scene.background.dispose();
    s.scene.background = luxWeatherSky(P, kind, s.dark);
  }

  // 草地貼圖:草的深淺色塊、從廣場通到每棟大樓的小路、環狀步道、花
  // 圓柱頂面的貼圖座標:u 對應 z、v 對應 x(畫布的 y 要反過來)
  function town3dGroundTex(P, R, RG, angles, size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const X = (x, z) => (z / (2 * RG) + 0.5) * size, Y = (x, z) => (0.5 - x / (2 * RG)) * size, S = (r) => r / (2 * RG) * size;
    const rnd = luxRand(angles.length * 53 + 11);
    g.fillStyle = P.grass; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * RG, x = Math.cos(a) * r, z = Math.sin(a) * r, rad = S(0.6 + rnd() * 1.4);
      const gr = g.createRadialGradient(X(x, z), Y(x, z), 0, X(x, z), Y(x, z), rad);
      gr.addColorStop(0, P.grass2); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55; g.fillStyle = gr; g.beginPath(); g.arc(X(x, z), Y(x, z), rad, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = P.path; g.lineCap = 'round';
    g.lineWidth = S(0.55);
    g.beginPath(); g.arc(X(0, 0), Y(0, 0), S(R - 1.75), 0, Math.PI * 2); g.stroke();     // 環狀步道
    g.lineWidth = S(0.8);
    angles.forEach(a => {
      g.beginPath(); g.moveTo(X(Math.cos(a) * 1.8, Math.sin(a) * 1.8), Y(Math.cos(a) * 1.8, Math.sin(a) * 1.8));
      g.lineTo(X(Math.cos(a) * (R - 0.9), Math.sin(a) * (R - 0.9)), Y(Math.cos(a) * (R - 0.9), Math.sin(a) * (R - 0.9))); g.stroke();
    });
    g.fillStyle = P.path;
    g.beginPath(); g.arc(X(0, 0), Y(0, 0), S(2.75), 0, Math.PI * 2); g.fill();               // 廣場外圈
    angles.forEach(a => { g.beginPath(); g.arc(X(Math.cos(a) * R, Math.sin(a) * R), Y(Math.cos(a) * R, Math.sin(a) * R), S(1.75), 0, Math.PI * 2); g.fill(); });   // 大樓前的空地
    ['#F7A8BE', '#FFE08A', '#FFFFFF', '#CDBBFF'].forEach((c, k) => {
      g.fillStyle = c;
      for (let i = 0; i < 45; i++) {
        const a = rnd() * Math.PI * 2, r = R + 1.4 + rnd() * 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r;
        g.beginPath(); g.arc(X(x, z), Y(x, z), S(0.05 + (k % 2) * 0.02), 0, Math.PI * 2); g.fill();
      }
    });
    const edge = g.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size / 2);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(60,40,30,.16)');
    g.fillStyle = edge; g.fillRect(0, 0, size, size);                                         // 邊緣稍微壓暗,島才有厚度感
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function town3dInit(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const hq = luxSetup(renderer);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.4);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(hq ? 2048 : 1024, hq ? 2048 : 1024);
    sun.shadow.bias = -0.0005;
    scene.add(hemi, sun, camera);
    const content = new THREE.Group();
    scene.add(content);
    const win = town3dWindowTex();
    TOWN3D.s = {
      renderer, scene, camera, sun, hemi, content, winTex: win.map, winGlow: win.glow, hq, post: hq ? luxPostInit(renderer) : null, perf: { n: 0, sum: 0 },
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
      o.traverse(x => {
        if (x.geometry) x.geometry.dispose();
        [].concat(x.material || []).forEach(m => {
          ['map', 'emissiveMap', 'alphaMap'].forEach(k => { if (m[k] && m[k] !== s.winTex && m[k] !== s.winGlow) m[k].dispose(); });
          m.dispose();
        });
      });
    });
    const floorsBy = town3dFloors(person);
    const order = items.map(it => it.sym).filter(sym => floorsBy[sym]);
    Object.keys(floorsBy).forEach(sym => { if (!order.includes(sym)) order.push(sym); });
    const n = order.length, R = Math.max(4.6, n * 0.95);
    s.R = R;
    const dark = document.documentElement.dataset.theme === 'dark';
    const P = dark ? TOWN3D_PAL.night : TOWN3D_PAL.day;
    s.pal = P; s.dark = dark;
    s.renderer.toneMappingExposure = P.exposure;
    s.hemi.color.copy(luxLin(P.hemiSky)); s.hemi.groundColor.copy(luxLin(P.hemiGround)); s.sun.color.copy(luxLin(P.sun));
    s.scene.fog = null;
    town3dSetSky(null);
    const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: luxLin(color), roughness: 0.9 }, extra || {}));
    const flat = (color, extra) => {   // 道具:粉彩化、平面著色(低多邊形的切面感)
      extra = Object.assign({}, extra || {});
      if (typeof extra.emissive === 'string') extra.emissive = luxLin(extra.emissive);
      return new THREE.MeshStandardMaterial(Object.assign({ color: luxPastel(color, dark), flatShading: true, roughness: 0.85 }, extra));
    };
    const put = (m, x, y, z, shadow = true) => { m.position.set(x, y, z); m.castShadow = shadow; s.content.add(m); return m; };

    // 海(往外淡出到天空的漸層,沒有地平線)→ 淺水 → 沙灘 → 草地
    const TOP = 0.45, RG = R + 3.2;
    const angles = order.map((_, i) => (i / n) * Math.PI * 2 + Math.PI / 2);
    const disc = (r, y, color, opacity, extra) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), mat(color, Object.assign({ roughness: 0.5, transparent: true, opacity, depthWrite: false }, extra || {})));
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; s.content.add(m);
    };
    disc(RG * 3.4, -0.75, P.sea, 1, { metalness: 0.05, alphaMap: luxFadeTex() });
    disc(RG + 3.6, -0.72, P.shallow, 0.35);
    disc(RG + 2.5, -0.69, P.shallow, 0.5);
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(RG + 0.95, RG + 1.6, 1.0, 64), mat(P.sand, { roughness: 1 }));
    sand.receiveShadow = true; put(sand, 0, -0.22, 0);
    const earth = mat(P.earth, { roughness: 1 });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(RG, RG + 0.28, 0.34, 64),
      [earth, mat('#FFFFFF', { map: town3dGroundTex(P, R, RG, angles, s.hq ? 1024 : 512), roughness: 0.95 }), earth]);
    island.receiveShadow = true; put(island, 0, TOP - 0.17, 0);
    // 中央廣場(金幣堆放在這裡)
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.05, 0.12, 40), mat(P.plaza, { roughness: 0.7 }));
    plaza.receiveShadow = true; put(plaza, 0, TOP + 0.06, 0, false);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.93, 0.06, 8, 48), mat(P.path, { roughness: 0.7 }));
    rim.rotation.x = Math.PI / 2; put(rim, 0, TOP + 0.12, 0, false);

    // 點綴:外圈的樹、矮叢、石頭,廣場旁的路燈(晚上會亮)
    const rnd = luxRand(n * 31 + 7);
    const greens = dark ? ['#4E8266', '#5A9070', '#44785E', '#679A74'] : ['#6FAF6A', '#7DBA78', '#5E9F6E', '#8CC07A'];
    const nearPath = (a) => angles.some(b => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.5 / Math.max(1, n / 6));
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2, r = R + 1.5 + rnd() * 1.45, k = 0.6 + rnd() * 0.6, x = Math.cos(a) * r, z = Math.sin(a) * r, t = rnd();
      if (r < R + 1.9 && nearPath(a)) continue;   // 大樓正後方留空,才不會擋到
      if (t < 0.45) {
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * k, 0.09 * k, 0.4 * k, 6), flat('#9A6A4A')), x, TOP + 0.2 * k, z);
        put(new THREE.Mesh(new THREE.ConeGeometry(0.42 * k, 1.1 * k, 7), flat(greens[i % 4])), x, TOP + 0.85 * k, z);
      } else if (t < 0.7) {
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * k, 0.09 * k, 0.5 * k, 6), flat('#9A6A4A')), x, TOP + 0.25 * k, z);
        put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.48 * k, 1), flat(greens[i % 4])), x, TOP + 0.85 * k, z).scale.y = 0.9;
      } else if (t < 0.9) {
        put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 * k, 0), flat(greens[(i + 1) % 4])), x, TOP + 0.16 * k, z).scale.y = 0.75;
      } else {
        put(new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * k, 0), flat('#C9BFB6')), x, TOP + 0.1, z);
      }
    }
    const lampN = Math.min(6, Math.max(3, Math.round(n / 2)));
    for (let i = 0; i < lampN; i++) {
      const a = (i + 0.5) / lampN * Math.PI * 2, x = Math.cos(a) * 2.45, z = Math.sin(a) * 2.45;
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.95, 6), flat('#6B6472')), x, TOP + 0.47, z);
      put(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: luxLin('#FFF3C8'), emissive: luxLin('#FFD98A'), emissiveIntensity: P.lamp, roughness: 0.4 })), x, TOP + 1.02, z, false);
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
    const slabGeo = new THREE.BoxGeometry(1.7, 0.05, 1.7), slabMat = mat(dark ? '#6E5A68' : '#D2BBAA', { roughness: 0.8 });
    const chgColor = (it) => {
      if (!it) return '#B7C0BF';
      if (TOWN.mode === 'chg') return it.chg === null ? '#B7C0BF' : it.chg > 0 ? '#E5604F' : it.chg < 0 ? '#46AD63' : '#B7C0BF'   /* 台股習慣:紅漲綠跌 */;
      return !it.yld ? '#B7C0BF' : it.yld >= 6 ? '#3F7373' : it.yld >= 3 ? '#6E9AA0' : '#B7C0BF';
    };
    // 樓層材質:同一年、同樣排數的共用一份。晚上窗戶會亮(emissiveMap)
    const floorMats = {};
    const floorMat = (year, rows) => {
      const key = year + '|' + rows;
      if (floorMats[key]) return floorMats[key];
      const tex = s.winTex.clone(); tex.needsUpdate = true; tex.repeat.set(1, rows / 2);
      const o = { color: luxLin(yearColor(year)), map: tex, roughness: 0.8 };
      if (dark) {
        const gl = s.winGlow.clone(); gl.needsUpdate = true; gl.repeat.set(1, rows / 2);
        Object.assign(o, { emissive: luxLin('#FFD890'), emissiveMap: gl, emissiveIntensity: 1.1 });
      }
      return (floorMats[key] = new THREE.MeshStandardMaterial(o));
    };
    const awnings = ['#F6A8BC', '#9CCFE6', '#FFD98A', '#B8E0A8'];
    order.forEach((sym, i) => {
      const a = angles[i];
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * R, TOP, Math.sin(a) * R);
      g.rotation.y = -a + Math.PI / 2;
      s.content.add(g);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 2.1), mat(P.plaza, { roughness: 0.75 }));
      base.position.y = 0.04; base.receiveShadow = true; g.add(base);
      // 門口(朝向廣場那一面):門、遮雨棚、兩盆矮樹。樓還沒蓋起來時先藏著
      const extras = new THREE.Group();
      const ex = (m, x, y2, z) => { m.position.set(x, y2, z); m.castShadow = true; extras.add(m); return m; };
      ex(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), flat('#8A5A44')), 0, 0.33, -0.82);
      ex(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.34), flat(awnings[i % 4])), 0, 0.68, -0.95).rotation.x = -0.35;
      [-0.62, 0.62].forEach(x => {
        ex(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 8), flat('#C98F6A')), x, 0.15, -0.93);
        ex(new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), flat(greens[i % 4])), x, 0.33, -0.93);
      });
      g.add(extras);
      let y = 0.08;
      const myFloors = [];
      floorsBy[sym].forEach((f, k) => {
        const h = Math.max(TOWN3D.MIN_FLOOR, f.money / unit);
        const m = new THREE.Mesh(geo, floorMat(f.date.slice(0, 4), Math.max(1, Math.round(h / 0.55))));
        m.scale.set(1.6, Math.max(0.001, h - 0.035), 1.6);
        m.position.y = y;
        m.castShadow = m.receiveShadow = true;
        m.userData = { kind: 'floor', sym, floor: k + 1, total: floorsBy[sym].length, f };
        g.add(m);
        // 每層上緣一片深色樓板,層與層才分得出來
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.castShadow = true;
        g.add(slab);
        const rec = { m, slab, h: h - 0.035, date: f.date, sym, f };
        allFloors.push(rec); myFloors.push(rec);
        s.picks.push(m);
        if (!f.gone) y += h;
      });
      const it = items.find(x => x.sym === sym);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.8), mat(chgColor(it), { roughness: 0.7 }));
      roof.position.y = y + 0.08; roof.castShadow = true; g.add(roof);
      // 屋頂上的小東西(跟著屋頂一起升高):水塔、冷氣機、天線
      const rt = (m, x, y2, z) => { m.position.set(x, y2, z); m.castShadow = true; roof.add(m); return m; };
      rt(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10), flat('#EDE6DA')), -0.45, 0.27, 0.4);
      rt(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.12, 10), flat('#C9BFB6')), -0.45, 0.48, 0.4);
      rt(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), flat('#D9DEE2')), 0.35, 0.18, 0.45);
      rt(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5), flat('#6B6472')), -0.6, 0.38, -0.55);
      rt(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: luxLin('#FF8A7A'), emissive: luxLin('#FF4A3A'), emissiveIntensity: dark ? 2 : 0.4 })), -0.6, 0.7, -0.55);
      const label = town3dLabel();
      label.final = it ? fmt.money(it.value) : '';
      label.draw(sym, TOWN3D.grow ? '' : label.final, '#5C6B6A');   // 播放中只顯示代號,播完才顯示今天市值
      s.labels.push({ label, sym });
      label.position.y = y + 1.05;
      g.add(label);
      g.userData = { roof, label, top: y, floors: myFloors, extras };
      s.bldg[sym] = g;
    });
    // 時間軸:從第一筆買進到今天,每層在實際買進的那天長出來、配息在入帳那天落進金幣堆
    allFloors.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const divRows = (STATE.data.dividends || []).filter(r => r.person === person && Number(r.total) > 0)
      .map(r => ({ date: String(r.date || '').slice(0, 10), money: Number(r.total), sym: String(r.symbol || '') }))
      .filter(r => r.date).sort((a, b) => a.date < b.date ? -1 : 1);
    const firstDate = [allFloors[0] && allFloors[0].date, divRows[0] && divRows[0].date].filter(Boolean).sort()[0] || autodivYmd(new Date());
    const t0 = Date.parse(firstDate);
    const t1 = Math.max(t0 + 864e5, Date.parse(autodivYmd(new Date())));
    s.t0 = t0; s.t1 = t1;
    const evDates = [...new Set(allFloors.map(x => x.date).concat(allFloors.filter(x => x.f.gone).map(x => x.f.gone), divRows.map(d => d.date)))].sort();
    const divDates = new Set(divRows.map(d => d.date));
    const raw = evDates.reduce((a, d) => a + TOWN3D.STEP + (divDates.has(d) ? TOWN3D.STEP_DIV : 0), 0);
    const k = raw > TOWN3D.MAX_TOTAL ? TOWN3D.MAX_TOTAL / raw : 1;
    const marks = [];                 // [日期毫秒, 播放秒數] 對照表,日期與時間互換用
    let cur = TOWN3D.LEAD;
    marks.push([t0 - 864e5, cur - 0.6]);
    evDates.forEach(d => {
      cur += (divDates.has(d) ? TOWN3D.STEP_DIV : 0) * k;
      marks.push([Date.parse(d), cur]);
      cur += TOWN3D.STEP * k;
    });
    marks.push([t1, cur]);
    s.marks = marks;
    s.dur = cur - TOWN3D.LEAD;
    const atOf = (date) => { const m = marks.find(x => x[0] === Date.parse(date)); return m ? m[1] : cur; };
    allFloors.forEach(x => { x.at = atOf(x.date); x.goneAt = x.f.gone ? atOf(x.f.gone) : Infinity; });
    s.groups = order.map(sym => s.bldg[sym]);
    divRows.forEach(d => { d.at = atOf(d.date); });
    s.floors = allFloors;
    s.divRows = divRows;
    s.events = allFloors.map(x => ({ at: x.at, sym: x.sym, kind: 'buy', amount: x.f.shares, html: `${x.date.replace(/-/g, '/')} 🏗️ 買進 <b>${escapeHtml(x.sym)}</b> ${fmt.money(x.f.shares)} 股` }))
      .concat(allFloors.filter(x => x.f.gone).map(x => ({ at: x.goneAt, sym: x.sym, kind: 'sell', amount: x.f.shares, html: `${x.f.gone.replace(/-/g, '/')} 📉 賣出 <b>${escapeHtml(x.sym)}</b> ${fmt.money(x.f.shares)} 股` })))
      .concat(divRows.map(d => ({ at: d.at, sym: d.sym, kind: 'div', amount: d.money, html: `${d.date.replace(/-/g, '/')} 💰 <b>${escapeHtml(d.sym)}</b> 配息 <span class="town-num">+${fmt.money(d.money)}</span>` })))
      .sort((a, b) => a.at - b.at);

    // 金幣堆(累積配息)
    const div = (STATE.data.dividends || []).filter(r => r.person === person).reduce((a, r) => a + (Number(r.total) || 0), 0);
    const MAXC = 260;
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.065, 12);
    const coinMat = new THREE.MeshStandardMaterial({ color: luxLin('#FFD447'), metalness: 0.35, roughness: 0.3, emissive: luxLin('#C08A00'), emissiveIntensity: 0.6 });
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

    town3dBannerClear();
    town3dDecorate(person, items);
    s.lastEv = -1; s.lastDay = ''; s.lastYear = ''; s.focusTheta = undefined;
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
    const ease = (v) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
    s.groups.forEach(g => {
      let y = 0.08;
      g.userData.floors.forEach(x => {
        const e = ease((t - x.at) / 0.35) * (1 - ease((t - x.goneAt) / 0.35));
        x.m.position.y = y;
        x.m.scale.y = Math.max(0.001, x.h * e);
        x.m.visible = x.slab.visible = e > 0.002;
        x.slab.position.y = y + x.m.scale.y;
        y += x.m.scale.y + 0.035 * e;
      });
      g.userData.roof.position.y = y + 0.08;
      g.userData.label.position.y = y + 1.05 + (g.userData.labelUp || 0);
      g.userData.roof.visible = y > 0.1;
      g.userData.label.visible = y > 0.1;
      g.userData.extras.visible = y > 0.1;
    });
    let cum = 0;
    s.divRows.forEach(d => { if (d.at <= t) cum += d.money; });
    s.pile.count = s.div > 0 ? Math.round(s.pileWant * Math.min(1, cum / s.div)) : 0;
    if (!s.playing) return;
    // 播放中:左上角日期和累計數字跟著跑,下方顯示剛發生的事
    town3dSpawnFx(t);
    const day = autodivYmd(new Date(town3dDateAt(t)));
    if (day !== s.lastDay) {
      s.lastDay = day;
      const cost = s.floors.reduce((a, x) => a + (x.at <= t && x.goneAt > t ? x.f.money : 0), 0);
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
      for (let i = Math.max(0, s.lastEv + 1); i <= ev; i++) town3dOnEvent(s.events[i], t);
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
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: luxLin(color), flatShading: true, roughness: 0.8 }, extra || {}));
    s.fxParts = {
      crateGeo: new THREE.BoxGeometry(0.5, 0.5, 0.5), crateMat: std('#D9A066'), bandGeo: new THREE.BoxGeometry(0.52, 0.1, 0.52), bandMat: std('#8A6040'),
      bodyGeo: new THREE.CylinderGeometry(0.12, 0.15, 0.4, 8), bodyMat: std('#5FA3A3'),
      headGeo: new THREE.SphereGeometry(0.13, 10, 8), headMat: std('#F7DCC0'),
      coinGeo: new THREE.CylinderGeometry(0.2, 0.2, 0.07, 14), coinMat: new THREE.MeshStandardMaterial({ color: luxLin('#FFD447'), metalness: 0.35, roughness: 0.3, emissive: luxLin('#C08A00'), emissiveIntensity: 0.7 })
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

  function town3dDateAt(t) {
    const m = TOWN3D.s.marks;
    if (t <= m[0][1]) return m[0][0] + 864e5;
    for (let i = 1; i < m.length; i++) {
      if (t <= m[i][1]) {
        const p = (t - m[i - 1][1]) / Math.max(1e-6, m[i][1] - m[i - 1][1]);
        return m[i - 1][0] + (m[i][0] - m[i - 1][0]) * p;
      }
    }
    return m[m.length - 1][0];
  }

  // 每個買進/配息發生的瞬間:浮出數字,鏡頭慢慢轉向那棟大樓
  function town3dOnEvent(e, t) {
    const s = TOWN3D.s;
    const g = s.bldg[e.sym];
    if (g) s.focusTheta = Math.atan2(g.position.z, g.position.x) + 0.55;
    const priv = typeof isPrivate === 'function' && isPrivate();
    if (e.kind === 'buy' && g) {
      const at = new THREE.Vector3(g.position.x, g.position.y + Math.max(0.6, g.userData.roof.position.y - 0.9), g.position.z);   // 從樓身浮到樓頂,避開看板
      town3dPopup(`+${fmt.money(e.amount)} 股`, '#2F5F66', at, t);   // 買進不代表賺賠,用中性色
    } else if (e.kind === 'sell' && g) {
      const at = new THREE.Vector3(g.position.x, g.position.y + Math.max(0.6, g.userData.roof.position.y - 0.9), g.position.z);
      town3dPopup(`-${fmt.money(e.amount)} 股`, '#5C6B6A', at, t);
    } else if (e.kind === 'div') {
      town3dPopup(priv ? '+配息' : `+${fmt.money(e.amount)}`, '#B07800', new THREE.Vector3(0, s.TOP + 1.4, 0), t);
    }
  }

  // 浮出的文字:往上飄、淡出
  function town3dPopup(text, color, at, t) {
    const s = TOWN3D.s;
    const c = document.createElement('canvas'); c.width = 256; c.height = 80;
    const g = c.getContext('2d');
    g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center';
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.95)'; g.strokeText(text, 128, 56);
    g.fillStyle = color; g.fillText(text, 128, 56);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sp.scale.set(2.6, 0.81, 1);
    sp.renderOrder = 20;
    sp.layers.set(1);
    s.content.add(sp);
    s.fx.push({ obj: sp, start: t, dur: 1.4, update(p) {
      sp.position.set(at.x, at.y + p * 0.9, at.z);
      sp.material.opacity = p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1;
    } });
  }

  // ---------- 加分效果:煙火、大字、天氣、除息旗子、待確認小人、賺賠光環 ----------
  function town3dBanner(html, cls) {
    const b = $('#town3d-banner');
    if (!b) return;
    b.className = 'town3d-banner ' + cls;
    b.innerHTML = html;
    void b.offsetWidth;            // 重新觸發動畫
    b.classList.add('show');
    // 播完就清掉:不清的話,卡片收起再展開時瀏覽器會重播動畫,一開場就閃出上一次的提示
    b.onanimationend = () => town3dBannerClear();
  }
  function town3dBannerClear() {
    const b = $('#town3d-banner');
    if (b) { b.classList.remove('show'); b.innerHTML = ''; }
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
    const flat = (color, extra) => {
      extra = Object.assign({}, extra || {});
      if (typeof extra.emissive === 'string') extra.emissive = luxLin(extra.emissive);
      return new THREE.MeshStandardMaterial(Object.assign({ color: luxLin(color), flatShading: true, roughness: 0.8 }, extra));
    };
    items.forEach(it => {
      const g = s.bldg[it.sym];
      if (!g) return;
      const top = g.userData.top;
      // 賺賠光環:紅 = 賺、綠 = 賠(台股習慣),越亮報酬率越高(和屋頂的「今日漲跌」不同,這是買進到現在的總報酬)
      if (it.cost > 0) {
        const ret = (it.value - it.cost) / it.cost;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 36),
          new THREE.MeshBasicMaterial({ color: luxLin(ret >= 0 ? '#FF5A47' : '#45D16A'), transparent: true, opacity: Math.min(0.95, 0.3 + Math.abs(ret) * 2.2), depthWrite: false }));
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
    const { chg, kind } = luxWeatherKind(items);
    const grp = new THREE.Group();
    s.camera.add(grp);
    const out = { kind, chg, grp, clouds: [], rain: null };
    if (kind === 'sun') {
      // 晴天:白天是太陽,晚上是月亮;亮到會被柔光暈開
      const sunM = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), new THREE.MeshBasicMaterial({ color: luxLin(s.dark ? '#FFF6DC' : '#FFE27A') }));
      sunM.position.set(7.5, 5.2, -24);
      const glow = luxGlowSprite(s.dark ? '226,220,255' : '255,226,150', s.dark ? 0.55 : 0.85);
      glow.scale.set(10, 10, 1);
      glow.position.set(7.5, 5.2, -24.2);
      grp.add(sunM, glow);
      out.glow = glow;
      out.sun = [sunM, glow];
      out.sun.forEach(m => { m.position.x = Math.min(7.5, 8.7 * s.camera.aspect - 2.4); });   // 畫面窄時往內收,才不會被切掉
    }
    if (kind === 'cloud' || kind === 'rain') {
      const cm = new THREE.MeshStandardMaterial({ color: luxLin(kind === 'rain' ? s.pal.rainCloud : s.pal.cloud), flatShading: true, roughness: 1 });
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Group();
        [[0, 0, 1.2], [1.1, -0.2, 0.9], [-1.1, -0.25, 0.85], [0.4, 0.5, 0.8]].forEach(([x, y, r]) => {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm); b.position.set(x, y, 0); b.scale.y = 0.75; c.add(b);
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
      out.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: luxLin('#CFE0F0'), size: 0.09, transparent: true, opacity: 0.8 }));
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
    town3dSetSky(on ? W.kind : null);
    const k = on ? luxWeatherLight(W.kind) : 1;
    s.sun.intensity = s.pal.sunI * k;
    s.hemi.intensity = s.pal.hemiI * (0.6 + 0.4 * k);
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
    if (W.glow) W.glow.material.opacity = 0.85 + Math.sin(d.t * 1.2) * 0.15;   // 光暈一呼一吸
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
    // 卡片真的顯示在畫面上才畫(在首頁,或被搬進探索頁的小鎮島)
    return !!(TOWN3D.s && card && !card.classList.contains('collapsed') && card.offsetParent !== null && document.visibilityState === 'visible');
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
    if (s.playing && s.focusTheta !== undefined && now - s.lastTouch > 3000) {
      let d = s.focusTheta - s.cam.theta;
      d = Math.atan2(Math.sin(d), Math.cos(d));      // 走最短的方向
      s.cam.theta += d * Math.min(1, dt * 1.6);
    } else if (now - s.lastTouch > 3000) s.cam.theta += dt * 0.1;
    const aspect = s.camera.aspect;
    const dist = Math.max(s.R * 4.3, (s.R + 4.4) / (0.364 * aspect) * 1.35);    // 畫面窄時拉遠(0.364 = tan 20°)
    const { theta, phi } = s.cam;
    s.camera.position.set(Math.cos(theta) * Math.sin(phi) * dist, Math.cos(phi) * dist + 1, Math.sin(theta) * Math.sin(phi) * dist);
    s.camera.lookAt(0, TOWN3D.MAX_H * 0.36, 0);
    luxRender(s);
    if (luxPerf(s, now)) town3dResize();   // 跑不動就自動關掉柔光
    s.raf = requestAnimationFrame(town3dFrame);
  }
  function town3dResize() {
    const s = TOWN3D.s;
    if (!s) return;
    const c = s.renderer.domElement, w = c.clientWidth || 320, h = c.clientHeight || 300;
    s.renderer.setSize(w, h, false);
    if (s.post) { const v = s.renderer.getDrawingBufferSize(new THREE.Vector2()); luxPostSize(s.post, v.x, v.y); }
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
    const W = s.deco && s.deco.weather;
    if (W && W.sun) W.sun.forEach(m => { m.position.x = Math.min(7.5, 8.7 * w / h - 2.4); });
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
    if (s.person !== person) { TOWN3D.grow = true; s.person = person; }   // 切換黃/蘇時也從頭播
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
    const soldFloors = s.floors.filter(x => x.f.gone).length;   // 已賣出拆掉的不算進樓層數
    s.summary = `${escapeHtml(getPersonLabel(person))}的小鎮:${items.length} 棟大樓、共 ${s.floors.length - soldFloors} 層(一筆買進一層${soldFloors ? `;另有 ${soldFloors} 層已賣出拆掉` : ''})。點樓層看那筆買進,點中間金幣看配息;左右滑動可以旋轉。`;
    if (!s.playing) town3dShow(null);
    town3dStart();
    return true;
  }

  // 換到首頁或 APP 回到前景時,把停掉的繪圖接回來
  setInterval(() => { if (TOWN3D.s && !TOWN3D.s.raf && town3dVisible()) town3dStart(); }, 800);
