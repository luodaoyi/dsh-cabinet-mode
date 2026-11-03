# 跨平台兼容性（Windows / Linux / macOS）

> 基线：DeepSeek Harness 0.2.1-rc.3（Desktop 安装包，**实测参照，不是版本限制**）。本包不声明 DSH 版本门禁：`package.json` 无 `engines.dsh`、无 DSH `peerDependencies`（0.1.1 起的既定产品决定，见 CHANGELOG），`scripts/verify.mjs` 的 DSH 版本检查仅为信息性 WARN，不因版本不同而失败；其他带声明式 preset 机制的 DSH 版本可尝试，但**未做多版本实测**。本机仅有 Windows，**下文 Linux/macOS 结论均为代码级论证，未在本机实测**，逐条标注「实测/代码级推断」。
> 本文只讨论本插件（纯 YAML bundle：`package.json` + `cordis.patch.yml`）与 DSH 宿主安装链；不修改仓库其它文件。
> 证据约定：`P = dsh/node_modules/@deepseek-ai/` 为 app.asar 内路径（全文 `P/...:行号`）；本机复核用 `<work-dir>/_work/asar-read.js`（`cat/list` 读取 app.asar 内文件）。实跑命令以 `>` 标注。

## 结论矩阵

| # | 项目 | Windows | Linux | macOS | 证据 | 实测程度 |
|---|---|---|---|---|---|---|
| 1 | 插件本体（纯 YAML bundle，零原生依赖） | 同一份产物 / 实测组合校验通过 | 同 | 同 | 本仓库 `package.json:39-43`（`dsh.bundle.patch`）、`cordis.patch.yml`；DSH 侧 bundle 加载只读 YAML（`P/dsh-app-boot/lib/index.js:488-497`） | Windows 实跑 `dsh --profile web --patch <本仓库 cordis.patch.yml> --dump-config` → exit 0（66794 字节，含 `preset-cabinet`/`内阁模式`）；Linux/macOS 同命令未实测 |
| 2 | `dsh plugin add` 的 pnpm 来源（Desktop 载体） | 安装包自带 pnpm 11.28.5 | 同机制，按平台运行时载荷 | 同 | `P/dsh-desktop-host/lib/cli.js:94-107`；本机 `<DSH_INSTALL>/resources/runtime/primary-runtime/dependencies/pnpm/package.json` = 11.28.5 | Windows 实跑 `list`/`add --help` exit 0；Linux/macOS 代码级 |
| 3 | `dsh plugin add` 的 pnpm 来源（通用 CLI） | PATH 中的 `pnpm` | PATH 中的 `pnpm` | PATH 中的 `pnpm` | `P/dsh/lib/plugin-BiveYA7h.js:63-94`（exit 127 提示装 pnpm）；`P/dsh-plugin-manager/README.zh.md:81`（`pnpmCommand` 默认 `pnpm`，经 PATH 解析） | 代码级 |
| 4 | 路径分隔符 / PATH 拼接 | `;`（`node:path.delimiter`） | `:` | `:` | `P/dsh-desktop-host/lib/cli.js:2,104` | Windows 实跑正常；POSIX 代码级 |
| 5 | Harness 家目录 | `%USERPROFILE%\.dsh`（`homedir()`） | `$HOME/.dsh` | `$HOME/.dsh` | `P/dsh-home-paths/lib/index.js:11,15,55-57,70-73` | Windows 实跑（本机 profile 在 `<DSH_HOME>`）；POSIX 代码级 |
| 6 | profile 目录与用户 patch 文件 | `$DSH_HOME\profiles\<name>\cordis.patch.yml` | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 同 Linux | `P/dsh-app-boot/lib/index.js:488-497,507-509` | Windows 实跑（`<DSH_HOME>/profiles/desktop/cordis.patch.yml` 存在）；POSIX 代码级 |
| 7 | preset 内 `tool-bash` / `tool-pwsh` 启用 | pwsh 启用，bash 禁用 | bash 启用，pwsh 禁用 | bash 启用，pwsh 禁用 | `P/dsh-web-app/presets/standard.patch.yml:21-26`；宿主执行器同规则 `P/dsh-base/cordis.patch.yml:249-257` | Windows 实跑（本会话为 pwsh 工具）；Linux/macOS 代码级 |
| 8 | persona / 技能 / 上下文平台假设 | 无 | 无 | 无 | `P/dsh-system-prompt/README.zh.md:72,78`；`P/dsh-web-app/presets/standard.patch.yml:11-14` | 代码级（Windows 实跑未见异常） |
| 9 | 直装回退：向 `cordis.patch.yml` 追加 `insert` | 支持 | 支持 | 支持 | `P/dsh-app-boot/lib/index.js:61-101,488-497` | Windows 已用 `--patch` 等价路径实跑 exit 0；POSIX 代码级 |
| 10 | 安装后生效 | 重启 Host → 新会话可选 | 同 | 同 | `P/dsh-plugin-manager/README.zh.md:14,73`；`P/dsh-plugin-manager/lib/index.js:2381` | Windows 已实测真实 `add`（2026-10-29，本地目录与 Release 资产 URL；`dsh plugin --profile desktop list` = 3 packages、bundles 写入）；重启后新会话出现模式未实测，后段代码级 |
| 11 | 是否需要 postinstall / build | 否（纯 YAML） | 否 | 否 | `P/dsh-plugin-manager/lib/types/build-approval.js:1,7-10`；README.zh:64 | 代码级 |
| 12 | GitHub Release `.tgz` 直接安装 | 实测可用（Release 资产 URL 直装，2026-10-29） | 同 | 同 | `P/dsh-plugin-manager/lib/types/install-spec.js:16-17,62-76`；`pnpm add <tarball url>`（本机 `dsh plugin ... add --help` 实跑输出含 `<tarball url>`） | Windows 实测 + pnpm 帮助实测；Linux/macOS 代码级 |
| 13 | npm 发布与插件市场索引 | `release.yml` 走 OIDC Trusted Publishing（v0.1.4/v0.1.5 已实跑） | 同 | 同 | `.github/workflows/release.yml`、`scripts/market-index.mjs`；npm 官方文档 Trusted publishing；`@deepseek-ai/dsh-plugin-market-index@0.2.1-rc.5` `lib/index.js:32-36,209-225,280-318` | v0.1.4 OIDC 发布、GitHub Release 与 `market-index` 分支已实跑；v0.1.5 的全链路（tag → 发布 → 自动刷新索引）已成功（run 41657224370） |

> 附加（不属于平台列）：本包不声明 DSH 版本门禁（`package.json` 无 `engines.dsh`/DSH `peerDependencies`，`scripts/verify.mjs` 版本检查仅信息性 WARN）；本文所有结论以 DSH 0.2.1-rc.3 实测为参照，其他 DSH 版本若内置插件集合不同，需按该版本 `presets/standard.patch.yml` 调整插件行——**未做多版本实测**。

## 逐项论证

### 1. 安装链是否跨平台

**Desktop 载体（Windows/macOS/Linux 桌面端）**：`dsh` 命令入口为 `P0\runtime\cli\bin\dsh.cmd:4`（Windows；POSIX 对应 `runtime\cli\bin\dsh`），最终执行 `app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js`。该文件 `:94-107`：

```js
async function runDesktopCli(runtimeDir, supportDir) {
  installOfficeEngineResolution(runtimeDir);
  await runCli({
    manageDesktopProfile: true,
    packageManager: {
      command: process.execPath,
      args: ["--expose-internals", join(supportDir, "primary-runtime", "dependencies", "pnpm", "bin", "pnpm.mjs")],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: `${join(supportDir, "bin")}${delimiter}${process.env.PATH ?? ""}`
      }
    }
  });
}
```

- pnpm **不依赖系统 PATH**：Desktop 用自带 `pnpm.mjs`（本机实测 `resources\runtime\primary-runtime\dependencies\pnpm\package.json` 版本 11.28.5，含 `bin/pnpm.mjs`、`bin/pnpm.cjs`），由安装包自带的 Node/Electron 执行。
- `PATH` 拼接用 `node:path` 的 `delimiter`（`:2` 导入、`:104` 使用），Windows 得 `;`、POSIX 得 `:`，无手写分隔符。
- `manageDesktopProfile: true`（`:97`）是 Desktop 专用放行：普通 CLI 在 `P/dsh/lib/bin.js:35-37,119` 默认拒绝 `desktop` profile，Desktop 载体才允许管理其保留 profile。
- Windows 专用代码只有 `:61-83` 的 `kernel32.dll` 控制台信号处理（koffi），且在 `:110-113` 用 `process.platform === "win32"` 守卫；Linux/macOS 不会加载该路径，不构成跨平台阻塞。
- 运行时载荷按平台整包交付（`resources\runtime\primary-runtime\dependencies\{node,pnpm,python}`；`runtime\bin\node` 在 Windows 为 `.cmd` 伴随文件）。Linux/macOS 安装包的载荷为对应平台版本——**代码级推断，未在本机实测**。

**通用 CLI（npm 安装的 dsh）**：`P/dsh/lib/bin.js:22-23` 明示「`plugin` 管理 profile 的插件依赖，转发给 pnpm」；`:115-127` 是 `plugin` 子命令（`passThroughOptions`，`--profile` 必填，无参数则报错 "plugin needs pnpm arguments to forward"）；`:234-236` 交给 `runPlugin`。`P/dsh/lib/plugin-BiveYA7h.js:63-94`：`cwd: process.cwd()`（`:78`，调用目录）、展开 `...packageManager`（`:81`，通用 CLI 无此对象 → `pnpmCommand` 默认 `pnpm` 走 PATH）、`runProfilePnpm(context, args, options)`（`:92`）、退出码 127 时提示 "pnpm was not found; install pnpm and make it available on PATH"（`:94`）。
安装链里的平台分支仅两处：`P/dsh/lib/bin.js:164`（诊断里的 `platform` 字段）与 `P/dsh-plugin-manager/lib/index.js:162,178`（POSIX 进程组 vs Windows 的 run-tree 清理）。**没有 Windows 专有依赖**。

**路径与家目录**：`P/dsh-home-paths/lib/index.js:56` `defaultDshHome() = join(homedir(), ".dsh")`；`:15` 支持 `DSH_HOME` 覆盖；`:70-73` `expandHomePath` 同时接受 `~`、`~/`、`~\`；`:84-85` 解析优先级 显式路径 > 环境变量 > 默认。全部用 `node:path` 的 `join/resolve`，无字符串拼分隔符。插件安装同样：`P/dsh-plugin-manager/lib/index.js:300-304` 的 `anchorPathSpec` 只把相对路径锚到调用目录（`resolve(cwd, …)`），`:139` 对记录的 `~` 依赖用 `homedir()` 展开。

### 2. preset 声明的平台行为

出厂标准模式（`P/dsh-web-app/presets/standard.patch.yml:21-26`，逐字）：

```yaml
          - id: tool-bash
            name: '@deepseek-ai/dsh-tool-bash'
            disabled: !!js process.platform === 'win32'
          - id: tool-pwsh
            name: '@deepseek-ai/dsh-tool-pwsh'
            disabled: !!js process.platform !== 'win32'
```

- Windows（`process.platform === 'win32'`）：`tool-bash` 禁用、`tool-pwsh` 启用。
- Linux/macOS（`'linux'`/`'darwin'`）：`tool-bash` 启用、`tool-pwsh` 禁用。
- 宿主执行器层同规则：`P/dsh-base/cordis.patch.yml:249-257` 中 `bash-sandbox` 在 win32 禁用、`pwsh-sandbox` 在非 win32 禁用；`:281-287` 的宿主 `tool-bash`/`tool-pwsh` 也按平台门控（这些宿主行随后被 `P/dsh-web-app/cordis.patch.yml:482-489` 置 `disabled: true`，把工具所有权交给预设——因此**预设内的两行就是最终判据**）。
- 本机实跑：Windows 会话中可用工具为 `pwsh`（DSH 工具集），与上述条件一致。Linux/macOS 未实跑。
- 残余风险：Linux/macOS 的 bash 工具依赖系统存在 bash（macOS 自带 `/bin/bash` 3.2；常见发行版有 bash；Alpine 等极简镜像无 bash 的情形**未验证**）。插件包本身不携带任何 shell 二进制。

### 3. persona / 技能 / 上下文无平台假设

- 模板变量只可引用**已注册变量**：系统提示循环注册 `{{provider}}` 与 `{{model}}`，插件可注册自己的事实（`P/dsh-system-prompt/README.zh.md:72`）。
- **禁止 `{{cwd}}`**：循环不注册它，无法解析的引用会在**任何模型请求之前**使提示词组装失败；rc.3 明文要求移除 `Your working directory is {{cwd}}.`（`:78`）。
- 工作目录由 working-directory 服务以**必需上下文**提供（`:78`），不写进 persona；因此同一份 persona 在 Windows 的 `C:\...` 与 POSIX 的 `/...` 下都成立。
- 不要在 persona/技能文本里硬编码 `C:\`、`/`、`cmd`、`pwsh`、`bash` 等平台假设；需要平台事实时用运行时上下文（context provider）或工具说明，不用模板变量。

### 4. 直装回退路径与脚本注意点

**同构性**：profile = `$DSH_HOME/profiles/<name>/`，固定包含 `package.json`（`dsh.profile.bundles` 有序列表）与 `cordis.patch.yml`（用户 patch 层，在全部 bundle 层之后应用）（`P/dsh-app-boot/lib/index.js:488-497`）；常量 `PROFILES_DIR = "profiles"`、`PROFILE_PATCH_FILENAME = "cordis.patch.yml"`（`:507-509`）；patch 语义是顶层数组，支持 `insert` 与按 `id` 覆盖（`:61-101`）。`P/dsh-app-boot/lib/index.js:5` 还从 `node:path` 引入 `win32` 并在 `:2090` 用它判断 Windows 绝对路径（icon 字段），说明该层显式兼容两种路径风格。
应用顺序（`P/dsh/README.zh.md:42-46`）：各 bundle 的 patch → profile 自身 `cordis.patch.yml` → home 级 `$DSH_HOME/cordis.patch.yml` → 启动器 `--patch` 层。
`DSH_HOME` 覆盖与 `~` 展开见 `P/dsh-home-paths/lib/index.js:15,70-73,84-85`；Windows 下 `~\` 亦被接受（`:72`）。

**仓库脚本现状（代码级复核，已达标）**：`scripts/install.mjs:31-36,62-63,103,173` 用 `fileURLToPath(new URL(...))` 定位补丁、`homedir()`+`DSH_HOME` 定位 home、`join()` 拼 profile 路径；`scripts/uninstall.mjs:24,52-53,106`；`scripts/verify.mjs:23-28` 同模式。未发现手写 `\`/`/` 分隔符或绝对平台路径。以下为对后续改动的约定（非缺陷清单）：
1. ESM 取脚本目录：`const here = dirname(fileURLToPath(import.meta.url))`；ESM 无 `__dirname`。
2. 路径一律 `join/resolve`，禁止字符串拼 `"\\"` 或 `"/"`；打印给用户时用 `path.normalize` 结果。
3. 判断绝对路径用 `isAbsolute`（POSIX 与 Windows 规则不同）；不要把 `drive:`、UNC 写死。
4. 与 URL 互转用 `pathToFileURL` / `fileURLToPath`，不要手拼 `file://`。
5. 定位 DSH home：`process.env.DSH_HOME` 优先，否则 `join(homedir(), ".dsh")`（与宿主一致，见上）。
6. 改 `PATH` 时用 `delimiter` 拼接（`node:path`）。
7. 仅 POSIX 需要 `chmod`；Windows 忽略，脚本里用 `process.platform` 守卫并保证失败不致命。
8. 子进程信号差异：Windows 强杀以 `exit 1` 结算、无 signal 标记，不要把 "killed" 当唯一失败判据（DSH 自己的 pwsh README 亦如此说明：`P/dsh-tool-pwsh/README.zh.md:100`）。
9. 文本文件统一写 `\n`（YAML/JSON 无 BOM）；可选 `.gitattributes` 固定 LF。
10. 若脚本要改 profile 文件：宿主对 profile 有写锁（`lockWaitMs` 默认 120000，见 `P/dsh-plugin-manager/README.zh.md:87`），改前确认 Host 已退出或改的是非运行 profile，避免与安装操作并发。

### 5. 安装后生效链

1. **安装写入**：`P/dsh-plugin-manager/lib/index.js:322-351` `reconcile()`——新依赖若声明 `dsh.bundle`（`:313,335-337`），读取其 patch 文件（`bundlePatchPaths`，`:339`），追加进 `dsh.profile.bundles`（`:340,343-350` 原子写 `package.json`）。未声明 `dsh.bundle` 的包只警告 "installed as a plain dependency, not a profile layer"（`:336`）。
2. **重启**：默认无 HMR 时，运行中的组合保留到重启（`P/dsh-plugin-manager/README.zh.md:14`）；仅启动型 profile 报告 `restart-required`（`:73`；`lib/index.js:2381`）。启用 `dsh-hmr` 时配置变化可热生效（README:14；`P/dsh/README.zh.md:37`）。对 preset 声明，注册表启动时即建 scope（`P/dsh-agent-preset-registry/README.zh.md:56`），**保守做法：重启 Host**。
3. **新会话**：选取器/设置页读取声明 roster；声明健康即出现，失败仍可见并带原因（`P/dsh-client-ui-agent-preset/README.zh.md:28`；registry README.zh:12,60）。已创建会话保留原组合。
4. **postinstall / build**：本包纯 YAML，无 `scripts`（无 install/postinstall/prepare），不触发 pnpm 11 的构建脚本拦截；即使未来加 JS 构建，pnpm 11 也会拦下并要求在对话中明确批准（`P/dsh-plugin-manager/lib/types/build-approval.js:1,7-10`；README.zh:64）。**默认安装无需审批构建**。
5. **失败回滚**：安装失败会恢复 `package.json` 与 `pnpm-lock.yaml`（`lib/index.js:553-560,742-757`）；manifest 写入用原子写（`:319-321`）。

### 6. 发布与分享条件

- **GitHub Release `.tgz`**：`P/dsh-plugin-manager/lib/types/install-spec.js:16-17` 定义 tarball 形态 `\.(?:tgz|tar\.gz)(?:#.*)?$`；`:62-76` 接受「绝对本地路径」或「http(s) 且以 .tgz 结尾」的 spec。pnpm 原生支持 `pnpm add <tarball url>`（本机 `dsh plugin --profile desktop add --help` 实跑输出含 `<tarball url>` 行）。**Windows 已实测** Release 资产 URL 直装成功（2026-10-29），可直接用：
  ```
  dsh plugin --profile web add https://github.com/<owner>/<repo>/releases/download/v<ver>/dsh-cabinet-mode-<ver>.tgz
  ```
  （Linux/macOS 未实测；私仓/代理/认证未验证。）本地文件须用**绝对路径**（`install-spec.js:63-65` 明确拒绝相对路径）。
- **npm 发布（0.1.4 起已实跑，0.1.5 起加固发布链路）**：
  - **通道**：推送 `v*` tag → `.github/workflows/release.yml` 校验并打包 → `npm publish --access public`（npm Trusted Publishing / OIDC，`id-token: write`，不使用 `NPM_TOKEN` 或任何长期 token）→ 创建 GitHub Release → `market-index` job 重新生成索引并强制推送孤儿分支 `market-index`（`marketplace.json` + `icon.svg` + README）。索引不放在 `main`；**`main` 目前未启用分支保护规则**（2026-11-03 实测：`gh api repos/luodaoyi/dsh-cabinet-mode/rulesets` 返回空数组，`branches/main/protection` 返回 404「Branch not protected」），CI 只在 push/PR 时校验。
  - **首次实跑结果（2026-11-03）**：tag `v0.1.4` 触发 OIDC 发布成功（npm 上 `0.1.4`，`_npmUser=GitHub Actions`、trustedPublisher 为 `github`，provenance 在 sigstore），GitHub Release 与 `market-index` 分支已生成；但紧随的 market-index job 因 registry 传播延迟（packument 只返回 `0.0.0-stage`）连续失败两次。0.1.5 起：抓取加 `cache-control`/`pragma: no-cache` 与 packument `?t=` cache-buster；索引 job 用 `MARKET_EXPECT_VERSION` 轮询等待目标版本出现（默认 15 s 间隔、10 min 超时）；写盘前比对已发布索引并拒绝变小（`MARKET_ALLOW_SHRINK=1` 放行，手动 `Market index` 工作流暴露 `allow_shrink` 输入）；预发布 tag 不触发索引 job。
  - **npm 侧外部前置**（维护者在 npmjs.com 完成）：trusted publisher 指向 GitHub 仓库 `luodaoyi/dsh-cabinet-mode`、workflow 文件名 `release.yml`（含扩展名，文件必须在 `.github/workflows/` 内且发布步骤留在该文件）；新建配置须在 **2 天内**完成首次成功发布，否则失效需删除重建；2026-09-03 后创建的配置默认只允许 `npm stage publish`，**必须显式勾选 `npm publish`**。来源：npm 官方文档 Trusted publishing（https://docs.npmjs.com/trusted-publishers）。
  - **工具版本**：Trusted Publishing 要求 npm CLI ≥ 11.5.1、Node ≥ 22.14.0；工作流用 setup-node 的 Node 24（满足）。`npm whoami` 不能用于验证 trusted publishing 权限（npm 文档明确说明）。
  - **索引格式（format 1）**：由 `scripts/market-index.mjs` 从 npm registry 生成，规则以 `@deepseek-ai/dsh-plugin-market-index@0.2.1-rc.5` 为准——`format: 1`、`title.en` 必填、`publishTimestamp` 为整数秒、精确 SemVer 且同插件内唯一；**读取器自己会按 SemVer 归一排序**（`lib/index.js:248` 用 `semver.rcompare`），降序只是本仓库生成器的自检策略（`scripts/market-index.mjs:219-224`），不是读取器强制；跳过 prerelease 与 deprecated 同样是生成器策略，读取器不拒绝它们；`engines.dsh` **可选**（本包不声明，条目省略）；`icon` 支持 https URL 或相对索引 URL 的引用，**32 KiB 上限只约束 `data:` 内联图标**（边界实测：32 KiB 放行、33 KiB 抛 `must not exceed 32 KiB of decoded bytes`），`./icon.svg` 这类相对路径按索引 URL（https）解析，不受该上限约束。读取器 `marketInstallTarget()` 对 npm 源返回 `dsh-cabinet-mode@<version>` + `registry: https://registry.npmjs.org`（本机实跑读取器核对）。
  - 必需字段：`name`、`version`；`private` 不得为 true；scoped 包才需要 `publishConfig.access: "public"`（本包非 scoped，但仍已显式声明）。
  - bundle 身份：`dsh.bundle.patch` 指向 `cordis.patch.yml`（字符串或有序数组）。这是插件管理器识别「组合包层」的充要字段（`P/dsh-plugin-manager/lib/index.js:313,335-337`）；缺它只会被当作普通依赖安装。
  - `files` 必须包含 `cordis.patch.yml`（npm 打包白名单）。
  - 兼容性：若要声明版本门，优先只写 `engines.dsh`（单一声明即决定，`P/dsh-app-boot/lib/index.js:280-284`）；**不要**逐个声明 `@deepseek-ai/dsh-*` 的 `peerDependencies` 精确版本——否则会被逐包校验（`:286-304`），跨平台/跨补丁版本容易误判（本机已见 rc.2 插件在 rc.3 被警告的先例）。**本仓库的既定产品决定是不声明 `engines.dsh`（0.1.1 起），索引条目因此不写 `engines`**；这不影响 format 1 合法性。
  - **现状对照（本仓库 `package.json`）**：`name`/`version`（0.1.5）/`private: false`/`files` 含 `cordis.patch.yml`/`dsh.bundle.patch`/`repository`（`git+https://github.com/luodaoyi/dsh-cabinet-mode.git`，无 query/fragment，匹配 trusted publisher 的仓库）均在；未声明 `peerDependencies` 与 `engines.dsh`，因此 DSH 兼容性判定不触发（`P/dsh-app-boot/lib/index.js:280-304`）；未声明 `os`/`cpu`。发布链路已由 `v0.1.4` 实跑成功（首个 market-index job 的传播延迟失败已在 0.1.5 修复）。
  - 不要声明 `os`/`cpu` 限制字段；纯 YAML 无平台二进制。
  - 可选元数据：`description`、`icon`（相对路径，须位于包内，`P/dsh-app-boot/lib/index.js:2074-2097`）、`locale/*.json`（`P/dsh-app-boot/lib/index.js:574` 附近）。
- **桌面端**：`dsh plugin --profile desktop add` 在 Desktop 载体下可用（Windows 实测 `list`、`add --help` exit 0；`P/dsh-desktop-host/lib/cli.js:97` 的 `manageDesktopProfile: true` 是放行来源）。Windows 已实测本地目录与 Release 资产 URL 两种真实安装（2026-10-29，`dsh plugin --profile desktop list` = 3 packages）；重启后新会话出现内阁模式仍未实测。

### 7. 插件市场更新链路（0.1.4 起，代码级）

依据：`docs/research/market-index-research.md`（2026-11-03 只读取证，rc.5 app.asar 解包读码）第 5、6 节。以下均为**代码级/官方文案**证据，**未做真实 UI 端到端实测**。

- **没有原地升级。** `update(packageName)` 需要 `pkg.installTarget`，而该字段只对官方按需目录条目产生；第三方插件的「已安装」页没有「更新」按钮。「发现」页在 `update-available` 时显示「有新版本」，点击只执行 `onOpenInstalled`（跳到「已安装」页）。官方文案明确「其他插件请先卸载再安装新版」。真实更新路径只能是：**卸载旧版本 → 从市场安装新版本 → 重启 DSH**。
- **版本比较只按 SemVer**：`update-available` 仅当 `semver.gt(索引版本, 已装版本)`。同一版本号重新构建（不同 commit）不会提示可更新；npm 版本不可变，npm 源不受影响。
- **没有定时自动检查**：索引文档只在打开/刷新市场时抓取，成功后按 `cacheTtlMs`（默认 600000 ms = 10 分钟）缓存。
- **npm 源写入 profile 的依赖串是精确版本**（例如 `"dsh-cabinet-mode": "0.1.4"`），便于回退与核对。
- **`engines.dsh` 缺省 = 不设门禁**（本包产品决定，见 CHANGELOG 0.1.1）：读取器对无 `engines.dsh` 的版本一直判兼容，安装不拦截。若将来声明：运行时用 `semver.satisfies(runtime, range, { includePrerelease: true })`，且会在「安装后校验并回滚」「pnpm 后扫直接依赖」「启动加载 profile bundle」三处硬拦；`~0.2.1` 不含 `0.2.1-rc.5`，`workspace:*`/`latest` 直接被索引校验器拒。
- **图标**：索引里的 `icon: "./icon.svg"` 按索引 URL 解析为 https 同源文件；**32 KiB 上限只约束 `data:` 内联图标**（rc.5 校验器 `index.js:211-215`），相对路径文件型图标无体积检查，本仓库 `icon.svg` 79384 字节合规。包内 `package.json` 的 `icon` 是另一条链路：必须是包内相对文件、SVG/PNG/JPEG/WebP、≤256 KiB。

## 未在本机实测清单

1. Linux / macOS 上任何 `dsh plugin add` 实跑（无对应平台机器）。
2. Linux / macOS 上 bash 工具真实执行（依赖系统 bash；Alpine 等无 bash 发行版未证）。
3. Linux / macOS 桌面端运行时载荷（`primary-runtime` 按平台交付）实际内容。
4. ~~GitHub Release `.tgz` URL 的真实安装~~ → **Windows 已实测**（Release 资产 URL 直装成功，2026-10-29）；Linux/macOS 未实测。
5. ~~真实 `dsh plugin --profile desktop add <bundle>` 安装~~ → **Windows 已实测**（本地目录与 Release URL 两种方式，`list` = 3 packages、bundles 写入，2026-10-29）；重启后新会话出现内阁模式仍未实测。
6. Linux / macOS 上对 `<本仓库 cordis.patch.yml>` 执行 `dsh --profile web --patch ... --dump-config` 的组合校验（Windows 已实跑 exit 0）。
7. ~~npm Trusted Publishing 首次发布、`market-index` 分支发布、tag → npm 发布 → 自动刷新索引全链路~~ → **2026-11-03 已实跑**（v0.1.4 OIDC 发布成功；v0.1.5 全链路成功，run 41657224370，索引 job 等到 registry 出现目标版本后强推分支）。仍未实跑：DSH 插件市场 GUI 里的真实安装/更新。`dsh-cabinet-mode@<version>` 安装 spec 由本机执行格式读取器核对，并按该 spec 把 0.1.5 装进一次性 profile 验证过。
8. HMR 开启时 preset 声明的热生效（仅代码级阅读 README 与注册表语义，未实跑）。
9. 私有仓库/代理/认证下的 tgz 安装。

## 依据索引

| 路径:行号 | 用途 |
|---|---|
| `P/dsh-desktop-host/lib/cli.js:2,94-107,110-115` | Desktop 载体：pnpm 自带路径、PATH delimiter、manageDesktopProfile、win32 信号守卫 |
| `P/dsh/lib/bin.js:22-23,35-37,115-127,234-236` | `dsh plugin` 子命令解析与 pnpm 转发；desktop 默认拒绝 |
| `P/dsh/lib/plugin-BiveYA7h.js:63-94` | `runPlugin`：cwd、packageManager、exit 127 提示 |
| `P/dsh-plugin-manager/lib/index.js:162,178,300-304,311-314,322-351,553-560,610,742-757,2381` | 安装/回滚/进程组/restart-required/路径锚定 |
| `P/dsh-plugin-manager/lib/types/install-spec.js:16-17,62-76` | tarball/本地绝对路径/URL 的 spec 规则 |
| `P/dsh-plugin-manager/lib/types/build-approval.js:1,7-10` | pnpm 11 构建脚本审批（纯 YAML 不触发） |
| `P/dsh-plugin-manager/README.zh.md:14,64,73,81,87` | 生效/构建/重启/pnpmCommand/锁 |
| `P/dsh-home-paths/lib/index.js:11,15,55-57,70-73,84-85` | `homedir()/.dsh`、`DSH_HOME`、`~` 展开 |
| `P/dsh-app-boot/lib/index.js:5,61-101,252,280-304,488-497,507-509,529,2074-2097` | profile/patch 组合、兼容性判定、bundle patch、icon 路径 |
| `P/dsh-web-app/presets/standard.patch.yml:11-14,21-26` | persona 用法、bash/pwsh 平台门控 |
| `P/dsh-base/cordis.patch.yml:123,240-257,281-287` | 宿主执行器与工具行的平台门控 |
| `P/dsh-web-app/cordis.patch.yml:482-489` | 宿主工具行禁用（预设接管） |
| `P/dsh-system-prompt/README.zh.md:72,78` | 已注册变量、禁 `{{cwd}}`、working-directory 必需上下文 |
| `P/dsh-tool-bash/README.zh.md:28-44`、`P/dsh-tool-pwsh/README.zh.md:30-34,57,100` | 两工具语义与 Windows 专属说明 |
| `P/dsh-agent-preset-registry/README.zh.md:12,56,60` | 声明式 preset 启动加载、失败可见 |
| `P/dsh-client-ui-agent-preset/README.zh.md:28` | 新会话选择器/设置页 roster |
| `P/dsh/README.zh.md:18,37,42-46` | `dsh plugin` 转发、profile 结构、patch 应用顺序 |
| 本仓库 `package.json:36-51` | 纯 YAML bundle 声明：`files`（含 `docs/cross-platform.md`、`docs/images`，内部卷宗不进 tarball）、`dsh.bundle.patch`、`scripts`（仅 verify/market，无安装生命周期） |
| 本仓库 `cordis.patch.yml:1-21` | 唯一的 `preset-cabinet` 声明与平台注释 |
| 本仓库 `scripts/install.mjs:31-36,62-63,103,173`、`uninstall.mjs:24,52-53,106`、`verify.mjs:23-28` | 脚本已用 `fileURLToPath`/`homedir`/`DSH_HOME`/`join`，无手写分隔符 |
| 实跑：`> dsh --profile web --patch <repo>/cordis.patch.yml --dump-config` → exit 0（66794 字节，含 `preset-cabinet`、`id: cabinet`、`name: 内阁模式`） | Windows 实测：成品补丁可被 rc.3 组合（不启动服务） |
| 实跑：`> dsh --version` → 0.2.1-rc.3；`> dsh plugin --profile desktop list` → exit 0；`> dsh plugin --profile desktop add --help` → exit 0（pnpm add 帮助）` | Windows 实测 |
| `docs/research/market-index-research.md:15,223,229-235,249` | 市场更新链路：无原地升级、`semver.gt`、无定时检查、10 分钟缓存 |
| `docs/research/market-index-research.md:255-289` | `engines.dsh` 运行时判定、三处硬拦、`includePrerelease`、`~0.2.1` 陷阱 |
| `docs/research/market-index-research.md:94-116` | icon 32 KiB 仅限 `data:`；包内 `icon` 256 KiB、必须相对路径 |
| `.github/workflows/release.yml`、`scripts/market-index.mjs`、`scripts/publish-market-index.sh` | OIDC 发布、索引生成与索引分支发布（v0.1.4 已实跑；自动刷新链路 0.1.5 验证） |
| 实跑：`> node scripts/market-index.mjs`（`MARKET_REGISTRY_MANIFEST` 指向 fixture 文件）→ 生成 `marketplace.json`；`> node scripts/market-index.mjs --check`（`MARKET_INDEX_URL` 指向本地索引文件）→ 一致 exit 0，篡改后 exit 1 | Windows 本机实测：离线生成与 `--check`（无网络、无依赖） |

> README 引用锚点：`docs/cross-platform.md#结论矩阵`、`docs/cross-platform.md#未在本机实测清单`、`docs/cross-platform.md#依据索引`。
