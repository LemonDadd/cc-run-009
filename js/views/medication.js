/* =========================================================
 * SugarLog · 用药记录
 * 口服药 / 胰岛素：名称、剂量、时间、提醒、是否已服用
 * 支持「待服用 / 已服用 / 全部」筛选 + 用药清单导出
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount, toast = SL.UI.toast, field = SL.UI.field;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  var COMMON_MEDS = [
    { name: '二甲双胍', kind: 'oral', dose: '0.5g' },
    { name: '格列美脲', kind: 'oral', dose: '2mg' },
    { name: '阿卡波糖', kind: 'oral', dose: '50mg' },
    { name: '西格列汀', kind: 'oral', dose: '100mg' },
    { name: '达格列净', kind: 'oral', dose: '10mg' },
    { name: '门冬胰岛素（速效）', kind: 'insulin', dose: '6U' },
    { name: '甘精胰岛素（长效）', kind: 'insulin', dose: '12U' },
    { name: '预混胰岛素', kind: 'insulin', dose: '10U' }
  ];

  var state = { tab: 'pending', range: 'today' };

  Views.medication = function (root) {
    DB.all('medicationRecords').then(function (records) {
      render(root, records.sort(function (a, b) { return b.at - a.at; }));
    });
    mount(root, h('.empty', {}, '加载中…'));
  };

  function render(root, records) {
    var s = SL.App.settings;
    var now = Date.now();

    // 区间
    var ranged;
    if (state.range === 'today') {
      ranged = records.filter(function (m) {
        return m.at >= U.startOfDay(now) && m.at <= U.endOfDay(now);
      });
    } else if (state.range === '7d') {
      ranged = records.filter(function (m) { return m.at >= U.addDays(U.startOfDay(now), -6); });
    } else {
      ranged = records;
    }
    ranged.sort(function (a, b) { return b.at - a.at; });

    var pending = ranged.filter(function (m) { return !m.taken; })
      .sort(function (a, b) { return a.at - b.at; });
    var taken = ranged.filter(function (m) { return m.taken; });
    var showList = state.tab === 'pending' ? pending : state.tab === 'taken' ? taken : ranged;

    var rangeSeg = h('.seg', {},
      rangeBtn('今天', 'today'), rangeBtn('近7天', '7d'), rangeBtn('全部', 'all')
    );
    function rangeBtn(label, key) {
      return h('button', { class: state.range === key ? 'on' : '',
        onClick: function () { state.range = key; SL.App.refresh(); } }, label);
    }

    var tabSeg = h('.seg', {},
      tabBtn('待服用 (' + pending.length + ')', 'pending'),
      tabBtn('已服用 (' + taken.length + ')', 'taken'),
      tabBtn('全部 (' + ranged.length + ')', 'all')
    );
    function tabBtn(label, key) {
      return h('button', { class: state.tab === key ? 'on' : '',
        onClick: function () { state.tab = key; SL.App.refresh(); } }, label);
    }

    var summaryCard = h('.card', { style: 'border-top:4px solid #5c6bc0' },
      h('h2.mt0', {}, '💊 用药管理'),
      h('.row', { style: 'gap:10px' },
        h('button.btn', { onClick: function () { openMedModal(null, refresh); } }, '➕ 记一次用药'),
        h('button.btn.secondary', { onClick: function () { Views.medication.exportList(records); } }, '📋 导出用药清单'),
        s.remindMedication
          ? h('span.chip.ok', { style: 'align-self:center' }, '🔔 用药提醒已开启')
          : h('span.chip.mut', { style: 'align-self:center' }, '提醒已关闭（设置中开启）')
      )
    );

    function refresh() { Views.medication(root); }

    var listCard = h('.card', {},
      h('h2.mt0', {}, '用药列表'),
      h('.row', { style: 'gap:10px;margin-bottom:12px' }, rangeSeg, tabSeg),
      showList.length === 0
        ? SL.UI.emptyBox('💊',
            state.tab === 'pending' ? '当前时间段没有待服用的药物' : '暂无用药记录',
            h('button.btn', { onClick: function () { openMedModal(null, refresh); } }, '➕ 记一次用药'))
        : h('.rec-list', {}, showList.map(function (m) { return medRow(m, refresh); }))
    );

    mount(root, [summaryCard, listCard]);
  }

  function medRow(m, refresh) {
    var s = SL.App.settings;
    var overdue = !m.taken && m.at < Date.now();
    var soon = !m.taken && m.at >= Date.now() && m.at - Date.now() < 60 * 60 * 1000;
    var kindMap = { oral: '💊 口服药', insulin: '💉 胰岛素', other: '🧴 其他' };

    return h('.rec', {},
      h('span', { class: 'dot ' + (m.taken ? 'ok' : (overdue ? 'danger' : 'high')) }),
      h('.rec-main', {},
        h('.rec-title', {}, m.name + (m.dose ? ' · ' + m.dose : ''),
          h('span.chip.mut', { style: 'margin-left:8px;font-weight:400' },
            kindMap[m.kind] || m.kind || '用药')),
        h('.rec-meta', {},
          U.fmtRelative(m.at) + ' ' + U.fmtTime(m.at),
          m.reminder ? ' · 🔔 到点提醒' : '',
          m.note ? ' · ' + m.note : ''
        )
      ),
      h('.rec-side', { style: 'display:flex;gap:6px;align-items:center' },
        m.taken
          ? h('span.chip.ok', {}, '✓ 已服用' + (m.takenAt ? ' ' + U.fmtTime(m.takenAt) : ''))
          : h('span.chip.' + (overdue ? 'danger' : (soon ? 'high' : 'mut')), {},
              overdue ? '已过时' : (soon ? '快到时间' : '待服用')),
        m.taken ? h('button.btn.sm.ghost', { title: '撤销',
          onClick: function () { toggleTaken(m, false, refresh); } }, '↩')
          : h('button.btn.sm', { onClick: function () { toggleTaken(m, true, refresh); } }, '✓ 已服'),
        h('button.icon-btn.sm', { title: '编辑', style: 'width:34px;height:34px;min-height:34px',
          onClick: function () { openMedModal(m, refresh); } }, '✏️'),
        h('button.icon-btn.sm', { title: '删除', style: 'width:34px;height:34px;min-height:34px',
          onClick: function () { delMed(m, refresh); } }, '🗑️')
      )
    );
  }

  function toggleTaken(m, taken, refresh) {
    m.taken = taken;
    m.takenAt = taken ? Date.now() : null;
    DB.put('medicationRecords', m).then(function () {
      toast(taken ? '已标记为服用 ✓' : '已撤销');
      refresh();
    });
  }

  function delMed(m, refresh) {
    SL.UI.confirm({
      title: '删除这条用药记录？', message: m.name + ' · ' + U.fmtDateTime(m.at),
      okText: '删除', danger: true
    }).then(function (ok) {
      if (!ok) return;
      DB.delete('medicationRecords', m.id).then(function () { toast('已删除'); refresh(); });
    });
  }

  /* ---------------- 新增 / 编辑模态框 ---------------- */
  function openMedModal(existing, onSaved) {
    var s = SL.App.settings;
    var dtl = U.tsToDtl(existing ? existing.at : defaultMedTime());

    var nameInput = h('input.input', { list: 'med-name-list', value: existing ? existing.name : '',
      placeholder: '药品名称，如 二甲双胍', maxlength: 30 });
    var dataList = h('datalist', { id: 'med-name-list' },
      COMMON_MEDS.map(function (m) { return h('option', { value: m.name }); }));

    var doseInput = h('input.input', { value: existing ? (existing.dose || '') : '',
      placeholder: '剂量，如 0.5g / 6U / 1片', maxlength: 20 });
    var kindSel = SL.UI.selectInput(
      [{ value: 'oral', label: '💊 口服药' },
       { value: 'insulin', label: '💉 胰岛素' },
       { value: 'other', label: '🧴 其他' }],
      existing ? existing.kind : 'oral');
    var timeInput = h('input.input', { type: 'datetime-local', value: dtl });
    var noteInput = h('input.input', { value: existing ? (existing.note || '') : '',
      placeholder: '随餐服用 / 饭前30分钟…（可选）', maxlength: 100 });
    var reminderCb = h('input', { type: 'checkbox', checked: existing ? !!existing.reminder : !!s.remindMedication,
      style: 'width:22px;height:22px;margin-right:8px;vertical-align:middle' });

    var quickWrap = h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      COMMON_MEDS.map(function (m) {
        return h('button.btn.ghost.sm', {
          onClick: function () {
            nameInput.value = m.name;
            doseInput.value = m.dose;
            kindSel.value = m.kind;
          }
        }, m.name);
      })
    );

    var modal = SL.UI.openModal({
      title: existing ? '编辑用药' : '💊 记一次用药',
      content: h('div', {},
        field('药品名称', h('div', {}, nameInput, dataList)),
        h('.small.muted.mb8', {}, '常用药快速填入：'),
        h('.mb8', {}, quickWrap),
        h('.row', {},
          field('剂量', doseInput),
          field('类型', kindSel)
        ),
        field('计划服用时间', timeInput),
        h('.field', {},
          h('label', { style: 'display:flex;align-items:center;cursor:pointer' },
            reminderCb, '到点提醒（应用打开时弹出通知）')
        ),
        field('备注', noteInput)
      )
    });

    modal.body.appendChild(h('.modal-foot', {},
      h('button.btn.ghost', { onClick: function () { modal.close(); } }, '取消'),
      h('button.btn', {
        onClick: function () {
          var name = nameInput.value.trim();
          if (!name) { toast('请填写药品名称', 'err'); return; }
          var rec = {
            id: existing ? existing.id : DB.uid(),
            name: name,
            dose: doseInput.value.trim(),
            kind: kindSel.value,
            at: U.dtlToTs(timeInput.value) || Date.now(),
            reminder: !!reminderCb.checked,
            note: noteInput.value.trim(),
            taken: existing ? !!existing.taken : false,
            takenAt: existing ? existing.takenAt || null : null
          };
          DB.put('medicationRecords', rec).then(function () {
            modal.close();
            toast(existing ? '已更新 ✓' : '用药已记录 ✓', 'ok');
            onSaved && onSaved();
          });
        }
      }, existing ? '保存' : '保存用药')
    ));
  }

  function defaultMedTime() {
    var d = new Date();
    var hh = d.getHours();
    // 就近的整点
    d.setMinutes(0, 0, 0);
    if (hh >= 8 && hh < 11) d.setHours(12);
    else if (hh >= 11 && hh < 17) d.setHours(18);
    else if (hh >= 17 && hh < 22) d.setHours(21);
    else d.setHours(hh + 1);
    return d.getTime();
  }

  /* ---------------- 用药清单导出（给医生看） ---------------- */
  Views.medication.exportList = function (records) {
    var profile = SL.App.profile;
    var s = SL.App.settings;
    var medMap = {};
    records.forEach(function (m) {
      var key = m.name + '|' + (m.dose || '') + '|' + (m.kind || '');
      if (!medMap[key]) {
        medMap[key] = { name: m.name, dose: m.dose, kind: m.kind, times: [], count: 0 };
      }
      medMap[key].count++;
      medMap[key].times.push(m.at);
    });

    var lines = [];
    lines.push('SugarLog 用药清单');
    lines.push('==================================');
    lines.push('患者：' + (profile.nickname || '未填写') +
      (profile.diabetesType ? '（' + diabetesLabel(profile.diabetesType) + '）' : ''));
    lines.push('生成时间：' + U.fmtDateTime(Date.now()));
    lines.push('统计记录数：' + records.length + ' 条');
    lines.push('');
    lines.push('【药物明细】');
    var idx = 1;
    Object.keys(medMap).forEach(function (k) {
      var m = medMap[k];
      m.times.sort(function (a, b) { return a - b; });
      var hourSet = {};
      m.times.forEach(function (t) { hourSet[new Date(t).getHours()] = 1; });
      var hours = Object.keys(hourSet).map(Number).sort(function (a, b) { return a - b; });
      var timeLabel = hours.length ? hours.map(function (x) { return U.pad(x) + ':00 左右'; }).join('、') : '时间不固定';
      lines.push(idx + '. ' + m.name + (m.dose ? '  ' + m.dose : '') +
        '  [' + ({ oral: '口服药', insulin: '胰岛素', other: '其他' }[m.kind] || '用药') + ']');
      lines.push('   常用时间：' + timeLabel + '；近' + records.length + '条记录中出现 ' + m.count + ' 次');
      idx++;
    });
    if (idx === 1) lines.push('（暂无用药记录）');
    lines.push('');
    lines.push('提示：本清单由 SugarLog 根据用药记录自动汇总，具体用法请遵医嘱。');

    SL.UI.download('SugarLog用药清单_' + U.fmtDate(Date.now()) + '.txt', lines.join('\n'), 'text/plain');
    toast('用药清单已导出 ✓', 'ok');
  };

  function diabetesLabel(k) {
    return { type1: '1型糖尿病', type2: '2型糖尿病', gdm: '妊娠期糖尿病', other: '其他类型' }[k] || k || '';
  }
})(window);
