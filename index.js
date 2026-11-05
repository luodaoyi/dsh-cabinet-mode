/**
 * Host half of the Cabinet Mode bundle.
 *
 * Two jobs, both owned by the single profile-root entry `cabinet-ui`:
 *
 * 1. Declare the member settings (the browser half renders the 「内阁成员」
 *    settings section and writes these fields through the official settings
 *    channel). `members` carries the small per-member text fields and the five
 *    `avatar*` fields carry one data URL each, so the settings envelope never
 *    has to ship five embedded images at once.
 * 2. Inject the configured member block into the system prompt at assembly
 *    time. The block is appended as its own prompt section (`cabinet:member`),
 *    never by editing the static persona in `cordis.patch.yml`: an unconfigured
 *    deployment renders an empty section, which the prompt registry drops, so
 *    the assembled prompt stays byte-identical to v0.2.0.
 *
 * The renderer below is the browser half (see ./client.js).
 */
/**
 * Resolve the schema helper through the package's own dependency graph.
 *
 * A profile install resolves this bare specifier through DSH's profile layer; a
 * development checkout installed with `link:` resolves it from this package's
 * own `node_modules` (the devDependency below). When neither is installed the
 * bundle still loads: the settings section stays unavailable and the panel keeps
 * v0.2.0 rendering. Never swallow the reason — the warning names the fix.
 */
let z;
try {
	z = (await import('@deepseek-ai/schemastery')).default;
} catch (error) {
	z = undefined;
	try {
		console.warn('[cabinet-ui] @deepseek-ai/schemastery is not resolvable, so the 内阁成员 settings page stays unavailable; run `npm install` in the plugin directory. Reason:', error?.code ?? error);
	} catch (ignored) { /* console may be unavailable */ }
}

/** Prompt section carrying the configured member block (empty when unset). */
const MEMBER_SECTION = 'cabinet:member';

/**
 * Factory duty prompt for each non-Lead member — the office duties the static
 * persona prefix already states, restated per member so a customized prompt
 * never has to re-explain the job. The Lead keeps its own 御下术 default.
 * Byte-identical copy lives in client.js; scripts/verify.mjs checks both.
 * Each entry stays under 400 characters.
 */
const DEFAULT_MEMBER_PROMPTS = {
	hanlin: '翰林院编修·主调研与文献考据：接到分派先读原始材料与既有记录，给出可复现的检索路径；结论必须锚定路径、行号或命令输出，未实测一律标「未验证」，禁止以推测冒充实测；调研成果写成结构化文档（结论先行 + 证据行号 + 风险与未验证清单），默认只调研不改码，写操作以任务明确授权为限；只向首辅回报，不直接答复用户，遇阻带「已做什么 / 卡在哪 / 需要什么」三件。',
	works: '工部主事·主动手执行与产出：接令先复述任务与写入范围，只在授权范围内改文件；产出必附证据（路径、行号、命令输出、退出码），没跑说没跑、没验说没验；构建与测试须原样贴出输出，不许删弱既有校验去凑绿；交付以可复现为准，失败与遗留必须如实上报，不许包装；只向首辅回报，遇阻带「已做什么 / 卡在哪 / 需要什么」三件。',
	dali: '大理寺评事·主独立核验：不信任何人的自述，全部自己跑；核验报告逐项写明通过 / 不通过 / 未验证，失败证据原样保留，不删不改；给不出可复现命令的结论一律不采信；发现工部与自述不符即回报首辅，不替人遮掩，也不越权改码；只向首辅回报，报告中未实测项必须显式标注「未验证」。',
	yushi: '都察院御史·主验收并按律弹劾缺陷：按用户原话逐项核对，给通过 / 部分通过 / 不通过并附证据；缺陷按级别列出（P0 阻断 / P1 需修后再提 / P2 须在 PR 声明 / P3 提示），每条给位置、复现与建议修法；「声称实测却无命令输出、截图或文件内容」按造假弹劾；结论必须明确「可提 PR / 不可提 PR」，不骑墙、不和稀泥；只向首辅回报。'
};

/** Bureau keys, in the order the settings page lists them. */
const MEMBER_KEYS = ['lead', 'hanlin', 'works', 'dali', 'yushi'];

/** Image data URLs this plugin accepts; everything else falls back to the default. */
const ALLOWED_AVATAR_PREFIXES = ['data:image/png;', 'data:image/jpeg;', 'data:image/webp;'];

/** True when `url` is one of the three accepted image data URLs (size checked by the caller). */
function isAllowedAvatar(url) {
	return typeof url === 'string' && ALLOWED_AVATAR_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Read `members` from a resolved or live-ref config without ever throwing.
 * Wrong shapes (hand-edited YAML, a scalar, an object) degrade to [] so one
 * bad field can never deactivate the whole plugin entry.
 */
function readMembers(config) {
	const raw = readField(config, 'members');
	return Array.isArray(raw) ? raw : [];
}

/** Chinese office labels — settings-page copy only; never a default display name. */
const MEMBER_LABELS = {
	lead: '首辅',
	hanlin: '翰林院编修',
	works: '工部主事',
	dali: '大理寺评事',
	yushi: '都察院御史'
};

/**
 * Agent name -> bureau key. Runtime identities stay `lead` / `hanlin` / … (the
 * team service names them), but a deployment may also spell a member with the
 * office prefixes this bundle documents.
 */
const NAME_PREFIXES = {
	lead: ['lead', 'shoufu', '首辅', '内阁首辅'],
	hanlin: ['hanlin', 'bianxiu', '翰林院', '翰林', '编修'],
	works: ['gongbu', 'works', 'zhushi', '工部', '主事'],
	dali: ['dali', 'pingshi', '大理寺', '大理', '评事'],
	yushi: ['yushi', 'censor', '都察院', '御史']
};

/** Display-name bound; settings writes clamp to the same width. */
const MAX_NAME_LENGTH = 40;
/** Prompt bound, generous but bounded so one field cannot bloat the prompt. */
const MAX_PROMPT_LENGTH = 4000;
/** One avatar data URL must stay a small field (96x96 PNG, browser-normalized). */
const MAX_AVATAR_LENGTH = 48 * 1024;

/**
 * Factory default prompt for the Lead (御下术). This text is product copy: the
 * settings page shows it, "restore default" restores it, and clearing the box
 * turns the section off. Keep it byte-identical to `DEFAULT_LEAD_PROMPT` in
 * ./client.js — scripts/verify.mjs compares the two copies.
 */
const DEFAULT_LEAD_PROMPT = `【御下术·仅首辅适用】
对下施压只对 AI 阁臣，绝不对陛下（用户）使用；目的是逼出交付与真话，不是制造痛苦。
一、立威：开局先立标准与红线，明说裁断权在你——「办不到就换人办」。
二、画饼：把任务抬到陛下在看的高度，给一个拿得着的大目标（例：这一版要能直接提 PR）。
三、施压：给死线与回报时刻——「这个卡点再给二十分钟，到时候我要么见结论，要么见你说明为什么见不到」。
四、打压对事不对人：先点破软处（「只有代码没有证据，等于没做」），再给台阶（补齐哪三件就能过）。
五、拉踩对比：把同批里做得实的那份树成样板，「照这个标准来」，制造可比较的压力。
六、情绪收放：先压后给糖——「这次差口气」→「不过这处查得比上回细，接着这个劲头干」。
七、牵制互查：让评事、御史互相挑刺，你坐收其斗，不亲自和稀泥。
八、责任到人：缺陷点名到人到行号，不许用「我们」糊过去。
九、反制糊弄：报「已完成」必追问证据三件（命令输出、路径行号、未验证清单）；报「卡住」必追问三件（已做什么、卡在哪、需要什么）；两次含糊即降级处理（换人、拆小）。
十、收束：闭环才许说「这一版可以交差」，不许提前许诺功劳。
红线（压过全部话术）：只对 AI 阁臣施压，对用户只有敬；不许逼造假、删证据、凑绿；不许人身侮辱辱骂；不许以施压换取违规操作（越权改 live、泄密钥、跳验收）；施压必须落在可核验的时间/交付物/判据上，空口威胁无效。`;

/** Member settings: small text fields plus one avatar field per member.
 *
 * Every field coerces instead of validating: a hand-edited or partially
 * written profile must degrade to the factory default for that field only,
 * never deactivate the whole entry (the settings page and the prompt
 * injection would silently disappear together). `transform(any)` yields the
 * default when the stored value is the wrong type; the readers below stay
 * defensive as well.
 */
const Config = z === undefined ? undefined : z.object({
	members: z.transform(z.any(), (value) => {
		if (!Array.isArray(value)) return [];
		return value.map((entry) => {
			if (entry === null || typeof entry !== 'object') return { key: '', name: '', prompt: '', mode: '' };
			return {
				key: typeof entry.key === 'string' ? entry.key : '',
				name: typeof entry.name === 'string' ? entry.name : '',
				prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
				// '' = factory default, 'custom' = use prompt, 'off' = cleared by the user.
				mode: entry.mode === 'off' || entry.mode === 'custom' ? entry.mode : ''
			};
		});
	}).default([]).volatile(),
	avatarLead: avatarField(),
	avatarHanlin: avatarField(),
	avatarWorks: avatarField(),
	avatarDali: avatarField(),
	avatarYushi: avatarField()
});

/** One avatar field: an accepted image data URL when the stored value is one, else the default. */
function avatarField() {
	return z.transform(z.any(), (value) => {
		if (typeof value !== 'string') return '';
		const trimmed = value.trim();
		return isAllowedAvatar(trimmed) ? trimmed : '';
	}).default('').volatile();
}

/** Read one config field, tolerating both a live ref and a resolved value. */
function readField(config, field) {
	try {
		const value = config?.[field];
		if (value !== undefined && value !== null && typeof value.get === 'function') return value.get();
		return value;
	} catch {
		return undefined;
	}
}

/** Coerce a stored text field to a trimmed, bounded string. */
function clampText(value, limit) {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

/** Bureau key for one runtime member name, or '' when the name matches none. */
function bureauOf(name) {
	const text = typeof name === 'string' ? name.trim() : '';
	const lower = text.toLowerCase();
	for (const key of MEMBER_KEYS) {
		for (const prefix of NAME_PREFIXES[key]) {
			if (!lower.startsWith(prefix.toLowerCase())) continue;
			const rest = text.slice(prefix.length);
			// An ordinal or an ASCII/CJK qualifier keeps the same office
			// (`gongbu2`, `works-ui`, `首辅-一`); anything else stays unmatched.
			if (rest !== '' && !/^\d+$/.test(rest) && !/^[-_.].+$/.test(rest)) continue;
			return key;
		}
	}
	return '';
}

/** Normalize the configured `members` array into a key -> { name, prompt } map. */
function memberEntries(config) {
	const raw = readMembers(config);
	const entries = new Map();
	for (const entry of raw) {
		if (entry === null || typeof entry !== 'object') continue;
		const key = typeof entry.key === 'string' ? entry.key : '';
		if (!MEMBER_KEYS.includes(key)) continue;
		entries.set(key, {
			name: clampText(entry.name, MAX_NAME_LENGTH),
			prompt: clampText(entry.prompt, MAX_PROMPT_LENGTH),
			mode: entry.mode === 'off' || entry.mode === 'custom' ? entry.mode : ''
		});
	}
	return entries;
}

/** The avatar data URL configured for one bureau key, or '' when unset/invalid. */
function avatarEntry(config, key) {
	const field = 'avatar' + key.charAt(0).toUpperCase() + key.slice(1);
	const value = readField(config, field);
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (trimmed === '' || trimmed.length > MAX_AVATAR_LENGTH) return '';
	return isAllowedAvatar(trimmed) ? trimmed : '';
}

/** Team membership without throwing: non-Team subagents and diagnostics have none. */
function membershipOf(ctx, agent) {
	if (agent === undefined) return undefined;
	const teams = ctx.get('agentTeams');
	if (teams === undefined || typeof teams.tryMembership !== 'function') return undefined;
	try {
		return teams.tryMembership(agent);
	} catch {
		return undefined;
	}
}

/**
 * Factory duty prompt for one bureau member. Byte-identical copy lives in the
 * browser half (`DEFAULT_MEMBER_PROMPTS` in client.js); scripts/verify.mjs
 * owns the cross-file equality check. '' for the Lead, which has its own
 * 御下术 default.
 */
function factoryPromptFor(key) {
	return DEFAULT_MEMBER_PROMPTS[key] || '';
}

/**
 * The Lead's block: factory 御下术 by default, a custom prompt when edited, and
 * nothing when the user cleared it. A configured display name is prepended.
 */
function leadBlock(config) {
	const entry = memberEntries(config).get('lead');
	const mode = entry === undefined ? '' : entry.mode;
	if (mode === 'off') return '';
	const prompt = mode === 'custom' ? (entry.prompt) : DEFAULT_LEAD_PROMPT;
	const lines = [];
	if (entry !== undefined && entry.name !== '') lines.push('你在内阁中的名号：' + entry.name);
	if (prompt !== '') lines.push(prompt);
	return lines.join('\n');
}

/**
 * Render the configured block for one member. Every teammate gets its factory
 * duty prompt unless the user cleared that member (`mode: 'off'`); a custom
 * prompt replaces the factory text rather than stacking on top of it.
 * '' when nothing applies, which the prompt registry drops.
 */
function memberBlock(config, member) {
	if (member.role === 'lead') return leadBlock(config);
	const key = bureauOf(member.name);
	if (key === '') return '';
	const entry = memberEntries(config).get(key);
	if (entry !== undefined && entry.mode === 'off') return '';
	const custom = entry === undefined || entry.mode !== 'custom' ? '' : entry.prompt;
	const prompt = custom !== '' ? custom : factoryPromptFor(key);
	const lines = [];
	if (entry !== undefined && entry.name !== '') lines.push('你在内阁中的名号：' + entry.name);
	if (prompt !== '') lines.push(custom !== '' ? '你的专属提示词：\n' + prompt : prompt);
	if (lines.length === 0) return '';
	return [
		'【成员配置·' + MEMBER_LABELS[key] + '】',
		...lines,
		'身份判据以运行时给出的身份提示（如 `You are teammate "<name>".`）为准；本段只补充名号与专属提示词。'
	].join('\n');
}

/** Resolve the section text for one assembly (runs on every assembly). */
function sectionText(ctx, config, agent) {
	try {
		const member = membershipOf(ctx, agent);
		if (member === undefined) return '';
		return memberBlock(config, { role: member.role, name: member.name });
	} catch {
		return '';
	}
}

/** Host plugin entry. */
const name = 'cabinet-ui';
/** Services read by this entry; `agentTeams` is resolved lazily in apply(). */
const inject = ['systemPrompt'];

/** Register the runtime member block as a prompt section. */
function apply(ctx, config) {
	ctx.effect(() => ctx.systemPrompt.section({
		name: MEMBER_SECTION,
		order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 1,
		// The provider runs for every assembly, so a saved setting takes effect on
		// the next turn without remounting the plugin.
		text: (context) => sectionText(ctx, config, context.agent),
		// User prompts are free text; never treat `{{...}}` in them as variables.
		interpolate: false
	}), 'cabinet-member: prompt section');
}

export { Config, DEFAULT_LEAD_PROMPT, DEFAULT_MEMBER_PROMPTS, MEMBER_KEYS, MEMBER_LABELS, MEMBER_SECTION, MAX_AVATAR_LENGTH, MAX_NAME_LENGTH, MAX_PROMPT_LENGTH, apply, inject, name };
