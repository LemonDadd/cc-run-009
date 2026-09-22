/* =========================================================
 * SugarLog · 业务规则与工具
 * 单位换算 / 血糖四档判断 / GL / HbA1c 估算 / 日期处理
 * 内部一律以 mmol/L 存储
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});

  var U = {};

  /* ---------------- 单位 ---------------- */
  U.MMOL_TO_MGDL = 18.0182;

  U.toDisplay = function (mmol, settings) {
    if (settings && settings.unit === 'mgdl') return mmol * U.MMOL_TO_MGDL;
    return mmol;
  };
  U.toDisp = U.toDisplay;
  U.fromDisplay = function (displayVal, settings) {
    if (settings && settings.unit === 'mgdl') return displayVal / U.MMOL_TO_MGDL;
    return displayVal;
  };
  U.fmtGlucose = function (mmol, settings, digits) {
    if (mmol === null || mmol === undefined || isNaN(mmol)) return '—';
    var v = U.toDisplay(mmol, settings);
    if (digits === undefined) digits = (settings && settings.unit === 'mgdl') ? 0 : 1;
    return (Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits)).toFixed(digits);
  };
  U.unitLabel = function (settings) {
    return settings && settings.unit === 'mgdl' ? 'mg/dL' : 'mmol/L';
  };

  /* ---------------- 餐次定义 ---------------- */
  // 时段类型用于选择目标范围：fasting / before / after / bedtime / dawn / random
  U.MEALS = [
    { key: 'fasting',     label: '空腹',   phase: 'fasting', color: '#7e57c2' },
    { key: 'beforeBF',    label: '早餐前', phase: 'before',  color: '#ff8a65' },
    { key: 'afterBF',     label: '早餐后2h', phase: 'after', color: '#ef5350' },
    { key: 'beforeLunch', label: '午餐前', phase: 'before',  color: '#ff8a65' },
    { key: 'afterLunch',  label: '午餐后2h', phase: 'after', color: '#ef5350' },
    { key: 'beforeDinner',label: '晚餐前', phase: 'before',  color: '#ff8a65' },
    { key: 'afterDinner', label: '晚餐后2h', phase: 'after', color: '#ef5350' },
    { key: 'bedtime',     label: '睡前',   phase: 'bedtime', color: '#5c6bc0' },
    { key: 'dawn',        label: '凌晨',   phase: 'dawn',    color: '#26a69a' },
    { key: 'random',      label: '随机',   phase: 'random',  color: '#78909c' }
  ];
  U.MEAL_MAP = {};
  U.MEALS.forEach(function (m) { U.MEAL_MAP[m.key] = m; });
  U.mealLabel = function (key) { return (U.MEAL_MAP[key] || { label: key || '未标餐次' }).label; };

  U.MEAL_PERIODS = [
    { key: 'breakfast', label: '早餐', emoji: '🌅' },
    { key: 'lunch', label: '午餐', emoji: '☀️' },
    { key: 'dinner', label: '晚餐', emoji: '🌙' },
    { key: 'snack', label: '加餐', emoji: '🍪' }
  ];
  U.MEAL_PERIOD_MAP = {};
  U.MEAL_PERIODS.forEach(function (m) { U.MEAL_PERIOD_MAP[m.key] = m; });

  /**
   * 根据记录时间猜测餐次（饮食记录默认值用）
   */
  U.guessMealPeriod = function (ts) {
    var d = new Date(ts);
    var h = d.getHours();
    if (h < 10) return 'breakfast';
    if (h < 14) return 'lunch';
    if (h < 21) return 'dinner';
    return 'snack';
  };

  /* ---------------- 血糖四档判断 ---------------- */
  // 返回 ok | high | low | danger
  U.classify = function (mmol, mealKey, s) {
    s = s || DB_defaults();
    if (mmol === null || mmol === undefined || isNaN(mmol)) return 'ok';

    if (mmol <= (s.severeLowThreshold || 3.0)) return 'danger';
    if (mmol < (s.lowThreshold || 3.9)) return 'low';
    if (mmol >= (s.highCritical || 16.7)) return 'danger';

    var range = U.targetRange(mealKey, s);
    if (mmol > range.max) return 'high';
    if (mmol < range.min) return 'low';
    return 'ok';
  };

  U.CLASS_LABEL = { ok: '达标', high: '偏高', low: '低血糖', danger: '危险' };

  /** 按时段取目标范围（mmol/L） */
  U.targetRange = function (mealKey, s) {
    s = s || DB_defaults();
    var m = U.MEAL_MAP[mealKey] || U.MEAL_MAP.random;
    switch (m.phase) {
      case 'fasting':
        return { min: n(s.targetFastingMin, 4.4), max: n(s.targetFastingMax, 7.0) };
      case 'before':
        return { min: n(s.targetBeforeMin, 4.4), max: n(s.targetBeforeMax, 7.0) };
      case 'after':
        return { min: n(s.targetAfterMin, 4.4), max: n(s.targetAfterMax, 10.0) };
      case 'bedtime':
        return { min: n(s.targetBedtimeMin, 4.4), max: n(s.targetBedtimeMax, 8.0) };
      case 'dawn':
        // 凌晨按空腹标准判断
        return { min: n(s.targetFastingMin, 4.4), max: n(s.targetFastingMax, 7.0) };
      default:
        return { min: n(s.targetBeforeMin, 4.4), max: n(s.targetAfterMax, 10.0) };
    }
  };
  function n(v, d) { return (v === undefined || v === null || v === '') ? d : Number(v); }
  function DB_defaults() {
    return (SL.DB && SL.DB.defaultSettings) ? SL.DB.defaultSettings() : {};
  }

  /* ---------------- GL 计算 ---------------- */
  /** 单个食物某份量的 GL */
  U.foodGL = function (gi, carbsPer100, grams) {
    if (!gi) return 0;
    return (gi * (carbsPer100 * grams / 100)) / 100;
  };
  U.glBand = function (gl) {
    if (gl < 10) return { key: 'low', label: '低 GL', cls: 'gi-low' };
    if (gl < 20) return { key: 'mid', label: '中 GL', cls: 'gi-mid' };
    return { key: 'high', label: '高 GL', cls: 'gi-high' };
  };
  U.mealGLBand = function (gl) {
    if (gl < 20) return { key: 'low', label: '影响较小', cls: 'ok' };
    if (gl <= 40) return { key: 'mid', label: '中等影响', cls: 'high' };
    return { key: 'high', label: '影响较大', cls: 'danger' };
  };

  U.giBand = function (gi) {
    if (!gi) return { key: 'none', label: '—', cls: 'muted' };
    if (gi <= 55) return { key: 'low', label: '低', cls: 'gi-low' };
    if (gi <= 69) return { key: 'mid', label: '中', cls: 'gi-mid' };
    return { key: 'high', label: '高', cls: 'gi-high' };
  };

  /* ---------------- 统计 ---------------- */
  U.mean = function (arr) {
    if (!arr.length) return null;
    var sum = arr.reduce(function (a, b) { return a + b; }, 0);
    return sum / arr.length;
  };

  /**
   * 糖化血红蛋白估算（ADAG 公式）
   * eHbA1c(%) = (eAG mmol/L + 2.59) / 1.59
   */
  U.estimateHbA1c = function (meanMmol) {
    if (meanMmol === null || meanMmol === undefined) return null;
    return (meanMmol + 2.59) / 1.59;
  };
  /** 糖化估算平均血糖（反向，供说明展示） */
  U.hba1cToMean = function (hba1c) {
    return hba1c * 1.59 - 2.59;
  };

  U.pearson = function (xs, ys) {
    var n2 = xs.length;
    if (n2 < 3) return null;
    var mx = U.mean(xs), my = U.mean(ys);
    var num = 0, dx2 = 0, dy2 = 0;
    for (var i = 0; i < n2; i++) {
      var dx = xs[i] - mx, dy = ys[i] - my;
      num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    if (dx2 === 0 || dy2 === 0) return null;
    return num / Math.sqrt(dx2 * dy2);
  };

  /** 简单线性回归斜率 */
  U.linearSlope = function (xs, ys) {
    var n2 = xs.length;
    if (n2 < 2) return null;
    var mx = U.mean(xs), my = U.mean(ys);
    var num = 0, den = 0;
    for (var i = 0; i < n2; i++) {
      var dx = xs[i] - mx;
      num += dx * (ys[i] - my);
      den += dx * dx;
    }
    return den === 0 ? null : num / den;
  };

  /* ---------------- 日期时间 ---------------- */
  U.pad = function (v) { return v < 10 ? '0' + v : '' + v; };

  U.fmtDate = function (ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };
  U.fmtTime = function (ts) {
    var d = new Date(ts);
    return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };
  U.fmtDateTime = function (ts) { return U.fmtDate(ts) + ' ' + U.fmtTime(ts); };

  U.fmtDateCN = function (ts) {
    var d = new Date(ts);
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + week;
  };

  /** 今天 00:00 */
  U.startOfDay = function (ts) {
    var d = new Date(ts || Date.now());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  U.endOfDay = function (ts) { return U.startOfDay(ts) + 24 * 3600 * 1000 - 1; };

  /** 友好相对时间（今天 08:30 / 昨天 / 3天前） */
  U.fmtRelative = function (ts) {
    var today0 = U.startOfDay(Date.now());
    var that0 = U.startOfDay(ts);
    var diffDays = Math.round((today0 - that0) / (24 * 3600 * 1000));
    var hm = U.fmtTime(ts);
    if (diffDays === 0) return '今天 ' + hm;
    if (diffDays === 1) return '昨天 ' + hm;
    if (diffDays === 2) return '前天 ' + hm;
    if (diffDays < 7) return diffDays + ' 天前';
    return U.fmtDate(ts);
  };

  /** 把 <input type="datetime-local"> 的值转时间戳 */
  U.dtlToTs = function (v) {
    if (!v) return null;
    return new Date(v).getTime();
  };
  U.tsToDtl = function (ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) +
      'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };
  U.tsToDateInput = function (ts) { return U.fmtDate(ts); };

  /** 加天数 */
  U.addDays = function (ts, days) { return ts + days * 24 * 3600 * 1000; };

  U.ageFromBirthday = function (ymd) {
    if (!ymd) return null;
    var b = new Date(ymd + 'T00:00:00');
    var now = new Date();
    var age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() ||
      (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return age >= 0 && age < 120 ? age : null;
  };

  /* ---------------- 数字显示 ---------------- */
  U.fmt1 = function (v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return (Math.round(v * 10) / 10).toFixed(1);
  };
  U.fmtPct = function (v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Math.round(v * 100) + '%';
  };

  SL.U = U;
})(window);
