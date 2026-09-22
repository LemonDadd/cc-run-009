/* 交互流程测试：快速录入表单、图表、提醒调度
   node tests/interactions.test.js */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
});
const { window } = dom;
window.indexedDB = fakeIDB.indexedDB;
window.IDBKeyRange = fakeIDB.IDBKeyRange;
window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now(), 0));
window.cancelAnimationFrame = id => clearTimeout(id);
window.Element.prototype.scrollIntoView = function () {};
window.scrollTo = function () {};

global.window = window;
global.document = window.document;
global.indexedDB = window.indexedDB;
global.IDBKeyRange = window.IDBKeyRange;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => window.document.querySelector(s);

const files = [
  'js/utils.js', 'js/db.js',
  'js/data/foods.js', 'js/data/meds.js', 'js/data/knowledge.js',
  'js/charts.js', 'js/app.js',
  'js/views/home.js', 'js/views/glucose.js', 'js/views/meals.js',
  'js/views/medication.js', 'js/views/exercise.js', 'js/views/trends.js',
  'js/views/reports.js', 'js/views/knowledge.js', 'js/views/settings.js'
];
window.eval(files.map(f => fs.readFileSync(f, 'utf8')).join('\n;\n'));

(async () => {
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await sleep(200);
  const U = window.Utils;

  // ---------- 1. 血糖 3 步录入 ----------
  window.Views.glucose.openForm();
  await sleep(20);
  if (!$('#gValue')) throw new Error('第1步未出现数值输入');
  $('#gValue').value = '6.8';
  $('#gValue').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#gNext').click(); // -> 第2步
  await sleep(10);
  if (!$('#ctxSeg')) throw new Error('第2步时段选择未出现');
  // 选择“空腹”
  $('#ctxSeg').querySelector('[class*="seg-item"]');
  [...$('#ctxSeg').children].find(b => b.textContent.includes('空腹')).click();
  await sleep(10);
  $('#gNext').click(); // -> 第3步
  await sleep(10);
  if (!$('#gAt')) throw new Error('第3步确认页未出现');
  if (!$('#confirmBadge').textContent.includes('达标')) throw new Error('确认页判色不正确');
  $('#gNext').click(); // 保存
  await sleep(50);
  const allG = await window.DB.Glucose.all();
  if (allG.length !== 1 || Math.abs(allG[0].value - 6.8) > 0.01) throw new Error('血糖未正确保存');
  if (allG[0].context !== 'fasting') throw new Error('时段未保存为空腹');
  console.log('✓ 血糖3步录入：6.8 空腹 已保存，判定达标');

  // 低血糖录入应弹预警
  window.Views.glucose.openForm();
  await sleep(10);
  $('#gValue').value = '3.2';
  $('#gValue').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#gNext').click(); await sleep(10);
  $('#gNext').click(); await sleep(10); // 第3步（默认 random）
  $('#gNext').click(); await sleep(50); // 保存
  if ($('#modal').hidden) throw new Error('低血糖预警未弹出');
  if (!$('#modal').textContent.includes('15g')) throw new Error('预警缺少15g快糖步骤');
  $('#alertClose').click();
  console.log('✓ 低血糖 3.2 录入后自动弹出 15-15 急救步骤');

  // ---------- 2. 趋势日视图折线图 ----------
  const view = $('#view');
  window.location.hash = '#/trends';
  await window.Views.trends.mount(view);
  await sleep(30);
  const svg = $('#chartBox svg');
  if (!svg) throw new Error('日视图折线图未渲染');
  const dots = svg.querySelectorAll('circle');
  if (dots.length < 2) throw new Error('折线图数据点不足: ' + dots.length);
  console.log('✓ 日趋势折线图渲染，数据点', dots.length, '个');

  // 切到周视图（柱状）
  [...$('#periodTabs').children].find(b => b.dataset.p === 'week').click();
  await sleep(30);
  if (!$('#chartBox svg rect')) throw new Error('周视图柱状图未渲染');
  console.log('✓ 周趋势柱状图渲染');

  // ---------- 3. 用药表单 + 每日提醒 ----------
  window.Views.medication.openForm();
  await sleep(20);
  $('#medName').value = '甘精胰岛素（长效）';
  $('#medName').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(20);
  if ($('#medUnit').value !== 'U') throw new Error('选择胰岛素后单位未自动切换为 U');
  $('#medDose').value = '12';
  $('#medDose').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#medRemind').click();
  await sleep(10);
  $('#medRemindTime').value = '21:00';
  $('#medOk').click();
  await sleep(50);
  const meds = await window.DB.Medication.all();
  if (!meds.length || meds[0].name.includes('甘精') === false) throw new Error('用药未保存');
  const rems = await window.DB.Reminders.all();
  const medRem = rems.find(r => r.kind === 'medication' && r.repeat === 'daily');
  if (!medRem || !medRem.title.includes('甘精')) throw new Error('每日用药提醒未创建');
  console.log('✓ 胰岛素记录 + 每日21:00用药提醒已创建');

  // ---------- 4. 到期提醒触发 ----------
  const now = Date.now();
  await window.DB.Reminders.save({
    kind: 'glucose', repeat: 'once', title: '该测睡前血糖啦', at: now - 1000, enabled: true
  });
  sessionStorage.clear();
  await window.App.checkReminders();
  await sleep(30);
  if ($('#modal').hidden || !$('#modal').textContent.includes('睡前血糖')) {
    throw new Error('到期提醒未弹窗');
  }
  console.log('✓ 到期提醒自动弹窗');
  // “稍后提醒”延后10分钟
  $('#rmLater').click();
  await sleep(30);
  const updated = (await window.DB.Reminders.all()).find(r => r.title === '该测睡前血糖啦');
  if (updated.at < now + 9 * 60000) throw new Error('延后10分钟未生效');
  console.log('✓ “稍后提醒”正确延后 10 分钟');

  // ---------- 5. 运动估算 ----------
  const est = window.MedData.estimateExerciseEffect('jog', 30);
  if (!(est.drop > 1)) throw new Error('慢跑30分钟降糖估算异常: ' + est.drop);
  console.log('✓ 运动降糖估算：慢跑30分钟 ≈', est.drop.toFixed(1), 'mmol/L');

  console.log('\n全部交互流程测试通过 🎉');
  process.exit(0);
})().catch(e => { console.error('✗ 失败:', e); process.exit(1); });
