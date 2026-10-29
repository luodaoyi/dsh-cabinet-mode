# 跨平台兼容性（Windows / Linux / macOS）

> 基线：DeepSeek Harness 0.2.1-rc.3（Desktop 安装包）。本机仅有 Windows，**下文 Linux/macOS 结论均为代码级论证，未在本机实测**，逐条标注「实测/代码级推断」。
> 本文只讨论本插件（纯 YAML bundle：`package.json` + `cordis.patch.yml`）与 DSH 宿主安装链；不修改仓库其它文件。
> 证据约定：`P = dsh/node_modules/@deepseek-ai/` 为 app.asar 内路径（全文 `P/...:行号`）；本机复核用 `C:\Users\tb16p\.dsh\cabinet-mode\_work\asar-read.js`（`cat/list` 读取 app.asar 内文件）。实跑命令以 `>` 标注。

## 结论矩阵

| # | 项目 | Windows | Linux | macOS | 证据 | 实测程度 |
|---|---|---|---|---|---|---|
| 1 | 插件本体（纯 YAML bundle，零原生依赖） | 同一份产物 / 实测组合校验通过 | 同 | 同 | 本仓库 `package.json:39-43`（`dsh.bundle.patch`）、`cordis.patch.yml`；DSH 侧 bundle 加载只读 YAML（`P/dsh-app-boot/lib/index.js:488-497`） | Windows 实跑 `dsh --profile web --patch <本仓库 cordis.patch.yml> --dump-config` → exit 0（66794 字节，含 `preset-cabinet`/`内阁模式`）；Linux/macOS 同命令未实测 |
| 2 | `dsh plugin add` 的 pnpm 来源（Desktop 载体） | 安装包自带 pnpm 11.28.5 | 同机制，按平台运行时载荷 | 同 | `P/dsh-desktop-host/lib/cli.js:94-107`；本机 `C:\Users\tb16p\AppData\Local\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\package.json` = 11.28.5 | Windows 实跑 `list`/`add --help` exit 0；Linux/macOS 代码级 |
| 3 | `dsh plugin add` 的 pnpm 来源（通用 CLI） | PATH 中的 `pnpm` | PATH 中的 `pnpm` | PATH 中的 `pnpm` | `P/dsh/lib/plugin-BiveYA7h.js:63-94`（exit 127 提示装 pnpm）；`P/dsh-plugin-manager/README.zh.md:81`（`pnpmCommand` 默认 `pnpm`，经 PATH 解析） | 代码级 |
| 4 | 路径分隔符 / PATH 拼接 | `;`（`node:path.delimiter`） | `:` | `:` | `P/dsh-desktop-host/lib/cli.js:2,104` | Windows 实跑正常；POSIX 代码级 |
| 5 | Harness 家目录 | `%USERPROFILE%\.dsh`（`homedir()`） | `$HOME/.dsh` | `$HOME/.dsh` | `P/dsh-home-paths/lib/index.js:11,15,55-57,70-73` | Windows 实跑（本机 profile 在 `C:\Users\tb16p\.dsh`）；POSIX 代码级 |
| 6 | profile 目录与用户 patch 文件 | `$DSH_HOME\profiles\<name>\cordis.patch.yml` | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 同 Linux | `P/dsh-app-boot/lib/index.js:488-497,507-509` | Windows 实跑（`D:\...\profiles\desktop\cordis.patch.yml` 存在）；POSIX 代码级 |
| 7 | preset 内 `tool-bash` / `tool-pwsh` 启用 | pwsh 启用，bash 禁用 | bash 启用，pwsh 禁用 | bash 启用，pwsh 禁用 | `P/dsh-web-app/presets/standard.patch.yml:21-26`；宿主执行器同规则 `P/dsh-base/cordis.patch.yml:249-257` | Windows 实跑（本会话为 pwsh 工具）；Linux/macOS 代码级 |
| 8 | persona / 技能 / 上下文平台假设 | 无 | 无 | 无 | `P/dsh-system-prompt/README.zh.md:72,78`；`P/dsh-web-app/presets/standard.patch.yml:11-14` | 代码级（Windows 实跑未见异常） |
| 9 | 直装回退：向 `cordis.patch.yml` 追加 `insert` | 支持 | 支持 | 支持 | `P/dsh-app-boot/lib/index.js:61-101,488-497` | Windows 已用 `--patch` 等价路径实跑 exit 0；POSIX 代码级 |
| 10 | 安装后生效 | 重启 Host → 新会话可选 | 同 | 同 | `P/dsh-plugin-manager/README.zh.md:14,73`；`P/dsh-plugin-manager/lib/index.js:2381` | 本调研（只读）未执行真实 `add`；仓库 README.md:77 称 Windows 已实测安装+组合检查（据其声明，未独立复核）；后段代码级 |
| 11 | 是否需要 postinstall / build | 否（纯 YAML） | 否 | 否 | `P/dsh-plugin-manager/lib/types/build-approval.js:1,7-10`；README.zh:64 | 代码级 |
| 12 | GitHub Release `.tgz` 直接安装 | 预期可用（未实跑 URL） | 同 | 同 | `P/dsh-plugin-manager/lib/types/install-spec.js:16-17,62-76`；`pnpm add <tarball url>`（本机 `dsh plugin ... add --help` 实跑输出含 `<tarball url>`） | 代码级 + pnpm 帮助实测 |
| 13 | npm publish 所需字段 | 条件见「发布与分享」 | 同 | 同 | `P/dsh-app-boot/lib/index.js:252,280-304`；`P/dsh-plugin-manager/lib/index.js:313,335-337` | 仅文档条件，未发布 |

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

- **GitHub Release `.tgz`**：`P/dsh-plugin-manager/lib/types/install-spec.js:16-17` 定义 tarball 形态 `\.(?:tgz|tar\.gz)(?:#.*)?$`；`:62-76` 接受「绝对本地路径」或「http(s) 且以 .tgz 结尾」的 spec。pnpm 原生支持 `pnpm add <tarball url>`（本机 `dsh plugin --profile desktop add --help` 实跑输出含 `<tarball url>` 行）。因此预期可直接：
  ```
  dsh plugin --profile web add https://github.com/<owner>/<repo>/releases/download/v<ver>/dsh-cabinet-mode-<ver>.tgz
  ```
  （Windows 未实跑该 URL；Linux/macOS 未实测。私仓/代理/认证未验证。）本地文件须用**绝对路径**（`install-spec.js:63-65` 明确拒绝相对路径）。
- **npm 发布（仅列条件，本机无凭证、未发布、未实测）**：
  - 必需：`name`、`version`；`private` 不得为 true；scoped 包加 `publishConfig.access: "public"`。
  - bundle 身份：`dsh.bundle.patch` 指向 `cordis.patch.yml`（字符串或有序数组）。这是插件管理器识别「组合包层」的充要字段（`P/dsh-plugin-manager/lib/index.js:313,335-337`）；缺它只会被当作普通依赖安装。
  - `files` 必须包含 `cordis.patch.yml`（npm 打包白名单）。
  - 兼容性：优先只写 `engines.dsh`（单一声明即决定，`P/dsh-app-boot/lib/index.js:280-284`）；**不要**逐个声明 `@deepseek-ai/dsh-*` 的 `peerDependencies` 精确版本——否则会被逐包校验（`:286-304`），跨平台/跨补丁版本容易误判（本机已见 rc.2 插件在 rc.3 被警告的先例）。
  - **现状对照（本仓库 `package.json` 已满足）**：`name`/`version`/`private: false`/`files` 含 `cordis.patch.yml`/`dsh.bundle.patch` 均在；未声明 `peerDependencies` 与 `engines.dsh`，因此 DSH 兼容性判定不触发（`P/dsh-app-boot/lib/index.js:280-304`）；未声明 `os`/`cpu`；`engines.node` 只对 npm/yarn 安装器有意义，DSH 兼容性判定不读。发布前仅剩 npm 凭证与 `npm publish`（未做）。
  - 不要声明 `os`/`cpu` 限制字段；纯 YAML 无平台二进制。
  - 可选元数据：`description`、`icon`（相对路径，须位于包内，`P/dsh-app-boot/lib/index.js:2074-2097`）、`locale/*.json`（`P/dsh-app-boot/lib/index.js:574` 附近）。
- **桌面端**：`dsh plugin --profile desktop add` 在 Desktop 载体下可用（Windows 实测 `list`、`add --help` exit 0；`P/dsh-desktop-host/lib/cli.js:97` 的 `manageDesktopProfile: true` 是放行来源）。真实 `add`+重启生效未实测。

## 未在本机实测清单

1. Linux / macOS 上任何 `dsh plugin add` 实跑（无对应平台机器）。
2. Linux / macOS 上 bash 工具真实执行（依赖系统 bash；Alpine 等无 bash 发行版未证）。
3. Linux / macOS 桌面端运行时载荷（`primary-runtime` 按平台交付）实际内容。
4. GitHub Release `.tgz` URL 的真实安装（仅校验了 spec 解析与 pnpm 能力）。
5. 真实 `dsh plugin --profile desktop add <bundle>` 安装 + 重启 + 新会话出现内阁模式：本调研为只读，未执行；仓库 README.md:77 声明 Windows 已实测（bundle install + `dsh plugin list` + 组合检查），本文未独立复核该声明。
6. Linux / macOS 上对 `<本仓库 cordis.patch.yml>` 执行 `dsh --profile web --patch ... --dump-config` 的组合校验（Windows 已实跑 exit 0）。
7. npm publish 流程与安装验证（无 npm 凭证，未发布）。
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
| 本仓库 `package.json:30-47` | 纯 YAML bundle 声明：`files`、`dsh.bundle.patch`、`scripts`（仅 verify/pack，无安装生命周期） |
| 本仓库 `cordis.patch.yml:1-21` | 唯一的 `preset-cabinet` 声明与平台注释 |
| 本仓库 `scripts/install.mjs:31-36,62-63,103,173`、`uninstall.mjs:24,52-53,106`、`verify.mjs:23-28` | 脚本已用 `fileURLToPath`/`homedir`/`DSH_HOME`/`join`，无手写分隔符 |
| 实跑：`> dsh --profile web --patch D:\sources\repos\dsh-cabinet-mode\cordis.patch.yml --dump-config` → exit 0（66794 字节，含 `preset-cabinet`、`id: cabinet`、`name: 内阁模式`） | Windows 实测：成品补丁可被 rc.3 组合（不启动服务） |
| 实跑：`> dsh --version` → 0.2.1-rc.3；`> dsh plugin --profile desktop list` → exit 0；`> dsh plugin --profile desktop add --help` → exit 0（pnpm add 帮助）` | Windows 实测 |

> README 引用锚点：`docs/cross-platform.md#结论矩阵`、`docs/cross-platform.md#未在本机实测清单`、`docs/cross-platform.md#依据索引`。
