/* =========================================================
 * SugarLog · UI 基础工具
 * h() 安全 DOM 构建 / 模态框 / 确认框 / Toast / 文件下载
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * 创建元素
   * h('div.class#id', {onClick: fn, html: '...'}, children...)
   * 文本字符串作为子节点会自动转义（textContent），避免 XSS
   */
  function h(tag, attrs) {
    var node;
    var tagMatch = tag.match(/^[a-zA-Z0-9]+/);
    var tagName = tagMatch ? tagMatch[0] : 'div';

    if (tagName === 'svg' || (tag.indexOf('svg:') === 0)) {
      node = document.createElementNS(SVG_NS, tagName.replace('svg:', ''));
    } else {
      node = document.createElement(tagName);
    }

    // 解析 id / class（支持 .a-b.c#id 形式，类名可含 - _）
    var rest = tag.slice(tagMatch ? tagMatch[0].length : 0);
    var idMatch = rest.match(/#([^.#]+)/);
    if (idMatch) node.id = idMatch[1];
    var classes = [];
    rest.replace(/\.([^.#]+)/g, function (_, c) { classes.push(c); return _; });
    if (classes.length) node.className = classes.join(' ');

    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var val = attrs[k];
        if (val === null || val === undefined || val === false) return;
        if (k === 'html') { node.innerHTML = val; return; }
        if (k === 'text') { node.textContent = val; return; }
        if (k === 'class' || k === 'className') {
          node.className = (node.className ? node.className + ' ' : '') + val;
          return;
        }
        if (k === 'dataset') {
          Object.keys(val).forEach(function (dk) { node.dataset[dk] = val[dk]; });
          return;
        }
        if (k === 'style' && typeof val === 'object') {
          Object.keys(val).forEach(function (sk) { node.style[sk] = val[sk]; });
          return;
        }
        if (k.indexOf('on') === 0 && typeof val === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), val);
          return;
        }
        if (k === 'checked' || k === 'disabled' || k === 'readonly' || k === 'multiple') {
          if (val) node[k] = true;
          return;
        }
        node.setAttribute(k, val === true ? '' : val);
      });
    }

    for (var i = 2; i < arguments.length; i++) {
      appendChild(node, arguments[i]);
    }
    return node;
  }

  function appendChild(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { appendChild(node, c); });
      return;
    }
    if (child.nodeType) { node.appendChild(child); return; }
    node.appendChild(document.createTextNode(String(child)));
  }

  /** 清空并重渲染 */
  function mount(container, content) {
    container.innerHTML = '';
    if (Array.isArray(content)) {
      content.forEach(function (c) { c && container.appendChild(c); });
    } else if (content) {
      container.appendChild(content);
    }
  }

  /** 元素简写集合 */
  function elFactory(tag) {
    return function () {
      var args = [tag];
      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
      return h.apply(null, args);
    };
  }
  var E = {};
  ['div', 'span', 'button', 'a', 'p', 'strong', 'small', 'label', 'select',
   'option', 'input', 'textarea', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
   'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'b', 'i', 'br', 'img', 'form'].forEach(function (t) {
    E[t] = elFactory(t);
  });

  /* ---------------- 表单快捷构造 ---------------- */
  function field(labelText, control, hint) {
    return h('.field', {},
      h('label', {}, labelText),
      control,
      hint ? h('.hint', {}, hint) : null
    );
  }

  function selectInput(options, value, onChange) {
    var sel = h('select.input', { onchange: function (e) { onChange && onChange(e.target.value); } });
    options.forEach(function (o) {
      var opt = h('option', { value: o.value !== undefined ? o.value : o }, o.label !== undefined ? o.label : o);
      if (String(value) === String(o.value !== undefined ? o.value : o)) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, type, ms) {
    var root = document.getElementById('toast-root');
    var t = h('.toast' + (type ? '.' + type : ''), { text: msg });
    root.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transition = 'opacity .25s';
      setTimeout(function () { t.remove(); }, 260);
    }, ms || 2200);
  }

  /* ---------------- 模态框 ---------------- */
  var modalCount = 0;
  /**
   * openModal({ title, content, wide, onClose })
   * 返回 { close }
   */
  function openModal(opts) {
    var root = document.getElementById('modal-root');
    modalCount++;
    var closeBtn = h('button.modal-close', {
      'aria-label': '关闭',
      onClick: function () { api.close(); }
    }, '✕');

    var box = h('.modal' + (opts.wide ? '.wide' : ''), {},
      h('.modal-head', {}, h('h2', {}, opts.title || ''), closeBtn),
      h('.modal-body', {})
    );
    var body = box.querySelector('.modal-body');
    if (Array.isArray(opts.content)) {
      opts.content.forEach(function (c) { c && body.appendChild(c); });
    } else if (opts.content && opts.content.nodeType) {
      body.appendChild(opts.content);
    } else if (typeof opts.content === 'string') {
      body.innerHTML = opts.content;
    }

    var mask = h('.modal-mask', {
      onClick: function (e) {
        if (e.target === mask) api.close();
      }
    }, box);

    root.appendChild(mask);
    document.body.style.overflow = 'hidden';

    var api = {
      el: box,
      body: body,
      close: function () {
        mask.remove();
        modalCount = Math.max(0, modalCount - 1);
        if (modalCount === 0) document.body.style.overflow = '';
        if (typeof opts.onClose === 'function') opts.onClose();
      }
    };

    // 自动聚焦第一个输入框
    setTimeout(function () {
      var first = box.querySelector('input, select, textarea, button');
      if (first) first.focus();
    }, 30);

    return api;
  }

  /** Promise 版确认框 */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var resolved = false;
      function done(v) {
        if (resolved) return;
        resolved = true;
        modal.close();
        resolve(v);
      }
      var modal = openModal({
        title: opts.title || '请确认',
        content: h('div', {},
          h('p.p-confirm', { style: 'margin:6px 0 0;font-size:1.05rem;line-height:1.7' }, opts.message || ''),
          opts.detail ? h('p.small.muted', { style: 'margin-top:10px' }, opts.detail) : null
        ),
        onClose: function () { done(false); }
      });
      modal.body.appendChild(
        h('.modal-foot', {},
          h('button.btn.ghost', { onClick: function () { done(false); } }, opts.cancelText || '取消'),
          h('button.btn' + (opts.danger ? '.danger' : ''), {
            onClick: function () { done(true); }
          }, opts.okText || '确定')
        )
      );
    });
  }

  /* ---------------- 文件下载 / 打开 ---------------- */
  function download(filename, content, mime) {
    var blob = (content instanceof Blob) ? content :
      new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 300);
  }

  function openTextFile(accept) {
    return new Promise(function (resolve, reject) {
      var input = h('input', { type: 'file', accept: accept || '.json,application/json', style: 'display:none' });
      document.body.appendChild(input);
      input.onchange = function () {
        var file = input.files[0];
        if (!file) { input.remove(); return resolve(null); }
        var reader = new FileReader();
        reader.onload = function () {
          input.remove();
          resolve({ name: file.name, text: reader.result });
        };
        reader.onerror = function () { input.remove(); reject(reader.error); };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  /* ---------------- 空状态 / 徽章 ---------------- */
  function emptyBox(emoji, text, action) {
    return h('.empty', {},
      h('span.big', {}, emoji),
      h('div', {}, text),
      action ? h('div.mt18', {}, action) : null
    );
  }

  function statusChip(cls, label) {
    return h('span.chip.' + cls, {}, label);
  }

  SL.UI = {
    h: h, E: E, mount: mount, field: field, selectInput: selectInput,
    toast: toast, openModal: openModal, confirm: confirmDialog,
    download: download, openTextFile: openTextFile,
    emptyBox: emptyBox, statusChip: statusChip
  };
})(window);
