> Historical contributor notes from PR #22 head e1f0058. These are not release acceptance evidence. Local file sources, version fallbacks and install-chain claims below are superseded by `pr22-install-validation.md`.

# 调研：配置页点击安装 respire/dsh 记忆插件的实现通道（task-8）

- 任务：task-8（翰林院编修，只读）
- 仓库：`cabinet-fork/dsh-cabinet-mode/`（工作区相对路径；`client.js`/`index.js` 均指该目录）
- 结论先行：
  1. **插件已装在本机**：真名 **`@rsrsai/dsh`，版本 0.1.13**，来源 `file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh`（本地目录），且已在 profile 的 `dsh.profile.bundles` 里（已启用）。npm 源上也有同版（npmmirror `dist-tags.latest = 0.1.13`，绕过代理 curl 200 实测）。
  2. **命令法（既证）**：`dsh plugin --profile <名> add <spec>`（plugin 子命令把余下参数原样转给 profile 目录的 pnpm）；`dsh plugin list` 会报 `required option '--profile <name>' not specified`。记忆 9c124ecd 另记：版本豁免 `dsh plugin allow-version 包@版 --dsh-version … --accept-risk`、add 成功自动写 bundles。
  3. **网络判定**：**走 npm 源必卡**——`npm view @rsrsai/dsh version` 退出 **124（超时挂死）**；`curl https://registry.npmmirror.com` 走 `https_proxy=127.0.0.1:12000` → **exit 7 连接拒绝**；**同一条 curl 绕过代理 env → HTTP 200**（网络本身通，死的只是代理）。宿主 `dsh web`(pid 9310) 继承同一批代理变量，故**从浏览器发起的 registry 安装同样会挂**。**本地目录 spec 免网络（代码级）**：`parseInstallSpec` 走 `kind:"path"`、`checkGithubConnection` 对非 git 直接 return、`namedSpecManifest` 对 path 直接读本地 `package.json`。
  4. **真一键通道存在，且无需改 host（index.js）**：官方插件页就是浏览器点装——`ctx.remote.pluginManager.inspect/installBundle/waitForInstall/setBundleEnabled`，宿主 `PluginManager extends TypertRemoteService`（`super(ctx,"pluginManager")`，`@Remote` 装饰）。cabinet 自己已有同机制先例（`remote.session.modelCatalog()`）。**差距只剩「本机代理 env 死」与「浏览器未实测」**。

---

## 1. 本机记忆插件现状（①）

### 1.1 profile 清单（`dsh plugin --profile web list` 原文输出）

```
Legend: production dependency, optional only, dev only

dsh-profile-web /home/fslong/.dsh/profiles/web (PRIVATE)
│
│   dependencies:
├── @fslong/dsh-dafeiyu@file:../../../Documents/vdsh/dsh-dafeiyu(@deepseek-ai/schemastery@3.18.5)
├── @rsrsai/dsh@file:../../../Documents/玩机/cabinet-fork/respire-dsh(@deepseek-ai/schemastery@3.18.5)
└── dsh-cabinet-mode@file:../../../Documents/玩机/cabinet-fork/dsh-cabinet-mode

3 packages
```

`~/.dsh/profiles/web/package.json` 关键段（路径相对 cwd 显示，原文件为绝对路径）：

```json
"dependencies": {
  "@fslong/dsh-dafeiyu": "file:/home/fslong/Documents/vdsh/dsh-dafeiyu",
  "@rsrsai/dsh": "file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh",
  "dsh-cabinet-mode": "file:/home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode"
},
"dsh": { "profile": { "bundles": [ "...", "@rsrsai/dsh", "dsh-cabinet-mode" ] } }
```

→ **插件真名 `@rsrsai/dsh`、来源=本地目录、已在 bundles（启用）**。

### 1.2 包本体（`cabinet-fork/respire-dsh/package.json`）

```
"name": "@rsrsai/dsh"，"version": "0.1.13"，
"description": "Native Respire memory plugin for DeepSeek Harness"，
"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" },
engines: "dsh": ">=0.2.1-rc.2 <0.3.0"   ← 本机 DSH 0.2.1-rc.5 落在区间内
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

### 1.3 npm 源是否也有（绕过死代理的只读查询）

```
$ env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY -u all_proxy -u ALL_PROXY \
    curl -sS https://registry.npmmirror.com/@rsrsai%2Fdsh | head -c 400
{"_id":"@rsrsai/dsh", ... "dist-tags":{"latest":"0.1.13"}, "name":"@rsrsai/dsh",
 "time":{"created":"2026-10-19T14:44:45.039Z","modified":"2026-11-07T11:37:22.940Z", ...}}
```

→ npm 源有此包，**latest = 0.1.13（与本地同版）**；本机 `~/.npmrc` `registry=https://registry.npmmirror.com`（另有一行 npmjs authToken，未触碰）。

---

## 2. add/install 确切语法与网络依赖（②）

### 2.1 语法（现场 help + 既证记忆）

```
$ dsh plugin --help
Usage: dsh plugin [options] [args...]
manage a profile's plugins by forwarding the remaining arguments to pnpm in the profile directory
Arguments:
  args              pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>, why <pkg>, ...)
Options:
  --profile <name>  the profile whose plugins to manage (initialized on first use)

$ dsh plugin list
error: required option '--profile <name>' not specified      ← list 也必须带 --profile
```

- 既证（记忆 `9c124ecd`，本轮 `rsrs show` 读回正文）：正确形如 **`dsh plugin --profile web add file:路径`**；顶层 `dsh --profile` 不存在（`too many arguments`）；版本豁免 `dsh plugin allow-version 包@版 --dsh-version 精确版 --accept-risk`；**add 成功自动把包名写进 `dsh.profile.bundles`**（与 §1.1 实况一致）。
- 本插件 engines 区间覆盖本机 DSH，**正常不需要豁免**（豁免只在版本越界时用）。

### 2.2 网络依赖：分 spec 判明（关键）

| spec 形态 | 网络 | 证据 |
|---|---|---|
| npm 包名 / http(s) registry（如 `@rsrsai/dsh`） | **必走网络 → 当前会卡死** | 见下「实测三条」 |
| 本地绝对路径 / `file:` / `link:`（本机现装形态） | **代码路径免网络** | `parseInstallSpec`（`dsh-plugin-manager/lib/index.js:73-90`）对绝对路径/`file:` 返回 `{kind:"path"}`；`checkGithubConnection`（`:1164-1166`）`if (spec.kind !== "git") return void 0`；`namedSpecManifest`（`:395-402`）`kind==="path"` 直接读本地 `package.json`，不发 `pnpm view` |
| git 仓库地址 | 走 GitHub → 也要网络 | `checkGithubConnection` 仅 kind==="git" 时执行（`:1164-1180`） |

**实测三条（只读查询，未装任何东西）**：

```
$ timeout 12 npm view @rsrsai/dsh version ; echo $?
124                                        ← 挂到超时（代理死）

$ npm config list | grep -i proxy
; no_proxy = "dimagent.cn,.cn,xiaomimimo.com,localhost,127.0.0.1,::1,[::1]"
; https_proxy = "http://127.0.0.1:12000/"
; HTTP_PROXY = "http://127.0.0.1:12000/"

$ timeout 8 curl -sS -o /dev/null -w 'http_code=%{http_code}\n' https://registry.npmmirror.com/@rsrsai%2Fdsh
curl: (7) Failed to connect to registry.npmmirror.com port 443 via 127.0.0.1 ... Could not connect to server
http_code=000 ; curl_exit=7

$ timeout 8 env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY -u all_proxy -u ALL_PROXY \
    curl -sS -o /dev/null -w 'http_code=%{http_code}\n' https://registry.npmmirror.com/@rsrsai%2Fdsh
http_code=200 ; curl_noproxy_exit=0
```

→ **结论：网络本身可达，死的只是 `127.0.0.1:12000` 代理**；而 `dsh web`（pid 9310，`/proc/9310/environ` 6 个 12000 变量，task-7 §4 已证）与其派生的 pnpm 子进程都继承它 → **凡从 CLI 或浏览器发起的 registry 安装，不设 `NO_PROXY`/不摘代理 env 就会挂**。
→ **本机现状其实不需要装**（§1 已装）；要「装」的场景是换机/重装/升级，那时 spec 用本地路径即可绕开网络。

---

## 3. client 点击 → 真安装的通道（③）

### 3.1 官方插件页就是「浏览器点装」，走 remote 命名空间

客户端（`dsh-client-ui-plugin-manager/lib/client.js`）：

- 注入清单 `:4360-4363`：`"remote"`, `"remote.pluginManager"`, `"remote.pluginInventory"`, `"remote.pluginRegistryProbe"`。
- 装前检查 `:1537`：`await this.ctx.remote.pluginManager.inspect(spec, { registry }, controller.signal)`（问题码映射在 `:174-178`，如 `installProblemInstalled`「该插件已安装」）。
- 发起安装 `:1595-1604`：
  ```js
  const result = await this.ctx.remote.pluginManager.installBundle(spec, {
      enabled: subject.selection ?? false, requestId, registry,
      ...saveExact === void 0 ? {} : { saveExact }, ...approvedBuilds === void 0 ? {} : { approvedBuilds: [...] }
  });
  ```
- 断线恢复 `:1616` `waitForInstall(requestId)`；取消 `:1733` `cancelInstall(requestId)`。
- 装完启用 `:1797` `await this.ctx.remote.pluginManager.setBundleEnabled(name, true)`（返回 `application: "applied" | "restart-required"`，`:1802`）。
- 进度事件 `:4387-4391`：`ctx.remote.$on("plugin-manager/changed" | "plugin-manager/install-log" | "plugin-manager/install-state", …)`。

宿主（`dsh-plugin-manager/lib/index.js`）：

- `class PluginManager extends TypertRemoteService`，`super(ctx, "pluginManager")`（`:1605`）；`installBundle`/`waitForInstall` 带 `@Remote` 装饰器（`:1414-1415`、`:1429-1430`、实现在 `:1970`/`:2111`），`inspect` 在 `:1820`。
- `installBundle` 内部（`:1970-2050`）：spec 校验 → `checkGithubConnection`（仅 git）→ 按 registry 顺序跑 **`this.runPnpm(["add", spec, …registryArguments(registry)], …)`** → 事件 `plugin-manager/install-state` 广播。
- 类型面：`types/index.d.ts:31-34` `interface Context { pluginManager: PluginManager }`，类注释「Persistent management of the current profile's composition and packages」。

**通道判定**：这是既有 WS remote 通道（`dsh-api-remote-access/lib/index.js:256` `const action = invocation.request.namespace + '/' + invocation.request.method;`），**任何 client 插件声明 `remote.pluginManager` 即可用**；官方插件页在用，机制与 cabinet 现用的 `remote.session` 完全同源。

### 3.2 cabinet 自己的同机制先例（第三方 client 调宿主 remote）

- `client.js:4200-4205`：`ctx.inject(['remote', 'remote.session'], scope => { … memberRemote = remote; … })`。
- `client.js:3896-3897`：`if (!memberRemote || typeof memberRemote.session?.modelCatalog !== 'function') throw …; const response = await memberRemote.session.modelCatalog();`
- 配置页组件 `CabinetMemberSettings` 就在用这个 remote 取模型目录（`:3885-3902`），即**设置区发起 host 调用已是既有形态**。

### 3.3 本地 HTTP/IPC 端点？——没有

- `grep -n "plugin" dsh-api-gateway/lib/index.js | grep -iE "route|path|install|post"` → **空**。
- `grep -n "install" dsh-host-webserver/lib/index.js` → 只命中注释「installs it ahead of the entry module」，**无安装端点**。
- → 浏览器侧唯一可行通道就是 **`ctx.remote.pluginManager.*`（WS remote）**；host 侧 `index.js` **不需要动**（cabinet host 只 `inject = ['systemPrompt','loader','sessionProjections']`，`index.js:528`）。

---

## 4. 两套方案（④，区分「真一键」与「引导式」）

> 现场基准：`client.js` 4280 行、HEAD `425dd48`（task-7 的同步已落地，工作区仅 4 个未跟踪 docs）。以下行号为**当前文件**行号。

### 方案 A（真一键安装，推荐；不改 host）

改动落点（仅 `client.js`）：

1. **注入通道**：`client.js:4200` `ctx.inject(['remote', 'remote.session'], …)` → 增 `'remote.pluginManager'`（或在 `apply` `:4191` 内另起一个 `ctx.inject(['remote.pluginManager'], …)`，照 `:4200` 同款守卫写法，服务缺失时静默降级）。
2. **UI 入口**：`CabinetMemberSettings`（`client.js:3878-4031`）根容器 `:4014` 的 children 里、保存/取消按钮 `:4027-4028` **之前**插入一张「记忆插件」卡：状态行（已装 0.1.13 / 未装）+ 按钮。
3. **交互逻辑**（新增小函数，放 `:4013` 附近）：
   - 装前 `remote.pluginManager.inspect(spec, {registry})` 判态（已装→显示版本并只留「重装」，映射 `installProblemInstalled`）；
   - 确认后 `installBundle(spec, { requestId, enabled: true })` → 订阅 `ctx.remote.$on('plugin-manager/install-state' | 'plugin-manager/install-log', …)` 显示进度 → `waitForInstall(requestId)` 收尾 → `setBundleEnabled(name, true)`（若回 `restart-required` 就明示需重启 DSH）。
4. **字典**：zh 键加在 `:4034`（`'member.save'` 旁），en 加在 `:4099` 旁，中英成对。
5. **spec 选值（关键）**：本机默认用**本地路径** `file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh`（免网络，§2.2）；跨机/换机场景才用 `@rsrsai/dsh`（必走网络）。

风险与未验证：
- **registry spec 在本机必挂**（§2.2 实测 124/exit 7）——方案须默认 path spec 或显式提示「需网络」；
- `setBundleEnabled` 可能返回 `restart-required`（官方 UI 同款语义，`:1802`），装完不重启不生效；
- 第三方 client 注入 `remote.pluginManager` 的**可用性未实测**（机制同源、官方在用，但本轮只读、未在浏览器点过）；
- path spec 的 `pnpm add` 是否**完全**免网络（依赖 `@deepseek-ai/schemastery@3.18.5` 若不在 store 仍会问 registry）**未验证**（只读纪律，未真装）；
- 路径写死在代码里，换机即失效——需 fallback 到 npm spec 或从设置读取。

### 方案 B（引导式安装，零风险兜底）

改动落点（仅 `client.js`，同 A 的 2、4 两处）：卡片改为**只读命令 + 复制按钮**（`navigator.clipboard.writeText`）+ 三行指引：

```
# 本机已装，换机/重装时在终端执行（profile: web）：
dsh plugin --profile web add file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh
# 或走 npm 源（需网络；本机代理 env 指向已死的 12000，先摘掉）：
dsh plugin --profile web add @rsrsai/dsh@0.1.13
# 装完会自动写入 dsh.profile.bundles（既证 9c124ecd），重启 DSH 生效
```

差距（明示）：**不是真一键**——用户要自己开终端粘贴执行；跨机路径不同；npm 分支在本机代理死前提下会失败（§2.2 实测）。
零代码替代：官方「设置 → 插件」页本身就是完整安装 UI（§3.1），引导文案可直接指路——本方案连按钮都可省。

---

## 5. 未验证清单

1. 第三方 client 注入 `remote.pluginManager` 并调用 `installBundle` 的**浏览器实测**（机制同源 + 官方在用，未点过）。
2. `file:` spec 的 `pnpm add` 是否完全免网络（依赖是否已在 store）——只读未装。
3. `setBundleEnabled` 返回 `restart-required` 后的实际生效链（重装+重启由用户执行，本轮未动）。
4. 死代理下 `dsh plugin --profile web add @rsrsai/dsh`（registry）是否同样挂死——仅证 npm/curl 两条，CLI 未实跑（避免触发安装）。
5. 本机已装 0.1.13 与 npm latest 是否完全一致（同号未逐字节比对）。
6. 官方插件页是否有可深链的 settings 路由（引导式若想「跳官方页」需另考，未查）。

## 6. 只读纪律

- 写入范围：仅新建 `docs/research-respire-install.md`。
- 未改 `client.js`、`index.js`、`cordis.patch.yml`、`scripts/`、`package.json`、`README*`、`CHANGELOG.md`、profile 文件与任何 DSH 配置；未安装/卸载任何插件；未启动或重启任何服务。
- 本轮网络动作仅 4 次只读查询（`npm view`×1 超时、`curl`×3，其中 2 次绕代理），无写入。
- 现场：`git status --porcelain` 仅 4 个未跟踪 docs；HEAD `425dd48`。
