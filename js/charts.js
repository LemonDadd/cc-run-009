/* ============================================================
   charts.js — 纯 SVG 图表（血糖曲线 / 柱状图）
   ============================================================ */
(function (root) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, children) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    });
    (children || []).forEach(c => el.appendChild(c));
    return el;
  }

  const STATUS_COLOR = {
    ok: '#15803d', high: '#ca8a04', low: '#1d4ed8', danger: '#dc2626'
  };

  /**
   * 血糖折线图
   * points: [{ y: mmol, status, title, label }]
   */
  function lineChart(container, opts) {
    const points = opts.points || [];
    const unit = opts.unit || 'mmol/L';
    const range = opts.range || { low: 4.4, high: 10 };
    container.innerHTML = '';
    if (!points.length) return;

    const perPoint = points.length > 16 ? 56 : 76;
    const W = Math.max(container.clientWidth || 640, 40 + perPoint * points.length);
    const H = 300;
    const pad = { l: 48, r: 16, t: 18, b: 34 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const vals = points.map(p => p.y);
    let yMin = Math.min(...vals, range.low) - 1;
    let yMax = Math.max(...vals, range.high) + 1.5;
    yMin = Math.max(0, Math.floor(yMin));
    yMax = Math.ceil(yMax);

    const X = i => pad.l + (points.length === 1 ? iw / 2 : i * iw / (points.length - 1));
    const Y = v => pad.t + ih - (v - yMin) / (yMax - yMin) * ih;

    const svg = svgEl('svg', {
      class: 'chart', width: W, height: H,
      viewBox: `0 0 ${W} ${H}`, role: 'img'
    });

    // 横向网格与刻度（按 mmol 整数取，再换算显示单位）
    const ticks = [];
    for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v++) ticks.push(v);
    ticks.forEach(v => {
      const shown = unit === 'mg/dL' ? String(Math.round(Utils.mmolToMgdl(v))) : v.toFixed(0);
      svg.appendChild(svgEl('line', {
        x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v),
        stroke: '#e2e8f0', 'stroke-width': 1
      }));
      svg.appendChild(svgEl('text', {
        x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end',
        'font-size': 11, fill: '#94a3b8', text: shown
      }));
    });

    // 目标范围色带
    svg.appendChild(svgEl('rect', {
      x: pad.l, y: Y(range.high), width: iw,
      height: Math.max(0, Y(range.low) - Y(range.high)),
      fill: '#dcfce7', opacity: 0.7
    }));
    // 低血糖警戒线
    if (Utils.HYPO_THRESHOLD >= yMin) {
      svg.appendChild(svgEl('line', {
        x1: pad.l, x2: W - pad.r,
        y1: Y(Utils.HYPO_THRESHOLD), y2: Y(Utils.HYPO_THRESHOLD),
        stroke: '#1d4ed8', 'stroke-width': 1, 'stroke-dasharray': '5 4'
      }));
    }

    // 折线
    if (points.length > 1) {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      svg.appendChild(svgEl('path', {
        d, fill: 'none', stroke: '#0d9488', 'stroke-width': 2.5,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }

    // 数据点（按状态着色）
    points.forEach((p, i) => {
      const c = STATUS_COLOR[p.status] || STATUS_COLOR.ok;
      const dot = svgEl('circle', {
        cx: X(i), cy: Y(p.y), r: 5.5,
        fill: c, stroke: '#fff', 'stroke-width': 2
      });
      const t = document.createElementNS(SVGNS, 'title');
      t.textContent = p.title || '';
      dot.appendChild(t);
      svg.appendChild(dot);
    });

    // X 轴标签（最多 8 个，等距抽样）
    const maxLabels = Math.min(8, points.length);
    points.forEach((p, i) => {
      if (points.length > maxLabels && i % Math.ceil(points.length / maxLabels) !== 0 && i !== points.length - 1) return;
      svg.appendChild(svgEl('text', {
        x: X(i), y: H - 10, 'text-anchor': 'middle',
        'font-size': 11.5, fill: '#64748b', text: p.label || ''
      }));
    });

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.appendChild(svg);
    container.appendChild(wrap);
  }

  /**
   * 柱状图
   * items: [{ label, value, color, title, valueText }]
   */
  function barChart(container, opts) {
    const items = opts.items || [];
    container.innerHTML = '';
    if (!items.length) return;

    const perBar = items.length > 14 ? 42 : 58;
    const W = Math.max(container.clientWidth || 640, 40 + perBar * items.length);
    const H = 240;
    const pad = { l: 48, r: 12, t: 20, b: 34 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const max = Math.max(...items.map(i => i.value), 1);
    const Y = v => pad.t + ih - (v / max) * ih;
    const slot = iw / items.length;
    const bw = Math.min(30, slot * 0.6);

    const svg = svgEl('svg', {
      class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img'
    });

    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const v = max * f;
      svg.appendChild(svgEl('line', {
        x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v),
        stroke: '#e2e8f0'
      }));
      svg.appendChild(svgEl('text', {
        x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end',
        'font-size': 11, fill: '#94a3b8',
        text: opts.format ? opts.format(v) : String(Math.round(v))
      }));
    });

    items.forEach((it, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const y = Y(it.value);
      const bar = svgEl('rect', {
        x, y, width: bw, height: Math.max(0, pad.t + ih - y),
        rx: 5, fill: it.color || '#0d9488'
      });
      const t = document.createElementNS(SVGNS, 'title');
      t.textContent = it.title || '';
      bar.appendChild(t);
      svg.appendChild(bar);

      if (it.valueText) {
        svg.appendChild(svgEl('text', {
          x: x + bw / 2, y: y - 5, 'text-anchor': 'middle',
          'font-size': 11, 'font-weight': '700', fill: '#334155', text: it.valueText
        }));
      }
      if (it.label) {
        svg.appendChild(svgEl('text', {
          x: x + bw / 2, y: H - 10, 'text-anchor': 'middle',
          'font-size': 11, fill: '#64748b', text: it.label
        }));
      }
    });

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.appendChild(svg);
    container.appendChild(wrap);
  }

  root.Charts = { lineChart, barChart, STATUS_COLOR };
})(window);
