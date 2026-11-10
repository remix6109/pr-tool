/* 3D 畫面共用的質感工具(持股小鎮、我的島都用):顏色換算、漸層天空、柔光後製、雲。
 * 這版 three.js(r149)不會自動把色碼從 sRGB 轉成線性,直接用色碼會偏白,所以顏色都先經過 luxLin。
 * 用到的場景物件 s 要有 { renderer, scene, camera, post, perf };看板類的東西放在 layer 1(見 luxRender)。
 * 所有檔案共用全域範圍,載入順序見 index.html */

  const luxLin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  // 顏色收斂成粉彩:降一點彩度、提一點亮度,整個畫面才會是同一個色系
  function luxPastel(hex, dark) {
    const c = new THREE.Color(hex), h = {};
    c.getHSL(h);
    c.setHSL(h.h, h.s * (dark ? 0.7 : 0.78), h.l + (1 - h.l) * (dark ? 0.02 : 0.14));
    return c.convertSRGBToLinear();
  }
  const luxRand = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // 漸層天空(上 → 中 → 下);stars > 0 時撒星星(夜晚用)
  function luxSkyTex(P, stars) {
    const cv = document.createElement('canvas'); cv.width = cv.height = stars ? 512 : 64;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, cv.height);
    gr.addColorStop(0, P.skyTop); gr.addColorStop(0.55, P.skyMid); gr.addColorStop(1, P.skyLow);
    g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
    if (stars) {
      const rnd = luxRand(99);
      for (let i = 0; i < stars; i++) {
        const y = rnd() * rnd() * 512 * 0.8;   // 越上面越密
        g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
        g.beginPath(); g.arc(rnd() * 512, y, 0.5 + rnd() * 1.1, 0, Math.PI * 2); g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 依天氣調整的天空:陰天、下雨往灰色靠;晴朗的夜晚有星星。P 要有 skyTop/skyMid/skyLow/grey
  function luxWeatherSky(P, kind, dark) {
    const k = kind === 'rain' ? 0.7 : kind === 'cloud' ? 0.45 : 0;
    const mix = (hex, t) => '#' + new THREE.Color(hex).lerp(new THREE.Color(P.grey), t).getHexString();
    return luxSkyTex({ skyTop: mix(P.skyTop, k), skyMid: mix(P.skyMid, k), skyLow: mix(P.skyLow, k * 0.8) }, dark && !k ? 150 : 0);
  }
  // 持股市值加權的今日漲跌 → 晴(漲)、多雲(小跌)、雨(跌 1% 以上);items 是 townItems() 的結果
  function luxWeatherKind(items) {
    let wv = 0, w = 0;
    items.forEach(it => { if (it.chg !== null && it.chg !== undefined) { wv += it.value * it.chg; w += it.value; } });
    const chg = w > 0 ? wv / w : null;
    return { chg, kind: chg === null ? null : chg >= 0 ? 'sun' : chg > -1 ? 'cloud' : 'rain' };
  }
  const luxWeatherLight = (kind) => !kind ? 1 : kind === 'sun' ? 1.1 : kind === 'cloud' ? 0.8 : 0.6;

  // 圓形淡出的透明度貼圖:海面往外淡出到背景,看不到地平線
  function luxFadeTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff'); gr.addColorStop(0.85, '#555'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  }

  // 柔柔的光暈(太陽、月亮、發光的東西後面用)。rgb 例如 '255,233,168'
  function luxGlowSprite(rgb, alpha) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    const c = (a) => 'rgba(' + rgb + ',' + a + ')';
    gr.addColorStop(0, c(alpha)); gr.addColorStop(0.35, c(alpha * 0.45)); gr.addColorStop(1, c(0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  // 一朵低多邊形的雲
  function luxCloud(color, n, opacity) {
    const c = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: luxLin(color), roughness: 1, flatShading: true, transparent: opacity < 1, opacity });
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + (k % 2) * 0.35, 1), m);
      b.position.set((k - n / 2) * 0.85, (k % 2) * 0.3, (k % 3) * 0.2); b.scale.y = 0.7;
      c.add(b);
    }
    return c;
  }

  // 繪圖器的共同設定;回傳要不要開後製(高品質)
  // 舊手機:沒有 WebGL2、核心少或記憶體小,就不開後製;localStorage pr.myiFx = on/off 可以強制
  function luxHighQuality(renderer) {
    let force = null;
    try { force = localStorage.getItem('pr.myiFx'); } catch (_) {}
    if (force === 'on') return true;
    if (force === 'off') return false;
    return renderer.capabilities.isWebGL2 && (navigator.hardwareConcurrency || 4) >= 4 && !(navigator.deviceMemory && navigator.deviceMemory < 4);
  }
  function luxSetup(renderer) {
    const hq = luxHighQuality(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hq ? 2 : 1.5));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 材質直接做 ACES 色調(畫進後製的暫存畫面時也一樣)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return hq;
  }

  // 光影後製:亮的地方柔柔發光(bloom)、四周微暗
  const LUX_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  function luxPostInit(renderer) {
    const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = (o) => new THREE.WebGLRenderTarget(1, 1, Object.assign({ type, depthBuffer: false }, o));
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: LUX_VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const P = { main: rt({ samples: 4, depthBuffer: true }), a: rt(), b: rt(), scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    P.bright = mat(`uniform sampler2D t; uniform float th; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb; float l = dot(c, vec3(.2126, .7152, .0722)); gl_FragColor = vec4(c * smoothstep(th, th + .6, l), 1.); }`,
      { t: { value: null }, th: { value: 0.7 } });
    P.blur = mat(`uniform sampler2D t; uniform vec2 d; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb * .227027;
        c += (texture2D(t, vUv + d * 1.3846).rgb + texture2D(t, vUv - d * 1.3846).rgb) * .3162162;
        c += (texture2D(t, vUv + d * 3.2308).rgb + texture2D(t, vUv - d * 3.2308).rgb) * .0702703;
        gl_FragColor = vec4(c, 1.); }`, { t: { value: null }, d: { value: new THREE.Vector2() } });
    // 這版 three.js 畫進暫存畫面時材質已經做過 ACES 色調,這裡只加柔光、暗角,再轉回 sRGB
    P.comp = mat(`uniform sampler2D t; uniform sampler2D bl; uniform float k; varying vec2 vUv;
      vec3 srgb(vec3 c){ return mix(pow(c, vec3(.41666)) * 1.055 - .055, c * 12.92, vec3(lessThanEqual(c, vec3(.0031308)))); }
      void main(){
        vec3 c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * k;
        vec2 q = vUv - .5; c *= 1. - dot(q, q) * .45;
        gl_FragColor = vec4(srgb(clamp(c, 0., 1.)), 1.); }`, { t: { value: null }, bl: { value: null }, k: { value: 0.5 } });
    P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), P.comp);
    P.quad.frustumCulled = false;
    P.scene.add(P.quad);
    return P;
  }
  function luxPostSize(P, w, h) {
    P.main.setSize(w, h);
    P.a.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    P.b.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }
  // 畫一格。看板(layer 1)在算完柔光之後才畫:不會跟著發光,但仍然會被前面的東西擋住
  function luxRender(s) {
    const r = s.renderer, P = s.post, cam = s.camera;
    const labels = () => {
      const bg = s.scene.background;
      s.scene.background = null;
      r.autoClear = false; r.shadowMap.autoUpdate = false;
      cam.layers.set(1);
      r.render(s.scene, cam);
      cam.layers.set(0);
      r.autoClear = true; r.shadowMap.autoUpdate = true;
      s.scene.background = bg;
    };
    cam.layers.set(0);
    if (!P) { r.setRenderTarget(null); r.render(s.scene, cam); labels(); return; }
    const pass = (m, to) => { P.quad.material = m; r.setRenderTarget(to); r.render(P.scene, P.cam); };
    r.setRenderTarget(P.main);
    r.render(s.scene, cam);
    P.bright.uniforms.t.value = P.main.texture; pass(P.bright, P.a);
    for (let i = 1; i <= 2; i++) {
      P.blur.uniforms.t.value = P.a.texture; P.blur.uniforms.d.value.set(i / P.a.width, 0); pass(P.blur, P.b);
      P.blur.uniforms.t.value = P.b.texture; P.blur.uniforms.d.value.set(0, i / P.a.height); pass(P.blur, P.a);
    }
    r.setRenderTarget(P.main);
    labels();
    P.comp.uniforms.t.value = P.main.texture; P.comp.uniforms.bl.value = P.a.texture;
    pass(P.comp, null);
  }
  // 開了後製卻跑不動(前 90 格平均超過 34ms):自動關掉後製、降解析度。回傳 true = 剛關掉,呼叫端要重算大小
  function luxPerf(s, now) {
    const p = s.perf || (s.perf = { n: 0, sum: 0 });
    const raw = now - (p.last || now);
    p.last = now;
    if (!s.post || !(raw > 0 && raw < 250) || p.n >= 90) return false;
    p.n++; p.sum += raw;
    if (p.n === 90 && p.sum / 90 > 34) { s.post = null; s.renderer.setPixelRatio(1); return true; }
    return false;
  }
