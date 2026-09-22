/* =========================================================
 * SugarLog · 启动 / 路由 / 全局状态 / 提醒
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, E = SL.UI.E, mount = SL.UI.mount;
  var toast = SL.UI.toast;

  var ROUTES = [
    { key: 'dashboard', title: '首页', icon: '🏠' },
    { key: 'glucose', title: '血糖记录', icon: '🩸' },
    { key: 'diet', title: '饮食记录', icon: '🍚' },
    { key: 'medication', title: '用药记录', icon: '💊' },
    { key: 'exercise', title: '运动记录', icon: '🏃' },
    { key: 'trends', title: '趋势分析', icon: '📈' },
    { key: 'reports', title: '报告导出', icon: '📄' },
    { key: 'knowledge', title: '知识库', icon: '📚' },
    { key: 'settings', title: '设置', icon: '⚙️' }
  ];

  var App = {
    state: {
      profile: null,
      settings: null,
      route: 'dashboard',
      notifiedMeds: {},     // 本次运行已提醒的用药 id
      lowAlertShown: {}     // 本次运行已弹出的低血糖记录 id
    },

    viewRoot: null,
    currentModalView: null,

    boot: function () {
      App.viewRoot = document.getElementById('view-root');

      // 侧边栏
      var nav = document.getElementById('nav');
      nav.addEventListener('click', function () {
        document.getElementById('sidebar').classList.remove('open');
      });
      document.getElementById('menu-btn').addEventListener('click', function () {
        document.getElementById('sidebar').classList.toggle('open');
      });
      document.addEventListener('click', function (e) {
        var sb = document.getElementById('sidebar');
        var mb = document.getElementById('menu-btn');
        if (sb.classList.contains('open') && !sb.contains(e.target) && !mb.contains(e.target)) {
          sb.classList.remove('open');
        }
      });

      window.addEventListener('hashchange', App.route);

      SL.DB.ready()
        .then(function () { return App.reloadState(); })
        .then(function () {
          App.route();
          App.scheduleReminders();
        })
        .catch(function (err) {
          console.error(err);
          App.viewRoot.innerHTML =
            '<div class="empty"><span class="big">⚠️</span>数据初始化失败：' +
            (err && err.message ? String(err.message) : '未知错误') +
            '<div class="small mt12">SugarLog 使用浏览器 IndexedDB 存储数据，请确认未处于隐私模式或禁用了本地存储。</div></div>';
        });
    },

    reloadState: function () {
      return Promise.all([
        SL.DB.get('profiles', 'me'),
        SL.DB.get('settings', 'default')
      ]).then(function (res) {
        App.state.profile = res[0] || SL.DB.defaultProfile();
        App.state.settings = res[1] || SL.DB.defaultSettings();
        App.renderChrome();
      });
    },

    get settings() { return App.state.settings; },
    get profile() { return App.state.profile; },

    renderChrome: function () {
      // 侧边栏底部单位/复诊信息
      var foot = document.getElementById('sidebar-foot');
      var s = App.state.settings;
      mount(foot, [
        h('div', {}, '单位：' + (s.unit === 'mgdl' ? 'mg/dL' : 'mmol/L')),
        s.followupDate ? h('div', { style: 'margin-top:4px' }, '复诊：' + s.followupDate) : null
      ]);

      var tb = document.getElementById('topbar-right');
      var notifyBtn = h('button.icon-btn', {
        title: '开启桌面提醒',
        onClick: App.enableNotifications
      }, '🔔');
      var kbBtn = h('a.icon-btn', {
        href: '#/knowledge', title: '知识库',
        style: 'display:inline-flex;align-items:center;justify-content:center;text-decoration:none'
      }, '📚');
      mount(tb, [notifyBtn, kbBtn]);
    },

    /* ---------------- 路由 ---------------- */
    route: function () {
      var hash = (location.hash || '').replace(/^#\//, '');
      var key = hash.split('?')[0] || 'dashboard';
      if (!SL.Views || !SL.Views[key]) key = 'dashboard';
      App.state.route = key;

      var meta = ROUTES.filter(function (r) { return r.key === key; })[0];
      document.getElementById('page-title').textContent = meta.icon + ' ' + meta.title;

      var links = document.querySelectorAll('.nav a');
      for (var i = 0; i < links.length; i++) {
        links[i].classList.toggle('active', links[i].getAttribute('data-route') === key);
      }

      var view = SL.Views[key];
      Promise.resolve(view(App.viewRoot)).catch(function (err) {
        console.error(err);
        mount(App.viewRoot, h('.empty', {},
          h('span.big', {}, '😵'),
          h('div', {}, '页面渲染失败：' + (err.message || err))
        ));
      });
      App.viewRoot.scrollTop = 0;
      window.scrollTo(0, 0);
    },

    go: function (key) { location.hash = '#/' + key; },
    refresh: function () { App.route(); },

    /* ---------------- 提醒（定时器） ---------------- */
    scheduleReminders: function () {
      // 每 30 秒检查一次用药提醒
      setInterval(App.checkReminders, 30 * 1000);
      setTimeout(App.checkReminders, 4000);
      // 每 10 分钟检查一次复诊
      setInterval(App.checkFollowup, 10 * 60 * 1000);
      setTimeout(App.checkFollowup, 6000);
    },

    checkReminders: function () {
      var s = App.state.settings;
      if (!s || !s.remindMedication) return;
      SL.DB.all('medicationRecords').then(function (meds) {
        var now = Date.now();
        meds.forEach(function (m) {
          if (!m.reminder) return;
          if (m.taken) return;
          var dueAt = m.at - (s.medReminderOffsetMin || 0) * 60 * 1000;
          var key = m.id;
          // 到点之后 30 分钟内只提醒一次
          if (now >= dueAt && now <= m.at + 30 * 60 * 1000 && !App.state.notifiedMeds[key]) {
            App.state.notifiedMeds[key] = true;
            App.notify('用药提醒', '该用 ' + (m.dose || '') + ' ' + m.name + ' 了', { tag: 'med-' + m.id });
            if (App.state.route !== 'medication') toast('💊 用药提醒：' + m.name, undefined, 4000);
          }
        });
      }).catch(function () {});
    },

    checkFollowup: function () {
      var s = App.state.settings;
      if (!s || !s.followupDate) return;
      var d = new Date(s.followupDate + 'T00:00:00').getTime();
      var days = Math.ceil((d - SL.U.startOfDay(Date.now())) / (24 * 3600 * 1000));
      if (days >= 0 && days <= (s.remindFollowupDays || 3) && !sessionStorage.getItem('sl_followup_notified')) {
        sessionStorage.setItem('sl_followup_notified', '1');
        var msg = days === 0 ? '今天复诊，别忘了！' : '距离复诊还有 ' + days + ' 天';
        App.notify('复诊提醒', msg + (s.followupNote ? '（' + s.followupNote + '）' : ''), { tag: 'followup' });
      }
    },

    notify: function (title, body, opts) {
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
          new Notification(title, Object.assign({ body: body, icon: undefined }, opts || {}));
        }
      } catch (e) { /* 某些环境（file://）不支持，忽略 */ }
    },
    enableNotifications: function () {
      if (!('Notification' in window)) { toast('当前环境不支持桌面通知'); return; }
      if (Notification.permission === 'granted') { toast('桌面提醒已开启 ✓', 'ok'); return; }
      Notification.requestPermission().then(function (perm) {
        if (perm === 'granted') toast('桌面提醒已开启 ✓', 'ok');
        else toast('未获得通知权限');
      });
    },

    /* ---------------- 低血糖预警弹窗 ---------------- */
    lowGlucoseAlert: function (record) {
      var s = App.state.settings;
      var val = SL.U.fmtGlucose(record.value, s);
      var unit = SL.U.unitLabel(s);
      var severe = record.value <= (s.severeLowThreshold || 3.0);

      var steps = [
        '立即停下活动，坐下或躺下，尽快测一次血糖确认。',
        '补充 15 克快速糖：葡萄糖片 3~4 片 / 白糖 3~4 勺冲水 / 果汁约 150ml / 含糖汽水 150ml。',
        '等待 15 分钟后再次测量血糖。',
        '若仍低于 3.9 mmol/L，再补 15 克糖，重复上述步骤。',
        '血糖恢复后，距下一餐超过 1 小时请加餐（饼干 3~4 片或面包 1 片）。'
      ];

      var list = h('ol.kb-steps', {}, steps.map(function (t) { return h('li', {}, t); }));

      var severeBox = severe ? h('.alert-banner.danger', { style: 'margin-top:14px' },
        h('span.a-ico', {}, '🚨'),
        h('div', {}, '当前为严重低血糖（≤' + SL.U.fmtGlucose(s.severeLowThreshold || 3.0, s) + ' ' + unit +
          '）。若出现意识模糊或无法吞咽，不要喂食，立即拨打 120！')
      ) : null;

      var modal = SL.UI.openModal({
        title: '⚠️ 低血糖预警',
        content: h('div', {},
          h('.alert-banner.info', {},
            h('span.a-ico', {}, '🍬'),
            h('div', {}, '刚记录的血糖为 ',
              h('b', {}, val + ' ' + unit),
              '（' + SL.U.mealLabel(record.meal) + '），属于低血糖，请立即按下面的步骤处理。')
          ),
          list,
          severeBox,
          h('p.small.muted', { style: 'margin-top:12px' },
            '完整说明可查看「知识库 → 低血糖处理」。处理后记得复测并记录。')
        )
      });
      modal.body.appendChild(h('.modal-foot', {},
        h('button.btn.ghost', { onClick: function () {
          modal.close();
          location.hash = '#/knowledge';
        } }, '查看完整指南'),
        h('button.btn', { onClick: function () { modal.close(); } }, '我知道了，马上处理')
      ));
    },

    checkLowGlucoseAfterSave: function (record) {
      var s = App.state.settings;
      if (record.value < (s.lowThreshold || 3.9)) {
        App.lowGlucoseAlert(record);
      }
    },

    ROUTES: ROUTES
  };

  SL.App = App;

  document.addEventListener('DOMContentLoaded', App.boot);
})(window);
