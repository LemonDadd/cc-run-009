/* views/trends.js — 趋势分析：日/周/月曲线、TIR、平均、eA1c、饮食关联 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc } = App;
  const U = Utils;

  let period = 'week';   // day | week | month
  let anchor = U.startOfDay(new Date()).getTime();

  async function mount(root) {
    const [glucose, meals, exercise] = await Promise.all([
      DB.Glucose.all(), DB.Meals.all(), DB.Exercise.all()
    ]);

    const periods = [
      { k: 'day', label: '日' }, { k: 'week', label: '周' }, { k: 'month', label: '月' }
    ];
    const head = el('section', { class: 'card' });
    head.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2 class="card-title" style="margin:0">📈 趋势分析</h2>
        <div class="period-tabs" id="periodTabs">
          ${periods.map(p => `<button data-p="${p.k}" class="${period === p.k ? 'active' : ''}">${p.label}</button>`).join('')}
        </div>
      </div>
      <div class="row" style="margin-top:12px;justify-content:center">
        <button class="icon-btn" id="prevP" aria-label="上一周期"><svg class="icon"><use href="#i-back"/></svg></button>
        <strong id="rangeLabel" style="min-width:200px;text-align:center;font-size:16px"></strong>
        <button class="icon-btn" id="nextP" aria-label="下一周期" style="transform:rotate(180deg)"><svg class="icon"><use href="#i-back"/></svg></button>
      </div>`;
    root.appendChild(head);
    head.querySelectorAll('#periodTabs button').forEach(b => {
      b.onclick = () => { period = b.dataset.p; anchor = U.startOfDay(new Date()).getTime(); render(); };
    });
    head.querySelector('#prevP').onclick = shiftPrev;
    head.querySelector('#nextP').onclick = shiftNext;

    const chartCard = el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: '血糖曲线' }),
      el('div', { id: 'chartBox' }),
      el('div', { class: 'chart-legend' }, [
        el('span', {}, [el('span', { class: 'legend-dot', style: 'background:#dcfce7' }),
          document.createTextNode('目标范围')]),
        el('span', {}, [el('span', { class: 'legend-dot', style: 'background:#1d4ed8' }),
          document.createTextNode('低血糖警戒线 3.9')]),
        el('span', {}, [el('span', { class: 'legend-dot', style: 'background:#0d9488' }),
          document.createTextNode('血糖记录点（颜色=达标状态）')])
      ])
    ]);
    root.appendChild(chartCard);

    root.appendChild(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: '关键指标' }),
      el('div', { id: 'statsBox', class: 'grid grid-3' })
    ]));

    root.appendChild(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: '达标时间（TIR）分布' }),
      el('div', { id: 'tirBox' })
    ]));

    root.appendChild(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title' }, [
        document.createTextNode('🍽️ 饮食与餐后血糖关联'),
        el('span', { class: 'spacer' })
      ]),
      el('div', { id: 'linkBox' })
    ]));

    function shiftPrev() {
      if (period === 'day') anchor -= U.DAY_MS;
      else if (period === 'week') anchor -= 7 * U.DAY_MS;
      else anchor = U.startOfDay(U.addMonths(new Date(anchor), -1)).getTime();
      render();
    }
    function shiftNext() {
      if (period === 'day') anchor += U.DAY_MS;
      else if (period === 'week') anchor += 7 * U.DAY_MS;
      else anchor = U.startOfDay(U.addMonths(new Date(anchor), 1)).getTime();
      render();
    }

    function render() {
      head.querySelectorAll('#periodTabs button').forEach(b =>
        b.classList.toggle('active', b.dataset.p === period));
      renderData(glucose, meals, exercise);
    }

    renderData(glucose, meals, exercise);

    function getRange() {      const start = new Date(anchor);
      if (period === 'day') return { from: anchor, to: anchor + U.DAY_MS, label: U.friendlyDate(U.ymd(start)) + ' ' + U.ymd(start).slice(5) };
      if (period === 'week') {
        const day = start.getDay() === 0 ? 7 : start.getDay(); // 周一为一周开始
        const monday = U.addDays(start, 1 - day).getTime();
        return { from: monday, to: monday + 7 * U.DAY_MS,
          label: `${U.ymd(new Date(monday)).slice(5)} ~ ${U.ymd(new Date(monday + 6 * U.DAY_MS)).slice(5)}` };
      }
      const mStart = U.startOfDay(new Date(start.getFullYear(), start.getMonth(), 1)).getTime();
      const mEnd = U.startOfDay(U.addMonths(new Date(mStart), 1)).getTime();
      return { from: mStart, to: mEnd, label: `${new Date(mStart).getFullYear()}年${new Date(mStart).getMonth() + 1}月` };
    }

    function renderData(glucose, meals, exercise) {
      const range = getRange();
      head.querySelector('#rangeLabel').textContent = range.label;
      const unit = App.State.settings.unit;
      const targets = App.currentTargets();

      const gRecs = glucose.filter(r => r.at >= range.from && r.at < range.to)
        .sort((a, b) => a.at - b.at);
      const mRecs = meals.filter(r => r.at >= range.from && r.at < range.to);
      const eRecs = exercise.filter(r => r.at >= range.from && r.at < range.to);

      // ---- 曲线 ----
      const chartBox = $('#chartBox');
      chartBox.innerHTML = '';
      if (!gRecs.length) {
        chartBox.appendChild(el('div', { class: 'empty' }, [
          el('p', { html: '<strong>该时间段没有血糖记录</strong>' }),
          el('a', { class: 'btn btn-sm', href: '#/glucose', text: '去记录血糖' })
        ]));
      } else if (period === 'day') {
        const points = gRecs.map(r => {
          const res = App.evalG(r.value, r.context);
          return {
            y: r.value, status: res.status,
            label: U.hm(new Date(r.at)),
            title: `${U.hm(new Date(r.at))} ${U.CONTEXT_LABELS[r.context]} ${U.displayValue(r.value, unit)} ${U.unitLabel(unit)} ${res.label}`
          };
        });
        Charts.lineChart(chartBox, {
          points, unit, range: { low: targets.fasting.low, high: targets.after_meal.high }
        });
      } else {
        // 周/月：按日聚合均值
        const dayMap = new Map();
        gRecs.forEach(r => {
          const k = U.ymd(new Date(r.at));
          if (!dayMap.has(k)) dayMap.set(k, []);
          dayMap.get(k).push(r.value);
        });
        const days = [];
        for (let t = range.from; t < range.to; t += U.DAY_MS) days.push(U.ymd(new Date(t)));
        const items = days.map(k => {
          const vals = dayMap.get(k);
          const v = vals ? U.avg(vals) : null;
          const d = new Date(k + 'T00:00:00');
          return {
            label: period === 'week'
              ? ['一','二','三','四','五','六','日'][((d.getDay() + 6) % 7)]
              : String(d.getDate()),
            value: v || 0,
            valueText: v != null ? U.displayValue(U.round1(v), unit) : '',
            color: v == null ? '#e2e8f0'
              : (App.evalG(v, 'random').status === 'ok' ? '#15803d'
                : App.evalG(v, 'random').status === 'high' ? '#ca8a04'
                : App.evalG(v, 'random').status === 'low' ? '#1d4ed8' : '#dc2626'),
            title: v != null ? `${k} 日均 ${U.displayValue(U.round1(v), unit)} ${U.unitLabel(unit)}（${vals.length}次）` : `${k} 无记录`
          };
        });
        Charts.barChart(chartBox, {
          items,
          format: (v) => U.displayValue(v, unit)
        });
      }

      // ---- 关键指标 ----
      const statsBox = $('#statsBox');
      statsBox.innerHTML = '';
      const vals = gRecs.map(r => r.value);
      const avg = U.round1(U.avg(vals));
      const st = U.tirStats(gRecs, targets);
      const a1c = U.estimateHbA1c(avg);
      const mMax = vals.length ? Math.max(...vals) : null;
      const mMin = vals.length ? Math.min(...vals) : null;
      const carbsAvg = mRecs.length ? U.round1(mRecs.reduce((s, m) => s + (m.carbs || 0), 0) / mRecs.length) : null;
      const glAvg = mRecs.length ? U.round1(mRecs.reduce((s, m) => s + (m.totalGL || 0), 0) / mRecs.length) : null;
      const exMin = eRecs.reduce((s, e) => s + e.minutes, 0);

      const stat = (label, value, sub, cls) => el('div', { class: 'kv' }, [
        el('div', { class: 'k', text: label }),
        el('div', { class: 'v ' + (cls || ''), text: value }),
        sub ? el('div', { class: 'small muted', text: sub }) : null
      ]);
      statsBox.appendChild(stat('记录次数', `${gRecs.length} 次`, ''));
      statsBox.appendChild(stat('平均血糖',
        avg != null ? `${U.displayValue(avg, unit)} ${U.unitLabel(unit)}` : '—', ''));
      statsBox.appendChild(stat('糖化血红蛋白估算',
        a1c != null ? `${a1c.toFixed(1)}%` : '—',
        a1c != null ? (a1c < 7 ? '多数成人目标 <7.0% ✓' + '' : '高于常用目标 7.0%，建议复诊') : '',
        a1c != null && a1c >= 7 ? 'g-high' : 'g-ok'));
      statsBox.appendChild(stat('达标率', st.okRate != null ? `${Math.round(st.okRate * 100)}%` : '—',
        `${st.ok}/${st.total} 次达标`));
      statsBox.appendChild(stat('最高 / 最低',
        mMax != null ? `${U.displayValue(U.round1(mMax), unit)} / ${U.displayValue(U.round1(mMin), unit)}` : '—',
        U.unitLabel(unit)));
      statsBox.appendChild(stat('低血糖次数',
        String(gRecs.filter(r => r.value < U.HYPO_THRESHOLD).length),
        '血糖 < 3.9 mmol/L',
        gRecs.some(r => r.value < U.HYPO_THRESHOLD) ? 'g-low' : ''));
      statsBox.appendChild(stat('平均每餐 GL', glAvg != null ? glAvg.toFixed(1) : '—',
        `平均碳水 ${carbsAvg != null ? carbsAvg + 'g' : '—'}`));
      statsBox.appendChild(stat('运动时长', `${exMin} 分钟`, `${eRecs.length} 次`));

      // ---- TIR ----
      const tirBox = $('#tirBox');
      tirBox.innerHTML = '';
      if (!gRecs.length) {
        tirBox.appendChild(el('p', { class: 'muted', text: '暂无数据' }));
      } else {
        const seg = (n, color, title) => el('div', {
          class: 'tir-seg', style: `width:${n / st.total * 100}%;background:${color}`,
          title
        });
        tirBox.appendChild(el('div', { class: 'tir-bar' }, [
          seg(st.low, '#1d4ed8', `偏低/低血糖 ${st.low}`),
          seg(st.ok, '#15803d', `达标 ${st.ok}`),
          seg(st.high, '#ca8a04', `偏高 ${st.high}`),
          seg(st.danger, '#dc2626', `危险 ${st.danger}`)
        ]));
        tirBox.appendChild(el('div', { class: 'chart-legend' }, [
          legend('#1d4ed8', `偏低/低血糖 ${Math.round(st.low / st.total * 100)}%`),
          legend('#15803d', `达标 ${Math.round(st.ok / st.total * 100)}%`),
          legend('#ca8a04', `偏高 ${Math.round(st.high / st.total * 100)}%`),
          legend('#dc2626', `危险 ${Math.round(st.danger / st.total * 100)}%`)
        ]));
        tirBox.appendChild(el('p', { class: 'muted small',
          text: '注：本应用 TIR 按自测记录条数统计（非动态血糖 CGM 的时间占比），建议固定时段规律监测。' }));
      }

      // ---- 饮食-餐后血糖关联 ----
      const linkBox = $('#linkBox');
      linkBox.innerHTML = '';
      const links = analyzeMealLinks(glucose, meals, range);
      if (!links.length) {
        linkBox.innerHTML = '<p class="muted">记录正餐和"餐后2小时"血糖后，这里会展示每餐 GL 与餐后血糖波动的关联。</p>';
      } else {
        links.slice(0, 12).reverse().forEach(l => {
          const deltaCls = l.delta > 2 ? 'g-danger' : l.delta > 0 ? 'g-high' : 'g-ok';
          linkBox.appendChild(el('div', { class: 'link-item' }, [
            el('div', { class: 'link-meal' }, [
              el('div', { class: 'record-title', text:
                `${U.friendlyDate(U.ymd(new Date(l.meal.at)))} ${U.MEAL_LABELS[l.meal.meal] || ''} · GL ${U.round1(l.meal.totalGL).toFixed(1)}（${U.round1(l.meal.carbs).toFixed(0)}g碳水）` }),
              el('div', { class: 'record-sub',
                text: (l.meal.items || []).slice(0, 4).map(i => i.name).join('、') })
            ]),
            el('div', { style: 'text-align:right' }, [
              el('div', { class: 'small muted',
                text: `餐前 ${l.before != null ? U.displayValue(l.before, unit) : '—'} → 餐后 ${U.displayValue(l.post.value, unit)}` }),
              el('div', { class: `link-delta ${deltaCls}`,
                text: (l.delta >= 0 ? '+' : '') + U.displayValue(U.round1(l.delta), unit) + ' mmol/L' })
            ])
          ]));
        });
        linkBox.appendChild(el('p', { class: 'muted small',
          text: '解读：餐后较餐前升高 1~2 mmol/L 属常见反应；常 >2.5~3 且这餐 GL 高，可优先调整主食量/种类、进餐顺序并在餐后散步。' }));
      }
    }
  }

  function legend(color, text) {
    return el('span', {}, [
      el('span', { class: 'legend-dot', style: `background:${color}` }),
      document.createTextNode(text)
    ]);
  }

  // 匹配：餐后2小时记录 ← 前 80~180 分钟内最近的正餐；餐前 = 该餐前 40 分钟内 before_meal/fasting
  function analyzeMealLinks(allGlucose, allMeals, range) {
    const postRecs = allGlucose
      .filter(r => r.context === 'after_meal' && r.at >= range.from && r.at < range.to)
      .sort((a, b) => a.at - b.at);

    return postRecs.map(post => {
      const candidates = allMeals
        .filter(m => m.meal !== 'snack' &&
          post.at - m.at >= 80 * 60000 && post.at - m.at <= 3 * 3600000)
        .sort((a, b) => b.at - a.at);
      const meal = candidates[0];
      if (!meal) return null;
      const before = allGlucose.find(g =>
        (g.context === 'before_meal' || g.context === 'fasting') &&
        g.at >= meal.at - 40 * 60000 && g.at <= meal.at + 15 * 60000);
      if (!before) return null;
      return { meal, post, before: before.value, delta: post.value - before.value };
    }).filter(Boolean);
  }

  Views.trends = { mount };
})();
