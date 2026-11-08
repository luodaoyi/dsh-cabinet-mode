# 同任务压提示词前后 Token 对比（task-22/23/24 实验记录）

- 日期 2026-11-08 至 11-09；任务书 /tmp/ab-task.txt（1011B，A/B 同文未改）：调研定量 → 压令制/十一/四员 → verify。
- **结论先行：字符层 A/B 已实测；token 层 A/B 两跑同任务已跑完（同 task 书、同模型、同 headless 载体、同工具面），差值按实数。**

## 一、字符层（node 同法抽取；A=git archive e1f0058，B=压缩后工作区）

| 注入体 | A | B | Δ字符 | Δ% |
|---|---:|---:|---:|---:|
| persona 前缀（cordis.patch.yml `prefix: |-` 块，去缩进拼接） | 2327 | 2233 | −94 | −4.0% |
| DEFAULT_LEAD_PROMPT（index.js 反引号体） | 902 | 581 | −321 | −35.6% |
| 成员提示 hanlin/works/dali/yushi | 179/156/134/174 | 79/69/49/58 | −288（合计） | −53.0% |
| **首辅每轮注入合计（persona+lead）** | **3229** | **2814** | **−415** | **−12.9%** |
| UTF-8 字节 persona / lead | 5972 / 2473 | 5698 / 1672 | −274 / −801 | −4.6% / −32.4% |
| 载体文件 AGENTS.md（persona+lead 全文） | 3231 字 | 2816 字 | −415 | −12.9% |

注：①A persona 2327 与 docs/research-token-budget.md 基线一致；该文档记 lead=899，本次同法抽得 902（差 3 字符，抽取口径差，未细究）。②两跑同法同锚点，横向可比。

## 二、Token 层（A/B 同任务实跑对照；AGENTS.md 载体，headless 隔离档）

- 口径（session json，非估算）：`rows.tokenUsage.val.totals`、`rows.contextBreakdown.val.breakdown`、`rows.sessionStats.val`；载体 `$DSH_HOME/AGENTS.md`（agent-instructions 插件，预算 65536B）。
- 探针证据：唯一标记 `PROBE_K7M3Q9` 被模型回显，session.v4.jsonl 含人设首尾；`systemTokens` 恒 647——**AGENTS.md 进的是消息通道，不是 system 通道**（与 web 的 persona 直注 system 不同，token 差只体现在 messageTokens）。

| 项目 | A（e1f0058） | B（压缩后） | 差值（B−A） | % |
|---|---:|---:|---:|---:|
| AGENTS.md 载体字符 | 3231 | 2816 | −415 | −12.9% |
| messageTokens | 80469 | 53979 | **−26490** | **−32.9%** |
| uncachedInputTokens | 122400 | 82016 | −40384 | −33.0% |
| outputTokens | 84292 | 42122 | −42170 | −50.0% |
| cacheReadTokens | 3081408 | 1930688 | −1150720 | −37.3% |
| systemTokens | 647 | 647 | 0 | 0% |
| toolsTokens | 4899 | 4899 | 0 | 0% |
| 起止 / exit / 门禁 | 11-08 23:56:46 → 11-09 00:32:49 / 0 / PASS=43 FAIL=0 WARN=1 | 未记 / 0 / PASS=43 | — | — |
| 模型 / 轮数 / 步数 | 未写入 session（null）/ 未写入 / 未写入 | 同左 | — | — |
| session / 日志 / 数字 | 5cc8caf7… / /tmp/ab-runA2.log / /tmp/ab-numbers-A.json | /tmp/ab-numbers-B.json | — | — |

- **未验证**：cacheWriteTokens（B 未给该键）；modelSelection、sessionStats（A 为 null，B 未报）；cacheRead 高度依赖会话历史与重试路径，只作参考、不当受控变量。
- 观察：同 task 书下 B 的 output 约为 A 的一半，主要来自压缩后任务不再撞 `dump-config` 折行与 `verify` 断言，A 自报曾 FAIL 后改词复跑（原文在 /tmp/ab-runA2.log 尾部）。

## 三、卡点记录（受阻三件＋网检，已解）

1. **卡点**：隔离 DSH_HOME 的 headless 档曾连败于 `preset-cabinet (@deepseek-ai/dsh-agent-preset): pending (waiting for service: agentPresets)`——cabinet 人设不进 system，A/B 无从测。
2. **已试六法（均 exit0 非崩溃）**：①裸隔离家 → `MISSING_CREDENTIAL: llm-deepseek … deepseek-official`；②链 .credentials.yaml/.env/.mimo.env/settings.yaml → 同错（本机无该键，症在路由）；③`--patch` live headless 层改 magpie 路由 → 路由通但 preset 仍 pending；④node_modules 软链修 cabinet-ui 导入失败 → cabinet-ui 活、preset 仍 pending；⑤registry 进 --patch 层 → 仍 pending；⑥registry 并入插件包层 → 仍 pending。
3. **网检＋改法**：registry 服务与消费方须同 `cordis:group` Host realm（dsh-agent-preset-registry/README.zh.md:58）；web 的 registry 出自 dsh-web-app bundle（dsh-web-app/cordis.patch.yml:590-594）；dsh-headless/cordis.patch.yml:1-7 自述 “directly over dsh-base … mounts no Host”——从 profile/patch/插件三层补 registry 进不了 Host realm。**首辅裁：不补 registry、不动 bundle、不重启、不试 tui**，改走 AGENTS.md 载体（dsh-agent-instructions：$DSH_HOME/AGENTS.md，lib/index.js:168,655-656）；该通道已由探针证实可用，A/B 两跑即在此通道完成。

## 四、跑法与脚手架（断点可续；本轮已换成 AGENTS.md 载体）

- 载体：AGENTS.md_A / AGENTS.md_B = e1f0058 版与压缩版 persona+lead 全文（/tmp/ab-agents-A.md、/tmp/ab-agents-B.md）。
- 工作副本：/tmp/ab-run-A2（A）、/tmp/ab-run-B2（B，由 gongbu-shangshu-2 跑），均从 /tmp/ab-run-clean.tar 解出并整平到仓库根；补丁 /tmp/ab-patch.yml = live headless 层（magpie 路由）只读共用。
- 跑法：`cd <副本> && DSH_HOME=<隔离家> DSH_PERMISSION_MODE=danger-full-access dsh --profile headless --patch /tmp/ab-patch.yml "$(cat /tmp/ab-task.txt)"`（headless 默认 approval=ask 会卡死，必须给该环境变量；前台上限 10 分钟，长跑需连环阻塞等待，不得停手待命）。
- **载体已换 AGENTS.md，bundle/重启/tui 已否**；本轮未改仓内代码、未装 live、未重启、未提交（PR 另见 task-26）。
