// 示例数据：插件/市场名取自本机 ~/.claude/plugins，其余为演示用示例。
// 原型把数据存在浏览器 localStorage；首次打开或“恢复示例数据”时载入这里的内容。
window.AIKIT_SEED = {
  stacks: [
    { id: 'win-main', name: '主力 Windows 工作站', kind: 'pc', os: 'windows', desc: 'Windows 11，日常开发，Claude Code 与 Codex 并用' },
    { id: 'oracle', name: 'Oracle 2C2G 服务器', kind: 'server', os: 'linux', desc: 'Ubuntu，远程会话和实验用' },
    { id: 'mobile', name: '手机', kind: 'phone', os: 'any', desc: '随手查提示词、记录新发现' }
  ],
  entries: [
    {
      id: 'tool-claude-code', type: 'tool', slug: 'claude-code', title: 'Claude Code',
      summary: '终端里的编码代理，主力工具。插件、Skill、Hook、MCP 都挂在它上面。',
      status: 'using', pinned: true, rating: 5, platforms: ['claude-code'], tags: ['CLI', '编码代理'],
      stacks: ['win-main', 'oracle'],
      fields: { 类别: 'CLI 编码代理', 配置目录: '~/.claude/', 费用: '订阅或 API 计费' },
      snippets: [
        { label: '安装（Windows 原生）', lang: 'powershell', code: 'irm https://claude.ai/install.ps1 | iex', install: true },
        { label: '安装（npm）', lang: 'bash', code: 'npm install -g @anthropic-ai/claude-code', install: false },
        { label: '查看已装 MCP', lang: 'bash', code: 'claude mcp list' }
      ],
      links: [{ label: '官方文档', url: 'https://docs.claude.com/en/docs/claude-code/overview' }],
      body: '## 使用习惯\n\n- 全局规则写在 `~/.codex/AGENTS.md`，`~/.claude/CLAUDE.md` 只放一行 `@~/.codex/AGENTS.md` 引用，两个工具共用一份。\n- 大任务先进 plan 模式，确认后再动手。\n\n## 新机器检查\n\n1. 装好 Node 与 Git\n2. 安装 Claude Code\n3. 按本环境的“安装清单”装插件和 MCP',
      createdAt: '2026-03-02', updatedAt: '2026-09-26'
    },
    {
      id: 'tool-codex', type: 'tool', slug: 'codex-cli', title: 'Codex CLI',
      summary: 'OpenAI 的终端编码代理，和 Claude Code 共用 AGENTS.md。',
      status: 'using', pinned: false, rating: 4, platforms: ['codex'], tags: ['CLI', '编码代理'],
      stacks: ['win-main'],
      fields: { 类别: 'CLI 编码代理', 配置文件: '~/.codex/config.toml', 规则文件: '~/.codex/AGENTS.md' },
      snippets: [{ label: '安装', lang: 'bash', code: 'npm install -g @openai/codex', install: true }],
      links: [{ label: 'GitHub', url: 'https://github.com/openai/codex' }],
      body: '适合做第二意见：同一个问题让两个代理各给一版方案，再对比。',
      createdAt: '2026-04-11', updatedAt: '2026-09-10'
    },
    {
      id: 'config-agents-md', type: 'config', slug: 'agents-md', title: '全局 AGENTS.md（两个代理共用）',
      summary: '执行范围、验证、Git 推送安全、README、Planning、Windows 约定。',
      status: 'using', pinned: true, rating: 5, platforms: ['claude-code', 'codex'], tags: ['规则', '全局'],
      stacks: ['win-main'],
      fields: { 文件路径: '~/.codex/AGENTS.md', 引用方式: '~/.claude/CLAUDE.md 中写 @~/.codex/AGENTS.md', 生效范围: '所有项目' },
      snippets: [
        { label: '~/.claude/CLAUDE.md', lang: 'markdown', code: '@~/.codex/AGENTS.md' },
        { label: '规则骨架', lang: 'markdown', code: '## 1. 执行范围\n## 2. 验证\n## 3. Git 与远端安全\n## 4. README\n## 5. Planning 与并行\n## 6. 澄清与交付\n## 7. Windows' }
      ],
      links: [],
      body: '改动规则后，在这里记一笔**为什么改**，方便日后回看。\n\n- 2026-09：Push 前增加历史提交敏感信息检查',
      createdAt: '2026-02-18', updatedAt: '2026-09-28'
    },
    {
      id: 'config-claude-settings', type: 'config', slug: 'claude-settings', title: 'settings.json 权限基线',
      summary: '常用只读命令免确认，危险命令一律询问。',
      status: 'trying', pinned: false, rating: 3, platforms: ['claude-code'], tags: ['权限'],
      stacks: ['win-main'],
      fields: { 文件路径: '~/.claude/settings.json', 生效方式: '重启会话后生效' },
      snippets: [{ label: '权限片段', lang: 'json', code: '{\n  "permissions": {\n    "allow": ["Bash(git status)", "Bash(git diff:*)", "Bash(rg:*)"],\n    "ask": ["Bash(git push:*)"]\n  }\n}' }],
      links: [{ label: '设置文档', url: 'https://docs.claude.com/en/docs/claude-code/settings' }],
      body: '密钥不要写进这里，用环境变量；本工具只记录变量名。',
      createdAt: '2026-06-01', updatedAt: '2026-08-15'
    },
    {
      id: 'plugin-superpowers', type: 'plugin', slug: 'superpowers', title: 'superpowers',
      summary: '一组工程化工作流 Skill：头脑风暴、写计划、TDD、调试等。',
      status: 'using', pinned: false, rating: 4, platforms: ['claude-code'], tags: ['工作流'],
      stacks: ['win-main'],
      fields: { 市场: 'claude-plugins-official', 包含: 'Skills、Commands' },
      snippets: [
        { label: '添加市场', lang: 'text', code: '/plugin marketplace add anthropics/claude-plugins-official', install: true },
        { label: '安装', lang: 'text', code: '/plugin install superpowers@claude-plugins-official', install: true }
      ],
      links: [{ label: '市场仓库', url: 'https://github.com/anthropics/claude-plugins-official' }],
      body: '', createdAt: '2026-05-20', updatedAt: '2026-09-01'
    },
    {
      id: 'plugin-planning', type: 'plugin', slug: 'planning-with-files', title: 'planning-with-files',
      summary: '把计划、发现、进度写进 .planning/ 目录，长任务可跨会话恢复。',
      status: 'using', pinned: false, rating: 4, platforms: ['claude-code'], tags: ['计划', '工作流'],
      stacks: ['win-main'],
      fields: { 市场: 'planning-with-files', 来源仓库: 'OthmanAdi/planning-with-files' },
      snippets: [
        { label: '添加市场', lang: 'text', code: '/plugin marketplace add OthmanAdi/planning-with-files', install: true },
        { label: '安装', lang: 'text', code: '/plugin install planning-with-files@planning-with-files', install: true }
      ],
      links: [{ label: 'GitHub', url: 'https://github.com/OthmanAdi/planning-with-files' }],
      body: 'AGENTS.md 第 5 节约定：小任务不启用。', createdAt: '2026-05-02', updatedAt: '2026-08-30'
    },
    {
      id: 'plugin-frontend-design', type: 'plugin', slug: 'frontend-design', title: 'frontend-design',
      summary: '做新界面时提供视觉方向与排版约束，避免模板味。',
      status: 'using', pinned: false, rating: 4, platforms: ['claude-code'], tags: ['前端', '设计'],
      stacks: ['win-main'],
      fields: { 市场: 'claude-plugins-official', 包含: 'Skill' },
      snippets: [{ label: '安装', lang: 'text', code: '/plugin install frontend-design@claude-plugins-official', install: true }],
      links: [], body: '', createdAt: '2026-06-12', updatedAt: '2026-09-29'
    },
    {
      id: 'plugin-ui-ux-pro-max', type: 'plugin', slug: 'ui-ux-pro-max', title: 'ui-ux-pro-max',
      summary: 'UI/UX 资料库：配色、字体搭配、组件规范，可检索。',
      status: 'trying', pinned: false, rating: 3, platforms: ['claude-code'], tags: ['前端', '设计'],
      stacks: ['win-main'],
      fields: { 市场: 'ui-ux-pro-max-skill', 来源仓库: 'nextlevelbuilder/ui-ux-pro-max-skill' },
      snippets: [
        { label: '添加市场', lang: 'text', code: '/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill', install: true },
        { label: '安装', lang: 'text', code: '/plugin install ui-ux-pro-max@ui-ux-pro-max-skill', install: true }
      ],
      links: [], body: '内容很全，但一次加载的上下文偏多，只在需要设计系统时用。', createdAt: '2026-07-08', updatedAt: '2026-09-12'
    },
    {
      id: 'plugin-lsp', type: 'plugin', slug: 'lsp-bundle', title: 'LSP 插件组',
      summary: 'typescript / pyright / jdtls / rust-analyzer，给代理提供跳转与类型信息。',
      status: 'using', pinned: false, rating: 4, platforms: ['claude-code'], tags: ['LSP'],
      stacks: ['win-main'],
      fields: { 市场: 'claude-plugins-official', 依赖: '本机需装好对应语言服务器' },
      snippets: [{ label: '安装', lang: 'text', code: '/plugin install typescript-lsp@claude-plugins-official\n/plugin install pyright-lsp@claude-plugins-official\n/plugin install jdtls-lsp@claude-plugins-official\n/plugin install rust-analyzer-lsp@claude-plugins-official', install: true }],
      links: [], body: '', createdAt: '2026-07-20', updatedAt: '2026-09-05'
    },
    {
      id: 'skill-karpathy', type: 'skill', slug: 'karpathy-guidelines', title: 'karpathy-guidelines',
      summary: '写代码前先说清假设，改动保持外科手术式，定义可验证的完成标准。',
      status: 'using', pinned: false, rating: 4, platforms: ['claude-code'], tags: ['编码规范'],
      stacks: ['win-main'],
      fields: { 宿主: 'Claude Code', 来自插件: 'andrej-karpathy-skills@karpathy-skills', 触发: '写、审、重构代码时' },
      snippets: [
        { label: '添加市场', lang: 'text', code: '/plugin marketplace add forrestchang/andrej-karpathy-skills', install: true },
        { label: '安装', lang: 'text', code: '/plugin install andrej-karpathy-skills@karpathy-skills', install: true }
      ],
      links: [{ label: 'GitHub', url: 'https://github.com/forrestchang/andrej-karpathy-skills' }],
      body: '', createdAt: '2026-05-15', updatedAt: '2026-08-02'
    },
    {
      id: 'skill-tdd', type: 'skill', slug: 'tdd', title: 'tdd（红-绿-重构）',
      summary: '先写失败的测试，再写实现，适合修 bug 前固定复现。',
      status: 'trying', pinned: false, rating: 3, platforms: ['claude-code'], tags: ['测试'],
      stacks: ['win-main'],
      fields: { 宿主: 'Claude Code', 来自插件: 'mattpocock-skills@claude-plugins-official', 触发: '提到 TDD 或先写测试' },
      snippets: [{ label: '安装', lang: 'text', code: '/plugin install mattpocock-skills@claude-plugins-official', install: true }],
      links: [], body: '', createdAt: '2026-08-21', updatedAt: '2026-09-18'
    },
    {
      id: 'mcp-playwright', type: 'mcp', slug: 'playwright', title: 'Playwright MCP',
      summary: '让代理驱动真实浏览器：打开页面、点击、截图，用来验证前端改动。',
      status: 'using', pinned: true, rating: 5, platforms: ['claude-code', 'codex'], tags: ['浏览器', '测试'],
      stacks: ['win-main'],
      fields: { 传输: 'stdio', 命令: 'npx @playwright/mcp@latest', 作用域: 'user', 需要的环境变量: '无' },
      snippets: [
        { label: 'Claude Code', lang: 'bash', code: 'claude mcp add playwright -- npx @playwright/mcp@latest', install: true },
        { label: 'Codex（~/.codex/config.toml）', lang: 'toml', code: '[mcp_servers.playwright]\ncommand = "npx"\nargs = ["@playwright/mcp@latest"]' }
      ],
      links: [{ label: 'GitHub', url: 'https://github.com/microsoft/playwright-mcp' }],
      body: 'Claude Code 这边已通过 playwright 插件安装，无需再手动 add。',
      createdAt: '2026-04-30', updatedAt: '2026-09-22'
    },
    {
      id: 'mcp-chrome-devtools', type: 'mcp', slug: 'chrome-devtools', title: 'Chrome DevTools MCP',
      summary: '读控制台、网络请求和性能数据，排查页面问题比截图更直接。',
      status: 'using', pinned: false, rating: 4, platforms: ['claude-code'], tags: ['浏览器', '调试'],
      stacks: ['win-main'],
      fields: { 传输: 'stdio', 命令: 'npx chrome-devtools-mcp@latest', 作用域: 'user', 来自插件: 'chrome-devtools-mcp@claude-plugins-official' },
      snippets: [{ label: 'Claude Code', lang: 'bash', code: 'claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest', install: true }],
      links: [{ label: 'GitHub', url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp' }],
      body: '', createdAt: '2026-06-03', updatedAt: '2026-09-02'
    },
    {
      id: 'mcp-context7', type: 'mcp', slug: 'context7', title: 'Context7',
      summary: '按版本拉取第三方库的最新文档，减少代理凭记忆写过时 API。',
      status: 'wishlist', pinned: false, rating: 0, platforms: ['claude-code', 'cursor'], tags: ['文档'],
      stacks: [],
      fields: { 传输: 'http', 地址: 'https://mcp.context7.com/mcp', 作用域: 'user' },
      snippets: [{ label: 'Claude Code', lang: 'bash', code: 'claude mcp add --transport http context7 https://mcp.context7.com/mcp', install: true }],
      links: [{ label: 'GitHub', url: 'https://github.com/upstash/context7' }],
      body: '待验证：国内网络下的响应速度。', createdAt: '2026-09-14', updatedAt: '2026-09-14'
    },
    {
      id: 'hook-format-on-edit', type: 'hook', slug: 'format-on-edit', title: '改完文件自动格式化',
      summary: 'Edit/Write 之后对改动的文件跑 prettier，省掉手动格式化。',
      status: 'trying', pinned: false, rating: 3, platforms: ['claude-code'], tags: ['格式化'],
      stacks: ['win-main'],
      fields: { 事件: 'PostToolUse', 匹配器: 'Edit|Write', 配置位置: '项目 .claude/settings.json', 依赖: 'jq、prettier' },
      snippets: [{ label: 'settings.json 片段', lang: 'json', code: '{\n  "hooks": {\n    "PostToolUse": [{\n      "matcher": "Edit|Write",\n      "hooks": [{ "type": "command", "command": "jq -r \'.tool_input.file_path\' | xargs npx prettier --write" }]\n    }]\n  }\n}' }],
      links: [{ label: 'Hooks 文档', url: 'https://docs.claude.com/en/docs/claude-code/hooks' }],
      body: '只在前端项目启用；Java 项目格式化交给构建工具。', createdAt: '2026-08-05', updatedAt: '2026-09-19'
    },
    {
      id: 'hook-notify', type: 'hook', slug: 'notify-sound', title: '需要确认时响铃',
      summary: '代理等待授权或空闲时播放系统提示音，切到别的窗口也不会错过。',
      status: 'wishlist', pinned: false, rating: 0, platforms: ['claude-code'], tags: ['Windows', '提醒'],
      stacks: [],
      fields: { 事件: 'Notification', 配置位置: '~/.claude/settings.json' },
      snippets: [{ label: 'settings.json 片段', lang: 'json', code: '{\n  "hooks": {\n    "Notification": [{\n      "hooks": [{ "type": "command", "command": "powershell -NoProfile -Command \\"[System.Media.SystemSounds]::Asterisk.Play()\\"" }]\n    }]\n  }\n}' }],
      links: [], body: '', createdAt: '2026-09-20', updatedAt: '2026-09-20'
    },
    {
      id: 'prompt-review', type: 'prompt', slug: 'code-review-zh', title: '中文代码评审',
      summary: '按正确性、安全、可读性三档输出问题，每条附文件行号与修改建议。',
      status: 'using', pinned: true, rating: 5, platforms: ['general'], tags: ['评审'],
      stacks: ['win-main', 'mobile'],
      fields: { 适用场景: 'PR 合并前自查', 推荐模型: '推理强的模型', 变量: '语言、关注点、diff' },
      snippets: [{ label: '提示词', lang: 'text', code: '你是资深 {{语言}} 工程师。请评审下面的改动，重点关注 {{关注点}}。\n\n按“必须修 / 建议修 / 可选”三档列出问题，每条给出文件与行号、问题原因、修改建议。没有问题的档位写“无”。不要复述代码。\n\n改动如下：\n{{diff}}' }],
      links: [], body: '', createdAt: '2026-03-10', updatedAt: '2026-09-21'
    },
    {
      id: 'prompt-grill', type: 'prompt', slug: 'grill-plan', title: '方案拷问',
      summary: '让模型逐条追问方案里的漏洞，一次只问一个问题。',
      status: 'using', pinned: false, rating: 4, platforms: ['general'], tags: ['需求', '设计'],
      stacks: ['mobile'],
      fields: { 适用场景: '动手前检验思路', 变量: '方案' },
      snippets: [{ label: '提示词', lang: 'text', code: '下面是我的方案。请像严格的评审人一样逐条追问：每次只问一个最关键的问题，等我回答后再问下一个。关注前提假设、边界情况、失败时怎么办。\n\n方案：\n{{方案}}' }],
      links: [], body: '', createdAt: '2026-04-02', updatedAt: '2026-08-11'
    },
    {
      id: 'prompt-commit', type: 'prompt', slug: 'commit-message', title: '生成提交信息',
      summary: '根据 diff 写 Conventional Commits 格式的提交信息。',
      status: 'trying', pinned: false, rating: 3, platforms: ['general'], tags: ['Git'],
      stacks: ['win-main'],
      fields: { 适用场景: '提交前', 变量: 'diff' },
      snippets: [{ label: '提示词', lang: 'text', code: '根据下面的 diff 写一条提交信息：第一行用 Conventional Commits 格式，不超过 72 个字符；空一行后用 2 到 4 条要点说明为什么改，而不是改了什么。\n\n{{diff}}' }],
      links: [], body: '', createdAt: '2026-07-01', updatedAt: '2026-07-01'
    },
    {
      id: 'model-claude-api', type: 'model', slug: 'claude-api', title: 'Claude API',
      summary: '脚本和自建工具调用的模型服务，只记录变量名，不记录密钥。',
      status: 'using', pinned: false, rating: 5, platforms: ['general'], tags: ['API'],
      stacks: ['win-main', 'oracle'],
      fields: { 服务商: 'Anthropic', 常用模型: 'claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-4-5-20251001', 密钥变量: 'ANTHROPIC_API_KEY' },
      snippets: [{ label: '检查变量是否已设置', lang: 'bash', code: 'test -n "$ANTHROPIC_API_KEY" && echo set || echo missing' }],
      links: [{ label: '模型列表', url: 'https://docs.claude.com/en/docs/about-claude/models/overview' }],
      body: '', createdAt: '2026-02-01', updatedAt: '2026-09-15'
    },
    {
      id: 'inbox-obsidian-mcp', type: 'mcp', slug: 'obsidian-mcp', title: '群里有人推荐的 Obsidian MCP',
      summary: '还没看，先记下来。',
      status: 'inbox', pinned: false, rating: 0, platforms: [], tags: [],
      stacks: [], fields: {}, snippets: [], links: [], body: '',
      createdAt: '2026-09-29', updatedAt: '2026-09-29'
    }
  ]
};
