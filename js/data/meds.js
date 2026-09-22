/* ============================================================
   data/meds.js — 常用药物提示库 + 运动类型与降糖估算
   仅用于记录时的名称/单位提示，不构成用药建议。
   ============================================================ */
(function (root) {
  'use strict';

  const MED_SUGGESTIONS = [
    // 口服降糖药
    { name: '二甲双胍', type: 'oral', doseUnit: 'mg', times: ['早餐后', '晚餐后'], note: '常见胃肠道反应，随餐服用' },
    { name: '格列美脲', type: 'oral', doseUnit: 'mg', times: ['早餐前'], note: '注意低血糖' },
    { name: '格列齐特缓释片', type: 'oral', doseUnit: 'mg', times: ['早餐前'], note: '注意低血糖' },
    { name: '西格列汀', type: 'oral', doseUnit: 'mg', times: ['早餐前'], note: '' },
    { name: '达格列净', type: 'oral', doseUnit: 'mg', times: ['早餐前'], note: '多饮水，注意泌尿感染' },
    { name: '恩格列净', type: 'oral', doseUnit: 'mg', times: ['早餐前'], note: '多饮水，注意泌尿感染' },
    { name: '阿卡波糖', type: 'oral', doseUnit: 'mg', times: ['随第一口饭'], note: '与主食同时嚼服' },
    { name: '利格列汀', type: 'oral', doseUnit: 'mg', times: ['早餐前'], note: '' },
    { name: '瑞格列奈', type: 'oral', doseUnit: 'mg', times: ['三餐前15分钟'], note: '不吃饭不服药' },
    // 胰岛素
    { name: '门冬胰岛素（速效）', type: 'insulin', doseUnit: 'U', times: ['三餐前'], note: '注射后约10-15分钟进餐' },
    { name: '赖脯胰岛素（速效）', type: 'insulin', doseUnit: 'U', times: ['三餐前'], note: '' },
    { name: '重组人胰岛素（短效）', type: 'insulin', doseUnit: 'U', times: ['三餐前30分钟'], note: '' },
    { name: '低精蛋白锌胰岛素（中效NPH）', type: 'insulin', doseUnit: 'U', times: ['睡前'], note: '' },
    { name: '甘精胰岛素（长效）', type: 'insulin', doseUnit: 'U', times: ['固定时间，每日1次'], note: '每日固定时间' },
    { name: '地特胰岛素（长效）', type: 'insulin', doseUnit: 'U', times: ['固定时间，每日1次'], note: '' },
    { name: '德谷胰岛素（超长效）', type: 'insulin', doseUnit: 'U', times: ['固定时间，每日1次'], note: '' },
    { name: '预混胰岛素 30R', type: 'insulin', doseUnit: 'U', times: ['早餐前', '晚餐前'], note: '注射后按时进餐，防低血糖' }
  ];

  const MED_TYPE_LABELS = { oral: '口服药', insulin: '胰岛素' };

  // ---------- 运动类型 ----------
  // dropPerHour：中等体重成人参考“每小时可降低血糖幅度(mmol/L)”，
  // 仅作粗略估算；同时根据强度给系数。
  const EXERCISE_TYPES = [
    { id: 'walk_fast', name: '快走', intensity: 'moderate', factor: 1.4 },
    { id: 'walk_slow', name: '散步', intensity: 'light', factor: 0.7 },
    { id: 'jog', name: '慢跑', intensity: 'vigorous', factor: 2.4 },
    { id: 'cycling', name: '骑行', intensity: 'moderate', factor: 1.8 },
    { id: 'swim', name: '游泳', intensity: 'vigorous', factor: 2.6 },
    { id: 'taiji', name: '太极/八段锦', intensity: 'light', factor: 0.8 },
    { id: 'dance', name: '广场舞/健身操', intensity: 'moderate', factor: 1.6 },
    { id: 'strength', name: '力量训练', intensity: 'vigorous', factor: 1.9 },
    { id: 'pingpong', name: '乒乓球/羽毛球', intensity: 'moderate', factor: 1.7 },
    { id: 'housework', name: '家务劳动', intensity: 'light', factor: 0.6 },
    { id: 'other', name: '其他', intensity: 'moderate', factor: 1.0 }
  ];
  const INTENSITY_LABELS = { light: '轻度', moderate: '中等', vigorous: '剧烈' };

  /**
   * 估算运动对血糖的影响
   * 估算降幅 mmol/L ≈ factor × 时长(分钟)/60 × 体重修正(默认1)
   * 力量训练/高强度可能先升后降，给出提示。
   */
  function estimateExerciseEffect(typeId, minutes) {
    const t = EXERCISE_TYPES.find(x => x.id === typeId) || EXERCISE_TYPES[EXERCISE_TYPES.length - 1];
    const drop = Utils.round1(t.factor * (Number(minutes) || 0) / 60);
    let advice = '';
    if (t.intensity === 'vigorous') {
      advice = '剧烈运动可能先使血糖短暂升高，运动后数小时仍有降糖作用，需警惕延迟性低血糖。';
    } else if (t.intensity === 'moderate') {
      advice = '中等强度有氧可增加胰岛素敏感性；使用胰岛素或促泌剂者建议运动前后测血糖，必要时加餐。';
    } else {
      advice = '轻度运动有助于平稳血糖，餐后30-60分钟进行较合适。';
    }
    return { type: t, drop, advice };
  }

  root.MedData = {
    MED_SUGGESTIONS, MED_TYPE_LABELS,
    EXERCISE_TYPES, INTENSITY_LABELS, estimateExerciseEffect
  };
})(window);
