/* SugarLog 冒烟测试：jsdom + fake-indexeddb */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const ROOT = '/workspace';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;

Object.defineProperty(window, 'indexedDB', { value: fakeIDB.indexedDB, configurable: true, writable: true });
Object.defineProperty(window, 'IDBKeyRange', { value: fakeIDB.IDBKeyRange, configurable: true, writable: true });
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.Notification = undefined;
window.scrollTo = () => {};

const SCRIPTS = [
  'js/db.js',
  'js/data/foods.js',
  'js/data/knowledge.js',
  'js/units.js',
  'js/ui.js',
  'js/charts.js',
  'js/views/dashboard.js',
  'js/views/glucose.js',
  'js/views/diet.js',
  'js/views/medication.js',
  'js/views/exercise.js',
  'js/views/trends.js',
  'js/views/reports.js',
  'js/views/knowledge.js',
  'js/views/settings.js',
  'js/app.js'
];

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ FAIL: ' + msg); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

SCRIPTS.forEach(rel => {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // 用 with(window) 让脚本里的裸全局（location/sessionStorage/indexedDB…）都指向 jsdom window
  const wrapped = 'with(window){' + code + '\n}';
  new Function('window', 'indexedDB', 'IDBKeyRange',
    wrapped)(window, fakeIDB.indexedDB, fakeIDB.IDBKeyRange);
});
const SL = window.SL;

(async () => {
  // DOMContentLoaded 已触发（脚本在解析后注入），手动启动
  SL.App.boot();
  for (let i = 0; i < 60 && !SL.App.state.settings; i++) await sleep(50);

  console.log('--- 基础 ---');
  ok(!!SL.App.state.settings, '应用启动，settings 已加载');
  ok(!!SL.App.state.profile, 'profile 已加载');
  const allFoods = await SL.DB.all('foods');
  ok(allFoods.length >= 40, '内置食物库已种子化：' + allFoods.length + ' 种食物');
  ok(SL.KNOWLEDGE.length === 6, '知识库 6 篇文章');
  ok(document.getElementById('modal-root') !== null, 'modal-root 容器存在');

  console.log('--- 单位/规则 ---');
  const s = SL.App.state.settings;
  ok(SL.U.classify(5.5, 'fasting', s) === 'ok', '5.5 空腹 → 达标');
  ok(SL.U.classify(8.5, 'fasting', s) === 'high', '8.5 空腹 → 偏高');
  ok(SL.U.classify(10.5, 'afterBF', s) === 'high', '10.5 餐后 → 偏高');
  ok(SL.U.classify(9.5, 'afterBF', s) === 'ok', '9.5 餐后 → 达标');
  ok(SL.U.classify(3.5, 'random', s) === 'low', '3.5 → 低血糖(蓝)');
  ok(SL.U.classify(2.8, 'random', s) === 'danger', '2.8 → 危险(红)');
  ok(SL.U.classify(18, 'random', s) === 'danger', '18 → 危险高血糖(红)');
  ok(Math.abs(SL.U.foodGL(83, 25.9, 150) - (83 * 25.9 * 1.5 / 100)) < 0.01, '白米饭一碗 GL≈32.3');
  const hba1c = SL.U.estimateHbA1c(8.6);
  ok(Math.abs(hba1c - 7.04) < 0.1, '平均8.6 → HbA1c≈7.0%');
  ok(Math.abs(SL.U.fromDisplay(SL.U.toDisplay(6.5, s), s) - 6.5) < 1e-9, 'mmol 往返换算');

  console.log('--- mg/dL 模式（内部始终 mmol 判断）---');
  ok(Math.abs(SL.U.toDisplay(7, { unit: 'mgdl' }) - 126.13) < 0.2, '7 mmol → 126 mg/dL');
  ok(SL.U.classify(SL.U.fromDisplay(70, { unit: 'mgdl' }), 'fasting', { unit: 'mgdl' }) === 'low',
    '70 mg/dL 输入 → 低血糖');
  ok(Math.abs(SL.U.fmtGlucose(7, { unit: 'mgdl' }, 0) - '126') < 0.01, '格式化 7 mmol → 126 mg/dL');

  console.log('--- 数据 CRUD ---');
  const gRec = { id: SL.DB.uid(), value: 5.6, meal: 'fasting', at: Date.now(), note: '测试' };
  await SL.DB.put('glucoseRecords', gRec);
  ok((await SL.DB.get('glucoseRecords', gRec.id)).value === 5.6, '血糖记录写入/读取');
  await SL.DB.put('glucoseRecords', { id: SL.DB.uid(), value: 3.4, meal: 'beforeLunch', at: Date.now() - 1000 });
  await SL.DB.put('mealRecords', {
    id: SL.DB.uid(), period: 'lunch', at: Date.now() - 3600e3,
    foods: [{ foodId: 'f_rice', name: '白米饭（蒸）', gi: 83, carbs: 25.9, grams: 150, gl: 32.3, carbTotal: 38.85 }],
    totalGL: 32.3, totalCarbs: 38.9, note: ''
  });
  await SL.DB.put('medicationRecords', { id: SL.DB.uid(), name: '二甲双胍', dose: '0.5g', kind: 'oral', at: Date.now() + 3600e3, reminder: true });
  await SL.DB.put('exerciseRecords', { id: SL.DB.uid(), type: 'walk', duration: 30, intensity: 'moderate', at: Date.now() - 7200e3, estimatedDrop: 0.9 });

  const dayRecs = await SL.DB.rangeByTime('glucoseRecords', SL.U.startOfDay(Date.now()), SL.U.endOfDay(Date.now()));
  ok(dayRecs.length === 2, '按时间区间查询（今天 2 条）');

  console.log('--- 视图渲染（无异常 + 生成 DOM）---');
  const root = document.getElementById('view-root');
  for (const name of ['dashboard', 'glucose', 'diet', 'medication', 'exercise', 'trends', 'reports', 'knowledge', 'settings']) {
    await SL.Views[name](root);
    await sleep(120);
    ok(root.innerHTML.length > 100, name + ' 渲染非空 (' + root.innerHTML.length + ' chars)');
  }

  // 首次向导不应在已有 profile 时弹出（这里 profile 是默认空的，dashboard 会弹；关闭它）
  let wizard = document.querySelector('.modal');
  if (wizard) wizard.querySelector('.modal-close').click();
  await sleep(50);

  console.log('--- 低血糖预警弹窗 ---');
  let modalOpened = false;
  const origOpen = SL.UI.openModal;
  SL.UI.openModal = function () { modalOpened = true; return origOpen.apply(this, arguments); };
  SL.App.checkLowGlucoseAfterSave({ value: 3.2, meal: 'beforeDinner' });
  ok(modalOpened, '记录低血糖时弹出处理步骤');
  ok(document.querySelector('.modal') !== null, '弹窗 DOM 存在');
  ok(document.querySelector('.kb-steps') !== null, '弹窗含 15-15 处理步骤');
  document.querySelector('.modal-close').click();
  SL.UI.openModal = origOpen;

  console.log('--- 图表 ---');
  const lc = SL.Charts.line([{ x: 0, y: 5 }, { x: 1, y: 8 }, { x: 2, y: 6 }], { xDomain: [0, 2], yDomain: [0, 12] });
  const bc = SL.Charts.bar([{ label: 'a', value: 6 }, { label: 'b', value: 9 }], { zone: { from: 4.4, to: 10 } });
  const sc = SL.Charts.scatter([{ x: 20, y: 8 }, { x: 30, y: 9 }, { x: 50, y: 11 }], {});
  ok(lc.querySelector('path') && bc.querySelector('rect') && sc.querySelector('circle'), '三种 SVG 图表生成');
  ok(SL.U.pearson([1, 2, 3], [2, 4, 6]) > 0.99, 'Pearson 相关系数正确');

  console.log('--- 报告 ---');
  await SL.Views.reports(root);
  await sleep(100);
  ok(root.innerHTML.indexOf('SugarLog 血糖管理报告') >= 0, '报告预览含标题');
  ok(root.innerHTML.indexOf('估算糖化') >= 0, '报告含糖化估算');
  ok(root.querySelectorAll('#report-preview table').length >= 5, '报告含多张统计表');

  console.log('--- 导出 ---');
  let downloaded = null;
  SL.UI.download = (name, content) => { downloaded = { name, content }; };
  const meds = await SL.DB.all('medicationRecords');
  SL.Views.medication.exportList(meds);
  ok(downloaded && downloaded.name.indexOf('用药清单') >= 0, '用药清单 TXT 导出');
  ok(downloaded.content.indexOf('二甲双胍') >= 0, '清单含药物名称');

  console.log('--- 知识库 ---');
  const lowKb = SL.KNOWLEDGE.find(k => k.id === 'kb_low');
  ok(!!lowKb.sections.find(s2 => s2.steps && s2.steps.join().indexOf('15') >= 0), '低血糖 15-15 法则');
  ok(SL.KNOWLEDGE.find(k => k.id === 'kb_target'), '达标标准条目存在');

  console.log('--- 备份恢复 ---');
  let backup = null;
  SL.UI.download = (name, content) => { backup = { name, content }; };
  // 直接调内部逻辑：通过 settings 视图按钮触发较复杂，这里验证 DB 层
  const dump = {
    glucose: await SL.DB.all('glucoseRecords'),
    meals: await SL.DB.all('mealRecords')
  };
  const parsed = JSON.parse(JSON.stringify(dump));
  ok(parsed.glucose.length >= 2 && parsed.meals.length >= 1, '数据可序列化备份');

  console.log('--- 清理 ---');
  await SL.DB.delete('glucoseRecords', gRec.id);
  ok(!(await SL.DB.get('glucoseRecords', gRec.id)), '删除记录成功');

  console.log('\n==============================');
  console.log('PASS ' + pass + '  FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
