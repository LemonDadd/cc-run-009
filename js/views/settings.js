/* =========================================================
 * SugarLog · 设置
 * 个人资料 / 目标范围与单位 / 提醒 / 复诊 / 数据管理
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount, toast = SL.UI.toast, field = SL.UI.field;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  Views.settings = function (root) {
    Promise.all([DB.get('profiles', 'me'), DB.get('settings', 'default')]).then(function (res) {
      render(root, res[0] || DB.defaultProfile(), res[1] || DB.defaultSettings());
    });
    mount(root, h('.empty', {}, '加载中…'));
  };

  function render(root, p, s) {
    /* ---------------- 个人资料 ---------------- */
    var nickI = h('input.input', { value: p.nickname || '', maxlength: 16, placeholder: '您希望怎么称呼' });
    var birthI = h('input.input', { type: 'date', value: p.birthday || '' });
    var typeSel = SL.UI.selectInput([
      { value: '', label: '请选择糖尿病类型' },
      { value: 'type1', label: '1 型糖尿病' },
      { value: 'type2', label: '2 型糖尿病' },
      { value: 'gdm', label: '妊娠期糖尿病' },
      { value: 'other', label: '其他类型 / 待定' }
    ], p.diabetesType || '');
    var yearI = h('input.input', { type: 'number', min: '1930', max: '2099', step: '1',
      value: p.diagnoseYear || '', placeholder: '例如 2021' });
    var targetNoteI = h('textarea.input', { maxlength: 200, placeholder: '医生给您的特别嘱咐、想在复诊时咨询的问题…' },
      p.targetNote || '');

    var ageLine = h('.small.muted', {}, U.ageFromBirthday(p.birthday) !== null ?
      '年龄：' + U.ageFromBirthday(p.birthday) + ' 岁' : '');
    birthI.addEventListener('change', function () {
      ageLine.textContent = U.ageFromBirthday(birthI.value) !== null ?
        '年龄：' + U.ageFromBirthday(birthI.value) + ' 岁' : '';
    });

    var profileCard = h('.card', { style: 'border-top:4px solid #7e57c2' },
      h('h2.mt0', {}, '👤 个人资料'),
      h('.row', {},
        field('昵称', nickI),
        field('生日', birthI, ageLine)
      ),
      h('.row', {},
        field('糖尿病类型', typeSel),
        field('诊断年份', yearI)
      ),
      field('备注 / 复诊想咨询的问题', targetNoteI),
      h('button.btn', {
        onClick: function () {
          var np = Object.assign({}, p, {
            nickname: nickI.value.trim(),
            birthday: birthI.value,
            diabetesType: typeSel.value,
            diagnoseYear: yearI.value,
            targetNote: targetNoteI.value.trim()
          });
          DB.put('profiles', np).then(function () {
            toast('个人资料已保存 ✓', 'ok');
            return SL.App.reloadState();
          }).then(function () { SL.App.refresh(); });
        }
      }, '保存个人资料')
    );

    /* ---------------- 单位与目标范围 ---------------- */
    var unitSeg = h('.seg', {},
      unitBtn('mmol/L', 'mmol'), unitBtn('mg/dL', 'mgdl')
    );
    function unitBtn(label, key) {
      return h('button', { class: s.unit === key ? 'on' : '',
        onClick: function () {
          s.unit = key;
          persistSettings(s, function () { toast('单位已切换 ✓', 'ok'); });
        }
      }, label);
    }

    var rangeFields = {};
    function numField(key, label, hint) {
      var inp = h('input.input', { type: 'number', step: s.unit === 'mgdl' ? '1' : '0.1',
        value: U.fmtGlucose(s[key], s, s.unit === 'mgdl' ? 0 : 2) });
      rangeFields[key] = inp;
      return field(label, inp, hint);
    }

    var targetsCard = h('.card', {},
      h('h2.mt0', {}, '🎯 血糖单位与目标范围'),
      field('血糖单位', unitSeg, '所有数值内部按 mmol/L 存储，切换单位不影响已保存的数据'),
      h('h3', {}, '目标范围（' + U.unitLabel(s) + '）'),
      h('.grid3', {},
        numField('targetFastingMin', '空腹/凌晨 下限'),
        numField('targetFastingMax', '空腹/凌晨 上限'),
        numField('targetBeforeMax', '餐前 上限')
      ),
      h('.grid3', {},
        numField('targetAfterMax', '餐后2小时 上限', '一般成人建议 < 10.0 mmol/L'),
        numField('targetBedtimeMin', '睡前 下限'),
        numField('targetBedtimeMax', '睡前 上限')
      ),
      h('h3', {}, '预警阈值（' + U.unitLabel(s) + '）'),
      h('.grid3', {},
        numField('lowThreshold', '低血糖阈值', '低于此值弹出「15-15」处理步骤'),
        numField('severeLowThreshold', '严重低血糖', '低于此值标红，提示急救'),
        numField('highCritical', '危险高血糖', '达到此值标红，提示尽快就医')
      ),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        h('button.btn', {
          onClick: function () {
            var d = DB.defaultSettings();
            Object.keys(rangeFields).forEach(function (k) {
              rangeFields[k].value = U.fmtGlucose(d[k], s, s.unit === 'mgdl' ? 0 : 2);
            });
            toast('已填入常用标准值，记得点保存');
          }
        }, '恢复常用标准值'),
        h('button.btn.secondary', {
          onClick: function () {
            var ns = Object.assign({}, s);
            Object.keys(rangeFields).forEach(function (k) {
              var v = parseFloat(rangeFields[k].value);
              ns[k] = isNaN(v) ? s[k] : Math.round(U.fromDisplay(v, s) * 100) / 100;
            });
            if (ns.lowThreshold <= ns.severeLowThreshold) {
              toast('低血糖阈值应高于严重低血糖阈值', 'err'); return;
            }
            if (ns.targetFastingMin >= ns.targetFastingMax || ns.targetFastingMax >= ns.targetAfterMax) {
              toast('请检查目标范围的大小关系', 'err'); return;
            }
            persistSettings(ns, function () { toast('目标范围已保存 ✓', 'ok'); });
          }
        }, '保存目标范围')
      )
    );

    /* ---------------- 提醒 ---------------- */
    var medRemindCb = h('input', { type: 'checkbox', checked: !!s.remindMedication,
      style: 'width:22px;height:22px' });
    var followDateI = h('input.input', { type: 'date', value: s.followupDate || '' });
    var followNoteI = h('input.input', { value: s.followupNote || '', maxlength: 50,
      placeholder: '例如：内分泌科 王医生，带化验单' });
    var followDaysI = h('input.input', { type: 'number', min: '0', max: '30', step: '1',
      value: s.remindFollowupDays || 3 });

    var followupInfo = h('.small.muted', {}, followText(s.followupDate, s.remindFollowupDays));
    function refreshFollow() {
      followupInfo.textContent = followText(followDateI.value, parseInt(followDaysI.value, 10));
    }
    followDateI.addEventListener('change', refreshFollow);
    followDaysI.addEventListener('input', refreshFollow);

    var remindCard = h('.card', {},
      h('h2.mt0', {}, '🔔 提醒设置'),
      h('.field', {},
        h('label', { style: 'display:flex;gap:10px;align-items:center;cursor:pointer' },
          medRemindCb,
          h('span', {}, '用药到点提醒',
            h('span.hint', { style: 'display:block;font-weight:400' },
              '需要应用处于打开状态，并允许浏览器/系统通知（右上角 🔔 开启）')))
      ),
      h('hr.sep'),
      h('h3.mt0', {}, '复诊提醒'),
      h('.row', {},
        field('下次复诊日期', followDateI),
        field('提前几天提醒', followDaysI)
      ),
      field('复诊备注', followNoteI),
      followupInfo,
      h('button.btn.secondary.mt12', {
        onClick: function () {
          var ns = Object.assign({}, s, {
            remindMedication: !!medRemindCb.checked,
            followupDate: followDateI.value,
            followupNote: followNoteI.value.trim(),
            remindFollowupDays: parseInt(followDaysI.value, 10) || 0
          });
          sessionStorage.removeItem('sl_followup_notified');
          persistSettings(ns, function () {
            toast('提醒设置已保存 ✓', 'ok');
            if (ns.remindMedication) SL.App.enableNotifications();
          });
        }
      }, '保存提醒设置')
    );

    /* ---------------- 数据管理 ---------------- */
    var dataCard = h('.card', {},
      h('h2.mt0', {}, '💾 数据管理'),
      h('p.muted.small', {}, '所有数据（个人资料、血糖/饮食/用药/运动记录、自定义食物）仅保存在本机浏览器 IndexedDB 中，不会上传。建议定期备份。'),
      h('.row', { style: 'gap:10px' },
        h('button.btn.secondary', { onClick: exportBackup }, '⬇️ 备份全部数据 (JSON)'),
        h('button.btn.secondary', { onClick: importBackup }, '⬆️ 从备份恢复'),
        h('button.btn.danger', { onClick: resetAll }, '🗑️ 清空全部数据')
      )
    );

    mount(root, [
      h('.card', {},
        h('h2.mt0', {}, '⚙️ 设置'),
        h('p.muted', { style: 'margin:0' }, '按医生给您的个体化目标调整，应用会按这里的设置判断颜色与预警。')
      ),
      profileCard, targetsCard, remindCard, dataCard,
      h('.card', {},
        h('h2.mt0', {}, 'ℹ️ 关于 SugarLog'),
        h('p.small', { style: 'color:var(--c-ink-2)' },
          'SugarLog 控糖日记 · 本地血糖记录 / 饮食分析 / 用药提醒 / 趋势报告工具。',
          h('br'),
          '本应用不提供诊断，不能替代医生面诊与化验。内置知识库整理自公开的糖尿病患者教育资料，如《中国 2 型糖尿病防治指南》。')
      )
    ]);
  }

  function followText(dateStr, days) {
    if (!dateStr) return '尚未设置复诊日期。';
    var d = new Date(dateStr + 'T00:00:00').getTime();
    var diff = Math.ceil((d - U.startOfDay(Date.now())) / 864e5);
    if (diff === 0) return '就是今天复诊，别忘了带资料！';
    if (diff < 0) return '复诊日期已过 ' + (-diff) + ' 天。';
    return '距离复诊还有 ' + diff + ' 天，将在提前 ' + (days || 0) + ' 天内于首页提示。';
  }

  function persistSettings(ns, done) {
    ns.updatedAt = Date.now();
    DB.put('settings', ns).then(function () {
      return SL.App.reloadState();
    }).then(function () {
      SL.App.refresh();
      done && done();
    });
  }

  /* ---------------- 备份 / 恢复 / 重置 ---------------- */
  function exportBackup() {
    Promise.all([
      DB.all('glucoseRecords'), DB.all('mealRecords'), DB.all('medicationRecords'),
      DB.all('exerciseRecords'), DB.all('foods'),
      DB.get('profiles', 'me'), DB.get('settings', 'default')
    ]).then(function (res) {
      var payload = {
        app: 'SugarLog',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          glucoseRecords: res[0], mealRecords: res[1], medicationRecords: res[2],
          exerciseRecords: res[3], foods: res[4],
          profiles: res[5] ? [res[5]] : [],
          settings: res[6] ? [res[6]] : []
        }
      };
      SL.UI.download('SugarLog备份_' + U.fmtDate(Date.now()) + '.json',
        JSON.stringify(payload, null, 2), 'application/json');
      toast('备份文件已下载 ✓', 'ok');
    });
  }

  function importBackup() {
    SL.UI.openTextFile('.json,application/json').then(function (file) {
      if (!file) return;
      var payload;
      try {
        payload = JSON.parse(file.text);
        if (!payload || payload.app !== 'SugarLog' || !payload.data) throw new Error('格式不符');
      } catch (e) {
        toast('不是有效的 SugarLog 备份文件', 'err');
        return;
      }
      SL.UI.confirm({
        title: '从备份恢复数据？',
        message: '将把备份文件中的记录写入本机；相同 ID 的记录会被覆盖，不影响备份中没有的记录。',
        okText: '开始恢复'
      }).then(function (ok) {
        if (!ok) return;
        var d = payload.data;
        var tasks = [];
        ['glucoseRecords', 'mealRecords', 'medicationRecords', 'exerciseRecords', 'foods'].forEach(function (store) {
          if (Array.isArray(d[store]) && d[store].length) tasks.push(DB.bulkPut(store, d[store]));
        });
        if (Array.isArray(d.profiles)) d.profiles.forEach(function (p) { tasks.push(DB.put('profiles', p)); });
        if (Array.isArray(d.settings)) d.settings.forEach(function (s2) { tasks.push(DB.put('settings', s2)); });
        Promise.all(tasks).then(function () {
          toast('恢复完成 ✓', 'ok');
          return SL.App.reloadState();
        }).then(function () { SL.App.refresh(); });
      });
    });
  }

  function resetAll() {
    SL.UI.confirm({
      title: '清空全部数据？',
      message: '将删除所有血糖、饮食、用药、运动记录、自定义食物以及个人资料和设置，并恢复初始状态。',
      detail: '此操作不可撤销，建议先备份。',
      okText: '我已备份，确认清空', danger: true
    }).then(function (ok) {
      if (!ok) return;
      Promise.all([
        DB.clear('glucoseRecords'), DB.clear('mealRecords'),
        DB.clear('medicationRecords'), DB.clear('exerciseRecords'),
        DB.clear('foods'), DB.clear('profiles'), DB.clear('settings')
      ]).then(function () {
        return DB.seed();
      }).then(function () {
        toast('已重置为初始状态');
        return SL.App.reloadState();
      }).then(function () {
        location.hash = '#/dashboard';
        SL.App.refresh();
      });
    });
  }

  /* ---------------- 首次使用向导 ---------------- */
  Views.settings.openProfileWizard = function (silent) {
    var p = SL.App.profile || DB.defaultProfile();
    var s = SL.App.settings || DB.defaultSettings();
    var nickI = h('input.input', { value: p.nickname || '', placeholder: '怎么称呼您（可不填）', maxlength: 16 });
    var typeSel = SL.UI.selectInput([
      { value: '', label: '请选择（可稍后在设置中修改）' },
      { value: 'type1', label: '1 型糖尿病' },
      { value: 'type2', label: '2 型糖尿病' },
      { value: 'gdm', label: '妊娠期糖尿病' },
      { value: 'other', label: '其他类型 / 待定' }
    ], p.diabetesType || '');
    var unitSeg = h('.seg', {},
      h('button', { class: s.unit === 'mmol' ? 'on' : '', id: 'wz-unit-mmol' }, 'mmol/L'),
      h('button', { class: s.unit === 'mgdl' ? 'on' : '', id: 'wz-unit-mgdl' }, 'mg/dL')
    );
    var chosenUnit = s.unit;
    unitSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      chosenUnit = b.id === 'wz-unit-mgdl' ? 'mgdl' : 'mmol';
      unitSeg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    });

    var modal = SL.UI.openModal({
      title: '欢迎使用 SugarLog 控糖日记 👋',
      content: h('div', {},
        h('p', { style: 'margin-top:0' }, '先用 1 分钟完成基础设置（随时可在「设置」中修改）：'),
        field('昵称', nickI),
        field('糖尿病类型', typeSel),
        field('血糖单位', unitSeg),
        h('.alert-banner.info', { style: 'margin-bottom:0' },
          h('span.a-ico', {}, '💡'),
          h('div.small', {}, '默认目标采用常用标准：空腹 4.4~7.0、餐后 < 10.0 mmol/L。如医生给了您个体化目标，请稍后在「设置 → 目标范围」中调整。'))
      )
    });
    modal.body.appendChild(h('.modal-foot', {},
      h('button.btn.ghost', { onClick: function () { modal.close(); } }, '稍后再说'),
      h('button.btn', {
        onClick: function () {
          var np = Object.assign({}, p, {
            nickname: nickI.value.trim(),
            diabetesType: typeSel.value
          });
          var ns = Object.assign({}, s, { unit: chosenUnit });
          Promise.all([DB.put('profiles', np), DB.put('settings', ns)]).then(function () {
            modal.close();
            toast('设置完成，开始记录吧 ✓', 'ok');
            return SL.App.reloadState();
          }).then(function () { SL.App.refresh(); });
        }
      }, '开始使用')
    ));
  };
})(window);
