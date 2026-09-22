/* =========================================================
 * SugarLog · 报告导出（给医生看）
 * 可选 7 / 14 / 30 / 90 天，生成结构化报告
 * 打印为 PDF（浏览器打印 → 另存为 PDF）或下载 .txt
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount, toast = SL.UI.toast, field = SL.UI.field;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  var state = { days: 14 };

  Views.reports = function (root) {
    Promise.all([
      DB.all('glucoseRecords'),
      DB.all('mealRecords'),
      DB.all('medicationRecords'),
      DB.all('exerciseRecords')
    ]).then(function (res) {
      render(root, res[0], res[1], res[2], res[3]);
    });
    mount(root, h('.empty', {}, '加载中…'));
  };

  function render(root, glucose, meals, meds, exercises) {
    var s = SL.App.settings;
    var p = SL.App.profile;

    var rangeSeg = h('.seg', {},
      segBtn('近7天', 7), segBtn('近14天', 14), segBtn('近30天', 30), segBtn('近90天', 90)
    );
    function segBtn(label, days) {
      return h('button', { class: state.days === days ? 'on' : '',
        onClick: function () { state.days = days; SL.App.refresh(); } }, label);
    }

    var data = collectData(state.days, glucose, meals, meds, exercises, s, p);

    var actionCard = h('.card', { style: 'border-top:4px solid var(--c-primary)' },
      h('h2.mt0', {}, '📄 生成复诊报告'),
      h('p.muted', {}, '报告汇总所选时间段内的血糖趋势、达标情况、低血糖事件、用药、饮食与运动要点，可打印成 PDF 或保存为文本带给医生。'),
      rangeSeg,
      h('.report-actions.mt18', {},
        h('button.btn', { onClick: function () { printReport(data, s, p); } }, '🖨️ 打印 / 另存为 PDF'),
        h('button.btn.secondary', { onClick: function () { downloadTxt(data, s, p); } }, '📝 下载文本报告 (.txt)'),
        h('button.btn.ghost', { onClick: function () { Views.medication.exportList(meds); } }, '📋 仅导出用药清单')
      ),
      h('p.small.muted', {}, '提示：打印时在对话框中选择“另存为 PDF”即可得到 PDF 文件；本应用不会联网上传任何数据。')
    );

    // 屏幕预览
    var previewCard = h('.card', {},
      h('h2.mt0', {}, '报告预览'),
      h('div', { id: 'report-preview' }, paperHTML(data, s, p, false))
    );

    mount(root, [actionCard, previewCard]);
  }

  /* ---------------- 数据汇总 ---------------- */
  function collectData(days, glucose, meals, meds, exercises, s, p) {
    var end = U.endOfDay(Date.now());
    var start = U.startOfDay(U.addDays(Date.now(), -(days - 1)));
    function within(r) { return r.at >= start && r.at <= end; }
    var g = glucose.filter(within).sort(function (a, b) { return a.at - b.at; });
    var m = meals.filter(within);
    var md = meds.filter(within).sort(function (a, b) { return a.at - b.at; });
    var ex = exercises.filter(within);

    var vals = g.map(function (r) { return r.value; });
    var classes = g.map(function (r) { return U.classify(r.value, r.meal, s); });
    var avg = U.mean(vals);
    var std = vals.length > 1 ? stdev(vals) : null;
    var hba1c = U.estimateHbA1c(avg);
    var nOk = classes.filter(function (c) { return c === 'ok'; }).length;

    // 分时段平均
    var phases = [
      { keys: ['fasting', 'dawn'], label: '空腹/凌晨' },
      { keys: ['beforeBF', 'beforeLunch', 'beforeDinner'], label: '餐前' },
      { keys: ['afterBF', 'afterLunch', 'afterDinner'], label: '餐后2小时' },
      { keys: ['bedtime'], label: '睡前' }
    ];
    var phaseStats = phases.map(function (ph) {
      var arr = g.filter(function (r) { return ph.keys.indexOf(r.meal) >= 0; });
      var pv = arr.map(function (r) { return r.value; });
      return {
        label: ph.label,
        n: arr.length,
        avg: U.mean(pv),
        min: pv.length ? Math.min.apply(null, pv) : null,
        max: pv.length ? Math.max.apply(null, pv) : null,
        okRate: pv.length ? arr.filter(function (r) {
          return U.classify(r.value, r.meal, s) === 'ok';
        }).length / arr.length : null
      };
    });

    var lowEvents = g.filter(function (r) { return r.value < (s.lowThreshold || 3.9); });
    var severeLow = g.filter(function (r) { return r.value <= (s.severeLowThreshold || 3.0); });
    var highEvents = g.filter(function (r) {
      return U.classify(r.value, r.meal, s) === 'high' || r.value >= (s.highCritical || 16.7);
    });
    var severeHigh = g.filter(function (r) { return r.value >= (s.highCritical || 16.7); });

    // 每日平均
    var dayMap = {};
    g.forEach(function (r) {
      var k = U.fmtDate(r.at);
      if (!dayMap[k]) dayMap[k] = [];
      dayMap[k].push(r.value);
    });
    var daily = Object.keys(dayMap).sort().map(function (k) {
      return { date: k, avg: U.mean(dayMap[k]), n: dayMap[k].length };
    });

    // 用药汇总
    var medSummary = {};
    md.forEach(function (r) {
      var key = r.name + '|' + (r.dose || '') + '|' + (r.kind || '');
      if (!medSummary[key]) {
        medSummary[key] = { name: r.name, dose: r.dose, kind: r.kind, count: 0, takenCount: 0, hours: {} };
      }
      medSummary[key].count++;
      if (r.taken) medSummary[key].takenCount++;
      medSummary[key].hours[new Date(r.at).getHours()] = 1;
    });
    var medList = Object.keys(medSummary).map(function (k) {
      var o = medSummary[k];
      o.hoursLabel = Object.keys(o.hours).map(Number).sort(function (a, b) { return a - b; })
        .map(function (hh) { return U.pad(hh) + ':00'; }).join('、') || '不固定';
      return o;
    });

    // 饮食要点
    var glVals = m.map(function (r) { return r.totalGL || 0; });
    var carbVals = m.map(function (r) { return r.totalCarbs || 0; });
    var highGlMeals = m.filter(function (r) { return (r.totalGL || 0) > 40; })
      .sort(function (a, b) { return (b.totalGL || 0) - (a.totalGL || 0); }).slice(0, 5);
    var mealCountByPeriod = {};
    m.forEach(function (r) { mealCountByPeriod[r.period] = (mealCountByPeriod[r.period] || 0) + 1; });

    // 运动
    var exMin = ex.reduce(function (a, r) { return a + r.duration; }, 0);
    var exByType = {};
    ex.forEach(function (r) {
      exByType[r.type] = (exByType[r.type] || 0) + r.duration;
    });

    return {
      generatedAt: Date.now(),
      start: start, end: end, days: days,
      total: {
        glucose: g.length, meals: m.length, meds: md.length, exercises: ex.length
      },
      glucose: {
        avg: avg, std: std, hba1c: hba1c,
        okRate: vals.length ? nOk / vals.length : null,
        nOk: nOk,
        min: vals.length ? Math.min.apply(null, vals) : null,
        max: vals.length ? Math.max.apply(null, vals) : null,
        phaseStats: phaseStats,
        lowEvents: lowEvents, severeLow: severeLow,
        highEvents: highEvents, severeHigh: severeHigh,
        daily: daily,
        records: g.slice(-200) // 防止报告过长
      },
      meals: {
        count: m.length,
        avgGL: U.mean(glVals), avgCarbs: U.mean(carbVals),
        highGlMeals: highGlMeals,
        mealCountByPeriod: mealCountByPeriod
      },
      medications: medList,
      exercise: { count: ex.length, totalMin: exMin, byType: exByType }
    };
  }

  function stdev(arr) {
    var m = U.mean(arr);
    return Math.sqrt(arr.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / arr.length);
  }

  /* ---------------- 报告 HTML（屏幕预览 + 打印共用） ---------------- */
  function paperHTML(data, s, p, forPrint) {
    var unit = U.unitLabel(s);
    var fv = function (v, d) { return U.fmtGlucose(v, s, d); };

    var g = data.glucose;

    // 每日简表
    var dailyRows = g.daily.slice().reverse().slice(0, 30).map(function (d) {
      var cls = U.classify(d.avg, 'random', s);
      return h('tr', {},
        h('td', {}, d.date),
        h('td', {}, d.n + ' 次'),
        h('td', {}, fv(d.avg) + ' ' + unit),
        h('td', {}, h('span', { class: 'bg-' + cls }, U.CLASS_LABEL[cls]))
      );
    });

    var lowRows = g.lowEvents.slice(-10).map(function (r) {
      return h('tr', {},
        h('td', {}, U.fmtDateTime(r.at)),
        h('td', {}, U.mealLabel(r.meal)),
        h('td', {}, h('b.bg-danger', {}, fv(r.value) + ' ' + unit)),
        h('td', {}, r.note || '—')
      );
    });
    var highRows = g.highEvents.slice(-10).reverse().map(function (r) {
      var cls = U.classify(r.value, r.meal, s);
      return h('tr', {},
        h('td', {}, U.fmtDateTime(r.at)),
        h('td', {}, U.mealLabel(r.meal)),
        h('td', {}, h('b', { class: 'bg-' + cls }, fv(r.value) + ' ' + unit)),
        h('td', {}, r.note || '—')
      );
    });

    var medRows = data.medications.map(function (m2) {
      return h('tr', {},
        h('td', {}, m2.name),
        h('td', {}, m2.dose || '—'),
        h('td', {}, { oral: '口服药', insulin: '胰岛素', other: '其他' }[m2.kind] || m2.kind || '—'),
        h('td', {}, m2.hoursLabel),
        h('td', {}, m2.takenCount + '/' + m2.count)
      );
    });

    var phaseRows = g.phaseStats.map(function (ph) {
      return h('tr', {},
        h('td', {}, ph.label),
        h('td', {}, String(ph.n)),
        h('td', {}, ph.avg !== null ? fv(ph.avg) + ' ' + unit : '—'),
        h('td', {}, ph.min !== null ? fv(ph.min) : '—'),
        h('td', {}, ph.max !== null ? fv(ph.max) : '—'),
        h('td', {}, ph.okRate !== null ? U.fmtPct(ph.okRate) : '—')
      );
    });

    var highGlRows = data.meals.highGlMeals.map(function (m2) {
      return h('tr', {},
        h('td', {}, U.fmtDateTime(m2.at)),
        h('td', {}, (U.MEAL_PERIOD_MAP[m2.period] || { label: '餐' }).label),
        h('td', {}, U.fmt1(m2.totalGL)),
        h('td', {}, U.fmt1(m2.totalCarbs) + ' g'),
        h('td', {}, (m2.foods || []).map(function (f) { return f.name; }).join('、').slice(0, 60))
      );
    });

    return h('.report-paper', {},
      h('h1', {}, 'SugarLog 血糖管理报告'),
      h('.rp-meta', {}, '报告区间：' + U.fmtDate(data.start) + ' 至 ' + U.fmtDate(data.end) +
        '（共 ' + data.days + ' 天） · 生成时间：' + U.fmtDateTime(data.generatedAt)),

      h('h2', {}, '一、患者信息'),
      h('table', {}, h('tbody', {},
        infoRow('昵称', p.nickname || '未填写'),
        infoRow('年龄', U.ageFromBirthday(p.birthday) !== null ? U.ageFromBirthday(p.birthday) + ' 岁' : '未填写'),
        infoRow('糖尿病类型', {
          type1: '1型糖尿病', type2: '2型糖尿病', gdm: '妊娠期糖尿病', other: '其他类型'
        }[p.diabetesType] || '未填写'),
        infoRow('诊断年份', p.diagnoseYear || '未填写'),
        infoRow('血糖目标',
          '空腹 ' + fv(s.targetFastingMin) + '~' + fv(s.targetFastingMax) + ' ' + unit +
          '；餐后 < ' + fv(s.targetAfterMax) + ' ' + unit +
          '；低血糖阈值 ' + fv(s.lowThreshold) + ' ' + unit)
      )),

      h('h2', {}, '二、血糖总体情况'),
      h('table', {}, h('tbody', {},
        infoRow('测量次数', data.total.glucose + ' 次'),
        infoRow('平均血糖', g.avg !== null ? fv(g.avg) + ' ' + unit : '—'),
        infoRow('标准差', g.std !== null ? fv(g.std) + ' ' + unit : '—'),
        infoRow('估算糖化血红蛋白 eHbA1c', g.hba1c !== null ? g.hba1c.toFixed(1) + ' %' : '—' +
          '（根据平均血糖估算，不能替代化验）'),
        infoRow('达标率', g.okRate !== null ? U.fmtPct(g.okRate) + '（' + g.nOk + '/' + data.total.glucose + '）' : '—'),
        infoRow('最低 / 最高',
          (g.min !== null ? fv(g.min) + ' / ' + fv(g.max) + ' ' + unit : '—'))
      )),

      h('h2', {}, '三、分时段血糖'),
      h('table', {},
        h('thead', {}, h('tr', {},
          th('时段'), th('次数'), th('平均'), th('最低'), th('最高'), th('达标率'))),
        h('tbody', {}, phaseRows)
      ),

      h('h2', {}, '四、低血糖 / 高血糖事件'),
      h('p', {}, '低血糖（<' + fv(s.lowThreshold) + ' ' + unit + '）' +
        g.lowEvents.length + ' 次，其中严重（≤' + fv(s.severeLowThreshold) + '）' + g.severeLow.length + ' 次；',
        h('br'),
        '高血糖 ' + g.highEvents.length + ' 次，其中 ≥' + fv(s.highCritical) + ' ' + unit +
        ' 的危险高血糖 ' + g.severeHigh.length + ' 次。'),
      lowRows.length ? h('div', {}, h('h3', {}, '近期低血糖记录'),
        h('table', {}, h('thead', {}, h('tr', {},
          th('时间'), th('时点'), th('血糖'), th('备注'))), h('tbody', {}, lowRows))) : h('p.muted', {}, '无低血糖记录'),
      highRows.length ? h('div', {}, h('h3', {}, '近期高血糖记录（最多10条）'),
        h('table', {}, h('thead', {}, h('tr', {},
          th('时间'), th('时点'), th('血糖'), th('备注'))), h('tbody', {}, highRows))) : null,

      h('h2', {}, '五、每日平均血糖'),
      dailyRows.length ? h('table', {}, h('thead', {}, h('tr', {},
        th('日期'), th('测量'), th('日平均'), th('判断'))), h('tbody', {}, dailyRows))
        : h('p.muted', {}, '该区间无血糖数据'),

      h('h2', {}, '六、用药情况'),
      medRows.length ? h('table', {}, h('thead', {}, h('tr', {},
        th('药品'), th('剂量'), th('类型'), th('常用时间'), th('已服/记录'))),
        h('tbody', {}, medRows))
        : h('p.muted', {}, '该区间无用药记录'),

      h('h2', {}, '七、饮食与运动要点'),
      h('table', {}, h('tbody', {},
        infoRow('记录餐次', data.meals.count + ' 餐（' +
          ['breakfast', 'lunch', 'dinner', 'snack'].map(function (k) {
            return (U.MEAL_PERIOD_MAP[k].label) + ' ' + (data.meals.mealCountByPeriod[k] || 0);
          }).join('、') + '）'),
        infoRow('每餐平均 GL / 碳水',
          data.meals.avgGL !== null ? U.fmt1(data.meals.avgGL) + ' / ' +
            U.fmt1(data.meals.avgCarbs) + ' g' : '—'),
        infoRow('高 GL 餐次（>40）', data.meals.highGlMeals.length + ' 餐'),
        infoRow('运动次数 / 总时长', data.exercise.count + ' 次 / ' + data.exercise.totalMin + ' 分钟')
      )),
      highGlRows.length ? h('div', {}, h('h3', {}, 'GL 最高的餐次'),
        h('table', {}, h('thead', {}, h('tr', {},
          th('时间'), th('餐次'), th('GL'), th('碳水'), th('主要食物'))),
          h('tbody', {}, highGlRows))) : null,

      h('h2', {}, '八、患者备注 / 复诊事项'),
      h('p', {},
        s.followupDate ? ('下次复诊日期：' + s.followupDate +
          (s.followupNote ? '；备注：' + s.followupNote : '')) : '未设置复诊日期'),
      h('p', {}, p.targetNote || '（患者未填写补充说明，可在「设置-个人资料」中补充想咨询医生的问题）'),

      h('.rp-foot', {},
        '本报告由 SugarLog 控糖日记根据本地记录自动生成，所有数据仅保存在本机。' +
        '估算糖化血红蛋白（eHbA1c）由平均血糖换算，不能替代医院化验；具体诊疗方案请以医生判断为准。')
    );
  }

  function infoRow(label, value) {
    return h('tr', {}, h('th', { style: 'width:180px;background:#f7f9fd' }, label),
      h('td', {}, value));
  }
  function th(t) { return h('th', { style: 'border:1px solid #bbb;padding:7px 10px;text-align:left' }, t); }

  /* ---------------- 打印 ---------------- */
  function printReport(data, s, p) {
    var slot = document.getElementById('report-print');
    slot.innerHTML = '';
    slot.appendChild(paperHTML(data, s, p, true));
    window.print();
    setTimeout(function () { slot.innerHTML = ''; }, 500);
  }

  /* ---------------- 文本报告 ---------------- */
  function downloadTxt(data, s, p, root) {
    var unit = U.unitLabel(s);
    var fv = function (v) { return U.fmtGlucose(v, s); };
    var g = data.glucose;
    var L = [];
    L.push('SugarLog 血糖管理报告（文本版）');
    L.push('==================================================');
    L.push('报告区间：' + U.fmtDate(data.start) + ' 至 ' + U.fmtDate(data.end) + '（共' + data.days + '天）');
    L.push('生成时间：' + U.fmtDateTime(data.generatedAt));
    L.push('');
    L.push('【一、患者信息】');
    L.push('昵称：' + (p.nickname || '未填写'));
    var age = U.ageFromBirthday(p.birthday);
    L.push('年龄：' + (age !== null ? age + '岁' : '未填写'));
    L.push('糖尿病类型：' + ({
      type1: '1型糖尿病', type2: '2型糖尿病', gdm: '妊娠期糖尿病', other: '其他类型'
    }[p.diabetesType] || '未填写'));
    L.push('诊断年份：' + (p.diagnoseYear || '未填写'));
    L.push('');
    L.push('【二、血糖总体情况】');
    L.push('测量次数：' + data.total.glucose + ' 次');
    L.push('平均血糖：' + (g.avg !== null ? fv(g.avg) + ' ' + unit : '—'));
    L.push('标准差：' + (g.std !== null ? fv(g.std) + ' ' + unit : '—'));
    L.push('估算糖化血红蛋白：' + (g.hba1c !== null ? g.hba1c.toFixed(1) + '%（估算，不能替代化验）' : '—'));
    L.push('达标率：' + (g.okRate !== null ? U.fmtPct(g.okRate) + '（' + g.nOk + '/' + data.total.glucose + '）' : '—'));
    L.push('最低/最高：' + (g.min !== null ? fv(g.min) + ' / ' + fv(g.max) + ' ' + unit : '—'));
    L.push('');
    L.push('【三、分时段血糖】');
    g.phaseStats.forEach(function (ph) {
      L.push(ph.label + '：' + ph.n + ' 次，平均 ' +
        (ph.avg !== null ? fv(ph.avg) : '—') +
        '，范围 ' + (ph.min !== null ? fv(ph.min) + '~' + fv(ph.max) : '—') +
        '，达标率 ' + (ph.okRate !== null ? U.fmtPct(ph.okRate) : '—'));
    });
    L.push('');
    L.push('【四、低血糖事件】共 ' + g.lowEvents.length + ' 次（严重 ' + g.severeLow.length + ' 次）');
    g.lowEvents.slice(-10).forEach(function (r) {
      L.push('  ' + U.fmtDateTime(r.at) + ' ' + U.mealLabel(r.meal) + ' ' +
        fv(r.value) + ' ' + unit + (r.note ? ' 备注:' + r.note : ''));
    });
    L.push('高血糖事件：' + g.highEvents.length + ' 次（≥' + fv(s.highCritical) + ' 的危险高血糖 ' +
      g.severeHigh.length + ' 次）');
    g.highEvents.slice(-10).reverse().forEach(function (r) {
      L.push('  ' + U.fmtDateTime(r.at) + ' ' + U.mealLabel(r.meal) + ' ' +
        fv(r.value) + ' ' + unit + (r.note ? ' 备注:' + r.note : ''));
    });
    L.push('');
    L.push('【五、每日平均】');
    g.daily.slice().reverse().slice(0, 30).forEach(function (d) {
      L.push('  ' + d.date + '：' + fv(d.avg) + ' ' + unit + '（' + d.n + '次，' +
        U.CLASS_LABEL[U.classify(d.avg, 'random', s)] + '）');
    });
    L.push('');
    L.push('【六、用药情况】');
    if (!data.medications.length) L.push('  无');
    data.medications.forEach(function (m2, i) {
      L.push((i + 1) + '. ' + m2.name + (m2.dose ? ' ' + m2.dose : '') +
        ' [' + ({ oral: '口服药', insulin: '胰岛素', other: '其他' }[m2.kind] || '用药') + ']' +
        ' 常用时间 ' + m2.hoursLabel + ' 已服 ' + m2.takenCount + '/' + m2.count);
    });
    L.push('');
    L.push('【七、饮食与运动】');
    L.push('记录餐次：' + data.meals.count + '；每餐平均 GL ' +
      (data.meals.avgGL !== null ? U.fmt1(data.meals.avgGL) : '—') +
      '，碳水 ' + (data.meals.avgCarbs !== null ? U.fmt1(data.meals.avgCarbs) + 'g' : '—'));
    L.push('高 GL 餐次（>40）：' + data.meals.highGlMeals.length + ' 餐');
    data.meals.highGlMeals.slice(0, 5).forEach(function (m2) {
      L.push('  ' + U.fmtDateTime(m2.at) + ' GL ' + U.fmt1(m2.totalGL) +
        ' 碳水 ' + U.fmt1(m2.totalCarbs) + 'g：' +
        (m2.foods || []).map(function (f) { return f.name; }).join('、'));
    });
    L.push('运动：' + data.exercise.count + ' 次，共 ' + data.exercise.totalMin + ' 分钟');
    L.push('');
    L.push('【八、复诊事项】');
    L.push(s.followupDate ? '下次复诊：' + s.followupDate + (s.followupNote ? '；' + s.followupNote : '')
      : '未设置复诊日期');
    if (p.targetNote) L.push('患者备注：' + p.targetNote);
    L.push('');
    L.push('--------------------------------------------------');
    L.push('本报告由 SugarLog 控糖日记本地生成，数据不上传。');
    L.push('eHbA1c 为平均血糖估算值，不能替代医院化验；诊疗请遵医嘱。');

    SL.UI.download('SugarLog血糖报告_' + U.fmtDate(data.start) + '_' + U.fmtDate(data.end) + '.txt',
      L.join('\n'), 'text/plain');
    toast('文本报告已下载 ✓', 'ok');
  }
})(window);
