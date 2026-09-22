/* =========================================================
 * SugarLog · 知识库视图（本地内置，可随时查阅 / 搜索）
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL;
  var h = SL.UI.h, mount = SL.UI.mount;
  var Views = SL.Views || (SL.Views = {});

  var state = { openId: null, keyword: '' };

  Views.knowledge = function (root) {
    // 支持 #/knowledge/kb_low 直达
    var hashId = (location.hash || '').split('/')[2];
    if (hashId) state.openId = hashId;
    render(root);
  };

  function render(root) {
    var kw = state.keyword.trim().toLowerCase();
    var list = SL.KNOWLEDGE.filter(function (k) {
      if (!kw) return true;
      if (k.title.toLowerCase().indexOf(kw) >= 0) return true;
      if (k.lead.toLowerCase().indexOf(kw) >= 0) return true;
      return (k.tags || []).some(function (t) { return t.toLowerCase().indexOf(kw) >= 0; });
    });

    var searchInput = h('input.input', {
      type: 'search', placeholder: '搜索：低血糖、GI、运动、复诊…',
      value: state.keyword,
      oninput: function (e) {
        state.keyword = e.target.value;
        render(root);
        var ni = root.querySelector('input[type=search]');
        if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
      }
    });

    var open = state.openId ? SL.KNOWLEDGE.filter(function (k) { return k.id === state.openId; })[0] : null;

    if (open) {
      mount(root, [
        h('.card', {},
          h('button.btn.ghost.sm', {
            onClick: function () {
              state.openId = null;
              location.hash = '#/knowledge';
              render(root);
            }
          }, '← 返回知识库目录')
        ),
        renderArticle(open)
      ]);
      window.scrollTo(0, 0);
      return;
    }

    mount(root, [
      h('.card', { style: 'border-top:4px solid #7e57c2' },
        h('h2.mt0', {}, '📚 糖尿病知识库'),
        h('p.muted', { style: 'margin-top:-8px' }, '内置在应用中、无需联网，随时可以查阅。内容依据《中国 2 型糖尿病防治指南》患者教育要点整理，仅供日常参考。'),
        searchInput
      ),
      list.length === 0
        ? h('.empty', {}, h('span.big', {}, '🔍'), '没有找到与「' + state.keyword + '」相关的内容')
        : h('.kb-grid', {}, list.map(card))
    ]);
  }

  function card(k) {
    return h('.card.kb-card', {
      onClick: function () {
        state.openId = k.id;
        location.hash = '#/knowledge/' + k.id;
        SL.App.route();
      }
    },
      h('div.k-ico.mb8', {}, k.icon),
      h('h3.mt0', { style: 'font-size:1.12rem;margin-bottom:6px' }, k.title),
      h('div.small', { style: 'color:var(--c-ink-2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden' },
        k.lead),
      h('div.mt12', {}, (k.tags || []).map(function (t) { return h('span.kb-tag', {}, t); }))
    );
  }

  function renderArticle(k) {
    var children = [
      h('div', { style: 'display:flex;align-items:center;gap:12px' },
        h('span', { style: 'font-size:2.2rem' }, k.icon),
        h('h2', { style: 'margin:0;font-size:1.5rem' }, k.title)),
      h('p.kb-lead.mt12', {}, k.lead)
    ];
    k.sections.forEach(function (sec) {
      children.push(h('h3', {}, sec.h3));
      if (sec.steps) {
        children.push(h('ol.kb-steps', {}, sec.steps.map(function (t) { return h('li', {}, t); })));
      }
      if (sec.html) {
        var wrap = h('.kb-article', {});
        wrap.innerHTML = sec.html;
        children.push(wrap);
      }
    });
    children.push(h('p.small.muted.mt18', {},
      '内容整理自公开糖尿病患者教育资料，不能替代专业医疗建议；如有疑问请咨询内分泌科医生。'));
    return h('.card', {}, children);
  }
})(window);
