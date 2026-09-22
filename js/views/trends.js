/* =========================================================
 * SugarLog · 趋势分析
 * 日/周/月：血糖曲线 · 达标率 · 平均 · 糖化估算 · 饮食关联
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  var state = { range: '7d' };

  Views.trends = function (root) {
    Promise.all([
      DB.all('glucoseRecords'),
      DB.all('mealRecords'),
      DB.all('exerciseRecords')
    ]).then(function (res) {
      render(root, res[0], res[1], res[2]);
    });
    mount(root, h('.empty', {}, '加载中…'));
  };

  function rangeBounds(range) {
    var end = U.endOfDay(Date.now());
    var start;
    if (range === 'day') start = U.startOfDay(Date.now());
    else if (range === '7d') start = U.startOfDay(U.addDays(Date.now(), -6));
    else start = U.startOfDay(U.addDays(Date.now(), -29));
    return { start: start, end: end };
  }

  function render(root, glucose, meals, exercises) {
    var s = SL.App.settings;
    var b = rangeBounds(state.range);
    var gRecs = glucose.filter(function (r) { return r.at >= b.start && r.at <= b.end; })
      .sort(function (a, c) { return a.at - c.at; });
    var mRecs = meals.filter(function (r) { return r.at >= b.start && r.at <= b.end; });
    var eRecs = exercises.filter(function (r) { return r.at >= b.start && r.at <= b.end; });

    var rangeSeg = h('.seg', {},
      segBtn('今天', 'day'), segBtn('近7天', '7d'), segBtn('近30天', '30d'));
    function segBtn(label, key) {
      return h('button', { class: state.range === key ? 'on' : '',
        onClick: function () { state.range = key; SL.App.refresh(); } }, label);
    }

    // ---------- 统计 ----------
    var vals = gRecs.map(function (r) { return r.value; });
    var avg = U.mean(vals);
    var std = vals.length > 1 ? stdev(vals) : null;
    var hba1c = U.estimateHbA1c(avg);

    var classified = gRecs.map(function (r) { return U.classify(r.value, r.meal, s); });
    var nOk = classified.filter(function (c) { return c === 'ok'; }).length;
    var nLow = classified.filter(function (c) { return c === 'low'; }).length;
    var nDangerLow = gRecs.filter(function (r) {
      return r.value <= (s.severeLowThreshold || 3.0);
    }).length;
    var nHigh = classified.filter(function (c) { return c === 'high'; }).length;
    var nDangerHigh = gRecs.filter(function (r) { return r.value >= (s.highCritical || 16.7); }).length;
    var maxR = gRecs.reduce(function (a, r) { return (!a || r.value > a.value) ? r : a; }, null);
    var minR = gRecs.reduce(function (a, r) { return (!a || r.value < a.value) ? r : a; }, null);

    var statsCard = h('.card', {},
      h('h2.mt0', { style: 'display:flex;align-items:center;gap:10px' },
        '血糖概览', h('span.muted.small', { style: 'font-weight:400' },
          U.fmtDate(b.start) + ' ~ ' + U.fmtDate(b.end))),
      rangeSeg,
      gRecs.length === 0
        ? h('div.mt12', {}, SL.UI.emptyBox('📈', '该时间段内没有血糖记录',
            h('a.btn', { href: '#/glucose' }, '去记录血糖')))
        : h('div', {},
            h('.stat-grid.mt12', {},
              stat('测量次数', gRecs.length + ' 次'),
              stat('平均血糖', avg !== null ? U.fmtGlucose(avg, s) + ' ' + U.unitLabel(s) : '—',
                std !== null ? '标准差 ±' + U.fmtGlucose(std, s) : undefined),
              stat('达标率', vals.length ? U.fmtPct(nOk / vals.length) : '—',
                nOk + ' 次达标', nOk / Math.max(vals.length, 1) >= 0.7 ? 'ok' : undefined),
              stat('糖化估算', hba1c !== null ? hba1c.toFixed(1) + '%' : '—',
                vals.length >= 7 ? '反映近期平均血糖' : '数据偏少，仅供参考',
                hba1c !== null && hba1c < 7 ? 'ok' : undefined)
            ),
            h('.grid4.mt12', {},
              miniStat('偏低', nLow + nDangerLow, 'low', '次'),
              miniStat('偏高', nHigh + nDangerHigh, 'high', '次'),
              miniStat('最高', maxR ? U.fmtGlucose(maxR.value, s) : '—',
                maxR ? U.classify(maxR.value, maxR.meal, s) : 'mut',
                maxR ? U.mealLabel(maxR.meal) + ' ' + U.fmtRelative(maxR.at) : ''),
              miniStat('最低', minR ? U.fmtGlucose(minR.value, s) : '—',
                minR ? U.classify(minR.value, minR.meal, s) : 'mut',
                minR ? U.mealLabel(minR.meal) + ' ' + U.fmtRelative(minR.at) : '')
            )
          )
    );

    // ---------- 图表 ----------
    var chartCard = h('.card', {},
      h('h2.mt0', {}, '血糖曲线'),
      gRecs.length === 0 ? h('.muted', {}, '记录血糖后这里会画出曲线。') :
      state.range === 'day' ? buildDayChart(gRecs, s) : buildRangeChart(gRecs, s, state.range)
    );

    // 周/月额外：每日均值柱
    var dailyCard = null;
    if (state.range !== 'day' && gRecs.length) {
      dailyCard = h('.card', {},
        h('h2.mt0', {}, '每日平均血糖'),
        buildDailyBars(gRecs, s, b.start)
      );
    }

    // ---------- 饮食与血糖关联 ----------
    var dietCard = buildDietCorrelation(gRecs, mRecs, s);

    // ---------- 运动与血糖 ----------
    var exCard = buildExerciseSection(gRecs, eRecs, s);

    // ---------- 达标提示 ----------
    var insightCard = buildInsights({
      vals: vals, nOk: nOk, nLow: nLow + nDangerLow, nHigh: nHigh + nDangerHigh,
      hba1c: hba1c, avg: avg, range: state.range
    }, s);

    mount(root, [statsCard, chartCard, dailyCard, dietCard, exCard, insightCard]);
  }

  function stat(label, value, sub, cls) {
    return h('.stat', {},
      h('.s-label', {}, label),
      h('.s-value' + (cls ? '.bg-' + cls : ''), {}, value),
      sub ? h('.s-sub', {}, sub) : null
    );
  }
  function miniStat(label, value, cls, sub) {
    return h('.stat', {},
      h('.s-label', {}, label),
      h('.s-value', { class: 'bg-' + cls, style: 'font-size:1.35rem' }, value),
      sub ? h('.s-sub', {}, sub) : null
    );
  }

  /* ---------------- 当天曲线：按钟点分布 ---------------- */
  function buildDayChart(gRecs, s) {
    var points = gRecs.map(function (r) {
      var d = new Date(r.at);
      var x = d.getHours() + d.getMinutes() / 60;
      var cls = U.classify(r.value, r.meal, s);
      return {
        x: x, y: r.value, cls: cls,
        title: U.mealLabel(r.meal) + ' ' + U.fmtTime(r.at) + '\n' +
          U.fmtGlucose(r.value, s) + ' ' + U.unitLabel(s) + '（' + U.CLASS_LABEL[cls] + '）' +
          (r.note ? '\n' + r.note : '')
      };
    });

    var yd = yDomain(gRecs, s);
    var chart = SL.Charts.line(points, {
      width: 760, height: 320,
      xDomain: [0, 24],
      yDomain: yd,
      yTicks: buildYTicks(yd),
      xTicks: [0, 3, 6, 9, 12, 15, 18, 21, 24].map(function (hh) {
        return { v: hh, label: U.pad(hh) + ':00' };
      }),
      zones: [{ from: 4.4, to: 10.0, fill: 'rgba(30,142,62,.08)' }],
      yRefs: [
        { v: s.lowThreshold || 3.9, color: SL.Charts.PALETTE.low, label: '低血糖线 ' + U.fmtGlucose(s.lowThreshold, s) },
        { v: s.highCritical || 16.7, color: SL.Charts.PALETTE.danger, dash: '4 3', label: '危险高血糖' }
      ]
    });
    return h('div', {}, chart,
      SL.Charts.legend([
        { color: SL.Charts.PALETTE.line, label: '血糖值' },
        { color: SL.Charts.PALETTE.ok, label: '绿色区域：4.4~10.0 参考带' },
        { color: SL.Charts.PALETTE.low, label: '低血糖阈值', dashed: true }
      ]));
  }

  /* ---------------- 周/月曲线 ---------------- */
  function buildRangeChart(gRecs, s, range) {
    var points = gRecs.map(function (r) {
      var cls = U.classify(r.value, r.meal, s);
      return {
        x: r.at, y: r.value, cls: cls,
        title: U.fmtDateTime(r.at) + ' ' + U.mealLabel(r.meal) + '\n' +
          U.fmtGlucose(r.value, s) + ' ' + U.unitLabel(s) + '（' + U.CLASS_LABEL[cls] + '）'
      };
    });
    var b = rangeBounds(range);
    var yd = yDomain(gRecs, s);
    var xTicks = [];
    var days = range === '7d' ? 7 : 30;
    for (var i = 0; i < days; i++) {
      var ts = b.start + i * 864e5;
      if (range === '7d' || i % 5 === 0 || i === days - 1) {
        xTicks.push({ v: ts, label: (new Date(ts).getMonth() + 1) + '/' + new Date(ts).getDate() });
      }
    }
    var chart = SL.Charts.line(points, {
      width: 760, height: 320,
      xDomain: [b.start, b.end],
      yDomain: yd,
      yTicks: buildYTicks(yd),
      xTicks: xTicks,
      zones: [{ from: 4.4, to: 10.0, fill: 'rgba(30,142,62,.08)' }],
      yRefs: [
        { v: s.lowThreshold || 3.9, color: SL.Charts.PALETTE.low, label: '低血糖线' },
        { v: s.highCritical || 16.7, color: SL.Charts.PALETTE.danger, dash: '4 3', label: '危险高血糖' }
      ],
      pointRadius: range === '30d' ? 3.5 : 5
    });
    return h('div', {}, chart,
      SL.Charts.legend([
        { color: SL.Charts.PALETTE.line, label: '血糖值（颜色代表达标状态）' },
        { color: SL.Charts.PALETTE.ok, label: '绿色区域：4.4~10.0 参考带' }
      ]));
  }

  /* ---------------- 每日均值柱 ---------------- */
  function buildDailyBars(gRecs, s, start) {
    var days = state.range === '7d' ? 7 : 30;
    var buckets = {};
    gRecs.forEach(function (r) {
      var key = U.fmtDate(r.at);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(r.value);
    });
    var bars = [];
    for (var i = 0; i < days; i++) {
      var ts = start + i * 864e5;
      var key = U.fmtDate(ts);
      var arr = buckets[key];
      var mean = arr ? U.mean(arr) : null;
      var cls = mean === null ? null : U.classify(mean, 'random', s);
      bars.push({
        label: (new Date(ts).getMonth() + 1) + '/' + new Date(ts).getDate(),
        value: mean, cls: cls,
        title: U.fmtDate(ts) + (mean !== null ?
          '\n平均 ' + U.fmtGlucose(mean, s) + ' ' + U.unitLabel(s) + '，' + arr.length + ' 次测量' :
          '\n无测量')
      });
    }
    return SL.Charts.bar(bars, {
      zone: { from: 4.4, to: 10.0 },
      valueFmt: function (v) { return U.fmtGlucose(v, s); },
      maxLabels: 10
    });
  }

  /* ---------------- 饮食 - 餐后血糖关联 ---------------- */
  function buildDietCorrelation(gRecs, mRecs, s) {
    // 配对：餐后2h 记录向前回溯 3 小时内的同一餐
    var pairsGL = [], pairsCarb = [];
    var details = [];
    gRecs.forEach(function (r) {
      var phase = (U.MEAL_MAP[r.meal] || {}).phase;
      var periodMatch = null;
      if (r.meal === 'afterBF') periodMatch = 'breakfast';
      else if (r.meal === 'afterLunch') periodMatch = 'lunch';
      else if (r.meal === 'afterDinner') periodMatch = 'dinner';
      if (!periodMatch) return;

      var candidates = mRecs.filter(function (m) {
        return m.period === periodMatch && r.at - m.at >= 30 * 60 * 1000 && r.at - m.at <= 3 * 3600 * 1000;
      }).sort(function (a, b) {
        return Math.abs(a.at - (r.at - 2 * 3600 * 1000)) - Math.abs(b.at - (r.at - 2 * 3600 * 1000));
      });
      var meal = candidates[0];
      if (!meal) return;
      pairsGL.push({ x: meal.totalGL || 0, y: r.value });
      pairsCarb.push({ x: meal.totalCarbs || 0, y: r.value });
      if (details.length < 12) {
        details.push({
          date: U.fmtDate(r.at),
          period: (U.MEAL_PERIOD_MAP[meal.period] || { label: '餐' }).label,
          gl: meal.totalGL || 0, carbs: meal.totalCarbs || 0,
          value: r.value, cls: U.classify(r.value, r.meal, s)
        });
      }
    });

    var body;
    if (pairsGL.length < 3) {
      body = h('div', {},
        SL.UI.emptyBox('🍚',
          '配对数据不足（需要至少 3 组“正餐 + 餐后2小时血糖”记录）。',
          h('span.small', {}, '提示：记录饮食后，在餐后满 2 小时（从第一口饭计时）再记一条血糖，时间点选择「早餐后2h / 午餐后2h / 晚餐后2h」。'))
      );
    } else {
      var rGL = U.pearson(pairsGL.map(function (p) { return p.x; }), pairsGL.map(function (p) { return p.y; }));
      var rCarb = U.pearson(pairsCarb.map(function (p) { return p.x; }), pairsCarb.map(function (p) { return p.y; }));

      var afterVals = pairsGL.map(function (p) { return p.y; });
      var afterOk = afterVals.filter(function (v, i) {
        return v <= (s.targetAfterMax || 10.0) && v >= (s.lowThreshold || 3.9);
      }).length;

      var verdict;
      if (rGL === null) verdict = '数据无法计算相关性';
      else if (rGL >= 0.5) verdict = '正相关较明显：这餐 GL 越高，餐后血糖往往越高，可尝试减少主食量、粗细搭配、先吃蔬菜。';
      else if (rGL >= 0.3) verdict = '存在弱正相关趋势：GL 对餐后血糖有一定影响，继续积累数据观察。';
      else if (rGL <= -0.3) verdict = '未观察到正相关（甚至相反），可能与用药、运动、进餐顺序等其他因素关系更大。';
      else verdict = '本时间段内 GL 与餐后血糖关系不明显，影响血糖的因素较多，属正常现象。';

      body = h('div', {},
        h('.stat-grid', {},
          stat('配对餐次', pairsGL.length + ' 次'),
          stat('餐后达标率', U.fmtPct(afterOk / afterVals.length),
            afterOk + '/' + afterVals.length + ' ≤ ' + U.fmtGlucose(s.targetAfterMax || 10.0, s)),
          stat('GL 相关系数', rGL !== null ? rGL.toFixed(2) : '—', corrHint(rGL)),
          stat('碳水相关系数', rCarb !== null ? rCarb.toFixed(2) : '—', corrHint(rCarb))
        ),
        h('.grid2.mt18', {},
          h('div', {},
            h('h3.mt0', {}, '餐 GL × 餐后2小时血糖'),
            SL.Charts.scatter(pairsGL.map(function (p) {
              return { x: p.x, y: p.y, title: 'GL ' + U.fmt1(p.x) + ' → 餐后 ' + U.fmtGlucose(p.y, s) + ' ' + U.unitLabel(s),
                cls: p.y < (s.lowThreshold || 3.9) ? 'low' : (p.y > (s.targetAfterMax || 10.0) ? 'high' : 'ok') };
            }), {
              xLabel: '整餐总 GL',
              yLabel: '餐后2小时 ' + U.unitLabel(s),
              targetMax: s.targetAfterMax || 10.0
            })
          ),
          h('div', {},
            h('h3.mt0', {}, '餐碳水（g）× 餐后2小时血糖'),
            SL.Charts.scatter(pairsCarb.map(function (p) {
              return { x: p.x, y: p.y, title: '碳水 ' + U.fmt1(p.x) + 'g → 餐后 ' + U.fmtGlucose(p.y, s),
                cls: p.y < (s.lowThreshold || 3.9) ? 'low' : (p.y > (s.targetAfterMax || 10.0) ? 'high' : 'ok') };
            }), {
              xLabel: '整餐总碳水（g）',
              yLabel: '餐后2小时 ' + U.unitLabel(s),
              targetMax: s.targetAfterMax || 10.0
            })
          )
        ),
        h('.alert-banner.info.mt18', { style: 'margin-bottom:0' },
          h('span.a-ico', {}, '🔬'),
          h('div', {}, h('b', {}, '关联分析：'), verdict,
            h('.small', { style: 'margin-top:4px;font-weight:400' },
              '相关系数范围 -1 ~ 1，绝对值越大关联越强；本结果为描述性统计，不代表因果关系。'))
        ),
        detailsTable(details, s)
      );
    }

    return h('.card', {},
      h('h2.mt0', {}, '🍚 饮食与血糖的关联'),
      body
    );
  }

  function detailsTable(details, s) {
    if (!details.length) return null;
    return h('div.mt18', {},
      h('h3', {}, '近期餐后记录'),
      h('div', { style: 'overflow-x:auto' },
        h('table', { style: 'width:100%;border-collapse:collapse;font-size:.95rem' },
          h('thead', {}, h('tr', {},
            th('日期'), th('餐次'), th('总 GL'), th('总碳水'), th('餐后2h血糖'), th('判断'))),
          h('tbody', {}, details.map(function (d) {
            return h('tr', {},
              td(d.date), td(d.period),
              td(U.fmt1(d.gl)), td(U.fmt1(d.carbs) + ' g'),
              td(h('b', { class: 'bg-' + d.cls }, U.fmtGlucose(d.value, s) + ' ' + U.unitLabel(s))),
              td(h('span.chip.' + d.cls, {}, U.CLASS_LABEL[d.cls]))
            );
          }))
        )
      )
    );
  }
  function th(t) { return h('th', { style: 'border:1px solid var(--c-line);padding:8px 10px;text-align:left;background:#f7f9fd' }, t); }
  function td(t, node) { return h('td', { style: 'border:1px solid var(--c-line);padding:8px 10px' }, node || t); }

  function corrHint(r) {
    if (r === null) return '';
    var a = Math.abs(r);
    if (a >= 0.5) return r > 0 ? '较强正相关' : '较强负相关';
    if (a >= 0.3) return r > 0 ? '弱正相关' : '弱负相关';
    return '相关性不明显';
  }

  /* ---------------- 运动与血糖 ---------------- */
  function buildExerciseSection(gRecs, eRecs, s) {
    var totalMin = eRecs.reduce(function (a, r) { return a + r.duration; }, 0);
    var totalDrop = eRecs.reduce(function (a, r) {
      return a + (r.estimatedDrop != null ? r.estimatedDrop : 0);
    }, 0);

    // 运动后 2 小时内的血糖与运动前 1 小时血糖粗对比
    var changes = [];
    eRecs.forEach(function (e) {
      var before = gRecs.filter(function (g) {
        return g.at <= e.at && e.at - g.at <= 60 * 60 * 1000;
      }).sort(function (a, b) { return b.at - a.at; })[0];
      var after = gRecs.filter(function (g) {
        return g.at > e.at && g.at - e.at <= 2.5 * 3600 * 1000;
      }).sort(function (a, b) { return a.at - b.at; })[0];
      if (before && after) changes.push({ name: (SL.Views.exercise ? '' : ''), drop: after.value - before.value, e: e });
    });
    var avgChange = changes.length ? U.mean(changes.map(function (c) { return c.drop; })) : null;

    return h('.card', {},
      h('h2.mt0', {}, '🏃 运动与血糖'),
      eRecs.length === 0
        ? h('p.muted', {}, '该时间段内没有运动记录。')
        : h('div', {},
            h('.stat-grid', {},
              stat('运动次数', eRecs.length + ' 次'),
              stat('总时长', totalMin + ' 分钟'),
              stat('估算助降合计', '约 ' + U.fmtGlucose(totalDrop, s, 1) + ' ' + U.unitLabel(s), '经验模型估算，仅供参考'),
              stat('运动前后实测变化', avgChange !== null ?
                (avgChange > 0 ? '+' : '') + U.fmtGlucose(avgChange, s) + ' ' + U.unitLabel(s) : '—',
                changes.length ? changes.length + ' 组运动前后配对' : '需运动前后都测血糖')
            )
          )
    );
  }

  /* ---------------- 小结建议 ---------------- */
  function buildInsights(d, s) {
    var tips = [];
    if (!d.vals.length) {
      tips.push('先开始记录血糖吧，建议至少覆盖空腹和三餐后2小时。');
    } else {
      if (d.nLow > 0) tips.push('期间出现 ' + d.nLow + ' 次低血糖，请注意按时进餐、运动前后加测，并复习「15-15 法则」。');
      if (d.nHigh >= 3) tips.push('偏高次数较多（' + d.nHigh + ' 次），可关注主食量与进餐顺序，持续偏高请联系医生。');
      if (d.vals.length >= 7) {
        if (d.nOk / d.vals.length >= 0.7 && d.nLow === 0) tips.push('整体控制不错，达标率超过 70% 且没有低血糖，继续保持！');
        if (d.hba1c !== null && d.hba1c >= 7) tips.push('糖化估算 ' + d.hba1c.toFixed(1) + '%，高于一般目标 7.0%，复诊时可与医生讨论。');
      } else {
        tips.push('数据不足 7 天，糖化估算仅供参考；坚持每天记录会更准确。');
      }
    }
    return h('.card', {},
      h('h2.mt0', {}, '💡 小结'),
      h('ul', { style: 'margin:0;padding-left:20px;line-height:2' },
        tips.map(function (t) { return h('li', {}, t); }))
    );
  }

  /* ---------------- 工具 ---------------- */
  function stdev(arr) {
    var m = U.mean(arr);
    var v = arr.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / arr.length;
    return Math.sqrt(v);
  }

  function yDomain(gRecs, s) {
    var vals = gRecs.map(function (r) { return r.value; });
    vals.push(s.lowThreshold || 3.9, s.highCritical || 16.7, 4.4, 10.0);
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    return [Math.max(0, Math.floor(min - 1)), Math.ceil(max + 1)];
  }
  function buildYTicks(yd) {
    var arr = [];
    var start = Math.floor(yd[0]);
    for (var v = start; v <= yd[1]; v += 2) arr.push(v);
    return arr;
  }
})(window);
