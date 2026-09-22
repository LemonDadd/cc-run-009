/* views/exercise.js — 运动记录：类型/时长/强度，估算降糖影响 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, toast, confirmDialog } = App;
  const U = Utils;
  const D = MedData;

  let filterDays = 7;

  async function mount(root) {
    root.innerHTML = '';
    const head = el('section', { class: 'card' });
    head.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2 class="card-title" style="margin:0">🏃 运动记录</h2>
        <button class="btn btn-sm" id="addE"><svg class="icon"><use href="#i-plus"/></svg>记一次运动</button>
      </div>
      <div class="seg" id="daySeg" style="margin-top:12px">
        <button class="seg-item ${filterDays === 7 ? 'active' : ''}" data-d="7">近7天</button>
        <button class="seg-item ${filterDays === 30 ? 'active' : ''}" data-d="30">近30天</button>
        <button class="seg-item ${filterDays === 0 ? 'active' : ''}" data-d="0">全部</button>
      </div>
      <p class="muted small" style="margin:10px 0 0">推荐每周 ≥150 分钟中等强度有氧运动 + 每周 2~3 次力量训练；餐后 30~60 分钟运动较佳。</p>`;
    root.appendChild(head);
    head.querySelector('#addE').onclick = () => openForm(null, root);
    head.querySelectorAll('#daySeg button').forEach(b => {
      b.onclick = () => { filterDays = Number(b.dataset.d); mount(root); };
    });

    const records = (await DB.Exercise.all()).sort((a, b) => b.at - a.at);
    const list = filterDays > 0
      ? records.filter(r => r.at >= U.startOfDay(U.addDays(new Date(), -(filterDays - 1))).getTime())
      : records;

    if (!list.length) {
      const c = el('section', { class: 'card empty' });
      c.innerHTML = `<svg class="icon"><use href="#i-run"/></svg><p><strong>还没有运动记录</strong></p><p>记录运动类型和时长，估算对血糖的影响</p>`;
      c.appendChild(el('button', { class: 'btn', onclick: () => openForm(null, root), text: '记录运动' }));
      root.appendChild(c);
      return;
    }

    // 汇总
    const totalMin = list.reduce((s, r) => s + r.minutes, 0);
    const weekMin = records.filter(r => r.at >= U.startOfDay(U.addDays(new Date(), -6)).getTime())
      .reduce((s, r) => s + r.minutes, 0);
    root.appendChild(el('section', { class: 'grid grid-3' }, [
      stat('所选范围内运动', `${totalMin} 分钟`, `${list.length} 次`),
      stat('近7天运动时长', `${weekMin} 分钟`, weekMin >= 150 ? '已达每周150分钟 ✓' : `距推荐还差 ${Math.max(0, 150 - weekMin)} 分钟`),
      stat('估算累计降糖', `${U.round1(list.reduce((s, r) => s + (r.estDrop || 0), 0)).toFixed(1)} mmol/L`, '粗略估算，仅供参考')
    ]));

    const groups = {};
    list.forEach(r => {
      const d = U.ymd(new Date(r.at));
      (groups[d] = groups[d] || []).push(r);
    });
    Object.entries(groups).forEach(([day, arr]) => {
      const card = el('section', { class: 'card' });
      card.appendChild(el('h2', { class: 'card-title', text: U.friendlyDate(day) }));
      arr.forEach(ex => card.appendChild(exRow(ex, root)));
      root.appendChild(card);
    });
  }

  function stat(label, value, sub) {
    return el('div', { class: 'card stat-card' }, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value', text: value }),
      el('div', { class: 'stat-sub', text: sub })
    ]);
  }

  function exRow(x, root) {
    return el('div', { class: 'record' }, [
      el('div', { class: 'record-icon', style: 'background:#dbeafe;color:#1d4ed8' }, [
        el('svg', { class: 'icon' }, [el('use', { href: '#i-run' })])
      ]),
      el('div', { class: 'record-main' }, [
        el('div', { class: 'record-title',
          text: `${x.name} · ${x.minutes}分钟 · ${D.INTENSITY_LABELS[x.intensity] || ''}` }),
        el('div', { class: 'record-sub',
          text: `估算降幅约 ${U.round1(x.estDrop).toFixed(1)} mmol/L${x.note ? ' · ' + x.note : ''}` })
      ]),
      el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:6px' }, [
        el('span', { class: 'record-time', text: U.hm(new Date(x.at)) }),
        el('div', { class: 'record-actions' }, [
          rowAction('#i-edit', '编辑', () => openForm(x, root)),
          rowAction('#i-trash', '删除', async () => {
            if (await confirmDialog('确定删除这条运动记录吗？', { danger: true, okText: '删除' })) {
              await DB.Exercise.remove(x.id); toast('已删除'); mount(root);
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
    const draft = {
      id: record ? record.id : null,
      typeId: record ? record.typeId : 'walk_fast',
      minutes: record ? String(record.minutes) : '30',
      at: record ? record.at : Date.now(),
      note: record ? (record.note || '') : ''
    };

    App.openModal(`
      <div class="modal-head"><h2 class="modal-title">${editing ? '编辑运动记录' : '记一次运动'}</h2></div>
      <div id="exBody"></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="exCancel">取消</button>
        <button class="btn" id="exOk">${editing ? '保存修改' : '保存记录'}</button>
      </div>`);
    $('#exCancel').onclick = () => App.closeModal();
    $('#exOk').onclick = save;
    render();

    function render() {
      const body = $('#exBody');
      const type = D.EXERCISE_TYPES.find(t => t.id === draft.typeId);
      const est = D.estimateExerciseEffect(draft.typeId, Number(draft.minutes) || 0);
      body.innerHTML = `
        <label class="field"><span>运动类型</span>
          <select id="exType">
            ${D.EXERCISE_TYPES.map(t =>
              `<option value="${t.id}" ${t.id === draft.typeId ? 'selected' : ''}>${t.name}（${D.INTENSITY_LABELS[t.intensity]}）</option>`).join('')}
          </select></label>
        <div class="grid grid-2">
          <label class="field"><span>时长（分钟）</span>
            <input type="number" id="exMin" min="1" step="1" value="${esc(draft.minutes)}" inputmode="numeric"></label>
          <label class="field"><span>开始时间</span>
            <input type="datetime-local" id="exAt" value="${U.ymdhm(new Date(draft.at))}"></label>
        </div>
        <div class="kv-list">
          <div class="kv"><div class="k">强度</div><div class="v">${D.INTENSITY_LABELS[type.intensity]}</div></div>
          <div class="kv"><div class="k">估算血糖降幅</div><div class="v g-ok">≈ ${est.drop.toFixed(1)} mmol/L</div></div>
        </div>
        <div class="note article" style="margin-top:12px;background:#f0fdfa;border-left:4px solid var(--teal);padding:10px 14px;border-radius:0 10px 10px 0">
          <span class="small">${esc(est.advice)}</span>
        </div>
        <label class="field" style="margin-top:12px"><span>备注（可选）</span>
          <textarea id="exNote" placeholder="如 餐后40分钟开始、运动后无不适">${esc(draft.note)}</textarea></label>
        <p class="muted small">⚠️ 估算基于一般成人经验值，个体差异大。运动中出现心慌出汗等不适请立即停止并测血糖。</p>`;

      body.querySelector('#exType').addEventListener('change', e => { draft.typeId = e.target.value; render(); });
      body.querySelector('#exMin').addEventListener('input', e => { draft.minutes = e.target.value;
        const est2 = D.estimateExerciseEffect(draft.typeId, Number(draft.minutes) || 0);
        const vEl = body.querySelector('.g-ok');
        if (vEl) vEl.textContent = `≈ ${est2.drop.toFixed(1)} mmol/L`;
      });
    }

    async function save() {
      const minutes = Number($('#exMin').value);
      if (!(minutes > 0)) return toast('请输入运动时长');
      const type = D.EXERCISE_TYPES.find(t => t.id === draft.typeId);
      const est = D.estimateExerciseEffect(draft.typeId, minutes);
      await DB.Exercise.save({
        id: draft.id || undefined,
        typeId: draft.typeId,
        name: type.name,
        intensity: type.intensity,
        minutes,
        at: new Date($('#exAt').value).getTime(),
        estDrop: est.drop,
        note: $('#exNote').value.trim()
      });
      App.closeModal();
      toast('运动已记录 ✓');
      mount(root || $('#view'));
    }
  }

  Views.exercise = { mount, openForm: (r, root) => openForm(r, root || $('#view')) };
})();
