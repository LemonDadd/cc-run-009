/* 规则自测：node tests/rules.test.js */
const assert = require('assert');
const U = require('../js/utils.js');

const T = U.DEFAULT_TARGETS;

// 单位换算
assert.strictEqual(U.mmolToMgdl(7), 126);
assert.strictEqual(Math.round(U.mgdlToMmol(126) * 10) / 10, 7);
assert.strictEqual(U.displayValue(6.78, 'mmol/L'), '6.8');
assert.strictEqual(U.displayValue(U.mgdlToMmol(126), 'mg/dL'), '126');

// 达标四色判断
assert.strictEqual(U.evaluateGlucose(5.5, 'fasting').status, 'ok');
assert.strictEqual(U.evaluateGlucose(8.2, 'fasting').status, 'high');
assert.strictEqual(U.evaluateGlucose(3.7, 'fasting').status, 'low');
assert.strictEqual(U.evaluateGlucose(4.2, 'fasting').status, 'low');
assert.strictEqual(U.evaluateGlucose(2.6, 'fasting').status, 'danger');
assert.strictEqual(U.evaluateGlucose(17, 'after_meal').status, 'danger');
assert.strictEqual(U.evaluateGlucose(10.5, 'after_meal').status, 'high');
assert.strictEqual(U.evaluateGlucose(9.9, 'after_meal').status, 'ok');
assert.strictEqual(U.evaluateGlucose(9.5, 'night').status, 'high');
assert.strictEqual(U.evaluateGlucose(3.5, 'random').label, '低血糖');

// GL
const glRice = U.calcGL(83, 25.9, 150);
assert.ok(glRice > 20, '白米饭150g应是高GL');
assert.strictEqual(U.glLevel(8).label, '低GL');
assert.strictEqual(U.glLevel(15).label, '中GL');
assert.strictEqual(U.glLevel(22).label, '高GL');
assert.ok(U.calcGL(72, 5.8, 200) < 10, '西瓜200g应低GL');

// GI 分级
assert.strictEqual(U.giLevel(40).label, '低GI');
assert.strictEqual(U.giLevel(60).label, '中GI');
assert.strictEqual(U.giLevel(80).label, '高GI');

// HbA1c 估算
const a1c = U.estimateHbA1c(8.6);
assert.ok(Math.abs(a1c - 7.04) < 0.05);

// 日期与推断
assert.strictEqual(U.ymd(new Date(2026, 0, 5)), '2026-01-05');
assert.strictEqual(U.inferMealByHour(new Date(2026, 0, 1, 8, 0)), 'breakfast');
assert.strictEqual(U.inferMealByHour(new Date(2026, 0, 1, 12, 30)), 'lunch');
assert.strictEqual(U.inferMealByHour(new Date(2026, 0, 1, 19, 0)), 'dinner');
assert.strictEqual(U.inferContext(new Date(2026, 0, 1, 3, 0)), 'night');
assert.strictEqual(U.inferContext(new Date(2026, 0, 1, 7, 0)), 'fasting');
assert.strictEqual(U.inferContext(new Date(2026, 0, 1, 22, 0)), 'bedtime');

// TIR
const recs = [
  { value: 5.5, context: 'fasting' },
  { value: 9, context: 'after_meal' },
  { value: 12, context: 'after_meal' },
  { value: 3.5, context: 'before_meal' }
];
const st = U.tirStats(recs, T);
assert.strictEqual(st.total, 4);
assert.strictEqual(st.ok, 2);
assert.strictEqual(st.high, 1);
assert.strictEqual(st.low, 1);
assert.strictEqual(st.okRate, 0.5);
assert.deepStrictEqual(U.tirStats([], T).okRate, null);

console.log('白米饭150g GL =', glRice.toFixed(1), '| 西瓜200g GL =', U.calcGL(72, 5.8, 200).toFixed(1));
console.log('eA1c(avg 8.6) =', a1c.toFixed(2) + '%');
console.log('全部规则测试通过 ✓');
