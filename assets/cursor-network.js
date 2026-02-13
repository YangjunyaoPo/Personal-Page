(() => {
  const canvas = document.getElementById("fx");
  const ctx = canvas.getContext("2d", { alpha: true });

  // =========================
  // ✅ 可调配置项（中文注释）
  // =========================
  const CFG = {
    // 粒子数量：按屏幕面积自动算
    density: 0.00013,
    minParticles: 140,
    maxParticles: 320,

    // 线条连接（全屏 network 背景）
    linkDist: 160,
    linkAlpha: 0.20,
    linkWidth: 1,

    // 粒子点本身
    dotAlpha: 0.85,
    dotSizeMin: 1.2,
    dotSizeMax: 2.3,

    // 背景残影（拖尾）
    fadeAlpha: 0.16,

    // 运动手感
    damping: 0.987,
    maxSpeed: 2.15,
    initialSpeed: 0.7,

    // 鼠标附近吸引（圆形范围）
    attractRadius: 140,
    attractStrength: 0.0008,

    // ✅【新增】吸附“核心区”大小（建议占吸附范围的一半）
    // 核心区内不再继续被向中心拉（避免塌缩成亮球），仍允许粒子 wander / 碰撞
    coreHoldRatio: 0.50,      // 核心区半径 = attractRadius * ratio（0.3~0.7）
    coreHoldRadius: null,     // 若填写数字（例如 70），则优先使用它；否则用 ratio 计算

    // 鼠标碰撞感（接触式）
    cursorColliderRadius: 16,
    bumpStrength: 0.020,
    inheritMouse: 0.66,

    // 粒子之间轻度“体积感”
    separationDist: 12,
    separationStrength: 0.010,

    // 平滑游走（粒子自身随机运动）
    wanderStrength: 0.002,
    wanderScale: 0.010,
    wanderTime: 0.00050,

    // ✅ 鼠标点：作为一直存在的点参与连线
    mousePoint: {
      enable: true,
      dotRadius: 2.2,
      dotAlpha: 0.85,

      linkDist: 160,          // 鼠标与粒子连线距离
      linkAlpha: 0.30,
      linkWidth: 1,

      // ✅【新增】“鼠标中心区域只和鼠标连线”
      // 在这个半径内的粒子：不与其他粒子连线，只与鼠标连线
      linkOnlyRadius: 90     // 建议 = linkDist 或 = attractRadius
    },

    // 生成 / 消亡 / 重生
    lifecycle: {
      enable: true,
      lifeMinMs: 24000,
      lifeMaxMs: 60000,

      respawnOnEdge: true,
      edgePadding: 0,

      replenish: true
    }
  };

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  const particles = [];

  const mouse = {
    x: 0, y: 0,
    px: 0, py: 0,
    vx: 0, vy: 0,
    active: false
  };

  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // =========================
  // 平滑 value noise（用于 wander）
  // =========================
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;

    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);

    const u = smoothstep(xf);
    const v = smoothstep(yf);

    const ab = lerp(a, b, u);
    const cd = lerp(c, d, u);
    const val = lerp(ab, cd, v);

    return val * 2 - 1;
  }

  function resize() {
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    adjustParticleCount();

    ctx.clearRect(0, 0, W, H);

  }

  function targetCount() {
    return Math.max(
      CFG.minParticles,
      Math.min(CFG.maxParticles, Math.floor(W * H * CFG.density))
    );
  }

  function adjustParticleCount() {
    const target = targetCount();
    while (particles.length < target) particles.push(makeParticle(true));
    if (particles.length > target) particles.length = target;
  }

  function newLifeMs() {
    return rand(CFG.lifecycle.lifeMinMs, CFG.lifecycle.lifeMaxMs);
  }

  function makeParticle(randomPos) {
    const x = randomPos ? rand(0, W) : W / 2;
    const y = randomPos ? rand(0, H) : H / 2;

    const ang = rand(0, Math.PI * 2);
    const sp = rand(0.4, 1.0) * CFG.initialSpeed;

    return {
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: rand(CFG.dotSizeMin, CFG.dotSizeMax),
      seed: rand(0.0, 1000.0),
      life: CFG.lifecycle.enable ? newLifeMs() : Infinity
    };
  }

  function respawn(p) {
    p.x = rand(0, W);
    p.y = rand(0, H);

    const ang = rand(0, Math.PI * 2);
    const sp = rand(0.4, 1.0) * CFG.initialSpeed;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;

    p.r = rand(CFG.dotSizeMin, CFG.dotSizeMax);
    p.seed = rand(0.0, 1000.0);
    p.life = CFG.lifecycle.enable ? newLifeMs() : Infinity;
  }

  function fadeFrame() {
  // ✅ 透明衰减：擦掉旧像素而不是盖一层背景色（底下的渐变能透出来）
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0,0,0,${CFG.fadeAlpha})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}


  function updateMouseVel() {
    if (!mouse.active) {
      mouse.vx *= 0.85;
      mouse.vy *= 0.85;
      return;
    }
    mouse.vx = mouse.x - mouse.px;
    mouse.vy = mouse.y - mouse.py;
    mouse.px = mouse.x;
    mouse.py = mouse.y;
  }

  // 粒子自身 wander（保留）
  function applyWander(p, t) {
    const nx = vnoise(
      (p.x + p.seed) * CFG.wanderScale,
      (p.y - p.seed) * CFG.wanderScale + t * CFG.wanderTime
    );
    const ny = vnoise(
      (p.x - p.seed) * CFG.wanderScale + 19.7,
      (p.y + p.seed) * CFG.wanderScale + t * CFG.wanderTime + 7.3
    );
    p.vx += nx * CFG.wanderStrength;
    p.vy += ny * CFG.wanderStrength;
  }

  // ✅ 圆形吸引范围 + 可配置“核心区”大小（核心区内不再继续吸到中心）
  function getCoreHoldRadius() {
    if (typeof CFG.coreHoldRadius === "number" && isFinite(CFG.coreHoldRadius)) {
      return clamp(CFG.coreHoldRadius, 0, CFG.attractRadius - 1);
    }
    const r = CFG.attractRadius * (CFG.coreHoldRatio ?? 0.5);
    return clamp(r, 0, CFG.attractRadius - 1);
  }

  function applyLocalField(p) {
    if (!mouse.active) return;

    const dx = mouse.x - p.x;
    const dy = mouse.y - p.y;
    const dist = Math.hypot(dx, dy) + 1e-6;

    if (dist > CFG.attractRadius) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // ✅ 核心区：半径 coreHold 内不再持续向中心拉（避免塌缩）
    const coreHold = getCoreHoldRadius();
    if (dist > coreHold) {
      const tt = clamp((dist - coreHold) / (CFG.attractRadius - coreHold), 0, 1);
      const pull = CFG.attractStrength * (1 - tt); // 越靠近 coreHold 边界越强，越靠近外圈越弱
      p.vx += nx * pull * 60;
      p.vy += ny * pull * 60;
    }

    // 鼠标碰撞感（接触式）
    const cr = CFG.cursorColliderRadius;
    if (dist < cr) {
      const overlap = (cr - dist) / cr;
      const bump = CFG.bumpStrength * overlap * 60;

      p.vx -= nx * bump;
      p.vy -= ny * bump;

      p.vx += mouse.vx * CFG.inheritMouse * overlap;
      p.vy += mouse.vy * CFG.inheritMouse * overlap;
    }
  }

  function applySeparation(i) {
    const p = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const q = particles[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dist = Math.hypot(dx, dy) + 1e-6;

      if (dist < CFG.separationDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (CFG.separationDist - dist) / CFG.separationDist;
        const s = CFG.separationStrength * overlap * 60;

        p.vx -= nx * s; p.vy -= ny * s;
        q.vx += nx * s; q.vy += ny * s;
      }
    }
  }

  function step(p, dtMs) {
    p.vx *= CFG.damping;
    p.vy *= CFG.damping;

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > CFG.maxSpeed) {
      const k = CFG.maxSpeed / sp;
      p.vx *= k; p.vy *= k;
    }

    p.x += p.vx;
    p.y += p.vy;

    if (CFG.lifecycle.enable && CFG.lifecycle.respawnOnEdge) {
      const pad = CFG.lifecycle.edgePadding || 0;
      if (p.x <= pad || p.x >= W - pad || p.y <= pad || p.y >= H - pad) {
        respawn(p);
        return;
      }
    } else {
      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      if (p.x > W) { p.x = W; p.vx *= -1; }
      if (p.y < 0) { p.y = 0; p.vy *= -1; }
      if (p.y > H) { p.y = H; p.vy *= -1; }
    }

    if (CFG.lifecycle.enable) {
      p.life -= dtMs;
      if (p.life <= 0) respawn(p);
    }
  }

  // ✅ 鼠标点：与粒子连线 + 鼠标点绘制
  function drawMouseLinksAndDot() {
    if (!CFG.mousePoint.enable || !mouse.active) return;

    const md = CFG.mousePoint.linkDist;
    const mw = CFG.mousePoint.linkWidth;
    const ma = CFG.mousePoint.linkAlpha;

    ctx.lineWidth = mw;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist = Math.hypot(dx, dy);

      if (dist < md) {
        const a = (1 - dist / md) * ma;
        ctx.strokeStyle = `rgba(234,240,255,${a})`;
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    if (CFG.mousePoint.dotRadius > 0) {
      ctx.fillStyle = `rgba(234,240,255,${CFG.mousePoint.dotAlpha})`;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, CFG.mousePoint.dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ✅ 修改：鼠标中心区域内的粒子，不再与其他粒子连线（只与鼠标连线）
  function inMouseLinkOnlyZone(p) {
    if (!mouse.active || !CFG.mousePoint.enable) return false;
    const r = CFG.mousePoint.linkOnlyRadius ?? CFG.mousePoint.linkDist;
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    return (dx * dx + dy * dy) < (r * r);
  }

  function drawLinks() {
    ctx.lineWidth = CFG.linkWidth;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 在鼠标中心区域内：跳过它与其他粒子的连线
      const pIn = inMouseLinkOnlyZone(p);

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];

        // 任意一方在中心区域内 -> 不画粒子-粒子连线（让视觉更“以鼠标为中心”）
        if (pIn || inMouseLinkOnlyZone(q)) continue;

        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CFG.linkDist) {
          const a = (1 - dist / CFG.linkDist) * CFG.linkAlpha;
          ctx.strokeStyle = `rgba(234,240,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawDots() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.fillStyle = `rgba(234,240,255,${CFG.dotAlpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let lastT = 0;
  function tick(t) {
    const dtMs = lastT ? (t - lastT) : 16.7;
    lastT = t;

    fadeFrame();
    updateMouseVel();

    if (CFG.lifecycle.enable && CFG.lifecycle.replenish) adjustParticleCount();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      applyWander(p, t);
      applyLocalField(p);
      applySeparation(i);
    }

    for (let i = 0; i < particles.length; i++) step(particles[i], dtMs);

    // 画法：先粒子间线（鼠标中心区被屏蔽），再鼠标线，最后点
    drawLinks();
    drawMouseLinksAndDot();
    drawDots();

    requestAnimationFrame(tick);
  }

  function setMouseFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = clientX - rect.left;
    mouse.y = clientY - rect.top;
  }

  window.addEventListener("mousemove", (e) => {
    if (!mouse.active) {
      mouse.active = true;
      setMouseFromClient(e.clientX, e.clientY);
      mouse.px = mouse.x; mouse.py = mouse.y;
    } else {
      setMouseFromClient(e.clientX, e.clientY);
    }
  }, { passive: true });

  window.addEventListener("mouseleave", () => { mouse.active = false; });
  window.addEventListener("blur", () => { mouse.active = false; });

  window.addEventListener("touchstart", (e) => {
    const tt = e.touches[0];
    mouse.active = true;
    setMouseFromClient(tt.clientX, tt.clientY);
    mouse.px = mouse.x; mouse.py = mouse.y;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const tt = e.touches[0];
    setMouseFromClient(tt.clientX, tt.clientY);
  }, { passive: true });

  window.addEventListener("touchend", () => { mouse.active = false; }, { passive: true });

  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(tick);
})();
