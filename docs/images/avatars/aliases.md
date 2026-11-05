# Member names and portraits / 成员命名与头像

Use these canonical runtime names for new teammates. The displayed Chinese title is separate from the exact identity used by Owner/task filtering and message routing. Do not rename existing members merely to change their portrait.

| Office / 显示官职 | New member name / 推荐原始名 | Compatible examples / 兼容示例 |
| --- | --- | --- |
| 内阁首辅 | `lead` | `shoufu`, `neige-shoufu`, `daxueshi`, 首辅、内阁大学士 |
| 翰林院编修 | `hanlin-bianxiu` | `hanlin`, `hanlinyuan-bianxiu`, `bianxiu`, 翰林编修、翰林院编修 |
| 工部尚书 | `gongbu-shangshu` | `works`, `gongbu-zhushi`, `gongbuzhushi`, `zhushi`, 工部主事、工部尚书 |
| 大理寺卿 | `dalisi-qing` | `dali`, `dalisi`, `dalisi-pingshi`, `dalisipingshi`, `pingshi`, 大理寺评事、大理寺卿 |
| 左都御史 | `zuodu-yushi` | `yushi`, `jiancha-yushi`, `jianchayushi`, `duchayuan-yushi`, `zuoduyushi`, `zuo-du-yushi`, 监察御史、都察院御史、左都御史 |

Hyphenated aliases also accept underscores, dots and spaces, so `jiancha_yushi` and `jiancha.yushi` resolve to the same portrait. Matching ignores case and surrounding whitespace. Numeric suffixes and separated qualifiers are supported, such as `dalisi2`, `dalisi2-review` and `dalisi-qing-2`. Raw names remain visible, so aliases do not collapse distinct identities.

复合别名支持连字符、下划线、点号和空格，兼容大小写与首尾空白；支持数字后缀和分隔的任务标记。历史主事、评事和监察御史名称作为角色别名兼容，显示当前设定的高阶官职；这些是插件角色映射，不是宣称历史官职的品级相同。

`hanlinx`, `jiancha-yushix`, `dalisiX` and `x-dalisi` are deliberately not assigned an office. Every unknown member receives the light unranked portrait below and keeps its raw name; unknown names are never silently classified as an official. The plugin cannot enumerate arbitrary future member names, but none needs a dark or empty image placeholder.

![Unknown member: light unranked portrait](../../../src/avatars/neutral.png)

Both Cabinet cards and injected native roster images call the same mapping. Native roster image sources are refreshed on name changes and rebuilt popovers; cleanup removes injected nodes and stops observation. Automated tests cover every registered alias and both paths. Browser checks use the production renderer/injector in a local UI fixture; they are not a live-agent-session end-to-end test.
