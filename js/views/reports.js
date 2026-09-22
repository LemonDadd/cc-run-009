/* views/reports.js — 报告导出：血糖趋势 + 用药 + 饮食要点，打印PDF / 导TXT */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, toast, download, confirmDialog } = App;
  const U = Utils;

  let fromDate = U.ymd(U.addDays(new Date(), -29));
  let toDate = U.ymd(new Date());

  async function mount(root) {
    const profile = App.State.profile;

    const card = el('section', { class: 'card' });
    card.innerHTML = `
      <h2 class="card-title">📄 生成就诊报告</h2>
      <p class="muted small" style="margin-top:0">报告包含：血糖趋势与达标情况、低血糖/高血糖事件、用药记录、饮食要点（GL/碳水）、运动情况。可直接打印或"另存为 PDF"带给医生。</p>
      <div class="row">
        <label class="field" style="flex:1;margin:0"><span>开始日期</span>
          <input type="date" id="rptFrom" value="${fromDate}"></label>
        <span style="padding-top:22px">至</span>
        <label class="field" style="flex:1;margin:0"><span>结束日期</span>
          <input type="date" id="rptTo" value="${toDate}"></label>
      </div>
      <div class="seg" style="margin:6px 0 4px">
        <button class="seg-item" data-quick="7">近7天</button>
        <button class="seg-item" data-quick="30">近30天</button>
        <button class="seg-item" data-quick="90">近90天</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="genRpt"><svg class="icon"><use href="#i-report"/></svg>生成报告</button>
        <button class="btn btn-secondary" id="printRpt" disabled><svg class="icon"><use href="#i-print"/></svg>打印 / 另存PDF</button>
        <button class="btn btn-secondary" id="txtRpt" disabled><svg class="icon"><use href="#i-download"/></svg>导出文本(.txt)</button>
      </div>
      <p class="muted small">${profile.name ? '报告人：' + esc(profile.name) + '　' : ''}数据仅来自本应用内的自我记录，供医生参考。</p>`;
    root.appendChild(card);

    const previewCard = el('section', { class: 'report-doc', id: 'rptPreview' }, [
      el('div', { class: 'empty' }, [
        el('svg', { class: 'icon' }, [el('use', { href: '#i-report' })]),
        el('p', { html: '<strong>选择日期范围后点击"生成报告"</strong>' })
      ])
    ]);
    root.appendChild(previewCard);

    card.querySelector('#rptFrom').addEventListener('change', e => { fromDate = e.target.value; });
    card.querySelector('#rptTo').addEventListener('change', e => { toDate = e.target.value; });
    card.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => {
      const n = Number(b.dataset.quick);
      toDate = U.ymd(new Date());
      fromDate = U.ymd(U.addDays(new Date(), -(n - 1)));
      card.querySelector('#rptFrom').value = fromDate;
      card.querySelector('#rptTo').value = toDate;
    }));

    let reportData = null;
    card.querySelector('#genRpt').addEventListener('click', async () => {
      if (!fromDate || !toDate || fromDate > toDate) return toast('请选择正确的日期范围');
      reportData = await buildReport(fromDate, toDate);
      renderPreview(previewCard, reportData);
      card.querySelector('#printRpt').disabled = false;
      card.querySelector('#txtRpt').disabled = false;
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('#printRpt').addEventListener('click', () => window.print());
    card.querySelector('#txtRpt').addEventListener('click', () => {
      if (!reportData) return;
      download(`SugarLog控糖报告_${fromDate}_${toDate}.txt`, reportData.text, 'text/plain');
      toast('文本报告已导出');
    });
  }

  async function buildReport(from, to) {
    const fromTs = U.startOfDay(new Date(from + 'T00:00:00')).getTime();
    const toTs = U.startOfDay(new Date(to + 'T00:00:00')).getTime() + U.DAY_MS;
    const unit = App.State.settings.unit;
    const targets = App.currentTargets();
    const p = App.State.profile;

    const [glucose, meals, meds, exercise] = await Promise.all([
      DB.Glucose.between(fromTs, toTs),
      DB.Meals.between(fromTs, toTs),
      DB.Medication.between(fromTs, toTs),
      DB.Exercise.between(fromTs, toTs)
    ]);
    glucose.sort((a, b) => a.at - b.at);

    const vals = glucose.map(r => r.value);
    const avg = U.round1(U.avg(vals));
    const a1c = U.estimateHbA1c(avg);
    const st = U.tirStats(glucose, targets);
    const hypos = glucose.filter(r => r.value < U.HYPO_THRESHOLD);
    const highs = glucose.filter(r => r.value >= 10 && r.context !== 'fasting' && r.context !== 'before_meal'
      ? r.value > targets[r.context].high
      : r.value > (targets[r.context] ? targets[r.context].high : 10));
    const danger = glucose.filter(r => r.value >= U.DANGER_HIGH || r.value < U.SEVERE_HYPO);

    // 按时段平均
    const byCtx = {};
    glucose.forEach(r => { (byCtx[r.context] = byCtx[r.context] || []).push(r.value); });

    // 饮食
    const avgGL = meals.length ? U.round1(meals.reduce((s, m) => s + (m.totalGL || 0), 0) / meals.length) : null;
    const avgCarbs = meals.length ? U.round1(meals.reduce((s, m) => s + (m.carbs || 0), 0) / meals.length) : null;
    const highGLMeals = meals.filter(m => (m.totalGL || 0) > 20)
      .sort((a, b) => b.totalGL - a.totalGL).slice(0, 5);

    // 用药聚合
    const medMap = new Map();
    meds.forEach(m => {
      const k = m.name + '|' + (m.unit || '');
      if (!medMap.has(k)) medMap.set(k, { name: m.name, unit: m.unit, type: m.medType, doses: [], schedules: new Set() });
      const x = medMap.get(k);
      x.doses.push(m.dose);
      if (m.schedule) x.schedules.add(m.schedule);
    });

    // 关联
    const links = analyzeLinks(glucose, meals);
    const avgDelta = links.length ? U.round1(links.reduce((s, l) => s + l.delta, 0) / links.length) : null;

    const dietTips = buildDietTips(avgGL, avgCarbs, highGLMeals, avgDelta);
    const glucoseTrendText = describeTrend(glucose);

    return {
      from, to, unit, profile: p,
      glucose, count: glucose.length, avg, a1c, st, hypos, highs, danger,
      byCtx, meals, meds: [...medMap.values()], medRawCount: meds.length,
      exercise, exMin: exercise.reduce((s, e) => s + e.minutes, 0),
      avgGL, avgCarbs, highGLMeals, links: links.slice().reverse().slice(0, 5), avgDelta,
      dietTips, glucoseTrendText,
      text: ''
    };
  }

  function buildDietTips(avgGL, avgCarbs, highGLMeals, avgDelta) {
    const tips = [];
    if (avgGL != null && avgGL > 20) tips.push('平均每餐 GL 偏高，建议主食减量 1/4、粗细搭配，先菜后饭、细嚼慢咽。');
    else if (avgGL != null) tips.push('每餐 GL 总体可控，继续保持主食定量、均衡搭配。');
    if (avgCarbs != null && avgCarbs > 80) tips.push('单餐平均碳水偏高（>80g），可把主食分一部分到两餐之间加餐。');
    if (highGLMeals.length) tips.push('高 GL 餐多出现在：' +
      highGLMeals.slice(0, 3).map(m => `${U.MEAL_LABELS[m.meal] || ''}（GL${U.round1(m.totalGL).toFixed(0)}）`).join('、') +
      '，这些餐可优先复盘食物种类与份量。');
    if (avgDelta != null && avgDelta > 2.5) tips.push('餐后血糖平均升高较多，建议餐后 20~30 分钟散步并减少粥、泥糊类高糊化主食。');
    if (!tips.length) tips.push('记录更多正餐与餐后血糖后，可获得更具体的饮食建议。');
    return tips;
  }

  function describeTrend(glucose) {
    if (glucose.length < 4) return '记录次数较少，建议增加监测频率以观察趋势。';
    const half = Math.floor(glucose.length / 2);
    const a = U.avg(glucose.slice(0, half).map(r => r.value));
    const b = U.avg(glucose.slice(half).map(r => r.value));
    const d = U.round1(b - a);
    if (Math.abs(d) < 0.3) return `报告期内血糖总体平稳（前后半段均值变化 ${d} mmol/L）。`;
    return d > 0
      ? `报告期后段平均血糖较前段上升约 ${Math.abs(d)} mmol/L，请注意复盘饮食、用药与作息变化。`
      : `报告期后段平均血糖较前段下降约 ${Math.abs(d)} mmol/L，控制有改善，继续保持。`;
  }

  function analyzeLinks(glucose, meals) {
    return glucose.filter(r => r.context === 'after_meal').map(post => {
      const meal = meals.filter(m => m.meal !== 'snack' &&
        post.at - m.at >= 80 * 60000 && post.at - m.at <= 3 * 3600000)
        .sort((a, b) => b.at - a.at)[0];
      if (!meal) return null;
      const before = glucose.find(g =>
        (g.context === 'before_meal' || g.context === 'fasting') &&
        g.at >= meal.at - 40 * 60000 && g.at <= meal.at + 15 * 60000);
      if (!before) return null;
      return { meal, post, delta: post.value - before.value };
    }).filter(Boolean);
  }

  function renderPreview(container, r) {
    const unit = r.unit;
    const fmt = v => U.displayValue(v, unit);
    const p = r.profile || {};
    const typeMap = { type1: '1型糖尿病', type2: '2型糖尿病', gdm: '妊娠糖尿病', other: '其他类型', '': '未填写' };

    const rows = [];
    const L = (...xs) => rows.push(xs.join(''));
    L('============================================================');
    L('              SugarLog 控糖日记 · 就诊报告');
    L('============================================================');
    L(`报告区间：${r.from} 至 ${r.to}`);
    L(`生成时间：${new Date().toLocaleString('zh-CN')}`);
    L(`患者：${p.name || '（未填写昵称）'}　糖尿病类型：${typeMap[p.diabetesType] || p.diabetesType || '—'}`);
    if (p.diagnosisYear) L(`诊断年份：${p.diagnosisYear}`);
    L('');
    L('一、血糖总体情况');
    L(`记录次数：${r.count} 次`);
    if (r.count) {
      L(`平均血糖：${r.avg != null ? fmt(r.avg) + ' ' + U.unitLabel(unit) : '—'}`);
      L(`糖化血红蛋白估算 eA1c：${r.a1c != null ? r.a1c.toFixed(1) + '%' : '—'}（由平均血糖估算，不能替代化验）`);
      L(`达标率：${r.st.okRate != null ? Math.round(r.st.okRate * 100) + '%' : '—'}（达标 ${r.st.ok}/${r.st.total}）`);
      L(`低血糖(<3.9)：${r.hypos.length} 次；危险值(≥16.7或<3.0)：${r.danger.length} 次`);
      L(`趋势：${r.glucoseTrendText}`);
      L('各时段平均：');
      Object.entries(r.byCtx).forEach(([k, arr]) => {
        L(`  · ${U.CONTEXT_LABELS[k] || k}：${fmt(U.round1(U.avg(arr)))} ${U.unitLabel(unit)}（${arr.length}次）`);
      });
    }
    L('');
    L('二、用药情况（' + r.medRawCount + ' 次记录）');
    if (!r.meds.length) L('  本区间无用药记录');
    r.meds.forEach(m => {
      const doses = m.doses.map(Number);
      L(`  · ${m.name}（${MedData.MED_TYPE_LABELS[m.type] || ''}）：${doses[0]}~${doses[doses.length - 1]} ${m.unit || ''}，共 ${doses.length} 次${m.schedules.size ? '，' + [...m.schedules].join('/') : ''}`);
    });
    L('');
    L('三、饮食要点');
    L(`共记录 ${r.meals.length} 餐；平均每餐 GL ${r.avgGL != null ? U.round1(r.avgGL).toFixed(1) : '—'}，平均碳水 ${r.avgCarbs != null ? r.avgCarbs + 'g' : '—'}`);
    r.dietTips.forEach(t => L('  · ' + t));
    if (r.highGLMeals.length) {
      L('高 GL 餐（Top 5）：');
      r.highGLMeals.forEach(m =>
        L(`  · ${U.ymd(new Date(m.at))} ${U.MEAL_LABELS[m.meal] || ''} GL ${U.round1(m.totalGL).toFixed(1)}（${(m.items || []).map(i => i.name).slice(0, 3).join('、')}）`));
    }
    L('');
    L('四、餐后血糖关联');
    if (!r.links.length) L('  缺少成对的餐前+餐后2小时记录，暂无关联数据。');
    r.links.forEach(l => {
      L(`  · ${U.ymd(new Date(l.meal.at))} ${U.MEAL_LABELS[l.meal.meal] || ''}（GL${U.round1(l.meal.totalGL).toFixed(1)}）：餐前→餐后变化 ${l.delta >= 0 ? '+' : ''}${fmt(U.round1(l.delta))} ${U.unitLabel(unit)}`);
    });
    L('');
    L('五、运动情况');
    L(`共 ${r.exercise.length} 次，合计 ${r.exMin} 分钟。`);
    L('');
    L('说明：本报告由 SugarLog 本地数据生成，所有数值为患者自我监测记录，');
    L('糖化血红蛋白为估算值，不能替代静脉血化验；诊疗调整请以主治医师意见为准。');
    r.text = rows.join('\r\n');

    const v = (v2) => v2 == null ? '—' : fmt(v2);
    const kv = (k, val, cls) => `<div class="kv"><div class="k">${k}</div><div class="v ${cls || ''}">${val}</div></div>`;

    const colorDelta = d => d > 2 ? 'g-danger' : d > 0 ? 'g-high' : 'g-ok';

    container.innerHTML = `
      <h2>SugarLog 控糖日记 · 就诊报告</h2>
      <div class="rpt-sub">${r.from} 至 ${r.to}　生成于 ${new Date().toLocaleString('zh-CN')}</div>
      <p class="small" style="margin:0 0 6px"><strong>${esc(p.name || '患者')}</strong>
      ${p.diabetesType ? '　' + esc(typeMap[p.diabetesType]) : ''}
      ${p.diagnosisYear ? '　诊断于 ' + esc(p.diagnosisYear) + ' 年' : ''}</p>

      <h3>一、血糖总体情况</h3>
      <div class="rpt-grid">
        ${kv('记录次数', r.count + ' 次')}
        ${kv('平均血糖', r.avg != null ? v(r.avg) + ' ' + U.unitLabel(unit) : '—')}
        ${kv('eA1c 估算', r.a1c != null ? r.a1c.toFixed(1) + '%' : '—', r.a1c != null && r.a1c >= 7 ? 'g-high' : 'g-ok')}
        ${kv('达标率', r.st.okRate != null ? Math.round(r.st.okRate * 100) + '%' : '—')}
        ${kv('低血糖次数', String(r.hypos.length), r.hypos.length ? 'g-low' : '')}
        ${kv('危险值次数', String(r.danger.length), r.danger.length ? 'g-danger' : '')}
      </div>
      <p class="small muted" style="margin:8px 0 4px">${esc(r.glucoseTrendText)}</p>
      ${r.count ? `<table><tr><th>时段</th>${[...new Set(r.glucose.map(g => g.context))].map(k =>
        `<th>${U.CONTEXT_LABELS[k] || k}</th>`).join('')}</tr>
        <tr><td>平均（${U.unitLabel(unit)}）</td>${[...new Set(r.glucose.map(g => g.context))].map(k =>
        `<td>${v(U.round1(U.avg(r.byCtx[k])))}</td>`).join('')}</tr>
        <tr><td>次数</td>${[...new Set(r.glucose.map(g => g.context))].map(k =>
        `<td>${r.byCtx[k].length}</td>`).join('')}</tr></table>` : ''}

      <h3>二、用药情况（${r.medRawCount} 次记录）</h3>
      ${r.meds.length ? `<table><tr><th>药物</th><th>类型</th><th>剂量范围</th><th>次数</th><th>时机</th></tr>${r.meds.map(m => {
        const doses = m.doses.map(Number);
        return `<tr><td>${esc(m.name)}</td><td>${MedData.MED_TYPE_LABELS[m.type] || ''}</td>
        <td>${doses[0]}~${doses[doses.length - 1]} ${esc(m.unit || '')}</td>
        <td>${doses.length}</td><td>${esc([...m.schedules].join('/') || '—')}</td></tr>`;
      }).join('')}</table>` : '<p class="muted small">本区间无用药记录</p>'}

      <h3>三、饮食要点</h3>
      <p class="small">共 ${r.meals.length} 餐，平均每餐 <strong>GL ${r.avgGL != null ? U.round1(r.avgGL).toFixed(1) : '—'}</strong>，
      平均碳水 <strong>${r.avgCarbs != null ? r.avgCarbs + 'g' : '—'}</strong>。</p>
      <ul class="small">${r.dietTips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      ${r.highGLMeals.length ? `<p class="small"><strong>高 GL 餐（Top ${r.highGLMeals.length}）：</strong></p>
      <table><tr><th>日期</th><th>餐次</th><th>GL</th><th>主要食物</th></tr>
      ${r.highGLMeals.map(m => `<tr><td>${U.ymd(new Date(m.at))}</td><td>${U.MEAL_LABELS[m.meal] || ''}</td>
      <td>${U.round1(m.totalGL).toFixed(1)}</td><td>${esc((m.items || []).map(i => i.name).slice(0, 3).join('、'))}</td></tr>`).join('')}
      </table>` : ''}

      <h3>四、饮食 × 餐后血糖关联</h3>
      ${r.links.length ? `<table><tr><th>日期</th><th>餐次/GL</th><th>餐前→餐后变化</th></tr>${r.links.map(l =>
        `<tr><td>${U.ymd(new Date(l.post.at))}</td>
        <td>${U.MEAL_LABELS[l.meal.meal] || ''}（GL ${U.round1(l.meal.totalGL).toFixed(1)}）</td>
        <td class="${colorDelta(l.delta)}"><strong>${l.delta >= 0 ? '+' : ''}${v(U.round1(l.delta))} ${U.unitLabel(unit)}</strong></td></tr>`).join('')}</table>
        <p class="small muted">平均餐后波动：${r.avgDelta != null ? (r.avgDelta >= 0 ? '+' : '') + v(r.avgDelta) + ' ' + U.unitLabel(unit) : '—'}</p>`
        : '<p class="muted small">缺少成对的餐前+餐后2小时记录。可在记录血糖时标注"餐前"和"餐后2小时"。</p>'}

      <h3>五、运动情况</h3>
      <p class="small">共 ${r.exercise.length} 次，合计 <strong>${r.exMin} 分钟</strong>。${r.exercise.length ? '主要类型：' +
        [...new Set(r.exercise.map(e => e.name))].slice(0, 5).join('、') : ''}</p>

      <p class="small muted" style="margin-top:16px;border-top:1px solid var(--line);padding-top:10px">
      本报告由 SugarLog 本地记录生成，供医生复诊参考；eA1c 为估算值，不能替代静脉血化验，诊疗调整以主治医师意见为准。</p>`;
  }

  Views.reports = { mount };
})();
