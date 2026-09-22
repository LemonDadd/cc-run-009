/* 端到端冒烟测试（jsdom + fake-indexeddb）
   node tests/e2e.smoke.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

// polyfills
window.indexedDB = fakeIDB.indexedDB;
window.IDBKeyRange = fakeIDB.IDBKeyRange;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.HTMLCanvasElement;
// requestAnimationFrame 兜底
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = id => clearTimeout(id);
}
window.Element.prototype.scrollIntoView = function () {};
window.scrollTo = function () {};

global.window = window;
global.document = window.document;
global.indexedDB = window.indexedDB;
global.IDBKeyRange = window.IDBKeyRange;

function loadAll(rels) {
  // 拼接为同一作用域执行：视图文件顶层引用 App，加载顺序晚于其定义
  const code = rels.map(r =>
    fs.readFileSync(path.join(__dirname, '..', r), 'utf8')).join('\n;\n');
  window.eval(code);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const scripts = [
    'js/utils.js', 'js/db.js',
    'js/data/foods.js', 'js/data/meds.js', 'js/data/knowledge.js',
    'js/charts.js', 'js/app.js',
    'js/views/home.js', 'js/views/glucose.js', 'js/views/meals.js',
    'js/views/medication.js', 'js/views/exercise.js', 'js/views/trends.js',
    'js/views/reports.js', 'js/views/knowledge.js', 'js/views/settings.js'
  ];
  loadAll(scripts);
  console.log('✓ 全部脚本加载无异常');
  const _dv=window.Utils.displayValue;
  window.Utils.displayValue=(mm,u)=>{ if(typeof mm!=='number'){ console.error('BAD DV mm=',mm,'unit=',u); console.error(new Error().stack); process.exit(1);} return _dv(mm,u); };

  // 等待 DOMContentLoaded 触发 init（jsdom 已 ready，手动派发）
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await sleep(300);

  if (!window.App || !window.App.State.ready) throw new Error('应用未完成初始化');
  console.log('✓ 应用初始化完成');

  // 内置食物库
  const foods = await window.DB.Foods.all();
  if (foods.length < 40) throw new Error('内置食物库未播种，数量=' + foods.length);
  console.log('✓ 内置食物库', foods.length, '种');

  const U = window.Utils;
  const now = Date.now();
  // 写入血糖（含一个低血糖触发预警）
  const gRecs = [
    { value: 5.2, at: now - 3600000, context: 'fasting', note: '起床' },
    { value: 9.4, at: now - 7200000, context: 'after_meal', note: '午餐后' },
    { value: 11.5, at: now - 10800000, context: 'after_meal', note: '' },
    { value: 3.5, at: now - 14400000, context: 'before_meal', note: '心慌出汗' }
  ];
  for (const g of gRecs) await window.DB.Glucose.save(g);
  console.log('✓ 写入血糖记录', gRecs.length, '条');

  // 饮食
  const rice = foods.find(f => f.name.startsWith('白米饭'));
  await window.DB.Meals.save({
    meal: 'lunch', at: now - 7200000 - 2 * 3600000,
    items: [{ foodId: rice.id, name: rice.name, gi: rice.gi, carbs: rice.carbs, portion: 150 }],
    totalGL: U.round1(U.calcGL(rice.gi, rice.carbs, 150)),
    carbs: U.round1(rice.carbs * 1.5), note: '测试餐'
  });

  // 用药 + 运动 + 提醒
  await window.DB.Medication.save({ name: '二甲双胍', medType: 'oral', dose: 500, unit: 'mg', schedule: '午餐后', at: now - 5 * 3600000 });
  await window.DB.Exercise.save({
    typeId: 'walk_fast', name: '快走', intensity: 'moderate',
    minutes: 30, at: now - 6 * 3600000, estDrop: 0.7
  });
  await window.DB.Reminders.save({
    kind: 'followup', repeat: 'once',
    title: '复诊：内分泌科', at: now + 86400000, enabled: true
  });
  console.log('✓ 写入饮食/用药/运动/提醒');

  // 逐视图挂载（关键：渲染无异常）
  const view = window.document.getElementById('view');
  for (const [name, params] of [
    ['home', {}], ['glucose', {}], ['meals', {}], ['medication', {}],
    ['exercise', {}], ['trends', {}], ['reports', {}],
    ['knowledge', {}], ['knowledge', { id: 'hypo' }],
    ['settings', {}]
  ]) {
    view.innerHTML = '';
    await window.Views[name].mount(view, params);
    await sleep(20);
    if (!view.innerHTML.length) throw new Error(`视图 ${name} 渲染为空`);
    console.log(`✓ 视图 ${name} 渲染正常 (${view.innerHTML.length} 字符)`);
  }

  // 报告生成
  window.location.hash = '#/reports';
  view.innerHTML = '';
  await window.Views.reports.mount(view);
  await sleep(20);
  // 直接调用构建逻辑（通过点击生成按钮，先设置日期）
  const fromInput = window.document.getElementById('rptFrom');
  const toInput = window.document.getElementById('rptTo');
  if (!fromInput) throw new Error('报告页日期输入未找到');
  fromInput.value = U.ymd(new Date(now - 7 * U.DAY_MS));
  toInput.value = U.ymd(new Date(now));
  window.document.getElementById('genRpt').click();
  await sleep(100);
  const previewText = window.document.getElementById('rptPreview').textContent;
  if (!previewText.includes('就诊报告')) throw new Error('报告未生成');
  if (!previewText.includes('二甲双胍')) throw new Error('报告缺少用药内容');
  if (!previewText.includes('低血糖')) throw new Error('报告缺少低血糖统计');
  console.log('✓ 报告生成包含血糖/用药/低血糖章节');

  // 导出备份
  const backup = await window.DB.exportAll();
  if (!backup.data.glucose || backup.data.glucose.length !== 4) throw new Error('备份数据不完整');
  console.log('✓ 数据备份导出正常');

  // 低血糖预警弹层（记录 3.5 后应弹出）——直接调用
  window.App.showGlucoseAlert(3.5, U.evaluateGlucose(3.5, 'before_meal'));
  await sleep(50);
  const modalText = window.document.getElementById('modal').textContent;
  if (!modalText.includes('15')) throw new Error('低血糖处理步骤未展示');
  console.log('✓ 低血糖预警弹层展示处理步骤');

  console.log('\n全部端到端冒烟测试通过 🎉');
  process.exit(0);
})().catch(e => {
  console.error('✗ 冒烟测试失败:', e);
  process.exit(1);
});
