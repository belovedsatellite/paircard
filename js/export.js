/* ─────────────────────────────────────────────────────────────
 * export.js — PNG / GIF / ZIP 내보내기
 * ───────────────────────────────────────────────────────────── */
(function (CS) {
  'use strict';

  CS.downloadBlob = function (blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };

  function canvasToBlob(canvas, type) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { b ? res(b) : rej(new Error('이미지를 만들지 못했습니다.')); }, type || 'image/png');
    });
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* ───────── PNG ───────── */
  CS.exportPNG = function (S, frame, scale) {
    return canvasToBlob(CS.renderToCanvas(S, frame, scale));
  };

  CS.exportAllPNG = async function (S, scale, onProgress) {
    var files = [];
    for (var i = 0; i < S.scenes.length; i++) {
      var blob = await CS.exportPNG(S, { from: null, to: i, ms: 0 }, scale);
      files.push({ name: 'scene-' + String(i + 1).padStart(2, '0') + '.png', data: new Uint8Array(await blob.arrayBuffer()) });
      if (onProgress) onProgress(i + 1, S.scenes.length);
      await tick();
    }
    return CS.zipStore(files);
  };

  /* ───────── GIF ─────────
   * · 유지 구간은 프레임 1장 + 긴 표시 시간으로 처리 (용량 절약)
   * · 전환 구간만 fps에 맞춰 여러 장을 그린다
   * · 앞 프레임과 같은 픽셀은 투명 처리해서 용량을 줄인다 */
  CS.planGif = function (S, opts) {
    var tl = CS.buildTimeline(S, opts.loop);
    var step = Math.max(2, Math.round(100 / opts.fps)) * 10; // GIF 시간 단위는 10ms
    var frames = [];
    tl.segs.forEach(function (seg) {
      if (seg.type === 'hold') {
        if (seg.dur <= 0) return;
        frames.push({ f: { from: null, to: seg.to, ms: 0 }, delay: Math.max(20, Math.round(seg.dur / 10) * 10) });
      } else {
        var n = Math.max(1, Math.round(seg.dur / step));
        for (var k = 0; k < n; k++) {
          frames.push({ f: { from: seg.from, to: seg.to, ms: (k + 1) / (n + 1) * seg.dur }, delay: step });
        }
      }
    });
    if (!frames.length) frames.push({ f: { from: null, to: 0, ms: 0 }, delay: 1000 });
    var total = frames.reduce(function (s, f) { return s + f.delay; }, 0);
    var w = opts.width, h = Math.round(w * CS.H / CS.W);
    return { frames: frames, total: total, width: w, height: h, scale: w / CS.W };
  };

  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  CS.exportGIF = async function (S, opts, onProgress, isCancelled) {
    var enc = window.gifenc, plan = CS.planGif(S, opts);
    var w = plan.width, h = plan.height, n = w * h;
    var canvas = CS.makeCanvas(w, h), ctx = canvas.getContext('2d', { willReadFrequently: true });
    var gif = enc.GIFEncoder();
    var prev = null;

    for (var i = 0; i < plan.frames.length; i++) {
      if (isCancelled && isCancelled()) return null;
      var fr = plan.frames[i];
      CS.drawFrame(ctx, S, fr.f, { scale: plan.scale, editor: false });
      var data = ctx.getImageData(0, 0, w, h).data;
      var cur = new Uint32Array(data.buffer.slice(0));

      var src = data;
      if (opts.dither) {
        // 순서 디더링: 그라데이션의 색 띠를 점 무늬로 흩어 준다
        src = new Uint8ClampedArray(data);
        for (var y = 0, p = 0; y < h; y++) {
          for (var x = 0; x < w; x++, p += 4) {
            var d = (BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 1.1;
            src[p] += d; src[p + 1] += d; src[p + 2] += d;
          }
        }
      }

      var palette = enc.quantize(data, 255, { format: 'rgb565' });
      var index = enc.applyPalette(src, palette, 'rgb565');
      var transparent = false;
      if (prev) {
        for (var j = 0; j < n; j++) if (cur[j] === prev[j]) { index[j] = 255; transparent = true; }
      }
      while (palette.length < 256) palette.push([0, 0, 0]);
      gif.writeFrame(index, w, h, {
        palette: palette, delay: fr.delay, repeat: 0,
        transparent: transparent, transparentIndex: 255, dispose: 1
      });
      prev = cur;
      if (onProgress) onProgress(i + 1, plan.frames.length);
      await tick();
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  };

  /* ───────── ZIP (무압축 묶음) ───────── */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  CS.zipStore = function (files) {
    var parts = [], central = [], offset = 0, te = new TextEncoder();
    files.forEach(function (f) {
      var name = te.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var csize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  };
})(window.CS);
