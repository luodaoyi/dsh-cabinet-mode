# 插件市场索引与发布链路 · 独立核验（大理寺评事）

- 核验对象：`D:\sources\repos-new\gh\dsh-cabinet-mode`，commit `1b958a2`（`main`，已推 `origin`；本地 `origin/main` 与 `HEAD` 同点）。
- 核验方式：**不复用工部自检结论**，生成器、rc.5 真实解析器、`npm pack`、内嵌 pnpm 安装、发布脚本、三个 workflow 全部由评事重跑；所有实验在 `%TEMP%\dalisi-market-verify`，仓库内只写本文件。
- 读取器来源：`@deepseek-ai/dsh-plugin-market-index@0.2.1-rc.5`（取自 `.artifacts/asar/dsh/node_modules/...`，复制到临时目录后补 `semver`，未改动 `.artifacts`）。
- 判定口径：PASS/FAIL 由评事自己的断言给出；上游 `scripts/verify.mjs` 的输出只按「原文引用」记录，不作为我的结论依据。

## 0. 结论

**PASS=106 / FAIL=1 / 未验证=10 项**（我方断言，不含上游 `verify.mjs` 的 22 项）。另有 7 条文档/实现错位与 3 条行为备注，均为**非阻断**。

**没有发现会阻断 0.1.4 首发（tag → npm → 索引分支）的缺陷。** 生成物被 rc.5 真解析器接受，安装形态完整，发布脚本在一次性 clone + 本地 bare remote 里行为正确，三个 workflow 的触发/权限/依赖/门禁经结构断言全部成立，`*.sh` 在 git 里存的是 LF。

唯一判 FAIL 的是**发布脚本的脏树守卫漏判「仅暂存」改动**（D-1，低危：CI 每次都是全新 checkout，不触发；但本地维护者按 README 操作时可能丢改动）。

需提醒首辅的两点定性结论：

1. **「版本降序」不是 rc.5 读取器的硬约束**。`parseMarketIndex` 对 `versions` 自己 `semver.rcompare` 排序（`.artifacts/.../lib/index.js:248`），乱序输入**不会抛错**，只是被归一化。因此任务书里「证明 rc.5 解析器对版本乱序抛错」这一预期与实现不符；顺序只能靠生成器自检（`scripts/market-index.mjs:219-224`）拦截，而 `docs/cross-platform.md:125` 把「按 SemVer 降序」写成 rc.5 的规则，属**文档强于实现**（D-2）。
2. **CI 与发布链路从不用 rc.5 读取器校验生成物**。`scripts/verify.mjs` 的脚本清单只有 `install/uninstall/verify`（`scripts/verify.mjs:192`），workflow 对索引脚本只做 `node --check` / `bash -n`。索引的 schema 只在 DSH 读取时才被校验——即「生成器自洽 ≠ 读取器接受」之间的缺口没有任何自动门禁（D-3，中危验证缺口，非功能缺陷）。

## 1. 环境与可复现前提

| 项 | 取值 |
| --- | --- |
| Node（内嵌） | `C:\Users\tb16p\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`，v24.21.0 |
| Node（PATH） | `C:\Program Files\nodejs\node.exe`，v26.13.0（供 `node -p` / `node --check`） |
| pnpm（内嵌） | 同上 runtime `dependencies\pnpm\bin\pnpm.mjs`，11.28.5 |
| npm | 11.6.4 |
| Git Bash | `C:\Program Files\Git\bin\bash.exe`，GNU bash 5.3.15 |
| rc.5 解析器 | 复制到 `%TEMP%\dalisi-market-verify\parser\node_modules\@deepseek-ai\dsh-plugin-market-index`，同目录 `npm i semver`（装到 7.8.6） |
| 解析器导出（自查，非假设） | `MAX_INLINE_ICON_BYTES, MarketIndexError, marketInstallTarget, parseMarketIndex`（`lib/index.js:320`）；`MAX_INLINE_ICON_BYTES=32768` |

```text
exports: MAX_INLINE_ICON_BYTES, MarketIndexError, marketInstallTarget, parseMarketIndex
MAX_INLINE_ICON_BYTES: 32768
typeof parseMarketIndex: function
typeof marketInstallTarget: function
```

## 2. 索引生成器 + rc.5 真实解析器（A 组：15 PASS）

命令（`MARKET_*` 是脚本自带的测试缝，见 `scripts/market-index.mjs:38-45`；生成物写到临时目录，不写仓库）：

```powershell
cd D:\sources\repos-new\gh\dsh-cabinet-mode
$env:MARKET_REGISTRY_MANIFEST = "$env:TEMP\dalisi-market-verify\fixtures\registry-a.json"
$env:MARKET_INDEX_OUT         = "$env:TEMP\dalisi-market-verify\out\a.json"
node scripts/market-index.mjs
```

fixture A 含：稳定版 0.1.0/0.1.1/0.1.4，被废弃的 0.1.2（`deprecated: "use 0.1.4"`），预发布 0.1.5-beta.1，且每个 entry 只声明 `engines.node`（不声明 `engines.dsh`）。

```text
Wrote C:\Users\tb16p\AppData\Local\Temp\dalisi-market-verify\out\a.json: 3 version(s); skipped: 0.1.2 (deprecated), 0.1.5-beta.1 (prerelease)
exit=0
```

再用 rc.5 真解析器实跑（`lab.mjs`，索引 URL 用线上真值）：

```text
raw format = 1  (typeof number)
raw version order = 0.1.4 > 0.1.1 > 0.1.0
raw per-entry own keys = [["version","publishTimestamp","source"],["version","publishTimestamp","source"],["version","publishTimestamp","source"]]
raw per-entry own engines key present = [false,false,false]
raw publishTimestamp values = [1793698200,1793617200,1793613912]
raw publishTimestamp all integers = true
parseMarketIndex: PASS
  parsed.plugins = 1, name = dsh-cabinet-mode
  parsed versions (parser order) = 0.1.4 > 0.1.1 > 0.1.0
  parsed icon = https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/icon.svg
  parsed engines per version = [{},{},{}]
  marketInstallTarget -> {"spec":"dsh-cabinet-mode@0.1.4","registry":"https://registry.npmjs.org/"}
```

| ID | 断言 | 结果 |
| --- | --- | --- |
| A01 | fixture 生成 exit=0 | PASS |
| A02 | `format` 是数字 `1` | PASS |
| A03 | `title.en = Cabinet Mode` | PASS |
| A04 | 预发布 `0.1.5-beta.1` 被跳过（输出 skipped 列表） | PASS |
| A05 | 被废弃 `0.1.2` 被跳过 | PASS |
| A06 | 版本降序 `0.1.4 > 0.1.1 > 0.1.0` | PASS |
| A07 | 3 个 `publishTimestamp` 均为整数秒（1793698200 / 1793617200 / 1793613912） | PASS |
| A08 | 条目**无** `engines` 键（own keys 只有 version/publishTimestamp/source） | PASS |
| A09 | rc.5 `parseMarketIndex(value, indexUrl)` PASS | PASS |
| A10 | `icon: "./icon.svg"` 解析为 `…/market-index/icon.svg`（同源相对，79384 B 不受 32 KiB 限制） | PASS |
| A11 | `marketInstallTarget` → `dsh-cabinet-mode@0.1.4` + `registry: https://registry.npmjs.org/` | PASS |
| A12 | 真实 registry 取包当前为 HTTP 404（与「首发尚未做」一致） | PASS |
| A13 | fixture B（entry 声明 `engines.dsh: ">=0.2.1-rc.5"`）→ 生成器复制该字段，rc.5 接受 | PASS |
| A14 | fixture C（`engines.dsh: "workspace:*"`）→ 生成器断言拒绝，exit=1 | PASS |
| A15 | 边界：两个版本仅差 build metadata（`0.1.0+a`/`0.1.0+b`）→ 生成器硬失败 exit=1（非静默产出） | PASS |

A14 原文：

```text
AssertionError [ERR_ASSERTION]: 0.1.4 declares a workspace: engines.dsh
    at file:///D:/sources/repos-new/gh/dsh-cabinet-mode/scripts/market-index.mjs:146:12
exit=1
```

A12 原文（真实 registry，无 fixture）：

```text
Error: https://registry.npmjs.org/dsh-cabinet-mode answered 404
The registry must already serve dsh-cabinet-mode: the first tagged release publishes it to npm, and only then can the market index list it.
exit=1
```

A15 原文：

```text
AssertionError [ERR_ASSERTION]: versions must be sorted in descending SemVer order
    at file:///D:/sources/repos-new/gh/dsh-cabinet-mode/scripts/market-index.mjs:220:12
exit=1
```

> A15 说明：生成器的 `compareSemver()`（`scripts/market-index.mjs:87-94`）先 `split('-')[0]` 再按三段数字比较，**忽略 build metadata 与 prerelease**。若某包同时上架两个仅差 build metadata 的版本，排序出现平局，`market-index.mjs:219-224` 的严格 `> 0` 断言会失败。行为是硬失败（不会产出错误索引），属已知边界，不影响本包（本包版本不含 build metadata）。

## 3. 反向注入矩阵（B 组：30 PASS / 0 FAIL）

对 A 组合法索引逐处注入缺陷，跑 rc.5 `parseMarketIndex`，期望值分 `THROW`（必须抛 `MarketIndexError`）与 `ACCEPT`（用于标定真实约束边界）。命令：

```powershell
cd "$env:TEMP\dalisi-market-verify\parser"
node neg.mjs "$env:TEMP\dalisi-market-verify\out\a.json"
```

关键行（完整 30 行见本节末汇总）：

```text
[PASS] ts-ms（publishTimestamp 改毫秒） :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[0].publishTimestamp must be an integer number of Unix seconds in [0, 10^11)
[PASS] ts-float（改成浮点） :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[0].publishTimestamp must be an integer number of Unix seconds in [0, 10^11)
[PASS] ts-1e11（上界越界） :: expected=THROW actual=THROW :: MarketIndexError: ... in [0, 10^11)
[PASS] ts-negative :: expected=THROW actual=THROW
[PASS] ts-string :: expected=THROW actual=THROW
[PASS] icon-33KiB data URI :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].icon must not exceed 32 KiB of decoded bytes
[PASS] icon-32KiB data URI（边界，应放行） :: expected=ACCEPT actual=ACCEPT
[PASS] icon-http 他源 :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].icon must resolve to https or the index origin
[PASS] icon-https 他源（按代码放行） :: expected=ACCEPT actual=ACCEPT
[PASS] icon-协议相对 //evil :: expected=ACCEPT actual=ACCEPT
[PASS] icon-相对父目录 ../icon.svg :: expected=ACCEPT actual=ACCEPT
[PASS] version-乱序（升序排列） :: expected=ACCEPT actual=ACCEPT :: parsed versions=[0.1.4,0.1.1,0.1.0]
[PASS] version-重复 :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[1].version duplicates 0.1.4
[PASS] version-range "^0.1.4" :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[0].version must be an exact SemVer version
[PASS] version-带 v 前缀 v0.1.4 :: expected=THROW actual=THROW
[PASS] version-prerelease（格式层放行） :: expected=ACCEPT actual=ACCEPT :: parsed versions=[0.1.5-beta.1,0.1.1,0.1.0]
[PASS] engines.dsh=workspace:* :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[0].engines.dsh must not be a workspace: range
[PASS] engines.dsh=latest（非 range） :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[0].engines.dsh must be a SemVer range
[PASS] engines.dsh 合法 range（应放行） :: expected=ACCEPT actual=ACCEPT
[PASS] format=2 :: expected=THROW actual=THROW :: MarketIndexError: $.format must be 1
[PASS] format="1"（字符串） :: expected=THROW actual=THROW :: MarketIndexError: $.format must be 1
[PASS] title 缺 en :: expected=THROW actual=THROW :: MarketIndexError: $.title must contain en
[PASS] repository.url 带 query :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].repository.url must not contain a query or fragment
[PASS] metadata.category 未声明 :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].metadata.category references undeclared id "not-declared"
[PASS] keywords 非数组 :: expected=THROW actual=THROW
[PASS] source.type=http :: expected=THROW actual=THROW :: MarketIndexError: $.plugins[0].versions[0].source.type must be "npm" or "git"
[PASS] source npm registry=ftp:// :: expected=THROW actual=THROW
[PASS] 包名不合法 "DSH Cabinet" :: expected=THROW actual=THROW
[PASS] versions 空数组 :: expected=THROW actual=THROW
[PASS] 未知多余键（前向兼容，应放行） :: expected=ACCEPT actual=ACCEPT
mutation-summary: PASS=30 FAIL=0
```

三点必须校准的边界（都来自代码实测，不来自文档）：

- **版本顺序不被校验，只被重排。** `versions()` 在返回前 `sort((l, r) => semver.rcompare(...))`（`lib/index.js:248`），所以乱序输入仍 PASS，输出被归一为降序。→ 顺序是生成器约定 + 生成器自检（`market-index.mjs:219-224`）保证的，不是读取器约束。
- **预发布不被读取器拒绝。** `SEMVER` 正则允许 prerelease（`lib/index.js:26`），`0.1.5-beta.1` 能 PASS。跳过 prerelease 是生成器策略（`market-index.mjs:130-133`），不是格式要求。
- **`icon` 只做「https 或同源」判定。** `lib/index.js:209-225`：`data:` 走 32 KiB 校验；非 `data:` 一律 `new URL(text, indexUrl)`，只有「协议不是 https 且 origin 与索引不同」才拒绝。因此 `https://任意域/x.svg`、`//evil.example/x.svg`、`../icon.svg` 都放行；`http://` 他源被拒。本包用 `./icon.svg`，落在「同源 https」分支，79384 B 不触发上限（与 A10 一致）。

## 4. `--check` 过期检测（C 组：5 PASS）

```powershell
cd D:\sources\repos-new\gh\dsh-cabinet-mode
$env:MARKET_REGISTRY_MANIFEST = "...\fixtures\registry-a.json"
$env:MARKET_INDEX_URL         = "<被测的已发布副本>"
node scripts/market-index.mjs --check
```

| ID | 场景 | 期望 | 实测 |
| --- | --- | --- | --- |
| C01 | 副本与重新生成结果逐字节一致 | exit 0 | PASS（`published index matches the registry: 3 version(s); skipped: …`） |
| C02 | 过期副本（删掉 0.1.0） | exit 1 | PASS（`the published index at … is stale; refresh the market-index branch`） |
| C03 | 缺陷副本（`publishTimestamp` 毫秒） | exit 1 | PASS（同上文本） |
| C04 | 副本不存在 | exit 1 | PASS（`Error: cannot read …: ENOENT`） |
| C05 | 线上真值 `raw.githubusercontent.com/…/market-index/marketplace.json`（分支尚不存在） | exit 1 | PASS（`answered 404`） |

```text
C1 identical copy (expect 0)                         exit=0  published index matches the registry: 3 version(s); skipped: 0.1.2 (deprecated), 0.1.5-beta.1 (prerelease)
C2 stale copy: 0.1.0 dropped (expect 1)              exit=1  AssertionError [ERR_ASSERTION]: the published index at ...\stale.json is stale; refresh the market-index branch
C3 defective copy: ts in ms (expect 1)               exit=1  AssertionError [ERR_ASSERTION]: the published index at ...\bad-ms.json is stale; refresh the market-index branch
C4 published copy absent (expect 1)                  exit=1  Error: cannot read ...\does-not-exist.json: ENOENT
C5 real raw.githubusercontent (expect 1)             exit=1  Error: https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json answered 404
```

> 口径提醒：`--check`（`scripts/market-index.mjs:230-235`）只做**字符串全等**比较，**不调用** `parseMarketIndex`。C03 的 exit 1 来自「字节不相等」，不是 schema 校验。也就是说 `--check` 能防「已发布副本与 registry 漂移 / 被人手改」，不能防「生成器自身产出不合 schema」——后者只能靠 §3 这种读取器实跑（目前没有进 CI，见 D-3）。

## 5. 安装形态：tarball 与假 profile（D+E 组：14 PASS）

### 5.1 `npm pack`（不写仓库，`--pack-destination` 指向临时目录）

```text
npm notice 12.7kB CHANGELOG.md      npm notice 1.1kB LICENSE          npm notice 24.1kB README.md
npm notice 21.8kB README.zh.md      npm notice 11.5kB cordis.patch.yml
npm notice 27.7kB docs/cross-platform.md   npm notice 63.9kB docs/images/cabinet-portrait.jpg
npm notice 2.8kB docs/images/cabinet-team.svg   npm notice 79.4kB icon.svg
npm notice 1.5kB package.json       npm notice 11.7kB scripts/install.mjs
npm notice 11.2kB scripts/market-index.mjs   npm notice 2.6kB scripts/publish-market-index.sh
npm notice 8.2kB scripts/uninstall.mjs       npm notice 16.1kB scripts/verify.mjs
npm notice name: dsh-cabinet-mode  version: 0.1.4  filename: dsh-cabinet-mode-0.1.4.tgz
npm notice package size: 178.6 kB  unpacked size: 296.3 kB  total files: 15
npm notice shasum: 1f5b9d9c25d6f951dc877fdb72a36724de4c3713
```

`tar -tzf` 原始清单（15 项）：

```text
package/LICENSE
package/docs/images/cabinet-portrait.jpg
package/package.json
package/CHANGELOG.md
package/docs/cross-platform.md
package/README.md
package/README.zh.md
package/scripts/install.mjs
package/scripts/market-index.mjs
package/scripts/uninstall.mjs
package/scripts/verify.mjs
package/scripts/publish-market-index.sh
package/docs/images/cabinet-team.svg
package/icon.svg
package/cordis.patch.yml
```

| ID | 断言 | 结果 |
| --- | --- | --- |
| D01 | 包 15 文件，`cordis.patch.yml` 在**包根** | PASS |
| D02 | 不含 `docs/research/**`、`docs/verify/**`、`.github/**`、`marketplace.json` | PASS |
| D03 | `package.json` 的 `dsh.bundle.patch = ./cordis.patch.yml`（`package.json:47-51`） | PASS |
| D04 | `release.yml:90-103` 断言的 8 条路径**全部**命中 | PASS |
| D05 | `ci.yml:52-56` 断言的 4 条路径全部命中 | PASS |
| D06 | `npm pack --dry-run` 与真实 `npm pack` 的 shasum 一致（`1f5b9d9c…`） | PASS |

D04 逐条：`package/package.json`、`package/cordis.patch.yml`、`package/icon.svg`、`package/README.md`、`package/README.zh.md`、`package/docs/cross-platform.md`、`package/scripts/market-index.mjs`、`package/scripts/publish-market-index.sh` —— 全为 `present=True`。

「已打包但 workflow 未断言」的 7 项（非缺陷，仅记录覆盖差）：`package/LICENSE`、`package/CHANGELOG.md`、`package/docs/images/cabinet-portrait.jpg`、`package/docs/images/cabinet-team.svg`、`package/scripts/install.mjs`、`package/scripts/uninstall.mjs`、`package/scripts/verify.mjs`。

### 5.2 内嵌 pnpm 装进假 profile

```powershell
$node='...\dependencies\node\bin\node.exe'; $pnpm='...\dependencies\pnpm\bin\pnpm.mjs'
cd "$env:TEMP\dalisi-market-verify\profile"      # package.json: {"name":"fake-dsh-profile","private":true}
node $pnpm add 'file:./dsh-cabinet-mode-0.1.4.tgz' --store-dir "$env:TEMP\dalisi-market-verify\store"
```

```text
Packages: +1
Progress: resolved 1, reused 1, downloaded 0, added 1, done
dependencies:
+ dsh-cabinet-mode 0.1.4
Done in 445ms using pnpm v11.28.5
```

| ID | 断言 | 结果 |
| --- | --- | --- |
| E01 | `pnpm add file:<tgz>` exit 0，profile `package.json` 记录 `file:dsh-cabinet-mode-0.1.4.tgz` | PASS |
| E02 | `node_modules/dsh-cabinet-mode` 为 Junction → `node_modules/.pnpm/…` 实体 | PASS |
| E03 | 安装后仍是 15 文件，与 tarball 清单**完全一致** | PASS |
| E04 | `cordis.patch.yml` sha256 与仓库内文件相同（`0e6bc6ec…c31c`，11487 B） | PASS |
| E05 | `icon.svg` 79384 B，与仓库一致 | PASS |
| E06 | `dsh.bundle.patch` 指向的文件在安装树内存在，且可读（首 12 行 YAML 注释正常） | PASS |
| E07 | 安装树内无 `docs/research`、`docs/verify`、`.github`、`.artifacts` | PASS |
| E08 | `pnpm-lock.yaml` 记录的 integrity = tarball 的 `sha512-NdYfjrFMEmHg0…` | PASS |

```text
name=dsh-cabinet-mode version=0.1.4 icon=./icon.svg dsh.bundle.patch=./cordis.patch.yml
patch target exists = True ; size = 11487
patch sha256 = 0e6bc6ec5617290c523e49127ed1a2cdfca81acf25729c6090e8e1d74848c31c
repo   sha256 = 0e6bc6ec5617290c523e49127ed1a2cdfca81acf25729c6090e8e1d74848c31c
icon bytes = 79384 ; repo icon = 79384
```

> 未做：DSH 侧 `dsh plugin add` 实装（会写 `%USERPROFILE%\.dsh`，超出本次边界）。因此「DSH 认这个是 bundle」只到 `dsh.bundle.patch` 字段与文件可读层面，端到端仍属未验证（见 U4）。

## 6. 发布脚本：临时 clone + 本地 bare remote（F 组：9 PASS / 1 FAIL）

**未接触真实 remote。** 做法：`git init --bare` 出 `%TEMP%\…\pub\origin.git`，从本地仓库 `git clone` 一份到 `%TEMP%\…\pub\clone`，`git remote set-url origin <bare>`，再把生成的索引放进 clone。脚本一律用 Git Bash 跑。

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -c "cd /tmp/dalisi-market-verify/pub/clone && bash scripts/publish-market-index.sh"
```

| ID | 场景 | 期望 | 实测 |
| --- | --- | --- | --- |
| F01 | 已跟踪文件被改（改 README 后未提交） | 拒绝 | PASS，exit 1：`refusing to publish from a working tree with modified tracked files; use a disposable clone` |
| F02 | `marketplace.json` 缺失 | 拒绝 | PASS，exit 1：`marketplace.json is missing or empty; run scripts/market-index.mjs first` |
| F03 | `icon.svg` 缺失 | 拒绝 | PASS，exit 1：`icon.svg is missing; the index references it` |
| F04 | 干净树 + 索引存在 | 推送成功 | PASS，`* [new branch] HEAD -> market-index`，exit 0 |
| F05 | 分支内容 | 仅 3 文件 | PASS：`README.md` / `icon.svg` / `marketplace.json` |
| F06 | 分支上的 `marketplace.json` 与生成物 | 逐字节相同 | PASS（2366 B，CR=0，`identical=True`） |
| F07 | 新 clone 重复跑（origin 已有相同索引） | `index already current`，无新提交 | PASS：exit 0，分支 sha 前后相同 `380f76c…`，`rev-list --count=1` |
| F08 | 新 clone + 索引变化 | 强推为新孤儿提交 | PASS：`+ 380f76c...a18792b HEAD -> market-index (forced update)`，仍 3 文件、仍 1 个提交 |
| F09 | 工作树有未跟踪文件 | 不入提交（文档已声明不受保护） | PASS：提交仍 3 文件，未跟踪文件留在工作树 |
| F10 | **仅暂存**（`git add` 但未提交）的改动 | 应被拒（README:353 口径） | **FAIL**：守卫用 `git diff --quiet`（`publish-market-index.sh:25`，工作树 vs 索引），漏判暂存改动 |

F05 / F06 / F07 原文：

```text
=== market-index tree ===
README.md
icon.svg
marketplace.json
=== market-index log ===
380f76c  chore: refresh plugin market index for 0.1.4        # 单 root 提交，%p 为空
bytes=2366 CR=0
identical=True
----- T4' fresh clone, identical index (expect 'already current', exit 0) (exit=0) -----
index already current for 0.1.4
sha before=380f76c0086b721548a6be537df9d07ae5458b21 after=380f76c0086b721548a6be537df9d07ae5458b21 same=True
```

F10 原文（决定性复现：先让 origin 上的索引与本地不同，保证走发布路径）：

```text
T7c pre: worktree-vs-index diff --quiet exit=0 | staged diff --cached exit=1
publish exit=0
 + d13703f...d57e72a HEAD -> market-index (forced update)
--- CHANGELOG in worktree after publish ---
cat: CHANGELOG.md: No such file or directory
```

即：`git diff --quiet` 返回 0（工作树与索引一致）→ 守卫放过 → `git checkout --orphan` + `git rm -rf .`（`publish-market-index.sh:44-45`）把已暂存的 `CHANGELOG.md` 删掉，改动**静默丢失**。

**行为备注（非缺陷）**：同一 clone 无法二次运行发布脚本——第一次运行后工作树只剩 3 个文件（含脚本自己），再跑得到 `bash: scripts/publish-market-index.sh: No such file or directory`（exit 127）。README:351-353 已要求「只在一次性 clone 里跑」，CI 每次全新 checkout，故不影响流水线；但「重复跑输出 index already current」只能在**新 clone**（F07）里观察到。

## 7. workflow 复核（G 组：29 PASS / 0 FAIL）

用 `js-yaml` 解析三个 workflow 后逐条断言（不是肉眼读 YAML）。命令：`node workflows.mjs`。

```text
=== release.yml ===
[PASS] trigger = push tags v*  ({"push":{"tags":["v*"]}})
[PASS] workflow-level permissions = contents:read  ({"contents":"read"})
[PASS] publish.permissions has contents:write  ({"contents":"write","id-token":"write"})
[PASS] publish.permissions has id-token:write  ({"contents":"write","id-token":"write"})
[PASS] publish job has no environment
[PASS] market-index.needs = publish  ("publish")
[PASS] market-index.permissions.contents = write  ({"contents":"write"})
[PASS] market-index has NO id-token
  publish steps: Checkout -> Set up Node.js -> Require the tagged commit to be contained in main -> Require package.json and CHANGELOG to match the tag -> Verify the package and the market index scripts -> Pack the tarball and inspect its contents -> Publish to npm with the trusted publisher -> Create the GitHub Release
[PASS] tag-in-main gate runs before npm publish  (gate@2 publish@6)
[PASS] version/changelog gate runs before npm publish  (ver@3 publish@6)
[PASS] tarball assertion runs before npm publish  (pack@5 publish@6)
[PASS] GitHub Release created after npm publish  (release@7 publish@6)
  market-index steps: Checkout -> Set up Node.js -> Regenerate the index from the npm registry -> Publish the market-index branch
[PASS] market-index regenerates before pushing
[PASS] market-index job does not run npm publish
[PASS] publish job uses no NPM_TOKEN / NODE_AUTH_TOKEN
[PASS] only secret referenced is GITHUB_TOKEN  (["GITHUB_TOKEN"])
[PASS] setup-node registry-url set (affects .npmrc)
=== ci.yml ===
[PASS] trigger = push:main + pull_request  ({"push":{"branches":["main"]},"pull_request":null})
[PASS] permissions = contents:read
[PASS] no npm publish in CI
[PASS] no id-token in CI
[PASS] CI asserts a subset of tarball paths
=== market-index.yml ===
[PASS] trigger = workflow_dispatch + schedule  ({"workflow_dispatch":null,"schedule":[{"cron":"23 4 * * 1"}]})
[PASS] workflow-level permissions = contents:read
[PASS] job permissions.contents = write
[PASS] no npm publish in market-index.yml
[PASS] no id-token in market-index.yml
[PASS] shares concurrency group with release index job  (market-index-publish vs market-index-publish)
workflow-summary: PASS=29 FAIL=0
```

人工判断（结构断言之外）：

- **失败传播正确。** `release.yml:118-120` `market-index: needs: publish`；publish 任一步失败/被跳过，索引 job 不会跑。所以「npm 没发成功却推了索引」不可能发生。
- **不可能发布未打 tag 的 commit。** 触发器只有 `push: tags: ['v*']`（`release.yml:15-18`）；发布前还有两道门：`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`（`:49-57`）与 `package.json version == tag && CHANGELOG 含 ## [version]`（`:59-72`）。本地实测 `package.json=0.1.4`、`CHANGELOG` 含 `## [0.1.4]`、`v0.1.4` tag **尚未创建**（origin 上只有 v0.1.0–v0.1.3），与「首发未做」一致。
- **tarball 断言与包内容一致**，见 D04/D05；断言在 `npm publish` 之前执行（`:82-103` → `:105-107`）。
- **only-GITHUB_TOKEN**：`release.yml:112` 只取 `secrets.GITHUB_TOKEN` 建 Release；npm 侧靠 `id-token: write` OIDC，无 `NPM_TOKEN`。
- **CI 语法门与本地一致**：`node --check scripts/market-index.mjs` exit 0；`bash -n scripts/publish-market-index.sh` exit 0。
- **上游自检脚本可跑通**：`node scripts/verify.mjs` → `Result: PASS=22 FAIL=0 WARN=1`（WARN 是 dsh 0.2.1-rc.5 与参考 rc.3 的提示，非门禁），其中 `dump-config composition` 三项 PASS。

## 8. `.gitattributes` 与 blob 行尾（H 组：4 PASS）

| ID | 断言 | 结果 |
| --- | --- | --- |
| H01 | `git ls-files --eol scripts/publish-market-index.sh` → `i/lf w/lf attr/text eol=lf` | PASS |
| H02 | blob 2631 B、CR 计数 0、首两字节 `23 21`（`#!`） | PASS |
| H03 | 全新 Windows clone（`core.autocrlf=true`）中仍为 `w/lf` → 属性生效 | PASS |
| H04 | `.gitattributes` 自身 blob 为 LF（`i/lf`），第 4 行 `*.sh text eol=lf` | PASS |

```text
i/lf    w/lf    attr/text eol=lf      	scripts/publish-market-index.sh     # 主仓工作树
i/lf    w/lf    attr/text eol=lf      	scripts/publish-market-index.sh     # 临时 clone，core.autocrlf=true
blob bytes=2631 CR=0
first 2 bytes(hex)=2321  (23 21 = '#!')
first line = #!/usr/bin/env bash
```

即 Linux runner 上 shebang 不会因 CRLF 失效。

## 9. 缺陷与文档错位（均非阻断）

| 编号 | 级别 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- | --- |
| D-1 | 低 | 发布脚本脏树守卫漏判「仅暂存」改动；README 口径是「遇到被修改的已跟踪文件会拒绝」 | 守卫 `publish-market-index.sh:25` 用 `git diff --quiet`（工作树 vs 索引）；F10 实测暂存改动被 `git rm -rf .` 静默销毁 | 守卫改为 `git diff --quiet && git diff --cached --quiet`；或在 README 明说「仅暂存改动也不受保护」 |
| D-2 | 低 | 文档把「versions 按 SemVer 降序」写成 rc.5 的格式规则 | rc.5 `lib/index.js:248` 是排序归一，不校验；B 组「version-乱序」实测 ACCEPT；`docs/cross-platform.md:125` 表述过强 | 改为「读取器会自行排序；生成器按降序写出并由自检保证」 |
| D-3 | 中（验证缺口） | CI/发布链路从不用 rc.5 读取器校验生成物 | `scripts/verify.mjs:192` 的脚本清单不含市场索引脚本；`ci.yml:37-42`、`release.yml:74-80` 只做 `node --check`/`bash -n`；`marketplace.json` 被 `.gitignore` 忽略，CI 无法跑 `--check` | 加一个 fixture 驱动的自检（真正 `import('@deepseek-ai/dsh-plugin-market-index')`，缺依赖时跳过并 WARN），把本次 §2/§3 的断言固化进 CI |
| D-4 | 低（理论） | `market-index` 分支是 `--force` 全量覆盖，无「新鲜度」护栏；两个 tag 并发发布时，先者可能在后者之后强推，把索引推回旧状态 | `publish-market-index.sh:57-62`；`release.yml:23-25` 的并发组按 `github.ref` 分桶，只有索引 job 的 `market-index-publish` 组串行化 | 索引 job 里加一步：推送前比对新索引的 `versions` 必须是 registry 的降序前缀/子集；或让 release 的索引 job 与 tag 时间戳做单调校验 |
| D-5 | 极低 | `package.json` 有 `market:index` / `market:check`（`package.json:54-55`），README 只写了 `market:publish` | D1 grep：README/README.zh/cross-platform 中 `market:check`/`market:index` 零命中 | README「Releasing」补一行两命令用法，或删掉未用 script |
| D-6 | 低 | tag 模式 `v*` 会匹配 `v0.1.5-beta.1`；此时 `npm publish` 默认 `latest` dist-tag，把预发布推成 latest，而索引又会跳过预发布（两处口径不一致） | `release.yml:15-18`、`:105-107`；`market-index.mjs:130-133` | release 增加「tag 必须是稳定 SemVer」断言，或发布时显式 `--tag next` |
| D-7 | 低 | `gh release create` 失败会连带跳过索引 job（npm 已发布但索引不刷新） | `release.yml:109-116` 之后无索引 job；`market-index: needs: publish` | README 的恢复路径（手动跑 Market index）已覆盖；或在 README 明确「Release 创建失败也会跳过索引」 |

另外两条**行为备注**（不算缺陷）：同一 clone 不能二次运行发布脚本（README 已要求一次性 clone）；仅差 build metadata 的版本会让生成器硬失败（A15）。

## 10. 未验证项（不得当作已通过）

| 编号 | 未验证项 | 原因 |
| --- | --- | --- |
| U1 | GitHub Actions 实跑（含 OIDC 首发、runner 的 Node 24 自带 npm 版本、`gh` 可用性） | 本机无法执行 Actions，只能做结构断言与本地等价步骤 |
| U2 | npm Trusted Publishing 侧配置（是否已建 trusted publisher、是否勾选 `npm publish`、2 天首窗） | npmjs.com 维护者动作，本仓库内不可验证 |
| U3 | `setup-node` 的 `registry-url` 写入 `.npmrc`（`_authToken=${NODE_AUTH_TOKEN}` 占位）与 OIDC 首发的交互；是否需要在 publish step 抑制该 .npmrc | 需要真实 OIDC 环境。本地只能确认 workflow 设了 `registry-url`（G 组断言） |
| U4 | DSH 插件市场 UI 端到端（加索引源、安装、更新徽标、重启后 mode picker、图标显示） | 需 GUI 与会写 `.dsh` profile，超出边界 |
| U5 | `main` 分支保护规则现状（`docs/cross-platform.md:122` 称未启用） | 无 `gh` 认证，无法调 API |
| U6 | `market-index` 分支首推后的真实内容/raw URL 200 | 该分支目前**尚不存在**（`git ls-remote --heads origin` 只有 `main`、`feat/market-index`），raw URL 现为 404 |
| U7 | annotated tag 下 `GITHUB_SHA` 语义（`--is-ancestor` 是否仍成立） | README 示例用轻量 tag（`git tag v0.1.4`），annotated tag 未实测；Actions 运行时行为无法本地验证 |
| U8 | 两个 tag 并发发布时的索引新鲜度竞态（D-4） | 推理而未实测 |
| U9 | Linux/macOS 实机安装与 Linux runner 上 bash 脚本实跑 | 本机 Windows + Git Bash；仅验证了 LF/shebang 与脚本逻辑 |
| U10 | `docs/research/market-index-research.md` 卷宗结论 | 评事**未采信**其结论（其 §8 亦自述取证起点不合规）；本报告全部结论来自本次重跑 |

## 11. 边界与副作用声明

- 写操作只落 `docs/verify/market-index-verification.md`；未改任何已跟踪文件、未 `git commit/push/tag`、未 `npm publish`、未改 `.artifacts`、未动 `C:\Users\tb16p\.dsh`。
- 所有实验目录：`%TEMP%\dalisi-market-verify\{parser,fixtures,out,neg,pack,profile,store,pub}`；发布脚本测试的 remote 是 `%TEMP%\dalisi-market-verify\pub\origin.git`（本地 bare），真实 `origin` 只做过 `git ls-remote`（只读）与匿名 `ls-remote` 探活。
- 本文件不进入 npm 包：`package.json` 的 `files` 白名单只含 `docs/cross-platform.md` 与 `docs/images`（`package.json:36-46`）。写本文件后**重新** `npm pack` 复核：仍 15 文件、清单与写之前完全一致、`shasum: 1f5b9d9c25d6f951dc877fdb72a36724de4c3713` 不变、`docs/verify` 不在包内。
- 写本文件后 `git status --porcelain` 只有一行 `?? docs/verify/`，无任何已跟踪文件被修改；`node scripts/verify.mjs` 仍为 `PASS=22 FAIL=0 WARN=1`。

## 12. 复验（e7a030f）

**复验对象**：`e7a030f`（`main`，父 `1b958a2`）。只验首辅指定的三处修复及其相邻口径，**未重跑**上一轮已 PASS 的 106 条（生成器/rc.5 解析/安装/打包/workflow 结构）。
**结论：复验 PASS=40 / FAIL=3**（守卫 G 组 11、dist-tag T 组 20、文档 D 组 12）。D-1、D-2、D-6 已修复且实测通过；残留 3 条全部是**文档一致性**问题（D-8/D-9/D-10），非阻断，不影响 0.1.4 首发。

### 12.1 发布脚本脏树守卫（G 组：11 PASS）

新开临时 lab：本地 bare remote `%TEMP%\dalisi-market-verify\pub2\origin.git` + 从 `e7a030f` 克隆的 seed 与多个一次性 clone；真实 `origin` 只做过只读 `git fetch`/`ls-remote`。

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -c "cd <clone> && bash scripts/publish-market-index.sh; echo `"SCRIPT_EXIT=`$?`""
```

| ID | 场景 | 期望 | 实测 |
| --- | --- | --- | --- |
| G-01 | 仅暂存未提交（改 `CHANGELOG.md` 后 `git add`） | exit 1 | PASS（`SCRIPT_EXIT=1`） |
| G-02 | 拒绝文案 | 含 "modified or staged" | PASS：`refusing to publish from a working tree with modified or staged tracked files; use a disposable clone` |
| G-03 | 暂存内容不得被销毁 | 保留 | PASS：`post-run: staged still present = True`，仍停在 `main`，未切孤儿分支 |
| G-04 | 仅暂存**新增**文件 | exit 1 | PASS |
| G-05 | 仅工作树修改（未暂存） | exit 1 | PASS |
| G-06 | 只有未跟踪文件 | 照旧发布（文档已声明不受保护） | PASS：推送成功，分支仍 3 文件 |
| G-07 | 干净树 + 索引变化 | 推送成功 | PASS：`+ d398c35...a3080f7 HEAD -> market-index (forced update)`，单 root 提交 |
| G-08 | 新 clone 同索引 | `index already current`，无新提交 | PASS：sha 前后同为 `a3080f76`，`rev-list --count=1` |
| G-09 | `bash -n scripts/publish-market-index.sh` | exit 0 | PASS |
| G-10 | 守卫须在「already current」短路之前 | 同索引 + 仅暂存改动仍拒绝 | PASS：仍 exit 1（旧版会走 `:38-42` 短路静默放过） |
| G-11 | 头部注释同步 | 含 "modified or staged" | PASS：`:17-19` |

关键输出：

```text
T7c pre: diff --quiet exit=0 | diff --cached exit=1
refusing to publish from a working tree with modified or staged tracked files; use a disposable clone
SCRIPT_EXIT=1
post-run: staged still present = True ; branch created? main
```

```text
----- T3b clean tree + changed index (expect push, script exit 0) -----
SCRIPT_EXIT=0
Switched to a new branch 'market-index-publish'
 + d398c35...a3080f7 HEAD -> market-index (forced update)
sha before=d398c35f mid=a3080f76 changed=True count=1
branch versions now: 0.1.4, 0.1.3
----- T4b fresh clone same (changed) index (expect already current) -----
index already current for 0.1.4
SCRIPT_EXIT=0
sha after=a3080f76 same=True count=1
```

### 12.2 release.yml 按版本选 dist-tag（T 组：20 PASS）

YAML 用 `js-yaml` 解析后断言（不是肉眼读），再**把 run 块原样摘出**、用假 `npm` 函数记录传参逐版本执行。

```text
[PASS] shell is bash  (bash)
[PASS] version comes from package.json
[PASS] tag defaults to latest
[PASS] case line survives YAML folding
[PASS] npm publish passes --tag "$tag"
[PASS] still uses --access public
[PASS] Node available before publish (setup-node earlier)  (node@1 publish@6)
[PASS] tarball assertions still before publish  (pack@5 publish@6)
[PASS] GitHub Release still after publish  (release@7 publish@6)
release-yaml-summary: PASS=12 FAIL=0
```

YAML 折叠后的 run 块（原样）：

```text
set -euo pipefail
# A prerelease must not move the `latest` dist-tag: the market index skips
# prerelease versions, so `latest` would otherwise point at a version the
# index never lists.
version=$(node -p "require('./package.json').version")
tag=latest
case "$version" in *-*) tag=next ;; esac
npm publish ./dsh-cabinet-mode-*.tgz --access public --tag "$tag"
```

行为矩阵（假 `npm` 记录到的实参）：

```text
[PASS] version=0.1.4           expected=latest  actual=latest
[PASS] version=1.0.0           expected=latest  actual=latest
[PASS] version=0.1.4+build.7   expected=latest  actual=latest
[PASS] version=0.1.5-beta.1    expected=next    actual=next
[PASS] version=0.1.5-rc.1      expected=next    actual=next
[PASS] version=2.0.0-0         expected=next    actual=next
behavioral-summary: PASS=6 FAIL=0
```

真实仓库版本（非 fixture），在 `e7a030f` 的真 clone 里跑同一段 run 块：

```text
node -p "require('./package.json').version"   →  0.1.4        （内嵌 Node 24 亦为 0.1.4）
driver output: STEP_SOURCED_EXIT=0
npm args: publish ./dsh-cabinet-mode-0.1.4.tgz --access public --tag latest
```

CI 命令形态被 npm CLI 接受（`--dry-run`，不上传）：

```text
npm publish <tgz> --dry-run --access public --tag next   → Publishing to https://registry.npmjs.org/ with tag next and public access (dry-run)
npm publish <tgz> --dry-run --access public --tag latest → Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
```

语义闭合：B 组已证索引生成器跳过 prerelease（`scripts/market-index.mjs:130-133`）；现在预发布只落 `next`，`latest` 留在最近稳定版，上一轮 D-6 的「两处口径不一致」消失；0.1.4 走 `latest`，与索引条目一致。

### 12.3 文档措辞与代码行号（D 组：9 PASS / 3 FAIL）

| ID | 检查 | 结果 |
| --- | --- | --- |
| D-01 | `cross-platform.md:125` 引 `lib/index.js:248` 为「读取器用 semver.rcompare 归一排序」 | PASS：该行确为 `}).sort((left, right) => semver.rcompare(left.version, right.version));` |
| D-02 | 同处引 `scripts/market-index.mjs:219-224` 为「降序只是生成器自检」 | PASS：该区间正是 `assert.ok(compareSemver(...) > 0, 'versions must be sorted in descending SemVer order')` |
| D-03 | 同处「跳过 prerelease/deprecated 是生成器策略，读取器不拒绝」 | PASS：与 B 组实测一致（prerelease 解析 ACCEPT） |
| D-04 | 同处「精确 SemVer 且同插件内唯一」 | PASS：`SEMVER` 正则只接受精确版本；重复版本抛 `duplicates` |
| D-05 | `README.zh.md:228` 已改「被修改或已暂存」 | PASS |
| D-06 | `CHANGELOG.md:29-31` 已改 "modified or staged tracked files" | PASS |
| D-07 | `cross-platform.md:125` 括注「（30 字节边界外实测 33 KiB 抛 …）」 | **FAIL（D-8 错字）**：「30 字节边界外」无意义；实测边界是 32 KiB 放行、33 KiB 抛错 |
| D-08 | `README.md:360-361` 英文仍写 "it refuses when a tracked file is **modified**" | **FAIL（D-9 漏改）**：与脚本 `:19`/`:26`、README.zh、CHANGELOG 三处「modified or staged」不一致 |
| D-09 | 预发布走 `--tag next` 是否有文档 | **FAIL（D-10 脚本做了但文档没写）**：只写在 `release.yml:109-111` 的注释；CHANGELOG [0.1.4] 与 README「Releasing」均未提 |
| D-10 | `node scripts/verify.mjs`（release/CI 门禁） | PASS：`PASS=22 FAIL=0 WARN=1` |
| D-11 | tarball 仍 15 文件、无 `docs/verify`、`release.yml:90-103` 8 条断言全中 | PASS |
| D-12 | `--tag` 只影响 dist-tag，索引仍跳过 prerelease（语义一致） | PASS（T-13/T-14/T-15 + B 组） |

三处 FAIL 的建议改法：

- **D-8**：改为「（边界实测：32 KiB 放行、33 KiB 抛 `must not exceed 32 KiB of decoded bytes`）」。
- **D-9**：`README.md:360-361` 改为 "it refuses when a tracked file is modified or staged, but untracked files are not protected."。
- **D-10**：CHANGELOG `[0.1.4]` 的 Added 补一句「pre-release tags publish with `npm publish --tag next`; stable tags use `latest`, so `latest` never points at a version the index does not list」。

> 上一轮 §9 的 D-1/D-2/D-6 已在 `e7a030f` 修复；该表格保留为 `1b958a2` 时点的证据，不再代表当前状态。

### 12.4 本次改动带来的连带变化（供对账）

- **tarball 内容变了**（脚本 + 文档 + README + CHANGELOG 进包）：`shasum` 由 `1f5b9d9c…` → `f752ad59…`，`integrity sha512-kf6XaatyBGhhf…`，包大小 178.6→179.2 kB；**文件数仍 15、清单不变、`docs/verify` 仍不入包、`release.yml` 8 条断言仍全命中**。§5.1 的 shasum 数值在 `e7a030f` 已作废，文件清单结论不变。
- **拒绝文案变更**：`modified tracked files` → `modified or staged tracked files`；§6 表 F01 引用的旧文案在 `e7a030f` 已作废（行为结论不变）。
- **README 行号后移**：新增引导段使后续段落 +8 行，上一轮引用的 `README:349-353`（发布脚本段）现在是 `README:357-361`。
- `node scripts/verify.mjs` 仍为 `PASS=22 FAIL=0 WARN=1`。

### 12.5 registry 现状复核（只读，背景值）

```text
GET https://registry.npmjs.org/dsh-cabinet-mode                        → 404（packument）
GET https://registry.npmjs.org/dsh-cabinet-mode/0.0.0-stage            → 200（版本文档；description 为 Temporary package placeholder for staged publishing）
GET https://registry.npmjs.org/dsh-cabinet-mode/-/dsh-cabinet-mode-0.0.0-stage.tgz → 200
GET https://registry.npmjs.org/dsh-cabinet-mode/0.1.4                  → 404
npm view dsh-cabinet-mode / dsh-cabinet-mode@0.0.0-stage               → E404
```

- 与首辅口述一致：占位版 `0.0.0-stage` 的版本文档与 tarball 都可公开取到；0.1.4 尚未公开。
- **需要修正的口径（N-1，非阻断）**：`README.md:342-344`/`README.zh.md:222` 说「published the public placeholder version `0.0.0-stage`」，但 **packument 仍 404**，`npm view` 与 `npm install dsh-cabinet-mode` 都会 404——占位版是「有版本文档、无可解析包」。建议改写为「占位版 `0.0.0-stage` 已创建（版本文档可访问），在真实版本发布前包仍不可被 `npm view`/`npm install` 解析」。
- 对首发无影响：生成器读 packument（`scripts/market-index.mjs:109-111`），首发前 404，与「First release ordering」一致；0.1.4 一经 tag 发布、packument 出现，索引 job 才可能成功。

### 12.6 对首辅挂起项的判断

- **D-4（force push 无新鲜度护栏）：同意不修。** 单人维护 + `market-index-publish` concurrency 组串行化 + 周更/手动兜底，竞态需两个 tag 的索引 job 交错，概率极低；真要修应做「推送前用 packument 与待推索引比对版本集合」，属结构性改动，不宜压进 0.1.4。
- **D-7（`gh release create` 失败连带跳过索引）：同意不修，但建议 0.1.5 前处理。** 0.1.4 首发若 Release 创建失败，索引不会自动推，用户会看到索引 404（需人工跑 Market index）。低成本修法是把「Create the GitHub Release」拆成独立 job（`needs: publish`），让 `market-index` 只 `needs` npm 发布那个 job；用 `if: always()` 再判结果更绕，不推荐。
- **D-3（CI 不校验生成物）/D-5（npm script 未写进 README）**：本轮未动，维持上一轮建议。

### 12.7 复验边界

- 只追加本文件；未改脚本/workflow/其它文档；未 `git commit/push/tag`；未 `npm publish`（只做 `--dry-run`）。
- 未重跑已 PASS 的 106 条；§10 的 10 条未验证项继续有效。
- 本轮新增未验证：真实 tag 触发的 Actions 端到端（U1）、npm 侧 trusted publisher 的实际放行（U2）、`--tag` 在真实 OIDC 发布下的行为（本轮只到 npm CLI 接受该参数）。
