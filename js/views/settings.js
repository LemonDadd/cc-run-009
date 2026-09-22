/* views/settings.js — 个人资料 / 单位 / 目标范围 / 阈值 / 提醒管理 / 食物库 / 数据备份 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, toast, confirmDialog, download } = App;
  const U = Utils;

  async function mount(root, params) {
    const hash = location.hash.replace(/^#/, '');
    if (hash === '/reminders') return remindersPage(root);
    return settingsPage(root);
  }

  // ============================================================
  // 设置主页
  // ============================================================
  async function settingsPage(root) {
    root.innerHTML = '';
    const p = await DB.Profile.get();
    const s = await DB.Settings.get();

    // ---------- 个人资料 ----------
    const profileCard = el('section', { class: 'card' });
    profileCard.innerHTML = `
      <h2 class="card-title">👤 个人资料</h2>
      <div class="grid grid-2">
        <label class="field"><span>昵称</span>
          <input type="text" id="pfName" value="${esc(p.name || '')}" placeholder="怎么称呼您"></label>
        <label class="field"><span>生日</span>
          <input type="date" id="pfBirthday" value="${esc(p.birthday || '')}"></label>
      </div>
      <div class="grid grid-2">
        <label class="field"><span>糖尿病类型</span>
          <select id="pfType">
            ${[['type1', '1型糖尿病'], ['type2', '2型糖尿病'], ['gdm', '妊娠糖尿病'], ['other', '其他/糖耐量异常']]
              .map(([v, t]) => `<option value="${v}" ${p.diabetesType === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
        <label class="field"><span>诊断年份</span>
          <input type="number" id="pfYear" min="1950" max="2099" value="${esc(p.diagnosisYear || '')}" placeholder="如 2021"></label>
      </div>
      <button class="btn" id="pfSave">保存个人资料</button>`;
    root.appendChild(profileCard);
    profileCard.querySelector('#pfSave').onclick = async () => {
      await DB.Profile.save({
        name: profileCard.querySelector('#pfName').value.trim(),
        birthday: profileCard.querySelector('#pfBirthday').value,
        diabetesType: profileCard.querySelector('#pfType').value,
        diagnosisYear: profileCard.querySelector('#pfYear').value,
        targetNote: p.targetNote || ''
      });
      await App.reloadProfile();
      toast('个人资料已保存');
    };

    // ---------- 单位与目标 ----------
    const targetCard = el('section', { class: 'card' });
    targetCard.innerHTML = `
      <h2 class="card-title">🎯 单位与血糖目标</h2>
      <label class="field"><span>血糖单位</span>
        <div class="seg" id="unitSeg">
          <button type="button" class="seg-item ${s.unit === 'mmol/L' ? 'active' : ''}" data-u="mmol/L">mmol/L</button>
          <button type="button" class="seg-item ${s.unit === 'mg/dL' ? 'active' : ''}" data-u="mg/dL">mg/dL</button>
        </div></label>
      <p class="muted small">各时段目标范围（mmol/L，按医生建议调整；判色与达标率均以此为准）：</p>
      <div class="grid grid-3" id="targetGrid"></div>
      <div class="grid grid-2" style="margin-top:10px">
        <label class="field"><span>低血糖预警阈值（mmol/L）</span>
          <input type="number" id="setHypo" min="2.5" max="5" step="0.1" value="${s.hypoThreshold}"></label>
        <label class="field"><span>危险高血糖阈值（mmol/L）</span>
          <input type="number" id="setDanger" min="11" max="30" step="0.1" value="${s.dangerHigh}"></label>
      </div>
      <div class="row">
        <button class="btn" id="tgtSave">保存目标设置</button>
        <button class="btn btn-secondary" id="tgtReset">恢复默认目标</button>
      </div>`;
    root.appendChild(targetCard);

    const grid = targetCard.querySelector('#targetGrid');
    Object.entries(U.CONTEXT_LABELS).forEach(([k, label]) => {
      const t = s.targets[k] || U.DEFAULT_TARGETS[k] || U.DEFAULT_TARGETS.random;
      grid.appendChild(el('div', { class: 'kv', style: 'padding:12px 14px' }, [
        el('div', { class: 'k', text: label }),
        el('div', { class: 'range-row', style: 'margin-top:6px' }, [
          el('input', { type: 'number', step: '0.1', id: `t_${k}_lo`, value: String(t.low),
            'aria-label': `${label}下限` }),
          el('span', { text: '~' }),
          el('input', { type: 'number', step: '0.1', id: `t_${k}_hi`, value: String(t.high),
            'aria-label': `${label}上限` })
        ])
      ]));
    });
    targetCard.querySelectorAll('#unitSeg button').forEach(b => b.onclick = () => {
      s.unit = b.dataset.u;
      targetCard.querySelectorAll('#unitSeg button').forEach(x =>
        x.classList.toggle('active', x === b));
    });
    targetCard.querySelector('#tgtSave').onclick = async () => {
      const targets = {};
      for (const k of Object.keys(U.CONTEXT_LABELS)) {
        const lo = Number(targetCard.querySelector(`#t_${k}_lo`).value);
        const hi = Number(targetCard.querySelector(`#t_${k}_hi`).value);
        if (!(lo >= 0 && hi > lo)) return toast(`${U.CONTEXT_LABELS[k]} 目标范围不正确（下限需小于上限）`);
        targets[k] = { low: lo, high: hi };
      }
      const hypo = Number(targetCard.querySelector('#setHypo').value);
      const danger = Number(targetCard.querySelector('#setDanger').value);
      if (!(hypo > 2 && hypo < 6)) return toast('低血糖阈值需在 2.5~5 之间');
      if (!(danger >= 10 && danger <= 30)) return toast('危险高血糖阈值需在 11~30 之间');
      await DB.Settings.save(Object.assign({}, s, {
        unit: s.unit, targets, hypoThreshold: hypo, dangerHigh: danger
      }));
      await App.reloadSettings();
      toast('目标设置已保存');
    };
    targetCard.querySelector('#tgtReset').onclick = async () => {
      if (!await confirmDialog('恢复为一般成人默认目标（空腹4.4~7.0，餐后<10.0）？', { okText: '恢复默认' })) return;
      const fresh = await DB.Settings.get();
      await DB.Settings.save(Object.assign(fresh, {
        targets: JSON.parse(JSON.stringify(U.DEFAULT_TARGETS)),
        hypoThreshold: U.HYPO_THRESHOLD, dangerHigh: U.DANGER_HIGH
      }));
      await App.reloadSettings();
      settingsPage(root);
      toast('已恢复默认');
    };

    // ---------- 提醒开关 ----------
    const remindCard = el('section', { class: 'card' });
    remindCard.innerHTML = `
      <h2 class="card-title">🔔 提醒</h2>
      ${switchRowHTML('swGlucose', '血糖测量提醒', '每日定时提醒测量血糖', s.reminders.glucose)}
      ${switchRowHTML('swMed', '用药提醒', '在用药记录中设置的每日提醒', s.reminders.medication)}
      ${switchRowHTML('swFollow', '复诊提醒', '设置的复诊日期到期提醒', s.reminders.followup)}
      <div class="row" style="margin-top:8px">
        <a class="btn btn-secondary" href="#/reminders"><svg class="icon"><use href="#i-clock"/></svg>管理提醒与复诊日期</a>
        <button class="btn btn-secondary" id="askNotif">开启系统通知权限</button>
      </div>`;
    root.appendChild(remindCard);
    remindCard.querySelector('#swGlucose').querySelector('input').onchange = async e => {
      s.reminders.glucose = e.target.checked; await DB.Settings.save(s);
      if (e.target.checked) ensureDefaultGlucoseReminder();
      toast(e.target.checked ? '血糖测量提醒已开启' : '已关闭');
    };
    remindCard.querySelector('#swMed').querySelector('input').onchange = async e => {
      s.reminders.medication = e.target.checked; await DB.Settings.save(s);
      toast(e.target.checked ? '用药提醒已开启' : '已关闭');
    };
    remindCard.querySelector('#swFollow').querySelector('input').onchange = async e => {
      s.reminders.followup = e.target.checked; await DB.Settings.save(s);
      toast(e.target.checked ? '复诊提醒已开启' : '已关闭');
    };
    remindCard.querySelector('#askNotif').onclick = async () => {
      if (!('Notification' in window)) return toast('当前环境不支持系统通知，应用内提醒仍可用');
      const r = await Notification.requestPermission();
      toast(r === 'granted' ? '系统通知已授权 ✓' : '未授权，将仅在应用打开时弹窗提醒');
    };

    // ---------- 食物库 ----------
    const foodCard = el('section', { class: 'card' });
    foodCard.innerHTML = `
      <h2 class="card-title">🥦 食物库</h2>
      <p class="muted small" style="margin-top:0">内置 ${window.BuiltinFoods.length} 种常见食物；你添加的自定义食物也保存在本地。</p>
      <div class="row">
        <button class="btn btn-secondary" id="manageFoods"><svg class="icon"><use href="#i-utensils"/></svg>管理自定义食物</button>
      </div>`;
    root.appendChild(foodCard);
    foodCard.querySelector('#manageFoods').onclick = () => manageFoodsDialog();

    // ---------- 数据 ----------
    const dataCard = el('section', { class: 'card' });
    dataCard.innerHTML = `
      <h2 class="card-title">💾 数据与备份</h2>
      <p class="muted small" style="margin-top:0">所有记录仅保存在本机 IndexedDB 中，不上传云端。换机或清理浏览器数据前请先导出备份。</p>
      <div class="row">
        <button class="btn" id="exportData"><svg class="icon"><use href="#i-download"/></svg>导出全部数据(JSON备份)</button>
        <button class="btn btn-secondary" id="importData">导入备份</button>
        <button class="btn btn-danger" id="wipeData">清空全部数据</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>`;
    root.appendChild(dataCard);
    dataCard.querySelector('#exportData').onclick = async () => {
      const data = await DB.exportAll();
      download(`SugarLog备份_${U.ymd(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('备份已导出');
    };
    dataCard.querySelector('#importData').onclick = () => dataCard.querySelector('#importFile').click();
    dataCard.querySelector('#importFile').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        const ok = await confirmDialog('导入将与本机数据合并（相同ID覆盖）。确定继续？', { okText: '开始导入' });
        if (!ok) return;
        await DB.importAll(json, 'merge');
        await App.reloadSettings(); await App.reloadProfile();
        toast('导入完成 ✓');
        location.hash = '#/home';
      } catch (err) {
        toast('导入失败：' + err.message);
      }
    };
    dataCard.querySelector('#wipeData').onclick = async () => {
      const ok = await confirmDialog('将删除全部血糖、饮食、用药、运动、食物与设置数据，且不可恢复！建议先导出备份。',
        { danger: true, okText: '我已备份，全部清空' });
      if (!ok) return;
      indexedDB.deleteDatabase('sugarlog');
      toast('数据已清空，即将刷新…');
      setTimeout(() => location.reload(), 1200);
    };

    // ---------- 关于 ----------
    root.appendChild(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'ℹ️ 关于 SugarLog' }),
      el('p', { class: 'small muted',
        text: 'SugarLog 控糖日记 · 本地优先的血糖记录、饮食分析、用药提醒与趋势报告工具。' +
              '内置 GI 食物库与糖尿病知识规则，数据不出本机。应用内分析仅供自我管理参考，不替代医疗诊断。' })
    ]));
  }

  function switchRowHTML(id, label, hint, checked) {
    return `
      <div class="switch-row" id="${id}">
        <div>
          <div class="sr-label">${esc(label)}</div>
          <div class="sr-hint">${esc(hint)}</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="track"></span>
        </label>
      </div>`;
  }

  async function ensureDefaultGlucoseReminder() {
    const all = await DB.Reminders.all();
    if (!all.some(r => r.kind === 'glucose' && r.repeat === 'daily')) {
      const d = new Date();
      d.setHours(7, 30, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      await DB.Reminders.save({
        kind: 'glucose', repeat: 'daily',
        title: '该测空腹血糖啦', note: '起床后测量并记录空腹血糖',
        at: d.getTime(), enabled: true
      });
    }
  }

  // ============================================================
  // 食物库管理
  // ============================================================
  async function manageFoodsDialog() {
    const foods = (await DB.Foods.all()).filter(f => !f.builtin);
    const modal = App.openModal(`
      <div class="modal-head"><h2 class="modal-title">管理自定义食物</h2></div>
      <div id="foodMgr"></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="fmClose">关闭</button>
        <button class="btn" id="fmAdd">+ 添加食物</button>
      </div>`);
    const box = modal.querySelector('#foodMgr');

    function render() {
      box.innerHTML = '';
      if (!foods.length) {
        box.appendChild(el('p', { class: 'muted', text: '还没有自定义食物。可在"记一餐"时搜索后添加，或点击下方按钮直接添加。' }));
        return;
      }
      foods.forEach(f => box.appendChild(el('div', { class: 'record' }, [
        el('div', { class: 'record-main' }, [
          el('div', { class: 'record-title', text: f.name }),
          el('div', { class: 'record-sub',
            text: `${f.category || ''} · GI ${f.gi} · 碳水 ${f.carbs}g/100g · 默认${f.defaultPortion || 100}g` })
        ]),
        el('button', { class: 'icon-btn', 'aria-label': '删除', onclick: async () => {
          if (await confirmDialog(`删除自定义食物「${f.name}」？不影响历史记录。`, { danger: true, okText: '删除' })) {
            await DB.Foods.remove(f.id);
            foods.splice(foods.indexOf(f), 1);
            toast('已删除'); render();
          }
        } }, [el('svg', { class: 'icon' }, [el('use', { href: '#i-trash' })])])
      ])));
    }
    render();
    modal.querySelector('#fmClose').onclick = () => App.closeModal();
    modal.querySelector('#fmAdd').onclick = () => foodEditor(null, async (food) => {
      const saved = await DB.Foods.save(Object.assign({ builtin: false, category: '自定义' }, food));
      foods.push(saved); render();
    });
  }

  function foodEditor(prefill, onSave) {
    const f = prefill || { name: '', gi: '', carbs: '', defaultPortion: 100 };
    App.openModal(`
      <div class="modal-head">
        <button class="icon-btn" id="feBack" aria-label="返回"><svg class="icon"><use href="#i-back"/></svg></button>
        <h2 class="modal-title">${prefill ? '编辑食物' : '添加食物'}</h2>
      </div>
      <label class="field"><span>名称</span><input type="text" id="feName" value="${esc(f.name)}"></label>
      <div class="grid grid-2">
        <label class="field"><span>GI（0~100）</span><input type="number" id="feGI" min="0" max="100" value="${f.gi}"></label>
        <label class="field"><span>碳水（g/100g）</span><input type="number" id="feCarbs" min="0" step="0.1" value="${f.carbs}"></label>
      </div>
      <label class="field"><span>参考份量（g）</span><input type="number" id="fePortion" min="1" value="${f.defaultPortion}"></label>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="feCancel">取消</button>
        <button class="btn" id="feOk">保存</button>
      </div>`);
    $('#feCancel').onclick = () => App.closeModal();
    $('#feBack').onclick = () => App.closeModal();
    $('#feOk').onclick = () => {
      const name = $('#feName').value.trim();
      const gi = Number($('#feGI').value);
      const carbs = Number($('#feCarbs').value);
      const defaultPortion = Number($('#fePortion').value);
      if (!name) return toast('请输入名称');
      if (!(gi >= 0 && gi <= 100)) return toast('GI 应在 0~100');
      if (!(carbs >= 0)) return toast('碳水需为非负数');
      if (!(defaultPortion > 0)) return toast('参考份量需大于 0');
      App.closeModal();
      onSave({ name, gi, carbs, defaultPortion });
    };
  }

  // ============================================================
  // 提醒管理
  // ============================================================
  async function remindersPage(root) {
    root.innerHTML = '';
    const s = await DB.Settings.get();

    const head = el('section', { class: 'card' });
    head.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2 class="card-title" style="margin:0">🔔 提醒管理</h2>
        <div class="row" style="gap:6px">
          <button class="btn btn-sm btn-secondary" id="addFollow"><svg class="icon"><use href="#i-calendar"/></svg>添加复诊提醒</button>
          <button class="btn btn-sm btn-secondary" id="addGlucose"><svg class="icon"><use href="#i-droplet"/></svg>测量提醒</button>
        </div>
      </div>
      <p class="muted small" style="margin-bottom:0">应用打开时会自动检查到期提醒并弹窗；已授权系统通知时还会发送系统通知。每日用药提醒请在"用药记录"中随记录一起设置。</p>`;
    root.appendChild(head);
    head.querySelector('#addFollow').onclick = () => reminderEditor(null, 'followup', refresh);
    head.querySelector('#addGlucose').onclick = () => reminderEditor(null, 'glucose', refresh);

    const listCard = el('section', { class: 'card' });
    root.appendChild(listCard);

    async function refresh() {
      const reminders = (await DB.Reminders.all()).sort((a, b) => a.at - b.at);
      listCard.innerHTML = `<h2 class="card-title">全部提醒（${reminders.length}）</h2>`;
      if (!reminders.length) {
        listCard.appendChild(el('div', { class: 'empty' }, [
          el('p', { html: '<strong>暂无提醒</strong>' }),
          el('p', { class: 'small muted', text: '可以添加复诊日期，或在记录用药时开启每日提醒。' })
        ]));
        return;
      }
      reminders.forEach(r => listCard.appendChild(reminderRow(r, refresh)));
    }
    refresh();
  }

  function reminderRow(r, refresh) {
    const iconMap = { medication: ['#i-pill', '#ede9fe', '#6d28d9'],
      glucose: ['#i-droplet', '#ccfbf1', '#0f766e'], followup: ['#i-calendar', '#dbeafe', '#1d4ed8'] };
    const [icon, bg, fg] = iconMap[r.kind] || iconMap.glucose;
    const repeatLabel = { once: '单次', daily: '每日' }[r.repeat] || '单次';
    const expired = r.at < Date.now() && r.repeat === 'once';
    return el('div', { class: 'record' }, [
      el('div', { class: 'record-icon', style: `background:${bg};color:${fg}` }, [
        el('svg', { class: 'icon' }, [el('use', { href: icon })])
      ]),
      el('div', { class: 'record-main' }, [
        el('div', { class: 'record-title' }, [
          document.createTextNode(r.title),
          el('span', { class: 'badge', style: 'margin-left:8px;background:#f1f5f9;color:#475569', text: repeatLabel })
        ]),
        el('div', { class: 'record-sub',
          text: `${U.friendlyDateTime(r.at)}${expired ? '（已到期）' : ' · ' + U.relativeFromNow(r.at)}${r.note ? ' · ' + r.note : ''}` })
      ]),
      el('label', { class: 'switch', style: 'margin-right:6px' }, [
        (() => {
          const inp = el('input', { type: 'checkbox' });
          inp.checked = r.enabled;
          inp.onchange = async () => {
            r.enabled = inp.checked;
            if (r.enabled && r.repeat === 'daily' && r.at < Date.now()) {
              const d = new Date(r.at);
              while (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
              r.at = d.getTime();
            }
            await DB.Reminders.save(r);
            toast(r.enabled ? '提醒已启用' : '提醒已关闭');
            refresh();
          };
          return inp;
        })(),
        el('span', { class: 'track' })
      ]),
      el('div', { class: 'record-actions' }, [
        el('button', { class: 'icon-btn', 'aria-label': '编辑',
          onclick: () => reminderEditor(r, r.kind, refresh) }, [
          el('svg', { class: 'icon' }, [el('use', { href: '#i-edit' })])
        ]),
        el('button', { class: 'icon-btn', 'aria-label': '删除', onclick: async () => {
          if (await confirmDialog('删除这条提醒？', { danger: true, okText: '删除' })) {
            await DB.Reminders.remove(r.id); refresh(); toast('已删除');
          }
        } }, [el('svg', { class: 'icon' }, [el('use', { href: '#i-trash' })])])
      ])
    ]);
  }

  function reminderEditor(record, kind, onDone) {
    const editing = !!record;
    const isDaily = record ? record.repeat === 'daily' : (kind === 'medication');
    const d = record ? new Date(record.at) : new Date(Date.now() + 24 * 3600000);
    App.openModal(`
      <div class="modal-head"><h2 class="modal-title">${editing ? '编辑提醒' : '新增提醒'}</h2></div>
      <label class="field"><span>提醒内容</span>
        <input type="text" id="rmTitle" value="${esc(record ? record.title : (kind === 'followup' ? '复诊：内分泌科' : '测量血糖'))}"></label>
      <label class="field"><span>备注（可选）</span>
        <textarea id="rmNote" placeholder="如 带上血糖记录报告、空腹">${esc(record ? (record.note || '') : '')}</textarea></label>
      <label class="field"><span>${isDaily ? '每日提醒时间' : '提醒日期与时间'}</span>
        <input type="${isDaily ? 'time' : 'datetime-local'}" id="rmAt"
          value="${isDaily ? U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()) : U.ymdhm(d)}"></label>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="rmCancel">取消</button>
        <button class="btn" id="rmOk">${editing ? '保存' : '添加提醒'}</button>
      </div>`);
    $('#rmCancel').onclick = () => App.closeModal();
    $('#rmOk').onclick = async () => {
      const title = $('#rmTitle').value.trim();
      if (!title) return toast('请填写提醒内容');
      let at;
      if (isDaily) {
        const [hh, mm] = $('#rmAt').value.split(':').map(Number);
        const x = new Date(); x.setHours(hh, mm || 0, 0, 0);
        if (x.getTime() < Date.now()) x.setDate(x.getDate() + 1);
        at = x.getTime();
      } else {
        at = new Date($('#rmAt').value).getTime();
        if (!(at > 0)) return toast('请选择日期时间');
      }
      await DB.Reminders.save({
        id: record ? record.id : undefined,
        kind: record ? record.kind : kind,
        repeat: isDaily ? 'daily' : 'once',
        title, note: $('#rmNote').value.trim(),
        at, enabled: record ? record.enabled : true
      });
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      App.closeModal();
      toast('提醒已保存 🔔');
      onDone && onDone();
    };
  }

  Views.settings = { mount };
})();
