# 内阁成员个性化配置页：DSH 官方契约取证卷宗

- 结论状态：**只读取证**，未改任何插件代码、未改任何 live 配置。所有断言锚定「文件:行号」或命令输出；无行号支撑的推断一律标 **未验证**。
- 取证时间：2026-11-05（Asia/Shanghai）。
- 取证对象（只读）：DSH 实现 `/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/`（版本 `0.2.1-rc.5`，`dsh --version` → `0.2.1-rc.5`）。
- 本仓基线：**`origin/main` = `19e97a2`（Merge PR #2）** → 与 DSH 侧的取证无关，但第 5 节的行号按此基线给出，「无回归」也以此为准。
- 本文提到的 `dsh-*` 包路径均相对 `/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`，为节省篇幅省略该前缀，写作 `〈pkg〉/...` 时以斜体包名开头。

---

## 0. 结论先行

| # | 问题 | 结论 | 可行性 | 关键证据 |
| --- | --- | --- | --- | --- |
| 1 | 设置页能否新增「内阁成员」分区 | **能，官方一等公民**：注册 `settings.section` 槽（kind `list` / scope `root`），导航行由外壳按 `order` 排序，内容列按 `id` 挂载 | **A** | *dsh-client-ui-settings*/lib/types/client/contract/slots.d.ts:63-77、154-157；外壳消费 *dsh-client-ui-settings-general*/lib/client.js:1146-1161、:337 |
| 2 | 分区注册的真实签名 | `ctx.slots.inject("settings.section", () => ctx.slots.register({name,id,order,label,locale,inject?,children?}, Component))`，须包在 `ctx.effect()` 里 | **A** | *dsh-client-ui-settings-plugins*/lib/client.js:201-207；*dsh-client-ui-settings-models*/lib/client.js:4485-4496 |
| 3 | 自定义配置存在哪 | **当前 profile 的 Cordis patch（`~/.dsh/profiles/<profile>/cordis.patch.yml`）**；`Config` 字段必须 `.volatile()`，否则写入被拒 | **A** | *dsh-settings*/lib/index.js:501-507；*dsh-config-editor*/README.zh.md:67；实机 `~/.dsh/profiles/web/cordis.patch.yml` |
| 4 | 写入后是否要重挂载 | **不需要**。volatile-only 变更由 Loader 原地 `updateVolatile(ref, …)` 提交并 emit `loader/volatile-update`，插件实例不重建 | **A** | *cordis-plugin-loader*/lib/index.js:382-384、395-423（尤其 :415 `updateVolatile(ref, source)`、:422 事件） |
| 5 | 提示词能否运行时按用户配置注入 | **能**。`ctx.systemPrompt.section({name,order,text:(ctx)=>…})` 的 text 提供者在**每次装配**时求值；空串在渲染时消失 | **A** | *dsh-system-prompt*/lib/types/index.d.ts:47-70、:250；lib/index.js:187、:388；README.zh.md:110 |
| 6 | 成员身份（首辅/阁臣、名字）从哪取 | `ctx.agentTeams.tryMembership(agent)` → `{role,name}`；`AssembleContext.agent` 在 section provider 里可拿到 | **A** | *dsh-experimental-tool-agent-team*/lib/index.js:234-249（身份短语唯一产地）；*dsh-experimental-agent-team*/lib/types/index.d.ts:34、:104；*dsh-agent*/lib/types/runtime-types.d.ts:15-19 |
| 7 | `~190KB` 单个 JSON 装五张头像行不行 | **能存（无长度校验），但不应这么做**：每次 `settings.describe` 全量下发、192KB 常驻 patch YAML、每写一次整份校验。按裁断拆 5 个独立字段 + 96×96 PNG（≤16KB/张，硬上限 48KB） | **B**（拆字段后为 A） | *dsh-settings*/lib/index.js:501-530（无 bytes 判定）；*dsh-client-ui-settings*/README.zh.md:64；*dsh-api-gateway*/lib/index.js:300 + ws 8.22.1 默认 maxPayload 100MiB |
| 8 | 新增 UI 改 `src/` 还是改 `client.js` | **直接改 `client.js`**。本包无构建步骤；`src/avatars.js` 是生成器产物，`client.js` 的 avatars region 由 `src/build_avatars.py` 原地重写 | **A** | *本仓* client.js:1-21 头注释；src/build_avatars.py:1-21、50-51（`REGION_START/REGION_END`） |
| 9 | 第三方客户端 bundle 能否 require 官方 UI 包 | **能**：`@deepseek-ai/dsh-client-ui-slots` / `-primitives` / `cordis` / `react*` / `zod` / `dsh-client-store` 在外壳冻结模块表里，无需 `dsh.client.external` | **A** | 外壳产物 `dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 的模块表字面量（含 `"@deepseek-ai/dsh-client-ui-slots":jI,"@deepseek-ai/dsh-client-ui-primitives":TU`）；*dsh-client-modules*/README.zh.md:51 |
| 10 | host 半定义 Config 要不要加依赖 | 要 `import z from '@deepseek-ai/schemastery'`；第三方 bundle 先例是记 `devDependencies`、运行时由 host 解析 | **A（需同步改 verify.mjs 断言）** | 先例 `@rsrsai/dsh`/package.json + lib/index.js:2；解析实测见 §2.7 |

**一句话施工建议**：host 半在**根级 `cabinet-ui` 行**上声明全 volatile `Config`（`members` 小字段数组 + 5 个头像字段），`apply` 里注册一个全局 `systemPrompt.section`（text 提供者读 `config.*.get()`、用 `tryMembership` 决定是否为内阁会话、`interpolate:false`）；client 半在同一包内注册 `settings.section` 页读写**同一命名空间**（ns = 条目 id = `cabinet-ui`）。**不要**往 `preset-cabinet` 里再加同包条目（client bundle 会撞包名身份），也**不要**指望 preset 内嵌行能当配置宿主（非"可唯一定位"条目）。

---

## 1. 设置页分区注册契约（对应本仓新增「内阁成员」页）

### 1.1 槽类型是「规范契约」，由设置域底座拥有，而非外壳

`〈dsh-client-ui-settings〉/lib/types/client/contract/slots.d.ts:1-10` 明确：设置相关槽类型全部由 `ui-settings` 这一域底座声明，外壳（`ui-settings-general`，占 `sidebar.settings`）自身零文案。

`settings.section` 的声明（同文件 :62-77）：

```ts
'settings.section': {
    kind: 'list';
    scope: 'root';
    owner: SettingsSectionOwnerProps;
};
```

要点（同段 :63-71 注释）：
- 每个 `list` 项就是一个设置页；**注册方选项携带导航身份**：`id`（分区键，驱动 `only` 过滤）、`order`（导航位置）、`label`（注册方本地化文案；注册方在语言切换时重新注册，外壳不订阅 locale 状态）。
- 分区渲染在面板内容列内。

页面组件的 owner props 只有一个字段（:154-157）：

```ts
export interface SettingsSectionOwnerProps {
    /** Close the settings panel (the shell owns the open state). */
    close: () => void;
}
```

### 1.2 外壳如何消费（决定我们必须提供什么）

`〈dsh-client-ui-settings-general〉/lib/client.js`：
- :1146-1161 —— 导航行直接来自 `ctx.slots.entries("settings.section")`，取 `options.id / order / label`，经 `resolveSlotLabel(...)` 后按 `order` 升序；
- :337 —— 内容列 `renderSlot("settings.section", { close: onClose }, { only: active })`。

即：**`id` 必须唯一且稳定、`order` 决定位置、`label` 决定导航文案**；页面拿到 `close`。

### 1.3 注册的真实签名（官方实码，非伪代码）

`〈dsh-client-ui-settings-plugins〉/lib/client.js:201-207`（「插件」分区本体）：

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "plugins",
    order: 15,
    label: () => t("nav"),
    locale: NS,
    inject: sectionInjected,
    children: { "settings.plugins.tab": { kind: "list", scope: "root" } }
}, PluginsSettingsSection));
```

`〈dsh-client-ui-settings-models〉/lib/client.js:4485-4496`（「模型」分区）：

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "models",
    order: 10,
    label: () => t("nav"),
    inject: injected,           // () => ({ controller, hooks: { snapshot }, operations, schema, t })
    children: {
        "settings.models.provider-card": { kind: "keyed", scope: "root" },
        "settings.models.footer": { kind: "list", scope: "root" }
    }
}, ModelsSection));
```

注册选项集（由上述两处实码归纳，均为已发布用法）：`name`（必填，槽名）、`id`（list 键）、`order`、`label`（函数，注册方自带 `t`）、`locale`（本地化命名空间）、`inject`（注入面工厂）、`children`（子槽声明，可选）。

### 1.4 页面服务注入面：`inject` 工厂给出什么、组件怎么收

- `inject` 是**无参工厂**，返回值合并进组件 props。`〈dsh-client-ui-settings-plugins〉/lib/client.js:176` 的 `sectionInjected = () => ({ hooks: { tabs: {…} } })`；`〈dsh-client-ui-settings-agent-loop〉/lib/client.js:157-161` 返回 `{ hooks: { agentLoopCard: this.store }, ...this.form.actions() }`。
- `hooks` 里的键会被转成组件 prop：外壳实现为 `` `use${key[0]?.toUpperCase() ?? ""}${key.slice(1)}` ``（`dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 中 `function kI(e){return \`use${…}\`}`），所以 `hooks: { agentLoopCard }` → 组件里 `props.useAgentLoopCard(selector)`（*dsh-client-ui-settings-agent-loop*/lib/client.js:66）。
- 注册 `locale: NS` 后组件直接拿到 `t`（*dsh-client-ui-settings-plugins*/lib/client.js:37 `function PluginsSettingsSection({ t, renderSlot, useTabs })`，而其 `inject` 面里并没有 `t`）。
- 组件同时收到 §1.1 的 `close`。
- 客户端插件的服务依赖写在模块导出的 `inject` 数组：`〈dsh-client-ui-settings-agent-loop〉/lib/client.js:138-142` = `["slots","locale","configForms"]`。

### 1.5 本仓可直接施工的写法（配 `client.js` 现结构：`return { inject, apply }`，client.js:3071）

```js
// client.js —— 现状 const inject = ['slots','locale','sidebarRightTabs']（client.js:3010）
const inject = ['slots', 'locale', 'sidebarRightTabs', 'configForms'];
const SETTINGS_NS = 'cabinet-ui';        // = profile 根级 Loader 条目 id（见 §2.2）

function CabinetMembersSection({ t, close, useCabinetMembers, setMemberField, saveAvatars }) {
    // useCabinetMembers(selector) 来自 inject: () => ({ hooks: { cabinetMembers } })
    const state = useCabinetMembers((snapshot) => snapshot);
    // …
}

// apply(ctx) 内（client.js:3037 起）
ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'cabinet-members',
    order: 60,                 // 与官方 10/15/… 不冲突；数值越大越靠后
    label: () => t('settings.nav'),   // t 已在 client.js:3042 绑定：ctx.locale.bind('cabinet')
    locale: NS,                // NS = 'cabinet'（client.js:20）
    inject: () => ({
        hooks: { cabinetMembers: membersStore },   // 组件里 props.useCabinetMembers
        saveAvatars                       // 头像写入口（每成员一次 set）
    })
}, CabinetMembersSection)), 'cabinet-ui: settings section');
```

配套：`package.json` 的 `dsh.client.inject` 追加 `"@deepseek-ai/dsh-client-ui-settings"`（当前 4 项见 package.json:61-65），确保设置域底座先于本包加载。

### 1.6 三种"落位"的取舍（为何选 `settings.section`）

| 槽 | 形态 | 官方用例 | 适用 |
| --- | --- | --- | --- |
| `settings.section` | 顶层导航页 | models(:4485)、plugins(:201)、general(:1299) | **本需求选它**：成员配置是独立主题，需要整页表单 |
| `settings.plugins.tab` / `plugins.item` | 「插件」分区内的一页 / 一张卡 | settings-subagent:839、settings-shell:182、settings-web-search:510、agent-loop:158 | 配置某个**官方插件**的命名空间时用；本包不是被配置的官方插件 |
| `settings.general.item` | 「通用」里的一行开关 | ui-chat:13163、settings-session-log:159 | 只加一个开关时用 |

`settings.plugins.tab` 与 `plugins.item` 的路径与 `settings.section` 同级，均为 `ctx.slots.inject(槽名, () => ctx.slots.register({...}))`（实码同上表行号）。

---

## 2. 配置读写通道：从 schema 到磁盘

### 2.1 host 半最小样板（官方本体就是这么写的）

`〈dsh-client-ui-settings〉/lib/index.js:9-18`（全文 19 行，可直接抄骨架）：

```js
import z from "@deepseek-ai/schemastery";
const Config = z.object({ enabled: DeveloperToolsSettingsFields["enabled"].volatile() });

function apply(ctx) {
    ctx.inject(["settings"], (child) => {
        child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    });
}
export { Config, apply };
```

`configure({auto:false}, ctx.fiber)` 的语义（*dsh-settings*/README.zh.md:39）：**自带页面的插件**在可选 `ctx.inject(['settings'],…)` 子级里以 effect 注册，声明"本实例有自定义页，别自动生成"；策略不移除配置读写，业务插件不依赖 Settings 也能跑。

### 2.2 命名空间 = profile 根级 Loader 条目 id

- `describe()` 返回"Forms keyed by unique profile entry ids"（*dsh-settings*/lib/types/index.d.ts:92-96），`update(ns,…)` 的 `ns` 注释就是 "Profile entry id"（:98-102）。
- 实现处反查：`this.ownerContext.configEditor.entries().find((row) => row.options.id === ns)`（*dsh-settings*/lib/index.js:502）。
- 末端约束：`〈dsh-config-editor〉/README.zh.md:69`「**仅可编辑 profile 根 Include 拥有且可唯一定位的条目**」。

⇒ 本仓的配置宿主必须挂在 **`cordis.patch.yml` 里根级的 `cabinet-ui` 行**（cordis.patch.yml:184-186），命名空间字面量就是字符串 `"cabinet-ui"`。**preset 内嵌行不能当配置宿主**（不在 profile 根 Include 的可唯一定位集合内）。

### 2.3 `.volatile()` 是硬门槛，不是风格

写入链路的三个拒绝点（*dsh-settings*/lib/index.js:501-507）：

```js
const form = volatileForm(schema);
if (form === void 0) throw new Error(`Plugin entry "${ns}" has no volatile fields`);
for (const path of paths) if (path.length && !isVolatilePath(schema, path)) throw new Error(`Config field "${path.join(".")}" is not volatile`);
```

- `volatileForm` 的选取规则（*dsh-settings*/lib/types/schema.js:43-54）：节点自身 `meta.volatile` → 整棵子树成为可编辑表单；否则仅当 `type === 'object'` 时下钻收集 volatile 子字段；**数组/字典节点不标 volatile 就无法被部分编辑**。
- `isVolatilePath`（同文件 :78-84）：路径只要落在某个 volatile 祖先之下即放行，因此 `members[0].name` 这类深路径在 `members` 整体 volatile 时合法。
- 校验还要求写入的**非 volatile 分支保持原值**（*dsh-settings*/lib/index.js:512-520 的 `cloneJsonShaped` + `validatePaths`），否则抛 `Config field "x.y" is not volatile`。

volatile 数组/字典的官方先例（证明按需形态有据）：
- `〈dsh-llm-deepseek〉/lib/index.js:331` — `models: z.array(catalogModel).default(DEFAULT_MODELS).volatile()`
- `〈dsh-llm-pi-ai〉/lib/index.js:1083` — `providers: z.dict(profile).default({}).volatile()`

### 2.4 写入即生效：Loader 原地提交 volatile ref

`〈cordis-plugin-loader〉/lib/index.js`：
- :382-384 判定 `volatileOnly`（仅 `config` 变、其余全等、fiber 已激活）→ `fiber._config = this.options.config`，再 `_commitVolatile()`；
- :395-423 `_commitVolatile()`：`volatileEntries(fiber.config)` 取所有 ref，`resolveConfig` 校验候选值（:402，失败仅告警、ref 不变，:403-407），逐条 `updateVolatile(ref, source)`（:415），最后 `fiber.ctx.emit(self, "loader/volatile-update", paths)`（:422）。

⇒ 插件里 `config.members.get()` 这类读取**永远读当前值**，无需订阅、无需重挂载。官方读取先例：`〈dsh-bash-local〉/lib/index.js:52,90`（`config.timeoutMs.get()`）、`〈dsh-agent-loop〉/lib/index.js:553`（`ctx.agentLoop.config.maxParallelToolCalls.get()`）。

### 2.5 持久化落点与写入形状

- 文档位置：当前 profile 的 patch。`〈dsh-config-editor〉/README.zh.md:67`（写入目标）、:41（原子替换、保留替换值以外的 YAML 注释与 `!!js`）。
- 实机样本：`~/.dsh/profiles/web/cordis.patch.yml`（95 行，本机），同一文件里已有 `ui-theme` 的 `config.preference: dark`（:30-33）、`agent-preset-registry` 的 `selectedDefault: cabinet`（:34-38）、`llm-pi-ai` 的多 provider/模型表（:39-…）——即**这正是 ui-settings 的 `preference`、preset 的 `selectedDefault` 被写进去的地方**。
- 写入 API（host，*dsh-settings*/lib/types/index.d.ts）：`update(ns, patch, expectedRevision?)`（:102）、`replace(ns, section, expectedRevision?)`（:108）、`mutate(ns, ops, expectedRevision?)`（:114）、`writable`（:85）、`documentPath`（:87）、`prepareDocument()`（:91）；`SettingsPathOp = {op:'set',path,value} | {op:'unset',path}`（:53-60）。
- 冲突语义：`SettingsConflictError`（`code = "SETTINGS_CONFLICT"`，:31-44），stale revision 拒写而不是覆盖。

### 2.6 client 半：读、写、跟随

类型（*dsh-client-ui-settings*/lib/types/client/config-form.d.ts）：
- `ConfigForms.get<T>(entryId: string): ConfigForm<T>`（:133-137）
- `ConfigForms.describe(): SettingsDescribeFace`（:126-132）
- `ConfigForms.whileServed(namespaces, register)`（:147-151）
- `ConfigForm<T>`（*config-form-types.d.ts*:33-71）：`getSnapshot()`、`subscribe()`、`mutate(ops, expectedRevision?)`、`set(field, value)`、`unset(field)`；快照字段 `status/value/base/user/revision/writable`（:6-29），`user` 的**字段存在**才表示"用户覆盖"（:19-24）。

真实读写范例（*dsh-client-ui-chat*/lib/client.js:13151-13175）——最贴近本需求的一段：

```js
const chatSettings = ctx.configForms.get(CHAT_SETTINGS_NAMESPACE);           // :13151
const linkOpening = createSnapshotStore(chatSettings.getSnapshot().value?.linkOpening ?? "sidebar"); // :13152
ctx.effect(() => chatSettings.subscribe(() => { /* 接受值回灌本地 store */ }));  // :13153-13156
// 写：fire-and-forget，失败不回滚 UI
chatSettings.set("linkOpening", destination).catch((_error) => {});          // :13175
```

`whileServed` 只给"编辑**别人**命名空间"的页面用（*dsh-client-ui-settings*/README.zh.md:40，:44「功能页面注册 `settings.section` 贡献」）；本包的页面编辑自己的命名空间，**用 `ctx.configForms.get()` 即可，不需要 `whileServed`**（对照：settings-agent-loop:158、settings-shell:182、settings-subagent:839 都是编辑官方其它插件的命名空间才用 whileServed）。

### 2.7 体积与校验上限：能装 190KB，但代价在别处（**本卷重点结论**）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| settings 层有无字段/文档字节上限 | **无**。写入只做 volatile 路径与修订号与 schema 校验，无 bytes 常量 | *dsh-settings*/lib/index.js:501-530 全文；`grep -nE "maxBytes\|maxLength\|limit\|LIMIT" dsh-settings/lib/index.js` 唯一命中 :292 一句 JSDoc（"limits the read to own properties"，与体积无关）；同一 grep 在 *dsh-config-editor*/lib/index.js 零命中 |
| config-editor 有无大小限制 | **未发现**；它做的是"派生候选配置 → 锁 profile manifest → 原子替换覆盖项 → 失败回滚" | *dsh-config-editor*/README.zh.md:41 |
| RPC 传输层单帧上限 | **不是瓶颈**：`settings.mutate` 是 `@Remote` 装饰的普通方法（参数内联），网关 `new WebSocketServer({ noServer: true })` 未设 `maxPayload` → ws 8.22.1 默认 104857600 B（100 MiB） | *dsh-api-settings-controller*/lib/index.js:433-434；*dsh-api-gateway*/lib/index.js:300；`ws/lib/websocket-server.js:50,74` |
| 262144B 的 `streamInboxBytes` 是否卡我们 | **不卡**：它只约束"流式 uplink 缓冲"（超出 → `gateway/uplink-overflow`），settings 写入非流式 | *dsh-api-gateway*/lib/index.js:702（`DEFAULT_STREAM_INBOX_BYTES = 262144`）、:310（溢出判定）|
| 真正的代价 | ① `settings.describe()` **返回所有 namespace** 的脱敏全值，浏览器只有一面共享镜像（每次 `settings/document-updated` 与重连都刷新），任何设置页打开都会搬运全部头像；② 头像常驻 profile patch YAML，随每次改配置整份重写；③ 每次写都整份 config 校验 | *dsh-api-settings-controller*/README.zh.md:30；*dsh-client-ui-settings*/README.zh.md:64、:48；*dsh-config-editor*/README.zh.md:41；*dsh-settings*/lib/index.js:512 |
| 实测体积 | `src/avatars/*.png` 共 147,261 B；base64 后 5 张合计 **196,352 字符 ≈ 192KB**，单 JSON 数组约 197KB（见命令输出 §附录 A.2） | 本卷实测 |

**裁断口径（已由首辅定，本文按此写）**：
1. `members` 数组**只放小字段**（`name` / `prompt` / `role` 等，几 KB 级）；
2. 头像拆成 **5 个独立顶层 volatile 字段**（`avatarLead` / `avatarHanlin` / `avatarWorks` / `avatarDali` / `avatarYushi`），逐个 `set()` 各成一帧，任一张失败不回滚其它；
3. 上传归一 **96×96 PNG**，单张目标 **≤16KB**，**硬上限 48KB**（超出前端拒收，不依赖后端）。

对应的 Config 形状（真实 schemastery 用法，`z.array/z.dict(...).volatile()` 先例见 §2.3）：

```js
import z from '@deepseek-ai/schemastery';

const member = z.object({
    role: z.union([z.const('lead'), z.const('member')]).default('member'),
    name: z.string().default(''),        // 成员显示名（覆盖 roster 原名）
    prompt: z.string().default(''),      // 该成员的系统提示片段
});

const Config = z.object({
    members: z.array(member).default([]).volatile(),   // 小字段数组
    avatarLead:   z.string().default('').volatile(),   // data:image/png;base64,…（≤48KB 由前端把关）
    avatarHanlin: z.string().default('').volatile(),
    avatarWorks:  z.string().default('').volatile(),
    avatarDali:   z.string().default('').volatile(),
    avatarYushi:  z.string().default('').volatile()
});
```

客户端逐字段写（真实签名，`set` 只写顶层字段：*config-form-types.d.ts*:62）：

```js
const form = ctx.configForms.get('cabinet-ui');
await form.set('avatarHanlin', dataUrl96);                       // 单帧，≈8–16KB
await form.set('members', [{ role: 'lead', name: '首辅', prompt: '…' }, …]);  // 小字段整体替换
// 或只改一个成员的一个字段（原子、带修订栅栏）：
await form.mutate([{ op: 'set', path: ['members', 0, 'name'], value: '张首辅' }]);
```

> 校验节奏提醒：`set('members', ...)` 是整值替换；若页面是"暂存后一次保存"，请用一次 `mutate`（多 op 共享同一修订栅栏，*config-form-types.d.ts*:43-52），但**不要**把 5 张头像塞进同一次 `mutate`——那会把 192KB 变成一个请求体，失去拆字段的意义。

---

## 3. 运行时系统提示注入（把 persona 从静态 YAML 变成按用户配置）

### 3.1 注册 API（真实签名）

`〈dsh-system-prompt〉/lib/types/index.d.ts`：

```ts
section(section: PromptSection): () => void;                  // :250
context(context: PromptContext): () => void;                  // :269
tools(provider: (context: AssembleContext) => ToolProviderResult): () => void;  // :284
variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void;  // :293
getSectionOrder(name: PromptSectionOrderName): number;         // :256
assemble(context?: AssembleContext): Promise<PromptAssembly>;   // :314
```

`PromptSection`（:47-70）：`name`（唯一，重复注册抛错）、`order`（升序拼接，同序按名）、`text: string | ((context: AssembleContext) => string)`、`interpolate?: boolean`（默认 true）、`complete?: boolean`（作为**唯一**系统提示；多于一个生效会装配失败）。

排序锚点（:119-152）：`DEPLOYMENT_PERSONA_PREFIX = 0`、`PLAN_POLICY = 500`、`TEAM_POLICY = 600` … `DEPLOYMENT_PERSONA_SUFFIX = 10200`。人设段常量：`PERSONA_PREFIX_SECTION = "deployment:persona-prefix"`（:172）、`PERSONA_SUFFIX_SECTION`（:174）。

### 3.2 "每次装配求值"的硬证据

- 实现：`〈dsh-system-prompt〉/lib/index.js:253-256` `section(section)` 只做 finite 检查后把 section 挂进当前 scope 的 layer；
- 求值点：同文件 :187 与 :388 `text: typeof entry.text === "function" ? entry.text(context) : entry.text` —— **每次装配都调用提供者**；
- 全局插件先例（非 preset 内）：`〈dsh-harness-dev-context〉/lib/index.js:98-103`（`ctx.systemPrompt.section({name: HARNESS_SOURCE, order: ctx.systemPrompt.getSectionOrder("HARNESS_SOURCE"), interpolate: false, text: (context) => …})`）、:104-109（`context(...)`）；
- 空文本消失：*dsh-system-prompt*/README.zh.md:110「空文本不贡献任何 token」（渲染时空 section 被丢弃）。

### 3.3 成员身份的唯一权威来源

`〈dsh-experimental-tool-agent-team〉/lib/index.js:234-249` —— 本会话系统提示里 `You are the Team Lead named "lead".` / `You are teammate "<name>".` 两句话就是这里产出的：

```js
register(scoped.systemPrompt.section({ name: "team:policy", order: scoped.systemPrompt.getSectionOrder("TEAM_POLICY"), text: teamPolicy(config.interrupt) }));  // :234-238
register(scoped.systemPrompt.context({
    name: "team:identity", order: scoped.systemPrompt.getContextOrder("TEAM_IDENTITY"), required: true,
    text: () => {
        const { role, name } = ctx.agentTeams.membership(agent);   // :244
        return `${role === "lead" ? 'You are the Team Lead named "lead".' : `You are teammate "${name}".…`}`;  // :245-247
    }
}));
```

服务面（*dsh-experimental-agent-team*/lib/types/index.d.ts）：`membership(agent): TeamMembership`（:34）、`listMembers(agent): TeamMemberView[]`（:40）、`tryMembership(agent): TeamMembership | undefined`（:104，"非 Team 子 agent 返回 undefined"）。
装配上下文里能拿 agent：`declare module '@deepseek-ai/dsh-system-prompt' { interface AssembleContext { agent?: Agent } }`（*dsh-agent*/lib/types/runtime-types.d.ts:15-19）。

⇒ provider 内**必须用 `tryMembership`**，`undefined` 时返回空串；用 `membership` 会在非 Team 子 agent 上抛。

### 3.4 三种改造方案（优劣取舍）

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| **A（推荐）全局 section + 准入** | 根级 `cabinet-ui` 行注册 `ctx.systemPrompt.section({name:'cabinet:members', order: 100, interpolate:false, text: (c) => render(config, c)})`；`render` 用 `tryMembership(c.agent)` 判定内阁会话，否则 `''` | 不碰 preset 装配、不新增同包条目、配置就在本插件 `Config` 里（`.get()` 即读即新）；官方同构先例 dev-context:98-103 |
| B 变量 + 模板 | 注册 `ctx.systemPrompt.variable('cabinet_members', () => …)`，把 `cordis.patch.yml` 的 persona `prefix` 改成含 `{{cabinet_members}}` | 也可行（人设 prefix 是渲染期严格模板，变量提供者按装配求值，*dsh-system-prompt*/lib/types/index.d.ts:56-61 + *dsh-persona*/README.zh.md:49）；但 YAML 里多一处易被维护者误改的模板引用，且变量名 `[a-z][a-z0-9_]*` 受限 |
| C preset 内嵌行 | 往 `preset-cabinet.plugins` 再加一行 `dsh-cabinet-mode/preset` | **不建议**：同包两个 Active Loader source 解析到同一包名会让 client 模块组合失败（*dsh-client-modules*/README.zh.md:77「若不同的 active Loader source 解析到同一包名，组合会失败」）；且该行非"可唯一定位"条目、不能当配置宿主（§2.2） |

### 3.5 风险清单（必须写进实现注释）

1. **`interpolate` 默认 true**：成员 prompt 若含 `{{…}}`，渲染会**抛错**（严格解析，*dsh-system-prompt*/lib/types/index.d.ts:200-209）。⇒ 我们的 section 必须 `interpolate: false`（官方同款：dev-context:101、:107 都设了 false）。
2. **section 名作用域唯一**：同名重复注册抛错（:48-49、:243-249）。用带前缀名 `cabinet:members`。
3. **不要用 `complete: true`**：会抢占整份系统提示并让其它 complete 段装配失败（:64-69）。
4. **KV cache**：前缀内容变即失效（*dsh-persona*/README.zh.md:107）。成员 prompt 每次保存都会动前缀 → 属预期，但要写进 README 的"生效说明"。
5. **全局污染**：全局 section 会参与**每个** agent 的装配；准入判定（3.3）是唯一的隔离手段，禁止省略。
6. **空串语义**：空 section 渲染时消失，`''` 是安全的"不注入"表达（README.zh.md:110）。
7. **装配期成本**：provider 每次装配都跑，读 `config.x.get()` 是常数开销；**不要**在 provider 里做 I/O 或全量 `settings.describe()`。

---

## 4. `client.js` 的构建/内联事实

| 断言 | 证据 |
| --- | --- |
| 本包**没有构建步骤**，`client.js` 是手写、直接经 `window.__ModuleLoader__.load({id, factory(require)})` 暴露 | client.js:1-21（头注释：资料通道说明、`factory(require)` 结构、`require('react')` 来自浏览器模块表） |
| 打包发布时 `src/` 一起进包（供生成器与审计） | package.json:40-53 `files` 含 `"src"`；`npm pack --dry-run` 由 CI 跑（.github/workflows/ci.yml:44-60） |
| 五张头像**内联**在 `client.js` 的 avatars region，由 `src/build_avatars.py` 原地重写 | client.js:22（`// #region avatars — GENERATED …`）、:2079（`// #endregion avatars`）；src/build_avatars.py:3-7（输出三件事）、:36-37（`REGION_START/REGION_END` 常量） |
| `src/avatars.js` 是**生成产物**，不是入口 | src/avatars.js:1-4（`// GENERATED … do not edit by hand`） |
| 为什么必须内联 | src/build_avatars.py:11-15 注释：浏览器模块表只回答平台 seed、已物化模块与已注册包工厂（引 *dsh-client-modules*/lib/client.js:834-842），相对 require 不可用 |
| 官方 UI 包可 require（无需 external） | 外壳模块表字面量（`dsh-web-frontend/dist/assets/index-BXV-oxvX.js`）含 `"@deepseek-ai/dsh-client-ui-slots"`、`"@deepseek-ai/dsh-client-ui-primitives"`、`"@deepseek-ai/cordis"`、`"react"`、`"react-dom"`、`"zod"`、`"@deepseek-ai/dsh-client-store"`；语义见 *dsh-client-modules*/README.zh.md:51 |

⇒ **结论：新 UI 直接改 `client.js`**（avatars region 除外——那段只能由 `python3 src/build_avatars.py` 重写）。`src/avatars.js` 只服务生成器。

---

## 5. 成员显示名与头像的数据来源、覆盖点（按基线 `origin/main` 19e97a2）

### 5.1 数据来源（面板）

- 页面组件：`CabinetPanel({ sessionId, useSession, useSessions, useSessionStatus, t })`（本分支 client.js:2689；基线同构）。
- 成员列表来自 **session projection `agentTeam`**：本分支 client.js:2698-2708（`projections[leadSessionId]?.values?.agentTeam || …`）；运行态来自 `api-session/status`（本分支 :2702 注释、:2780 `statusOf/runningOf`）。
- 即：**name 是 roster 真实 spawn 名**，必须是映射/覆盖层，不能指望改名。

### 5.2 基线（origin/main 19e97a2）无配置态渲染路径 —— 供"字节级等价"取证

`git show origin/main:client.js`（3252 行）：

| 语义 | 行号 | 说明 |
| --- | --- | --- |
| 头像 dataURL 常量 | :23 `const AVATARS = {` | 内联 5 张 base64 |
| 键序 | :2385 `const AVATAR_KEYS = ['lead','hanlin','works','dali','yushi'];` | 顺序即匹配优先级 |
| 角色前缀表 | :2386 `const ROLE_PREFIXES = { lead:['首辅','内阁首辅'], hanlin:['翰林院','编修'], … }` | 中文别名 |
| 中性兜底 | :2388-2402 `neutralAvatar(name)` | 取首字生成 SVG dataURL |
| 派发 | :2403-2407 `avatarFor(name)` | `text.startsWith(key)` 或命中 ROLE_PREFIXES → `AVATARS[key]`；否则 `neutralAvatar` |
| 占位判定 | :2408-2411 `isPlaceholder(name)` | |
| 原生 roster 注入 | :2420+ `installTeamRosterAvatars()` | 结构匹配 `memberNameText/memberDot/memberText` 类后缀，失败静默降级 |
| 挂载点 | :3243 `try { return installTeamRosterAvatars(); }` | 在 `apply` 的 `ctx.effect` 内 |

### 5.3 覆盖点（施工时应改的恰好三处 + 一处）

| 覆盖点 | 位置（本分支） | 改法 |
| --- | --- | --- |
| 名字 → 衙门/头像键的别名表 | client.js:2168-2174 `BUREAUX`、:2178-2181 `ALIAS_INDEX`（最长别名优先）、:2182+ `bureauOf` | 改为「先查用户配置覆盖，再回落内置表」 |
| 显示名 | client.js:2201-2207 `displayName(name)` | 用户配置了 `name` 就直接返回它 |
| 头像 | client.js:2224-2228 `avatarFor(name)`（`AVATARS[bureau.key]`） | 先查 `config.avatar<Key>`（settings），为空回落 `AVATARS[key]` |
| 兜底占位 | client.js:2209-2223 `neutralAvatar` / :2229-2231 `isPlaceholder` | 保持不变（保证"陌生人不会被误认成首辅"的既有语义） |

注：`BUREAUX/displayName` 是 `feat/cabinet-panel` 的 f401874 引入的，**不在 origin/main 里**；PR 从 19e97a2 拉分支时不存在这三处，必须新写而不是"改"。

---

## 6. 本地验证手段

| 脚本 | 做什么 | 证据 |
| --- | --- | --- |
| `scripts/verify.mjs`（374 行） | ① 结构：package.json 字段、`dependencies` 必须为空、禁 `main/types`、无 DSH 版本门、无 `lib/` 构建产物；② patch 与 22 行插件表；③ README/CHANGELOG/工作流文案一致性；④ **组合检查**：隔离 `DSH_HOME=$(mktemp -d)` → `dsh --profile web --dump-config` → `dsh plugin --profile web add .` → 再 dump，断言 `preset-cabinet`/`cabinet-ui` 各一次、四个官方 preset 各一次、含「内阁模式」 | verify.mjs:105-107（依赖与 main/types）、:40-46（`EXPECTED_PLUGINS` 22 行）、:272-311（文档一致性）、:337-362（组合检查） |
| `scripts/test-client.mjs`（46 行） | 在 `node:vm` 里用桩 React 跑 `client.js`，把 `avatarFor/CabinetPanel/zh/en` 导出，断言"英文名与中文衙门名解析到同一头像"、未知/空名回落 SVG、以及两种语言的 stale 文案 | test-client.mjs:1-46 |
| `scripts/install.mjs`（295 行） | **Method B 回退安装器**：把 preset insert 写进 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`，默认 dry-run，`--apply` 才写；拒绝重复安装；备份 + SHA-256 校验；BEGIN/END 标记；失败自动恢复 | install.mjs:1-26（用法/安全策略）、:99-112（profile 内是否已装的判定） |
| `scripts/uninstall.mjs` / `test-install.mjs` | 卸载对应标记 / 安装器回归测试 | 文件存在（`ls scripts`） |

### 能否本地起 web 验证设置页

- **能，但必须用隔离 `DSH_HOME`，不要碰 live profile**：`dsh --profile web` 支持 `--port 0`（OS 分配）与 `--no-open`（`dsh web --help` 输出）；`verify.mjs:337-346` 已给出官方安全的"临时 HOME + plugin add . + dump-config"配方。
- **页面渲染的端到端验证目前未做**（标 **未验证**）。可预期的步骤（供工部）：`DSH_HOME=$(mktemp -d) && dsh --profile web --dump-config`（生成默认 profile 骨架）→ `DSH_HOME=… dsh plugin --profile web add /home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode` → `DSH_HOME=… dsh --profile web --port 0 --no-open` → 打开打印的 URL 看「设置 → 内阁成员」。
- 现装 profile 里的包是**拷贝而非软链**（`~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js` 与仓库同 md5 但 inode 不同），所以**改仓库不会自动生效**，必须重装；live web 实例（`http://127.0.0.1:3080`）的改动需重启，属 live 配置操作，须用户授权。
- **Dump-config 级别的自动断言可加**：`dsh --profile web --dump-config | grep -c "id: cabinet-ui"`，以及（新）`grep -c "id: cabinet-members"` 之类的 settings 命名空间串——但**设置页是否真的出现只能靠浏览器**，无 CSS/DOM 断言手段（**未验证**：未找到官方设置页的测试工具链；`dsh-client-test-runtime` 仅出现在各包 devDependencies 里，未随发行安装）。

---

## 7. 上游 PR 约定（`luodaoyi/dsh-cabinet-mode`）

| 项 | 事实 | 证据 |
| --- | --- | --- |
| 基线 | `origin/main` = `19e97a2` "Merge PR #2: Cabinet panel and validated v0.2.0 fixes"；`feat/cabinet-panel` 领先 3 个提交（faddbf8/76cc0e2/f401874），`fork/main` 与 origin/main 分叉 8 个提交 | `git log --oneline origin/main`、`git rev-list --count origin/main..feat/cabinet-panel` → 3 |
| 当前版本 | `package.json.version = 0.2.0`；CHANGELOG 顶节 `## [0.2.0] - 2026-11-05` | package.json:3；CHANGELOG.md:5 |
| CHANGELOG 规范 | `## [x.y.z] - YYYY-MM-DD` + `### Added / Changed / Fixed / Notes` 小节；**verify 要求存在当前 version 的段落**，否则 CI 红 | CHANGELOG.md:1-30；verify.mjs:307-311 |
| README 双语文案锚点 | `README.md` 必须含 `DSH-side constraints` 与 `no hard DSH version gate`；`README.zh.md` 必须含 `DSH 侧限制与说明`、`无 DSH 版本硬限制`；两者都必须含 `releases/download/v<version>/dsh-cabinet-mode-<version>.tgz` | verify.mjs:288-304（:294-301 具体字符串） |
| 版本号联动 | 改 `version` 就必须同步改两个 README 里的 release URL，并补 CHANGELOG 段（三处联动） | 同上 |
| 无 CONTRIBUTING | 仓库根无 `CONTRIBUTING.md`（只有 README/README.zh/CHANGELOG/LICENSE） | `ls` 输出；`find . -name CONTRIBUTING*` 无结果 |
| CI（PR 触发） | `node scripts/verify.mjs` → `node --check scripts/market-index.mjs` → `bash -n scripts/publish-market-index.sh` → `npm pack --dry-run` + 真正 `npm pack` + 校验 tarball 含 `package.json`/`cordis.patch.yml`/`icon.svg`/`scripts/market-index.mjs` | .github/workflows/ci.yml:6-60 |
| 发布 | 只由 tag `v*` 触发 `.github/workflows/release.yml`，走 npm Trusted Publishing（OIDC，无 token）；**npm 发布权在维护者，PR 不涉及** | release.yml:1-35；ci.yml:3-5 注释 |
| commit 风格 | 现状为 Conventional Commits 前缀 + 中文正文（`feat(ui):` / `fix(ui):` / `fix(ci):` / `docs:`） | `git log --oneline`（faddbf8…9866bef） |

⇒ 提 PR 时的必改清单：`cordis.patch.yml`（若新增行）、`client.js`、`index.js`、`package.json`（`dsh.client.inject` 与可能的 devDependencies）、`scripts/verify.mjs`（若新增行/依赖口径变化）、`README.md` + `README.zh.md`（新功能文案，双语文案锚点不可删）、`CHANGELOG.md`（新版本段）。

---

## 8. 施工约束与三大坑

### 8.1 硬约束（逐条可判定）

1. **配置只能挂在根级条目**：命名空间 = `cabinet-ui`（= cordis.patch.yml:184-186 的行 id）；preset 内嵌行不可编辑。
2. **每个字段必须 `.volatile()`**，非 volatile 路径写入被拒（*dsh-settings*/lib/index.js:505-507）。
3. **同一包不要出现两个 Active Loader 条目**（client 组合会因包名冲突失败，*dsh-client-modules*/README.zh.md:77）——所以 §3.4 的方案 C 排除。
4. **`interpolate: false`**（用户 prompt 可能含 `{{`）。
5. **`tryMembership` 而非 `membership`**。
6. **`dependencies` 必须保持为空**（verify.mjs:105-106）；`@deepseek-ai/schemastery` 记 `devDependencies`（先例 `@rsrsai/dsh`：package.json `devDependencies` 列全部 `@deepseek-ai/*`，而其 `lib/index.js:2` 运行时确实 `import z from '@deepseek-ai/schemastery'`）。本机实测解析成功：`node -e "require.resolve('@deepseek-ai/schemastery')"` → `/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/schemastery/lib/index.cjs`，其可达性来自 `~/.dsh/profiles/node_modules/@deepseek-ai/` 这层符号链接农场（`ls -la` 显示 `schemastery -> /var/opt/…/schemastery`）。
7. **verify.mjs 的三处联动**：`EXPECTED_PLUGINS`（:40-46，22 行，新增 preset 行必须同步）、README 双语锚点（:294-301）、CHANGELOG 段（:307-311）。**只允许新增精确断言，不得放宽或删除既有断言语义。**

### 8.2 工部最容易踩的三处坑

| 坑 | 现象 | 规避 |
| --- | --- | --- |
| **① 命名空间写错成包名** | `ctx.configForms.get('dsh-cabinet-mode')` 永远 `status: 'unavailable'`，页面空白且无报错（`unavailable` 是"该命名空间未暴露给本客户端"的正常态，*config-form-types.d.ts*:6-11） | 命名空间是 **profile 条目 id**（`cabinet-ui`），不是包名；先 `ctx.configForms.describe().getSnapshot().view?.namespaces.map(n=>n.ns)` 打印核对 |
| **② 头像一次性整写触发 192KB 单帧 + describe 膨胀** | 保存卡顿/超时、设置页每次打开都慢；排查时看到 patch YAML 里一行 40 万字符 | 5 个独立字段逐个 `set()`；前端 96×96 归一 + ≤48KB 硬拒；`members` 里绝不放 dataURL |
| **③ 全局 section 污染非内阁会话** | 用户跑 standard preset 时系统提示里出现内阁成员名单，且 persona 与 `team:identity` 冲突 | provider 首行 `const m = ctx.agentTeams.tryMembership(context.agent); if (!m) return ''`；`interpolate:false`；`order` 取 persona 之后、`PLAN_POLICY(500)` 之前的空位（如 100），绝不用 `complete: true` |

补充两个次级坑：
- **`configForms.get()` 在 `apply` 里同步调用**（官方都这么写，chat:13151），不要等组件渲染时再 `get`，否则多实例会各建表单（`get` 对同一 entry 返回同一 form，但重复 `dispose()` 会拆掉别人的订阅）。
- **`set()` 返回 Promise<boolean>**：`false` 表示 Host 拒绝（如 stale revision），**不是异常**（*config-form-types.d.ts*:62）；UI 必须处理 `false` 的重读，不能当成功。

---

## 9. 未验证清单（明确交付给下一环）

| # | 未验证项 | 原因 | 建议验证方式 |
| --- | --- | --- | --- |
| U1 | 单次 ~192KB 的 settings 写入端到端是否成功 | 只读约束，未实跑（仅代码判定无长度校验） | 临时 DSH_HOME 里用页面写一次 5 张原件，观察 patch 与 describe 往返耗时 |
| U2 | `settings.describe` 全量下发 192KB 对首屏/设置页打开的真实影响 | 同上 | DevTools Network/Performance 抓 `/api` 响应体大小 |
| U3 | 「设置 → 内阁成员」页面在本机 web 实例里真的出现且可保存 | 未起隔离实例、未改 live 实例 | §6 的隔离 DSH_HOME + `--port 0` 流程 |
| U4 | 新增 `systemPrompt.section` 后，内阁会话系统提示的实际字节差异 | 未注册过新 section | 都察院已定的探针：注册 `system-prompt/assemble` waterfall，抓完整 section 列表（需 web 临时实例；`dsh-headless` 在 preset 下拒绝运行 *dsh-headless*/lib/index.js:223） |
| U5 | 空 `avatar*` 字段时是否真的回落到内置 `AVATARS` | 依赖 §5.3 尚未实现 | 实现后加一条 `test-client.mjs` 断言 |
| U6 | `devDependencies` 是否会破坏 verify.mjs 现有断言（lead 已给两条退路） | 未跑 verify | 直接 `node scripts/verify.mjs`；若红则改 `peerDependencies` |
| U7 | init 阶段 `z.array(...).volatile()` 的默认值是否会被 settings 视为"用户覆盖" | 未实测 `user` 层的存在性语义 | 写后看 describe 的 `user` 字段（*config-form-types.d.ts*:19-24 说明"存在即覆盖"） |

---

## 附录 A：取证命令与输出

**A.1 版本与环境**

```
$ dsh --version
0.2.1-rc.5
$ node -v
v24.22.2
```

**A.2 头像体积**

```
$ for f in src/avatars/*.png; do stat -c%s "$f"; done
30516  27989  28175  30615  29966        # 合计 147261 B
# base64 后：40688 + 37320 + 37568 + 40820 + 39956 = 196352 字符 ≈ 192 KB
```

**A.3 基线差异**

```
$ git log --oneline -3 origin/main
19e97a2 Merge PR #2: Cabinet panel and validated v0.2.0 fixes
9866bef fix: preserve fallback installs and validate current cabinet bundle
ebb1c03 fix(ci): 避免重复应用同一补丁致 dump-config 出现两条 preset-cabinet
$ git rev-list --count origin/main..feat/cabinet-panel
3
$ md5sum client.js <(git show origin/main:client.js)
7aee481df29a24da3eeabe6a44c2743b  client.js
788d9840dbb19758ff822213b5c8af72  /dev/fd/63      # 与基线不同源
```

**A.4 已装副本 vs 仓库**

```
$ stat -c '%i %h %n' client.js ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js
10364775 1 client.js
10361126 1 /home/fslong/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js
$ md5sum 两者 → 相同（内容同、inode 不同 ⇒ 拷贝，改仓库不自动生效）
```

## 附录 B：证据行号总索引（按施工顺序）

| 环节 | 文件:行 |
| --- | --- |
| 槽契约 | *dsh-client-ui-settings*/lib/types/client/contract/slots.d.ts:63-77、154-157 |
| 分区注册范例 | *dsh-client-ui-settings-plugins*/lib/client.js:201-207；*dsh-client-ui-settings-models*/lib/client.js:4485-4496 |
| 外壳导航/挂载 | *dsh-client-ui-settings-general*/lib/client.js:1146-1161、:337 |
| hooks→useXxx | 外壳产物 `dsh-web-frontend/dist/assets/index-BXV-oxvX.js`（`function kI(e)`） |
| host 最小样板 | *dsh-client-ui-settings*/lib/index.js:9-18 |
| volatile 门槛 | *dsh-settings*/lib/index.js:501-507；lib/types/schema.js:43-54、78-84 |
| 原位提交 volatile | *cordis-plugin-loader*/lib/index.js:382-384、395-423 |
| 持久化位置 | *dsh-config-editor*/README.zh.md:41、67、69；实机 `~/.dsh/profiles/web/cordis.patch.yml` |
| host 写入 API | *dsh-settings*/lib/types/index.d.ts:53-60、85-114 |
| client 读写 API | *dsh-client-ui-settings*/lib/types/client/config-form.d.ts:104-152；config-form-types.d.ts:6-71 |
| client 真实读写 | *dsh-client-ui-chat*/lib/client.js:13151-13175 |
| 提示词注册 | *dsh-system-prompt*/lib/types/index.d.ts:47-70、119-152、172、250、269、293；lib/index.js:187、253-256、388 |
| 全局 section 先例 | *dsh-harness-dev-context*/lib/index.js:98-109 |
| 身份权威 | *dsh-experimental-tool-agent-team*/lib/index.js:234-249；*dsh-experimental-agent-team*/lib/types/index.d.ts:34、40、104；*dsh-agent*/lib/types/runtime-types.d.ts:15-19 |
| 空文本消失 | *dsh-system-prompt*/README.zh.md:110 |
| KV cache | *dsh-persona*/README.zh.md:107 |
| 客户端包名冲突 | *dsh-client-modules*/README.zh.md:77 |
| 共享模块表 | *dsh-client-modules*/README.zh.md:51 + 外壳产物模块表字面量 |
| 依赖先例 | `~/.dsh/profiles/web/node_modules/@rsrsai/dsh`：package.json（devDependencies）+ lib/index.js:2 |
| 本仓脚本 | scripts/verify.mjs:40-46、105-107、272-311、337-362；scripts/test-client.mjs:1-46；scripts/install.mjs:1-26 |
| 本仓 CI | .github/workflows/ci.yml:6-60；release.yml:1-35 |
| 本仓头像生成 | client.js:22-2079；src/build_avatars.py:3-15、50-51；src/avatars.js:1-4 |
| 本仓覆盖点 | client.js:2168-2181、2182+、2201-2207、2224-2231；基线 origin/main client.js:23、2385-2411、2420+、3243 |
