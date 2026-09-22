/* views/meals.js — 饮食记录：食物库选餐、自动算总 GL / 碳水 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, toast, confirmDialog } = App;
  const U = Utils;

  let filterDays = 7;

  async function mount(root) {
    root.innerHTML = '';
    const head = el('section', { class: 'card' });
    head.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2 class="card-title" style="margin:0">🍚 饮食记录</h2>
        <button class="btn btn-sm" id="addM"><svg class="icon"><use href="#i-plus"/></svg>记一餐</button>
      </div>
      <div class="seg" id="daySeg" style="margin-top:12px">
        <button class="seg-item ${filterDays === 7 ? 'active' : ''}" data-d="7">近7天</button>
        <button class="seg-item ${filterDays === 30 ? 'active' : ''}" data-d="30">近30天</button>
        <button class="seg-item ${filterDays === 0 ? 'active' : ''}" data-d="0">全部</button>
      </div>
      <p class="muted small" style="margin:10px 0 0">GL（升糖负荷）= GI × 碳水(g) ÷ 100，同时考虑升糖速度和份量；≤10 低、11~20 中、&gt;20 高。</p>`;
    root.appendChild(head);
    head.querySelector('#addM').onclick = () => openForm(null, root);
    head.querySelectorAll('#daySeg button').forEach(b => {
      b.onclick = () => { filterDays = Number(b.dataset.d); mount(root); };
    });

    const records = (await DB.Meals.all()).sort((a, b) => b.at - a.at);
    const list = filterDays > 0
      ? records.filter(r => r.at >= U.startOfDay(U.addDays(new Date(), -(filterDays - 1))).getTime())
      : records;

    if (!list.length) {
      const c = el('section', { class: 'card empty' });
      c.innerHTML = `<svg class="icon"><use href="#i-utensils"/></svg><p><strong>还没有饮食记录</strong></p><p>从内置食物库选择，自动计算这餐的总 GL 和碳水</p>`;
      c.appendChild(el('button', { class: 'btn', onclick: () => openForm(null, root), text: '记第一餐' }));
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
      arr.forEach(m => card.appendChild(mealRow(m, root)));
      root.appendChild(card);
    });
  }

  function mealRow(m, root) {
    const gl = U.glLevel(m.totalGL || 0);
    const cls = { '低GL': 'bg-ok', '中GL': 'bg-high', '高GL': 'bg-danger' }[gl.label];
    const names = (m.items || []).map(i => `${i.name} ${i.portion}g`).join('、');
    return el('div', { class: 'record' }, [
      el('div', { class: 'record-icon', style: 'background:#ffedd5;color:#c2410c' }, [
        el('svg', { class: 'icon' }, [el('use', { href: '#i-utensils' })])
      ]),
      el('div', { class: 'record-main' }, [
        el('div', { class: 'record-title' }, [
          document.createTextNode(U.MEAL_LABELS[m.meal] || '加餐'),
          el('span', { class: `badge ${cls}`, style: 'margin-left:8px',
            text: `GL ${U.round1(m.totalGL).toFixed(1)}` }),
          el('span', { class: 'muted small', style: 'margin-left:8px',
            text: `碳水 ${U.round1(m.carbs).toFixed(0)}g` })
        ]),
        el('div', { class: 'record-sub', text: names || '（无食物明细）' })
      ]),
      el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:6px' }, [
        el('span', { class: 'record-time', text: U.hm(new Date(m.at)) }),
        el('div', { class: 'record-actions' }, [
          rowAction('#i-edit', '编辑', () => openForm(m, root)),
          rowAction('#i-trash', '删除', async () => {
            if (await confirmDialog('确定删除这餐记录吗？', { danger: true, okText: '删除' })) {
              await DB.Meals.remove(m.id); toast('已删除'); mount(root);
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

  function calcTotals(items) {
    let gl = 0, carbs = 0;
    items.forEach(i => {
      gl += U.calcGL(i.gi, i.carbs, i.portion);
      carbs += i.carbs * i.portion / 100;
    });
    return { gl, carbs };
  }

  // ---------- 3 步录餐：1餐次 → 2加食物 → 3确认 ----------
  // layer: 'meal' | 'custom'，自定义食物弹层是录餐之上的第二层
  function openForm(record, root) {
    const editing = !!record;
    const now = record ? new Date(record.at) : new Date();
    const draft = {
      id: record ? record.id : null,
      meal: record ? record.meal : U.inferMealByHour(now),
      at: record ? record.at : Date.now(),
      items: record ? JSON.parse(JSON.stringify(record.items || [])) : [],
      note: record ? (record.note || '') : ''
    };
    let step = 1;
    let layer = 'meal';
    let customName = '';

    function render() {
      if (layer === 'custom') return renderCustom();
      App.openModal(`
        <div class="modal-head"><h2 class="modal-title">${editing ? '编辑饮食记录' : '记一餐'}</h2></div>
        <div id="stepBody"></div>
        <div class="modal-foot">
          <button class="btn btn-secondary" id="mCancel">${step === 1 ? '取消' : '上一步'}</button>
          <button class="btn" id="mNext">${step === 3 ? (editing ? '保存修改' : '保存这餐') : '下一步'}</button>
        </div>`);
      $('#mCancel').onclick = () => {
        if (step > 1) { step--; render(); } else App.closeModal();
      };
      $('#mNext').onclick = onNext;
      renderStep();
    }

    async function onNext() {
      if (step === 1) { step = 2; render(); }
      else if (step === 2) {
        if (!draft.items.length) return toast('请至少添加一种食物');
        step = 3; render();
      } else {
        const atVal = $('#mAt') ? new Date($('#mAt').value).getTime() : draft.at;
        const totals = calcTotals(draft.items);
        await DB.Meals.save({
          id: draft.id || undefined,
          meal: draft.meal, at: atVal || draft.at,
          items: draft.items,
          totalGL: U.round1(totals.gl),
          carbs: U.round1(totals.carbs),
          note: $('#mNote') ? $('#mNote').value.trim() : draft.note
        });
        App.closeModal();
        toast(editing ? '已保存修改' : '这餐已记录 ✓');
        mount(root || $('#view'));
      }
    }

    function renderStep() {
      const body = $('#stepBody');
      body.innerHTML = '';

      if (step === 1) {
        body.innerHTML = `<label class="field"><span>第 1 步 / 共 3 步：这是哪一餐？</span></label>`;
        body.appendChild(el('div', { class: 'seg' },
          Object.entries(U.MEAL_LABELS).map(([k, v]) => el('button', {
            type: 'button', class: 'seg-item' + (draft.meal === k ? ' active' : ''),
            onclick: () => { draft.meal = k; render(); }
          }, [document.createTextNode(v)]))));
        body.appendChild(el('label', { class: 'field', style: 'margin-top:16px' }, [
          el('span', { text: '进餐时间' }),
          el('input', { type: 'datetime-local', id: 'mAt', value: U.ymdhm(new Date(draft.at)),
            onchange: (e) => { draft.at = new Date(e.target.value).getTime(); } })
        ]));
        return;
      }

      if (step === 2) {
        body.innerHTML = `<label class="field"><span>第 2 步 / 共 3 步：添加食物</span></label>`;
        const searchWrap = el('div');
        searchWrap.innerHTML = `
          <div style="position:relative">
            <svg class="icon" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#94a3b8"><use href="#i-search"/></svg>
            <input type="text" id="foodSearch" placeholder="搜索食物，如 米饭、苹果、豆腐…" style="padding-left:42px">
          </div>
          <div class="food-search-results" id="foodResults" hidden></div>`;
        body.appendChild(searchWrap);

        const input = searchWrap.querySelector('#foodSearch');
        const resultsBox = searchWrap.querySelector('#foodResults');
        input.addEventListener('input', () => renderResults(input.value.trim()));
        input.addEventListener('focus', () => renderResults(input.value.trim()));
        input.addEventListener('blur', () => setTimeout(() => { resultsBox.hidden = true; }, 150));

        async function renderResults(kw) {
          const foods = await DB.Foods.all();
          const list = !kw ? foods.slice(0, 30)
            : foods.filter(f => f.name.includes(kw) || (f.category || '').includes(kw)).slice(0, 30);
          resultsBox.hidden = false;
          resultsBox.innerHTML = '';
          if (!list.length) {
            resultsBox.appendChild(el('button', { type: 'button', class: 'food-opt',
              onmousedown: (e) => e.preventDefault(),
              onclick: () => { customName = kw; layer = 'custom'; render(); } }, [
              el('span', { class: 'fo-name', text: `+ 自定义食物「${kw || '新食物'}」` }),
              el('span', { class: 'fo-meta', text: '手动输入 GI 与碳水' })
            ]));
            return;
          }
          list.forEach(f => {
            const gi = U.giLevel(f.gi);
            resultsBox.appendChild(el('button', {
              type: 'button', class: 'food-opt',
              onmousedown: (e) => e.preventDefault(),
              onclick: () => {
                draft.items.push({
                  foodId: f.id, name: f.name, gi: f.gi,
                  carbs: f.carbs, portion: f.defaultPortion || 100
                });
                resultsBox.hidden = true;
                input.value = '';
                renderItems();
                input.focus();
              }
            }, [
              el('span', { class: 'fo-name', text: f.name }),
              el('span', { class: `fo-meta ${gi.cls}`,
                text: `${gi.label} GI${f.gi} · 碳水${f.carbs}g/100g` })
            ]));
          });
          resultsBox.appendChild(el('button', { type: 'button', class: 'food-opt',
            style: 'color:var(--teal-dark);font-weight:700',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => { layer = 'custom'; render(); } }, [
            el('span', { class: 'fo-name', text: '+ 添加自定义食物' })
          ]));
        }

        const itemsBox = el('div', { style: 'margin-top:14px' });
        body.appendChild(itemsBox);
        const totalBox = el('div', { style: 'margin-top:10px' });
        body.appendChild(totalBox);

        function renderItems() {
          itemsBox.innerHTML = '';
          if (!draft.items.length) {
            itemsBox.appendChild(el('p', { class: 'muted', text: '尚未添加食物，在上方搜索框搜索。' }));
          } else {
            draft.items.forEach((i, idx) => {
              const gl = U.calcGL(i.gi, i.carbs, i.portion);
              const glv = U.glLevel(gl);
              itemsBox.appendChild(el('div', { class: 'meal-food-row' }, [
                el('div', {}, [
                  el('div', { class: 'mfr-name', text: i.name }),
                  el('div', { class: 'muted small',
                    text: `GI ${i.gi} · 碳水 ${i.carbs}g/100g · GL ${U.round1(gl).toFixed(1)} ${glv.label}` })
                ]),
                el('input', {
                  type: 'number', min: '1', value: String(i.portion),
                  'aria-label': `${i.name} 份量(克)`,
                  oninput: (e) => {
                    i.portion = Math.max(0, Number(e.target.value) || 0);
                    updateTotals();
                  }
                }),
                el('span', { class: 'small muted', text: 'g' }),
                el('button', { class: 'icon-btn', 'aria-label': '移除',
                  onclick: () => { draft.items.splice(idx, 1); renderItems(); } }, [
                  el('svg', { class: 'icon' }, [el('use', { href: '#i-trash' })])
                ])
              ]));
            });
          }
          updateTotals();
        }

        function updateTotals() {
          const t = calcTotals(draft.items);
          const lv = U.glLevel(t.gl);
          totalBox.innerHTML = '';
          totalBox.appendChild(el('div', { class: 'kv-list' }, [
            el('div', { class: 'kv' }, [el('div', { class: 'k', text: '本餐总 GL' }),
              el('div', { class: 'v ' + lv.cls, text: U.round1(t.gl).toFixed(1) })]),
            el('div', { class: 'kv' }, [el('div', { class: 'k', text: '本餐总碳水' }),
              el('div', { class: 'v', text: U.round1(t.carbs).toFixed(0) + ' g' })]),
            el('div', { class: 'kv' }, [el('div', { class: 'k', text: 'GL 评级' }),
              el('div', { class: 'v ' + lv.cls, text: lv.label })])
          ]));
        }
        renderItems();
        return;
      }

      // step 3
      const t = calcTotals(draft.items);
      const lv = U.glLevel(t.gl);
      body.innerHTML = `
        <h3 style="margin:0 0 10px">第 3 步 / 共 3 步：确认这餐</h3>
        <div class="kv-list">
          <div class="kv"><div class="k">餐次</div><div class="v">${U.MEAL_LABELS[draft.meal]}</div></div>
          <div class="kv"><div class="k">总 GL</div><div class="v ${lv.cls}">${U.round1(t.gl).toFixed(1)} ${lv.label}</div></div>
          <div class="kv"><div class="k">总碳水</div><div class="v">${U.round1(t.carbs).toFixed(0)} g</div></div>
        </div>
        <div style="margin-top:12px" class="small muted">${draft.items.map(i => `${esc(i.name)} ${i.portion}g`).join('、')}</div>`;
      body.appendChild(el('label', { class: 'field', style: 'margin-top:12px' }, [
        el('span', { text: '备注（可选）' }),
        el('textarea', { id: 'mNote', placeholder: '例如：米饭偏软、餐后散步20分钟' }, [document.createTextNode(draft.note)])
      ]));
    }

    // 第二层：自定义食物（保存到食物库并加入本餐）
    function renderCustom() {
      App.openModal(`
        <div class="modal-head">
          <button class="icon-btn" id="cfBack" aria-label="返回"><svg class="icon"><use href="#i-back"/></svg></button>
          <h2 class="modal-title">自定义食物</h2>
        </div>
        <label class="field"><span>食物名称</span>
          <input type="text" id="cfName" placeholder="如 自家杂粮馒头" value="${esc(customName)}"></label>
        <div class="grid grid-2">
          <label class="field"><span>GI 值（0~100）</span>
            <input type="number" id="cfGI" min="0" max="100" placeholder="如 65"></label>
          <label class="field"><span>碳水（g/100g）</span>
            <input type="number" id="cfCarbs" min="0" step="0.1" placeholder="如 45"></label>
        </div>
        <label class="field"><span>本次份量（g）</span>
          <input type="number" id="cfPortion" min="1" value="100"></label>
        <p class="muted small">不确定数值时：精米白面主食 GI 约 70~88、多数蔬菜 GI 10~30；保存后可在食物库中重复使用。</p>
        <div class="modal-foot">
          <button class="btn btn-secondary" id="cfCancel">返回</button>
          <button class="btn" id="cfOk">加入这餐并保存到食物库</button>
        </div>`);
      const back = () => { layer = 'meal'; render(); };
      $('#cfCancel').onclick = back;
      $('#cfBack').onclick = back;
      $('#cfOk').onclick = async () => {
        const name = $('#cfName').value.trim();
        const gi = Number($('#cfGI').value);
        const carbs = Number($('#cfCarbs').value);
        const portion = Number($('#cfPortion').value);
        if (!name) return toast('请输入食物名称');
        if (!(gi >= 0 && gi <= 100)) return toast('GI 应在 0~100 之间');
        if (!(carbs >= 0)) return toast('请输入碳水含量');
        if (!(portion > 0)) return toast('份量需大于 0');
        const food = await DB.Foods.save({
          name, gi, carbs, defaultPortion: portion,
          category: '自定义', builtin: false
        });
        draft.items.push({ foodId: food.id, name, gi, carbs, portion });
        toast('已加入本餐并存入食物库');
        layer = 'meal';
        step = 2;
        render();
      };
    }

    render();
  }

  Views.meals = { mount, openForm: (r, root) => openForm(r, root || $('#view')) };
})();
