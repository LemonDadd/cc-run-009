/* =========================================================
 * SugarLog · 饮食记录
 * 内置食物库（GI + 碳水）+ 自定义食物；按份量实时算 GL / 碳水
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount, toast = SL.UI.toast, field = SL.UI.field;
  var U = SL.U, DB = SL.DB;
  var Views = SL.Views || (SL.Views = {});

  var state = { filter: '7d' };

  Views.diet = function (root) {
    Promise.all([
      DB.all('mealRecords'),
      DB.all('foods')
    ]).then(function (res) {
      render(root, res[0].sort(function (a, b) { return b.at - a.at; }), res[1]);
    });
    mount(root, h('.empty', {}, '加载中…'));
  };

  function render(root, meals, foods) {
    var builtins = foods.filter(function (f) { return f.builtin; });
    var customs = foods.filter(function (f) { return !f.builtin; });

    // ---------- 顶部概览：今日三餐 GL/碳水 ----------
    var t0 = U.startOfDay(Date.now()), t1 = U.endOfDay(Date.now());
    var todayMeals = meals.filter(function (m) { return m.at >= t0 && m.at <= t1; });
    var totalGL = sum(todayMeals, 'totalGL');
    var totalCarbs = sum(todayMeals, 'totalCarbs');

    var summaryCard = h('.card', { style: 'border-top:4px solid #1e8e3e' },
      h('h2.mt0', {}, '🍚 今日饮食概况'),
      h('.stat-grid', {},
        stat('记录餐次', todayMeals.length + ' 餐'),
        stat('总碳水', U.fmt1(totalCarbs) + ' g'),
        stat('总 GL', U.fmt1(totalGL), glHint(totalGL)),
        stat('平均每餐 GL', todayMeals.length ? U.fmt1(totalGL / todayMeals.length) : '—')
      ),
      h('div.mt18', {},
        h('button.btn', { onClick: function () { openMealModal(null, foods, refresh); } }, '➕ 记录一餐')
      )
    );

    function refresh() { Views.diet(root); }

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
    var filtered = meals;
    if (state.filter !== 'all') {
      var days = state.filter === '30d' ? 30 : 7;
      var from = U.startOfDay(U.addDays(Date.now(), -(days - 1)));
      filtered = meals.filter(function (m) { return m.at >= from; });
    }

    // ---------- 餐次列表 ----------
    var listCard = h('.card', {},
      h('h2.mt0', { style: 'display:flex;align-items:center;gap:10px' },
        '饮食记录',
        h('span.muted.small', { style: 'font-weight:400' }, '共 ' + filtered.length + ' 餐')),
      filterSeg,
      filtered.length === 0
        ? h('div.mt12', {}, SL.UI.emptyBox('🥗', '还没有饮食记录',
            h('button.btn', { onClick: function () { openMealModal(null, foods, refresh); } }, '➕ 记录第一餐')))
        : h('div.mt12.rec-list', {}, filtered.map(function (m) { return mealRow(m, refresh); }))
    );

    mount(root, [summaryCard, listCard]);
  }

  function sum(list, key) {
    return list.reduce(function (a, m) { return a + (m[key] || 0); }, 0);
  }

  function glHint(gl) {
    var b = U.mealGLBand(gl);
    return h('span', { class: 'bg-' + (b.cls === 'ok' ? 'ok' : b.cls) }, b.label);
  }

  function stat(label, value, sub) {
    return h('.stat', {},
      h('.s-label', {}, label),
      h('.s-value', {}, value),
      sub ? h('.s-sub', {}, sub) : null
    );
  }

  function mealRow(m, refresh) {
    var band = U.mealGLBand(m.totalGL || 0);
    var period = U.MEAL_PERIOD_MAP[m.period] || { emoji: '🍽️', label: '加餐' };
    var names = (m.foods || []).map(function (f) { return f.name + ' ' + f.grams + 'g'; }).join('、');
    return h('.rec', { style: 'align-items:flex-start;padding-top:14px;padding-bottom:14px' },
      h('span', { style: 'font-size:1.6rem;line-height:1.2' }, period.emoji),
      h('.rec-main', {},
        h('.rec-title', {}, period.label + ' · ' + U.fmtRelative(m.at)),
        h('.rec-meta', { style: 'white-space:normal' }, names || '（无食物明细）'),
        h('.meal-summary', { style: 'padding:8px 12px;margin-top:8px' },
          h('span', {}, '总 GL：', h('b', { class: 'bg-' + (band.cls === 'ok' ? 'ok' : band.cls) }, U.fmt1(m.totalGL))),
          h('span', {}, '总碳水：', h('b', {}, U.fmt1(m.totalCarbs) + ' g')),
          h('span.chip.' + (band.cls === 'ok' ? 'ok' : band.cls), {}, band.label)
        )
      ),
      h('.rec-side', { style: 'display:flex;gap:6px;padding-top:2px' },
        h('button.icon-btn.sm', { title: '编辑', style: 'width:34px;height:34px;min-height:34px',
          onClick: function () { DB.all('foods').then(function (fs) { openMealModal(m, fs, refresh); }); } }, '✏️'),
        h('button.icon-btn.sm', { title: '删除', style: 'width:34px;height:34px;min-height:34px',
          onClick: function () { delMeal(m, refresh); } }, '🗑️')
      )
    );
  }

  function delMeal(m, refresh) {
    var period = U.MEAL_PERIOD_MAP[m.period] || { label: '加餐' };
    SL.UI.confirm({
      title: '删除这餐记录？',
      message: period.label + ' · ' + U.fmtDateTime(m.at),
      okText: '删除', danger: true
    }).then(function (ok) {
      if (!ok) return;
      DB.delete('mealRecords', m.id).then(function () { toast('已删除'); refresh(); });
    });
  }

  /* =========================================================
   * 记录 / 编辑一餐（模态框）
   * 步骤：选餐次时间 → 搜食物加份量 → 查看总 GL → 保存
   * ========================================================= */
  function openMealModal(existing, allFoods, onSaved) {
    var chosen = [];
    if (existing && existing.foods) {
      chosen = existing.foods.map(function (f) {
        return {
          foodId: f.foodId, name: f.name, gi: f.gi, carbs: f.carbs,
          grams: f.grams, builtin: f.builtin
        };
      });
    }

    var nowTs = existing ? existing.at : Date.now();
    var periodSel = SL.UI.selectInput(
      U.MEAL_PERIODS.map(function (p) { return { value: p.key, label: p.emoji + ' ' + p.label }; }),
      existing ? existing.period : U.guessMealPeriod(nowTs)
    );
    var timeInput = h('input.input', { type: 'datetime-local', value: U.tsToDtl(nowTs) });
    var noteInput = h('input.input', { type: 'text', value: existing ? (existing.note || '') : '',
      placeholder: '例如：外出就餐、先吃了蔬菜…（可选）', maxlength: 100 });
    var searchInput = h('input.input', { type: 'search', placeholder: '① 搜索食物：米饭、苹果、牛奶…', autocomplete: 'off' });
    var resultsBox = h('.food-search-results', { style: 'display:none;border:0' });
    var chosenBox = h('.chosen-foods');
    var summaryBox = h('.meal-summary');

    function recalc() {
      var totalGL = 0, totalCarbs = 0;
      chosen.forEach(function (c) {
        c.gl = U.foodGL(c.gi, c.carbs, c.grams);
        c.carbTotal = c.carbs * c.grams / 100;
        totalGL += c.gl; totalCarbs += c.carbTotal;
      });
      var band = U.mealGLBand(totalGL);
      summaryBox.innerHTML = '';
      [
        h('span', {}, '总 GL：', h('b', { class: 'bg-' + (band.cls === 'ok' ? 'ok' : band.cls) }, U.fmt1(totalGL))),
        h('span', {}, '总碳水：', h('b', {}, U.fmt1(totalCarbs) + ' g')),
        h('span.chip.' + (band.cls === 'ok' ? 'ok' : band.cls), {}, band.label)
      ].forEach(function (n) { summaryBox.appendChild(n); });
      renderChosen();
    }

    function renderChosen() {
      chosenBox.innerHTML = '';
      if (!chosen.length) {
        chosenBox.appendChild(h('.muted.small', { style: 'padding:6px 2px' }, '② 还没有添加食物，先在上方搜索并点击加入。'));
        return;
      }
      chosen.forEach(function (c, idx) {
        var gramInput = h('input.input', {
          type: 'number', min: '1', step: '1', value: c.grams,
          'aria-label': c.name + ' 份量（克）'
        });
        gramInput.addEventListener('input', function () {
          var g = parseFloat(gramInput.value);
          c.grams = isNaN(g) || g <= 0 ? 0 : g;
          recalc();
        });
        var giBand = U.giBand(c.gi);
        chosenBox.appendChild(h('.chosen', {},
          h('span', { style: 'min-width:52px;font-weight:700' }, c.name.length > 5 ? c.name.slice(0, 5) : c.name,
            h('span.small', { title: 'GI ' + (c.gi || 0), class: giBand.cls, style: 'display:block;font-weight:600' },
              'GI' + (c.gi || 0))),
          h('span.c-name', {}, c.name),
          h('span.c-gram', {}, gramInput, h('span.small.muted', {}, ' 克')),
          h('span.c-gl', {}, 'GL ', h('b', {}, U.fmt1(c.gl || 0))),
          h('button', { title: '移除', onClick: function () { chosen.splice(idx, 1); recalc(); } }, '✕')
        ));
      });
    }

    function renderResults(keyword) {
      resultsBox.innerHTML = '';
      keyword = (keyword || '').trim().toLowerCase();
      var list = allFoods.filter(function (f) {
        return !keyword || f.name.toLowerCase().indexOf(keyword) >= 0 || (f.cat || '').indexOf(keyword) >= 0;
      }).slice(0, 40);

      if (!list.length) {
        resultsBox.style.display = 'block';
        resultsBox.appendChild(h('.food-item', {},
          h('span.fi-name', {}, '没有找到「' + keyword + '」'),
          h('button.btn.sm.secondary', {
            onClick: function () {
              resultsBox.style.display = 'none';
              searchInput.value = '';
              openCustomFood(keyword, allFoods, function (food) {
                allFoods.push(food);
                addChosen(food);
                toast('已添加自定义食物 ✓', 'ok');
              });
            }
          }, '➕ 自定义')
        ));
        return;
      }

      resultsBox.style.display = 'block';
      list.forEach(function (f) {
        var band = U.giBand(f.gi);
        var item = h('button.food-item', {
          onClick: function () { addChosen(f); searchInput.value = ''; resultsBox.style.display = 'none'; searchInput.focus(); }
        },
          h('span.fi-name', {}, f.name,
            h('span.small.muted', { style: 'font-weight:400;margin-left:6px' }, f.cat + (f.builtin ? '' : ' · 自定义'))),
          h('span.fi-gi.' + band.cls, {}, 'GI ' + (f.gi || 0)),
          h('span.small.muted', { style: 'min-width:120px;text-align:right' },
            '碳水 ' + f.carbs + 'g/100g · 1份' + f.portion + 'g')
        );
        resultsBox.appendChild(item);
      });
    }

    function addChosen(f) {
      var existingItem = chosen.filter(function (c) { return c.foodId === f.id; })[0];
      if (existingItem) {
        existingItem.grams += f.portion || 100;
      } else {
        chosen.push({
          foodId: f.id, name: f.name, gi: f.gi || 0, carbs: f.carbs || 0,
          grams: f.portion || 100, builtin: !!f.builtin
        });
      }
      recalc();
    }

    searchInput.addEventListener('input', function () { renderResults(searchInput.value); });
    searchInput.addEventListener('focus', function () { if (searchInput.value) renderResults(searchInput.value); });
    document.addEventListener('click', function hideResults(e) {
      if (!resultsBox.contains(e.target) && e.target !== searchInput) {
        resultsBox.style.display = 'none';
      }
    });

    var customBtn = h('button.btn.ghost.sm', {
      onClick: function () {
        openCustomFood(searchInput.value || '', allFoods, function (food) {
          allFoods.push(food);
          addChosen(food);
          toast('已添加自定义食物 ✓', 'ok');
        });
      }
    }, '➕ 新建自定义食物');

    var modal = SL.UI.openModal({
      title: existing ? '编辑这一餐' : '🍚 记录一餐',
      wide: true,
      content: h('div', {},
        h('.inline-fields', {},
          field('餐次', periodSel),
          field('用餐时间', timeInput)
        ),
        field(h('span', {}, '添加食物'), searchInput,
          '点击搜索结果即可加入；份量可直接修改，GL 自动计算'),
        resultsBox,
        customBtn,
        chosenBox,
        h('.mt12', {}, summaryBox),
        field('备注（可选）', noteInput)
      )
    });

    var saveBtn = h('button.btn', {}, existing ? '保存修改' : '③ 保存这一餐');
    saveBtn.addEventListener('click', function () {
      if (!chosen.length) { toast('请至少添加一种食物', 'err'); return; }
      var totalGL = 0, totalCarbs = 0;
      var foodsOut = chosen.map(function (c) {
        var gl = U.foodGL(c.gi, c.carbs, c.grams);
        var carb = c.carbs * c.grams / 100;
        totalGL += gl; totalCarbs += carb;
        return {
          foodId: c.foodId, name: c.name, gi: c.gi, carbs: c.carbs,
          grams: c.grams, gl: Math.round(gl * 10) / 10,
          carbTotal: Math.round(carb * 10) / 10, builtin: !!c.builtin
        };
      });
      var rec = {
        id: existing ? existing.id : DB.uid(),
        period: periodSel.value,
        at: U.dtlToTs(timeInput.value) || Date.now(),
        foods: foodsOut,
        totalGL: Math.round(totalGL * 10) / 10,
        totalCarbs: Math.round(totalCarbs * 10) / 10,
        note: noteInput.value.trim()
      };
      DB.put('mealRecords', rec).then(function () {
        modal.close();
        toast(existing ? '已更新 ✓' : '已保存这一餐 ✓', 'ok');
        onSaved && onSaved();
      });
    });
    modal.body.appendChild(h('.modal-foot', {},
      h('button.btn.ghost', { onClick: function () { modal.close(); } }, '取消'),
      saveBtn
    ));

    recalc();
  }

  /* ---------------- 自定义食物 ---------------- */
  function openCustomFood(presetName, allFoods, onCreated) {
    var nameI = h('input.input', { value: presetName || '', placeholder: '食物名称', maxlength: 20 });
    var catI = SL.UI.selectInput(
      ['主食', '蔬菜', '水果', '豆蛋奶', '肉鱼', '坚果', '糖饮', '其他'], '其他');
    var giI = h('input.input', { type: 'number', min: '0', max: '120', step: '1', placeholder: '0~100，不知道可填 0' });
    var carbsI = h('input.input', { type: 'number', min: '0', max: '100', step: '0.1', placeholder: '每 100g 碳水克数' });
    var portionI = h('input.input', { type: 'number', min: '1', value: '100' });

    var modal = SL.UI.openModal({
      title: '自定义食物',
      content: h('div', {},
        field('名称', nameI),
        field('分类', catI),
        h('.row', {},
          field(h('span', {}, 'GI 值'), giI, '低≤55 / 中56~69 / 高≥70；无数据填 0'),
          field('碳水（g/100g）', carbsI, '可参考食品包装营养成分表')
        ),
        field('常用一份（克）', portionI)
      )
    });
    modal.body.appendChild(h('.modal-foot', {},
      h('button.btn.ghost', { onClick: function () { modal.close(); } }, '取消'),
      h('button.btn', {
        onClick: function () {
          var name = nameI.value.trim();
          if (!name) { toast('请填写名称', 'err'); return; }
          var gi = Math.max(0, Math.min(120, parseFloat(giI.value) || 0));
          var carbs = Math.max(0, Math.min(100, parseFloat(carbsI.value) || 0));
          var portion = parseFloat(portionI.value) || 100;
          var food = {
            id: 'custom_' + DB.uid(),
            name: name, cat: catI.value, gi: gi, carbs: carbs,
            portion: portion, builtin: false, createdAt: Date.now()
          };
          DB.put('foods', food).then(function () { modal.close(); onCreated && onCreated(food); });
        }
      }, '保存并加入这一餐')
    ));
  }
})(window);
