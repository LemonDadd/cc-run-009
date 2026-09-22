/* views/home.js — 首页仪表盘 */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const { $, el, esc, evalG, badgeFor, toast } = App;
  const U = Utils;

  async function mount(root) {
    const todayStart = U.startOfDay().getTime();
    const todayEnd = todayStart + U.DAY_MS;

    const [glucose, meals, meds, exercise, reminders] = await Promise.all([
      DB.Glucose.all(), DB.Meals.all(), DB.Medication.all(),
      DB.Exercise.all(), DB.Reminders.all()
    ]);
    const todayG = glucose.filter(r => r.at >= todayStart && r.at < todayEnd)
      .sort((a, b) => a.at - b.at);
    const todayM = meals.filter(r => r.at >= todayStart && r.at < todayEnd);
    const todayMed = meds.filter(r => r.at >= todayStart && r.at < todayEnd);
    const todayEx = exercise.filter(r => r.at >= todayStart && r.at < todayEnd);
    const last = glucose.sort((a, b) => b.at - a.at)[0];

    const hour = new Date().getHours();
    const hi = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    const name = App.State.profile.name;

    const avg = U.avg(todayG.map(r => r.value));
    const hypoToday = todayG.filter(r => evalG(r.value, r.context).status === 'low' ||
      evalG(r.value, r.context).status === 'danger' && r.value < U.HYPO_THRESHOLD).length;
    const totalGL = todayM.reduce((s, m) => s + (m.totalGL || 0), 0);
    const exMin = todayEx.reduce((s, e) => s + (e.minutes || 0), 0);

    // 未来 7 天内复诊
    const soon = reminders
      .filter(r => r.enabled && r.kind === 'followup' && r.at >= Date.now() && r.at <= Date.now() + 7 * U.DAY_MS)
      .sort((a, b) => a.at - b.at)[0];

    const unit = App.State.settings.unit;

    root.appendChild(el('section', { class: 'hero' }, [
      el('div', {}, [
        el('h2', { text: `${hi}${name ? '，' + esc(name) : ''}` }),
        el('div', { class: 'hero-sub', text: todayG.length
          ? `今天已记录 ${todayG.length} 次血糖`
          : '今天还没有血糖记录，测一次吧' })
      ]),
      last ? (() => {
        const res = evalG(last.value, last.context);
        const colorMap = { ok: '#bbf7d0', high: '#fde68a', low: '#bfdbfe', danger: '#fecaca' };
        return el('div', { class: 'hero-glucose' }, [
          el('div', { class: 'gv-big', style: `color:${colorMap[res.status]}`, text: U.displayValue(last.value, unit) }),
          el('div', { class: 'gv-meta' }, [
            el('div', {}, [document.createTextNode(U.unitLabel(unit) + ' · '),
              el('strong', { text: U.CONTEXT_LABELS[last.context] || '' })]),
            el('div', { text: U.friendlyDateTime(last.at) }),
            el('div', { html: badgeFor(res.status, res.label), style: 'margin-top:6px' })
          ])
        ]);
      })() : el('div', { class: 'hero-glucose' }, [
        el('div', { class: 'gv-big', text: '—' }),
        el('div', { class: 'gv-meta' }, [
          el('div', { text: '暂无记录' }),
          el('a', { class: 'btn btn-sm', href: '#/glucose',
            style: 'margin-top:8px;background:#fff;color:#0f766e', text: '去记录第一次' })
        ])
      ])
    ]));

    // 今日统计
    const statCard = (label, value, sub, color) => el('div', { class: 'card stat-card' }, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value', style: color ? `color:${color}` : '', text: value }),
      sub ? el('div', { class: 'stat-sub', text: sub }) : null
    ]);
    root.appendChild(el('section', { class: 'grid grid-3' }, [
      statCard('今日平均血糖',
        avg != null ? U.displayValue(U.round1(avg), unit) : '—',
        `共 ${todayG.length} 次测量`),
      statCard('今日低血糖', String(hypoToday),
        hypoToday ? '注意及时补糖' : '无低血糖记录',
        hypoToday ? 'var(--danger)' : ''),
      statCard('今日总 GL', totalGL ? U.round1(totalGL).toFixed(1) : '—',
        totalGL > 20 ? '升糖负荷偏高' : '控制中'),
      statCard('今日用药', `${todayMed.length} 次`, ''),
      statCard('今日运动', exMin ? `${exMin} 分钟` : '—', ''),
      statCard('本周复诊', soon ? U.friendlyDate(U.ymd(new Date(soon.at))) : '无安排',
        soon ? soon.title : '')
    ]));

    // 快速操作
    const qa = (iconId, cls, label, fn) => el('button', { class: 'qa-btn', onclick: fn }, [
      el('svg', { class: `icon ${cls}` }, [el('use', { href: `#${iconId}` })]),
      el('span', { text: label })
    ]);
    root.appendChild(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: '快速记录（3 步内完成）' }),
      el('div', { class: 'quick-actions' }, [
        qa('i-droplet', 'qa-g', '血糖', () => Views.glucose.openForm()),
        qa('i-utensils', 'qa-m', '饮食', () => Views.meals.openForm()),
        qa('i-pill', 'qa-d', '用药', () => Views.medication.openForm()),
        qa('i-run', 'qa-e', '运动', () => Views.exercise.openForm())
      ])
    ]));

    // 今日血糖速览
    if (todayG.length) {
      const list = el('div');
      todayG.slice(-5).reverse().forEach(r => {
        const res = evalG(r.value, r.context);
        const cmap = { ok: 'g-ok', high: 'g-high', low: 'g-low', danger: 'g-danger' };
        list.appendChild(el('div', { class: 'record' }, [
          el('div', { class: 'record-main' }, [
            el('div', { class: 'record-title' }, [
              el('span', { class: `glucose-value ${cmap[res.status]}`, text: U.displayValue(r.value, unit) }),
              document.createTextNode(' ' + U.unitLabel(unit) + ' · '),
              document.createTextNode(U.CONTEXT_LABELS[r.context] || '')
            ]),
            r.note ? el('div', { class: 'record-sub', text: r.note }) : null
          ]),
          el('div', { class: 'record-time', text: U.hm(new Date(r.at)) })
        ]));
      });
      root.appendChild(el('section', { class: 'card' }, [
        el('h2', { class: 'card-title' }, [
          document.createTextNode('今日血糖'),
          el('span', { class: 'spacer' }),
          el('a', { class: 'btn btn-sm btn-secondary', href: '#/glucose', text: '全部记录' })
        ]),
        list
      ]));
    }

    // 知识库快捷入口
    const kbCard = el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: '随时可查的知识库' }),
      el('div', { class: 'grid grid-2' },
        Knowledge.ARTICLES.slice(0, 4).map(a => el('a', { class: 'kb-item', href: `#/knowledge/${a.id}` }, [
          el('span', { class: 'kb-ico', text: a.icon }),
          el('div', {}, [
            el('h3', { text: a.title }),
            el('p', { text: a.summary })
          ])
        ])))
    ]);
    root.appendChild(kbCard);
  }

  Views.home = { mount };
})();
