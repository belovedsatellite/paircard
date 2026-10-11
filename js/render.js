/* ─────────────────────────────────────────────────────────────
 * render.js — 캔버스에 템플릿을 그리는 부분
 *   · 기준 캔버스는 1920×1080 고정, scale 값으로 배율만 조절
 *   · 디자인 조정은 대부분 drawCardContent() / drawBackgroundInto() 에서
 * ───────────────────────────────────────────────────────────── */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var W = 1920, H = 1080;
  CS.W = W; CS.H = H;

  CS.EFFECTS = [
    { id: 'fade',   name: '페이드' },
    { id: 'flipX',  name: '뒤집기 (가로)' },
    { id: 'flipY',  name: '뒤집기 (세로)' },
    { id: 'slideL', name: '밀어내기 ←' },
    { id: 'slideR', name: '밀어내기 →' },
    { id: 'slideU', name: '밀어내기 ↑' },
    { id: 'slideD', name: '밀어내기 ↓' },
    { id: 'rise',   name: '떠오르기' },
    { id: 'zoom',   name: '확대 페이드' },
    { id: 'pop',    name: '작아졌다 커지기' },
    { id: 'wipe',   name: '닦아내기' },
    { id: 'cut',    name: '없음 (바로 바뀜)' }
  ];

  /* ───────── 공통 도구 ───────── */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  var HAS_FILTER = (function () {
    try { return typeof makeCanvas(1, 1).getContext('2d').filter === 'string'; } catch (e) { return false; }
  })();

  /* ───────── 폰트 ───────── */
  CS.fontStack = function (name) {
    return '"' + String(name || 'Pretendard').replace(/"/g, '') + '", "Pretendard", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  };
  function fontSpec(weight, size, name) { return weight + ' ' + size + 'px ' + CS.fontStack(name); }

  /* 화면에 쓰이는 글자에 필요한 폰트 조각을 미리 불러온다 (Google Fonts 한글은 조각 단위로 내려옴) */
  CS.ensureFonts = function (S) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve(false);
    var st = S.style, cards = S.a.concat(S.b), jobs = [];
    jobs.push([fontSpec(st.titleWeight, 40, S.fonts.title), cards.map(function (c) { return c.title; }).join('') + (st.centerText || '')]);
    jobs.push([fontSpec(st.textWeight, 40, S.fonts.body), cards.map(function (c) { return c.text; }).join('')]);
    S.bgs.forEach(function (bg) { jobs.push([fontSpec(bg.bigWeight, 40, S.fonts.big), bg.bigText]); });
    var changed = false;
    return Promise.all(jobs.map(function (j) {
      var spec = j[0], text = j[1] || '가A';
      try {
        if (document.fonts.check(spec, text)) return null;
        return document.fonts.load(spec, text).then(function () { changed = true; }, function () {});
      } catch (e) { return null; }
    })).then(function () {
      if (changed) CS.invalidate();
      return changed;
    });
  };

  /* ───────── 이미지 보관 ───────── */
  var images = new Map(); // assetId → { img, ready }
  CS.loadAssets = function (assets) {
    var ps = [];
    Object.keys(assets).forEach(function (id) {
      if (images.has(id)) return;
      var rec = { img: new Image(), ready: false };
      images.set(id, rec);
      ps.push(new Promise(function (res) {
        rec.img.onload = function () { rec.ready = true; res(); };
        rec.img.onerror = function () { res(); };
        rec.img.src = assets[id];
      }));
    });
    Array.from(images.keys()).forEach(function (id) { if (!(id in assets)) images.delete(id); });
    return Promise.all(ps);
  };
  function getImg(id) { var r = id && images.get(id); return r && r.ready ? r.img : null; }

  /* 이미지를 영역에 꽉 차게(cover) 그리기. px/py: 0~100 위치, zoom: 100~ 확대 */
  function drawCover(ctx, img, x, y, w, h, px, py, zoom) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    var z = Math.max(1, (zoom || 100) / 100), r = w / h, sw, sh;
    if (iw / ih > r) { sh = ih / z; sw = sh * r; } else { sw = iw / z; sh = sw / r; }
    var sx = (iw - sw) * (px == null ? 50 : px) / 100, sy = (ih - sh) * (py == null ? 50 : py) / 100;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  /* ───────── 캐시 ───────── */
  var sprites = new Map(), bgCache = new Map();
  function cacheGet(map, key) {
    var v = map.get(key);
    if (v) { map.delete(key); map.set(key, v); }
    return v;
  }
  function cacheSet(map, key, v, max) {
    map.set(key, v);
    while (map.size > max) map.delete(map.keys().next().value);
  }
  CS.invalidate = function () { sprites.clear(); bgCache.clear(); };

  /* ───────── 글자 줄바꿈 ───────── */
  function wrapLines(ctx, text, maxW) {
    var out = [];
    String(text || '').split('\n').forEach(function (para) {
      var line = '';
      para.split(/(\s+)/).forEach(function (tk) {
        if (!tk) return;
        if (ctx.measureText(line + tk).width <= maxW) { line += tk; return; }
        if (/^\s+$/.test(tk)) { out.push(line); line = ''; return; }
        if (line.trim() && ctx.measureText(tk).width <= maxW) { out.push(line.replace(/\s+$/, '')); line = tk; return; }
        Array.from(tk).forEach(function (ch) {
          if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
        });
      });
      out.push(line.replace(/\s+$/, ''));
    });
    return out;
  }
  function limitLines(ctx, lines, max, maxW) {
    if (lines.length <= max) return lines;
    var cut = lines.slice(0, Math.max(0, max));
    if (!cut.length) return cut;
    var last = cut[cut.length - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = Array.from(last).slice(0, -1).join('');
    cut[cut.length - 1] = last + '…';
    return cut;
  }

  /* ───────── 레이아웃 ───────── */
  CS.cardRects = function (S) {
    var st = S.style, cy = H / 2 + (st.offsetY || 0);
    return {
      a: { x: W / 2 - st.gap / 2 - st.cardW, y: cy - st.cardH / 2, w: st.cardW, h: st.cardH },
      b: { x: W / 2 + st.gap / 2, y: cy - st.cardH / 2, w: st.cardW, h: st.cardH },
      cy: cy
    };
  };

  /* ───────── 카드 한 장 그리기 (0,0 기준, 크기 w×h) ─────────
   * 템플릿 디자인을 바꿀 때 주로 손대는 함수 */
  function drawCardContent(ctx, S, card, w, h, editor) {
    var st = S.style, img = getImg(card.img);
    var overlay = st.textMode === 'overlay';
    var inset = overlay ? 0 : (st.imgInset || 0);
    var imgH = overlay ? h : Math.round(h * st.imgRatio / 100);

    ctx.fillStyle = st.cardColor;
    ctx.fillRect(0, 0, w, h);

    // 이미지 영역
    var ix = inset, iy = inset, iw = w - inset * 2, ih = imgH - inset;
    if (ih > 0) {
      ctx.save();
      rrect(ctx, ix, iy, iw, ih, inset ? Math.max(0, st.radius - inset) : 0);
      ctx.clip();
      if (img) {
        drawCover(ctx, img, ix, iy, iw, ih, card.px, card.py, card.zoom);
      } else {
        ctx.fillStyle = '#d5d9e2';
        ctx.fillRect(ix, iy, iw, ih);
        if (editor) {
          ctx.fillStyle = '#8c93a3';
          ctx.font = fontSpec(600, 30, 'Pretendard');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('이미지를 넣어 주세요', ix + iw / 2, iy + ih / 2);
        }
      }
      ctx.restore();
    }

    // 글자 영역
    var pad = st.pad, ty0, areaH;
    if (overlay) {
      var g = ctx.createLinearGradient(0, h * 0.4, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = g; ctx.fillRect(0, h * 0.4, w, h * 0.6);
    }
    ty0 = overlay ? 0 : imgH; areaH = h - ty0;
    var maxW = w - pad * 2;
    if (maxW <= 0 || areaH <= pad) return;

    var titleLH = st.titleSize * 1.25, textLH = st.textSize * 1.5, gapY = Math.round(st.textSize * 0.45);
    ctx.textBaseline = 'alphabetic';
    ctx.font = fontSpec(st.titleWeight, st.titleSize, S.fonts.title);
    var tLines = card.title ? limitLines(ctx, wrapLines(ctx, card.title, maxW), 2, maxW) : [];
    var avail = (overlay ? h * 0.6 : areaH) - pad * 2;
    ctx.font = fontSpec(st.textWeight, st.textSize, S.fonts.body);
    var room = avail - tLines.length * titleLH - (tLines.length ? gapY : 0);
    var bLines = card.text ? limitLines(ctx, wrapLines(ctx, card.text, maxW), Math.max(0, Math.floor(room / textLH + 0.15)), maxW) : [];
    var blockH = tLines.length * titleLH + (tLines.length && bLines.length ? gapY : 0) + bLines.length * textLH;

    var y = overlay ? h - pad - blockH : ty0 + Math.max(pad * 0.75, (areaH - blockH) / 2);
    var tx = st.align === 'center' ? w / 2 : pad;
    ctx.textAlign = st.align === 'center' ? 'center' : 'left';

    ctx.fillStyle = st.titleColor;
    ctx.font = fontSpec(st.titleWeight, st.titleSize, S.fonts.title);
    tLines.forEach(function (ln) { ctx.fillText(ln, tx, y + titleLH * 0.78); y += titleLH; });
    if (tLines.length && bLines.length) y += gapY;
    ctx.fillStyle = st.textColor;
    ctx.font = fontSpec(st.textWeight, st.textSize, S.fonts.body);
    bLines.forEach(function (ln) { ctx.fillText(ln, tx, y + textLH * 0.72); y += textLH; });
  }

  /* 카드 스프라이트: 그림자 여백(m)을 포함한 작은 캔버스. 전환 효과는 이 스프라이트를 움직여서 만든다 */
  var SPRITE_MARGIN = 90;
  function cardSprite(S, card, scale, editor) {
    var st = S.style;
    var key = JSON.stringify([card.img, card.title, card.text, card.px, card.py, card.zoom, st, S.fonts.title, S.fonts.body, scale, !!editor, !!getImg(card.img)]);
    var hit = cacheGet(sprites, key);
    if (hit) return hit;
    var m = SPRITE_MARGIN, w = st.cardW, h = st.cardH;
    var c = makeCanvas((w + m * 2) * scale, (h + m * 2) * scale), ctx = c.getContext('2d');
    ctx.scale(scale, scale); ctx.translate(m, m);
    if (st.shadow > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,' + (st.shadow / 100 * 0.55).toFixed(3) + ')';
      ctx.shadowBlur = 48 * scale; ctx.shadowOffsetY = 18 * scale;
      ctx.fillStyle = st.cardColor;
      rrect(ctx, 0, 0, w, h, st.radius); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    rrect(ctx, 0, 0, w, h, st.radius); ctx.clip();
    drawCardContent(ctx, S, card, w, h, editor);
    ctx.restore();
    var sp = { canvas: c, m: m };
    cacheSet(sprites, key, sp, 48);
    return sp;
  }

  /* ───────── 배경 ───────── */
  function drawBlurredCover(ctx, img, w, h, blur, px, py, zoom) {
    if (blur <= 0.2) { drawCover(ctx, img, 0, 0, w, h, px, py, zoom); return; }
    if (HAS_FILTER) {
      var m = Math.ceil(blur * 2.5);
      ctx.save(); ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';
      drawCover(ctx, img, -m, -m, w + m * 2, h + m * 2, px, py, zoom);
      ctx.restore();
      return;
    }
    // filter 미지원 브라우저용: 축소 후 확대하는 방식의 흐림
    var f = Math.max(2, blur / 1.2);
    var a = makeCanvas(Math.max(8, w / f), Math.max(8, h / f)), ax = a.getContext('2d');
    ax.imageSmoothingQuality = 'high';
    drawCover(ax, img, 0, 0, a.width, a.height, px, py, zoom);
    var b = makeCanvas(Math.max(4, a.width / 2), Math.max(4, a.height / 2)), bx = b.getContext('2d');
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(a, 0, 0, b.width, b.height);
    ax.drawImage(b, 0, 0, a.width, a.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(a, 0, 0, w, h);
  }

  function drawBackgroundInto(ctx, S, bg, scale) {
    var w = W * scale, h = H * scale;
    ctx.fillStyle = bg.color || '#000';
    ctx.fillRect(0, 0, w, h);
    if (bg.type === 'gradient') {
      var g;
      if (bg.gradType === 'radial') {
        g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
      } else {
        var a = (bg.angle || 0) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
        var L = Math.abs(w * dx) + Math.abs(h * dy);
        g = ctx.createLinearGradient(w / 2 - dx * L / 2, h / 2 - dy * L / 2, w / 2 + dx * L / 2, h / 2 + dy * L / 2);
      }
      g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    } else if (bg.type === 'image') {
      var img = getImg(bg.img);
      if (img) drawBlurredCover(ctx, img, w, h, (bg.blur || 0) * scale, bg.px, bg.py, bg.zoom);
    }
    if (bg.dim > 0) {
      ctx.save(); ctx.globalAlpha = bg.dim / 100; ctx.fillStyle = bg.dimColor || '#000';
      ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    // 배경 큰 글자
    if (bg.bigText && bg.bigOpacity > 0) {
      ctx.save();
      ctx.scale(scale, scale);
      ctx.globalAlpha = bg.bigOpacity / 100;
      ctx.fillStyle = bg.bigColor;
      ctx.font = fontSpec(bg.bigWeight, bg.bigSize, S.fonts.big);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = (bg.bigSpacing || 0) + 'px';
      var lines = String(bg.bigText).split('\n'), lh = bg.bigSize * 0.98;
      var y = H * bg.bigY / 100 - (lines.length - 1) * lh / 2;
      lines.forEach(function (ln) { ctx.fillText(ln, W / 2 + (bg.bigSpacing || 0) / 2, y); y += lh; });
      ctx.restore();
    }
  }

  function bgCanvas(S, bg, scale) {
    var key = JSON.stringify([bg, S.fonts.big, scale, !!getImg(bg.img)]);
    var hit = cacheGet(bgCache, key);
    if (hit) return hit;
    var c = makeCanvas(W * scale, H * scale);
    drawBackgroundInto(c.getContext('2d'), S, bg, scale);
    cacheSet(bgCache, key, c, 10);
    return c;
  }

  /* ───────── 카드 전환 효과 ─────────
   * p: 0→1 진행도. from/to 카드 스프라이트를 움직이거나 투명도를 바꿔서 그린다 */
  function drawCardTransition(ctx, S, from, to, rect, p, fx, isB, scale, editor) {
    var st = S.style;
    var sA = from ? cardSprite(S, from, scale, editor) : null;
    var sB = to ? cardSprite(S, to, scale, editor) : null;
    var m = SPRITE_MARGIN, e = ease(clamp01(p));
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;

    function put(sp, o) {
      if (!sp) return;
      o = o || {};
      var alpha = o.alpha == null ? 1 : o.alpha;
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= clamp01(alpha);
      ctx.translate(cx + (o.dx || 0), cy + (o.dy || 0));
      ctx.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
      ctx.drawImage(sp.canvas, -rect.w / 2 - m, -rect.h / 2 - m, rect.w + m * 2, rect.h + m * 2);
      if (o.shade > 0) {
        ctx.globalAlpha = clamp01(o.shade);
        ctx.fillStyle = '#000';
        rrect(ctx, -rect.w / 2, -rect.h / 2, rect.w, rect.h, st.radius); ctx.fill();
      }
      ctx.restore();
    }

    if (p <= 0) { put(sA); return; }
    if (p >= 1) { put(sB); return; }

    var mirror = isB && st.mirrorB, k, q, d;
    switch (fx) {
      case 'flipX':
      case 'flipY':
        k = Math.cos(e * Math.PI); // 1 → -1
        q = Math.max(Math.abs(k), 0.002);
        if (fx === 'flipX') put(k >= 0 ? sA : sB, { sx: q, shade: (1 - q) * 0.4 });
        else put(k >= 0 ? sA : sB, { sy: q, shade: (1 - q) * 0.4 });
        break;

      case 'slideL': case 'slideR': case 'slideU': case 'slideD':
        d = { slideL: [-1, 0], slideR: [1, 0], slideU: [0, -1], slideD: [0, 1] }[fx];
        if (mirror) d = [-d[0], d[1]];
        put(sA || sB); // 그림자와 카드 틀은 제자리에 둔다
        ctx.save();
        rrect(ctx, rect.x, rect.y, rect.w, rect.h, st.radius); ctx.clip();
        put(sA, { dx: d[0] * e * rect.w, dy: d[1] * e * rect.h });
        put(sB, { dx: -d[0] * (1 - e) * rect.w, dy: -d[1] * (1 - e) * rect.h });
        ctx.restore();
        break;

      case 'rise':
        put(sA, { alpha: 1 - clamp01(p * 1.8), dy: -70 * e });
        put(sB, { alpha: ease(clamp01((p - 0.2) / 0.8)), dy: 70 * (1 - e) });
        break;

      case 'zoom':
        put(sA, { alpha: 1 - e, sx: 1 + 0.1 * e, sy: 1 + 0.1 * e });
        put(sB, { alpha: e, sx: 0.9 + 0.1 * e, sy: 0.9 + 0.1 * e });
        break;

      case 'pop':
        if (p < 0.45) {
          q = ease(p / 0.45);
          put(sA, { alpha: 1 - q, sx: 1 - 0.3 * q, sy: 1 - 0.3 * q });
        } else {
          q = (p - 0.45) / 0.55; k = 0.7 + 0.3 * easeOutBack(q);
          put(sB, { alpha: clamp01(q * 3), sx: k, sy: k });
        }
        break;

      case 'wipe':
        put(sA);
        ctx.save();
        ctx.beginPath();
        var fullW = rect.w + m * 2, ww = fullW * e;
        if (mirror) ctx.rect(rect.x + rect.w + m - ww, rect.y - m, ww, rect.h + m * 2);
        else ctx.rect(rect.x - m, rect.y - m, ww, rect.h + m * 2);
        ctx.clip();
        put(sB);
        ctx.restore();
        break;

      default: // fade
        put(sA);
        put(sB, { alpha: e });
    }
  }

  /* ───────── 장면·타임라인 계산 ───────── */
  function findCard(S, side, id) {
    var list = S[side];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }
  function findBg(S, id) {
    for (var i = 0; i < S.bgs.length; i++) if (S.bgs[i].id === id) return S.bgs[i];
    return S.bgs[0];
  }
  CS.findCard = findCard; CS.findBg = findBg;

  /* 두 장면 사이에 무엇이 바뀌고 얼마나 걸리는지 */
  CS.transInfo = function (S, from, to) {
    var a = findCard(S, 'a', from.a) !== findCard(S, 'a', to.a);
    var b = findCard(S, 'b', from.b) !== findCard(S, 'b', to.b);
    var bg = findBg(S, from.bg) !== findBg(S, to.bg);
    var none = { a: false, b: false, bg: false, dur: 0, total: 0, delay: { a: 0, b: 0 }, fx: 'cut' };
    if (to.fx === 'cut' || !(a || b || bg) || !(to.dur > 0)) return none;
    var stg = a && b ? (to.stagger || 0) : 0;
    return {
      a: a, b: b, bg: bg, fx: to.fx, dur: to.dur,
      delay: { a: stg < 0 ? -stg : 0, b: stg > 0 ? stg : 0 },
      total: to.dur + Math.abs(stg)
    };
  };

  /* 전체 재생 순서: [유지][전환][유지]… loop=true면 마지막→처음 전환을 끝에 붙인다 */
  CS.buildTimeline = function (S, loop) {
    var segs = [], t = 0, sc = S.scenes, tr;
    sc.forEach(function (s, i) {
      if (i > 0) {
        tr = CS.transInfo(S, sc[i - 1], s);
        if (tr.total > 0) { segs.push({ type: 'trans', from: i - 1, to: i, start: t, dur: tr.total }); t += tr.total; }
      }
      segs.push({ type: 'hold', to: i, start: t, dur: Math.max(0, s.hold) });
      t += Math.max(0, s.hold);
    });
    if (loop && sc.length > 1) {
      tr = CS.transInfo(S, sc[sc.length - 1], sc[0]);
      if (tr.total > 0) { segs.push({ type: 'trans', from: sc.length - 1, to: 0, start: t, dur: tr.total, loop: true }); t += tr.total; }
    }
    return { segs: segs, total: t };
  };

  CS.frameAt = function (tl, t) {
    var segs = tl.segs, s = segs[segs.length - 1];
    for (var i = 0; i < segs.length; i++) {
      if (t < segs[i].start + segs[i].dur) { s = segs[i]; break; }
    }
    if (!s) return { from: null, to: 0, ms: 0 };
    if (s.type === 'hold') return { from: null, to: s.to, ms: 0, seg: s };
    return { from: s.from, to: s.to, ms: Math.max(0, t - s.start), seg: s };
  };

  /* ───────── 한 프레임 그리기 ─────────
   * frame: { from: 장면번호|null, to: 장면번호, ms: 전환 경과 시간 } */
  CS.drawFrame = function (ctx, S, frame, opt) {
    opt = opt || {};
    var scale = opt.scale || 1, editor = !!opt.editor, sc = S.scenes;
    var to = sc[frame.to] || sc[0];
    var from = frame.from == null ? null : sc[frame.from];
    var tr = from ? CS.transInfo(S, from, to) : null;
    if (tr && tr.total <= 0) { tr = null; from = null; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    var bgTo = findBg(S, to.bg);
    if (tr && tr.bg) {
      ctx.drawImage(bgCanvas(S, findBg(S, from.bg), scale), 0, 0);
      ctx.globalAlpha = ease(clamp01(frame.ms / tr.total));
      ctx.drawImage(bgCanvas(S, bgTo, scale), 0, 0);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(bgCanvas(S, bgTo, scale), 0, 0);
    }

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    var st = S.style, R = CS.cardRects(S);

    ['a', 'b'].forEach(function (side) {
      var cardTo = findCard(S, side, to[side]);
      if (!cardTo) return;
      if (tr && tr[side]) {
        var p = (frame.ms - tr.delay[side]) / tr.dur;
        drawCardTransition(ctx, S, findCard(S, side, from[side]), cardTo, R[side], p, tr.fx, side === 'b', scale, editor);
      } else {
        drawCardTransition(ctx, S, null, cardTo, R[side], 1, 'cut', side === 'b', scale, editor);
      }
    });

    // 중앙 글자 (카드 사이)
    if (st.centerText) {
      ctx.save();
      ctx.fillStyle = st.centerColor;
      ctx.font = fontSpec(st.centerWeight, st.centerSize, S.fonts.title);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var lines = String(st.centerText).split('\n'), lh = st.centerSize * 1.1;
      var y = R.cy - (lines.length - 1) * lh / 2;
      lines.forEach(function (ln) { ctx.fillText(ln, W / 2, y); y += lh; });
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  /* 새 캔버스에 한 프레임을 그려서 돌려준다 (내보내기용) */
  CS.renderToCanvas = function (S, frame, scale) {
    var c = makeCanvas(W * scale, H * scale);
    CS.drawFrame(c.getContext('2d'), S, frame, { scale: scale, editor: false });
    return c;
  };
  CS.makeCanvas = makeCanvas;
})(window.CS);
