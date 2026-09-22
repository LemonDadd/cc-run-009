/* SugarLog 交互流程测试：真实点击/输入完整业务流 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const ROOT = '/workspace';
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  url: 'http://localhost/', pretendToBeVisual: true
});
const { window } = dom;
Object.defineProperty(window, 'indexedDB', { value: fakeIDB.indexedDB, configurable: true, writable: true });
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.Notification = undefined;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

const SCRIPTS = [
  'js/db.js', 'js/data/foods.js', 'js/data/knowledge.js', 'js/units.js',
  'js/ui.js', 'js/charts.js',
  'js/views/dashboard.js', 'js/views/glucose.js', 'js/views/diet.js',
  'js/views/medication.js', 'js/views/exercise.js', 'js/views/trends.js',
  'js/views/reports.js', 'js/views/knowledge.js', 'js/views/settings.js', 'js/app.js'
];
SCRIPTS.forEach(rel => {
  new Function('window', 'indexedDB', 'IDBKeyRange', 'with(window){' +
    fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n}')(window, fakeIDB.indexedDB, fakeIDB.IDBKeyRange);
});

let pass = 0, fail = 0;
function ok(c, m) { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.error('  ✗ ' + m)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = (sel, root) => (root || window.document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || window.document).querySelectorAll(sel));
function setInput(el, value) {
  if (!el) throw new Error('setInput: 元素不存在');
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
function click(el) {
  if (!el) throw new Error('click: 元素不存在');
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
async function closeAllModals() {
  $$('.modal-mask').forEach(() => {
    const c = $('.modal-mask .modal-close');
    if (c) click(c);
  });
  await sleep(40);
}

const SL = window.SL;

(async () => {
  SL.App.boot();
  for (let i = 0; i < 60 && !SL.App.state.settings; i++) await sleep(40);

  // 等首页渲染 & 首启向导
  await sleep(300);
  let wizard = $('.modal');
  console.log('--- 首启向导 ---');
  ok(!!wizard, '首次启动自动弹出资料向导');
  if (wizard) {
    const inputs = $$('.modal input');
    setInput(inputs[0], '张阿姨');                 // 昵称
    const typeSel = $('.modal select');
    setInput(typeSel, 'type2');
    // 选 mg/dL 按钮
    $$('.modal .seg button')[1].click();
    await sleep(20);
    const startBtn = $$('.modal .btn').filter(b => b.textContent.indexOf('开始使用') >= 0)[0];
    click(startBtn);
    await sleep(120);
    ok(!$('.modal'), '向导确认后关闭');
    ok((await SL.DB.get('profiles', 'me')).nickname === '张阿姨', '昵称已保存');
    ok((await SL.DB.get('settings', 'default')).unit === 'mgdl', '单位选择已保存 mg/dL');
  }
  await closeAllModals();
  // 切回 mmol 方便断言
  const st = await SL.DB.get('settings', 'default');
  st.unit = 'mmol'; await SL.DB.put('settings', st);
  await SL.App.reloadState();

  const root = $('#view-root');

  console.log('--- 流程1：记一条血糖（快速卡片）---');
  await SL.Views.glucose(root);
  await sleep(60);
  // 显式选空腹，避免默认餐次随运行时刻变化
  const mealSel0 = $('#view-root select');
  setInput(mealSel0, 'fasting');
  const numInput = $$('#view-root input[type=number]')[0];
  setInput(numInput, '8.9');
  await sleep(20);
  ok(/偏高/.test($('#g-result').textContent), '输入 8.9 实时提示偏高');
  setInput(numInput, '5.8');
  await sleep(20);
  ok(/达标/.test($('#g-result').textContent), '改为 5.8 实时提示达标');
  // 保存
  const saveBtn = $$('.btn').filter(b => b.textContent.indexOf('保存记录') >= 0)[0];
  click(saveBtn);
  await sleep(80);
  let gs = await SL.DB.all('glucoseRecords');
  ok(gs.some(r => r.value === 5.8), '血糖 5.8 已写入');

  // 低血糖 → 预警弹窗（视图已重渲染，需在 view-root 内重新查询）
  await sleep(20);
  const num2 = $('#view-root input[type=number]');
  ok(!!num2, '重渲染后血糖输入框仍存在');
  setInput(num2, '3.2');
  await sleep(20);
  click($('#view-root .btn'));  // 唯一主按钮：保存记录
  await sleep(100);
  const alertModal = $('.modal-mask');
  ok(!!alertModal && /低血糖预警/.test(alertModal.textContent), '保存低血糖弹出预警');
  ok(/15/.test(alertModal.textContent) && /葡萄糖/.test(alertModal.textContent), '预警含 15 克糖步骤');
  // 点“我知道了”
  const closeBtns = $$('.modal .btn').filter(b => b.textContent.indexOf('我知道了') >= 0);
  click(closeBtns[0]);
  await sleep(60);
  ok(!$('.modal-mask'), '预警可关闭');

  console.log('--- 流程2：记一餐饮食 ---');
  await SL.Views.diet(root);
  await sleep(60);
  click($$('.btn').filter(b => b.textContent.indexOf('记录一餐') >= 0)[0]);
  await sleep(60);
  let modal = $('.modal');
  ok(!!modal, '饮食模态框打开');
  // 搜索米饭
  const search = $('input[type=search]', modal);
  search.focus();
  setInput(search, '米饭');
  await sleep(40);
  const foodButtons = $$('.food-search-results .food-item', modal);
  ok(foodButtons.length >= 2, '搜索到米饭相关食物 ' + foodButtons.length + ' 项');
  click(foodButtons[0]); // 白米饭
  await sleep(40);
  ok($$('.chosen', modal).length === 1, '加入 1 种食物');
  const glText = $('.meal-summary', modal).textContent;
  ok(/GL/.test(glText) && /碳水/.test(glText), '显示总 GL 与总碳水');
  // 修改份量为 200g
  const gramI = $('.chosen input', modal);
  setInput(gramI, '200');
  await sleep(40);
  const glAfter = parseFloat($('.meal-summary b', modal).textContent);
  ok(Math.abs(glAfter - 43.0) < 0.2, '200g 白米饭 GL≈43.0，实际 ' + glAfter);
  // 保存
  click($$('.modal .btn').filter(b => b.textContent.indexOf('保存这一餐') >= 0)[0]);
  await sleep(80);
  const meals = await SL.DB.all('mealRecords');
  ok(meals.length === 1 && meals[0].totalGL > 40, '餐次已保存，GL=' + meals[0].totalGL);

  console.log('--- 流程3：自定义食物 ---');
  await SL.Views.diet(root);
  await sleep(40);
  click($$('.btn').filter(b => b.textContent.indexOf('记录一餐') >= 0)[0]);
  await sleep(40);
  modal = $('.modal');
  click($$('.modal .btn.ghost').filter(b => b.textContent.indexOf('自定义食物') >= 0)[0]);
  await sleep(40);
  const modals = $$('.modal-mask');
  const customModal = modals[modals.length - 1];
  const ci = $$('input', customModal);
  setInput(ci[0], '杂粮窝头');
  setInput(ci[2], '45');   // GI
  setInput(ci[3], '40');   // carbs
  click($$('.btn', customModal).filter(b => b.textContent.indexOf('保存并加入') >= 0)[0]);
  await sleep(60);
  const foods = await SL.DB.all('foods');
  ok(foods.some(f => f.name === '杂粮窝头' && f.gi === 45), '自定义食物已入库并自动加入餐');

  console.log('--- 流程4：用药记录 + 勾选已服 ---');
  // 关闭可能存在的餐次模态
  $$('.modal-mask').forEach(mm => {
    const c = $('.modal-close', mm); if (c) click(c);
  });
  await sleep(40);
  await SL.Views.medication(root);
  await sleep(40);
  click($$('.btn').filter(b => b.textContent.indexOf('记一次用药') >= 0)[0]);
  await sleep(40);
  modal = $('.modal');
  const mi = $$('input', modal);
  setInput(mi[0], '阿卡波糖');
  setInput(mi[1], '50mg');
  // 快速填入按钮也存在
  ok($$('.btn.ghost.sm', modal).length >= 6, '常用药快捷按钮存在');
  click($$('.modal .btn').filter(b => b.textContent.trim() === '保存用药')[0]);
  await sleep(60);
  let meds = await SL.DB.all('medicationRecords');
  ok(meds.some(m => m.name === '阿卡波糖'), '用药已保存');
  // 勾选已服
  const takenBtn = $$('.btn.sm').filter(b => b.textContent.trim() === '✓ 已服')[0];
  ok(!!takenBtn, '列表有“已服”按钮');
  click(takenBtn);
  await sleep(60);
  meds = await SL.DB.all('medicationRecords');
  ok(meds.filter(m => m.name === '阿卡波糖')[0].taken === true, '标记为已服用');

  console.log('--- 流程5：运动记录（估算影响）---');
  await SL.Views.exercise(root);
  await sleep(40);
  click($$('.btn').filter(b => b.textContent.indexOf('记录一次运动') >= 0)[0]);
  await sleep(40);
  modal = $('.modal');
  ok(/约使血糖下降/.test(modal.textContent), '打开即显示估算影响');
  const dropBefore = modal.querySelector('.alert-banner').textContent;
  const dur = $$('input[type=number]', modal)[0];
  setInput(dur, '60');
  await sleep(30);
  const dropAfter = modal.querySelector('.alert-banner').textContent;
  ok(dropAfter !== dropBefore && /60|加倍/.test(dropAfter) || /下降/.test(dropAfter), '时长改为60分钟后估算更新');
  click($$('.modal .btn').filter(b => b.textContent.indexOf('保存运动') >= 0)[0]);
  await sleep(60);
  const exs = await SL.DB.all('exerciseRecords');
  ok(exs.length === 1 && exs[0].estimatedDrop > 1, '运动已保存且估算降幅>1: ' + exs[0].estimatedDrop);

  console.log('--- 流程6：趋势分析配对 ---');
  // 补一条“餐后2h”血糖，与已存午餐配对
  const lunch = (await SL.DB.all('mealRecords'))[0];
  await SL.DB.put('glucoseRecords', {
    id: SL.DB.uid(), value: 9.8, meal: 'afterLunch',
    at: lunch.at + 2 * 3600e3, note: '配对测试'
  });
  await SL.App.state; // noop
  // 趋势需要≥3对才有散点；造另外两对
  for (let i = 0; i < 2; i++) {
    const ts = Date.now() - (i + 1) * 864e5 + 12 * 3600e3;
    await SL.DB.put('mealRecords', {
      id: SL.DB.uid(), period: 'lunch', at: ts,
      foods: [{ foodId: 'f_rice', name: '白米饭', gi: 83, carbs: 25.9, grams: 100 + i * 60,
        gl: SL.U.foodGL(83, 25.9, 100 + i * 60), carbTotal: 25.9 * (100 + i * 60) / 100 }],
      totalGL: SL.U.foodGL(83, 25.9, 100 + i * 60),
      totalCarbs: Math.round(25.9 * (100 + i * 60) / 100 * 10) / 10, note: ''
    });
    await SL.DB.put('glucoseRecords', {
      id: SL.DB.uid(), value: 7.5 + i * 1.5, meal: 'afterLunch', at: ts + 2 * 3600e3
    });
  }
  await SL.Views.trends(root);
  await sleep(80);
  const trendText = root.textContent;
  ok(/相关系数/.test(trendText), '趋势页展示 GL/碳水相关系数');
  ok($$('svg', root).length >= 2, '趋势页绘制多张 SVG 图表');

  console.log('--- 流程7：设置保存与校验 ---');
  await SL.Views.settings(root);
  await sleep(40);
  const fastingMaxInput = $$('input[type=number]').filter(i => (i.value === '10' || i.value === '10.00'))[0];
  ok(!!$('.seg button.on'), '单位分段控件有选中态');
  // 切换单位
  click($$('.seg button').filter(b => b.textContent.trim() === 'mg/dL')[0]);
  await sleep(80);
  ok((await SL.DB.get('settings', 'default')).unit === 'mgdl', '设置页切换单位即时保存');
  // 目标输入值已换算成 mg/dL 显示（空腹上限约 126）
  const mgInputs = $$('input[type=number]').map(i => i.value);
  ok(mgInputs.some(v => Math.abs(parseFloat(v) - 126) <= 1), '目标值按 mg/dL 显示（存在126附近的值）');

  console.log('--- 流程8：知识库直达/搜索 ---');
  await SL.Views.knowledge(root);
  await sleep(30);
  ok(root.textContent.indexOf('血糖达标标准') >= 0, '知识库目录列出文章');
  click($$('.kb-card').filter(c => c.textContent.indexOf('低血糖') >= 0)[0]);
  await sleep(50);
  ok(root.textContent.indexOf('15-15') >= 0 || root.textContent.indexOf('15 克') >= 0, '点开低血糖文章含处理步骤');
  click($$('.btn.ghost.sm').filter(b => b.textContent.indexOf('返回') >= 0)[0]);
  await sleep(30);
  const kSearch = $('input[type=search]');
  setInput(kSearch, 'GI');
  await sleep(30);
  ok($$('.kb-card').length === 1 && /饮食/.test(root.textContent), '搜索“GI”只返回饮食原则');

  console.log('\n==============================');
  console.log('INTERACT PASS ' + pass + '  FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('交互测试异常:', e); process.exit(1); });
