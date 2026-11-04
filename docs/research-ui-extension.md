# DSH Web UI 扩展落点调研报告（cabinet-mode 四项改造之 UI 三项）

- 调研人：内阁·翰林院编修（hanlin-editor）
- 时间：2026-11-04
- 环境：DeepSeek Harness `0.2.1-rc.5`，安装根 `/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/`（包体在其 `node_modules/@deepseek-ai/` 下，实测 306 项）
- 被改对象：`/home/fslong/.dsh/profiles/web/node_modules/dsh-cabinet-mode/cordis.patch.yml`（171 行）与 `package.json`（59 行）
- 方法：**纯只读**源码/配置考据 + 一次只读 `dsh --profile web --dump-config`（输出 1570 行，落 `/tmp/dsh-dump.yaml`）。**未安装、未改码、未改 live 配置、未做浏览器截图**。凡未实测者标「未验证」。

缩写约定：下文 `PKG` = `/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`。

---

## 结论速览

| 问题 | 一句话结论 |
|---|---|
| A 团队工具 | 本会话的 `spawn_teammate` 等**不是 cabinet preset 给的**，而是 profile 层 bundle `@deepseek-ai/dsh-experimental-agent-team-profile` 在**根作用域**插入的。是否走该 bundle 非必需，但要「preset 自包含」就必须自己插 `agent-team` + `tool-agent-team` 两行，且须同时撤掉 profile 那层以免重名 |
| B 客户端插件 | 三件套：包内 `dsh.client` + `exports."./client"` + 一条**启用的** Loader 行（`name` 指向该包）；浏览器侧 `window.__ModuleLoader__.load({id, factory})` 注册懒工厂。现成最小模板在 skill `templates/decoration/` |
| C 成员头像 | 渲染点在 `dsh-experimental-client-ui-agent-team/lib/client.js:112-141`（`TeamMemberRow`）；成员可用字段 `id/name/role/phase/error` + 派生 `status`。**建议自写 client 插件另渲染，不改这份带哈希类名的产物** |
| D 右侧面板 | 两段式：`ctx.sidebarRightTabs.register({...})` 声明类型 + `ctx.slots.inject('sidebar.right.pane.tab', …)` 挂 body；活样板 `dsh-client-ui-sidebar-files/lib/client.js:996,1003-1017` |
| E 数据源 | 成员 running 走 Remote 事件 `api-session/status`；roster/任务板走 **session 投影 `agentTeam`**，经 `session.control` 投影帧推送；spawn/send 没有专用事件，走同一投影帧 |

---

## A. agent-team 工具启用机制

### A.1 四个包各自职责（均实读 package.json 与源码）

| 包 | 职责 | 关键锚点 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team` | Host 服务 `ctx.agentTeams`：持久 roster、共享任务 DAG、直接消息、**注册 `agentTeam` 会话投影** | `PKG/dsh-experimental-agent-team/package.json:3`「Implicit-root Agent Teams roster, direct peer messaging, and shared task DAG」；服务类 `lib/index.js:1452`（`super(ctx, "agentTeams")`） |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | 面向模型的 9 个工具表层，`inject: ["agents","agentTeams","tools","systemPrompt"]` | `PKG/dsh-experimental-tool-agent-team/lib/index.js:11-15`；工具名见 `:251 spawn_teammate`、`:293 send_message`、`:321 list_agents`、`:330 wait_agent`、`:352 interrupt_agent`、`:365 team_task_create`、`:400 team_task_list`、`:444 team_task_get`、`:457 team_task_update` |
| `@deepseek-ai/dsh-experimental-client-ui-agent-team` | 浏览器侧 roster/任务板浮层（本报告 C 节） | `package.json:3`「Web Agent Teams roster, task board, and teammate navigation」 |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | **组合包**：一个 `cordis.patch.yml` 同时禁用旧 subagent 工具 + 插入上面三者 | `PKG/dsh-experimental-agent-team-profile/package.json:35-39`（`dsh.bundle.patch: ./cordis.patch.yml`） |

### A.2 本会话团队工具的真实来源（对照实际生效配置反推）

证据链：

1. profile 的 bundle 列表 —— `/home/fslong/.dsh/profiles/web/package.json:11-18`：

   ```json
   "bundles": [
     "@deepseek-ai/dsh-base",                                  // :12
     "@deepseek-ai/dsh-web-app",                               // :13
     "@deepseek-ai/dsh-experimental-agent-team-profile",       // :14  ← 团队工具来源
     "@deepseek-ai/dsh-experimental-auto-review",              // :15
     "@rsrsai/dsh",                                            // :16
     "dsh-cabinet-mode"                                        // :17
   ]
   ```

2. 该 bundle 的 patch —— `PKG/dsh-experimental-agent-team-profile/cordis.patch.yml`：
   - `:4-14` 禁用根级 `tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork`
   - `:16-23` 插入 `agent-team`（服务，`maxMembers:8 maxTasks:256 maxMessageBytes:65536 disposalTimeoutMs:5000`）
   - `:25-29` 插入 `tool-agent-team`（`freshProvider: spawn` / `forkProvider: fork`）
   - `:31-32` 插入 `ui-agent-team`（浏览器 roster）

3. 实测合成配置（只读命令 `dsh --profile web --dump-config`，`/tmp/dsh-dump.yaml`）：
   - `:1316-1331` 出现**根级**三行 `agent-team` / `tool-agent-team` / `ui-agent-team`，均无 `disabled`
   - `:363-380` 根级 `tool-subagent*` 四行 `disabled: true`（被上层 patch 覆盖）
   - `:1339+` 才是 `preset-cabinet`；`:1525-1552` 是 cabinet preset 的 `delegation` 组，内容仅 `tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork` / `workflow-ptc` / `tool-workflow` —— **确无团队工具**

> 推论（与本会话系统提示一致）：Team 工具由**根作用域**提供，对 profile 内所有 preset 的 agent 可见；cabinet preset 的 delegation 组缺它们不影响本会话可用性。cabinet 自带的 `tool-subagent` 行（preset 作用域）与根级被禁的那组是两回事。

### A.3 是否必须走 agent-team-profile？

**不必。** 该组合包只是「一次性做完三件事」的便利层（禁旧工具 + 插服务 + 插工具 + 插 UI），其 README 亦给出最小增量写法：`PKG/dsh-experimental-agent-team/README.zh.md:40-45`

```yaml
# smallest team setup — durable storage plus both Team packages
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-experimental-agent-team'
- name: '@deepseek-ai/dsh-experimental-tool-agent-team'
```

放置规则的权威依据：`PKG/dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md:76-80`

> 「Preset plugins contribute scoped tools … A preset plugin that supplies a service must isolate the provider and all its consumers in the same realm. … Scope controls contributions and event visibility; `isolate` controls service instances.」

即：**服务与消费者必须同处一个 realm**。因此要么「根级放服务+工具」（现状），要么「preset 内同时放服务+工具」，不能只放一半。

补丁方言依据：`PKG/dsh-agent-preset/skills/cordis-composition-reference/SKILL.md:14` —— `insert: [rows]` 带 `id` 命中已有 `group: true` 行时，rows 追加进该组 `config`；`:15` —— 只写 `id` 不写 `insert` 是**整体替换** `config`（必须重述全部字段）。

### A.4 可直接粘贴的 YAML 片段

**片段 A-1（推荐，cabinet 自包含）** —— 插入 `dsh-cabinet-mode/cordis.patch.yml` 的 `delegation` 组 `config` 内（当前 `:126-152`，紧跟 `:151-152` 的 `tool-workflow` 之后、`:153` 的 `tool-ask-user` 之前）：

```yaml
              - id: agent-team
                name: '@deepseek-ai/dsh-experimental-agent-team'
                config:
                  maxMembers: 8
                  maxTasks: 256
                  maxMessageBytes: 65536
                  disposalTimeoutMs: 5000
              - id: tool-agent-team
                name: '@deepseek-ai/dsh-experimental-tool-agent-team'
                config:
                  freshProvider: spawn
                  forkProvider: fork
```

（缩进对齐该组现有 `tool-subagent` 等行，即 14 空格起的 `- id:`；实际粘贴时以文件现有缩进为准。）

**片段 A-2（若改在 profile 层按 id 追加，而非改 preset 内联列表）** —— 用 insert 进组，**不要**用裸 `id: delegation` + `config`（那是整体替换）：

```yaml
- id: delegation
  insert:
    - id: agent-team
      name: '@deepseek-ai/dsh-experimental-agent-team'
      config: { maxMembers: 8, maxTasks: 256, maxMessageBytes: 65536, disposalTimeoutMs: 5000 }
    - id: tool-agent-team
      name: '@deepseek-ai/dsh-experimental-tool-agent-team'
      config: { freshProvider: spawn, forkProvider: fork }
```

**片段 A-3（配套清理，避免双份）**：采用 A-1/A-2 前，须从 `/home/fslong/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 移除 `"@deepseek-ai/dsh-experimental-agent-team-profile"`（`:14`），否则根级与 preset 级各有一份 `agent-team`/`tool-agent-team`。

### A.5 风险与未验证

- **重名冲突未验证**：`dsh-tools` 对同名工具有硬校验 —— `PKG/dsh-tools/lib/index.js:2731`（`tool "X" is already registered … in this scope`），注册入口 `:2974-2982`。根级与 preset 级是否判为不同 scope、模型侧是否出现两份 `spawn_teammate`，**未实测**。
- **UI 行能否放进 preset 未验证**：`ui-agent-team` 是 client 插件行，client-modules 扫的是 Loader 条目（见 B 节 `lib/index.js:854`），preset 子条目是否同样被扫，**未实测**。稳妥做法：UI 行留在根级。
- 本节结论 A.2 有 `--dump-config` 实证；A.4 片段**未粘贴、未加载验证**。

---

## B. 客户端插件（third-party client plugin）扩展机制

### B.1 加载链路（实读源码）

1. **Host 侧扫描**：`PKG/dsh-client-modules/lib/index.js`
   - `:105-106`「scans the host Loader's entries for packages declaring `dsh.client`」
   - `:852-858` `processOne()` 遍历 `ctx.loader.entries()`，**跳过 `entry.disabled`** → 行必须启用
   - `:877-888` `resolveSource()` 用 `entry.options.name` + `entry.parent.tree.ctx.baseUrl` 定位包
   - `:730-738` 读包 `package.json` → `parseDshClient()`；若声明了 `dsh.client` 却**没有 `exports."./client"` 直接抛错**（`:738`）
   - `:733` `platform !== "web"` 则忽略
2. **产物服务**：同包 README `PKG/dsh-client-modules/README.md:12`（host 半部合成 boot graph，经 `/plugins` 服务，浏览器懒加载）、`:34`（声明三要素：`platform:'web'`、`./client` 导出、非基线依赖进 `dsh.client.external`）、`:50`（共享模块表 `PLATFORM_MODULES`，外部依赖必须能被基线或 `external` 行应答）
3. **浏览器侧注册**：`PKG/dsh-agent-preset/skills/cordis-plugin-development/references/ui-plugin.md:9` ——「The browser artifact registers a lazy factory whose **id equals the package name**」；`:11` 通过 `ctx.slots.inject` + `ctx.slots.register` 挂载
4. **热更新**：`PKG/dsh-client-hmr/README.md`（Summary 段）—— 开启的网页跟随 Host 插件图实时增删；开发态由 `pnpm run dev:web` 的 bundle watcher 把重建产物换进运行中的浏览器（「Starting the reload chain」小节）。**注意**：HMR 只在该 watcher 同时运行时生效；改 `apps/web` 外壳或普通包需重建并刷新页面。

### B.2 写一个最小 client 插件需要什么

官方最小模板（**逐字实读**）：`PKG/dsh-agent-preset/skills/cordis-plugin-development/templates/decoration/`

`package.json`（1-21 行）：

```json
{
  "name": "@local/my-decoration",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["index.js", "client.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-conversation"] }
  }
}
```

`cordis.patch.yml`（1-3 行）—— 插一条以包名为 `name` 的行：

```yaml
- insert:
    - id: my-decoration
      name: '@local/my-decoration'
```

`index.js`（1-2 行）—— Host 半部空实现：

```js
export function apply() {}
```

`client.js`（1-22 行）—— 浏览器半部注册懒工厂，`id` 必须等于包名：

```js
window.__ModuleLoader__.load({
  id: '@local/my-decoration',
  factory(require) {
    const React = require('react');
    ...
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'my-decoration', order: 5,
        }, Decoration));
      },
    };
  },
});
```

要点清单（均有出处）：

| 要点 | 出处 |
|---|---|
| 包内 `dsh.client: {platform:"web", inject:[...], immediately?}` | `ui-plugin.md:3`；`dsh-client-modules/lib/index.js:66-69`（类型校验） |
| 必须 `exports."./client"`，否则 Host 抛错 | `dsh-client-modules/lib/index.js:738` |
| Loader 行 `name` 指向该包，且**不得 disabled** | `dsh-client-modules/lib/index.js:854-855` |
| 工厂 `id` = 包名；React 取自浏览器模块表，勿自带 | `ui-plugin.md:9` |
| 副作用放 `apply` 内，用 `ctx.effect`/`ctx.on` 并返回清理 | `ui-plugin.md:13` |
| 文案走 Client locale 服务；勿替换 app root / 往 `document.body` 追加第二应用 | `ui-plugin.md:13` |
| 安装用 `plugin_manager action: install_bundle`（绝对目录），**不要手改 profile 的 `package.json`/`cordis.patch.yml`** | `PKG/dsh-agent-preset/skills/cordis-plugin-development/SKILL.md:8,10` |

### B.3 落到 dsh-cabinet-mode（现状 → 需补什么）

现状 `package.json`（实读 1-59 行）：**没有 `exports`、没有 `main`、没有 `dsh.client`**，只有 `dsh.bundle.patch`（`:47-51`）；`files`（`:36-46`）也只收 yml/md/svg/scripts。`cordis.patch.yml` 全部行的 `name` 都指向 `@deepseek-ai/*` 包，**没有任何一行 `name: dsh-cabinet-mode`**。

因此要做 client 插件，需同时补齐四件（**未验证**，未安装）：

1. `package.json` 增加 `exports": {".": "./index.js", "./client": "./client.js"}` 与 `dsh.client` 段；
2. 新增 `index.js`（`export function apply() {}`）与 `client.js`（`window.__ModuleLoader__.load(...)`）；
3. `cordis.patch.yml` 增加一行 `- id: cabinet-ui` / `name: dsh-cabinet-mode`（使该包成为被扫描的启用 Loader 条目）；
4. `files` 数组补 `index.js`、`client.js`。

> 替代方案：拆一个独立的 `dsh-cabinet-ui` 包只做 client 半部，cabinet-mode 主包保持纯声明式。两案**均未实测**。

---

## C. 成员 roster 渲染落点（加头像）

### C.1 渲染位置（`PKG/dsh-experimental-client-ui-agent-team/lib/client.js`，共 516 行）

| 行号 | 内容 |
|---|---|
| `:12` | 整份 CSS 字符串，类名前缀 `VoX2oq_`（`VoX2oq_member`、`VoX2oq_memberDot`、`VoX2oq_memberNameText`、`VoX2oq_currentTag`、`VoX2oq_memberModel` 全在此行） |
| `:13-20` | 以 `style[data-plugin-css=…]` 注入该 CSS |
| `:21-52` | `TeamAction_module_css_default` 类名映射（`memberDot` `:34`、`memberNameText` `:37`、`currentTag` `:25`、`memberModel` `:35`） |
| `:88-144` | **`TeamMemberRow` —— 单个成员卡片** |
| `:89` | `model` ← `projectionsBySession[member.id].values.modelSelection.next.model` |
| `:90-92` | `running` ← `useSessionStatus(state => state.get(member.id)?.running)`；`status` = `member.phase === 'active' ? (running ?? summaryRunning) ? 'running' : 'inactive' : member.phase` |
| `:93-95` | `isCurrent` / `highlightCurrent` / `inert` |
| `:101-111` | `<button class="member [memberCurrent]">`，`onClick → openTeammate` |
| **`:112-117`** | **`<span class="memberDot">`**：inactive 时画 `IconUserOutlineRegular`，否则 `StateDot` |
| **`:118-141`** | **`<span class="memberText">`**：`:123-125` 姓名（`member.name`）、`:126-130` `currentTag`、`:132-135` 状态文案 + `memberModel`、`:136-139` `member.error` |
| `:357-372` | roster 分区：`team.members.map(...)` → `TeamMemberRow`（`:362`） |
| `:223-391` | `TeamAction` 浮层本体；`:239` 读团队投影（见 E 节） |
| `:469-498` | `registerAgentTeamUi(ctx)`：locale 注册（`:470-473`）、导航回调（`:478-490`）、**slot 注册 `:491-497`**（`conversation.session.header.actions`，`id: "agent-team"`，**`order: -20`**） |
| `:457-462` | `inject = ["sessions","uiWorkspace","slots","locale"]` |
| `:506-511` | 导出 `apply` / `inject` |

### C.2 成员数据结构与来源

**线上投影 schema（权威）** —— `PKG/dsh-experimental-agent-team/lib/index.js:649-659`：

```js
const teamMemberProjectionSchema = z$1.object({
	id: sessionIdSchema,
	name: z$1.string(),
	role: z$1.enum(["lead", "teammate"]),
	phase: z$1.enum(["provisioning", "active", "failed"]),
	error: z$1.string().optional()
}).strict();
```

- lead 伪行由 `buildTeamProjection` 生成：`:685-690`（`name: "lead", role: "lead", phase: "active"`）
- teammate 行：`:691-697`
- 完整 wire 视图 `teamProjectionSchema`：`:677-681`（`members` / `tasks` / `failure?`）
- 类型声明：`PKG/dsh-experimental-agent-team/lib/types/types.d.ts:33-41`（`TeamMemberSnapshot`，额外含 `description`/`provider`/`context`，但**这些不进 wire 视图**）、`:43-53`（`TeamMemberView`，含 `status`/`model`/`diagnostics`，供工具侧 `list_agents` 用，非客户端投影）

**可用字段（客户端实际拿得到的）**：`member.id`、`member.name`、`member.role`、`member.phase`、`member.error`，以及 `client.js:92` 派生出的 `status ∈ {running, inactive, provisioning, failed}`、`:93` 的 `isCurrent`、`:89` 的 `model`。

**取数钩子**：
- `useSessions` / `useSessionStatus` 是**全局标准 props**，任何 slot 组件自动注入 —— `PKG/dsh-client-ui-session/lib/types/client/index.d.ts:72-79`
- `useProjection` 是会话级标准 props（`:86`），可按 key 直读投影
- 本组件取团队：`client.js:239` `useSessions(state => state.projectionsBySession[leadSessionId]?.values.agentTeam)`；`leadSessionId` 由 `:238`（subagent address 的 `parentSessionId`）与 `:475-477` 推出

### C.3 加头像 `<img>`（按 `member.name` 映射）——三个落点

**方案 C-3-1（改动最小、最脆弱）**：直接改 `PKG/dsh-experimental-client-ui-agent-team/lib/client.js`，在 `:112-117` 的 `memberDot` span 之后、`:118` 的 `memberText` 之前插入：

```jsx
(0, react_jsx_runtime.jsx)("img", {
	alt: "",
	"aria-hidden": true,
	src: AVATARS[member.name],            // const AVATARS = { lead: '...', 'gongbu-zhushi': '...' }
	className: TeamAction_module_css_default.memberAvatar,
	width: 20, height: 20, loading: "lazy"
}),
```

并在 `:12` 的 CSS 串里补 `.VoX2oq_memberAvatar{flex:none;width:20px;height:20px;border-radius:50%;object-fit:cover}`，`:21-52` 的映射里补 `"memberAvatar": "VoX2oq_memberAvatar"`。

> 缺点：这是 **tsdown 产物**（`:11` 源标注指向 `TeamAction.module.css.mjs`，包内无 `src/`），升级即被覆盖；类名哈希前缀 `VoX2oq_` 也随构建变化。**未实测**。

**方案 C-3-2（不碰产物，改 slot）**：自写 client 插件，向 `conversation.session.header.actions` 再注册一个组件（`id` 与 `order` 区别于 `agent-team` 的 `id:"agent-team"`, `order:-20`，见 `client.js:491-497`），内部同样用 `useSessions` 读 `projectionsBySession[lead].values.agentTeam` 自绘带头像的成员条。该 slot 是列表位，多注册项是否并排渲染**未验证**。

**方案 C-3-3（推荐，同时覆盖问题 3 的侧边栏）**：按 D 节注册自己的右栏页签，用 `useSessions`/`useProjection('agentTeam')` 自绘 roster + 头像 + 工作流图，完全不动 `agent-team` 产物。**未验证**（未安装）。

> 头像图来源：插件包内静态资源（`./avatar/<name>.png`，走 `dsh.client` 包内相对路径）或 `dsh-resource://` 地址；成员 `name` 是 spawn 时的持久小写名（`README.zh.md:60`「teammate 名字是永久的」），可作稳定映射键。**具体资源服务 API 未验证**。

---

## D. 右侧面板扩展（新增页签/面板）

### D.1 注册 API（两段式）

权威文档：`PKG/dsh-client-ui-sidebar-right/README.md`「Extension seats」小节（原文要点）：

1. **类型声明** —— `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide?, keepMounted? })`，返回 disposer，须包在自己的 `ctx.effect` 里。
   - `id`：实现自身身份，全注册表唯一（包名是自然取值），重复注册抛错
   - `kind`：类型判别符，`openTab(kind)` 用它打开；一个 kind 至多一个 `builtin` + 一个 `extension`（extension 优先）
   - `patterns`：资源地址 glob；纯页类型（如工作流图）**不写 patterns**，按 kind 打开
   - `priority`：`'extension' | 'builtin' | 'fallback'`（默认 `extension`）
   - `title(address)`：页签文案（打开时捕获）
2. **正文挂载** —— `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)`，组件通过框架注入的 `useTabInfo()` 取 `{ sidebar, panel, tab }`。

类型定义逐行实读：`PKG/dsh-client-ui-sidebar-right/lib/types/client/tab-registry.d.ts`
- `:44` `SidebarRightTabPriority`
- `:75-120` `SidebarRightTabDefinition`（`id` `:83`、`kind` `:85`、`multiple` `:87`、`keepMounted` `:89`、`patterns` `:100`、`priority` `:102`、`canOpen` `:111`、`title` `:117`、`guide` `:119`）
- `:141-164` `SidebarRightTabRegistry.register()`（`:164`，doc 注明重复 id / kind 冲突会抛）

### D.2 现成落点（活样板，逐行实读）

`PKG/dsh-client-ui-sidebar-files/lib/client.js`：

```js
// :996  阶段一：声明页类型
ctx.effect(() => ctx.sidebarRightTabs.register(filesDefinition(t)), "ui-sidebar-files: files type");

// :1003-1013  阶段二：挂正文（key 必须等于 definition.id）
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
	name: "sidebar.right.pane.tab",
	key: FILES_ID,
	locale: NS,
	store,
	inject,
	children: { "sidebar.right.tab.files.actions": { kind: "list", scope: "session" } }
}, FilesBody)), "ui-sidebar-files: files tab body");

// :1014-1017  可选：页签标题组件
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
	name: "sidebar.right.pane.tab.title",
	key: FILES_ID
}, FilesTitle)), "ui-sidebar-files: files tab title");
```

打开方式：`ctx.sidebarRight.openTab(kind, options)`（README「`ctx.sidebarRight`」节：`openResource`/`openResource` 之外的页用 `openTab`；页会被记录到该包自造的地址上，调用方不必拼地址）。快捷键样板见同文件 `:981-994`（`ctx.sidebarRight.openTabFromTarget("files", target)`）。

`dsh-client-ui-sidebar-right` 自身的 client manifest（`:29-41`）：

```json
"dsh": { "client": { "platform": "web",
  "inject": ["@deepseek-ai/dsh-api-session-controller","@deepseek-ai/dsh-client-resources",
             "@deepseek-ai/dsh-client-ui-conversation","@deepseek-ai/dsh-client-ui-layout",
             "@deepseek-ai/dsh-client-ui-session","@deepseek-ai/dsh-client-shortcuts"] } }
```

### D.3 左侧栏（`dsh-client-ui-sidebar`）对照

`PKG/dsh-client-ui-sidebar/README.md:38`：插件往根作用域 `sidebar.panellist` 列表加图标（`id`/`order`/`label`），**同一 `id` 寻址 layout 根作用域 `main` keyed 槽里的组件**；选中缺失的 main 项会抛错。`:40` `sidebar.panellist.actions` 是 More 菜单行。`:45` 提到 `sidebar.toggle.badge`。

> 若「侧边栏可视化面板」要的是**左侧主面板**，走 `sidebar.panellist` + `main` keyed slot；若是**右侧工作区面板**（更贴合「工作流程图常驻」），走 D.1 两段式。**两条路径均未实测。**

### D.4 patch 方式（纯声明，不写 JS 也能换血）

按 `cordis-composition-reference/SKILL.md:15`，用 `id` + `config` **整体替换**目标行；client 插件仍需 B 节三件套。另可参考 `PKG/dsh-client-ui-entry-customization/README.md:45`（往 `sidebar.right.tab.guide.actions` 等三个菜单位注册行，属「往现有菜单塞条目」的轻量路径）。

---

## E. 状态与任务数据源与实时推送

### E.1 (1) 成员 running/inactive（`list_agents` 的数据源）

Host 侧：
- `PKG/dsh-api-session-controller/lib/index.js:2991-2993`

  ```js
  ctx.on("agent/status", ({ agent, status }) => {
      ctx.emit("api-session/status", agent.id, status === "running");
  });
  ```
- Remote 事件契约：`lib/types/remote-events.d.ts:2` `'api-session/activity' | 'api-session/added' | 'api-session/error' | 'api-session/removed' | 'api-session/status'`
- 事件签名：`lib/typert.host.js:4046-4048` `'api-session/status'(sessionId, running): void`
- 列表基线 `running` 字段：`lib/index.js:1948`（`this.ctx.agents.get(session.id)?.status === "running"`）

Client 侧：
- 订阅：`PKG/dsh-api-session-controller/lib/client.js:4272-4273`

  ```js
  ctx.remote.$on("api-session/status", (sessionId, running) => { sessions.handleSessionStatus(sessionId, running); });
  ```
- 落 store：`:3533-3535` `handleSessionStatus(sessionId, running)`
- 钩子类型：`PKG/dsh-client-ui-session/lib/types/client/index.d.ts:39-41` `SessionStatusSnapshot = ReadonlyMap<SessionId, SessionStatus>`，`SessionStatus.running: boolean | undefined`（`:30-37`）；作为 `GlobalStandardProps.useSessionStatus` 注入（`:75`）
- roster 消费点：`client-ui-agent-team/lib/client.js:90`、`:92`

### E.2 (2) team_task 任务板（`team_task_list` 的数据源）

**不是独立 RPC，是会话投影 `agentTeam`。**

Host 侧：
- 投影定义 `PKG/dsh-experimental-agent-team/lib/index.js:726-735`：`key: "agentTeam"`（`:728`）、`stateVersion: 4`、`apply`、`wire.view = teamProjectionView`
- 注册：`:1474` `ctx.root.sessionProjections.register(teamProjectionDefinition)`
- wire 视图：`:677-681` `{members, tasks, failure?}`；任务字段 `:660-676`（`id/revision/subject/description/status/blockedBy/writeScopes/ownerName/ready/writeScopeWarnings`）
- 任务变更落日志：`TeamJournal.appendAndFlush` `:156-160`（`session.append` → `sessions.flush` → `onCommit`），调用点 `:1025`、`:1139`、`:1174`（`team/member`）、`:1234`、`:1375`（`team/task`）

**推送链（实读）**：
1. `PKG/dsh-api-session-controller/lib/index.js:1202-1210`

   ```js
   ctx.sessionProjections.onChanged((session, key, value, seq) => {
       this.broadcast({ type: "projection", sessionId: session.id, key, value, seq });
   });
   ```
2. Remote 流方法 `control`：`:3338-3363`（`:3354` `case "projection"` 过 remoteAccess 后下发）；基线帧 `:1226-1229` `{type:"baseline", value:{projections}}`
3. Client 订阅：`lib/client.js:389` `open: (signal) => remote.session.control(signal)`
4. 落 `ProjectionValueStore`：`lib/client.js:1539`（region 标注）、`:2241-2248`（「push model … updated by Session Controller control frames」）
5. 列表态 `projectionsBySession`：`lib/types/client/sessions/service.d.ts:52`
6. 消费：`client-ui-agent-team/lib/client.js:239`

**传输**：`PKG/dsh-client-connection/README.md:34` —— 浏览器 HTTP POST 走 unary，**WebSocket 是 `/api/remote.mux`**，Gateway 拥有其逻辑流。即：`remote.session.control` 是 mux 上的一条 Remote 流，帧名 `baseline` / `projection`。

### E.3 (3) spawn_teammate / send_message 活动事件

**没有独立的 "spawn/message" websocket 事件**，全部折叠进同一条链：

| 动作 | Host 落点 | 之后 |
|---|---|---|
| spawn（roster 变更） | `PKG/dsh-experimental-agent-team/lib/index.js:1025`（`appendAndFlush(root, "team/member", …)`，前置 `:1019 phase:"provisioning"`；失败 `:1047 phase:"failed"`；成功 `:1061 phase:"active"`） | `:156-160` flush → `onCommit` → `:1462 this.activity.notify(TeamId(root.id))` → 投影 `onChanged` → `type:"projection"` 帧 |
| send_message | `:1601-1610` `sendAdmitted()`（lead 走 `root.steer(input)`，teammate 走 `steerHostSubagentPrompt`），`:1612 this.activity.notify(membership.id)` | 邮箱变化**不改 wire 视图**（`README.zh.md:174`「仅邮箱的变化保留客户端视图引用，不产生 frame」），但目标会话会收到新消息并触发其 `agent/status` → `api-session/status` |
| 任务板增改 | `:1234` / `:1375`（`team/task`） | 同上投影帧 |
| 成员状态边 | `:1469-1472` `ctx.on("agent/status", …)` → `activity.notify` | 同时走 E.1 的 `api-session/status` |

持久事件类型（仅入日志、不进模型历史）：`PKG/dsh-experimental-agent-team/lib/types/projection.d.ts:34`
`'team/member' | 'team/task' | 'team/message/queued' | 'team/message/delivered'`；README 原文 `README.zh.md:144`。

`wait_agent` 用的活动等待是 Host 内部 `TeamActivity`（`waitForChange`，`lib/index.js:1561` 附近），不产生浏览器事件。

### E.4 一句话归纳

> 客户端要的三样东西只有**两个通道**：`api-session/status`（Remote 事件，running 态）+ `agentTeam` 投影帧（roster 与任务板）。spawn/send/claim 等协作活动**复用后者**，因为它们都会 append Lead 会话日志并 flush 投影。任何自写面板只需订阅这两者，无需新增协议。

---

## 未验证清单（诚实披露）

1. A.4 三段 YAML **未粘贴、未重启、未 `--dump-config` 复验**。
2. 根级与 preset 级同时注册同名工具是否会冲突/重复展示（`dsh-tools:2731` 仅证明同 scope 内必抛）——**未实测**。
3. `ui-agent-team` 类 client 行放进 preset `plugins` 是否仍被 client-modules 扫到——**未实测**。
4. cabinet-mode 增加 `dsh.client` + Loader 行后的加载、`/plugins` 产物与 HMR 表现——**未实测**（B.3）。
5. `conversation.session.header.actions` 是否为多注册列表位（C-3-2）——**未实测**。
6. 头像资源的具体服务方式（包内相对路径 vs `dsh-resource://`）——**未验证**。
7. 全部结论基于 `0.2.1-rc.5` 已安装产物 `lib/*.js`（无 `src/`）与 `--dump-config`；**未做浏览器截图/实机点验**。
8. 未读取 `docs/subsystems/agent-team.zh.md`、`docs/config-catalog.md`（在 dsh 源码仓内，本安装不带）——涉及处已用包内 README 替代。

---

## 附：本报告引用的权威 skill 文档（随 dsh 安装自带）

- `PKG/dsh-agent-preset/skills/cordis-plugin-development/SKILL.md`（插件安装与交付流程）
- `PKG/dsh-agent-preset/skills/cordis-plugin-development/references/ui-plugin.md`（client 插件 15 行要点）
- `PKG/dsh-agent-preset/skills/cordis-plugin-development/templates/decoration/*`（最小模板）
- `PKG/dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md`（preset 声明、作用域/isolate 规则）
- `PKG/dsh-agent-preset/skills/cordis-composition-reference/SKILL.md`（Loader 补丁方言）
- `PKG/dsh-agent-preset/skills/cordis-composition-reference/references/packages.md`（可装载包清单；`:188` `agent-team`、`:195` `client-ui-agent-team`、`:207` `tool-agent-team`、`:110-115` sidebar 系列）
