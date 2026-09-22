/* ============================================================
   utils.js — 纯逻辑工具：单位换算 / 血糖达标判断 / GL / 日期
   可在浏览器与 Node 中运行（用于规则自测）
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof window !== 'undefined') window.Utils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 单位 ----------
  // 内部统一以 mmol/L 存储
  function mmolToMgdl(v) { return v * 18; }
  function mgdlToMmol(v) { return v / 18; }

  function toMmol(value, unit) {
    const n = Number(value);
    return unit === 'mg/dL' ? mgdlToMmol(n) : n;
  }
  function fromMmol(mmol, unit) {
    return unit === 'mg/dL' ? mmolToMgdl(mmol) : mmol;
  }
  // 显示：mmol 保留 1 位，mg/dL 取整
  function displayValue(mmol, unit) {
    const v = fromMmol(mmol, unit);
    return unit === 'mg/dL' ? String(Math.round(v)) : v.toFixed(1);
  }
  function unitLabel(unit) { return unit === 'mg/dL' ? 'mg/dL' : 'mmol/L'; }

  // ---------- 血糖达标判断 ----------
  // 时段标签
  const CONTEXT_LABELS = {
    fasting: '空腹',
    before_meal: '餐前',
    after_meal: '餐后2小时',
    bedtime: '睡前',
    night: '凌晨',
    random: '随机'
  };
  const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

  // 一般成人（非孕期）默认目标范围 mmol/L
  const DEFAULT_TARGETS = {
    fasting: { low: 4.4, high: 7.0 },
    before_meal: { low: 4.4, high: 7.0 },
    after_meal: { low: 4.4, high: 10.0 },
    bedtime: { low: 4.4, high: 10.0 },
    night: { low: 4.4, high: 9.0 },
    random: { low: 4.4, high: 10.0 }
  };
  // 低血糖阈值（接受降糖治疗者）
  const HYPO_THRESHOLD = 3.9;
  const SEVERE_HYPO = 3.0;   // 严重低血糖
  const DANGER_HIGH = 16.7;  // 危险高血糖
  const HIGH_WARN = 13.9;    // 高血糖警示（建议查酮体）

  /**
   * 判断血糖状态
   * @returns {{status:'ok'|'high'|'low'|'danger', label:string, message:string}}
   */
  function evaluateGlucose(mmol, context, targets) {
    targets = targets || DEFAULT_TARGETS;
    const range = targets[context] || targets.random;

    // 1. 紧急/低血糖优先（阈值优先于个人目标，避免高目标下限掩盖低血糖）
    if (mmol < SEVERE_HYPO) {
      return {
        status: 'danger',
        label: '严重低血糖',
        message: `血糖低于 ${SEVERE_HYPO} mmol/L，属于严重低血糖，请立即按急救步骤处理！`
      };
    }
    if (mmol < HYPO_THRESHOLD) {
      return {
        status: 'low',
        label: '低血糖',
        message: `血糖低于 ${HYPO_THRESHOLD} mmol/L（低血糖标准），请立即补充 15g 快速糖并 15 分钟后复测。`
      };
    }
    // 2. 危险高血糖
    if (mmol >= DANGER_HIGH) {
      return {
        status: 'danger',
        label: '危险高血糖',
        message: `血糖达到 ${DANGER_HIGH} mmol/L 以上，请立即补充水分、按医嘱处理，若伴不适或持续不降需尽快就医。`
      };
    }
    // 3. 与目标范围比较
    if (mmol > range.high) {
      return {
        status: 'high',
        label: '偏高',
        message: `高于${CONTEXT_LABELS[context] || '该时段'}目标上限 ${range.high.toFixed(1)} mmol/L，注意饮食与用药。`
      };
    }
    if (mmol < range.low) {
      return {
        status: 'low',
        label: '偏低',
        message: `略低于${CONTEXT_LABELS[context] || '该时段'}目标下限 ${range.low.toFixed(1)} mmol/L，注意防范低血糖。`
      };
    }
    return { status: 'ok', label: '达标', message: '处于该时段目标范围内，继续保持！' };
  }

  const STATUS_LABELS = { ok: '达标', high: '偏高', low: '偏低/低血糖', danger: '危险' };

  // ---------- GI / GL ----------
  function giLevel(gi) {
    if (gi < 55) return { label: '低GI', cls: 'g-ok' };
    if (gi <= 70) return { label: '中GI', cls: 'g-high' };
    return { label: '高GI', cls: 'g-danger' };
  }
  // GL = GI × 碳水(g) / 100
  function calcGL(gi, carbsPer100g, portionGrams) {
    return (gi * (carbsPer100g * portionGrams / 100)) / 100;
  }
  function glLevel(gl) {
    if (gl <= 10) return { label: '低GL', cls: 'g-ok' };
    if (gl <= 20) return { label: '中GL', cls: 'g-high' };
    return { label: '高GL', cls: 'g-danger' };
  }

  // ---------- 糖化估算 ----------
  // eA1C(%) = (平均血糖 mmol/L + 2.59) / 1.59  —— ADA 换算
  function estimateHbA1c(avgMmol) {
    if (avgMmol == null || isNaN(avgMmol)) return null;
    return (avgMmol + 2.59) / 1.59;
  }

  // ---------- 日期时间 ----------
  const DAY_MS = 86400000;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function ymd(d) {
    d = d instanceof Date ? d : new Date(d);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function hm(d) {
    d = d instanceof Date ? new Date(d) : new Date(d);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function ymdhm(d) {
    d = d instanceof Date ? d : new Date(d);
    return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function friendlyDate(isoDate) {
    const today = ymd(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = ymd(y);
    if (isoDate === today) return '今天';
    if (isoDate === yesterday) return '昨天';
    const d = new Date(isoDate + 'T00:00:00');
    const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 ${wk}`;
  }
  function friendlyDateTime(ts) {
    const d = new Date(ts);
    return `${friendlyDate(ymd(d))} ${hm(d)}`;
  }
  function relativeFromNow(ts) {
    const diff = ts - Date.now();
    const abs = Math.abs(diff);
    const fwd = diff > 0;
    let txt;
    if (abs < DAY_MS) {
      const h = Math.round(abs / 3600000);
      txt = h < 1 ? `${Math.max(1, Math.round(abs / 60000))} 分钟` : `${h} 小时`;
    } else {
      txt = `${Math.round(abs / DAY_MS)} 天`;
    }
    return fwd ? `${txt}后` : `${txt}前`;
  }

  function startOfDay(d) {
    const x = d ? new Date(d) : new Date();
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

  // 某时间点最可能的餐次
  function inferMealByHour(date) {
    const h = date.getHours();
    if (h >= 5 && h < 10) return 'breakfast';
    if (h >= 10 && h < 16) return 'lunch';
    if (h >= 16 && h < 21) return 'dinner';
    return 'snack';
  }
  // 由时间推断血糖时段
  function inferContext(date) {
    const h = date.getHours();
    if (h >= 2 && h < 5) return 'night';
    if (h >= 6 && h < 9) return 'fasting';
    if (h >= 21 || h < 2) return 'bedtime';
    return 'random';
  }

  // 统计：平均
  function avg(arr) {
    if (!arr || !arr.length) return null;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  }
  function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }

  // TIR（按记录条数计）
  function tirStats(records, targets) {
    const total = records.length;
    if (!total) return { total: 0, ok: 0, high: 0, low: 0, danger: 0, okRate: null };
    const c = { ok: 0, high: 0, low: 0, danger: 0 };
    records.forEach(r => { c[evaluateGlucose(r.value, r.context, targets).status]++; });
    return {
      total,
      ok: c.ok,
      high: c.high,
      low: c.low,
      danger: c.danger,
      okRate: c.ok / total
    };
  }

  return {
    mmolToMgdl, mgdlToMmol, toMmol, fromMmol, displayValue, unitLabel,
    CONTEXT_LABELS, MEAL_LABELS, DEFAULT_TARGETS,
    HYPO_THRESHOLD, SEVERE_HYPO, DANGER_HIGH, HIGH_WARN,
    evaluateGlucose, STATUS_LABELS,
    giLevel, calcGL, glLevel,
    estimateHbA1c,
    pad2, ymd, hm, ymdhm, friendlyDate, friendlyDateTime, relativeFromNow,
    startOfDay, addDays, addMonths, inferMealByHour, inferContext,
    avg, round1, tirStats, DAY_MS
  };
});
