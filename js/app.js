/* ─────────────────────────────────────────────────────────────
 * app.js — 편집 화면 (좌측 메뉴 · 미리보기 · 타임라인 · 저장)
 * ───────────────────────────────────────────────────────────── */
(function (CS) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ───────── DOM 도우미 ───────── */
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function h(tag, props) {
    var el = document.createElement(tag), k, v;
    if (props) for (k in props) {
      v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k !== 'list' && k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /* ───────── 기본값 ───────── */
  var DEFAULT_STYLE = {
    textMode: 'below',       // below: 이미지 아래 글자 / overlay: 이미지 위 글자
    cardW: 580, cardH: 780, gap: 150, offsetY: 0, radius: 32,
    cardColor: '#ffffff', shadow: 60,
    imgRatio: 66, imgInset: 0, pad: 40, align: 'left',
    titleSize: 46, titleWeight: 800, titleColor: '#14161b',
    textSize: 28, textWeight: 400, textColor: '#5a6070',
    centerText: '', centerSize: 90, centerWeight: 900, centerColor: '#ffffff',
    mirrorB: true
  };
  function newCard(side, n) {
    return { id: uid(), img: null, title: '카드 제목 ' + side.toUpperCase() + n, text: '짧은 문구를 입력하세요.', px: 50, py: 50, zoom: 100 };
  }
  function newBg() {
    return {
      id: uid(), type: 'gradient', gradType: 'linear', color: '#27304f', color2: '#8566c9', angle: 135,
      img: null, blur: 24, px: 50, py: 50, zoom: 100,
      dim: 0, dimColor: '#000000',
      bigText: 'SIDE', bigSize: 440, bigWeight: 900, bigColor: '#ffffff', bigOpacity: 10, bigY: 50, bigSpacing: 0
    };
  }
  function newScene() { return { id: uid(), a: null, b: null, bg: null, hold: 1800, fx: 'flipX', dur: 700, stagger: 0 }; }
  function defaultState() {
    var s = {
      v: 1, mode: 'sync',
      a: [newCard('a', 1), newCard('a', 2)],
      b: [newCard('b', 1), newCard('b', 2)],
      bgs: [newBg()], scenes: [],
      style: Object.assign({}, DEFAULT_STYLE),
      fonts: { title: 'Pretendard', body: 'Pretendard', big: 'Pretendard', google: [] },
      exp: { pngScale: 1, gifW: 960, fps: 20, loop: true, dither: true },
      assets: {}
    };
    return s;
  }

  /* 저장 파일·임시 저장에서 읽은 내용을 안전한 형태로 맞춘다 */
  function migrate(s) {
    var d = defaultState();
    if (!s || typeof s !== 'object') return d;
    var out = { v: 1 };
    out.mode = ['sync', 'alt', 'manual'].indexOf(s.mode) >= 0 ? s.mode : 'sync';
    out.style = Object.assign({}, d.style, s.style);
    out.fonts = Object.assign({}, d.fonts, s.fonts);
    out.fonts.google = Array.isArray(out.fonts.google) ? out.fonts.google.filter(function (x) { return typeof x === 'string'; }) : [];
    out.exp = Object.assign({}, d.exp, s.exp);
    out.assets = {};
    if (s.assets && typeof s.assets === 'object') Object.keys(s.assets).forEach(function (k) {
      if (typeof s.assets[k] === 'string' && /^data:image\//.test(s.assets[k])) out.assets[k] = s.assets[k];
    });
    ['a', 'b'].forEach(function (side) {
      var list = Array.isArray(s[side]) ? s[side] : [];
      out[side] = list.map(function (c, i) { return Object.assign(newCard(side, i + 1), c); });
      if (!out[side].length) out[side] = [newCard(side, 1)];
    });
    out.bgs = (Array.isArray(s.bgs) && s.bgs.length ? s.bgs : d.bgs).map(function (b) { return Object.assign(newBg(), b); });
    out.scenes = (Array.isArray(s.scenes) ? s.scenes : []).map(function (x) { return Object.assign(newScene(), x); });
    return out;
  }

  var S = defaultState();
  var ui = { tab: 'a', open: { a: null, b: null }, openBg: null, sel: 0, t: 0, playing: false, tl: null, cols: [], sceneEls: [] };

  /* ───────── 장면 구성 ───────── */
  function has(list, id) { return list.some(function (x) { return x.id === id; }); }

  function rebuildScenes() {
    var old = S.scenes, firstBg = S.bgs[0].id;
    if (S.mode === 'manual' && old.length) {
      old.forEach(function (sc) {
        if (!has(S.a, sc.a)) sc.a = S.a[0].id;
        if (!has(S.b, sc.b)) sc.b = S.b[0].id;
        if (!has(S.bgs, sc.bg)) sc.bg = firstBg;
      });
      return;
    }
    var na = S.a.length, nb = S.b.length, pairs = [], i, j;
    if (S.mode === 'alt') {
      i = 0; j = 0; pairs.push([0, 0]);
      while (i < na - 1 || j < nb - 1) {
        if (i < na - 1) { i++; pairs.push([i, j]); }
        if (j < nb - 1) { j++; pairs.push([i, j]); }
      }
    } else {
      for (i = 0; i < Math.max(na, nb); i++) pairs.push([Math.min(i, na - 1), Math.min(i, nb - 1)]);
    }
    var last = old[old.length - 1] || newScene();
    S.scenes = pairs.map(function (p, k) {
      var o = old[k] || { id: uid(), hold: last.hold, fx: last.fx, dur: last.dur, stagger: last.stagger, bg: last.bg };
      return {
        id: o.id, a: S.a[p[0]].id, b: S.b[p[1]].id, bg: has(S.bgs, o.bg) ? o.bg : firstBg,
        hold: o.hold, fx: o.fx, dur: o.dur, stagger: o.stagger
      };
    });
  }

  function ensureManual() {
    if (S.mode === 'manual') return;
    S.mode = 'manual';
    toast('타임라인이 "직접 구성"으로 바뀌었습니다. 이제 카드를 추가해도 장면이 자동으로 늘어나지 않습니다.', 4500);
  }

  /* ───────── 변경 알림 ───────── */
  var drawPending = false, tlTimer = 0, fontTimer = 0, saveTimer = 0;
  function touch(o) {
    o = o || {};
    if (o.struct) { rebuildScenes(); renderTimeline(); renderInspector(); }
    else if (o.timing) renderTimeline();
    else { clearTimeout(tlTimer); tlTimer = setTimeout(renderTimeline, 200); }
    if (o.panel) renderPanel();
    clearTimeout(fontTimer); fontTimer = setTimeout(syncFonts, 180);
    scheduleDraw(); scheduleSave();
  }
  function syncFonts() { CS.ensureFonts(S).then(function (changed) { if (changed) scheduleDraw(); }); }

  /* ───────── 미리보기 ───────── */
  var pcanvas, pctx, lastTs = 0;
  function scheduleDraw() {
    if (drawPending) return;
    drawPending = true; requestAnimationFrame(drawTick);
  }
  function drawTick(ts) {
    drawPending = false;
    var tl = ui.tl;
    if (!tl) return;
    if (ui.playing) {
      if (lastTs) ui.t += Math.min(100, ts - lastTs);
      lastTs = ts;
      if (tl.total <= 0) { ui.playing = false; ui.t = 0; }
      else if (ui.t >= tl.total) ui.t = S.exp.loop ? ui.t % tl.total : 0;
    } else lastTs = 0;
    var fr = CS.frameAt(tl, ui.t);
    CS.drawFrame(pctx, S, fr, { scale: 1, editor: true });
    var selNow = fr.seg && fr.seg.loop ? ui.sel : fr.to;
    if (selNow !== ui.sel) setSel(selNow, true);
    updatePlayhead();
    if (ui.playing) scheduleDraw();
  }

  /* ───────── 좌측 메뉴: 입력 칸 만들기 ───────── */
  function field(label, control, cls) { return h('div', { class: 'field' + (cls ? ' ' + cls : '') }, h('label', { text: label }), control); }
  function fRange(label, obj, key, min, max, step, o) {
    o = o || {};
    var val = h('span', { class: 'val', text: obj[key] + (o.unit || '') });
    var inp = h('input', {
      type: 'range', min: min, max: max, step: step || 1, value: obj[key],
      oninput: function () { obj[key] = +inp.value; val.textContent = obj[key] + (o.unit || ''); touch(o.touch); }
    });
    return field(label, h('div', { class: 'row' }, inp, val));
  }
  function fColor(label, obj, key, o) {
    var inp = h('input', { type: 'color', value: obj[key], oninput: function () { obj[key] = inp.value; touch(o && o.touch); } });
    return field(label, h('div', { class: 'row' }, inp));
  }
  function fText(label, obj, key, o) {
    o = o || {};
    var inp = h(o.multiline ? 'textarea' : 'input', {
      type: o.multiline ? null : 'text', value: obj[key] || '', placeholder: o.placeholder || '', rows: o.rows || null,
      oninput: function () { obj[key] = inp.value; touch(); if (o.oninput) o.oninput(inp.value); }
    });
    return field(label, inp, o.stack ? 'stack' : '');
  }
  function fSelect(label, obj, key, options, o) {
    o = o || {};
    var sel = h('select', {
      onchange: function () {
        obj[key] = o.num ? +sel.value : sel.value;
        if (o.onchange) o.onchange(obj[key]);
        touch(o.touch);
        if (o.rerender) renderPanel();
      }
    }, options.map(function (op) { return h('option', { value: op[0], text: op[1] }); }));
    sel.value = String(obj[key]);
    return field(label, sel);
  }
  function fCheck(label, obj, key, o) {
    var inp = h('input', { type: 'checkbox', checked: !!obj[key], onchange: function () { obj[key] = inp.checked; touch(o && o.touch); } });
    return h('label', { class: 'field', style: { gridTemplateColumns: '18px 1fr', cursor: 'pointer' } }, inp, h('span', { text: label }));
  }
  function section(title) {
    var el = h('div', { class: 'section' }, title ? h('h3', { text: title }) : null);
    for (var i = 1; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  var WEIGHTS = [[300, '얇게 (300)'], [400, '보통 (400)'], [500, '중간 (500)'], [600, '약간 굵게 (600)'], [700, '굵게 (700)'], [800, '더 굵게 (800)'], [900, '가장 굵게 (900)']];

  /* ───────── 이미지 넣기 ───────── */
  function pickFiles(accept, multiple, cb) {
    var fp = $('filePicker');
    fp.accept = accept; fp.multiple = !!multiple; fp.value = '';
    fp.onchange = function () { if (fp.files && fp.files.length) cb(Array.from(fp.files)); };
    fp.click();
  }
  function readImageFile(file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) { rej(new Error('이미지 파일만 넣을 수 있습니다.')); return; }
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      fr.onload = function () {
        var url = fr.result, img = new Image();
        img.onerror = function () { rej(new Error('이 브라우저에서 열 수 없는 이미지입니다.')); };
        img.onload = function () {
          var w = img.naturalWidth, hh = img.naturalHeight, MAX = 2400;
          var isGif = file.type === 'image/gif';
          if (!w || !hh || (Math.max(w, hh) <= MAX && !isGif)) { res(url); return; }
          // 너무 큰 이미지는 줄이고, 움직이는 GIF는 첫 장면만 남긴다
          var k = Math.min(1, MAX / Math.max(w, hh));
          var c = CS.makeCanvas(w * k, hh * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png'));
        };
        img.src = url;
      };
      fr.readAsDataURL(file);
    });
  }
  function addAsset(file) {
    return readImageFile(file).then(function (url) {
      var id = uid(); S.assets[id] = url;
      return CS.loadAssets(S.assets).then(function () { return id; });
    });
  }
  function setImage(obj, file) {
    return addAsset(file).then(function (id) {
      obj.img = id; touch({ panel: true });
    }).catch(function (e) { toast(e.message); });
  }
  function dropZone(obj, emptyText) {
    var hasImg = obj.img && S.assets[obj.img];
    var el = h('div', {
      class: 'drop',
      onclick: function () { pickFiles('image/*', false, function (fs) { setImage(obj, fs[0]); }); },
      ondragover: function (e) { e.preventDefault(); el.classList.add('over'); },
      ondragleave: function () { el.classList.remove('over'); },
      ondrop: function (e) {
        e.preventDefault(); el.classList.remove('over');
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) setImage(obj, f);
      }
    },
      h('div', { class: 'pic', style: hasImg ? { backgroundImage: 'url("' + S.assets[obj.img] + '")' } : null }),
      h('div', { class: 'txt', text: hasImg ? '눌러서 다른 이미지로 바꾸거나, 파일을 끌어다 놓으세요.' : (emptyText || '눌러서 이미지를 고르거나, 파일을 여기에 끌어다 놓으세요.') }),
      hasImg ? h('button', { class: 'btn small danger', text: '제거', onclick: function (e) { e.stopPropagation(); obj.img = null; touch({ panel: true }); } }) : null
    );
    return el;
  }
  function gcAssets() {
    var used = {};
    S.a.concat(S.b, S.bgs).forEach(function (x) { if (x.img) used[x.img] = 1; });
    Object.keys(S.assets).forEach(function (k) { if (!used[k]) delete S.assets[k]; });
  }

  /* ───────── 좌측 메뉴: 탭 ───────── */
  var TABS = [['a', 'SIDE A'], ['b', 'SIDE B'], ['bg', '배경'], ['style', '스타일'], ['out', '저장']];
  function renderTabs() {
    var root = $('tabs'); root.textContent = '';
    TABS.forEach(function (t) {
      root.appendChild(h('button', {
        class: ui.tab === t[0] ? 'on' : '', text: t[1], role: 'tab',
        onclick: function () { ui.tab = t[0]; renderTabs(); renderPanel(); }
      }));
    });
  }
  function renderPanel() {
    var root = $('panel'), y = root.scrollTop;
    root.textContent = '';
    if (ui.tab === 'a' || ui.tab === 'b') append(root, panelCards(ui.tab));
    else if (ui.tab === 'bg') append(root, panelBg());
    else if (ui.tab === 'style') append(root, panelStyle());
    else append(root, panelOut());
    root.scrollTop = y;
  }

  /* ───────── 좌측 메뉴: 카드 ───────── */
  function jumpToScene(pred) {
    for (var i = 0; i < S.scenes.length; i++) if (pred(S.scenes[i])) { selectScene(i); return true; }
    return false;
  }
  function panelCards(side) {
    var list = S[side], SIDE = side.toUpperCase(), out = [];
    out.push(h('p', { class: 'hint', text: 'SIDE ' + SIDE + ' 카드입니다. 위에서부터 차례로 넘어갑니다.' }));
    list.forEach(function (card, i) {
      var open = ui.open[side] === card.id;
      var nameEl = h('span', { class: 'name', text: card.title || '(제목 없음)' });
      var head = h('div', {
        class: 'item-head',
        onclick: function () {
          ui.open[side] = open ? null : card.id;
          if (!open) jumpToScene(function (sc) { return sc[side] === card.id; });
          renderPanel();
        }
      },
        h('div', { class: 'thumb', style: card.img && S.assets[card.img] ? { backgroundImage: 'url("' + S.assets[card.img] + '")' } : null }),
        h('span', { class: 'num', text: SIDE + (i + 1) }), nameEl,
        h('div', { class: 'tools', onclick: function (e) { e.stopPropagation(); } },
          h('button', { class: 'btn small icon', text: '↑', title: '위로', disabled: i === 0, onclick: function () { list.splice(i - 1, 0, list.splice(i, 1)[0]); touch({ struct: true, panel: true }); } }),
          h('button', { class: 'btn small icon', text: '↓', title: '아래로', disabled: i === list.length - 1, onclick: function () { list.splice(i + 1, 0, list.splice(i, 1)[0]); touch({ struct: true, panel: true }); } }),
          h('button', { class: 'btn small icon', text: '⧉', title: '복제', onclick: function () { var c = Object.assign({}, card, { id: uid() }); list.splice(i + 1, 0, c); ui.open[side] = c.id; touch({ struct: true, panel: true }); } }),
          h('button', { class: 'btn small icon danger', text: '✕', title: '삭제', disabled: list.length <= 1, onclick: function () { list.splice(i, 1); touch({ struct: true, panel: true }); } })
        )
      );
      var body = null;
      if (open) {
        body = h('div', { class: 'item-body' },
          dropZone(card),
          fText('제목', card, 'title', { oninput: function (v) { nameEl.textContent = v || '(제목 없음)'; } }),
          fText('짧은 문구', card, 'text', { multiline: true, rows: 3 }),
          card.img ? [
            fRange('이미지 가로 위치', card, 'px', 0, 100, 1),
            fRange('이미지 세로 위치', card, 'py', 0, 100, 1),
            fRange('이미지 확대', card, 'zoom', 100, 300, 1, { unit: '%' })
          ] : null
        );
      }
      out.push(h('div', { class: 'item' + (open ? ' open' : '') }, head, body));
    });
    out.push(h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', text: '+ 카드 추가',
        onclick: function () { var c = newCard(side, list.length + 1); list.push(c); ui.open[side] = c.id; touch({ struct: true, panel: true }); jumpToScene(function (sc) { return sc[side] === c.id; }); }
      }),
      h('button', {
        class: 'btn', text: '+ 이미지 여러 장으로 추가',
        onclick: function () {
          pickFiles('image/*', true, function (files) {
            files.reduce(function (p, f) {
              return p.then(function () { return addAsset(f); }).then(function (id) {
                var c = newCard(side, list.length + 1); c.img = id; list.push(c);
              }).catch(function (e) { toast(f.name + ': ' + e.message); });
            }, Promise.resolve()).then(function () { touch({ struct: true, panel: true }); });
          });
        }
      })
    ));
    if (S.mode === 'manual') out.push(h('p', { class: 'hint', text: '타임라인이 "직접 구성" 상태입니다. 새 카드는 아래 타임라인에서 장면에 직접 넣어 주세요.' }));
    return out;
  }

  /* ───────── 좌측 메뉴: 배경 ───────── */
  function bgSwatch(bg) {
    if (bg.type === 'image' && bg.img && S.assets[bg.img]) return { backgroundImage: 'url("' + S.assets[bg.img] + '")' };
    if (bg.type === 'gradient') return { backgroundImage: 'linear-gradient(135deg,' + bg.color + ',' + bg.color2 + ')' };
    return { backgroundColor: bg.color, backgroundImage: 'none' };
  }
  function panelBg() {
    var out = [];
    out.push(h('p', { class: 'hint', text: '배경을 여러 개 만들면 타임라인에서 장면마다 다른 배경을 고를 수 있습니다. 배경이 바뀌는 장면에서는 큰 글자와 함께 부드럽게 겹쳐 넘어갑니다.' }));
    S.bgs.forEach(function (bg, i) {
      var open = ui.openBg === bg.id || S.bgs.length === 1;
      var used = S.scenes.some(function (sc) { return sc.bg === bg.id; });
      var head = h('div', {
        class: 'item-head',
        onclick: function () {
          ui.openBg = open ? null : bg.id;
          if (!open) jumpToScene(function (sc) { return sc.bg === bg.id; });
          renderPanel();
        }
      },
        h('div', { class: 'thumb', style: bgSwatch(bg) }),
        h('span', { class: 'num', text: '배경 ' + (i + 1) }),
        h('span', { class: 'name', text: used ? '' : '(아직 쓰이지 않음)', style: { fontWeight: 400, color: 'var(--muted)' } }),
        h('div', { class: 'tools', onclick: function (e) { e.stopPropagation(); } },
          h('button', { class: 'btn small icon', text: '⧉', title: '복제', onclick: function () { var c = Object.assign({}, bg, { id: uid() }); S.bgs.splice(i + 1, 0, c); ui.openBg = c.id; touch({ struct: true, panel: true }); } }),
          h('button', { class: 'btn small icon danger', text: '✕', title: '삭제', disabled: S.bgs.length <= 1, onclick: function () { S.bgs.splice(i, 1); touch({ struct: true, panel: true }); } })
        )
      );
      var body = null;
      if (open) {
        var kids = [];
        kids.push(fSelect('종류', bg, 'type', [['solid', '단색'], ['gradient', '그라데이션'], ['image', '이미지']], { rerender: true }));
        if (bg.type === 'solid') kids.push(fColor('색', bg, 'color'));
        if (bg.type === 'gradient') {
          kids.push(fSelect('모양', bg, 'gradType', [['linear', '직선'], ['radial', '원형']], { rerender: true }));
          kids.push(fColor(bg.gradType === 'radial' ? '안쪽 색' : '시작 색', bg, 'color'));
          kids.push(fColor(bg.gradType === 'radial' ? '바깥 색' : '끝 색', bg, 'color2'));
          if (bg.gradType !== 'radial') kids.push(fRange('방향', bg, 'angle', 0, 360, 1, { unit: '°' }));
        }
        if (bg.type === 'image') {
          kids.push(dropZone(bg));
          kids.push(fRange('흐림', bg, 'blur', 0, 80, 1));
          kids.push(fRange('가로 위치', bg, 'px', 0, 100, 1));
          kids.push(fRange('세로 위치', bg, 'py', 0, 100, 1));
          kids.push(fRange('확대', bg, 'zoom', 100, 300, 1, { unit: '%' }));
        }
        kids.push(fRange('색 덮기', bg, 'dim', 0, 100, 1, { unit: '%' }));
        if (bg.dim > 0 || bg.type === 'image') kids.push(fColor('덮는 색', bg, 'dimColor'));
        kids.push(h('h3', { text: '배경 큰 글자', style: { margin: '14px 0 8px', fontSize: '12px', color: 'var(--muted)' } }));
        kids.push(fText('내용', bg, 'bigText', { multiline: true, rows: 2, placeholder: '비워 두면 표시하지 않습니다' }));
        kids.push(fRange('크기', bg, 'bigSize', 40, 900, 2));
        kids.push(fRange('불투명도', bg, 'bigOpacity', 0, 100, 1, { unit: '%' }));
        kids.push(fColor('색', bg, 'bigColor'));
        kids.push(fSelect('굵기', bg, 'bigWeight', WEIGHTS, { num: true }));
        kids.push(fRange('세로 위치', bg, 'bigY', 0, 100, 1, { unit: '%' }));
        kids.push(fRange('글자 간격', bg, 'bigSpacing', -40, 200, 1));
        kids.push(h('div', { class: 'btn-row', style: { marginTop: '10px' } },
          h('button', { class: 'btn small', text: '선택한 장면에 적용', onclick: function () { S.scenes[ui.sel].bg = bg.id; touch({ struct: true, panel: true }); } }),
          h('button', { class: 'btn small', text: '모든 장면에 적용', onclick: function () { S.scenes.forEach(function (sc) { sc.bg = bg.id; }); touch({ struct: true, panel: true }); } })
        ));
        body = h('div', { class: 'item-body' }, kids);
      }
      out.push(h('div', { class: 'item' + (open ? ' open' : '') }, head, body));
    });
    out.push(h('button', {
      class: 'btn', text: '+ 배경 추가',
      onclick: function () { var b = newBg(); b.color = '#1f3b3a'; b.color2 = '#c98566'; S.bgs.push(b); ui.openBg = b.id; touch({ struct: true, panel: true }); }
    }));
    return out;
  }

  /* ───────── 좌측 메뉴: 스타일 ───────── */
  var GOOGLE_SUGGEST = ['Noto Sans KR', 'Noto Serif KR', 'Black Han Sans', 'Do Hyeon', 'Jua', 'Gowun Batang', 'Gowun Dodum', 'Nanum Myeongjo', 'Nanum Pen Script', 'Gmarket Sans', 'IBM Plex Sans KR', 'Bebas Neue', 'Playfair Display', 'Anton', 'Oswald', 'Montserrat'];
  var gfLoading = {};
  function loadGoogleFont(name) {
    if (gfLoading[name]) return gfLoading[name];
    var fam = encodeURIComponent(name).replace(/%20/g, '+');
    var base = 'https://fonts.googleapis.com/css2?family=' + fam;
    var tries = [base + ':wght@400;700;900&display=swap', base + ':wght@400;700&display=swap', base + '&display=swap'];
    gfLoading[name] = new Promise(function (res) {
      (function next(i) {
        if (i >= tries.length) { delete gfLoading[name]; res(false); return; }
        var l = h('link', { rel: 'stylesheet', href: tries[i] });
        l.onload = function () { res(true); };
        l.onerror = function () { l.remove(); next(i + 1); };
        document.head.appendChild(l);
      })(0);
    });
    return gfLoading[name];
  }
  function fontOptions() {
    return [['Pretendard', 'Pretendard (기본)']].concat(S.fonts.google.map(function (n) { return [n, n]; }));
  }
  function panelStyle() {
    var st = S.style, f = S.fonts;
    var gfInput = h('input', { type: 'text', placeholder: '예: Noto Serif KR', list: 'gfList' });
    function addGF() {
      var name = gfInput.value.trim().replace(/\s+/g, ' ');
      if (!name) return;
      if (f.google.indexOf(name) >= 0) { toast('이미 추가된 폰트입니다.'); return; }
      toast('"' + name + '" 폰트를 불러오는 중…');
      loadGoogleFont(name).then(function (ok) {
        if (!ok) { toast('폰트를 불러오지 못했습니다. 인터넷 연결과 폰트 이름(영문 표기)을 확인해 주세요.', 5000); return; }
        f.google.push(name); toast('"' + name + '" 폰트를 추가했습니다. 위 목록에서 골라 적용하세요.');
        touch({ panel: true });
      });
    }
    return [
      section('폰트',
        fSelect('카드 제목', f, 'title', fontOptions()),
        fSelect('카드 문구', f, 'body', fontOptions()),
        fSelect('배경 큰 글자', f, 'big', fontOptions()),
        h('div', { class: 'field stack' }, h('label', { text: 'Google Fonts 추가 (인터넷 연결 필요)' }),
          h('div', { class: 'row' }, gfInput, h('button', { class: 'btn', text: '추가', onclick: addGF })),
          h('datalist', { id: 'gfList' }, GOOGLE_SUGGEST.map(function (n) { return h('option', { value: n }); }))),
        f.google.length ? h('div', { class: 'btn-row' }, f.google.map(function (n) {
          return h('button', {
            class: 'btn small danger', text: n + ' ✕', title: '목록에서 빼기',
            onclick: function () {
              f.google = f.google.filter(function (x) { return x !== n; });
              ['title', 'body', 'big'].forEach(function (k) { if (f[k] === n) f[k] = 'Pretendard'; });
              touch({ panel: true });
            }
          });
        })) : null,
        h('p', { class: 'hint', text: 'Google Fonts에 등록된 영문 이름을 그대로 입력합니다. 불러오지 못하면 Pretendard로 표시됩니다.' })
      ),
      section('카드',
        fSelect('글자 배치', st, 'textMode', [['below', '이미지 아래'], ['overlay', '이미지 위에 겹치기']], {
          rerender: true,
          onchange: function (v) {
            // 배치를 바꾸면 글자색이 묻히지 않도록 기본색만 함께 바꾼다
            if (v === 'overlay' && st.titleColor === DEFAULT_STYLE.titleColor) { st.titleColor = '#ffffff'; st.textColor = '#e3e6ee'; }
            if (v === 'below' && st.titleColor === '#ffffff') { st.titleColor = DEFAULT_STYLE.titleColor; st.textColor = DEFAULT_STYLE.textColor; }
          }
        }),
        fRange('너비', st, 'cardW', 300, 860, 2),
        fRange('높이', st, 'cardH', 300, 1000, 2),
        fRange('카드 사이 간격', st, 'gap', 0, 700, 2),
        fRange('세로 위치', st, 'offsetY', -200, 200, 2),
        fRange('모서리 둥글기', st, 'radius', 0, 120, 1),
        st.textMode === 'below' ? fRange('이미지 높이', st, 'imgRatio', 20, 100, 1, { unit: '%' }) : null,
        st.textMode === 'below' ? fRange('이미지 안쪽 여백', st, 'imgInset', 0, 60, 1) : null,
        fRange('글자 여백', st, 'pad', 10, 100, 1),
        fSelect('글자 정렬', st, 'align', [['left', '왼쪽'], ['center', '가운데']]),
        fColor('카드 색', st, 'cardColor'),
        fRange('그림자', st, 'shadow', 0, 100, 1, { unit: '%' })
      ),
      section('카드 글자',
        fRange('제목 크기', st, 'titleSize', 16, 120, 1),
        fSelect('제목 굵기', st, 'titleWeight', WEIGHTS, { num: true }),
        fColor('제목 색', st, 'titleColor'),
        fRange('문구 크기', st, 'textSize', 12, 80, 1),
        fSelect('문구 굵기', st, 'textWeight', WEIGHTS, { num: true }),
        fColor('문구 색', st, 'textColor')
      ),
      section('중앙 글자 (두 카드 사이)',
        fText('내용', st, 'centerText', { placeholder: '예: VS, ×, & (비워 두면 표시 안 함)' }),
        fRange('크기', st, 'centerSize', 20, 300, 1),
        fSelect('굵기', st, 'centerWeight', WEIGHTS, { num: true }),
        fColor('색', st, 'centerColor')
      ),
      section('전환 효과',
        fCheck('좌우로 움직이는 효과는 SIDE B에서 반대 방향으로 (좌우 대칭)', st, 'mirrorB')
      )
    ];
  }

  /* ───────── 좌측 메뉴: 저장 ───────── */
  function gifSummary() {
    var plan = CS.planGif(S, { width: S.exp.gifW, fps: S.exp.fps, loop: S.exp.loop });
    return plan.width + '×' + plan.height + ' · ' + plan.frames.length + '프레임 · ' + (plan.total / 1000).toFixed(1) + '초';
  }
  function panelOut() {
    var e = S.exp;
    var sum = h('p', { class: 'hint', text: gifSummary() });
    function upd() { sum.textContent = gifSummary(); }
    var wSel = fSelect('가로 크기', e, 'gifW', [[640, '640×360 (가볍게)'], [960, '960×540 (권장)'], [1280, '1280×720'], [1920, '1920×1080 (용량 큼)']], { num: true, onchange: upd });
    var fSel = fSelect('부드러움', e, 'fps', [[10, '초당 10장 (가볍게)'], [16, '초당 약 16장'], [20, '초당 20장 (권장)'], [25, '초당 25장'], [33, '초당 약 33장 (용량 큼)']], { num: true, onchange: upd });
    return [
      section('PNG (정지 이미지)',
        fSelect('크기', e, 'pngScale', [[0.5, '960×540'], [1, '1920×1080 (기본)'], [2, '3840×2160']], { num: true }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', text: '지금 장면 PNG 저장', onclick: doPng }),
          h('button', { class: 'btn', text: '모든 장면 PNG (ZIP)', onclick: doPngAll })),
        h('p', { class: 'hint', text: '미리보기에 보이는 화면 그대로 저장합니다. 타임라인에서 전환 도중의 순간을 골라 저장할 수도 있습니다.' })
      ),
      section('GIF (전환 효과 포함)',
        wSel, fSel,
        fCheck('색 띠 줄이기 (그라데이션·흐린 배경을 부드럽게, 용량은 1.5~2배로 커짐)', e, 'dither'),
        sum,
        h('button', { class: 'btn primary', text: 'GIF 저장', onclick: doGif }),
        h('p', { class: 'hint', text: 'GIF는 한 장에 256색만 쓸 수 있어 PNG보다 색이 거칠 수 있습니다. 반복 방식(마지막 → 처음 전환)은 타임라인 위쪽에서 바꿉니다.' })
      ),
      section('작업 파일',
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', text: '작업 파일로 저장 (.json)', onclick: saveProject }),
          h('button', { class: 'btn', text: '작업 파일 불러오기', onclick: loadProject })),
        h('p', { class: 'hint', text: '이미지까지 한 파일에 담깁니다. 다른 컴퓨터나 브라우저에서도 불러와 이어서 편집할 수 있습니다.' })
      ),
      section('임시 저장',
        h('p', { class: 'hint', text: '입력 내용은 이 브라우저에 자동으로 임시 저장되어, 창을 닫았다 열어도 이어서 작업할 수 있습니다. 브라우저의 사이트 데이터를 지우면 함께 사라지니 중요한 작업은 작업 파일로 저장해 두세요.' }),
        h('button', { class: 'btn danger', text: '모두 지우고 새로 만들기', onclick: newProject })
      )
    ];
  }

  /* ───────── 타임라인 ───────── */
  var PX_PER_MS = 0.085, tlBar, tlBody, tlInsp, tlTrack, tlHead, tlTimeEl;
  function fxName(id) { var f = CS.EFFECTS.filter(function (x) { return x.id === id; })[0]; return f ? f.name : id; }
  function sec(ms) { return (ms / 1000).toFixed(1).replace(/\.0$/, ''); }
  function fmtTime(ms) { var s = Math.max(0, ms) / 1000; return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); }
  function cardLabel(side, id) {
    var list = S[side];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return { n: side.toUpperCase() + (i + 1), title: list[i].title, img: list[i].img };
    return { n: '?', title: '', img: null };
  }
  function bgIndex(id) { for (var i = 0; i < S.bgs.length; i++) if (S.bgs[i].id === id) return i; return 0; }

  function initTimeline() {
    var root = $('timeline');
    tlBar = h('div', { class: 'tl-bar' });
    tlBody = h('div', { class: 'tl-body' });
    tlInsp = h('div', { class: 'tl-inspector', onpointerdown: function () { stopPlay(); } });
    append(root, [tlBar, tlBody, tlInsp]);
  }

  function renderTimeline() {
    clearTimeout(tlTimer);
    var tl = ui.tl = CS.buildTimeline(S, S.exp.loop);
    ui.sel = clamp(ui.sel, 0, S.scenes.length - 1);

    // 장면별 칸 계산 (칸 하나 = 그 장면으로 들어오는 전환 + 유지)
    var cols = [], cur = null;
    tl.segs.forEach(function (seg) {
      if (seg.loop) { cols.push({ idx: -1, t0: seg.start, t1: seg.start + seg.dur, trans: seg.dur, hold0: seg.start }); return; }
      if (seg.type === 'trans') { cur = { idx: seg.to, t0: seg.start, trans: seg.dur }; return; }
      if (!cur) cur = { idx: seg.to, t0: seg.start, trans: 0 };
      cur.hold0 = seg.start; cur.t1 = seg.start + seg.dur; cols.push(cur); cur = null;
    });
    var x = 0;
    cols.forEach(function (c) { c.w = Math.max(c.idx < 0 ? 64 : 120, Math.round((c.t1 - c.t0) * PX_PER_MS)); c.x0 = x; x += c.w; });
    ui.cols = cols;
    if (!ui.playing) { var sc = cols.filter(function (c) { return c.idx === ui.sel; })[0]; if (sc && !ui.scrub) ui.t = sc.hold0; }
    ui.t = clamp(ui.t, 0, Math.max(0, tl.total - 1));

    // 위쪽 바
    tlBar.textContent = '';
    tlTimeEl = h('span', { class: 'tl-time' });
    append(tlBar, [
      h('button', { class: 'btn', text: ui.playing ? '❚❚ 멈춤' : '▶ 재생', title: '스페이스바', onclick: togglePlay }),
      tlTimeEl,
      h('div', { class: 'tl-modes', title: 'SIDE A와 B가 넘어가는 방식' },
        [['sync', '동시에 넘기기'], ['alt', '번갈아 넘기기'], ['manual', '직접 구성']].map(function (m) {
          return h('button', { class: 'btn small' + (S.mode === m[0] ? ' active' : ''), text: m[1], onclick: function () { setMode(m[0]); } });
        })),
      h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer', color: 'var(--muted)' } },
        h('input', { type: 'checkbox', checked: S.exp.loop, onchange: function (e) { S.exp.loop = e.target.checked; touch({ timing: true, panel: ui.tab === 'out' }); } }),
        '마지막 → 처음도 전환 효과로 잇기'),
      h('div', { class: 'tl-spacer' }),
      h('button', { class: 'btn small', text: '+ 장면 추가', onclick: addScene })
    ]);

    // 트랙
    tlBody.textContent = '';
    ui.sceneEls = [];
    tlTrack = h('div', { class: 'tl-track' });
    cols.forEach(function (c) {
      var el;
      if (c.idx < 0) {
        el = h('div', { class: 'tl-scene', style: { width: c.w + 'px' }, title: '마지막 장면에서 첫 장면으로 돌아가는 전환 (1번 장면의 전환 설정을 사용)' },
          h('div', { class: 'tl-ruler' }, '↺ 처음으로'),
          h('div', { class: 'tl-trans', style: { width: '100%' } }));
      } else {
        var s = S.scenes[c.idx], prev = S.scenes[c.idx - 1];
        var la = cardLabel('a', s.a), lb = cardLabel('b', s.b), gi = bgIndex(s.bg);
        var keepA = prev && prev.a === s.a, keepB = prev && prev.b === s.b, keepG = prev && prev.bg === s.bg;
        var chip = function (cls, keep, lab, img) {
          return h('div', { class: 'tl-cell' }, h('div', { class: 'tl-chip ' + (keep ? 'keep' : cls) },
            img && S.assets[img] && !keep ? h('i', { style: { backgroundImage: 'url("' + S.assets[img] + '")' } }) : null,
            h('span', { text: keep ? lab + ' 유지' : lab })));
        };
        el = h('div', { class: 'tl-scene' + (c.idx === ui.sel ? ' sel' : ''), style: { width: c.w + 'px' } },
          h('div', { class: 'tl-ruler' }, h('b', { text: String(c.idx + 1) }),
            (c.trans > 0 ? fxName(s.fx).replace(/ \(.*\)/, '') + ' ' + sec(c.trans) + '초 → ' : '') + sec(s.hold) + '초'),
          chip('a', keepA, la.n + (la.title && !keepA ? ' ' + la.title : ''), la.img),
          chip('b', keepB, lb.n + (lb.title && !keepB ? ' ' + lb.title : ''), lb.img),
          chip('g', keepG, '배경 ' + (gi + 1), null),
          c.trans > 0 ? h('div', { class: 'tl-trans', style: { width: (c.trans / (c.t1 - c.t0) * 100) + '%' } }) : null);
        ui.sceneEls[c.idx] = el;
      }
      tlTrack.appendChild(el);
    });
    tlHead = h('div', { class: 'tl-playhead' });
    tlTrack.appendChild(tlHead);

    var down = false;
    function scrubTo(e) {
      var r = tlTrack.getBoundingClientRect();
      ui.scrub = true;
      ui.t = clamp(xToTime(e.clientX - r.left), 0, Math.max(0, tl.total - 1));
      var fr = CS.frameAt(tl, ui.t);
      if (!(fr.seg && fr.seg.loop) && fr.to !== ui.sel) setSel(fr.to, true);
      scheduleDraw();
    }
    tlTrack.addEventListener('pointerdown', function (e) { down = true; stopPlay(); tlTrack.setPointerCapture(e.pointerId); scrubTo(e); });
    tlTrack.addEventListener('pointermove', function (e) { if (down) scrubTo(e); });
    tlTrack.addEventListener('pointerup', function () { down = false; });
    tlTrack.addEventListener('pointercancel', function () { down = false; });

    append(tlBody, [
      h('div', { class: 'tl-labels' },
        h('div', { class: 'ruler-label', text: '장면' }), h('div', { class: 'la', text: 'SIDE A' }),
        h('div', { class: 'lb', text: 'SIDE B' }), h('div', { class: 'lg', text: '배경' })),
      h('div', { class: 'tl-scroll' }, tlTrack)
    ]);
    updatePlayhead();
    scheduleDraw();
  }

  function xToTime(x) {
    var cols = ui.cols;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (x < c.x0 + c.w || i === cols.length - 1) return c.t0 + clamp((x - c.x0) / c.w, 0, 1) * (c.t1 - c.t0);
    }
    return 0;
  }
  function timeToX(t) {
    var cols = ui.cols;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (t < c.t1 || i === cols.length - 1) return c.x0 + (c.t1 > c.t0 ? clamp((t - c.t0) / (c.t1 - c.t0), 0, 1) : 0) * c.w;
    }
    return 0;
  }
  function updatePlayhead() {
    if (!tlHead || !ui.tl) return;
    tlHead.style.left = timeToX(ui.t) + 'px';
    if (tlTimeEl) tlTimeEl.textContent = fmtTime(ui.t) + ' / ' + fmtTime(ui.tl.total);
    if (ui.playing) {
      var sc = tlTrack.parentNode, x = timeToX(ui.t);
      if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = Math.max(0, x - 60);
    }
  }

  function setSel(i, fromDraw) {
    ui.sel = clamp(i, 0, S.scenes.length - 1);
    ui.sceneEls.forEach(function (el, k) { if (el) el.classList.toggle('sel', k === ui.sel); });
    renderInspector();
    if (!fromDraw) scheduleDraw();
  }
  function selectScene(i) {
    stopPlay();
    ui.scrub = false;
    ui.sel = clamp(i, 0, S.scenes.length - 1);
    var c = ui.cols.filter(function (c) { return c.idx === ui.sel; })[0];
    if (c) ui.t = c.hold0;
    setSel(ui.sel);
  }

  function togglePlay() {
    if (ui.playing) { stopPlay(); return; }
    if (!ui.tl || ui.tl.total <= 0) return;
    ui.playing = true; ui.scrub = true; lastTs = 0;
    renderTimeline();
  }
  function stopPlay() {
    if (!ui.playing) return;
    ui.playing = false;
    var b = tlBar && tlBar.querySelector('button'); if (b) b.textContent = '▶ 재생';
  }

  function setMode(m) {
    if (m === S.mode) return;
    if (m !== 'manual' && S.mode === 'manual' &&
      !window.confirm('카드 순서대로 장면을 다시 만듭니다.\n직접 바꾼 카드 배치는 사라집니다. (전환 효과·시간·배경 설정은 장면 순서대로 유지됩니다)\n계속할까요?')) return;
    S.mode = m; ui.scrub = false;
    touch({ struct: true, panel: ui.tab === 'a' || ui.tab === 'b' });
  }
  function addScene() {
    ensureManual();
    var src = S.scenes[ui.sel];
    S.scenes.splice(ui.sel + 1, 0, Object.assign({}, src, { id: uid() }));
    ui.sel++; ui.scrub = false;
    touch({ struct: true, panel: ui.tab === 'a' || ui.tab === 'b' });
  }

  /* 선택한 장면의 설정 */
  function renderInspector() {
    var s = S.scenes[ui.sel], i = ui.sel;
    tlInsp.textContent = '';
    if (!s) return;
    function numSec(key, min, max, title) {
      var inp = h('input', {
        type: 'number', min: min, max: max, step: 0.1, value: (s[key] / 1000).toFixed(2).replace(/0$/, ''), title: title || '',
        onchange: function () {
          var v = clamp(parseFloat(inp.value) || 0, min, max);
          s[key] = Math.round(v * 1000); inp.value = v;
          ui.scrub = false; touch({ timing: true, panel: ui.tab === 'out' });
        }
      });
      return inp;
    }
    function pick(key, options, manual) {
      var sel = h('select', {
        onchange: function () {
          if (manual) ensureManual();
          s[key] = sel.value; ui.scrub = false;
          touch({ struct: true, panel: ui.tab !== 'style' && ui.tab !== 'out' });
        }
      }, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      sel.value = s[key];
      return sel;
    }
    var cardOpts = function (side) { return S[side].map(function (c, k) { return [c.id, side.toUpperCase() + (k + 1) + (c.title ? ' · ' + c.title : '')]; }); };
    var manualOps = function (fn) { return function () { ensureManual(); fn(); ui.scrub = false; touch({ struct: true, panel: ui.tab === 'a' || ui.tab === 'b' }); }; };

    append(tlInsp, [
      h('span', { class: 'title', text: '장면 ' + (i + 1) }),
      h('div', { class: 'grp' }, h('label', { text: 'SIDE A' }), pick('a', cardOpts('a'), true)),
      h('div', { class: 'grp' }, h('label', { text: 'SIDE B' }), pick('b', cardOpts('b'), true)),
      h('div', { class: 'grp' }, h('label', { text: '배경' }), pick('bg', S.bgs.map(function (b, k) { return [b.id, '배경 ' + (k + 1)]; }), false)),
      h('div', { class: 'sep' }),
      h('div', { class: 'grp', title: i === 0 ? '1번 장면의 전환은 마지막 장면에서 처음으로 돌아올 때 쓰입니다' : '앞 장면에서 이 장면으로 넘어올 때의 효과' },
        h('label', { text: i === 0 ? '전환 (↺ 돌아올 때)' : '전환' }),
        (function () {
          var sel = h('select', { onchange: function () { s.fx = sel.value; ui.scrub = false; touch({ timing: true, panel: ui.tab === 'out' }); } },
            CS.EFFECTS.map(function (f) { return h('option', { value: f.id, text: f.name }); }));
          sel.value = s.fx; return sel;
        })(),
        numSec('dur', 0.1, 5), h('label', { text: '초' })),
      h('div', { class: 'grp', title: '양쪽 카드가 함께 바뀔 때의 시간 차이. 양수면 B가 늦게, 음수면 A가 늦게 시작합니다. 0이면 동시에 바뀝니다.' },
        h('label', { text: 'A·B 시간차' }), numSec('stagger', -3, 3), h('label', { text: '초' })),
      h('div', { class: 'grp', title: '이 장면이 멈춰서 보이는 시간' }, h('label', { text: '유지' }), numSec('hold', 0, 30), h('label', { text: '초' })),
      h('div', { class: 'sep' }),
      h('div', { class: 'grp' },
        h('button', {
          class: 'btn small', text: '전환·시간을 모든 장면에', title: '이 장면의 전환 효과, 전환 시간, 시간차, 유지 시간을 모든 장면에 똑같이 적용',
          onclick: function () { S.scenes.forEach(function (x) { x.fx = s.fx; x.dur = s.dur; x.stagger = s.stagger; x.hold = s.hold; }); ui.scrub = false; touch({ timing: true, panel: ui.tab === 'out' }); toast('모든 장면에 적용했습니다.'); }
        }),
        h('button', { class: 'btn small icon', text: '◀', title: '앞으로 옮기기', disabled: i === 0, onclick: manualOps(function () { S.scenes.splice(i - 1, 0, S.scenes.splice(i, 1)[0]); ui.sel = i - 1; }) }),
        h('button', { class: 'btn small icon', text: '▶', title: '뒤로 옮기기', disabled: i === S.scenes.length - 1, onclick: manualOps(function () { S.scenes.splice(i + 1, 0, S.scenes.splice(i, 1)[0]); ui.sel = i + 1; }) }),
        h('button', { class: 'btn small icon danger', text: '✕', title: '장면 삭제', disabled: S.scenes.length <= 1, onclick: manualOps(function () { S.scenes.splice(i, 1); ui.sel = Math.max(0, i - 1); }) })
      )
    ]);
  }

  /* ───────── 내보내기 ───────── */
  function prepare() {
    return CS.loadAssets(S.assets).then(function () { return CS.ensureFonts(S); });
  }
  function currentFrame() {
    var fr = CS.frameAt(ui.tl, ui.t);
    return { from: fr.from, to: fr.to, ms: fr.ms };
  }
  function doPng() {
    stopPlay();
    prepare().then(function () { return CS.exportPNG(S, currentFrame(), S.exp.pngScale); })
      .then(function (blob) { CS.downloadBlob(blob, 'side-ab-' + stamp() + '.png'); toast('PNG를 저장했습니다. (' + fmtSize(blob.size) + ')'); })
      .catch(function (e) { toast('PNG 저장에 실패했습니다: ' + e.message, 5000); });
  }
  function showOverlay(title) {
    $('overlayTitle').textContent = title; $('overlayBar').style.width = '0%'; $('overlayText').textContent = '준비 중…';
    $('overlay').hidden = false;
  }
  function doPngAll() {
    stopPlay();
    showOverlay('모든 장면을 PNG로 만드는 중');
    $('overlayCancel').hidden = true;
    prepare().then(function () {
      return CS.exportAllPNG(S, S.exp.pngScale, function (i, n) { $('overlayBar').style.width = (i / n * 100) + '%'; $('overlayText').textContent = i + ' / ' + n + ' 장면'; });
    }).then(function (blob) {
      CS.downloadBlob(blob, 'side-ab-scenes-' + stamp() + '.zip'); toast('장면 ' + S.scenes.length + '장을 ZIP으로 저장했습니다. (' + fmtSize(blob.size) + ')');
    }).catch(function (e) { toast('저장에 실패했습니다: ' + e.message, 5000); })
      .then(function () { $('overlay').hidden = true; $('overlayCancel').hidden = false; });
  }
  var gifBusy = false;
  function doGif() {
    if (gifBusy) return;
    stopPlay(); gifBusy = true;
    var cancelled = false, t0 = Date.now();
    showOverlay('GIF 만드는 중');
    $('overlayCancel').onclick = function () { cancelled = true; };
    prepare().then(function () {
      return CS.exportGIF(S, { width: S.exp.gifW, fps: S.exp.fps, loop: S.exp.loop, dither: S.exp.dither },
        function (i, n) { $('overlayBar').style.width = (i / n * 100) + '%'; $('overlayText').textContent = i + ' / ' + n + ' 프레임'; },
        function () { return cancelled; });
    }).then(function (blob) {
      if (!blob) { toast('GIF 만들기를 취소했습니다.'); return; }
      CS.downloadBlob(blob, 'side-ab-' + stamp() + '.gif');
      toast('GIF를 저장했습니다. (' + fmtSize(blob.size) + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + '초 걸림)' +
        (blob.size > 15 * 1048576 ? ' X 업로드 제한(15MB)을 넘으니 가로 크기나 부드러움을 낮춰 보세요.' : ''), 6000);
    }).catch(function (e) { toast('GIF 저장에 실패했습니다: ' + e.message, 6000); })
      .then(function () { gifBusy = false; $('overlay').hidden = true; });
  }

  /* ───────── 작업 파일 ───────── */
  function saveProject() {
    gcAssets();
    var blob = new Blob([JSON.stringify({ app: 'side-ab-card-studio', version: 1, savedAt: new Date().toISOString(), state: S })], { type: 'application/json' });
    CS.downloadBlob(blob, 'side-ab-project-' + stamp() + '.json');
    toast('작업 파일을 저장했습니다. (' + fmtSize(blob.size) + ')');
  }
  function applyState(next) {
    stopPlay();
    S = migrate(next);
    ui.sel = 0; ui.t = 0; ui.scrub = false; ui.open = { a: null, b: null }; ui.openBg = null;
    rebuildScenes();
    S.fonts.google.forEach(function (n) { loadGoogleFont(n).then(function (ok) { if (ok) { CS.invalidate(); syncFonts(); scheduleDraw(); } }); });
    CS.invalidate();
    return CS.loadAssets(S.assets).then(function () {
      renderTabs(); renderPanel(); renderTimeline(); renderInspector(); syncFonts(); scheduleDraw();
    });
  }
  function loadProject() {
    pickFiles('.json,application/json', false, function (files) {
      files[0].text().then(function (txt) {
        var obj = JSON.parse(txt);
        if (!obj || obj.app !== 'side-ab-card-studio' || !obj.state) throw new Error('이 도구의 작업 파일이 아닙니다.');
        return applyState(obj.state);
      }).then(function () { toast('작업 파일을 불러왔습니다.'); scheduleSave(); })
        .catch(function (e) { toast('불러오지 못했습니다: ' + (e instanceof SyntaxError ? '파일 형식이 올바르지 않습니다.' : e.message), 5000); });
    });
  }
  function newProject() {
    if (!window.confirm('지금 내용과 임시 저장을 모두 지우고 처음 상태로 돌아갑니다.\n계속할까요?')) return;
    applyState(defaultState()).then(function () { scheduleSave(); toast('새 작업을 시작했습니다.'); });
  }

  /* ───────── 임시 저장 (브라우저 저장소) ─────────
   * 쿠키는 4KB까지만 담을 수 있어 이미지를 넣을 수 없으므로 IndexedDB를 쓴다.
   * IndexedDB를 쓸 수 없는 환경에서는 localStorage에 이미지 없이 저장한다. */
  var Store = {
    db: null,
    open: function () {
      if (Store.db) return Promise.resolve(Store.db);
      return new Promise(function (res, rej) {
        try {
          var r = indexedDB.open('side-ab-card-studio', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
          r.onsuccess = function () { Store.db = r.result; res(Store.db); };
          r.onerror = function () { rej(r.error); };
        } catch (e) { rej(e); }
      });
    },
    get: function (k) {
      return Store.open().then(function (db) {
        return new Promise(function (res, rej) {
          var q = db.transaction('kv').objectStore('kv').get(k);
          q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
        });
      });
    },
    set: function (k, v) {
      return Store.open().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(v, k);
          tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); };
        });
      });
    }
  };
  var LS_KEY = 'side-ab-card-studio:autosave';
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 900); }
  function saveNow() {
    clearTimeout(saveTimer);
    gcAssets();
    var done = function (note) {
      var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
      $('saveStatus').textContent = '임시 저장됨 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + (note || '');
    };
    return Store.set('autosave', S).then(function () { done(); }, function () {
      try {
        var snap = JSON.parse(JSON.stringify(S));
        snap.assets = {}; localStorage.setItem(LS_KEY, JSON.stringify(snap));
        done(' (이미지 제외)');
      } catch (e) { $('saveStatus').textContent = '임시 저장을 쓸 수 없는 환경입니다'; }
    });
  }
  function restore() {
    return Store.get('autosave').catch(function () {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
    });
  }

  /* ───────── 시작 ───────── */
  function init() {
    pcanvas = $('preview'); pctx = pcanvas.getContext('2d');
    initTimeline();
    $('btnTopPng').onclick = doPng;
    $('btnTopGif').onclick = doGif;
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || e.repeat) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return;
      e.preventDefault(); togglePlay();
    });
    window.addEventListener('beforeunload', function () { if (saveTimer) saveNow(); });
    // 페이지 전체에 파일을 떨어뜨려도 브라우저가 그 파일로 이동하지 않게 막는다
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    restore().then(function (saved) {
      return applyState(saved || defaultState()).then(function () {
        $('saveStatus').textContent = saved ? '임시 저장된 작업을 이어서 엽니다' : '자동 임시 저장 켜짐';
      });
    });
    // 폰트(또는 폰트의 한글 조각)가 뒤늦게 도착하면 그려 둔 카드·배경을 새 폰트로 다시 그린다
    if (document.fonts) {
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { CS.invalidate(); scheduleDraw(); });
      if (document.fonts.ready) document.fonts.ready.then(function () { CS.invalidate(); scheduleDraw(); });
    }
  }

  CS._debug = { state: function () { return S; }, ui: ui };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.CS);
