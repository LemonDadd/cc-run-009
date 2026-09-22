/* views/medication.js — 用药记录：口服药/胰岛素、剂量时间、每日提醒、用药清单导出 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, toast, confirmDialog, download } = App;
  const U = Utils;
  const D = MedData;

  let filterDays = 7;

  async function mount(root) {
    root.innerHTML = '';
    const head = el('section', { class: 'card' });
    head.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2 class="card-title" style="margin:0">💊 用药记录</h2>
        <button class="btn btn-sm" id="addD"><svg class="icon"><use href="#i-plus"/></svg>记一次用药</button>
      </div>
      <div class="seg" id="daySeg" style="margin-top:12px">
        <button class="seg-item ${filterDays === 7 ? 'active' : ''}" data-d="7">近7天</button>
        <button class="seg-item ${filterDays === 30 ? 'active' : ''}" data-d="30">近30天</button>
        <button class="seg-item ${filterDays === 0 ? 'active' : ''}" data-d="0">全部</button>
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn btn-sm btn-secondary" id="exportList"><svg class="icon"><use href="#i-download"/></svg>导出用药清单(CSV)</button>
        <a class="btn btn-sm btn-secondary" href="#/reminders"><svg class="icon"><use href="#i-clock"/></svg>提醒管理</a>
      </div>
      <p class="muted small" style="margin:10px 0 0">用药提醒按本机时间弹通知；请严格遵医嘱，不自行停药或调量。</p>`;
    root.appendChild(head);
    head.querySelector('#addD').onclick = () => openForm(null, root);
    head.querySelector('#exportList').onclick = exportMedicationList;
    head.querySelectorAll('#daySeg button').forEach(b => {
      b.onclick = () => { filterDays = Number(b.dataset.d); mount(root); };
    });

    const records = (await DB.Medication.all()).sort((a, b) => b.at - a.at);
    const list = filterDays > 0
      ? records.filter(r => r.at >= U.startOfDay(U.addDays(new Date(), -(filterDays - 1))).getTime())
      : records;

    if (!list.length) {
      const c = el('section', { class: 'card empty' });
      c.innerHTML = `<svg class="icon"><use href="#i-pill"/></svg><p><strong>还没有用药记录</strong></p><p>记录口服药或胰岛素的剂量与时间，可设置每日提醒</p>`;
      c.appendChild(el('button', { class: 'btn', onclick: () => openForm(null, root), text: '记录用药' }));
      root.appendChild(c);
      return;
    }

    const groups = {};
    list.forEach(r => {
      const d = U.ymd(new Date(r.at));
      (groups[d] = groups[d] || []).push(r);
    });
    Object.entries(groups).forEach(([day, arr]) => {
      const card = el('section', { class: 'card' });
      card.appendChild(el('h2', { class: 'card-title', text: U.friendlyDate(day) }));
      arr.forEach(m => card.appendChild(medRow(m, root)));
      root.appendChild(card);
    });
  }

  function medRow(m, root) {
    const isInsulin = m.medType === 'insulin';
    return el('div', { class: 'record' }, [
      el('div', { class: 'record-icon', style: isInsulin
        ? 'background:#ede9fe;color:#6d28d9' : 'background:#f3e8ff;color:#7e22ce' }, [
        el('svg', { class: 'icon' }, [el('use', { href: '#i-pill' })])
      ]),
      el('div', { class: 'record-main' }, [
        el('div', { class: 'record-title',
          text: `${m.name} ${m.dose}${m.unit || (isInsulin ? 'U' : 'mg')}` }),
        el('div', { class: 'record-sub',
          text: `${D.MED_TYPE_LABELS[m.medType] || '药物'}${m.schedule ? ' · ' + m.schedule : ''}${m.note ? ' · ' + m.note : ''}` })
      ]),
      el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:6px' }, [
        el('span', { class: 'record-time', text: U.hm(new Date(m.at)) }),
        el('div', { class: 'record-actions' }, [
          rowAction('#i-edit', '编辑', () => openForm(m, root)),
          rowAction('#i-trash', '删除', async () => {
            if (await confirmDialog('确定删除这条用药记录吗？', { danger: true, okText: '删除' })) {
              await DB.Medication.remove(m.id); toast('已删除'); mount(root);
            }
          })
        ])
      ])
    ]);
  }

  function rowAction(icon, label, fn) {
    return el('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick: fn }, [
      el('svg', { class: 'icon' }, [el('use', { href: icon })])
    ]);
  }

  function openForm(record, root) {
    const editing = !!record;
    const now = record ? new Date(record.at) : new Date();
    const draft = {
      id: record ? record.id : null,
      name: record ? record.name : '',
      medType: record ? record.medType : 'oral',
      dose: record ? String(record.dose) : '',
      unit: record ? (record.unit || 'mg') : 'mg',
      schedule: record ? (record.schedule || '') : '',
      at: record ? record.at : Date.now(),
      note: record ? (record.note || '') : '',
      remind: false,
      remindTime: '08:00'
    };

    App.openModal(`
      <div class="modal-head"><h2 class="modal-title">${editing ? '编辑用药记录' : '记一次用药'}</h2></div>
      <div id="medBody"></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="medCancel">取消</button>
        <button class="btn" id="medOk">${editing ? '保存修改' : '保存记录'}</button>
      </div>`);
    $('#medCancel').onclick = () => App.closeModal();
    $('#medOk').onclick = save;
    render();

    function render() {
      const body = $('#medBody');
      body.innerHTML = `
        <label class="field"><span>药物类型</span>
          <div class="seg" id="typeSeg">
            <button type="button" class="seg-item ${draft.medType === 'oral' ? 'active' : ''}" data-t="oral">口服药</button>
            <button type="button" class="seg-item ${draft.medType === 'insulin' ? 'active' : ''}" data-t="insulin">胰岛素</button>
          </div></label>
        <label class="field"><span>药物名称（可从常用药选择或直接输入）</span>
          <input type="text" id="medName" list="medList" placeholder="如 二甲双胍 / 门冬胰岛素" value="${esc(draft.name)}">
          <datalist id="medList">
            ${D.MED_SUGGESTIONS.map(s => `<option value="${esc(s.name)}" data-type="${s.type}" data-unit="${s.doseUnit}">${s.times.join(' / ')}</option>`).join('')}
          </datalist>
        </label>
        <div class="row" style="align-items:flex-end">
          <label class="field" style="flex:1"><span>剂量</span>
            <input type="number" id="medDose" min="0" step="0.5" value="${esc(draft.dose)}" inputmode="decimal"></label>
          <label class="field" style="width:120px"><span>单位</span>
            <select id="medUnit">
              <option value="mg" ${draft.unit === 'mg' ? 'selected' : ''}>mg</option>
              <option value="U" ${draft.unit === 'U' ? 'selected' : ''}>U（胰岛素单位）</option>
              <option value="片" ${draft.unit === '片' ? 'selected' : ''}>片</option>
              <option value="粒" ${draft.unit === '粒' ? 'selected' : ''}>粒</option>
              <option value="ml" ${draft.unit === 'ml' ? 'selected' : ''}>ml</option>
            </select></label>
        </div>
        <label class="field"><span>用药时间</span>
          <input type="datetime-local" id="medAt" value="${U.ymdhm(now)}"></label>
        <label class="field"><span>用药时机（可选）</span>
          <input type="text" id="medSchedule" placeholder="如 早餐后 / 三餐前15分钟 / 睡前" value="${esc(draft.schedule)}"></label>
        <label class="field"><span>备注（可选）</span>
          <textarea id="medNote" placeholder="如 注射部位腹部、漏服等">${esc(draft.note)}</textarea></label>
        <div class="switch-row">
          <div>
            <div class="sr-label">🔔 设为每日重复提醒</div>
            <div class="sr-hint">每天到指定时间提醒用药（可在提醒管理中修改）</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="medRemind" ${draft.remind ? 'checked' : ''}>
            <span class="track"></span>
          </label>
        </div>
        <label class="field" id="remindTimeWrap" style="${draft.remind ? '' : 'display:none'}">
          <span>每日提醒时间</span>
          <input type="time" id="medRemindTime" value="${draft.remindTime}">
        </label>`;

      body.querySelector('#typeSeg').addEventListener('click', e => {
        const b = e.target.closest('button[data-t]');
        if (!b) return;
        draft.medType = b.dataset.t;
        draft.unit = draft.medType === 'insulin' ? 'U' : 'mg';
        render();
      });
      const nameInput = body.querySelector('#medName');
      nameInput.addEventListener('change', () => {
        const hit = D.MED_SUGGESTIONS.find(s => s.name === nameInput.value);
        if (hit) {
          draft.medType = hit.type;
          draft.unit = hit.doseUnit;
          if (!draft.schedule) draft.schedule = hit.times[0];
          render();
        }
      });
      const remind = body.querySelector('#medRemind');
      remind.addEventListener('change', () => {
        draft.remind = remind.checked;
        body.querySelector('#remindTimeWrap').style.display = remind.checked ? '' : 'none';
      });
    }

    async function save() {
      const name = $('#medName').value.trim();
      const dose = Number($('#medDose').value);
      if (!name) return toast('请输入药物名称');
      if (!(dose > 0)) return toast('请输入剂量');
      const atTs = new Date($('#medAt').value).getTime();
      const doRemind = $('#medRemind').checked;
      const remindTime = $('#medRemindTime') ? $('#medRemindTime').value : '08:00';

      await DB.Medication.save({
        id: draft.id || undefined,
        name, medType: draft.medType, dose,
        unit: $('#medUnit').value,
        schedule: $('#medSchedule').value.trim(),
        at: atTs, note: $('#medNote').value.trim()
      });

      if (doRemind) {
        // 同名药只保留一条每日提醒（更新）
        const existing = (await DB.Reminders.all())
          .find(r => r.kind === 'medication' && r.title.includes(name) && r.repeat === 'daily');
        const [hh, mm] = remindTime.split(':').map(Number);
        const d0 = new Date(); d0.setHours(hh, mm || 0, 0, 0);
        let at = d0.getTime();
        if (at < Date.now()) at += U.DAY_MS;
        await DB.Reminders.save({
          id: existing ? existing.id : undefined,
          kind: 'medication', repeat: 'daily',
          title: `该用药了：${name} ${dose}${$('#medUnit').value}`,
          note: $('#medSchedule').value.trim(),
          at, enabled: true
        });
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      }

      App.closeModal();
      toast(doRemind ? '用药已记录，每日提醒已开启 🔔' : (editing ? '已保存修改' : '用药已记录 ✓'));
      mount(root || $('#view'));
    }
  }

  // ---------- 用药清单导出（CSV，供医生/药师查看） ----------
  async function exportMedicationList() {
    const records = await DB.Medication.all();
    if (!records.length) return toast('暂无用药记录可导出');
    // 聚合：同名+同类型取近期剂量与频次
    const map = new Map();
    records.sort((a, b) => b.at - a.at).forEach(r => {
      const key = r.name + '|' + r.medType;
      if (!map.has(key)) {
        map.set(key, {
          name: r.name,
          type: D.MED_TYPE_LABELS[r.medType] || r.medType,
          dose: `${r.dose}${r.unit || ''}`,
          schedule: r.schedule || '',
          first: U.ymd(new Date(r.at)),
          count: 0
        });
      }
      map.get(key).count++;
      const cur = map.get(key);
      if (!cur.first) cur.first = U.ymd(new Date(r.at));
    });
    const oldest = U.ymd(new Date(Math.min(...records.map(r => r.at))));
    const latest = U.ymd(new Date(Math.max(...records.map(r => r.at))));
    const rows = [
      ['SugarLog 用药清单'],
      [`导出时间,${new Date().toLocaleString('zh-CN')}`],
      [`记录区间,${oldest} 至 ${latest}`],
      [],
      ['药物名称', '类型', '近期剂量', '用药时机', '记录次数', '首次记录']
    ];
    [...map.values()].forEach(v => {
      rows.push([v.name, v.type, v.dose, v.schedule || '—', String(v.count), v.first]);
    });
    const csv = '﻿' + rows.map(r => r.map(c =>
      `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`SugarLog用药清单_${U.ymd(new Date())}.csv`, csv, 'text/csv');
    toast('用药清单已导出');
  }

  Views.medication = { mount, openForm: (r, root) => openForm(r, root || $('#view')) };
})();
