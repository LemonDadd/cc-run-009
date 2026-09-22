/* views/glucose.js — 血糖记录：快速录入（3步）+ 历史列表 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, evalG, badgeFor, toast, confirmDialog } = App;
  const U = Utils;

  let filterDays = 7;

  async function mount(root) {
    const settings = App.State.settings;
    const unit = settings.unit;

    root.innerHTML = '';
    const headCard = el('section', { class: 'card' });
    headCard.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2 class="card-title" style="margin:0">🩸 血糖记录</h2>
        <button class="btn btn-sm" data-add><svg class="icon"><use href="#i-plus"/></svg>记一次血糖</button>
      </div>
      <div class="seg" data-dayseg style="margin-top:12px">
        <button class="seg-item ${filterDays === 7 ? 'active' : ''}" data-d="7">近7天</button>
        <button class="seg-item ${filterDays === 30 ? 'active' : ''}" data-d="30">近30天</button>
        <button class="seg-item ${filterDays === 0 ? 'active' : ''}" data-d="0">全部</button>
      </div>
      <div class="legend-row small">
        <span class="badge bg-ok">达标 绿</span>
        <span class="badge bg-high">偏高 黄</span>
        <span class="badge bg-low">偏低/低血糖 蓝</span>
        <span class="badge bg-danger">危险 红</span>
      </div>`;
    root.appendChild(headCard);
    headCard.querySelector('[data-add]').addEventListener('click', () => openForm(null, root));
    headCard.querySelectorAll('[data-dayseg] button').forEach(b => {
      b.addEventListener('click', () => { filterDays = Number(b.dataset.d); mount(root); });
    });

    const all = await DB.Glucose.all();
    let records = all.sort((a, b) => b.at - a.at);
    if (filterDays > 0) {
      const cutoff = U.startOfDay(U.addDays(new Date(), -(filterDays - 1))).getTime();
      records = records.filter(r => r.at >= cutoff);
    }

    if (!records.length) {
      root.appendChild(emptyCard('还没有血糖记录', '点击"记一次血糖"，3 步即可完成'));
      return;
    }

    // 按日期分组
    const groups = {};
    records.forEach(r => {
      const d = U.ymd(new Date(r.at));
      (groups[d] = groups[d] || []).push(r);
    });

    Object.entries(groups).forEach(([day, list]) => {
      const dayVals = list.map(r => r.value);
      const stats = U.tirStats(list, App.currentTargets());
      const card = el('section', { class: 'card' });
      const avg = U.avg(dayVals);
      card.innerHTML = `
        <h2 class="card-title">
          ${esc(U.friendlyDate(day))}
          <span class="spacer"></span>
          <span class="muted small">平均 ${U.displayValue(U.round1(avg), unit)} · 达标率 ${Math.round(stats.okRate * 100)}%</span>
        </h2>`;
      list.sort((a, b) => b.at - a.at).forEach(r => card.appendChild(recordRow(r, unit, root)));
      root.appendChild(card);
    });
  }

  function segBtn() { return null; }

  function recordRow(r, unit, root) {
    const res = evalG(r.value, r.context);
    const cmap = { ok: 'g-ok', high: 'g-high', low: 'g-low', danger: 'g-danger' };
    const bgmap = { ok: 'bg-ok', high: 'bg-high', low: 'bg-low', danger: 'bg-danger' };
    const row = el('div', { class: 'record' }, [
      el('div', { class: `record-icon ${bgmap[res.status]}` }, [
        el('svg', { class: 'icon' }, [el('use', { href: '#i-droplet' })])
      ]),
      el('div', { class: 'record-main' }, [
        el('div', { class: 'record-title' }, [
          el('span', { class: `glucose-value ${cmap[res.status]}`, text: U.displayValue(r.value, unit) }),
          document.createTextNode(' ' + U.unitLabel(unit)),
          el('span', { class: 'muted small', style: 'margin-left:8px',
            text: U.CONTEXT_LABELS[r.context] || '' })
        ]),
        r.note ? el('div', { class: 'record-sub', text: r.note })
               : el('div', { class: 'record-sub muted', text: res.message })
      ]),
      el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:6px' }, [
        el('span', { class: 'record-time', text: U.hm(new Date(r.at)) }),
        el('div', { class: 'record-actions' }, [
          iconAction('#i-edit', '编辑', () => openForm(r, root)),
          iconAction('#i-trash', '删除', async () => {
            if (await confirmDialog('确定删除这条血糖记录吗？', { danger: true, okText: '删除' })) {
              await DB.Glucose.remove(r.id);
              toast('已删除');
              mount(root);
            }
          })
        ])
      ])
    ]);
    return row;
  }

  function iconAction(icon, label, fn) {
    const b = el('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick: fn }, [
      el('svg', { class: 'icon', style: 'font-size:20px' }, [el('use', { href: icon })])
    ]);
    return b;
  }

  function emptyCard(title, sub) {
    const c = el('section', { class: 'card empty' });
    c.innerHTML = `<svg class="icon"><use href="#i-droplet"/></svg><p><strong>${esc(title)}</strong></p><p>${esc(sub)}</p>`;
    c.appendChild(el('button', { class: 'btn', onclick: () => openForm(), text: '立即记录' }));
    return c;
  }

  // ---------- 3 步快速录入 ----------
  // 第1步：数值；第2步：时段；第3步：确认（时间/备注可选改）
  function openForm(record, root) {
    const unit = App.State.settings.unit;
    const editing = !!record;
    const now = record ? new Date(record.at) : new Date();
    const draft = {
      value: record ? U.fromMmol(record.value, unit) : '',
      context: record ? record.context : U.inferContext(now),
      at: record ? record.at : Date.now(),
      note: record ? (record.note || '') : '',
      id: record ? record.id : null
    };

    const modal = App.openModal(`
      <div class="modal-head">
        <h2 class="modal-title">${editing ? '编辑血糖记录' : '记一次血糖'}</h2>
      </div>
      <div id="stepBody"></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="gCancel">取消</button>
        <button class="btn" id="gNext">下一步</button>
      </div>
    `);
    $('#gCancel').onclick = () => App.closeModal();
    let step = 1;

    function renderStep() {
      const body = $('#stepBody');
      body.innerHTML = '';
      const footPrev = $('#gCancel');

      if (step === 1) {
        footPrev.textContent = '取消';
        $('#gNext').textContent = '下一步';
        body.appendChild(el('div', {}, [
          el('label', { class: 'field' }, [
            el('span', { text: `第 1 步 / 共 3 步：输入血糖值（${U.unitLabel(unit)}）` }),
            el('input', {
              type: 'number', id: 'gValue', inputmode: 'decimal', step: unit === 'mg/dL' ? '1' : '0.1',
              min: '0', max: unit === 'mg/dL' ? '600' : '33.3',
              placeholder: unit === 'mg/dL' ? '如 96' : '如 6.8',
              value: draft.value === '' ? '' : String(draft.value),
              autofocus: true
            }),
            el('div', { class: 'field-hint',
              text: `低血糖 < ${App.State.settings.hypoThreshold} mmol/L · 危险高血糖 ≥ ${App.State.settings.dangerHigh} mmol/L（数值自动按颜色判断）` })
          ]),
          el('div', { class: 'kv-list' },
            Object.entries({ fasting: '空腹', before_meal: '餐前', after_meal: '餐后2小时', bedtime: '睡前', night: '凌晨', random: '随机' })
              .map(([k, v]) => el('div', { class: 'kv' }, [
                el('div', { class: 'k', text: v }),
                el('div', { class: 'v small', text: `${App.State.settings.targets[k === 'random' ? 'random' : k].low}~${App.State.settings.targets[k === 'random' ? 'random' : k].high} mmol/L` })
              ])))
        ]));
        const input = $('#gValue');
        input.focus();
        input.select && input.select();
        input.addEventListener('input', () => { draft.value = input.value; });
      } else if (step === 2) {
        footPrev.textContent = '上一步';
        $('#gNext').textContent = '下一步';
        body.appendChild(el('div', {}, [
          el('label', { class: 'field' }, [
            el('span', { text: '第 2 步 / 共 3 步：这是什么时候测的？' }),
          ]),
          el('div', { class: 'seg', id: 'ctxSeg' },
            Object.entries(U.CONTEXT_LABELS).map(([k, v]) =>
              el('button', {
                type: 'button',
                class: 'seg-item' + (draft.context === k ? ' active' : ''),
                onclick: () => { draft.context = k; renderStep(); }
              }, [document.createTextNode(v)])))
        ]));
      } else {
        footPrev.textContent = '上一步';
        $('#gNext').textContent = editing ? '保存修改' : '保存记录';
        const mmol = U.toMmol(draft.value, unit);
        const res = evalG(mmol, draft.context);
        body.innerHTML = `
          <div style="text-align:center;padding:6px 0 12px">
            <div class="glucose-value" style="font-size:42px" id="confirmVal"></div>
            <div id="confirmBadge" style="margin-top:8px"></div>
            <p class="muted" id="confirmMsg" style="margin-top:8px"></p>
          </div>`;
        const valEl = $('#confirmVal');
        valEl.textContent = `${draft.value} ${U.unitLabel(unit)} · ${U.CONTEXT_LABELS[draft.context]}`;
        valEl.classList.add({ ok: 'g-ok', high: 'g-high', low: 'g-low', danger: 'g-danger' }[res.status]);
        $('#confirmBadge').innerHTML = badgeFor(res.status, res.label);
        $('#confirmMsg').textContent = res.message;

        body.appendChild(el('label', { class: 'field' }, [
          el('span', { text: '测量时间' }),
          el('input', { type: 'datetime-local', id: 'gAt', value: U.ymdhm(new Date(draft.at)) })
        ]));
        body.appendChild(el('label', { class: 'field' }, [
          el('span', { text: '备注（可选）：如 早餐后、感冒、加餐等' }),
          el('textarea', { id: 'gNote', placeholder: '例如：比平时多走了30分钟' }, [document.createTextNode(draft.note)])
        ]));
      }
    }

    modal.querySelector('#gNext').onclick = async () => {
      if (step === 1) {
        const v = Number(draft.value);
        if (!v || v <= 0) return toast('请输入有效的血糖值');
        if (unit === 'mg/dL' ? (v > 600) : (v > 34)) return toast('数值超出合理范围，请确认单位');
        step = 2;
      } else if (step === 2) {
        step = 3;
      } else {
        const atVal = $('#gAt') ? new Date($('#gAt').value).getTime() : draft.at;
        const note = $('#gNote') ? $('#gNote').value.trim() : draft.note;
        const mmol = U.round1(U.toMmol(Number(draft.value), unit) * 10) / 10;
        const rec = {
          id: draft.id || undefined,
          value: mmol, at: atVal || draft.at,
          context: draft.context, note
        };
        await DB.Glucose.save(rec);
        App.closeModal();
        toast(editing ? '已保存修改' : '血糖已记录 ✓');
        if (!editing) App.showGlucoseAlert(mmol, evalG(mmol, draft.context));
        if (root) mount(root);
        else if (location.hash === '#/home' || !location.hash) Views.home.mount($('#view'));
        return;
      }
      renderStep();
    };
    footStep(modal);
    renderStep();

    function footStep() {
      $('#gCancel').onclick = () => {
        if (step > 1) { step--; renderStep(); } else App.closeModal();
      };
    }
  }

  Views.glucose = { mount, openForm: (r, root) => openForm(r, root || $('#view')) };
})();
