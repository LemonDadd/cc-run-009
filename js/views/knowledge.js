/* views/knowledge.js — 知识库列表/搜索/文章详情（全部本地） */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc } = App;

  function mount(root, params) {
    if (params && params.id) return article(root, params.id);
    return list(root);
  }

  function list(root) {
    root.innerHTML = '';
    const card = el('section', { class: 'card' });
    card.innerHTML = `
      <h2 class="card-title">📚 糖尿病知识库</h2>
      <div class="kb-search">
        <svg class="icon"><use href="#i-search"/></svg>
        <input type="search" id="kbSearch" placeholder="搜索：低血糖、GI、胰岛素、复诊…">
      </div>
      <div class="kb-list" id="kbList"></div>`;
    root.appendChild(card);

    const renderList = (kw) => {
      const box = card.querySelector('#kbList');
      box.innerHTML = '';
      const list = !kw ? Knowledge.ARTICLES : Knowledge.ARTICLES.filter(a =>
        a.title.includes(kw) || a.summary.includes(kw) || a.body.replace(/<[^>]+>/g, '').includes(kw));
      if (!list.length) {
        box.appendChild(el('p', { class: 'muted', text: '没有找到相关内容，换个关键词试试。' }));
        return;
      }
      list.forEach(a => box.appendChild(el('a', { class: 'kb-item', href: `#/knowledge/${a.id}` }, [
        el('span', { class: 'kb-ico', text: a.icon }),
        el('div', {}, [
          el('h3', { text: a.title }),
          el('p', { text: a.summary })
        ]),
        el('svg', { class: 'icon', style: 'color:#94a3b8' }, [el('use', { href: '#i-chevron-right' })])
      ])));
    };
    card.querySelector('#kbSearch').addEventListener('input', e =>
      renderList(e.target.value.trim()));
    renderList('');
  }

  function article(root, id) {
    root.innerHTML = '';
    const a = Knowledge.ARTICLES.find(x => x.id === id) || Knowledge.ARTICLES[0];
    const card = el('article', { class: 'card article' });
    card.innerHTML = `
      <a href="#/knowledge" class="btn btn-sm btn-secondary" style="margin-bottom:12px">
        <svg class="icon"><use href="#i-back"/></svg>返回知识库</a>
      <h2>${a.icon} ${esc(a.title)}</h2>
      ${a.body}
      <div class="note">以上为通用科普，具体控制目标与处理方案请遵循你的主治医师意见。</div>`;
    root.appendChild(card);
  }

  Views.knowledge = { mount };
})();
