/* =========================================================
 * SugarLog · 运动记录
 * 类型 / 时长 / 强度 → 估算对血糖的影响（下降幅度）
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount, toast = SL.UI.toast, field = SL.UI.field;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  // 常见运动代谢当量（MET，粗值）
  var EX_TYPES = [
    { value: 'walk', label: '🚶 快走/散步', met: 3.5 },
    { value: 'jog', label: '🏃 慢跑', met: 7.0 },
    { value: 'bike', label: '🚴 骑车', met: 6.0 },
    { value: 'swim', label: '🏊 游泳', met: 6.0 },
    { value: 'dancesport', label: '💃 广场舞/健身操', met: 5.0 },
    { value: 'taichi', label: '🧘 太极拳/瑜伽', met: 3.0 },
    { value: 'ball', label: '⚽ 球类运动', met: 6.5 },
    { value: 'strength', label: '🏋️ 力量训练', met: 5.0 },
    { value: 'housework', label: '🧹 家务劳动', met: 3.0 },
    { value: 'other', label: '🔧 其他', met: 3.5 }
  ];
  var INTENSITIES = [
    { value: 'light', label: '轻度（轻松、微微发热）', factor: 0.75 },
    { value: 'moderate', label: '中度（能说话不能唱歌）', factor: 1.0 },
    { value: 'vigorous', label: '剧烈（心跳明显、出汗多）', factor: 1.3 }
  ];
  var EX_MAP = {};
  EX_TYPES.forEach(function (t) { EX_MAP[t.value] = t; });
  var INT_MAP = {};
  INTENSITIES.forEach(function (t) { INT_MAP[t.value] = t; });

  var state = { filter: '7d' };

  Views.exercise = function (root) {
    DB.all('exerciseRecords').then(function (records) {
      render(root, records.sort(function (a, b) { return b.at - a.at; }));
    });
    mount(root, h('.empty', {}, '加载中…'));
  };

  /**
   * 估算血糖下降幅度（mmol/L）
   * 经验模型：下降 ≈ k(MET) × 强度系数 × 时长(min)/30 × 0.9
   * 说明：个体差异很大，仅用于提示，不作为用药依据。
   */
  function estimateDrop(rec, profile) {
    var t = EX_MAP[rec.type] || EX_MAP.other;
    var it = INT_MAP[rec.intensity] || INT_MAP.moderate;
    var base = (t.met / 6.0) * it.factor * (rec.duration / 30) * 0.9;
    // 1型 / 使用胰岛素者波动更大
    if (profile && (profile.diabetesType === 'type1')) base *= 1.15;
    return Math.round(base * 10) / 10;
  }

  function render(root, records) {
    var s = SL.App.settings;
    var filterSeg = h('.seg', {},
      segBtn('近7天', '7d'), segBtn('近30天', '30d'), segBtn('全部', 'all')
    );
    function segBtn(label, key) {
      return h('button', { class: state.filter === key ? 'on' : '',
        onClick: function () { state.filter = key; SL.App.refresh(); } }, label);
    }
    var filtered = records;
    if (state.filter !== 'all') {
      var days = state.filter === '30d' ? 30 : 7;
      var from = U.startOfDay(U.addDays(Date.now(), -(days - 1)));
      filtered = records.filter(function (r) { return r.at >= from; });
    }

    // 本周运动统计
    var weekFrom = U.addDays(U.startOfDay(Date.now()), -6);
    var weekRecs = records.filter(function (r) { return r.at >= weekFrom; });
    var weekMin = weekRecs.reduce(function (a, r) { return a + (r.duration || 0); }, 0);
    var modPlusMin = weekRecs.filter(function (r) {
      return (EX_MAP[r.type] || EX_MAP.other).met >= 3.5 && r.intensity !== 'light';
    }).reduce(function (a, r) { return a + r.duration; }, 0);
    var targetMin = 150;

    function refresh() { Views.exercise(root); }

    var summaryCard = h('.card', { style: 'border-top:4px solid #26a69a' },
      h('h2.mt0', {}, '🏃 运动概况（近7天）'),
      h('.stat-grid', {},
        stat('运动次数', weekRecs.length + ' 次'),
        stat('总时长', weekMin + ' 分钟'),
        stat('中等强度以上', modPlusMin + ' 分钟',
          h('span', {}, modPlusMin >= targetMin ?
            h('span.bg-ok', {}, '✓ 已达到每周 150 分钟建议量') :
            h('span', {}, '建议达到 150 分钟，还差 ' + (targetMin - modPlusMin) + ' 分钟'))),
        stat('记录总数', records.length + ' 次')
      ),
      h('.div.mt18', {},
        h('button.btn', { onClick: function () { openExModal(null, refresh); } }, '➕ 记录一次运动')
      )
    );

    var listCard = h('.card', {},
      h('h2.mt0', { style: 'display:flex;align-items:center;gap:10px' },
        '运动记录',
        h('span.muted.small', { style: 'font-weight:400' }, '共 ' + filtered.length + ' 次')),
      filterSeg,
      filtered.length === 0
        ? h('div.mt12', {}, SL.UI.emptyBox('🏃', '还没有运动记录。餐后散步 30 分钟有助于平稳血糖',
            h('button.btn', { onClick: function () { openExModal(null, refresh); } }, '➕ 记录运动')))
        : h('div.mt12.rec-list', {}, filtered.map(function (r) { return row(r, refresh); }))
    );

    mount(root, [summaryCard, listCard]);
  }

  function stat(label, value, sub) {
    return h('.stat', {},
      h('.s-label', {}, label),
      h('.s-value', {}, value),
      sub ? h('.s-sub', {}, sub) : null
    );
  }

  function row(r, refresh) {
    var t = EX_MAP[r.type] || { label: '运动', met: 3.5 };
    var it = INT_MAP[r.intensity] || INT_MAP.moderate;
    var drop = estimateDrop(r, SL.App.profile);
    var s = SL.App.settings;
    return h('.rec', {},
      h('span', { style: 'font-size:1.5rem' }, t.label.split(' ')[0]),
      h('.rec-main', {},
        h('.rec-title', {}, t.label.split(' ')[1] || t.label,
          h('span.chip.mut', { style: 'margin-left:8px;font-weight:400' }, it.label.split('（')[0])),
        h('.rec-meta', {},
          U.fmtRelative(r.at) + ' · ' + r.duration + ' 分钟',
          r.note ? ' · ' + r.note : '')
      ),
      h('.rec-side', { style: 'display:flex;gap:8px;align-items:center' },
        h('span', { title: '估算值，仅供参考' },
          h('b.bg-low', { style: 'font-size:1.05rem' }, '↓约' + U.fmtGlucose(drop, s, 1) + ' '),
          h('span.small.muted', {}, U.unitLabel(s))),
        h('button.icon-btn.sm', { title: '编辑', style: 'width:34px;height:34px;min-height:34px',
          onClick: function () { openExModal(r, refresh); } }, '✏️'),
        h('button.icon-btn.sm', { title: '删除', style: 'width:34px;height:34px;min-height:34px',
          onClick: function () { delEx(r, refresh); } }, '🗑️')
      )
    );
  }

  function delEx(r, refresh) {
    SL.UI.confirm({
      title: '删除这条运动记录？',
      message: (EX_MAP[r.type] || { label: '运动' }).label + ' · ' + r.duration + '分钟',
      okText: '删除', danger: true
    }).then(function (ok) {
      if (!ok) return;
      DB.delete('exerciseRecords', r.id).then(function () { toast('已删除'); refresh(); });
    });
  }

  function openExModal(existing, onSaved) {
    var typeSel = SL.UI.selectInput(
      EX_TYPES.map(function (t) { return { value: t.value, label: t.label }; }),
      existing ? existing.type : 'walk');
    var durationInput = h('input.input', { type: 'number', min: '1', max: '600', step: '1',
      value: existing ? existing.duration : 30 });
    var intensitySel = SL.UI.selectInput(
      INTENSITIES.map(function (t) { return { value: t.value, label: t.label }; }),
      existing ? existing.intensity : 'moderate');
    var timeInput = h('input.input', { type: 'datetime-local',
      value: U.tsToDtl(existing ? existing.at : Date.now()) });
    var noteInput = h('input.input', { value: existing ? (existing.note || '') : '',
      placeholder: '餐后1小时运动 / 运动后有点心慌…（可选）', maxlength: 100 });

    var estimateBox = h('.alert-banner.info', { style: 'margin:0' },
      h('span.a-ico', {}, '📉'),
      h('div', {}, '估算影响：', h('b', {}, '—'))
    );

    function refreshEst() {
      var dur = parseFloat(durationInput.value);
      var rec = { type: typeSel.value, intensity: intensitySel.value, duration: isNaN(dur) ? 0 : dur };
      var drop = estimateDrop(rec, SL.App.profile);
      estimateBox.querySelector('div').innerHTML = '';
      estimateBox.querySelector('div').appendChild(
        h('span', {}, '估算影响：约使血糖下降 ',
          h('b', {}, U.fmtGlucose(drop, SL.App.settings, 1) + ' ' + U.unitLabel(SL.App.settings)),
          '（个体差异大，仅作参考；运动前后建议各测一次血糖）')
      );
    }
    durationInput.addEventListener('input', refreshEst);
    typeSel.addEventListener('change', refreshEst);
    intensitySel.addEventListener('change', refreshEst);

    var modal = SL.UI.openModal({
      title: existing ? '编辑运动' : '🏃 记录一次运动',
      content: h('div', {},
        h('.row', {},
          field('运动类型', typeSel),
          field('时长（分钟）', durationInput)
        ),
        field('运动强度', intensitySel),
        field('运动时间', timeInput),
        estimateBox,
        h('.mt12', {}, field('备注（可选）', noteInput))
      )
    });

    refreshEst();

    modal.body.appendChild(h('.modal-foot', {},
      h('button.btn.ghost', { onClick: function () { modal.close(); } }, '取消'),
      h('button.btn', {
        onClick: function () {
          var dur = parseFloat(durationInput.value);
          if (isNaN(dur) || dur <= 0) { toast('请填写有效时长', 'err'); return; }
          var rec = {
            id: existing ? existing.id : DB.uid(),
            type: typeSel.value,
            duration: Math.round(dur),
            intensity: intensitySel.value,
            at: U.dtlToTs(timeInput.value) || Date.now(),
            note: noteInput.value.trim()
          };
          rec.estimatedDrop = estimateDrop(rec, SL.App.profile);
          DB.put('exerciseRecords', rec).then(function () {
            modal.close(); toast(existing ? '已更新 ✓' : '运动已记录 ✓', 'ok');
            onSaved && onSaved();
          });
        }
      }, existing ? '保存' : '保存运动')
    ));
  }
})(window);
