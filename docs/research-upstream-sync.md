> Historical contributor notes from PR #22 head e1f0058. These are not release acceptance evidence. Local file sources, version fallbacks and install-chain claims below are superseded by `pr22-install-validation.md`.

# 调研：ssh 拉上游 main 差异与冲突预判（task-7）

- 任务：task-7（翰林院编修，只读调研 + 一次 ssh fetch）
- 仓库：`cabinet-fork/dsh-cabinet-mode/`（工作区相对路径；下文 `client.js` 等均指该目录）
- 结论先行：
  1. **ssh 通道一次成功**：`git fetch ssh://git@github.com/luodaoyi/dsh-cabinet-mode.git main:refs/remotes/upstream/main` → `upstream/main = 425dd48`，顺带取到 tag `v0.4.1…v0.5.4`（0 次重试）。
  2. **PR #21 已合并**：上游 main 历史含 `bd878a7 Merge pull request #21 from fslong520/fix/edge-direction-and-session-click`，其第二父正是本分支 HEAD `c18a0e9`。
  3. **当前分支与上游零分歧**：`git rev-list --count upstream/main..HEAD = 0`、`merge-base(HEAD, upstream/main) = HEAD`，即 **HEAD 是 upstream/main 的祖先 → `git merge upstream/main` 是 fast-forward，冲突 = 0**；工作区无未提交改动（`git diff --stat HEAD` 为空）。
  4. **重点两区未被动过**：`client.js` 在 `HEAD..upstream/main` 中**零改动**（CabinetMemberSettings 区、`DEFAULT_LEAD_PROMPT` 的 client.js:2522 副本都不受影响）；`index.js` 的 4 个 hunk 起于旧 285 行（提示词区在 `index.js:140`，不在任何 hunk 内），唯一擦边是末尾 export 行新增 `prepareModelSessionApi`。
  5. **代理 12000 已死（只读核实）**：无监听、TCP 探针 `Connection refused`、无代理进程与配置目录；配置只写在仓库 `.git/config`（mtime 2026-11-07 16:47:38）与 shell 环境变量链（zsh → dsh web），**原 12000 进程身份无残留可判（未验证）**。

---

## 1. fetch：命令、输出与为什么必须 ssh://

### 1.1 现场（fetch 前）

```
$ git remote -v
fork	git@github.com:fslong520/dsh-cabinet-mode.git (fetch)
git@github.com:luodaoyi/dsh-cabinet-mode.git	https://github.com/luodaoyi/dsh-cabinet-mode.git (fetch) [blob:none]
git@github.com:luodaoyi/dsh-cabinet-mode.git	https://github.com/luodaoyi/dsh-cabinet-mode.git (push)
origin	https://github.com/luodaoyi/dsh-cabinet-mode.git (fetch)
origin	https://github.com/luodaoyi/dsh-cabinet-mode.git (push)

$ git config --get http.proxy
http://127.0.0.1:12000
```

- 畸形 remote 名恰为 `git@github.com:luodaoyi/dsh-cabinet-mode.git`、url 却是 https → **scp 形式 `git@github.com:luodaoyi/...` 会被该 remote 名匹配劫持走 https**；且仓库级 `http.proxy=127.0.0.1:12000` 已死（§4），https 必断。故按任务书用 `ssh://` 前缀完整 URL，绕开 remote 名匹配。
- `refs/remotes/upstream/main` 此前不存在（`git rev-parse --verify` → `fatal: Needed a single revision`），是本次新建。
- 旧点：`refs/remotes/origin/main = a246d0cd3ad0de551e49dc5bd1ca16487503c08e`、`69646bc2324f9910ac4a1c07709cb3ac970d0ae4`、`f03f84d3059ef2f04396b6677c8b7d35804c04e8`（均已 `rev-parse` 核出）。

### 1.2 fetch 输出（一次成功，exit=0）

```
$ timeout 120 git fetch ssh://git@github.com/luodaoyi/dsh-cabinet-mode.git main:refs/remotes/upstream/main
From ssh://github.com/luodaoyi/dsh-cabinet-mode
 * [new branch]      main       -> upstream/main
 * [new tag]         v0.4.1     -> v0.4.1
 * [new tag]         v0.5.0     -> v0.5.0
 * [new tag]         v0.5.1     -> v0.5.1
 * [new tag]         v0.5.2     -> v0.5.2
 * [new tag]         v0.5.3     -> v0.5.3
 * [new tag]         v0.5.4     -> v0.5.4

$ git rev-parse refs/remotes/upstream/main
425dd48f286a36321b41461a9b98022b0239b02c
```

> 注：ssh 主机键已由先前 fork fetch 建立信任，故无交互确认；**未验证**在全新机器上是否需要 `StrictHostKeyChecking` 处理。

---

## 2. 上游 main 新提交清单与 PR #21 状态

### 2.1 条数（三条基线）

| 基线 | 命令 | 结果 |
|---|---|---|
| 缓存 `origin/main`（落后） | `git rev-list --count a246d0c..upstream/main` | **29** |
| 本分支 HEAD | `git rev-list --count HEAD..upstream/main` | **17**（反向 `upstream/main..HEAD` = **0**） |
| 本地已知旧点 `69646bc` | `git rev-list --count 69646bc..upstream/main` | **80** |
| `origin/main` 是否严格落后 | `git rev-list --count upstream/main..a246d0c` | 0（只落后不超前） |

### 2.2 自缓存 origin/main 起的 29 条（`git log --date=short`，倒序，节选关键 12 条，全表见命令输出）

```
425dd48 2026-11-08 site: recommend memory plugins in README and site
002f16d 2026-11-07 release: prepare Cabinet Mode 0.5.4
bd878a7 2026-11-07 Merge pull request #21 from fslong520/fix/edge-direction-and-session-click
c18a0e9 2026-11-07 fix: 依赖边改为阻塞者指向被阻塞任务，任务名点击打开子会话   ← 本分支 HEAD
bc49446 2026-11-07 Merge pull request #20 from luodaoyi/site/changelog-timeline
438668b 2026-11-07 site: move release updates into bilingual bottom timeline
e828cb3 2026-11-07 Merge pull request #19 from luodaoyi/fix/rc1-prepared-model
887a9e4 2026-11-07 fix: synchronize volatile model saves with empty inbox steps
5d10217 2026-11-07 ci: install pnpm before isolated DSH composition
3f37601 2026-11-07 fix: declare host services using the Cordis injection contract
335fa3d 2026-11-07 test: verify prepared model persistence and document 0.5.3
0b24e38 2026-11-07 fix: prepare cabinet model selection before rc.1 steps
```

（其余 17 条含 `e41ad4f Merge pull request #18 from fslong520/feat/task-flow-edges`、`df3a6c2 fix: make the cabinet preset load on DSH 0.2.2-rc.1`、`f2001d1 fix: export Cabinet plugin display metadata`、`site:` 系列等，`git log --oneline a246d0c..upstream/main` 全量可复现。）

### 2.3 PR #21 已合并（两路证据）

```
$ git ls-remote ssh://git@github.com/luodaoyi/dsh-cabinet-mode.git 'refs/pull/21/*'
c18a0e9fcb1ebe539b7768199011c9a124e71992	refs/pull/21/head

$ git rev-list --parents -n1 bd878a7
bd878a7c183e9ba541f7898cacc688d869bea4bf bc4944638a14f8709bb78f88a162008efaa7be53 c18a0e9fcb1ebe539b7768199011c9a124e71992
```

→ PR head = 本分支 HEAD；merge commit `bd878a7` 的第二父 = `c18a0e9` → **已合并进上游 main**。

---

## 3. 差异面与逐文件冲突预判

### 3.1 要带入的 17 个提交与净差异

`git diff --stat HEAD..upstream/main`（**18 文件，+713 / -101**）：

```
 .github/workflows/ci.yml        |  39 +++++++++
 CHANGELOG.md                    |  65 +++++++++++
 README.md                       |  78 +++++++++-----
 README.zh.md                    |  57 +++++++++----
 cordis.patch.yml                |   7 +-
 index.js                        | 155 +++++++++++++++++++++++++++++++++--
 locale/en.json                  |   6 ++
 locale/zh.json                  |   6 ++
 package-lock.json               |   4 +-
 package.json                    |   7 +-
 scripts/test-model-prepared.mjs | 173 ++++++++++++++++++++++++
 scripts/test-model-routing.mjs  |   2 +-
 scripts/verify.mjs              |   2 +-
 site/assets/css/style.css       |  11 +++
 site/en/index.html              |  86 +++++++++++++++-----
 site/index.html                 |  88 ++++++++++++++-----
 site/llms.txt                   |  24 ++++--
 site/sitemap.xml                |   4 +-
```

新增文件（`git diff --name-status HEAD..upstream/main | grep ^A`）：`locale/en.json`、`locale/zh.json`、`scripts/test-model-prepared.mjs`；**删除文件：无**。

### 3.2 重点区逐项判定（任务书点名两处）

| 关注区 | 判定 | 证据 |
|---|---|---|
| `client.js` 全文件（含 CabinetMemberSettings 配置页区、`DEFAULT_LEAD_PROMPT` client.js:2522 副本） | **零改动，不受影响** | `git diff --stat HEAD..upstream/main -- client.js` 输出为空 |
| `index.js` `DEFAULT_LEAD_PROMPT`（`index.js:140` `const DEFAULT_LEAD_PROMPT = \`【御下术·仅首辅适用】\`，现场 `sed -n '138,142p'` 核实） | **未被触及** | 4 个 hunk 起始旧行 `285 / 382 / 407 / 433`，**全部 > 140，无 hunk 覆盖提示词区** |
| `index.js` 中 `DEFAULT_LEAD_PROMPT`/`御下术` 在 diff 里的出现 | 仅 export 行（末尾） | diff 第 189-190 行：`-export { bureauOf, ... DEFAULT_LEAD_PROMPT, ... }` → `+export { prepareModelSessionApi, bureauOf, ... DEFAULT_LEAD_PROMPT, ... }`（只加导出名，模板体未动） |
| `index.js` 实质改动 | 三块：`memberKeyOf`（旧 285 起 +3）、`attachMemberModel` 后大块（旧 382 起 +140，模型预置 API）、`apply()` 两处小改（旧 407/433） | `git diff HEAD..upstream/main -- index.js \| grep "^@@"` |

### 3.3 冲突预判（两案）

**前置事实**：`git merge-base --is-ancestor HEAD upstream/main` → 成立（命令输出 `HEAD 是 upstream/main 祖先 → merge 即 fast-forward，冲突=0`）；`git diff --stat HEAD` 为空（无未提交改动）。

| 案 | 做法 | 冲突量 | 说明 |
|---|---|---|---|
| **案 A：merge 进当前分支**（推荐） | `git merge upstream/main`（可 `--ff-only` 或 `--no-ff` 留合并点） | **0** | 因 HEAD 是祖先，三方合并的「我方」侧自 merge-base 起零改动，任何文件都不可能冲突；直接吃到 18 文件净差异 |
| **案 B：另切同步分支** | 自 `upstream/main` 开 `sync/upstream-054`，再把当前分支并过去或直接换基 | **0** | 当前分支内容已 100% 在上游（PR #18/#21 均已并），新分支不含任何「本地独有」提交；代价是分支名/fork 追踪关系要重建，**无收益** |

**非冲突但要盯的内容变化（合并后门禁与运行期风险，均未验证）**：

1. `package.json` 版本 `0.5.0 → 0.5.4`（HEAD 侧 `grep '"version"' package.json` = 0.5.0；`git show upstream/main:package.json` = 0.5.4）。
2. `scripts/verify.mjs` 唯一改动是 `TESTS_ON '0.2.1-rc.3' → '0.2.2-rc.1'`（上游 :39；本分支 :39）；`:456-459` 版本比对**仅告警不判失败**（`informational only, no version gate and no failure`），但 `:323` 的 `ok(...)` 文案会随之变，**本机 DSH 实测为 `0.2.1-rc.5`**（`/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/package.json`）→ 合并后门禁是否全绿**未验证**（task-9 跑门禁即判）。
3. `cordis.patch.yml` 三处：`tool-fs` 增 `applyPatch: false`；删 `tool-subagent-list-agents` 条目；`tool-subagent` 的 `modelSelectionSettings: true` → `modelSelection: true` + `modelDiscovery: true`。上游 `df3a6c2` 明写面向 **DSH 0.2.2-rc.1**，本机 0.2.1-rc.5 是否认识新键**未验证**（运行期风险，非 git 冲突）。
4. 新增 `scripts/test-model-prepared.mjs`（173 行）会被 `verify.mjs` 一并跑（若其收集 `scripts/test-*.mjs`），与 `index.js` 新增的模型预置逻辑配套——两者同批进入，自洽性**未验证**。
5. `locale/en.json`/`locale/zh.json` 为新文件（内容为插件 meta 文案，`git show upstream/main:locale/zh.json` 见 `{ "meta": { "title": "内阁模式", ... } }`），与本仓 client 内置字典的关系**未验证**。
6. README*/CHANGELOG/site/ci.yml 变化：与受保护文件策略交集由首辅在 task-9 任务书里裁定（本报告只列事实）。

---

## 4. 代理 12000 死亡：只读核实

| 检查 | 命令/输出 | 结论 |
|---|---|---|
| 无监听 | `ss -ltn \| grep 12000` → `grep_exit=1` | **12000 无任何监听** |
| 连接行为 | `timeout 3 bash -c 'exec 3<>/dev/tcp/127.0.0.1/12000'` → `bash: connect: Connection refused`，`probe_exit=1` | **连接拒绝**（与首辅实测一致） |
| 进程 | `ps aux \| grep -iE "clash\|mihomo\|v2ray\|xray\|gost\|sing-box"` → 仅命中无关项（`mpris-proxy`、`km-ses-dbusproxy`、docker-proxy×N、dbus-daemon-proxy） | **无代理进程在跑** |
| 配置目录 | `ls -d ~/.config/{clash,mihomo,v2ray,xray,sing-box}`、`~/.v2raya`、`/opt/clash` → 全空 | **无残留代理配置** |
| 历史线索 | `grep -ai "12000" ~/.bash_history`、`grep -aiE "clash\|mihomo\|v2ray\|xray\|sing-box\|gost" ~/.bash_history` → 空；`tail ~/.bash_history` → 空（历史为空文件） | **无线索** |
| 代理配置写在哪 | `git config --list --show-origin \| grep -i proxy` → `file:.git/config  http.proxy=http://127.0.0.1:12000`；`git config --global --get http.proxy` → 空 | **仅仓库级**（`.git/config` mtime `2026-11-07 16:47:38`） |
| 环境变量链 | 本 shell `env` 见 `http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:12000/`、`ALL_PROXY=socks://127.0.0.1:12000/`；沿 `/proc` 父链逐级 `environ` 计数：`zsh(pid 9191, 11-07 22:00:07 启动)=6 个 12000 变量`、`mate-terminal(9150)=0`、`dsh web(9310)=6` | 代理环境变量由**交互 zsh 注入并被 dsh web 继承**；mate-terminal 与 systemd --user 均无 → 注入发生在该 zsh 会话内 |
| 注入点 | `grep -rn "12000" ~/.zshenv ~/.zprofile ~/.zshrc ~/.zlogin ~/.config/zsh ~/.config/environment.d /etc/environment /etc/profile.d` → 空；`~/.zshrc:168-173` 只有**已注释**的 `7890` 代理行（另一端口） | **具体注入点未找到（未验证）** |
| systemd | `grep -rl "12000" ~/.config/systemd/user/` → 空 | 无用户单元携带 |

**判读**：端口 12000 的进程已退出且无监听、无进程、无配置残留，**原进程身份无法从现场判定（未验证）**；可确认的是「仓库 git 代理 + shell 环境变量」两处仍指向它，凡走 https 的 git/npm 操作都会撞死，**ssh（github）与本地端口不受影响**。本轮未启动任何服务、未改任何配置。

> 旁证（历史记忆，非本轮实测，且**设备为 ok/linux 非本机 fslong-hasee**）：记忆 `b920125a` 称「本机系统代理 manual 127.0.0.1:12000，由 iKuuuVPNCore 提供（12000 HTTP、12001 mixed、1053 DNS），curl 经其访问正常」。可作「12000 常见提供方是 iKuuuVPNCore」的线索，但**本机该进程是否即 iKuuuVPNCore 未验证**，不写入结论。

---

## 5. 建议同步策略（两案，供首辅裁断）

- **案 A（推荐）：在 `fix/edge-direction-and-session-click` 上 `git merge upstream/main`**
  - 冲突量 **0**（祖先关系 + 工作区干净，双证）；操作面最小，保留分支与 `fork` 追踪；合完直接可跑门禁。
  - 代价：分支线出现一个合并点（或 FF 直接前移），HEAD 会从 `c18a0e9` 走到 `425dd48`。
- **案 B：另切 `sync/upstream-054`（自 upstream/main）再并回/换基**
  - 冲突量同样 **0**，但因本地无独有提交，**等价于直接采用上游**，还需重建 fork 追踪与 PR 关系，收益为零；仅当首辅想保留「纯净上游基线分支」时才值得。
- 无论哪案，**都要在合后跑门禁**：`node --check client.js`、`node scripts/test-client.mjs`、`node scripts/verify.mjs`（本机 DSH 0.2.1-rc.5 vs 上游 TESTS_ON 0.2.2-rc.1 的差异是头号未验证项）。

---

## 6. 未验证清单

1. 12000 **原进程身份**与注入点（无残留，只有 zsh 会话内 6 个代理变量这一事实）。
2. 合并后 `scripts/verify.mjs` 是否全绿（`TESTS_ON` 文案变更 + `:323` 断言 + 新增 `test-model-prepared.mjs`）。
3. 上游 `cordis.patch.yml` 的 `modelSelection/modelDiscovery` 新键在本机 DSH **0.2.1-rc.5** 上的运行期兼容（上游面向 0.2.2-rc.1）。
4. `locale/*.json` 新文件与 client 内置字典的装配关系。
5. 全新机器上 ssh 主机键交互（本机因既有信任未触发）。
6. 本轮**未执行任何 merge/checkout/写操作**（唯一写动作是新建本报告）；浏览器与运行期一律未测。

## 7. 只读纪律

- 写入范围：仅新建 `docs/research-upstream-sync.md`；未改 `client.js`、`index.js`、`cordis.patch.yml`、`scripts/`、`README*`、`CHANGELOG.md`、`package.json` 任何既有文件，未动 git 配置与代理配置。
- 唯一的 git 状态改变是任务书明令的 `git fetch ssh://… main:refs/remotes/upstream/main`（新建 remote-tracking ref 与 6 个 tag，不动工作区与分支）。
