/* =========================================================
 * SugarLog · 纯 SVG 图表（无外部依赖）
 * lineChart  血糖曲线（可叠加目标范围带）
 * barChart   日均血糖柱
 * scatter    饮食 GL/碳水 - 餐后血糖散点
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var h = SL.UI.h;
  var NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, children) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { c && n.appendChild(c); });
    return n;
  }

  var PALETTE = {
    axis: '#9aa1ad',
    grid: '#e8ebf1',
    text: '#7b828f',
    line: '#c2185b',
    ok: '#1e8e3e',
    high: '#b26a00',
    low: '#1565c0',
    danger: '#c62828',
    bar: '#8e63c9'
  };

  /**
   * 折线图
   * points: [{ x, y, cls, title }]，x/y 为数值坐标
   * opts: { width:760, height:300, pad:{l,r,t,b}, xDomain:[min,max], yDomain:[min,max],
   *         zones:[{from,to,fill}], yTicks:[...], xTicks:[{v,label}],
   *         yRefs:[{v,color,dash,label}], connectNulls:false,
   *         pointRadius:5, lineColor, unit }
   */
  function lineChart(points, opts) {
    opts = opts || {};
    var W = opts.width || 760, H = opts.height || 300;
    var pad = Object.assign({ l: 48, r: 16, t: 18, b: 34 }, opts.pad || {});
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    (opts.yRefs || []).forEach(function (r) { ys.push(r.v); });
    (opts.zones || []).forEach(function (z) { ys.push(z.from, z.to); });

    var xd = opts.xDomain || [Math.min.apply(null, xs.concat([0])), Math.max.apply(null, xs.concat([1]))];
    var yd = opts.yDomain || [Math.min.apply(null, ys.concat([0])), Math.max.apply(null, ys.concat([1]))];
    if (xd[0] === xd[1]) xd[1] = xd[0] + 1;
    if (yd[0] === yd[1]) yd[1] = yd[0] + 1;

    function sx(x) { return pad.l + (x - xd[0]) / (xd[1] - xd[0]) * iw; }
    function sy(y) { return pad.t + ih - (y - yd[0]) / (yd[1] - yd[0]) * ih; }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img' });

    // 目标范围带
    (opts.zones || []).forEach(function (z) {
      var y1 = sy(Math.max(z.to, yd[0])), y2 = sy(Math.min(z.from, yd[1]));
      var top = Math.min(y1, y2), hgt = Math.abs(y2 - y1);
      if (hgt > 0) {
        svg.appendChild(svgEl('rect', {
          x: pad.l, y: top, width: iw, height: hgt, fill: z.fill || 'rgba(30,142,62,.10)'
        }));
      }
    });

    // 横向网格 + Y 轴刻度
    var yTicks = opts.yTicks || ticks(yd[0], yd[1], 5);
    yTicks.forEach(function (v) {
      if (v < yd[0] - 1e-6 || v > yd[1] + 1e-6) return;
      var y = sy(v);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: y, y2: y, stroke: PALETTE.grid, 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', {
        x: pad.l - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 12, fill: PALETTE.text
      }, [document.createTextNode(String(v))]));
    });

    // X 轴刻度
    (opts.xTicks || []).forEach(function (t) {
      if (t.v < xd[0] - 1e-6 || t.v > xd[1] + 1e-6) return;
      var x = sx(t.v);
      svg.appendChild(svgEl('line', { x1: x, x2: x, y1: pad.t + ih, y2: pad.t + ih + 5, stroke: PALETTE.axis }));
      svg.appendChild(svgEl('text', {
        x: x, y: pad.t + ih + 20, 'text-anchor': 'middle', 'font-size': 12, fill: PALETTE.text
      }, [document.createTextNode(t.label)]));
    });

    // 参考线
    (opts.yRefs || []).forEach(function (r) {
      if (r.v < yd[0] || r.v > yd[1]) return;
      var y = sy(r.v);
      svg.appendChild(svgEl('line', {
        x1: pad.l, x2: pad.l + iw, y1: y, y2: y,
        stroke: r.color || PALETTE.axis, 'stroke-width': 1.5,
        'stroke-dasharray': r.dash || '5 4'
      }));
      if (r.label) {
        svg.appendChild(svgEl('text', {
          x: pad.l + iw - 4, y: y - 5, 'text-anchor': 'end',
          'font-size': 11, fill: r.color || PALETTE.text
        }, [document.createTextNode(r.label)]));
      }
    });

    // 坐标轴线
    svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: pad.t + ih, y2: pad.t + ih, stroke: PALETTE.axis }));
    svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: pad.t + ih, stroke: PALETTE.axis }));

    // 折线（null 值断开）
    var segments = [];
    var cur = [];
    points.forEach(function (p) {
      if (p.y === null || p.y === undefined || isNaN(p.y)) {
        if (cur.length) segments.push(cur);
        cur = [];
      } else {
        cur.push(p);
      }
    });
    if (cur.length) segments.push(cur);

    segments.forEach(function (seg) {
      if (seg.length === 1 && opts.singlePoint === false) return;
      var d = seg.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1);
      }).join(' ');
      svg.appendChild(svgEl('path', {
        d: d, fill: 'none',
        stroke: opts.lineColor || PALETTE.line, 'stroke-width': 2.5,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    });

    // 数据点
    points.forEach(function (p) {
      if (p.y === null || p.y === undefined || isNaN(p.y)) return;
      var color = p.cls ? PALETTE[p.cls] : (opts.pointColor || PALETTE.line);
      var c = svgEl('circle', {
        cx: sx(p.x), cy: sy(p.y), r: p.r || opts.pointRadius || 5,
        fill: color || opts.pointColor || PALETTE.line,
        stroke: '#fff', 'stroke-width': 1.5
      });
      if (p.title) {
        var title = svgEl('title');
        title.textContent = p.title;
        c.appendChild(title);
      }
      svg.appendChild(c);
    });

    return h('.chart-wrap', {}, svg);
  }

  /**
   * 柱状图
   * bars: [{ label, value, cls, title }]
   */
  function barChart(bars, opts) {
    opts = opts || {};
    var W = opts.width || 760, H = opts.height || 260;
    var pad = { l: 44, r: 12, t: 16, b: 40 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var vals = bars.map(function (b) { return b.value; }).filter(function (v) { return v != null; });
    var max = opts.yMax || Math.max.apply(null, vals.concat([opts.yMin || 0, 1]));
    var min = opts.yMin || 0;
    var bw = iw / Math.max(bars.length, 1);

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg' });
    function sy(v) { return pad.t + ih - (v - min) / (max - min || 1) * ih; }

    // 网格
    var ticksArr = ticks(min, max, 4);
    ticksArr.forEach(function (v) {
      var y = sy(v);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: y, y2: y, stroke: PALETTE.grid }));
      svg.appendChild(svgEl('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 12, fill: PALETTE.text },
        [document.createTextNode(String(Math.round(v * 10) / 10))]));
    });

    // 目标范围带
    if (opts.zone) {
      svg.appendChild(svgEl('rect', {
        x: pad.l, y: sy(opts.zone.to), width: iw,
        height: sy(opts.zone.from) - sy(opts.zone.to),
        fill: 'rgba(30,142,62,.10)'
      }));
    }

    bars.forEach(function (b, i) {
      if (b.value === null || b.value === undefined || isNaN(b.value)) return;
      var x = pad.l + i * bw + bw * 0.18;
      var w = bw * 0.64;
      var y = sy(b.value);
      var color = b.cls ? PALETTE[b.cls] : (opts.color || PALETTE.bar);
      var rect = svgEl('rect', {
        x: x, y: y, width: w, height: pad.t + ih - y, rx: 4,
        fill: color || opts.color || PALETTE.bar
      });
      if (b.title) {
        var title = svgEl('title'); title.textContent = b.title; rect.appendChild(title);
      }
      svg.appendChild(rect);
      svg.appendChild(svgEl('text', {
        x: x + w / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 11,
        fill: PALETTE.text, 'font-weight': 'bold'
      }, [document.createTextNode(opts.valueFmt ? opts.valueFmt(b.value) : String(Math.round(b.value * 10) / 10))]));
      // x 标签（自动间隔）
      var every = Math.ceil(bars.length / opts.maxLabels || 1);
      if (i % Math.max(1, Math.ceil(bars.length / (opts.maxLabels || 10))) === 0) {
        svg.appendChild(svgEl('text', {
          x: x + w / 2, y: pad.t + ih + 18, 'text-anchor': 'middle',
          'font-size': 11, fill: PALETTE.text
        }, [document.createTextNode(b.label)]));
      }
    });

    svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: pad.t + ih, y2: pad.t + ih, stroke: PALETTE.axis }));
    return h('.chart-wrap', {}, svg);
  }

  /**
   * 散点图（+ 趋势线）
   * pts: [{x, y, title}]
   */
  function scatter(pts, opts) {
    opts = opts || {};
    var W = opts.width || 520, H = opts.height || 320;
    var pad = { l: 52, r: 18, t: 18, b: 44 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    if (!pts.length) return h('.empty', {}, '数据不足，无法绘制');

    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xd = [Math.min.apply(null, xs), Math.max.apply(null, xs)];
    var yd = [Math.min.apply(null, ys), Math.max.apply(null, ys)];
    pad_axes(xd, 1); pad_axes(yd, 1);
    if (xd[0] === xd[1]) xd[1] += 1;
    if (yd[0] === yd[1]) yd[1] += 1;

    function sx(x) { return pad.l + (x - xd[0]) / (xd[1] - xd[0]) * iw; }
    function sy(y) { return pad.t + ih - (y - yd[0]) / (yd[1] - yd[0]) * ih; }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg' });

    ticks(xd[0], xd[1], 5).forEach(function (v) {
      var x = sx(v);
      svg.appendChild(svgEl('line', { x1: x, x2: x, y1: pad.t, y2: pad.t + ih, stroke: PALETTE.grid }));
      svg.appendChild(svgEl('text', { x: x, y: pad.t + ih + 18, 'text-anchor': 'middle', 'font-size': 11, fill: PALETTE.text },
        [document.createTextNode(String(Math.round(v * 10) / 10))]));
    });
    ticks(yd[0], yd[1], 5).forEach(function (v) {
      var y = sy(v);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: y, y2: y, stroke: PALETTE.grid }));
      svg.appendChild(svgEl('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: PALETTE.text },
        [document.createTextNode(String(Math.round(v * 10) / 10))]));
    });

    if (opts.targetMax !== undefined) {
      svg.appendChild(svgEl('line', {
        x1: pad.l, x2: pad.l + iw, y1: sy(opts.targetMax), y2: sy(opts.targetMax),
        stroke: PALETTE.high, 'stroke-width': 1.5, 'stroke-dasharray': '5 4'
      }));
    }

    // 趋势线（最小二乘）
    var slope = SL.U.linearSlope(xs, ys);
    if (slope !== null) {
      var meanX = SL.U.mean(xs), meanY = SL.U.mean(ys);
      var y0 = meanY - slope * meanX;
      svg.appendChild(svgEl('line', {
        x1: sx(xd[0]), y1: sy(y0 + slope * xd[0]),
        x2: sx(xd[1]), y2: sy(y0 + slope * xd[1]),
        stroke: PALETTE.line, 'stroke-width': 2, 'stroke-dasharray': '7 4'
      }));
    }

    pts.forEach(function (p) {
      var c = svgEl('circle', {
        cx: sx(p.x), cy: sy(p.y), r: 6,
        fill: p.cls ? PALETTE[p.cls] : PALETTE.bar,
        'fill-opacity': .8, stroke: '#fff', 'stroke-width': 1.5
      });
      if (p.title) { var t = svgEl('title'); t.textContent = p.title; c.appendChild(t); }
      svg.appendChild(c);
    });

    if (opts.xLabel) svg.appendChild(svgEl('text', {
      x: pad.l + iw / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 13, fill: PALETTE.text
    }, [document.createTextNode(opts.xLabel)]));
    if (opts.yLabel) svg.appendChild(svgEl('text', {
      x: 14, y: pad.t + ih / 2, 'text-anchor': 'middle', 'font-size': 13, fill: PALETTE.text,
      transform: 'rotate(-90 14 ' + (pad.t + ih / 2) + ')'
    }, [document.createTextNode(opts.yLabel)]));

    return h('.chart-wrap', {}, svg);
  }

  function pad_axes(d, amt) {
    d[0] -= amt;
    d[1] += amt;
  }

  function ticks(min, max, count) {
    var span = max - min;
    if (span <= 0) return [min];
    var step0 = span / count;
    var mag = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10));
    var norm = step0 / mag;
    var step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3.5) step = 2 * mag;
    else if (norm < 7.5) step = 5 * mag;
    else step = 10 * mag;
    var start = Math.ceil(min / step) * step;
    var out = [];
    for (var v = start; v <= max + step * 0.001; v += step) {
      out.push(Math.round(v / step) * step);
    }
    if (!out.length) out = [min, max];
    return out.map(function (v) { return Math.round(v * 100) / 100; });
  }

  function legend(items) {
    return h('.legend', {}, items.map(function (it) {
      return h('span.lg', {},
        h('span.swatch', { style: { background: it.color, height: it.dashed ? '0' : '4px', borderTop: it.dashed ? ('2px dashed ' + it.color) : 'none' } }),
        it.label
      );
    }));
  }

  SL.Charts = { line: lineChart, bar: barChart, scatter: scatter, legend: legend, PALETTE: PALETTE };
})(window);
