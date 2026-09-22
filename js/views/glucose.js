/* =========================================================
 * SugarLog · 血糖记录
 * 顶部：3 步快速记录（数值 → 餐次 → 完成）
 * 下方：按日分组历史列表，支持编辑 / 删除
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, E = SL.UI.E, mount = SL.UI.mount, toast = SL.UI.toast;
  var field = SL.UI.field, selectInput = SL.UI.selectInput;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  var state = { filter: '7d' }; // 7d | 30d | all

  Views.glucose = function (root) {
    DB.all('glucoseRecords').then(function (records) {
      render(root, records.sort(function (a, b) { return b.at - a.at; }));
    });
  };

  function render(root, records) {
    var s = SL.App.settings;

    // ---------- 快速记录卡片 ----------
    var now = new Date(Date.now() - 0);
    var dtlDefault = U.tsToDtl(Date.now());
    var guessed = guessMealByTime();

    var valInput = h('input.input', {
      type: 'number', step: s.unit === 'mgdl' ? '1' : '0.1',
      inputmode: 'decimal', placeholder: '例如 ' + U.fmt1(6.5),
      style: 'font-size:1.5rem;font-weight:800;text-align:center',
      'aria-label': '血糖值'
    });
    var mealSel = selectInput(U.MEALS.map(function (m) {
      return { value: m.key, label: m.label };
    }), guessed);
    var timeInput = h('input.input', { type: 'datetime-local', value: dtlDefault });
    var noteInput = h('input.input', { type: 'text', placeholder: '例如：散步后、感觉头晕…（可选）', maxlength: 100 });

    var resultBox = h('div', { id: 'g-result' });
    function refreshJudge() {
      var raw = parseFloat(valInput.value);
      var box = document.getElementById('g-result');
      if (!box) return;
      box.innerHTML = '';
      if (isNaN(raw)) {
        box.appendChild(h('.muted.small', {}, '输入数值后自动判断是否达标'));
        return;
      }
      var mmol = U.fromDisplay(raw, s);
      var meal = mealSel.value;
      var cls = U.classify(mmol, meal, s);
      var range = U.targetRange(meal, s);
      var icon = { ok: '✅', high: '⬆️', low: '⬇️', danger: mmol < (s.lowThreshold || 3.9) ? '🚨' : '🔥' }[cls];
      box.appendChild(h('.flag-row', { style: 'margin-top:4px' },
        h('span.chip.' + cls, { style: 'font-size:1rem;padding:6px 16px' },
          icon + ' ' + U.CLASS_LABEL[cls]),
        h('span.small.muted', {},
          U.MEAL_MAP[meal].label + '目标 ' +
          U.fmtGlucose(range.min, s) + '~' + U.fmtGlucose(range.max, s) + ' ' + U.unitLabel(s))
      ));
    }
    valInput.addEventListener('input', refreshJudge);
    mealSel.addEventListener('change', refreshJudge);

    var saveBtn = h('button.btn.block', { style: 'margin-top:6px;min-height:54px;font-size:1.12rem' }, '✔ 第3步：保存记录');
    saveBtn.addEventListener('click', function () {
      var raw = parseFloat(valInput.value);
      if (isNaN(raw) || raw <= 0) { toast('请输入有效的血糖数值', 'err'); valInput.focus(); return; }
      var at = U.dtlToTs(timeInput.value) || Date.now();
      var rec = {
        id: DB.uid(),
        value: Math.round(U.fromDisplay(raw, s) * 100) / 100,
        meal: mealSel.value,
        at: at,
        note: noteInput.value.trim(),
        createdAt: Date.now()
      };
      DB.put('glucoseRecords', rec).then(function () {
        toast('血糖已记录 ✓', 'ok');
        SL.App.checkLowGlucoseAfterSave(rec);
        SL.App.refresh();
      });
    });

    var quickCard = h('.card', { style: 'border-top:4px solid var(--c-primary)' },
      h('h2.mt0', {}, '🩸 快速记录血糖（3 步）'),
      h('.grid3', {},
        field(h('span', {}, '第1步 · 血糖值（', h('b', {}, U.unitLabel(s)), '）'), valInput,
          s.unit === 'mgdl' ? '正常参考约 79~126' : '正常参考约 4.4~7.0'),
        field('第2步 · 测量时间点', mealSel),
        field('测量时间', timeInput)
      ),
      field('备注（可选）', noteInput),
      resultBox,
      saveBtn
    );

    // ---------- 筛选 ----------
    var filterSeg = h('.seg', {},
      segBtn('近7天', '7d'), segBtn('近30天', '30d'), segBtn('全部', 'all')
    );
    function segBtn(label, key) {
      return h('button', {
        class: state.filter === key ? 'on' : '',
        onClick: function () { state.filter = key; SL.App.refresh(); }
      }, label);
    }

    var filtered = filterRecords(records, state.filter);

    // ---------- 分组列表 ----------
    var groups = groupByDay(filtered, s);

    var listCard = h('.card', {},
      h('h2.mt0', { style: 'display:flex;align-items:center;gap:10px' },
        '历史记录',
        h('span.muted.small', { style: 'font-weight:400' }, '共 ' + filtered.length + ' 条')),
      filterSeg,
      filtered.length === 0
        ? h('div.mt12', {}, emptyLike())
        : h('div.mt12', {}, groups.map(function (g) {
            var dayVals = g.records.map(function (r) { return r.value; });
            var avg = U.mean(dayVals);
            var okN = g.records.filter(function (r) {
              return U.classify(r.value, r.meal, s) === 'ok';
            }).length;
            return h('.card', { style: 'box-shadow:none;border:1px solid var(--c-line);margin-bottom:12px;padding:14px 16px' },
              h('div', { style: 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px' },
                h('b', { style: 'font-size:1.05rem' }, g.label),
                h('span.small.muted', {},
                  '平均 ' + (avg !== null ? U.fmtGlucose(avg, s) + ' ' + U.unitLabel(s) : '—') +
                  ' · 达标 ' + okN + '/' + g.records.length),
                h('span', { style: 'flex:1' }),
                h('span.small', {
                  class: avg === null ? '' : ('bg-' + U.classify(avg, 'random', s))
                }, avg !== null ? U.CLASS_LABEL[U.classify(avg, 'random', s)] : '')
              ),
              h('.rec-list', {}, g.records.map(function (r) { return recRow(r, s); }))
            );
          }))
    );

    mount(root, [quickCard, listCard]);
    refreshJudge();
  }

  function recRow(r, s) {
    var cls = U.classify(r.value, r.meal, s);
    return h('.rec', {},
      h('span', { class: 'dot ' + cls, title: U.CLASS_LABEL[cls] }),
      h('.rec-main', {},
        h('.rec-title', {}, U.mealLabel(r.meal) + ' · ' + U.fmtTime(r.at)),
        r.note ? h('.rec-meta', {}, '📝 ' + r.note) : h('.rec-meta', {}, '无备注')
      ),
      h('.rec-side', { style: 'display:flex;align-items:center;gap:10px' },
        h('b', { class: 'bg-' + cls, style: 'font-size:1.25rem' },
          U.fmtGlucose(r.value, s) + ' '),
        h('span.small.muted', {}, U.unitLabel(s)),
        h('button.icon-btn.sm', { title: '编辑', onClick: function () { editRecord(r); },
          style: 'width:34px;height:34px;min-height:34px' }, '✏️'),
        h('button.icon-btn.sm', { title: '删除', onClick: function () { delRecord(r); },
          style: 'width:34px;height:34px;min-height:34px' }, '🗑️')
      )
    );
  }

  function emptyLike(text) {
    return SL.UI.emptyBox('📭', '所选时间段内还没有血糖记录');
  }

  function editRecord(r) {
    var s = SL.App.settings;
    var valI = h('input.input', {
      type: 'number', step: s.unit === 'mgdl' ? '1' : '0.1',
      value: U.fmtGlucose(r.value, s, s.unit === 'mgdl' ? 0 : 2)
    });
    var mealS = selectInput(U.MEALS.map(function (m) { return { value: m.key, label: m.label }; }), r.meal);    var timeI = h('input.input', { type: 'datetime-local', value: U.tsToDtl(r.at) });
    var noteI = h('input.input', { type: 'text', value: r.note || '', maxlength: 100 });

    var modal = SL.UI.openModal({
      title: '编辑血糖记录',
      content: h('div', {},
        field('血糖值（' + U.unitLabel(s) + '）', valI),
        field('测量时间点', mealS),
        field('测量时间', timeI),
        field('备注', noteI)
      )
    });
    modal.body.appendChild(h('.modal-foot', {},
      h('button.btn.ghost', { onClick: function () { modal.close(); } }, '取消'),
      h('button.btn', {
        onClick: function () {
          var raw = parseFloat(valI.value);
          if (isNaN(raw) || raw <= 0) { toast('请输入有效数值', 'err'); return; }
          r.value = Math.round(U.fromDisplay(raw, s) * 100) / 100;
          r.meal = mealS.value;
          r.at = U.dtlToTs(timeI.value) || r.at;
          r.note = noteI.value.trim();
          DB.put('glucoseRecords', r).then(function () {
            modal.close(); toast('已更新', 'ok'); SL.App.refresh();
          });
        }
      }, '保存')
    ));
  }

  function delRecord(r) {
    SL.UI.confirm({
      title: '删除这条血糖记录？',
      message: U.fmtDateTime(r.at) + ' · ' + U.mealLabel(r.meal) + ' ' +
        U.fmtGlucose(r.value, SL.App.settings) + ' ' + U.unitLabel(SL.App.settings),
      okText: '删除', danger: true
    }).then(function (ok) {
      if (!ok) return;
      DB.delete('glucoseRecords', r.id).then(function () {
        toast('已删除'); SL.App.refresh();
      });
    });
  }

  /* ---------------- 辅助 ---------------- */
  function filterRecords(records, f) {
    if (f === 'all') return records;
    var days = f === '30d' ? 30 : 7;
    var from = U.startOfDay(U.addDays(Date.now(), -(days - 1)));
    return records.filter(function (r) { return r.at >= from; });
  }

  function groupByDay(records) {
    var map = {};
    var order = [];
    records.forEach(function (r) {
      var key = U.fmtDate(r.at);
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(r);
    });
    return order.map(function (key) {
      var ts = new Date(key + 'T00:00:00').getTime();
      var label = U.fmtDateCN(ts) + '（' + key + '）';
      if (key === U.fmtDate(Date.now())) label = '今天 · ' + label;
      if (key === U.fmtDate(U.addDays(Date.now(), -1))) label = '昨天 · ' + label;
      return { key: key, label: label, records: map[key] };
    });
  }

  /** 按当前钟点猜测时间点 */
  function guessMealByTime() {
    var hh = new Date().getHours();
    if (hh >= 5 && hh < 8) return 'fasting';
    if (hh >= 8 && hh < 10) return 'afterBF';
    if (hh >= 10 && hh < 12) return 'beforeLunch';
    if (hh >= 12 && hh < 14) return 'afterLunch';
    if (hh >= 16 && hh < 18) return 'beforeDinner';
    if (hh >= 18 && hh < 20) return 'afterDinner';
    if (hh >= 21 && hh < 24) return 'bedtime';
    if (hh >= 0 && hh < 5) return 'dawn';
    return 'random';
  }
})(window);
