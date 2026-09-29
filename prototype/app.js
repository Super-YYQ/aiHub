// AI 工作台原型：无依赖、无构建，直接双击 index.html 即可运行。
// 数据存浏览器 localStorage；正式版把 load/save 换成调用后端 API 即可，界面层不变。
(function () {
  'use strict';

  const TYPES = [
    { id: 'tool', name: '工具', fields: ['类别', '安装方式', '配置目录', '费用'] },
    { id: 'prompt', name: '提示词', fields: ['适用场景', '推荐模型', '变量'] },
    { id: 'skill', name: 'Skill', fields: ['宿主', '来自插件', '触发'] },
    { id: 'mcp', name: 'MCP', fields: ['传输', '命令', '地址', '作用域', '需要的环境变量'] },
    { id: 'hook', name: 'Hook', fields: ['事件', '匹配器', '配置位置', '依赖'] },
    { id: 'plugin', name: '插件', fields: ['市场', '包含', '来源仓库'] },
    { id: 'config', name: '配置', fields: ['文件路径', '引用方式', '生效范围'] },
    { id: 'model', name: '模型与 API', fields: ['服务商', '常用模型', '密钥变量'] }
  ];
  const STATUSES = [
    { id: 'inbox', name: '待整理' },
    { id: 'using', name: '在用' },
    { id: 'trying', name: '试用中' },
    { id: 'wishlist', name: '想试' },
    { id: 'archived', name: '已弃用' }
  ];
  const PLATFORMS = [
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'codex', name: 'Codex' },
    { id: 'cursor', name: 'Cursor' },
    { id: 'claude-app', name: 'Claude 客户端' },
    { id: 'chatgpt', name: 'ChatGPT' },
    { id: 'general', name: '通用' }
  ];
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const TYPE = byId(TYPES);
  const STATUS = byId(STATUSES);
  const PLATFORM = byId(PLATFORMS);

  const STYLES = [
    { id: 'soft', name: 'A 柔和', note: '浮起的卡片、柔和阴影、大圆角' },
    { id: 'calm', name: 'B 沉静', note: '信息密度高，细线分隔' },
    { id: 'glass', name: 'C 夜航', note: '半透明磨砂面板，深色模式更出彩' }
  ];
  const STACK_KINDS = [
    { id: 'pc', name: '电脑' }, { id: 'server', name: '服务器' }, { id: 'phone', name: '手机' },
    { id: 'tablet', name: '平板' }, { id: 'scene', name: '使用场景' }
  ];
  const STACK_OS = [
    { id: 'windows', name: 'Windows' }, { id: 'macos', name: 'macOS' }, { id: 'linux', name: 'Linux' },
    { id: 'ios', name: 'iOS' }, { id: 'android', name: 'Android' }, { id: 'any', name: '不限系统' }
  ];
  const KIND = byId(STACK_KINDS);
  const OS = byId(STACK_OS);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const LAYOUTS = [
    { id: 'panes', name: '1 三栏', note: '侧栏 + 列表 + 详情，切换条目最快' },
    { id: 'gallery', name: '2 卡片墙', note: '卡片网格，卡片上直接复制，详情从右侧滑出' },
    { id: 'launcher', name: '3 搜索优先', note: '中间一个大搜索框，左边结果右边预览，回车复制' },
    { id: 'board', name: '4 看板', note: '按状态分列，拖动卡片改状态；也能按环境或类型分列' },
    { id: 'docs', name: '5 知识库', note: '左侧目录树，中间文档页，右侧属性栏' }
  ];
  const layoutOf = () => document.documentElement.dataset.layout || 'panes';

  // ---------- 存储 ----------
  const KEY = 'aikit.data.v1';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (err) { /* 数据损坏时回退到示例数据 */ }
    return clone(window.AIKIT_SEED);
  }
  let db = load();
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
  const findEntry = (id) => db.entries.find((e) => e.id === id);
  const findStack = (id) => db.stacks.find((s) => s.id === id);

  const ui = { status: '', platform: '', tag: '', sort: 'updated' };

  // ---------- 工具函数 ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const pad = (n) => String(n).padStart(2, '0');
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function relDate(s) {
    const days = Math.round((new Date(today()) - new Date(s)) / 86400000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 30) return `${days} 天前`;
    return s;
  }
  function slugify(s) {
    return String(s).trim().toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
  }
  const typeName = (t) => (TYPE[t] ? TYPE[t].name : t);
  const statusName = (s) => (STATUS[s] ? STATUS[s].name : s);
  const platformName = (p) => (PLATFORM[p] ? PLATFORM[p].name : p);
  const pathOf = (e) => `<span class="path" data-type="${esc(e.type)}"><b>${esc(e.type)}</b>/${esc(e.slug)}</span>`;
  const statusTag = (s) => `<span class="st st-${esc(s)}">${esc(statusName(s))}</span>`;
  const typeBadge = (t) => `<span class="type-badge" data-type="${esc(t)}">${esc(typeName(t))}</span>`;
  const varsOf = (code) => Array.from(new Set((String(code).match(/\{\{([^{}]+)\}\}/g) || []).map((v) => v.slice(2, -2).trim())));

  // ---------- 极简 Markdown（先转义再替换，避免注入） ----------
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let list = null;
    let para = [];
    const flush = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    const open = (tag) => { if (list !== tag) { close(); html += `<${tag}>`; list = tag; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^```/.test(line)) {
        flush(); close();
        const buf = [];
        while (++i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i]);
        html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        flush(); close();
        const lv = m[1].length + 1;
        html += `<h${lv}>${inline(m[2])}</h${lv}>`;
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        flush(); open('ul'); html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
        flush(); open('ol'); html += `<li>${inline(m[1])}</li>`;
      } else if (!line.trim()) {
        flush(); close();
      } else {
        close(); para.push(line);
      }
    }
    flush(); close();
    return html;
  }

  // ---------- 搜索：类型名与名称命中权重最高，其次说明/标签/字段，最后片段与笔记 ----------
  const termsOf = (q) => String(q).toLowerCase().split(/\s+/).filter(Boolean);
  function search(q) {
    const terms = termsOf(q);
    if (!terms.length) return [];
    const hits = [];
    for (const e of db.entries) {
      const title = `${e.title} ${e.slug}`.toLowerCase();
      const meta = [typeName(e.type), e.type, e.summary, ...(e.tags || []), ...Object.values(e.fields || {})].join(' ').toLowerCase();
      const deep = [...(e.snippets || []).map((s) => `${s.label} ${s.code}`), e.body].join(' ').toLowerCase();
      let score = 0;
      let ok = true;
      for (const t of terms) {
        if (t === e.type || t === typeName(e.type).toLowerCase()) score += 10;
        else if (title.includes(t)) score += title.startsWith(t) ? 12 : 8;
        else if (meta.includes(t)) score += 4;
        else if (deep.includes(t)) score += 1;
        else { ok = false; break; }
      }
      if (!ok) continue;
      if (e.status === 'archived') score -= 3;
      if (e.pinned) score += 1;
      hits.push({ e, score });
    }
    return hits.sort((a, b) => b.score - a.score).map((h) => h.e);
  }
  function highlight(text, terms) {
    const s = String(text || '');
    const low = s.toLowerCase();
    if (!terms.length || low.length !== s.length) return esc(s);
    const hit = new Array(s.length).fill(false);
    for (const t of terms) {
      for (let i = low.indexOf(t); i !== -1; i = low.indexOf(t, i + t.length)) {
        for (let k = i; k < i + t.length; k++) hit[k] = true;
      }
    }
    let out = '';
    let on = false;
    for (let k = 0; k < s.length; k++) {
      if (hit[k] !== on) { out += hit[k] ? '<mark>' : '</mark>'; on = hit[k]; }
      out += esc(s[k]);
    }
    return on ? `${out}</mark>` : out;
  }

  // ---------- 路由 ----------
  // #/  #/list/<scope>[/<id>]  #/new[/<type>]  #/edit/<id>  #/stacks  #/stack/<id>  #/settings
  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [name = 'home', a, b] = parts;
    if (name === 'list') return { name, scope: a || 'all', id: b };
    if (name === 'edit' || name === 'stack' || name === 'stack-edit') return { name, id: a };
    if (name === 'new') return { name, type: a };
    return { name };
  }
  // 页面层级：用于决定手机上的切换方向（进入更深一层从右滑入，返回从左滑入）
  const DEPTH = { home: 0, list: 1, stacks: 1, settings: 2, stack: 2, new: 3, edit: 3, 'stack-new': 3, 'stack-edit': 3 };
  function depthOf(r) {
    return (DEPTH[r.name] || 0) + (r.name === 'list' && r.id ? 1 : 0);
  }
  const go = (hash) => { location.hash = hash; };
  const narrow = matchMedia('(max-width: 860px)');

  function scopeEntries(scope) {
    if (scope === 'all') return db.entries.filter((e) => e.status !== 'archived');
    if (scope === 'pinned') return db.entries.filter((e) => e.pinned);
    if (STATUS[scope]) return db.entries.filter((e) => e.status === scope);
    return db.entries.filter((e) => e.type === scope);
  }
  function scopeName(scope) {
    if (scope === 'all') return '全部条目';
    if (scope === 'pinned') return '置顶';
    if (STATUS[scope]) return statusName(scope);
    return typeName(scope);
  }

  // ---------- 侧栏 ----------
  function navItem(href, label, count, opts) {
    const o = opts || {};
    const cur = o.current ? ' aria-current="page"' : '';
    const sw = o.type ? `<span class="swatch" data-type="${o.type}"></span>` : icon(o.icon || 'list');
    const num = count == null ? '' : `<span class="count">${count}</span>`;
    return `<a class="nav-item" href="${href}"${cur}>${sw}<span>${esc(label)}</span>${num}</a>`;
  }
  function renderNav(r) {
    const scope = r.name === 'list' ? r.scope : null;
    const inbox = db.entries.filter((e) => e.status === 'inbox').length;
    $('#nav-main').innerHTML =
      navItem('#/', '工作台', null, { icon: 'home', current: r.name === 'home' }) +
      navItem('#/list/all', '全部条目', scopeEntries('all').length, { icon: 'list', current: scope === 'all' }) +
      navItem('#/list/inbox', '待整理', inbox, { icon: 'inbox', current: scope === 'inbox' }) +
      navItem('#/list/pinned', '置顶', scopeEntries('pinned').length, { icon: 'pin', current: scope === 'pinned' });
    $('#nav-types').innerHTML = '<h2>按类型</h2>' + TYPES.map((t) =>
      navItem(`#/list/${t.id}`, t.name, db.entries.filter((e) => e.type === t.id).length, { type: t.id, current: scope === t.id })).join('');
    $('#nav-stacks').innerHTML = '<h2>我的环境</h2>' + db.stacks.map((s) =>
      navItem(`#/stack/${s.id}`, s.name, stackItems(s.id).length, { icon: 'stack', current: (r.name === 'stack' || r.name === 'stack-edit') && r.id === s.id })).join('') +
      navItem('#/stack-new', '新建环境', null, { icon: 'plus', current: r.name === 'stack-new' }) +
      navItem('#/settings', '数据与设置', null, { icon: 'sliders', current: r.name === 'settings' });
    if (layoutOf() === 'docs') $('#nav-types').innerHTML = '<h2>目录</h2>' + docsTree(r);
    $('#rail-foot').textContent = `共 ${db.entries.length} 条，数据保存在本浏览器`;
    const tab = { home: 'home', list: 'list', new: 'list', edit: 'list', stacks: 'stacks', stack: 'stacks', 'stack-new': 'stacks', 'stack-edit': 'stacks', settings: 'stacks' }[r.name];
    $$('.tabbar [data-tab]').forEach((el) => {
      if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  }

  // ---------- 条目行（列表、工作台、面板共用） ----------
  function row(e, href, current) {
    return `<a class="row" data-type="${esc(e.type)}" href="${href}"${current ? ' aria-current="true"' : ''}>
      <span class="row-head">${pathOf(e)}${e.pinned ? '<span class="pin" title="已置顶">置顶</span>' : ''}${statusTag(e.status)}</span>
      <span class="row-title">${esc(e.title)}</span>
      ${e.summary ? `<span class="row-summary">${esc(e.summary)}</span>` : ''}
    </a>`;
  }
  const byUpdated = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));

  // ---------- 工作台 ----------
  function renderHome() {
    const pinned = db.entries.filter((e) => e.pinned).sort(byUpdated);
    const recent = db.entries.filter((e) => !e.pinned).sort(byUpdated).slice(0, 6);
    const inbox = db.entries.filter((e) => e.status === 'inbox').sort(byUpdated);
    const trial = db.entries.filter((e) => e.status === 'trying' || e.status === 'wishlist').sort(byUpdated);
    const live = db.entries.filter((e) => e.status !== 'archived');
    const counts = TYPES.map((t) => ({ t, n: live.filter((e) => e.type === t.id).length })).filter((x) => x.n);
    const panel = (list, empty) => `<div class="panel">${list.length ? list.map((e) => row(e, `#/list/all/${e.id}`)).join('') : `<div class="panel-empty">${empty}</div>`}</div>`;
    return `<div class="page">
      <form class="capture" id="capture" autocomplete="off">
        <label class="sr-only" for="cap-type">类型</label>
        <select id="cap-type">${TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
        <label class="sr-only" for="cap-text">内容</label>
        <input id="cap-text" placeholder="记下名字、链接或提示词" required>
        <button class="btn btn-primary" type="submit">存入待整理</button>
      </form>
      <p class="capture-hint">先记下来，有空再补全字段。搜索按 <kbd>Ctrl K</kbd>，在搜索结果上按 <kbd>Ctrl Enter</kbd> 直接复制第一个片段。</p>
      <div class="board">
        <div>
          <h2>置顶 <span class="count">${pinned.length}</span></h2>${panel(pinned, '在条目详情里点“置顶”，常用的配置会出现在这里。')}
          <h2>最近更新</h2>${panel(recent, '还没有条目。')}
        </div>
        <div>
          <h2>在用的构成 <span class="count">${live.length} 条</span></h2>
          <div class="spread" role="img" aria-label="各类型条目数量">${counts.map((x) => `<span data-type="${x.t.id}" style="flex:${x.n}"></span>`).join('')}</div>
          <ul class="legend">${counts.map((x) => `<li><a href="#/list/${x.t.id}"><span class="swatch" data-type="${x.t.id}"></span>${x.t.name}<span class="num">${x.n}</span></a></li>`).join('')}</ul>
          <h2 style="margin-top:28px">待整理 <span class="count">${inbox.length}</span></h2>${panel(inbox, '收件箱是空的。')}
          <h2 style="margin-top:28px">试用中与想试 <span class="count">${trial.length}</span></h2>${panel(trial, '没有待评估的条目。')}
        </div>
      </div>
    </div>`;
  }

  // ---------- 各结构共用：筛选、类型标签、快速记录框 ----------
  function applyFilters(list, r) {
    let out = list;
    if (ui.status && !STATUS[r.scope]) out = out.filter((e) => e.status === ui.status);
    if (ui.platform) out = out.filter((e) => (e.platforms || []).includes(ui.platform));
    if (ui.tag) out = out.filter((e) => (e.tags || []).includes(ui.tag));
    const cmp = ui.sort === 'title' ? (a, b) => a.title.localeCompare(b.title, 'zh') : ui.sort === 'rating' ? (a, b) => (b.rating || 0) - (a.rating || 0) : byUpdated;
    return out.slice().sort(cmp);
  }
  function filterSelects(r) {
    return [
      STATUS[r.scope] ? '' : `<select data-filter="status" aria-label="按状态筛选">${options(STATUSES, ui.status, '全部状态')}</select>`,
      `<select data-filter="platform" aria-label="按平台筛选">${options(PLATFORMS, ui.platform, '全部平台')}</select>`,
      `<select data-filter="sort" aria-label="排序">${[['updated', '最近更新'], ['title', '按名称'], ['rating', '按评分']].map(([v, n]) => `<option value="${v}"${ui.sort === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`
    ].join('');
  }
  function typeTabs(current) {
    const live = db.entries.filter((e) => e.status !== 'archived');
    const tab = (id, label, n, type) => `<a href="#/list/${id}"${current === id ? ' aria-current="page"' : ''}${type ? ` data-type="${type}"` : ''}>${type ? '<span class="swatch"></span>' : ''}${esc(label)}<span class="count">${n}</span></a>`;
    return `<nav class="type-tabs" aria-label="按类型">${tab('all', '全部', live.length)}${TYPES.map((t) => tab(t.id, t.name, live.filter((e) => e.type === t.id).length, t.id)).join('')}</nav>`;
  }
  const firstLine = (code) => String(code || '').split(NL).find((l) => l.trim()) || '';
  const captureForm = () => `<form class="capture" id="capture" autocomplete="off">
    <label class="sr-only" for="cap-type">类型</label>
    <select id="cap-type">${TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
    <label class="sr-only" for="cap-text">内容</label>
    <input id="cap-text" placeholder="记下名字、链接或提示词" required>
    <button class="btn btn-primary" type="submit">存入待整理</button>
  </form>`;
  const groupByType = (list, scope) => (TYPE[scope] ? [{ t: TYPE[scope], items: list }]
    : TYPES.map((t) => ({ t, items: list.filter((e) => e.type === t.id) })).filter((g) => g.items.length));
  const browseScope = (r) => (r.name === 'list' ? r.scope : 'all');

  // ---------- 列表 + 详情 ----------
  function options(list, value, allLabel) {
    return `<option value="">${allLabel}</option>` + list.map((o) => `<option value="${esc(o.id)}"${o.id === value ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
  }
  function renderList(r) {
    let list = scopeEntries(r.scope);
    const tags = Array.from(new Set(list.flatMap((e) => e.tags || []))).map((t) => ({ id: t, name: `#${t}` }));
    if (ui.status && !STATUS[r.scope]) list = list.filter((e) => e.status === ui.status);
    if (ui.platform) list = list.filter((e) => (e.platforms || []).includes(ui.platform));
    if (ui.tag) list = list.filter((e) => (e.tags || []).includes(ui.tag));
    list.sort(ui.sort === 'title' ? (a, b) => a.title.localeCompare(b.title, 'zh') : ui.sort === 'rating' ? (a, b) => (b.rating || 0) - (a.rating || 0) : byUpdated);
    const filters = [
      STATUS[r.scope] ? '' : `<select data-filter="status" aria-label="按状态筛选">${options(STATUSES, ui.status, '全部状态')}</select>`,
      `<select data-filter="platform" aria-label="按平台筛选">${options(PLATFORMS, ui.platform, '全部平台')}</select>`,
      tags.length ? `<select data-filter="tag" aria-label="按标签筛选">${options(tags, ui.tag, '全部标签')}</select>` : '',
      `<select data-filter="sort" aria-label="排序">${[['updated', '最近更新'], ['title', '按名称'], ['rating', '按评分']].map(([v, n]) => `<option value="${v}"${ui.sort === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`
    ].join('');
    const newHref = TYPE[r.scope] ? `#/new/${r.scope}` : '#/new';
    const rows = list.length
      ? list.map((e) => row(e, `#/list/${encodeURIComponent(r.scope)}/${e.id}`, e.id === r.id)).join('')
      : `<div class="panel-empty">没有符合条件的条目。<a href="${newHref}">新建一条</a>，或调整上面的筛选。</div>`;
    const detail = r.id ? renderDetail(findEntry(r.id)) : emptyDetail(r.scope);
    return `<div class="split${r.id ? ' has-detail' : ''}">
      <section class="list-pane" aria-label="条目列表"><div class="filters">${filters}</div><div class="list">${rows}</div></section>
      <section class="detail-pane" aria-label="条目详情">${detail}</section>
    </div>`;
  }

  function snippetHtml(e, s, i) {
    const vars = varsOf(s.code);
    const code = esc(s.code).replace(/\{\{([^{}]+)\}\}/g, '<span class="var">{{$1}}</span>');
    const form = vars.length
      ? `<div class="vars">${vars.map((v) => `<label>${esc(v)}<textarea rows="1" data-var="${esc(v)}" data-snip="${i}"></textarea></label>`).join('')}</div>`
      : '';
    return `<div class="snippet">
      <div class="snippet-head"><strong>${esc(s.label || '片段')}</strong><span class="lang">${esc(s.lang || 'text')}</span>${s.install ? '<span class="chip">安装命令</span>' : ''}
        <button class="btn btn-sm" type="button" data-act="copy-snip" data-id="${esc(e.id)}" data-i="${i}">${icon('copy')}${vars.length ? '填好后复制' : '复制'}</button></div>
      <pre${/^(text|markdown|md)$/.test(s.lang || 'text') ? ' class="wrap"' : ''}><code>${code}</code></pre>${form}
    </div>`;
  }

  function renderDetail(e) {
    if (!e) return '<div class="empty-pane"><p>找不到这个条目，可能已被删除。</p></div>';
    const chips = [
      ...(e.platforms || []).map((p) => `<span class="chip">${esc(platformName(p))}</span>`),
      ...(e.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`),
      ...(e.stacks || []).map(findStack).filter(Boolean).map((s) => `<a class="chip" href="#/stack/${s.id}">${icon('stack')}${esc(s.name)}</a>`)
    ];
    const fields = Object.entries(e.fields || {}).filter(([, v]) => String(v).trim());
    const snippets = (e.snippets || []).map((s, i) => snippetHtml(e, s, i)).join('');
    const links = (e.links || []).filter((l) => /^https?:/.test(l.url))
      .map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></li>`).join('');
    const statusSel = STATUSES.map((s) => `<option value="${s.id}"${s.id === e.status ? ' selected' : ''}>${s.name}</option>`).join('');
    return `<article class="detail" data-type="${esc(e.type)}">
      <div class="detail-top">${typeBadge(e.type)}${pathOf(e)}
        <div class="detail-actions">
          <select class="btn btn-sm" data-act="status" data-id="${esc(e.id)}" aria-label="状态">${statusSel}</select>
          <button class="btn btn-sm" type="button" data-act="pin" data-id="${esc(e.id)}" aria-pressed="${!!e.pinned}">${e.pinned ? '取消置顶' : '置顶'}</button>
          <button class="btn btn-sm" type="button" data-act="copy-md" data-id="${esc(e.id)}">复制为 Markdown</button>
          <a class="btn btn-sm" href="#/edit/${esc(e.id)}">编辑</a>
        </div>
      </div>
      <h1>${esc(e.title)}</h1>
      ${e.summary ? `<p class="lede">${esc(e.summary)}</p>` : ''}
      ${chips.length ? `<div class="detail-meta">${chips.join('')}</div>` : ''}
      ${e.status === 'inbox' ? `<p class="lede">这条还在待整理：<a href="#/edit/${esc(e.id)}">补全信息</a>后，把状态改成“在用”或“想试”。</p>` : ''}
      ${snippets ? `<section><h3>片段</h3>${snippets}</section>` : ''}
      ${fields.length ? `<section><h3>要点</h3><dl class="kv">${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>` : ''}
      ${e.body ? `<section><h3>笔记</h3><div class="md">${md(e.body)}</div></section>` : ''}
      ${links ? `<section><h3>链接</h3><ul>${links}</ul></section>` : ''}
      <section><h3>记录</h3><p class="path">创建于 ${esc(e.createdAt)}，更新于 ${esc(e.updatedAt)}（${relDate(e.updatedAt)}）</p></section>
    </article>`;
  }

  // ---------- 2 卡片墙 ----------
  function galleryCard(e, scope, currentId) {
    const s = (e.snippets || [])[0];
    const hasVars = s && varsOf(s.code).length;
    return `<article class="card${e.id === currentId ? ' is-current' : ''}" data-type="${esc(e.type)}">
      <a class="card-link" href="#/list/${encodeURIComponent(scope)}/${esc(e.id)}" aria-label="查看 ${esc(e.title)}"></a>
      <div class="card-top">${typeBadge(e.type)}${e.pinned ? '<span class="pin">置顶</span>' : ''}${statusTag(e.status)}</div>
      <h3 class="card-title">${esc(e.title)}</h3>
      ${e.summary ? `<p class="card-summary">${esc(e.summary)}</p>` : ''}
      ${s ? `<div class="card-snip"><code>${esc(firstLine(s.code))}</code><button class="btn btn-sm" type="button" data-act="quick-copy" data-id="${esc(e.id)}" data-scope="${esc(scope)}">${icon('copy')}${hasVars ? '填变量' : '复制'}</button></div>` : ''}
      <div class="card-foot">${(e.tags || []).slice(0, 3).map((t) => `<span class="chip">#${esc(t)}</span>`).join('')}</div>
    </article>`;
  }
  function detailDrawer(scope, id) {
    if (!id) return '';
    return `<div class="drawer-backdrop" data-act="close-drawer" data-scope="${esc(scope)}">
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="条目详情">
        <button class="btn btn-sm drawer-close" type="button" data-act="close-drawer" data-scope="${esc(scope)}">关闭</button>
        ${renderDetail(findEntry(id))}
      </aside></div>`;
  }
  function renderGallery(r) {
    const scope = browseScope(r);
    const list = applyFilters(scopeEntries(scope), { scope });
    const body = groupByType(list, scope).map((g) => `<section><h2>${esc(g.t.name)} <span class="count">${g.items.length}</span></h2>
      <div class="card-grid">${g.items.map((e) => galleryCard(e, scope, r.id)).join('')}</div></section>`).join('')
      || '<div class="panel" style="margin-top:20px"><div class="panel-empty">没有符合条件的条目。调整筛选，或用上面的输入框记一条。</div></div>';
    return `<div class="gallery${r.id ? ' has-drawer' : ''}"><div class="gallery-body">
      ${typeTabs(TYPE[scope] ? scope : 'all')}
      <div class="gallery-tools">${captureForm()}<div class="filters">${filterSelects({ scope })}</div></div>
      ${body}</div>${detailDrawer(scope, r.id)}</div>`;
  }

  // ---------- 3 搜索优先 ----------
  const lstate = { q: '', sel: null, items: [] };
  const emptyPreview = '<div class="l-empty">选中一个结果，在这里预览。</div>';
  function launcherResults(scope) {
    const pool = scopeEntries(scope);
    const terms = termsOf(lstate.q);
    if (terms.length) {
      const ids = new Set(pool.map((e) => e.id));
      lstate.items = search(lstate.q).filter((e) => ids.has(e.id)).slice(0, 30);
    } else {
      lstate.items = [...pool.filter((e) => e.pinned).sort(byUpdated), ...pool.filter((e) => !e.pinned).sort(byUpdated).slice(0, 12)];
    }
    if (!lstate.items.some((e) => e.id === lstate.sel)) lstate.sel = lstate.items.length ? lstate.items[0].id : null;
    if (!lstate.items.length) return `<li class="l-empty">没有找到“${esc(lstate.q)}”。按 Enter 用它作为名称新建条目。</li>`;
    return (terms.length ? '' : '<li class="group" role="presentation">置顶与最近更新</li>') + lstate.items.map((e) => `<li>
      <a class="l-item" role="option" data-type="${esc(e.type)}" data-lid="${esc(e.id)}" aria-selected="${e.id === lstate.sel}" href="#/list/${encodeURIComponent(scope)}/${esc(e.id)}">
        <span class="row-head">${pathOf(e)}${statusTag(e.status)}</span>
        <span class="l-title">${highlight(e.title, terms)}</span>
        <span class="l-sub">${highlight(e.summary || firstLine(firstSnippet(e)), terms)}</span></a></li>`).join('');
  }
  function renderLauncher(r) {
    const scope = browseScope(r);
    if (r.id && narrow.matches) return `<div class="detail-pane">${renderDetail(findEntry(r.id))}</div>`;
    if (r.id) lstate.sel = r.id;
    const results = launcherResults(scope);
    const cur = findEntry(lstate.sel);
    const inbox = db.entries.filter((e) => e.status === 'inbox').length;
    return `<div class="launcher" data-scope="${esc(scope)}">
      <label class="l-search">${icon('search')}<span class="sr-only">搜索档案</span><input id="l-q" type="search" value="${esc(lstate.q)}" placeholder="搜索名称、命令或提示词内容" autocomplete="off"></label>
      <div class="l-meta">${typeTabs(TYPE[scope] ? scope : 'all')}${inbox ? `<a class="chip" href="#/list/inbox">待整理 ${inbox}</a>` : ''}</div>
      <div class="l-body"><ul class="l-results" id="l-results" role="listbox" aria-label="搜索结果">${results}</ul>
        <section class="l-preview" id="l-preview" aria-label="预览">${cur ? renderDetail(cur) : emptyPreview}</section></div>
      <div class="l-hints" style="margin-top:14px"><span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 复制第一个片段</span><span><kbd>Ctrl Enter</kbd> 编辑</span><span><kbd>Esc</kbd> 清空搜索</span></div>
    </div>`;
  }
  function launcherPaint() {
    const scope = $('.launcher').dataset.scope;
    $('#l-results').innerHTML = launcherResults(scope);
    const cur = findEntry(lstate.sel);
    $('#l-preview').innerHTML = cur ? renderDetail(cur) : emptyPreview;
  }
  function launcherMove(delta) {
    const n = lstate.items.length;
    if (!n) return;
    const i = lstate.items.findIndex((e) => e.id === lstate.sel);
    lstate.sel = lstate.items[(i + delta + n) % n].id;
    $$('#l-results .l-item').forEach((a) => a.setAttribute('aria-selected', String(a.dataset.lid === lstate.sel)));
    $('#l-preview').innerHTML = renderDetail(findEntry(lstate.sel));
    const el = $$('#l-results .l-item').find((a) => a.dataset.lid === lstate.sel);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  // ---------- 4 看板 ----------
  function boardColumns(group, list) {
    if (group === 'stack') {
      return [...db.stacks.map((s) => ({ name: s.name, icon: 'stack', items: list.filter((e) => (e.stacks || []).includes(s.id)) })),
        { name: '未加入环境', icon: 'stack', items: list.filter((e) => !(e.stacks || []).length) }];
    }
    if (group === 'type') return TYPES.map((t) => ({ name: t.name, type: t.id, items: list.filter((e) => e.type === t.id) }));
    return STATUSES.map((s) => ({ name: s.name, status: s.id, items: list.filter((e) => e.status === s.id) }));
  }
  function bcard(e, scope, dnd) {
    return `<article class="bcard" data-type="${esc(e.type)}" data-id="${esc(e.id)}"${dnd ? ' draggable="true"' : ''}>
      <a class="card-link" draggable="false" href="#/list/${encodeURIComponent(scope)}/${esc(e.id)}" aria-label="查看 ${esc(e.title)}"></a>
      <span class="b-top">${typeBadge(e.type)}${statusTag(e.status)}</span>
      <span class="b-title">${esc(e.title)}</span>${e.summary ? `<span class="b-sub">${esc(e.summary)}</span>` : ''}
    </article>`;
  }
  function renderBoard(r) {
    const scope = browseScope(r);
    const group = ui.boardGroup || 'status';
    const type = TYPE[scope] ? scope : '';
    const dnd = group === 'status';
    const list = db.entries.filter((e) => (!type || e.type === type) && (dnd || e.status !== 'archived'));
    const segs = [['status', '按状态'], ['stack', '按环境'], ['type', '按类型']].map(([k, n]) =>
      `<button type="button" data-act="board-group" data-group="${k}" aria-pressed="${group === k}">${n}</button>`).join('');
    const typeSel = `<select data-act="board-type" aria-label="只看某个类型"><option value="all">全部类型</option>${TYPES.map((t) => `<option value="${t.id}"${type === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
    const cols = boardColumns(group, list).map((c) => `<section class="board-col" data-status="${esc(c.status || '')}"${c.type ? ` data-type="${c.type}"` : ''} aria-label="${esc(c.name)}">
      <header>${c.type ? '<span class="swatch"></span>' : c.status ? `<span class="st st-${c.status}"></span>` : icon(c.icon)}${esc(c.name)}<span class="count">${c.items.length}</span></header>
      <div class="col-body">${c.status === 'inbox' ? '<form class="col-capture" id="col-capture" autocomplete="off"><label class="sr-only" for="col-cap">记一笔</label><input id="col-cap" placeholder="记一笔，回车存入待整理"></form>' : ''}
        ${c.items.sort(byUpdated).map((e) => bcard(e, scope, dnd)).join('') || '<div class="col-empty">这一列还没有条目</div>'}</div>
    </section>`).join('');
    return `<div class="board-wrap${r.id ? ' has-drawer' : ''}"><div class="board-page">
      <div class="board-tools"><div class="seg" role="group" aria-label="分组方式">${segs}</div>${typeSel}
        <span class="hint">${dnd ? '把卡片拖到另一列即可修改状态' : '切换到“按状态”后可以拖动卡片改状态'}</span></div>
      <div class="board">${cols}</div></div>${detailDrawer(scope, r.id)}</div>`;
  }

  // ---------- 5 知识库 ----------
  const docsClosed = new Set();
  function docsTree(r) {
    return `<div class="tree">${TYPES.map((t) => {
      const items = db.entries.filter((e) => e.type === t.id && e.status !== 'archived').sort((a, b) => a.title.localeCompare(b.title, 'zh'));
      if (!items.length) return '';
      return `<details data-tree="${t.id}"${docsClosed.has(t.id) ? '' : ' open'}><summary data-type="${t.id}"><span class="swatch"></span>${esc(t.name)}<span class="count">${items.length}</span></summary>
        ${items.map((e) => `<a class="tree-leaf" data-type="${esc(e.type)}" href="#/list/${t.id}/${esc(e.id)}"${r.id === e.id ? ' aria-current="page"' : ''}>${statusTag(e.status)}<span class="t">${esc(e.title)}</span></a>`).join('')}</details>`;
    }).join('')}</div>`;
  }
  const docIndexList = (items, scope) => (items.length ? `<ul class="doc-index">${items.map((e) => `<li data-type="${esc(e.type)}">
    <a href="#/list/${encodeURIComponent(scope)}/${esc(e.id)}"><span class="t">${pathOf(e)} ${esc(e.title)}</span><span class="s">${esc(e.summary)}</span></a></li>`).join('')}</ul>` : '<p class="lede">暂无。</p>');
  function docPage(e) {
    if (!e) return '<div class="doc-layout"><article class="doc"><p>找不到这个条目，可能已被删除。</p></article></div>';
    const fields = Object.entries(e.fields || {}).filter(([, v]) => String(v).trim());
    const links = (e.links || []).filter((l) => /^https?:/.test(l.url));
    const secs = [];
    if ((e.snippets || []).length) secs.push(['sec-snip', '片段', e.snippets.map((s, i) => snippetHtml(e, s, i)).join('')]);
    if (fields.length) secs.push(['sec-fields', '要点', `<dl class="kv">${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`]);
    if (e.body) secs.push(['sec-body', '笔记', `<div class="md">${md(e.body)}</div>`]);
    if (links.length) secs.push(['sec-links', '链接', `<ul>${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></li>`).join('')}</ul>`]);
    const statusSel = STATUSES.map((s) => `<option value="${s.id}"${s.id === e.status ? ' selected' : ''}>${s.name}</option>`).join('');
    const stacks = (e.stacks || []).map(findStack).filter(Boolean);
    return `<div class="doc-layout">
      <article class="doc" data-type="${esc(e.type)}">
        <div class="crumbs"><a href="#/list/${esc(e.type)}">${esc(typeName(e.type))}</a>${pathOf(e)}</div>
        <h1>${esc(e.title)}</h1>${e.summary ? `<p class="lede">${esc(e.summary)}</p>` : ''}
        ${e.status === 'inbox' ? `<p class="lede">这条还在待整理：<a href="#/edit/${esc(e.id)}">补全信息</a>。</p>` : ''}
        ${secs.map(([id, t, h]) => `<h2 id="${id}">${t}</h2>${h}`).join('')}
      </article>
      <aside class="doc-props" aria-label="属性">
        <h3>属性</h3>
        <dl class="kv"><dt>状态</dt><dd><select class="btn btn-sm" data-act="status" data-id="${esc(e.id)}" aria-label="状态">${statusSel}</select></dd>
          <dt>平台</dt><dd>${(e.platforms || []).map((p) => esc(platformName(p))).join('、') || '无'}</dd>
          <dt>标签</dt><dd>${(e.tags || []).map((t) => `#${esc(t)}`).join(' ') || '无'}</dd>
          <dt>环境</dt><dd>${stacks.map((s) => `<a href="#/stack/${s.id}">${esc(s.name)}</a>`).join('、') || '无'}</dd>
          <dt>更新</dt><dd>${relDate(e.updatedAt)}</dd></dl>
        <div class="actions"><a class="btn btn-sm" href="#/edit/${esc(e.id)}">编辑</a>
          <button class="btn btn-sm" type="button" data-act="pin" data-id="${esc(e.id)}">${e.pinned ? '取消置顶' : '置顶'}</button>
          <button class="btn btn-sm" type="button" data-act="copy-md" data-id="${esc(e.id)}">复制为 Markdown</button></div>
        ${secs.length > 1 ? `<div class="toc-wrap"><h3>本页目录</h3><nav class="doc-toc">${secs.map(([id, t]) => `<button type="button" data-act="toc" data-target="${id}">${t}</button>`).join('')}</nav></div>` : ''}
      </aside></div>`;
  }

  function renderDocs(r) {
    if (r.name === 'list' && r.id) return docPage(findEntry(r.id));
    if (narrow.matches && r.name === 'list') return `<div class="tree-page">${docsTree(r)}</div>`;
    if (r.name !== 'list') {
      const pinned = db.entries.filter((e) => e.pinned).sort(byUpdated);
      const recent = db.entries.filter((e) => !e.pinned).sort(byUpdated).slice(0, 8);
      const inbox = db.entries.filter((e) => e.status === 'inbox').sort(byUpdated);
      return `<div class="doc-layout"><article class="doc"><div class="crumbs">首页</div><h1>我的 AI 工作台</h1>
        <p class="lede">共 ${db.entries.length} 条，${db.stacks.length} 个环境。左侧目录按类型列出全部条目。</p>
        ${captureForm()}
        ${inbox.length ? `<h2>待整理</h2>${docIndexList(inbox, 'inbox')}` : ''}
        <h2>置顶</h2>${docIndexList(pinned, 'pinned')}
        <h2>最近更新</h2>${docIndexList(recent, 'all')}</article>
        <aside class="doc-props" aria-label="各类型数量"><h3>各类型</h3><dl class="kv">${TYPES.map((t) =>
          `<dt><a href="#/list/${t.id}">${esc(t.name)}</a></dt><dd>${db.entries.filter((e) => e.type === t.id).length}</dd>`).join('')}</dl></aside></div>`;
    }
    const list = applyFilters(scopeEntries(r.scope), r);
    return `<div class="doc-layout"><article class="doc"><div class="crumbs">目录</div><h1>${esc(scopeName(r.scope))}</h1><p class="lede">${list.length} 条</p>
      ${groupByType(list, r.scope).map((g) => `<h2>${esc(g.t.name)}</h2>${docIndexList(g.items, r.scope)}`).join('') || '<p class="lede">没有符合条件的条目。</p>'}</article>
      <aside class="doc-props" aria-label="筛选"><h3>筛选</h3><div class="filters" style="position:static;padding:0;border:0;background:none;backdrop-filter:none">${filterSelects(r)}</div></aside></div>`;
  }

  // 工作台与列表路由按当前结构渲染；其他页面（编辑、环境、设置）各结构共用
  function browse(r) {
    const lay = layoutOf();
    const route = r.name === 'list' ? r : { name: 'home' };
    if (lay === 'gallery') return renderGallery(route);
    if (lay === 'launcher') return renderLauncher(route);
    if (lay === 'board') return renderBoard(route);
    if (lay === 'docs') return renderDocs(route);
    return r.name === 'list' ? renderList(r) : renderHome();
  }
  function applyLayout(id) {
    const l = LAYOUTS.find((x) => x.id === id);
    if (!l) return;
    withTransition(() => {
      document.documentElement.dataset.layout = id;
      localStorage.setItem('aikit.layout', id);
      renderDock();
      render();
    });
    toast(`已切换为结构“${l.name}”`);
  }

  // ---------- 导出为 Markdown（与正式版 Git 备份的文件格式一致：<type>/<slug>.md） ----------
  const FENCE = '`'.repeat(3);
  const NL = String.fromCharCode(10);
  function toMarkdown(e) {
    const y = (v) => JSON.stringify(v);
    const out = ['---', `id: ${y(e.id)}`, `type: ${e.type}`, `title: ${y(e.title)}`, `status: ${e.status}`,
      `platforms: ${y(e.platforms || [])}`, `tags: ${y(e.tags || [])}`, `stacks: ${y(e.stacks || [])}`,
      `pinned: ${!!e.pinned}`, `rating: ${e.rating || 0}`, `created: ${e.createdAt}`, `updated: ${e.updatedAt}`];
    const fields = Object.entries(e.fields || {});
    if (fields.length) out.push('fields:', ...fields.map(([k, v]) => `  ${y(k)}: ${y(v)}`));
    out.push('---', '');
    if (e.summary) out.push(e.summary, '');
    for (const s of e.snippets || []) out.push(`## ${s.label || '片段'}${s.install ? '（安装）' : ''}`, '', FENCE + (s.lang || ''), s.code, FENCE, '');
    if (e.body) out.push(e.body, '');
    if ((e.links || []).length) out.push('## 链接', '', ...e.links.map((l) => `- [${l.label || l.url}](${l.url})`), '');
    return out.join(NL);
  }

  // ---------- 环境：按机器/场景列出“物料清单” ----------
  const stackItems = (id) => db.entries.filter((e) => (e.stacks || []).includes(id))
    .sort((a, b) => TYPES.findIndex((t) => t.id === a.type) - TYPES.findIndex((t) => t.id === b.type) || a.title.localeCompare(b.title, 'zh'));
  function renderStacks() {
    const rows = db.stacks.map((s) => `<a class="row" href="#/stack/${s.id}"><span class="row-title">${esc(s.name)}</span>
      <span class="row-summary">${esc(stackMeta(s))}，${stackItems(s.id).length} 个条目${s.desc ? `。${esc(s.desc)}` : ''}</span></a>`).join('');
    return `<div class="page"><div class="board" style="margin-top:0;grid-template-columns:minmax(0,1fr)"><div>
      <div class="stack-head"><h2 style="margin:0">我的环境 <span class="count">${db.stacks.length}</span></h2>
        <a class="btn" href="#/stack-new">${icon('plus')}新建环境</a></div>
      <div class="panel">${rows || '<div class="panel-empty">还没有环境。新建一个，比如“公司电脑”或“写作场景”。</div>'}</div>
      <h2 style="margin-top:28px">其他</h2>
      <div class="panel"><a class="row" href="#/settings"><span class="row-title">数据与设置</span><span class="row-summary">风格、深浅色、导出、导入、恢复示例数据</span></a></div>
    </div></div></div>`;
  }
  function renderStack(r) {
    const s = findStack(r.id);
    if (!s) return '<div class="page"><p>找不到这个环境，可能已被删除。<a href="#/stacks">查看全部环境</a></p></div>';
    const items = stackItems(s.id);
    const rows = items.map((e) => `<tr data-type="${esc(e.type)}"><th scope="row"><a href="#/list/all/${esc(e.id)}">${esc(e.title)}</a></th>
      <td>${typeBadge(e.type)}</td><td>${statusTag(e.status)}</td><td class="col-path">${pathOf(e)}</td>
      <td class="act"><button class="btn btn-sm" type="button" data-act="stack-remove" data-stack="${esc(s.id)}" data-id="${esc(e.id)}">移出</button></td></tr>`).join('');
    return `<div class="page">
      <div class="stack-head">
        <div><h1>${esc(s.name)}</h1>${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
          <div class="stack-meta"><span class="chip">${esc(KIND[s.kind] ? KIND[s.kind].name : '未分类')}</span><span class="chip">${esc(OS[s.os] ? OS[s.os].name : '不限系统')}</span><span class="chip">${items.length} 个条目</span></div></div>
        <div class="stack-actions">
          <a class="btn" href="#/stack-edit/${esc(s.id)}">编辑环境</a>
          <button class="btn" type="button" data-act="stack-add-open" data-stack="${esc(s.id)}">${icon('plus')}添加条目</button>
          <button class="btn btn-primary" type="button" data-act="checklist" data-id="${esc(s.id)}">生成安装清单</button>
        </div>
      </div>
      <div class="picker" id="picker" hidden></div>
      ${items.length ? `<table class="bom"><thead><tr><th scope="col">名称</th><th scope="col">类型</th><th scope="col">状态</th><th scope="col" class="col-path">路径</th><th scope="col" class="act"><span class="sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="panel"><div class="panel-empty">这个环境还没有条目。点“添加条目”从档案里挑选，或在编辑条目时勾选“所属环境”。</div></div>`}
      <div class="checklist" id="checklist" hidden>
        <div class="stack-head"><div><h2 style="margin:0;font-size:16px">安装清单</h2><p>新机器照着勾，命令来自各条目里标记为“安装命令”的片段。</p></div>
          <button class="btn btn-sm" type="button" data-act="copy-checklist">${icon('copy')}复制</button></div>
        <label class="sr-only" for="checklist-text">安装清单</label><textarea id="checklist-text" readonly></textarea>
      </div>
    </div>`;
  }
  const stackMeta = (s) => `${KIND[s.kind] ? KIND[s.kind].name : '未分类'}，${OS[s.os] ? OS[s.os].name : '不限系统'}`;
  function renderStackEditor(r) {
    const old = r.name === 'stack-edit' ? findStack(r.id) : null;
    if (r.name === 'stack-edit' && !old) return '<div class="page"><p>找不到这个环境，可能已被删除。</p></div>';
    const s = old || { name: '', desc: '', kind: 'pc', os: 'windows' };
    const opt = (list, v) => list.map((o) => `<option value="${o.id}"${o.id === v ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
    return `<div class="page"><form class="form" id="stack-editor" data-id="${old ? esc(old.id) : ''}" autocomplete="off">
      <label class="field"><span>名称</span><input name="name" required value="${esc(s.name)}" placeholder="如：公司 MacBook、写作场景"></label>
      <div class="form-row">
        <label class="field"><span>类型</span><select name="kind">${opt(STACK_KINDS, s.kind)}</select></label>
        <label class="field"><span>系统</span><select name="os">${opt(STACK_OS, s.os)}</select></label>
      </div>
      <label class="field"><span>说明</span><input name="desc" value="${esc(s.desc)}" placeholder="用途、硬件或注意事项"></label>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <a class="btn" href="${old ? `#/stack/${esc(old.id)}` : '#/stacks'}">取消</a>
        ${old ? `<button class="btn btn-danger" type="button" data-act="stack-delete" data-stack="${esc(old.id)}">删除环境</button>` : ''}
      </div>
      ${old ? `<p class="field"><span class="hint">删除环境不会删除条目，只会解除它和 ${stackItems(old.id).length} 个条目的关联。</span></p>` : ''}
    </form></div>`;
  }
  function saveStack(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name')).trim();
    if (!name) { toast('请填写环境名称'); return; }
    const old = form.dataset.id ? findStack(form.dataset.id) : null;
    let id = old ? old.id : slugify(name);
    for (let n = 2; !old && findStack(id); n++) id = `${slugify(name)}-${n}`;
    const s = Object.assign(old || { id }, { name, kind: fd.get('kind'), os: fd.get('os'), desc: String(fd.get('desc')).trim() });
    if (!old) db.stacks.push(s);
    save();
    toast(old ? '已保存环境' : '已新建环境');
    go(`#/stack/${encodeURIComponent(s.id)}`);
  }
  function deleteStack(id) {
    const s = findStack(id);
    if (!s || !confirm(`删除环境“${s.name}”？条目本身不会被删除。`)) return;
    db.stacks = db.stacks.filter((x) => x !== s);
    for (const e of db.entries) e.stacks = (e.stacks || []).filter((x) => x !== id);
    save(); toast('已删除环境'); go('#/stacks');
  }
  function renderPicker(stackId) {
    const pool = db.entries.filter((e) => !(e.stacks || []).includes(stackId) && e.status !== 'archived');
    const list = pool.map((e) => `<li data-type="${esc(e.type)}"><label><input type="checkbox" value="${esc(e.id)}">${typeBadge(e.type)}<span>${esc(e.title)}</span>${pathOf(e)}</label></li>`).join('');
    return `<h2>添加条目到这个环境</h2>
      <label class="sr-only" for="picker-q">按名称筛选</label><input type="search" id="picker-q" placeholder="按名称或类型筛选">
      <ul id="picker-list">${list || '<li class="panel-empty">档案里的条目都已经在这个环境里了。</li>'}</ul>
      <div class="actions"><button class="btn btn-primary" type="button" data-act="stack-add-confirm" data-stack="${esc(stackId)}">加入所选</button>
        <button class="btn" type="button" data-act="stack-add-cancel">取消</button></div>`;
  }

  function checklist(s) {
    const items = stackItems(s.id);
    const out = [`# ${s.name} 安装清单`, ''];
    for (const t of TYPES) {
      const group = items.filter((e) => e.type === t.id);
      if (!group.length) continue;
      out.push(`## ${t.name}`, '');
      for (const e of group) {
        out.push(`- [ ] ${e.title}`);
        for (const sn of (e.snippets || []).filter((x) => x.install)) out.push('', FENCE + (sn.lang || ''), sn.code, FENCE);
        out.push('');
      }
    }
    return out.join(NL);
  }

  // ---------- 数据与设置 ----------
  function renderSettings() {
    const cur = document.documentElement.dataset.style;
    const cards = STYLES.map((s) => `<button type="button" data-act="style" data-style="${s.id}" aria-pressed="${s.id === cur}"><strong>${esc(s.name)}</strong><small>${esc(s.note)}</small></button>`).join('');
    const layoutCards = LAYOUTS.map((l) => `<button type="button" data-act="layout" data-layout="${l.id}" aria-pressed="${l.id === layoutOf()}"><strong>${esc(l.name)}</strong><small>${esc(l.note)}</small></button>`).join('');
    return `<div class="page settings">
      <section style="margin-top:0"><h2>界面结构</h2>
        <p>结构决定页面怎么组织，可以和任意配色组合，随时切换；设置保存在这台设备上。</p>
        <div class="style-cards">${layoutCards}</div></section>
      <section><h2>配色方案</h2>
        <p>配色只改颜色、圆角和阴影。</p>
        <div class="style-cards">${cards}</div>
        <div class="actions" style="margin-top:12px"><button class="btn" type="button" data-act="theme">切换深浅色</button>
          <button class="btn" type="button" data-act="dock-show">显示切换条</button></div></section>
      <section><h2>数据保存在哪</h2>
        <p>这是原型，数据只保存在当前浏览器（localStorage），换浏览器或清缓存会丢。正式版会存到服务端，并每天备份到 GitHub 和坚果云。</p></section>
      <section><h2>导出与导入</h2>
        <p>导出的 JSON 可以在另一台设备上导入。导入会覆盖当前全部数据。</p>
        <div class="actions">
          <button class="btn" type="button" data-act="export-json">导出 JSON</button>
          <button class="btn" type="button" data-act="export-md">导出全部为 Markdown</button>
          <label class="btn">导入 JSON<input type="file" accept="application/json,.json" data-act="import-json" hidden></label>
        </div></section>
      <section><h2>示例数据</h2>
        <p>把数据恢复成初始示例（${window.AIKIT_SEED.entries.length} 条）。当前数据会被覆盖，建议先导出。</p>
        <div class="actions"><button class="btn btn-danger" type="button" data-act="reset">恢复示例数据</button></div></section>
    </div>`;
  }

  // ---------- 编辑 ----------
  function snipEditor(s) {
    const x = s || { label: '', lang: 'bash', code: '', install: false };
    return `<div class="snip-edit">
      <div class="form-row">
        <input data-k="label" value="${esc(x.label)}" placeholder="片段标题，如：安装（Claude Code）" aria-label="片段标题">
        <input data-k="lang" value="${esc(x.lang)}" placeholder="语言" aria-label="语言">
        <label class="checks"><input type="checkbox" data-k="install"${x.install ? ' checked' : ''}>安装命令</label>
        <button class="btn btn-sm btn-danger" type="button" data-act="del-snip">移除</button>
      </div>
      <textarea data-k="code" class="code" placeholder="命令、配置或提示词。提示词里用 {{变量}} 标出每次要替换的部分" aria-label="片段内容">${esc(x.code)}</textarea>
    </div>`;
  }
  const fieldHint = (type) => TYPE[type].fields.map((f) => `${f}: `).join(NL);
  function renderEditor(r) {
    const old = r.name === 'edit' ? findEntry(r.id) : null;
    if (r.name === 'edit' && !old) return '<div class="page"><p>找不到这个条目，可能已被删除。</p></div>';
    const e = old || { type: TYPE[r.type] ? r.type : 'tool', title: ui.draftTitle || '', slug: '', summary: '', status: 'using', rating: 0,
      platforms: [], tags: [], stacks: [], fields: {}, snippets: [], links: [], body: '', pinned: false };
    ui.draftTitle = '';
    const opt = (list, v) => list.map((o) => `<option value="${o.id}"${o.id === v ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
    const checks = (name, list, on) => list.map((o) => `<label><input type="checkbox" name="${name}" value="${esc(o.id)}"${on.includes(o.id) ? ' checked' : ''}>${esc(o.name)}</label>`).join('');
    const ratings = [0, 1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: n ? '★'.repeat(n) : '未评分' }));
    return `<div class="page"><form class="form" id="editor" data-id="${old ? esc(old.id) : ''}" autocomplete="off">
      <div class="form-row">
        <label class="field"><span>类型</span><select name="type">${opt(TYPES, e.type)}</select></label>
        <label class="field"><span>状态</span><select name="status">${opt(STATUSES, e.status)}</select></label>
        <label class="field"><span>评分</span><select name="rating">${opt(ratings, String(e.rating || 0))}</select></label>
      </div>
      <div class="form-row">
        <label class="field"><span>名称</span><input name="title" required value="${esc(e.title)}"></label>
        <label class="field"><span>标识</span><input name="slug" value="${esc(e.slug)}" placeholder="留空则按名称生成"><span class="hint">导出时的文件名：类型/标识.md</span></label>
      </div>
      <label class="field"><span>一句话说明</span><input name="summary" value="${esc(e.summary)}" placeholder="它解决什么问题"></label>
      <fieldset class="field"><legend>适用平台</legend><div class="checks">${checks('platforms', PLATFORMS, e.platforms || [])}</div></fieldset>
      <label class="field"><span>标签</span><input name="tags" value="${esc((e.tags || []).join(', '))}" placeholder="用逗号分隔"></label>
      <fieldset class="field"><legend>所属环境</legend><div class="checks">${checks('stacks', db.stacks.map((s) => ({ id: s.id, name: s.name })), e.stacks || [])}</div></fieldset>
      <label class="field"><span>要点</span><textarea name="fields" class="code" placeholder="${esc(fieldHint(e.type))}">${esc(Object.entries(e.fields || {}).map(([k, v]) => `${k}: ${v}`).join(NL))}</textarea>
        <span class="hint">每行一项，格式“名称: 内容”。密钥不要写在这里，只写环境变量名。</span></label>
      <div class="field"><span>片段</span><div id="snips" style="display:grid;gap:10px">${(e.snippets || []).map(snipEditor).join('')}</div>
        <div><button class="btn btn-sm" type="button" data-act="add-snip">${icon('plus')}添加片段</button></div></div>
      <label class="field"><span>链接</span><textarea name="links" class="code" placeholder="官方文档 | https://">${esc((e.links || []).map((l) => `${l.label} | ${l.url}`).join(NL))}</textarea>
        <span class="hint">每行一个，格式“标题 | 地址”</span></label>
      <label class="field"><span>笔记（支持 Markdown）</span><textarea name="body" rows="8">${esc(e.body)}</textarea></label>
      <div class="checks"><label><input type="checkbox" name="pinned"${e.pinned ? ' checked' : ''}>置顶到工作台</label></div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <a class="btn" href="${old ? `#/list/all/${esc(old.id)}` : '#/'}">取消</a>
        ${old ? '<button class="btn btn-danger" type="button" data-act="delete">删除</button>' : ''}
      </div>
    </form></div>`;
  }

  function uniqueSlug(type, slug, selfId) {
    let s = slug;
    for (let n = 2; db.entries.some((e) => e.type === type && e.slug === s && e.id !== selfId); n++) s = `${slug}-${n}`;
    return s;
  }
  const uniqueId = (type, slug) => {
    let id = `${type}-${slug}`;
    for (let n = 2; findEntry(id); n++) id = `${type}-${slug}-${n}`;
    return id;
  };
  function saveEditor(form) {
    const fd = new FormData(form);
    const old = form.dataset.id ? findEntry(form.dataset.id) : null;
    const title = String(fd.get('title')).trim();
    if (!title) { toast('请填写名称'); return; }
    const type = fd.get('type');
    const slug = uniqueSlug(type, slugify(String(fd.get('slug')).trim() || title), old && old.id);
    const fields = {};
    for (const line of String(fd.get('fields')).split(NL)) {
      const i = line.search(/[:：]/);
      if (i > 0 && line.slice(i + 1).trim()) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const links = String(fd.get('links')).split(NL).map((line) => {
      const [a, b] = line.split('|').map((x) => x.trim());
      if (b) return { label: a || b, url: b };
      return /^https?:/.test(a || '') ? { label: a, url: a } : null;
    }).filter(Boolean);
    const snippets = $$('.snip-edit', form).map((box) => ({
      label: $('[data-k=label]', box).value.trim(), lang: $('[data-k=lang]', box).value.trim() || 'text',
      code: $('[data-k=code]', box).value, install: $('[data-k=install]', box).checked
    })).filter((s) => s.code.trim());
    const entry = Object.assign(old || { id: uniqueId(type, slug), createdAt: today() }, {
      type, title, slug, summary: String(fd.get('summary')).trim(), status: fd.get('status'), rating: Number(fd.get('rating')) || 0,
      platforms: fd.getAll('platforms'), tags: String(fd.get('tags')).split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      stacks: fd.getAll('stacks'), fields, snippets, links, body: String(fd.get('body')), pinned: fd.get('pinned') === 'on', updatedAt: today()
    });
    if (!old) db.entries.push(entry);
    save();
    toast(old ? '已保存修改' : '已新建条目');
    go(`#/list/all/${entry.id}`);
  }

  // ---------- 快速记录：先存入“待整理”，之后再补全 ----------
  function capture(type, text) {
    const t = text.trim();
    if (!t) return;
    const isUrl = /^https?:\/\/\S+$/.test(t);
    let title = t.split(NL)[0].slice(0, 60);
    if (isUrl) {
      try { const u = new URL(t); title = (u.hostname + u.pathname).replace(/\/$/, ''); } catch (err) { /* 保留原文 */ }
    }
    const slug = uniqueSlug(type, slugify(isUrl ? title.split('/').pop() || title : title));
    const long = !isUrl && t.length > 60;
    db.entries.push({
      id: uniqueId(type, slug), type, slug, title, summary: '', status: 'inbox', pinned: false, rating: 0,
      platforms: [], tags: [], stacks: [], fields: {},
      snippets: long && type === 'prompt' ? [{ label: '提示词', lang: 'text', code: t }] : [],
      links: isUrl ? [{ label: '来源', url: t }] : [],
      body: long && type !== 'prompt' ? t : '', createdAt: today(), updatedAt: today()
    });
    save();
  }

  // ---------- 小工具：提示、复制、下载、主题 ----------
  let toastTimer = 0;
  function toast(msg) {
    $('#toast-root').innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast-root').innerHTML = ''; }, 1800);
  }
  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(msg || '已复制');
  }
  function download(name, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const exportJson = () => download(`ai-kit-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
  function toggleTheme() {
    withTransition(() => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      localStorage.setItem('aikit.theme', t);
    });
  }

  // ---------- 风格切换（原型对比用） ----------
  const withTransition = (run) => {
    if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(run); else run();
  };
  function applyStyle(id) {
    const s = STYLES.find((x) => x.id === id);
    if (!s) return;
    withTransition(() => {
      document.documentElement.dataset.style = id;
      localStorage.setItem('aikit.style', id);
      renderDock();
      if (parseRoute().name === 'settings') render();
    });
    toast(`已切换为“${s.name}”`);
  }
  function renderDock() {
    const root = $('#dock-root');
    if (localStorage.getItem('aikit.dock') === 'hidden' || new URLSearchParams(location.search).get('dock') === '0') { root.innerHTML = ''; return; }
    const opt = (list, cur) => list.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    root.innerHTML = `<div class="style-dock" role="group" aria-label="界面方案">
      <label class="label">结构 <select data-act="layout-select" aria-label="界面结构">${opt(LAYOUTS, layoutOf())}</select></label>
      <label class="label">配色 <select data-act="style-select" aria-label="配色方案">${opt(STYLES, document.documentElement.dataset.style)}</select></label>
      <button type="button" data-act="theme" title="切换深浅色" aria-label="切换深浅色">${icon('moon')}</button>
      <button type="button" class="close" data-act="dock-close" aria-label="隐藏切换条">×</button></div>`;
  }

  // ---------- 手机快速记录面板 ----------
  let sheetLastFocus = null;
  function openSheet() {
    sheetLastFocus = document.activeElement;
    const picks = TYPES.map((t, i) => `<label data-type="${t.id}"><input type="radio" name="type" value="${t.id}"${i === 0 ? ' checked' : ''}><span>${esc(t.name)}</span></label>`).join('');
    $('#sheet-root').innerHTML = `<div class="sheet-backdrop" data-act="close-sheet">
      <form class="sheet" id="sheet-form" role="dialog" aria-modal="true" aria-labelledby="sheet-title" autocomplete="off">
        <div class="grab" aria-hidden="true"></div>
        <h2 id="sheet-title">记一笔</h2>
        <fieldset class="type-picks"><legend class="sr-only">类型</legend>${picks}</fieldset>
        <label class="sr-only" for="sheet-text">内容</label>
        <textarea id="sheet-text" name="text" placeholder="名字、链接或一段提示词。先存进待整理，有空再补全。" required></textarea>
        <div class="sheet-actions"><button class="btn" type="button" data-act="sheet-full">写完整条目</button><button class="btn btn-primary" type="submit">存入待整理</button></div>
      </form></div>`;
    setTimeout(() => { if ($('#sheet-text')) $('#sheet-text').focus(); }, 60);
  }
  function closeSheet() {
    $('#sheet-root').innerHTML = '';
    if (sheetLastFocus && sheetLastFocus.focus) sheetLastFocus.focus();
  }

  // ---------- 命令面板（Ctrl K） ----------
  const pal = { open: false, items: [], index: 0, lastFocus: null };
  const ACTIONS = [
    { label: '新建条目', run: () => go('#/new') },
    { label: '打开工作台', run: () => go('#/') },
    { label: '查看待整理', run: () => go('#/list/inbox') },
    { label: '切换深浅色', run: toggleTheme },
    { label: '导出 JSON', run: exportJson },
    // 外观切换：只在输入关键词时出现，如输入“看板”“夜航”
    ...LAYOUTS.map((l) => ({ label: `切换结构：${l.name}`, searchOnly: true, run: () => applyLayout(l.id) })),
    ...STYLES.map((x) => ({ label: `切换配色：${x.name}`, searchOnly: true, run: () => applyStyle(x.id) }))
  ];
  const firstSnippet = (e) => ((e.snippets || [])[0] || {}).code || '';
  function openPalette() {
    if (pal.open) return;
    pal.open = true;
    pal.index = 0;
    pal.lastFocus = document.activeElement;
    $('#palette-root').innerHTML = `<div class="palette-backdrop" data-act="close-palette">
      <div class="palette" role="dialog" aria-modal="true" aria-label="搜索">
        <input id="pal-input" role="combobox" aria-expanded="true" aria-controls="pal-list" placeholder="搜索名称、标签、命令或提示词内容">
        <ul id="pal-list" role="listbox" aria-label="搜索结果"></ul>
        <div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Ctrl Enter</kbd> 复制第一个片段</span><span><kbd>Esc</kbd> 关闭</span></div>
      </div></div>`;
    const input = $('#pal-input');
    input.addEventListener('input', () => { pal.index = 0; paintPalette(); });
    input.addEventListener('keydown', paletteKey);
    input.focus();
    paintPalette();
  }
  function closePalette() {
    pal.open = false;
    $('#palette-root').innerHTML = '';
    if (pal.lastFocus && pal.lastFocus.focus) pal.lastFocus.focus();
  }
  function paintPalette() {
    const q = $('#pal-input').value.trim();
    const terms = termsOf(q);
    const entries = q ? search(q).slice(0, 12) : db.entries.filter((e) => e.pinned).sort(byUpdated);
    const acts = ACTIONS.filter((a) => (terms.length ? terms.every((t) => a.label.toLowerCase().includes(t)) : !a.searchOnly));
    pal.items = [...entries.map((e) => ({ e })), ...acts.map((a) => ({ a }))];
    if (pal.index >= pal.items.length) pal.index = 0;
    let n = 0;
    const opt = (inner, type) => { const i = n++; return `<li id="pal-${i}" role="option" data-i="${i}" aria-selected="${i === pal.index}"${type ? ` data-type="${esc(type)}"` : ''}>${inner}</li>`; };
    let html = '';
    if (entries.length) {
      html += `<li class="group" role="presentation">${q ? '条目' : '置顶'}</li>` + entries.map((e) =>
        opt(`${typeBadge(e.type)}<span>${highlight(e.title, terms)}</span>${statusTag(e.status)}<span class="sub">${highlight(e.summary || firstSnippet(e), terms)}</span>`, e.type)).join('');
    }
    if (acts.length) html += '<li class="group" role="presentation">操作</li>' + acts.map((a) => opt(`<span class="chip">操作</span><span>${esc(a.label)}</span><span></span>`)).join('');
    if (!n) html = `<li class="group" role="presentation">没有找到“${esc(q)}”。按 Enter 用它作为名称新建条目。</li>`;
    $('#pal-list').innerHTML = html;
    $('#pal-input').setAttribute('aria-activedescendant', n ? `pal-${pal.index}` : '');
    const cur = $(`#pal-${pal.index}`);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function paletteKey(ev) {
    const n = pal.items.length;
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && n) {
      ev.preventDefault();
      pal.index = (pal.index + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
      paintPalette();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      runPalette(pal.index, ev.ctrlKey || ev.metaKey);
    } else if (ev.key === 'Escape' || ev.key === 'Tab') {
      ev.preventDefault();
      if (ev.key === 'Escape') closePalette();
    }
  }
  function runPalette(i, copyFirst) {
    const it = pal.items[i];
    const q = $('#pal-input').value.trim();
    if (!it) {
      if (q) { ui.draftTitle = q; closePalette(); go('#/new'); }
      return;
    }
    if (it.a) { closePalette(); it.a.run(); return; }
    if (copyFirst) {
      const s = (it.e.snippets || [])[0];
      if (!s) { toast('这个条目没有片段可复制'); return; }
      closePalette();
      copy(s.code, `已复制：${it.e.title}`);
      return;
    }
    closePalette();
    go(`#/list/all/${it.e.id}`);
  }

  // ---------- 渲染入口 ----------
  let last = null;
  function render() {
    const r = parseRoute();
    // 切换到另一个列表范围时清空筛选，避免旧筛选把新列表里的条目藏起来
    if (r.name === 'list' && ui.scope !== r.scope) { ui.scope = r.scope; ui.status = ''; ui.platform = ''; ui.tag = ''; }
    const keepScroll = last && last.name === 'list' && r.name === 'list' && last.scope === r.scope && $('.list') ? $('.list').scrollTop : 0;
    renderNav(r);
    let html;
    let title;
    switch (r.name) {
      case 'list': html = browse(r); title = scopeName(r.scope); break;
      case 'new': case 'edit': html = renderEditor(r); title = r.name === 'new' ? '新建条目' : '编辑条目'; break;
      case 'stacks': html = renderStacks(); title = '我的环境'; break;
      case 'stack': html = renderStack(r); title = (findStack(r.id) || {}).name || '环境'; break;
      case 'stack-new': case 'stack-edit': html = renderStackEditor(r); title = r.name === 'stack-new' ? '新建环境' : '编辑环境'; break;
      case 'settings': html = renderSettings(); title = '数据与设置'; break;
      default: html = browse(r); title = '工作台';
    }
    const view = $('#view');
    view.innerHTML = html;
    if (layoutOf() === 'launcher' && r.name !== 'list' && !narrow.matches && $('#l-q')) $('#l-q').focus({ preventScroll: true });
    if (keepScroll && $('.list')) $('.list').scrollTop = keepScroll;
    if (!last || last.name !== r.name || last.id !== r.id) view.scrollTop = 0;
    $('#view-title').textContent = title;
    document.title = `${title} - AI 工作台`;
    const deep = ['edit', 'new', 'stack-new', 'stack-edit'].includes(r.name) || (narrow.matches && ((r.name === 'list' && r.id) || r.name === 'stack' || r.name === 'settings'));
    $('#back-btn').hidden = !deep;
    last = r;
  }
  // 路由变化：桌面端在同一列表里切换条目时只更新详情栏，列表不重绘；其余情况整页重绘。
  function navigate() {
    const r = parseRoute();
    const partial = layoutOf() === 'panes' && last && !narrow.matches && last.name === 'list' && r.name === 'list' && last.scope === r.scope && $('.detail-pane');
    const run = partial ? () => updateDetail(r) : render;
    if (!last || !document.startViewTransition || reduceMotion.matches) { run(); return; }
    const dir = Math.sign(depthOf(r) - depthOf(last));
    document.documentElement.dataset.nav = dir > 0 ? 'forward' : dir < 0 ? 'back' : 'none';
    document.startViewTransition(run).finished.finally(() => { delete document.documentElement.dataset.nav; });
  }
  const emptyDetail = (scope) => `<div class="empty-pane"><p>从左侧选一个条目查看详情。</p><p><a class="btn" href="${TYPE[scope] ? `#/new/${scope}` : '#/new'}">新建条目</a></p></div>`;
  function updateDetail(r) {
    $('.detail-pane').innerHTML = r.id ? renderDetail(findEntry(r.id)) : emptyDetail(r.scope);
    $('.detail-pane').scrollTop = 0;
    $('.split').classList.toggle('has-detail', !!r.id);
    const href = `#/list/${encodeURIComponent(r.scope)}/${r.id}`;
    $$('.list .row').forEach((a) => { if (a.getAttribute('href') === href) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    last = r;
  }

  // ---------- 事件（全部委托在 document 上，视图重绘后无需重新绑定） ----------
  document.addEventListener('click', (ev) => {
    const opt = ev.target.closest('#pal-list [role=option]');
    if (opt) { runPalette(Number(opt.dataset.i), false); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const e = el.dataset.id ? findEntry(el.dataset.id) : null;
    if (act === 'close-palette') { if (ev.target === el) closePalette(); return; }
    if (act === 'pin' && e) {
      e.pinned = !e.pinned; save(); render(); toast(e.pinned ? '已置顶' : '已取消置顶');
    } else if (act === 'copy-md' && e) {
      copy(toMarkdown(e), '已复制为 Markdown');
    } else if (act === 'copy-snip' && e) {
      const s = e.snippets[Number(el.dataset.i)];
      let code = s.code;
      for (const ta of $$(`textarea[data-snip="${el.dataset.i}"]`, el.closest('.snippet'))) {
        if (ta.value) code = code.split(`{{${ta.dataset.var}}}`).join(ta.value);
      }
      copy(code, `已复制：${s.label || e.title}`);
    } else if (act === 'checklist') {
      const box = $('#checklist');
      $('#checklist-text').value = checklist(findStack(el.dataset.id));
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'copy-checklist') {
      copy($('#checklist-text').value, '已复制安装清单');
    } else if (act === 'export-json') {
      exportJson();
    } else if (act === 'export-md') {
      download(`ai-kit-${today()}.md`, db.entries.map((x) => `<!-- ${x.type}/${x.slug}.md -->${NL}${toMarkdown(x)}`).join(NL + NL), 'text/markdown');
    } else if (act === 'reset') {
      if (!confirm('恢复示例数据会覆盖当前全部条目，确定继续？')) return;
      db = clone(window.AIKIT_SEED); save(); render(); toast('已恢复示例数据');
    } else if (act === 'theme') {
      toggleTheme();
    } else if (act === 'add-snip') {
      $('#snips').insertAdjacentHTML('beforeend', snipEditor());
      $('#snips .snip-edit:last-child [data-k=label]').focus();
    } else if (act === 'del-snip') {
      el.closest('.snip-edit').remove();
    } else if (act === 'delete') {
      const target = findEntry($('#editor').dataset.id);
      if (!target || !confirm(`删除“${target.title}”？删除后不能恢复。`)) return;
      db.entries = db.entries.filter((x) => x !== target); save(); toast('已删除'); go('#/list/all');
    }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.filter) { ui[el.dataset.filter] = el.value; render(); return; }
    if (el.dataset.act === 'status') {
      const e = findEntry(el.dataset.id);
      e.status = el.value; e.updatedAt = today(); save(); render(); toast(`状态改为“${statusName(e.status)}”`);
    } else if (el.dataset.act === 'import-json' && el.files[0]) {
      el.files[0].text().then((text) => {
        const data = JSON.parse(text);
        if (!Array.isArray(data.entries) || !Array.isArray(data.stacks)) throw new Error('shape');
        if (!confirm(`导入 ${data.entries.length} 条数据并覆盖当前内容？`)) return;
        db = data; save(); render(); toast(`已导入 ${data.entries.length} 条`);
      }).catch(() => toast('导入失败：文件不是本工具导出的 JSON'));
      el.value = '';
    } else if (el.name === 'type' && el.form && el.form.id === 'editor') {
      el.form.elements.fields.placeholder = fieldHint(el.value);
    }
  });

  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'capture') {
      capture($('#cap-type').value, $('#cap-text').value);
      render(); toast('已存入待整理');
      $('#cap-text').focus();
    } else if (ev.target.id === 'editor') {
      saveEditor(ev.target);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      if (pal.open) closePalette(); else openPalette();
      return;
    }
    if (pal.open || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if (ev.key === '/') { ev.preventDefault(); openPalette(); } else if (ev.key === 'n') go('#/new');
  });

  // ---------- 环境、风格切换、手机记录面板的事件 ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'style') applyStyle(el.dataset.style);
    else if (act === 'dock-close') { localStorage.setItem('aikit.dock', 'hidden'); renderDock(); toast('可在“数据与设置”里重新打开切换条'); }
    else if (act === 'dock-show') { localStorage.removeItem('aikit.dock'); renderDock(); }
    else if (act === 'close-sheet') { if (ev.target === el) closeSheet(); }
    else if (act === 'sheet-full') {
      const f = $('#sheet-form');
      const type = f.elements.type.value;
      ui.draftTitle = f.elements.text.value.trim().split(NL)[0].slice(0, 60);
      closeSheet(); go(`#/new/${type}`);
    } else if (act === 'stack-add-open') {
      const box = $('#picker');
      box.innerHTML = renderPicker(el.dataset.stack);
      box.hidden = false;
      $('#picker-q').focus();
    } else if (act === 'stack-add-cancel') {
      $('#picker').hidden = true;
    } else if (act === 'stack-add-confirm') {
      const ids = $$('#picker-list input:checked').map((x) => x.value);
      if (!ids.length) { toast('先勾选要加入的条目'); return; }
      for (const id of ids) { const e = findEntry(id); if (e) e.stacks = [...(e.stacks || []), el.dataset.stack]; }
      save(); render(); toast(`已加入 ${ids.length} 个条目`);
    } else if (act === 'stack-remove') {
      const e = findEntry(el.dataset.id);
      e.stacks = (e.stacks || []).filter((x) => x !== el.dataset.stack);
      save(); render(); toast(`已从环境移出“${e.title}”`);
    } else if (act === 'stack-delete') {
      deleteStack(el.dataset.stack);
    }
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'picker-q') return;
    const terms = termsOf(ev.target.value);
    $$('#picker-list li[data-type]').forEach((li) => { li.hidden = !terms.every((t) => li.textContent.toLowerCase().includes(t)); });
  });
  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'sheet-form') {
      capture(ev.target.elements.type.value, ev.target.elements.text.value);
      closeSheet(); render(); toast('已存入待整理');
    } else if (ev.target.id === 'stack-editor') {
      saveStack(ev.target);
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('#sheet-root').firstChild) closeSheet();
  });

  // ---------- 各结构的事件 ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'layout') applyLayout(el.dataset.layout);
    else if (act === 'close-drawer') { if (ev.target === el || el.tagName === 'BUTTON') go(`#/list/${encodeURIComponent(el.dataset.scope)}`); }
    else if (act === 'board-group') { ui.boardGroup = el.dataset.group; render(); }
    else if (act === 'toc') {
      const t = document.getElementById(el.dataset.target);
      if (t) t.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    } else if (act === 'quick-copy') {
      const e = findEntry(el.dataset.id);
      const s = e && (e.snippets || [])[0];
      if (!s) return;
      if (varsOf(s.code).length) { go(`#/list/${encodeURIComponent(el.dataset.scope)}/${e.id}`); toast('这个片段有变量，填好后再复制'); }
      else copy(s.code, `已复制：${e.title}`);
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.act === 'layout-select') applyLayout(el.value);
    else if (el.dataset.act === 'style-select') applyStyle(el.value);
    else if (el.dataset.act === 'board-type') go(`#/list/${el.value}`);
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'l-q') return;
    lstate.q = ev.target.value;
    launcherPaint();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'l-q') {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); launcherMove(ev.key === 'ArrowDown' ? 1 : -1); }
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        const e = findEntry(lstate.sel);
        if (!e) { if (lstate.q.trim()) { ui.draftTitle = lstate.q.trim(); go('#/new'); } return; }
        if (ev.ctrlKey || ev.metaKey) { go(`#/edit/${e.id}`); return; }
        const s = (e.snippets || [])[0];
        if (s) copy(s.code, `已复制：${e.title}`); else toast('这个条目没有片段可复制');
      } else if (ev.key === 'Escape') { lstate.q = ''; ev.target.value = ''; launcherPaint(); }
      return;
    }
    const b = $('.drawer-backdrop');
    if (ev.key === 'Escape' && b && !narrow.matches) go(`#/list/${encodeURIComponent(b.dataset.scope)}`);
  });
  document.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'col-capture') return;
    const scope = parseRoute().scope;
    capture(TYPE[scope] ? scope : 'tool', $('#col-cap').value);
    render(); toast('已存入待整理');
    if ($('#col-cap')) $('#col-cap').focus();
  });
  // 看板：拖动卡片到另一列修改状态（仅“按状态”分组时可拖）
  document.addEventListener('dragstart', (ev) => {
    const c = ev.target.closest && ev.target.closest('.bcard[draggable="true"]');
    if (!c) return;
    ev.dataTransfer.setData('text/plain', c.dataset.id);
    ev.dataTransfer.effectAllowed = 'move';
    c.classList.add('dragging');
  });
  document.addEventListener('dragend', () => {
    $$('.bcard.dragging').forEach((x) => x.classList.remove('dragging'));
    $$('.board-col.drop').forEach((x) => x.classList.remove('drop'));
  });
  document.addEventListener('dragover', (ev) => {
    const col = ev.target.closest && ev.target.closest('.board-col');
    if (!col || !col.dataset.status) return;
    ev.preventDefault();
    $$('.board-col.drop').forEach((x) => { if (x !== col) x.classList.remove('drop'); });
    col.classList.add('drop');
  });
  document.addEventListener('drop', (ev) => {
    const col = ev.target.closest && ev.target.closest('.board-col');
    if (!col || !col.dataset.status) return;
    ev.preventDefault();
    col.classList.remove('drop');
    const e = findEntry(ev.dataTransfer.getData('text/plain'));
    if (!e || e.status === col.dataset.status) return;
    e.status = col.dataset.status; e.updatedAt = today(); save(); render();
    toast(`“${e.title}”改为${statusName(e.status)}`);
  });
  // 知识库：记住目录树里收起了哪些类型（toggle 事件不冒泡，所以在捕获阶段监听）
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.dataset || !d.dataset.tree) return;
    if (d.open) docsClosed.delete(d.dataset.tree); else docsClosed.add(d.dataset.tree);
  }, true);

  $('#search-btn').addEventListener('click', openPalette);
  $('#tab-search').addEventListener('click', openPalette);
  $('#tab-capture').addEventListener('click', openSheet);
  $('#theme-btn').addEventListener('click', toggleTheme);
  $('#back-btn').addEventListener('click', () => {
    const r = parseRoute();
    if (r.name === 'list') go(`#/list/${encodeURIComponent(r.scope)}`);
    else if (r.name === 'stack' || r.name === 'settings' || r.name === 'stack-new') go('#/stacks');
    else if (r.name === 'stack-edit') go(`#/stack/${encodeURIComponent(r.id)}`);
    else if (r.name === 'edit') go(`#/list/all/${r.id}`);
    else go('#/');
  });
  window.addEventListener('hashchange', navigate);
  narrow.addEventListener('change', render);
  renderDock();
  render();
})();
