/* ============================================================
   app.js — 应用框架：状态 / 路由 / 弹层 / 提醒调度 / 启动
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const SVG_TAGS = new Set(['svg', 'use', 'path', 'circle', 'rect', 'line', 'text', 'g', 'symbol', 'title']);
  function el(tag, attrs, children) {
    const isSvg = SVG_TAGS.has(tag);
    const node = isSvg
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.setAttribute('class', v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const State = {
    profile: null,
    settings: null,
    ready: false
  };

  const ROUTES = [
    { path: '/home', title: '首页', view: 'home' },
    { path: '/glucose', title: '血糖记录', view: 'glucose' },
    { path: '/meals', title: '饮食记录', view: 'meals' },
    { path: '/medication', title: '用药记录', view: 'medication' },
    { path: '/exercise', title: '运动记录', view: 'exercise' },
    { path: '/trends', title: '趋势分析', view: 'trends' },
    { path: '/reports', title: '报告导出', view: 'reports' },
    { path: '/knowledge', title: '糖尿病知识库', view: 'knowledge' },
    { path: '/knowledge/:id', title: '知识库', view: 'knowledge' },
    { path: '/settings', title: '个人与设置', view: 'settings' },
    { path: '/reminders', title: '提醒管理', view: 'settings' }
  ];

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  // ---------- Modal ----------
  function openModal(html, opts) {
    opts = opts || {};
    const modal = $('#modal');
    modal.className = 'modal' + (opts.className ? ' ' + opts.className : '');
    modal.innerHTML = html;
    modal.hidden = false;
    $('#modalScrim').hidden = false;
    const first = modal.querySelector('input,select,textarea,button');
    if (first) setTimeout(() => first.focus(), 50);
    return modal;
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modalScrim').hidden = true;
  }
  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      openModal(`
        <div class="modal-head">
          <h2 class="modal-title">${esc(opts.title || '请确认')}</h2>
        </div>
        <p style="font-size:16px;margin:6px 0 0">${esc(message)}</p>
        <div class="modal-foot">
          <button class="btn btn-secondary" id="cfmCancel">取消</button>
          <button class="btn ${opts.danger ? 'btn-danger' : ''}" id="cfmOk">${esc(opts.okText || '确定')}</button>
        </div>
      `);
      $('#cfmCancel').onclick = () => { closeModal(); resolve(false); };
      $('#cfmOk').onclick = () => { closeModal(); resolve(true); };
    });
  }

  // ---------- 路由 ----------
  function matchRoute(hashPath) {
    for (const r of ROUTES) {
      if (r.path.includes(':')) {
        const rp = r.path.split('/').filter(Boolean);
        const hp = hashPath.split('/').filter(Boolean);
        if (rp.length === hp.length && rp.every((seg, i) => seg.startsWith(':') || seg === hp[i])) {
          const paramName = rp.find(s => s.startsWith(':')).slice(1);
          return { route: r, params: { [paramName]: hp[rp.findIndex(s => s.startsWith(':'))] } };
        }
      } else if (r.path === hashPath) {
        return { route: r, params: {} };
      }
    }
    return { route: ROUTES[0], params: {} };
  }

  async function router() {
    const hash = location.hash.replace(/^#/, '') || '/home';
    const { route, params } = matchRoute(hash);
    $('#pageTitle').textContent = route.title;
    document.title = route.title === '首页' ? 'SugarLog 控糖日记' : `${route.title} · SugarLog`;
    $$('.nav-item, .bn-item[data-route]').forEach(a => {
      a.classList.toggle('active', a.dataset.route === route.path ||
        (route.path.startsWith('/knowledge') && a.dataset.route === '/knowledge') ||
        (route.path === '/reminders' && a.dataset.route === '/settings'));
    });
    closeSheets();
    const view = $('#view');
    view.innerHTML = '';
    view.scrollTop = 0;
    const v = Views[route.view];
    await v.mount(view, params);
    view.focus?.();
    window.scrollTo(0, 0);
  }

  // ---------- 底部抽屉 ----------
  function openSheet(id, scrimId) {
    $(id).hidden = false;
    $(scrimId).hidden = false;
  }
  function closeSheets() {
    ['#quickSheet', '#moreSheet'].forEach(s => { $(s).hidden = true; });
    $('#quickScrim').hidden = true;
    closeSidebar();
  }

  // ---------- 侧边栏（窄屏） ----------
  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebarScrim').hidden = false;
    $('#sidebarScrim').classList.add('show');
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebarScrim').hidden = true;
    $('#sidebarScrim').classList.remove('show');
  }

  // ---------- 文件下载 ----------
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content :
      new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  // ---------- 当前血糖目标（供各视图统一使用） ----------
  function currentTargets() {
    // 以设置中的目标为准（高级阈值由 Utils.evaluateGlucose 默认常量判断危险等级；
    // 若用户修改了 hypo/danger 阈值则在此注入）
    const t = State.settings ? JSON.parse(JSON.stringify(State.settings.targets)) : null;
    return t || Utils.DEFAULT_TARGETS;
  }

  function evalG(valueMmol, context) {
    const s = State.settings;
    const result = Utils.evaluateGlucose(valueMmol, context, currentTargets());
    // 用户自定义低血糖 / 危险高阈值时，覆盖默认判定
    if (s && s.hypoThreshold !== Utils.HYPO_THRESHOLD) {
      if (valueMmol < s.hypoThreshold && result.status === 'ok') {
        return { status: 'low', label: '偏低', message: `低于自定义低血糖阈值 ${Number(s.hypoThreshold).toFixed(1)} mmol/L` };
      }
    }
    if (s && s.dangerHigh !== Utils.DANGER_HIGH) {
      if (valueMmol >= Number(s.dangerHigh)) {
        return { status: 'danger', label: '危险高血糖', message: `血糖达到 ${Number(s.dangerHigh).toFixed(1)} mmol/L 以上，请立即处理。` };
      }
    }
    return result;
  }

  function badgeFor(status, label) {
    const map = { ok: 'bg-ok', high: 'bg-high', low: 'bg-low', danger: 'bg-danger' };
    return `<span class="badge ${map[status]}">${esc(label || Utils.STATUS_LABELS[status])}</span>`;
  }

  // ---------- 提醒调度 ----------
  async function checkReminders() {
    if (!State.settings) return;
    const now = Date.now();
    const reminders = await DB.Reminders.all();
    const due = reminders.filter(r => r.enabled && r.at <= now);
    // 按记录时间避免同一条重复弹（updatedAt 后重新启用才再提醒）
    const fired = JSON.parse(sessionStorage.getItem('firedReminders') || '[]');
    const fresh = due.filter(r => !fired.includes(r.id));
    if (!fresh.length) return;

    sessionStorage.setItem('firedReminders', JSON.stringify(
      fired.concat(fresh.map(r => r.id))
    ));

    const item = fresh[0];
    const isGlucose = item.kind === 'glucose';
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('SugarLog 控糖提醒', { body: item.title });
    }
    openModal(`
      <div class="modal-head">
        <span style="font-size:30px">${isGlucose ? '🩸' : item.kind === 'followup' ? '🏥' : '💊'}</span>
        <h2 class="modal-title">${esc(item.title)}</h2>
      </div>
      <p style="font-size:16px;margin:4px 0 0">${esc(item.note || '到时间了，请及时完成。')}</p>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="rmLater">稍后提醒（10分钟）</button>
        <a class="btn" href="${isGlucose ? '#/glucose' : item.kind === 'followup' ? '#/reminders' : '#/medication'}" id="rmGo">${isGlucose ? '去记录' : '知道了'}</a>
      </div>
    `);
    $('#rmLater').onclick = async () => {
      item.at = Date.now() + 10 * 60000;
      await DB.Reminders.save(item);
      const arr = JSON.parse(sessionStorage.getItem('firedReminders') || '[]');
      sessionStorage.setItem('firedReminders', JSON.stringify(arr.filter(id => id !== item.id)));
      closeModal();
      toast('已延后 10 分钟');
    };
  }

  // ---------- 记录后预警弹层 ----------
  function showGlucoseAlert(mmol, result) {
    if (result.status === 'danger' && mmol < Utils.HYPO_THRESHOLD) {
      openModal(`
        <div class="modal-head">
          <span style="font-size:30px">🚨</span>
          <h2 class="modal-title">严重低血糖 ${Utils.displayValue(mmol, State.settings.unit)} ${Utils.unitLabel(State.settings.unit)}</h2>
        </div>
        <p>血糖极低（&lt; ${Utils.SEVERE_HYPO} mmol/L），请立即按以下步骤处理：</p>
        <ol class="alert-steps">
          <li><strong>立即补充 15g 快速糖</strong>：葡萄糖片 3~4 片，或含糖饮料约 150ml，或白糖 3~4 块。</li>
          <li><strong>15 分钟后复测血糖</strong>，仍 ≤ 3.9 则再补 15g 糖。</li>
          <li>若已出现意识模糊、无法吞咽：<strong>不要喂食</strong>，侧卧、立即拨打 <strong>120</strong>。</li>
        </ol>
        <div class="modal-foot">
          <a class="btn btn-danger" href="#/knowledge/hypo">查看完整低血糖处理</a>
          <button class="btn btn-secondary" id="alertClose">知道了</button>
        </div>
      `, { className: 'alert-modal alert-low' });
    } else if (result.status === 'low') {
      openModal(`
        <div class="modal-head">
          <span style="font-size:30px">🔵</span>
          <h2 class="modal-title">低血糖预警 ${Utils.displayValue(mmol, State.settings.unit)} ${Utils.unitLabel(State.settings.unit)}</h2>
        </div>
        <p>${esc(result.message)}</p>
        <ol class="alert-steps">
          <li>立即口服 <strong>15g 快速糖</strong>（葡萄糖片/方糖/含糖饮料约150ml）。</li>
          <li><strong>等待 15 分钟</strong>后复测，未升到 3.9 以上重复一次。</li>
          <li>纠正后 1 小时内不进餐，请加餐（主食+蛋白质）。</li>
        </ol>
        <div class="modal-foot">
          <a class="btn" style="background:var(--low)" href="#/knowledge/hypo">查看完整处理</a>
          <button class="btn btn-secondary" id="alertClose">知道了</button>
        </div>
      `, { className: 'alert-modal alert-low' });
    } else if (result.status === 'danger') {
      openModal(`
        <div class="modal-head">
          <span style="font-size:30px">🔴</span>
          <h2 class="modal-title">危险高血糖 ${Utils.displayValue(mmol, State.settings.unit)} ${Utils.unitLabel(State.settings.unit)}</h2>
        </div>
        <p>${esc(result.message)}</p>
        <ol class="alert-steps">
          <li>立即饮用<strong>无糖温开水</strong>，分次补水（无饮水禁忌时）。</li>
          <li>使用胰岛素者按医嘱的纠正剂量处理；<strong>无医嘱不要自行大幅加量</strong>。</li>
          <li>血糖 ≥ 13.9 建议<strong>查酮体</strong>；暂停剧烈运动，每 2~4 小时复测。</li>
          <li>若出现恶心呕吐、腹痛、深大呼吸、呼气烂苹果味或持续 ≥ 16.7 不降，<strong>立即就医 / 拨打 120</strong>。</li>
        </ol>
        <div class="modal-foot">
          <a class="btn btn-danger" href="#/knowledge/hyper">查看高血糖应对</a>
          <button class="btn btn-secondary" id="alertClose">知道了</button>
        </div>
      `, { className: 'alert-modal' });
    } else if (mmol >= Utils.HIGH_WARN && result.status === 'high') {
      toast('⚠️ 血糖明显偏高，注意补水、复测，必要时查酮体', 4000);
    }
    const closeBtn = $('#alertClose');
    if (closeBtn) closeBtn.onclick = closeModal;
  }

  // ---------- 启动 ----------
  async function init() {
    await DB.open();
    await DB.seedFoods(root2.BuiltinFoods || []);
    State.profile = await DB.Profile.get();
    State.settings = await DB.Settings.get();
    State.ready = true;

    updateChrome();

    window.addEventListener('hashchange', router);
    $('#modalScrim').addEventListener('click', closeModal);
    $('#quickScrim').addEventListener('click', closeSheets);
    $('#menuBtn').addEventListener('click', openSidebar);
    $('#sidebarScrim').addEventListener('click', closeSidebar);

    $('#fab').addEventListener('click', () => {
      const open = $('#quickSheet').hidden;
      if (open) { openSheet('#quickSheet', '#quickScrim'); $('#fab').classList.add('open'); }
      else { closeSheets(); $('#fab').classList.remove('open'); }
    });
    $('#moreBtn').addEventListener('click', () => openSheet('#moreSheet', '#quickScrim'));
    $$('#quickSheet [data-quick]').forEach(b => {
      b.addEventListener('click', () => {
        const kind = b.dataset.quick;
        closeSheets();
        $('#fab').classList.remove('open');
        const map = {
          glucose: () => Views.glucose.openForm(),
          meal: () => Views.meals.openForm(),
          med: () => Views.medication.openForm(),
          exercise: () => Views.exercise.openForm()
        };
        (map[kind] || function () {})();
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); closeSheets(); }
    });

    // 通知权限（用于用药/测量提醒）
    if ('Notification' in window && Notification.permission === 'default' && State.settings.reminders) {
      // 不强制弹窗，在设置页提供开关；此处仅在已有提醒时请求
      const rems = await DB.Reminders.all();
      if (rems.some(r => r.enabled)) Notification.requestPermission().catch(() => {});
    }

    await router();
    checkReminders();
    setInterval(checkReminders, 60000);
  }

  function updateChrome() {
    const u = State.settings.unit;
    $('#unitChip').textContent = '单位 ' + Utils.unitLabel(u);
    const t = State.settings.targets;
    $('#navTargetHint').textContent =
      `空腹目标 ${t.fasting.low}~${t.fasting.high} mmol/L\n餐后目标 <${t.after_meal.high} mmol/L`;
  }

  async function reloadSettings() {
    State.settings = await DB.Settings.get();
    updateChrome();
  }
  async function reloadProfile() {
    State.profile = await DB.Profile.get();
  }

  const root2 = window;
  Object.assign(window, {
    App: {
      $, $$, el, esc, State,
      toast, openModal, closeModal, confirmDialog,
      download, reloadSettings, reloadProfile,
      currentTargets, evalG, badgeFor,
      showGlucoseAlert, checkReminders
    }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
