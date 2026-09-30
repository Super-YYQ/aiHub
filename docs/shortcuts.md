# 手机快捷指令（iOS）与 Android 分享

这两条路径都是把内容送到 `POST /api/capture`（03-api#快速记录），生成一条“待整理”条目。

## iOS：快捷指令

用 iPhone 自带的「快捷指令」App 建一个快捷指令，步骤如下（iOS 17+ 菜单名可能略有差异）：

1. 新建快捷指令，命名为「记到 AI 工作台」。
2. 添加动作「要求输入」（提示语写「要记的内容」）。
3. 添加动作「获取 URL 内容」：
   - URL：`https://<你的子域名>/api/capture`
   - 方法：`POST`
   - 请求头：添加两个：
     - `CF-Access-Client-Id`：`<capture 令牌的 Client ID>`
     - `CF-Access-Client-Secret`：`<capture 令牌的 Client Secret>`
   - 请求体（JSON）：
     ```json
     {
       "type": "tool",
       "text": "提供的输入"
     }
     ```
     （「提供的输入」用快捷指令的「要求输入」变量；`type` 可按需改成 `mcp`、`prompt` 等。）
4. 可选：把快捷指令加到主屏 / 共享菜单，之后在任何 App 里分享文字都能顺手记一条。

令牌来自 Cloudflare Zero Trust 的 Service Auth 策略（见 [05-security](../docs/detailed/05-security.md#access-配置)）：为「手机快捷记录」单独创建一个 `capture` 用途的令牌。同一个 `Idempotency-Key` 重复提交不会产生重复条目；快捷指令每次运行生成新键即可（用「随机数」动作拼进去）。

验证：在 iPhone 上运行快捷指令输入一段文字，稍后打开档案的「待整理」应出现这条记录。

## Android：分享到 AI 工作台

应用的 manifest 已声明 `share_target`（`action: "/"`，参数 `title` / `text` / `url`）。在 Android 上：

1. 用 Chrome 打开档案并「添加到主屏幕」安装 PWA。
2. 在任意 App（如浏览器）里点「分享」→ 选「AI 工作台」。
3. 应用会打开记录面板并预填分享的标题/文本/链接，确认后点「存入待整理」。

验证：从浏览器分享一个链接，记录面板预填该链接；存入后「待整理」出现该条目。

> 注意：分享参数在应用启动时读取后会从地址栏清掉，避免刷新时重复弹出。
