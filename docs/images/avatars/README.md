# Cabinet portrait design / 内阁头像设计

These are original AI-generated chibi illustrations. The requested reference is 撷芳主人《大明衣冠图志》; no individual plate was inspected or copied, and these images are not claimed to reproduce the book. The costume setting draws on the textual sources below, with simplified embroidery for small UI portraits.

本组为原创 AI 生成 Q 版插画。用户指定参考撷芳主人《大明衣冠图志》，但本次未逐页核对或复制画册图版，不宣称逐幅复刻或完整历史复原。采用明中后期常服的乌纱帽、圆领袍、方形胸补；纹样为适应头像而作简化。

| Key | Role / 官职设定 | Rank and badge / 品级与补纹 |
| --- | --- | --- |
| lead | 内阁首辅，以加一品衔大学士作艺术设定 | 鹤 / crane; 首辅本身不是固定品阶 |
| hanlin | 翰林院编修 | 正七品，鸂鶒 / ornamental duck |
| works | 工部尚书 | 正二品，锦鸡 / golden pheasant |
| dali | 大理寺卿 | 正三品，孔雀 / peacock |
| yushi | 左都御史 | 正二品，风宪官獬豸 / xiezhi |

Sources: [《明史》卷六十七·舆服三](https://zh.wikisource.org/wiki/明史/卷67), [卷七十二·职官一](https://zh.wikisource.org/wiki/明史/卷72), [卷七十三·职官二](https://zh.wikisource.org/wiki/明史/卷73). The five-to-seven-rank blue rule concerns 公服; the chosen burgundy, teal, rust, slate and plum palette is artistic, not a claim about mandatory 常服 colours. 大理寺卿 is not assigned the censor's xiezhi badge.

The original PNGs are 1254×1254. Run `python3 src/build_avatars.py` from the repository root (Pillow required) to regenerate all 128×128 PNGs, `src/avatars.js`, and the marked avatar region of `client.js`. Exact generation prompts are recorded in [prompts.json](prompts.json). Existing role matching and original member names are preserved.

Full-size and 128px artwork are visually reviewed; automated tests only check PNG dimensions and byte parity between files and embedded modules. At 22–24px, embroidery details are not reliably readable: use the adjacent role and member labels, not colour or badge alone, to identify a member.

Version 0.2.6 raises the three requested offices and redraws Works and Dali badges accordingly. The approved faces, palette and style are retained; the censor badge remains xiezhi. Old 主事、评事、监察御史 aliases remain compatible, with original member names visible. The edit prompts reference the Works and Dali originals at tag v0.2.5.
