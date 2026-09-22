/* =========================================================
 * SugarLog · 首页仪表盘
 * 问候 / 预警横幅 / 快速记录 / 今日概览 / 待用药 / 最近血糖
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount, emptyBox = SL.UI.emptyBox;
  var U = SL.U, DB = SL.DB;

  var Views = SL.Views || (SL.Views = {});

  function greeting() {
    var hh = new Date().getHours();
    var g = hh < 6 ? '夜深了' : hh < 11 ? '早上好' : hh < 14 ? '中午好' : hh < 18 ? '下午好' : '晚上好';
    var name = SL.App.profile.nickname;
    return g + (name ? '，' + name : '') + '！';
  }

  function quickBtn(ico, label, route) {
    return h('button.quick-btn', { onClick: function () { SL.App.go(route); } },
      h('span.q-ico', {}, ico), h('span', {}, label));
  }

  Views.dashboard = function (root) {
    var now = Date.now();
    var dayStart = U.startOfDay(now), dayEnd = U.endOfDay(now);

    // 首次使用（未填写昵称和类型）时弹一次引导
    if (!SL.App.profile.nickname && !SL.App.profile.diabetesType &&
        !sessionStorage.getItem('sl_wizard_seen')) {
      sessionStorage.setItem('sl_wizard_seen', '1');
      setTimeout(function () { SL.Views.settings.openProfileWizard(true); }, 250);
    }

    Promise.all([
      DB.rangeByTime('glucoseRecords', dayStart - 6 * 864e5, dayEnd),
      DB.rangeByTime('medicationRecords', dayStart, dayEnd + 7 * 864e5)
    ]).then(function (res) {
      var allGlucose = res[0];
      var todayGlucose = allGlucose.filter(function (r) { return r.at >= dayStart && r.at <= dayEnd; });
      var meds = res[1];
      render(root, todayGlucose, allGlucose, meds);
    });

    mount(root, h('.empty', {}, '加载中…'));
  };

  function render(root, todayGlucose, recentAllGlucose, meds) {
    var s = SL.App.settings;

    // ---- 今日统计 ----
    var vals = todayGlucose.map(function (r) { return r.value; });
    var avg = U.mean(vals);
    var inTarget = vals.filter(function (v, i) {
      return U.classify(v, todayGlucose[i].meal, s) === 'ok';
    }).length;
    var lowCount = todayGlucose.filter(function (r) {
      return r.value < (s.lowThreshold || 3.9);
    }).length;

    var latest = recentAllGlucose.slice().sort(function (a, b) { return b.at - a.at; })[0];

    // ---- 预警 ----
    var banners = [];
    if (latest) {
      var cls = U.classify(latest.value, latest.meal, s);
      if (cls === 'danger' && latest.value < (s.lowThreshold || 3.9)) {
        banners.push(alert('danger', '🚨',
          '最近一次血糖 ' + U.fmtGlucose(latest.value, s) + ' ' + U.unitLabel(s) + '，属于严重低血糖！',
          '立即查看处理步骤', function () { SL.App.lowGlucoseAlert(latest); }));
      } else if (cls === 'danger') {
        banners.push(alert('danger', '🔥',
          '最近一次血糖 ' + U.fmtGlucose(latest.value, s) + ' ' + U.unitLabel(s) + '，明显升高。',
          '查看高血糖应对', function () { location.hash = '#/knowledge'; }));
      } else if (cls === 'low') {
        banners.push(alert('info', '🍬',
          '最近一次血糖 ' + U.fmtGlucose(latest.value, s) + ' ' + U.unitLabel(s) + '，偏低，请注意补糖。',
          '处理步骤', function () { SL.App.lowGlucoseAlert(latest); }));
      }
    }
    // 复诊提醒
    if (s.followupDate) {
      var fd = new Date(s.followupDate + 'T00:00:00').getTime();
      var days = Math.ceil((fd - U.startOfDay(Date.now())) / 864e5);
      if (days >= 0 && days <= (s.remindFollowupDays || 3)) {
        banners.push(alert(days === 0 ? 'danger' : 'warn', '📅',
          days === 0
            ? '今天是复诊日' + (s.followupNote ? '：' + s.followupNote : '，别忘了带上记录！')
            : '距离复诊还有 ' + days + ' 天（' + s.followupDate + '）' + (s.followupNote ? '，' + s.followupNote : ''),
          '导出复诊报告', function () { location.hash = '#/reports'; }));
      } else if (days < 0) {
        banners.push(alert('warn', '📅',
          '复诊日期 ' + s.followupDate + ' 已过，可在设置中更新下次复诊时间。',
          '去设置', function () { location.hash = '#/settings'; }));
      }
    }

    // ---- 今日待用药 ----
    var todayMeds = meds.filter(function (m) {
      return m.at >= U.startOfDay(Date.now()) && m.at <= U.endOfDay(Date.now());
    }).sort(function (a, b) { return a.at - b.at; });

    var pendingMeds = todayMeds.filter(function (m) { return !m.taken; });

    var medCard = h('.card', {},
      h('h2', {}, '💊 今日用药'),
      todayMeds.length === 0
        ? h('p.muted', {}, '今天还没有用药安排。记录用药后可设置到点提醒。')
        : h('.rec-list', {}, todayMeds.slice(0, 6).map(function (m) {
            var overdue = !m.taken && m.at < Date.now();
            return h('.rec', {},
              h('span', { class: 'dot ' + (m.taken ? 'ok' : (overdue ? 'danger' : 'high')) }),
              h('.rec-main', {},
                h('.rec-title', {}, m.name + (m.dose ? ' · ' + m.dose : '')),
                h('.rec-meta', {}, U.fmtTime(m.at) + (m.kind ? ' · ' + medKind(m.kind) : '') +
                  (m.note ? ' · ' + m.note : ''))
              ),
              h('.rec-side', {},
                m.taken
                  ? h('span.chip.ok', {}, '已服用')
                  : h('span.chip.' + (overdue ? 'danger' : 'high'), {}, overdue ? '已过时' : '待服用')
              )
            );
          }))
    );

    // ---- 最近血糖（3 条） ----
    var recent = recentAllGlucose.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 4);

    var latestCard = h('.card', {},
      h('h2', {}, '🩸 最近血糖'),
      latest ? h('div.mb8', {},
        h('.flag-row', {},
          h('.val-badge.' + U.classify(latest.value, latest.meal, s), {},
            U.fmtGlucose(latest.value, s), h('span.u', {}, U.unitLabel(s))),
          SL.UI.statusChip(U.classify(latest.value, latest.meal, s),
            U.CLASS_LABEL[U.classify(latest.value, latest.meal, s)])),
        h('div.muted.small', {}, U.fmtRelative(latest.at) + ' · ' + U.mealLabel(latest.meal) +
          (latest.note ? ' · ' + latest.note : ''))
      ) : null,
      recent.length === 0
        ? emptyBox('🩸', '还没有血糖记录，先测一次记下来吧。',
            h('button.btn', { onClick: function () { SL.App.go('glucose'); } }, '➕ 记录血糖'))
        : h('.rec-list.mt12', {}, recent.map(function (r) {
            var cls = U.classify(r.value, r.meal, s);
            return h('.rec', { onClick: function () { SL.App.go('glucose'); }, style: 'cursor:pointer' },
              h('span', { class: 'dot ' + cls }),
              h('.rec-main', {},
                h('.rec-title', {}, U.mealLabel(r.meal)),
                h('.rec-meta', {}, U.fmtRelative(r.at) + (r.note ? ' · ' + r.note : ''))
              ),
              h('.rec-side', {},
                h('b.f-s', { class: 'bg-' + cls, style: 'font-size:1.15rem' },
                  U.fmtGlucose(r.value, s) + ' ' + U.unitLabel(s)))
            );
          }))
    );

    // ---- HbA1c 小卡（近 7 天数据估算，仅提示） ----
    var weekVals = recentAllGlucose.map(function (r) { return r.value; });
    var weekAvg = U.mean(weekVals);
    var hba1c = U.estimateHbA1c(weekAvg);

    mount(root, [
      h('.card.hello', { style: 'background:linear-gradient(120deg,#fff,#fdf2f7)' },
        h('h2', {}, greeting()),
        h('p.muted', { style: 'margin:0' }, '今天是 ' + U.fmtDateCN(Date.now()) +
          '，坚持记录，血糖会更稳 💪')
      ),

      banners.length ? h('div', {}, banners) : null,

      h('.card', {},
        h('h2.mt0', {}, '⚡ 快速记录'),
        h('.quick-grid', {},
          quickBtn('🩸', '记血糖', 'glucose'),
          quickBtn('🍚', '记饮食', 'diet'),
          quickBtn('💊', '记用药', 'medication'),
          quickBtn('🏃', '记运动', 'exercise'),
          quickBtn('📈', '看趋势', 'trends')
        )
      ),

      h('.stat-grid', {},
        stat('今日测量', vals.length ? String(vals.length) + ' 次' : '—',
          vals.length ? '最近 ' + U.fmtTime(todayGlucose.slice().sort(function (a, b) { return b.at - a.at; })[0].at) : '暂无记录'),
        stat('今日平均', avg !== null ? U.fmt1(U.toDisp(avg, s)) + ' ' + U.unitLabel(s) : '—',
          weekAvg !== null ? '近7天 ' + U.fmt1(U.toDisp(weekAvg, s)) : '继续保持记录'),
        stat('今日达标率', vals.length ? U.fmtPct(inTarget / vals.length) : '—',
          inTarget + ' / ' + vals.length + ' 次在目标范围内', inTarget / Math.max(vals.length, 1) >= 0.7 ? 'ok' : ''),
        stat('糖化估算', hba1c !== null ? hba1c.toFixed(1) + '%' : '—',
          weekVals.length >= 7 ? '按近7天平均血糖估算' : '需更多记录（建议≥7天）')
      ),

      h('.grid2', {},
        latestCard,
        h('div', {},
          medCard,
          pendingMeds.length ? h('.alert-banner.warn', {},
            h('span.a-ico', {}, '⏰'),
            h('div', {}, '有 ' + pendingMeds.length + ' 项用药待服用：' +
              pendingMeds.map(function (m) { return m.name; }).join('、')),
            h('a.btn.sm.secondary.a-act', { href: '#/medication' }, '去处理')
          ) : null,

          h('.card', {},
            h('h2.mt0', {}, '📚 随时查阅'),
            h('.row', { style: 'gap:8px' },
              h('button.btn.ghost.sm', { onClick: function () { location.hash = '#/knowledge'; } }, '🍬 低血糖处理'),
              h('button.btn.ghost.sm', { onClick: function () { location.hash = '#/knowledge'; } }, '🥗 饮食原则'),
              h('button.btn.ghost.sm', { onClick: function () { location.hash = '#/knowledge'; } }, '🎯 达标标准'),
              h('button.btn.ghost.sm', { onClick: function () { location.hash = '#/reports'; } }, '📄 复诊报告')
            )
          )
        )
      )
    ]);
  }

  function alert(cls, ico, msg, actText, actFn) {
    return h('.alert-banner.' + cls, {},
      h('span.a-ico', {}, ico),
      h('div', { style: 'align-self:center' }, msg),
      actText ? h('button.btn.sm.secondary.a-act', { onClick: actFn }, actText) : null
    );
  }

  function stat(label, value, sub, cls) {
    return h('.stat', {},
      h('.s-label', {}, label),
      h('.s-value' + (cls ? '.bg-' + cls : ''), {}, value),
      sub ? h('.s-sub', {}, sub) : null
    );
  }

  function medKind(k) {
    return { oral: '口服药', insulin: '胰岛素', other: '其他' }[k] || k;
  }
})(window);
