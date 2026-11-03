# 内阁模式（Cabinet Mode）· DeepSeek Harness 插件

[English](README.md) | 中文

<p align="center">
  <img src="docs/images/cabinet-portrait.jpg" width="200" alt="内阁模式图标来源：明代内阁首辅画像（已作为 bundle 图标 icon.svg 随包发布）"/>
</p>
<p align="center"><sub>图标：明代官员画像，由项目所有者提供（已作 <code>icon.svg</code> 随包发布）。</sub></p>

一个纯声明式 **DSH bundle**：给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加 **内阁模式**（`config.id: cabinet`）。安装本 bundle、重启 DSH，新建会话时在模式选择器里选「内阁模式」即可。

模式设定取自大明科研司·内阁：首辅（Lead）统摄，阁臣（成员）分曹——翰林院编修主调研、工部主事主执行、大理寺评事主核验、都察院御史主验收；默认只调研不改码，不编造数据来源。

本包**不含插件运行时 JavaScript**（无 `main`/`lib`）、无运行时依赖；仅随包提供可选的 Node.js 回退脚本（`scripts/*.mjs`）。它只声明一条 `@deepseek-ai/dsh-agent-preset`，并复用 DSH **标准模式**（Standard Mode）出厂的 22 行插件清单，因此工具与标准模式一致，仅 persona 不同。

本包声明 **无 DSH 版本硬限制**：没有 `engines.dsh`、没有 DSH `peerDependencies`、安装时不做版本检查。本机在 DSH **0.2.1-rc.3** 实测；其他提供声明式 preset 机制的 DSH 版本可尝试安装，但**未经验证**（见 [DSH 侧限制与说明](#dsh-侧限制与说明)）。

## 团队结构一览

![内阁团队结构](docs/images/cabinet-team.svg)

### 运行截图

真实运行截图（模式选择器、Agent 预设卡片、内阁会话实况）欢迎贡献——提 PR 或发给我们即可补进此处。上图是 persona 结构示意图，不是截图。

---

## 让 AI 帮你安装（复制下面这段提示词）

```text
请帮我安装 DeepSeek Harness 的「内阁模式」（Cabinet Mode）bundle。

1. 先运行 `dsh --version` 并告诉我版本。0.2.1-rc.3 是已实测参照；本包不声明
   DSH 版本硬限制，但其他版本未经验证。
2. 把 bundle 装进我的 DSH profile：
   dsh plugin --profile desktop add <dsh-cabinet-mode 仓库或 .tgz 的绝对路径>
   （也可用 GitHub Release 的 tgz URL 代替本地路径。）
   若 `dsh` CLI 不可用：打开 DSH 设置 → 插件 → 添加插件 → 选择「本地目录」，
   指向 dsh-cabinet-mode 仓库的绝对路径。
3. 运行 `dsh plugin --profile desktop list`，确认出现 dsh-cabinet-mode。
4. 不要同时把 cordis.patch.yml 追加到我的 profile patch：两种安装方式互斥，
   同时装会让 preset 重复而加载失败。
5. 安装完成后提醒我完全退出并重启 DSH；然后在新建任务时选择「内阁模式」
   （preset id: cabinet）。

任何一步失败请贴原始错误并停止，不要连续重试超过一次。
```

## 手动安装（3 行）

```sh
dsh plugin --profile desktop add https://github.com/luodaoyi/dsh-cabinet-mode/releases/download/v0.1.5/dsh-cabinet-mode-0.1.5.tgz
# 完全退出并重启 DeepSeek Harness
# 新建任务 -> 模式选择器 -> 内阁模式
```

本地目录安装：把上面的 tgz URL 换成仓库绝对路径即可。Windows 上 CLI 为 `dsh`（经 `dsh.cmd`），Linux/macOS 命令相同。

> **DSH 0.2.1-rc.5 桌面端实测（2026-10-31）：**
>
> - 桌面端自带的 `dsh` CLI 跑 `dsh plugin --profile desktop list/add ...` 正常
>   （exit 0）。首次使用可能要求先初始化 profile（提示「Open DeepSeek Harness
>   Desktop once … then fully quit it」），并可能等待 profile 锁最多 120 秒——
>   所以**安装/升级前先完全退出 DeepSeek Harness**。
> - 桌面 profile 真正被拒的是 `dsh --profile desktop --dump-config`
>   （"managed exclusively by the Electron application"）；组合校验请用 `web`
>   profile。
> - 备选：插件页（设置 → 插件 → 添加插件 → 本地目录 / tgz URL），或 DeepSeek
>   Harness 自带的 pnpm——装完确认 profile `package.json` 的
>   `dsh.profile.bundles` 里保留了 `dsh-cabinet-mode`：
>
> ```sh
> node "<DeepSeek Harness 安装目录>\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs" --dir "%USERPROFILE%\.dsh\profiles\desktop" add https://github.com/luodaoyi/dsh-cabinet-mode/releases/download/v0.1.5/dsh-cabinet-mode-0.1.5.tgz
> ```
>
> 操作前先备份该 profile 的 `package.json` / `pnpm-lock.yaml`。

## 从插件市场安装（索引源）

本 bundle 同时登记在一份由 npm registry 生成的 DeepSeek Harness 插件市场索引里，DSH 可直接安装与更新，无需 tgz URL 或本地目录：

```text
https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json
```

1. 在 DSH 打开**插件市场**，打开**索引源**列表，添加上面的 URL 并刷新。
2. 在市场列表中安装 **内阁模式 / Cabinet Mode**（`dsh-cabinet-mode`）。DSH 会把 `dsh-cabinet-mode@<版本>` 从 `https://registry.npmjs.org` 安装到当前 profile。这与方式 A 是同一种 bundle 安装，二者只能选其一。
3. **完全退出并重启 DeepSeek Harness**，然后新建任务，在模式选择器中选择**内阁模式**。
4. 以后更新：先在**已安装**页卸载旧版本，再从**插件市场**安装新版本，然后再次重启。市场对第三方插件**没有原地升级**——「有新版本」徽标点下去只是打开「已安装」页。

「可更新」如何判定：DSH 只比较 **SemVer 版本号**，同一版本号重新构建不会提示可更新（npm 版本不可变，npm 源不受影响）。**没有任何定时自动检查**：只有打开或刷新插件市场时才抓取索引，缓存 10 分钟。以上为 DSH 0.2.1-rc.5 源码级结论（行号见 [docs/cross-platform.md](docs/cross-platform.md) 第 7 节）；真实更新流程未做端到端实测。

索引在每次 tag 发布后由 npm registry 重新生成，只列出已发布、未弃用的稳定版本；不要手工编辑 `market-index` 分支。

> **发布状态（2026-11-03）：** `dsh-cabinet-mode@0.1.4` 已发布到 `registry.npmjs.org`——首版，由 tag 触发的 OIDC 流程发布，provenance 已上 sigstore——并且 `market-index` 分支已由它生成。registry 上另有占位版本 `0.0.0-stage`（预发布，索引不列）。首次 OIDC 发布、GitHub Release、`market-index` 分支、索引解析、按 npm spec 安装这五项已在处置本次发布时实测。
>
> **未验证：** 你所用 DSH 版本的插件市场界面文案与点击路径、该 GUI 里的真实安装/更新，以及 tag → 发布 → 自动刷新索引的全链路；0.1.5 是该链路第一次完整运行。上面的 `dsh-cabinet-mode@<版本>` 安装 spec 是格式 1 读取器（`@deepseek-ai/dsh-plugin-market-index@0.2.1-rc.5` 的 `marketInstallTarget`）对 npm 源返回的结果；该函数已在本机执行，界面未实测。

## 升级

若通过插件市场安装：刷新市场，先在**已安装**页卸载旧版本，再从**插件市场**安装新版本，然后重启——没有 tgz URL 要换，也没有一键更新。否则用同一条安装命令换新版本 URL（或在插件页选新 `.tgz`），然后完全退出并重启 DeepSeek Harness：

```sh
dsh plugin --profile desktop add https://github.com/luodaoyi/dsh-cabinet-mode/releases/download/v0.1.5/dsh-cabinet-mode-0.1.5.tgz
```

`dsh plugin --profile desktop list` 应显示新版本。升级已在 Windows 实测：
v0.1.0 → v0.1.1 走插件 CLI（DSH 0.2.1-rc.3）；v0.1.1 → v0.1.2 与
v0.1.2 → v0.1.3 走内嵌 pnpm（DSH 0.2.1-rc.5）。

---

## 你会得到什么

| | |
|---|---|
| 模式 | 内阁模式（**Cabinet Mode**），preset id `cabinet`，order 5 |
| 身份 | 同一段 persona 由首辅与所有阁臣共享：首辅（Lead）审题、拟旨拆解、分派、裁断、汇总、闭环；阁臣（翰林院编修/工部主事/大理寺评事/都察院御史）按衙门办事，禁止自称首辅。 |
| 默认姿态 | 默认只调研不改码；每条结论锚定路径、行号、命令输出或原文；不确定处标「未验证」；不编造数据来源。 |
| 工具 | 与 0.2.1-rc.3 实测参照的标准模式相同的 22 行插件（shell、文件系统、后台任务、定时、技能、目标、计划模式、压缩、委派/工作流、ask-user、todo、web、present）。 |
| 平台 | 跨平台：`tool-bash` 在 Linux/macOS 启用、`tool-pwsh` 在 Windows 启用，与标准模式一致；无绝对路径、无 shell 专用安装步骤、无构建步骤。 |
| 团队工具 | 九个 Agent Team 工具来自 `@deepseek-ai/dsh-experimental-agent-team-profile` 这个 profile bundle，不由本 preset 提供。若你的 DSH profile 未启用该 bundle，则没有 teammate 工具，但 persona 规则仍生效。 |

## 前置条件

- **带声明式 agent preset 的 DeepSeek Harness**。preset 声明以 0.2.1-rc.3 为组合
  参照；**真实安装/升级已在 Windows 桌面端用 DSH 0.2.1-rc.3 与 0.2.1-rc.5 实测**
  （本地目录、Release 资产 URL、内嵌 pnpm 三种途径；2026-10-29 与 2026-10-31）。
  本包**不声明 DSH 版本依赖、不做 DSH 版本硬限制**（没有 `engines.dsh`、没有 DSH
  `peerDependencies`）；其他带声明式 preset 机制的 DSH 版本可以尝试，但**未验证**。
  仍未实测：重启后的 UI（模式选择器 / 预设卡片 / 图标显示）与非 Windows 宿主。
- 其他 DSH 版本内置的标准模式插件集合可能不同。若声明加载失败，请按你所用版本的
  `presets/standard.patch.yml` 调整插件行（保留 `persona` 行及其配置，增删对应工具行；
  详见 [DSH 侧限制与说明](#dsh-侧限制与说明)）。
- Node.js **>= 20**，仅回退脚本（`scripts/*.mjs`）需要；推荐的插件安装方式不直接依赖 Node。
- 可选：启用 **Agent Teams**（智能体团队）获得完整首辅/阁臣流程。

## 安装方式（三平台矩阵）

| 方式 | Windows | Linux | macOS | 说明 |
|---|---|---|---|---|
| **A. DSH 插件管理器**（推荐）：插件页「添加插件 → 本地目录/包」，或 `dsh plugin --profile <profile> add <绝对路径 / .tgz / release URL>` | ✅ 2026-10-29 本机实测：本地目录安装与 **GitHub Release 资产 URL 安装**均成功；`dsh plugin --profile desktop list` = 3 packages；合成校验通过 | ⚙️ 代码级推断，**未在本机实测** | ⚙️ 代码级推断，**未在本机实测** | 纯 YAML bundle：无构建、无依赖、无 OS 专用代码。见 [docs/cross-platform.md](docs/cross-platform.md)。 |
| **B. 回退 node 脚本**（无插件管理器时）：`node scripts/install.mjs --profile <profile>` 演练后 `--apply`，写入 profile 的 `cordis.patch.yml` | ✅ 脚本已在 Windows 实测（演练 + 临时副本） | ⚙️ 代码级推断，**未实测** | ⚙️ 代码级推断，**未实测** | 三平台同一路径：`<DSH_HOME>/profiles/<profile>/cordis.patch.yml`。 |
| **插件市场**（索引源）：见 [从插件市场安装](#从插件市场安装索引源) | ❌ **GUI 安装未实测**（npm 与索引已于 2026-11-03 上线） | ❌ **未实测** | ❌ **未实测** | 通过 DSH 插件市场安装同一个 npm bundle；npm 发布与 `market-index` 分支均已存在。 |

**方式 A 与方式 B 二选一，不可叠加。** 两种方式都会声明 `config.id: cabinet`；同时装会让 preset id 重复，声明加载失败。切换前先卸载旧方式。插件市场安装的是与方式 A 相同的 bundle，同样受这条互斥约束。

### A. 作为 DSH bundle 安装（推荐，全平台）

1. 安装到你在用的 profile：
   - **插件页**：设置 → 插件 → 添加插件 → 本地目录/包，选择本仓库（或其 `.tgz`）。
   - **命令行**：`dsh plugin --profile desktop add <仓库绝对路径、.tgz 或 release URL>`
2. 确认：`dsh plugin --profile desktop list` 出现 `dsh-cabinet-mode`。
3. 完全退出并重启 DeepSeek Harness。
4. 新建任务，在模式选择器中选择 **内阁模式**。

本地目录安装与 GitHub Release 资产 URL 安装均已于 2026-10-29 在 Windows + DSH 0.2.1-rc.3 实测
（URL 安装约 2.4 s，`dsh plugin --profile desktop list` 报 3 packages）。

### B. 回退：写入 profile patch 层（无插件管理器时）

需要 Node.js >= 20。脚本跨平台，默认演练。

```sh
node scripts/install.mjs --profile desktop          # 演练：只打印计划，不写文件
node scripts/install.mjs --profile desktop --apply  # 备份 → 写入 → 写后自检
node scripts/verify.mjs                             # 仓库校验 + dsh 合成校验
# 完全退出并重启 DeepSeek Harness
```

脚本写入 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`（Windows 默认 `%USERPROFILE%\.dsh`，Linux/macOS 为 `~/.dsh`）。它会：拒绝在已装 bundle 的 profile 上重复安装；拒绝目标已含 `preset-cabinet`；写前备份（精确到秒 + 随机短后缀，避免覆盖旧备份）并校验 SHA-256；用 `BEGIN/END` 标记包裹 insert；目标为空/`[]`/仅注释时整文件替换（此时追加会产出非法 YAML）；写后结构自检失败自动从备份还原。

## 启用与验证

- **必须重启**：preset 声明在启动时加载，变更只影响之后创建的会话。
- 新建任务 → 模式选择器 → **内阁模式**（`cabinet`）。会话一旦产出内容，模式在会话生命周期内固定。
- 设置 → Agent 预设中应出现「内阁模式」卡片，配置查看为只读。
- 仓库校验：`node scripts/verify.mjs`，检查 package 字段、无 DSH 版本门禁、preset 声明、22 行插件清单、双身份 persona、跨平台 guard、README/docs 一致性，并在本机有 `dsh` 时运行
  `dsh --profile web --patch ./cordis.patch.yml --dump-config`，断言 exit 0、`preset-cabinet` 恰 1 条、出厂 4 个 preset 未减。DSH 版本只做信息性打印，不因版本不同而失败。

## DSH 侧限制与说明

本模式是 DSH 的 preset；DSH 自身的限制仍在。以下事实在本机 DSH 0.2.1-rc.3 已核，描述的是 DSH 行为，不是本 bundle 添加的限制。

- **无 DSH 版本硬限制。** 本包没有 `engines.dsh`、没有 DSH `peerDependencies`（0.1.1 起的既定产品决定，见 CHANGELOG），安装时也不做版本检查；已在 DSH **0.2.1-rc.3**（组合参照）与 **0.2.1-rc.5**（真实安装/升级，Windows 桌面端）实测，其他版本与多版本组合仍未实测。22 行插件清单取自 0.2.1-rc.3 出厂标准模式；若你的 DSH 版本内置插件集合不同（多/少行）导致声明无法加载，请按你版本的 `presets/standard.patch.yml` 调整 `cordis.patch.yml`：保留 `persona` 行及其配置，增删对应插件行，使清单与该版本一致。
- **Agent Team 上限**来自 profile 中的 `@deepseek-ai/dsh-experimental-agent-team-profile` bundle 配置（已核默认值，桌面 profile 设置）：`maxMembers: 8`、`maxTasks: 256`、`maxMessageBytes: 65536`、`disposalTimeoutMs: 5000`。deployment 默认 `maxMembers` 为 16，本机桌面 profile 设为 8。`maxMembers` 含失败的 teammate；单条 Team 消息 ≤ 64 KiB。
- **Team 工具依赖该 profile bundle。** 九个 Agent Team 工具（`spawn_teammate`、`send_message`、`list_agents`、`interrupt_agent`、`wait_agent`、`team_task_*` 等）仅在 profile 含 `@deepseek-ai/dsh-experimental-agent-team-profile` 时可用；否则内阁模式没有团队工具，persona 规则仍生效但无法实现首辅/阁臣分工。
- **权限/沙箱由 DSH 决定。** 沙箱与审批行为由 DSH permission preset 决定（本机 desktop profile 用户层为 `danger-full-access`）；本模式**不添加**任何沙箱限制，也不放宽 DSH 策略。
- **preset 是受信任配置。** 其插件可执行宿主代码；只安装来源可信的 preset。
- **无 OS 限制、无插件白名单、无需 npm 账号。** 纯平台无关 YAML，通过 GitHub Release tgz 与公开 npm 包分发；两种方式安装都不需要 npm 账号，也不需要插件白名单条目。
- **重启、会话锁定、Web 只读。** 安装/卸载需重启 DSH；会话一旦产出内容，模式在会话生命周期内锁定；Web 端只能选择模式并只读查看配置，不能编辑。

## 回退 / 卸载

| 安装方式 | 卸载命令 | 之后 |
|---|---|---|
| 方式 A（bundle） | `dsh plugin --profile desktop remove dsh-cabinet-mode` | 完全重启 DSH |
| 方式 B（node 脚本） | `node scripts/uninstall.mjs --profile desktop --apply` | 完全重启 DSH |

回退卸载脚本只删除自己写入的 `BEGIN/END` 标记块；遇到不是它写入的 `preset-cabinet`（bundle 或手工安装）会拒绝处理，请改用插件页卸载。两个脚本默认演练，加 `--apply` 才写。

## 发布（维护者）

推送版本 tag 会触发 `.github/workflows/release.yml`：校验工作树 → 打包 tarball → 用 **Trusted Publishing（OIDC）** 发布到 npm（不使用长期 npm token）→ 创建 GitHub Release → 刷新插件市场读取的 `market-index` 分支。

```sh
# package.json 版本与 CHANGELOG 对应章节都必须是 0.1.5
git tag v0.1.5
git push origin v0.1.5
```

npmjs.com 侧的一次性配置（维护者在网页上完成，无法从本仓库完成）。为该包添加 GitHub Actions trusted publisher：

- Organization or user：`luodaoyi`
- Repository：`dsh-cabinet-mode`
- Workflow filename：`release.yml`（只填文件名，含扩展名；文件必须保持在 `.github/workflows/release.yml`，且发布步骤留在该文件内）
- Environment name：留空，除非以后给发布 job 加 GitHub environment
- **Allowed actions：必须选上 `npm publish`。** 2026-09-03 之后创建的 trusted publisher 默认只有 `npm stage publish`；不显式允许时普通 `npm publish` 会被拒绝。

新建的 trusted publisher 配置必须在 **2 天内**完成首次成功发布，否则失效，只能删除重建。`package.json` 的 `repository.url` 必须与 GitHub 仓库精确匹配——本仓库已满足（`git+https://github.com/luodaoyi/dsh-cabinet-mode.git`）。

**首个版本需要一次性引导。** npm 不允许给尚不存在的包配置 trusted publisher（`npm trust` 要求 Package must exist，npm/cli#8544 仍未关闭）。`dsh-cabinet-mode` 已于 2026-11-03 用 `npm stage publish`（npm ≥ 11.15.0）引导：它公开了一个占位版本 `0.0.0-stage`，真实版本留在暂存区等待审批。占位版是预发布版，插件市场索引不会列出它。之后的版本不再需要引导：推 tag 即由工作流用 OIDC 发布。

以上 npm 侧事实来源为 npm 官方文档《Trusted publishing for npm packages》（https://docs.npmjs.com/trusted-publishers）；npmjs.com 当前界面布局本仓库**未验证**。Trusted Publishing 要求 npm CLI ≥ 11.5.1、Node ≥ 22.14.0——工作流使用 Node 24。`npm whoami` 不能用来检查 trusted publishing 权限（npm 文档明确说明），因此工作流不把它当前置检查。

若 npm 发布成功但索引 job 失败，手动运行 **Market index** 工作流刷新分支。

分支发布脚本是 `scripts/publish-market-index.sh`（`npm run market:publish` 也调用它）；它需要 `bash`，Git for Windows 自带。该脚本会切孤儿分支并改写工作树，**只能在无未提交改动的一次性 clone 里运行**——它遇到被修改或已暂存的已跟踪文件会拒绝执行，但未跟踪文件不受保护。

## 未实测项（不得冒充已验证）

- **多版本兼容**：DSH 0.2.1-rc.3（组合校验、插件 CLI 安装）与 0.2.1-rc.5（真实
  安装 + 升级，Windows 桌面端，2026-10-31）已实测；其他 DSH 版本与升级路径未验证。
- **重启后的 UI 与图标显示**——模式选择器、Agent 预设卡片、bundle 图标在任何
  机器上都尚未重启验证。
- **Linux / macOS** 上的真实 bundle 安装与重启后模式选择器（本机仅 Windows 实测，
  Linux/macOS 为代码级推断）。
- teammate 实测行为：被 spawn 的成员是否继承同一 persona 并真的按阁臣身份行事、不称首辅。
- DSH 升级后已装 bundle 或回退 patch 是否保留。
- `config.id` 语法校验规则（本 id 为 `cabinet`，仅小写字母）。
- preset 声明的 HMR 热生效、私有源/代理下的 tgz 安装。
- **npm Trusted Publishing 全流程与插件市场。** 发布工作流尚未运行过：还没有任何版本发布到 npm，`market-index` 分支尚不存在，真实的市场安装/更新也未执行。

## 已知限制

- preset **不是安全沙箱**：声明属于受信任配置，可执行宿主代码；安装前请审阅 bundle。
- 用户覆盖本 preset 时会替换整份插件清单，不会合并上游后续更新。
- 其他 DSH 版本内置的标准模式插件集合可能不同；这里的 22 行是 0.2.1-rc.3 参照，可能需要按版本适配（见 [DSH 侧限制与说明](#dsh-侧限制与说明)）。
- persona 由首辅与所有阁臣共享，只能依靠 Agent Team runtime context 的精确短语判身份
  （`You are the Team Lead named "lead".`、`You are teammate "<name>".`、`Your Team Lead is named "lead".`）；
  阁臣禁止自称首辅。
- persona 不得含 `{{cwd}}` 等未注册提示词变量；0.2.1-rc.3 会在首次模型请求前因组装失败报错。
- 团队流程依赖 Agent Teams profile bundle 已启用。

## 跨平台说明

详见 [docs/cross-platform.md](docs/cross-platform.md)：插件安装链、`!!js process.platform` guard、回退 patch 路径的代码级分析，以及「Windows 已实测 / Linux、macOS 为推断」的分界。分节：

- [结论矩阵](docs/cross-platform.md#结论矩阵)（平台 × 13 项，含实测程度列）
- [逐项论证](docs/cross-platform.md#逐项论证)
- [未在本机实测清单](docs/cross-platform.md#未在本机实测清单)
- [依据索引](docs/cross-platform.md#依据索引)

## 许可证

[MIT](LICENSE)
