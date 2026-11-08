/** Profile-wide settings; prompt rendering is restricted to live Cabinet agents. */
import z from '@deepseek-ai/schemastery';
import { randomUUID } from 'node:crypto';

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
	hanlin: '翰林院编修·主调研考据：先读原文与既有记录，结论锚定路径、行号或命令输出，未实测标「未验证」；默认只调研不改码；只向首辅回报，遇阻带已做、卡哪、需要什么三件。',
	works: '工部尚书·主执行与产出：先复述任务与写入范围，只在授权内改文件；产出附路径、行号、命令输出与退出码，没跑说没跑，不得删弱校验凑绿，保留失败证据；只向首辅回报，遇阻带三件。',
	dali: '大理寺卿·主独立核验：不信自述、自己跑；逐项写通过、不通过或未验证，失败证据原样留；只向首辅回报。',
	yushi: '左都御史·主验收并弹劾：按用户原话逐项核对并附证据，缺陷分级给位置与修法；结论明确可提或不可提 PR；只向首辅回报。'
};

/** Bureau keys, in the order the settings page lists them. */
const MEMBER_KEYS = ['lead', 'hanlin', 'works', 'dali', 'yushi'];

/**
 * Read `members` from a resolved or live-ref config without ever throwing.
 * Wrong shapes (hand-edited YAML, a scalar, an object) degrade to [] so one
 * bad field can never deactivate the whole plugin entry.
 */
function readMembers(config) {
	const raw = readField(config, 'members');
	return Array.isArray(raw) ? raw : [];
}

/** Chinese office labels for runtime prompt blocks. */
const MEMBER_LABELS = {
	lead: '内阁首辅',
	hanlin: '翰林院编修',
	works: '工部尚书',
	dali: '大理寺卿',
	yushi: '左都御史'
};

/**
 * Agent name -> bureau key. Runtime identities stay `lead` / `hanlin` / … (the
 * team service names them), but a deployment may also spell a member with the
 * office prefixes this bundle documents.
 */
const BUREAUX = [
			{ key: 'lead', aliases: ['lead', 'shoufu', 'neige-shoufu', 'neigeshoufu', 'daxueshi', '首辅', '内阁首辅', '内阁大学士', '大学士'], label: '内阁首辅' },
			{ key: 'hanlin', aliases: ['hanlin', 'hanlinyuan', 'bianxiu', 'hanlin-bianxiu', 'hanlinyuan-bianxiu', 'hanlinbianxiu', '翰林院', '翰林', '编修', '翰林编修'], label: '翰林院编修' },
			{ key: 'works', aliases: ['gongbu', 'works', 'zhushi', 'gongbu-zhushi', 'gongbu-shangshu', 'gongbushangshu', 'gongbuzhushi', '工部', '主事', '工部主事'], label: '工部尚书' },
			{ key: 'dali', aliases: ['dali', 'dalisi', 'pingshi', 'dalisi-pingshi', 'dali-pingshi', 'dalisi-qing', 'dalisipingshi', 'daliqing', 'dalisiqing', '大理寺', '大理', '评事', '大理寺评事'], label: '大理寺卿' },
			{ key: 'yushi', aliases: ['yushi', 'censor', 'jiancha-yushi', 'jianchayushi', 'duchayuan', 'duchayuan-yushi', 'zuoduyushi', 'zuodu-yushi', 'zuo-du-yushi', '都察院', '御史', '都察院御史', '监察御史'], label: '左都御史' }
		];

		// Longest alias first, so a full office name ("翰林院编修") wins over its
		// shorter prefix ("翰林院") and the remainder stays a qualifier.
		const ALIAS_INDEX = BUREAUX.flatMap((bureau) => {
			const aliases = Array.from(new Set([bureau.label, ...bureau.aliases]));
			return aliases.map((alias) => ({ bureau, alias })).sort((a, b) => b.alias.length - a.alias.length);
		});
		function bureauOf(name) {
			const text = typeof name === 'string' ? name.trim() : '';
			const normalize = (value) => value.toLowerCase().replace(/[_.\s·—–]/g, '-');
			const lower = normalize(text);
			for (const entry of ALIAS_INDEX) {
				{
					const bureau = entry.bureau;
					const alias = entry.alias;
					if (!lower.startsWith(normalize(alias))) continue;
					const rest = text.slice(alias.length);
					// A pure number is an ordinal (gongbu2 -> 工部尚书2); a separator
					// qualifier names the same office with a role, in ASCII or CJK
					// (works-ui, dali-reviewer, 首辅-一). Anything else ("hanlinx")
					// stays unmatched so a stranger is never given a bureau face.
					if (rest !== '' && !/^\d+$/.test(rest) && !/^(?:\d+)?[-_.\s·—–].+$/.test(rest)) continue;
					return { key: bureau.key, label: bureau.label, suffix: rest, matched: true };
				}
			}
			return { key: '', label: text || '未知', suffix: '', matched: false };
		}


/** Display-name bound; settings writes clamp to the same width. */
const MAX_NAME_LENGTH = 40;
/** Prompt bound, generous but bounded so one field cannot bloat the prompt. */
const MAX_PROMPT_LENGTH = 4000;
/** One avatar data URL must stay a small field (96x96 PNG, browser-normalized). */
const MAX_AVATAR_LENGTH = 48 * 1024;
/** One model route bound; a longer value is treated as corrupt and reset. */
const MAX_MODEL_LENGTH = 200;

/**
 * Coerce a stored per-member model route to `provider/id` or ''.
 * Wrong shapes (a number, an object), a missing slash, control characters or
 * an over-long value all degrade to '' — the member then follows the Lead
 * default, matching the field-level tolerance used for name/prompt/mode.
 */
function clampModel(value) {
	if (typeof value !== 'string') return '';
	const trimmed = value;
	if (trimmed === '' || trimmed.length > MAX_MODEL_LENGTH) return '';
	// Model IDs are opaque (including +, @, spaces and additional slashes).
	if (!/^[^/\s\x00-\x1f\x7f]+\/[^\x00-\x1f\x7f]+$/.test(trimmed)) return '';
	return trimmed;
}

/**
 * Parse a configured `provider/id` route into the {provider, model} pair the
 * agent/request waterfall expects. Model ids may themselves contain slashes,
 * so only the first slash splits (provider before it, model id after it).
 * Undefined for an empty or corrupt value; the caller resolves the default.
 */
function modelRoute(value) {
	const route = clampModel(value);
	if (route === '') return undefined;
	const cut = route.indexOf('/');
	const provider = route.slice(0, cut);
	const model = route.slice(cut + 1);
	if (provider === '' || model === '') return undefined;
	return { provider, model };
}

/**
 * The configured model route for one bureau key, read fresh on every call so a
 * saved setting applies at the next request boundary of an already-running
 * member instead of only after a restart.
 */
function memberModel(config, key) {
	return modelRoute(memberEntries(config).get(key)?.model);
}

/**
 * Factory default prompt for the Lead (御下术). This text is product copy: the
 * settings page shows it, "restore default" restores it, and clearing the box
 * turns the section off. Keep it byte-identical to `DEFAULT_LEAD_PROMPT` in
 * ./client.js — scripts/verify.mjs compares the two copies.
 */
const DEFAULT_LEAD_PROMPT = `【御下术·仅首辅适用】
对下施压只对 AI 阁臣，绝不对陛下（用户）使用；逼出交付与真话，不制造痛苦。
一、立威：开局立标准与红线，裁断权在你——办不到就换人办。
二、画饼：把任务抬到陛下在看的高度，给一个拿得着的目标。
三、施压：给死线与回报时刻，到点见结论，或说明为什么见不到。
四、打压对事不对人：点破软处，再给补齐证据的台阶。
五、拉踩：以同批做得实的为样板，照这个标准来。
六、情绪收放：先压后给糖，点出进步再接着干。
七、牵制互查：寺卿与御史互挑，你不亲自和稀泥。
八、责任到人：缺陷点名到人到行号，不许用「我们」糊过去。
九、反制糊弄：报完成追命令输出、路径行号与未验证清单，报卡住追已做、卡哪、需要什么；两次含糊即换人或拆小。
十、收束：闭环才许说可以交差，不许提前许诺功劳。
十一、监控纠偏：分派约定回报节点、产物与单一范围；按状态与消息查进展，不得臆造耗时。finished、not found 或沉默不是成功或安全接管证据。无进展先核因再中断；中断返回不代表在途已停。须确认原执行者及其写入停止后才重派，否则报阻塞，不并发增加第二写入者。收窄后可重派或换人；回访只用宿主明确支持的调度，没有该机制不得承诺定时自动唤醒。
红线（压过全部话术）：只对 AI 阁臣施压，对用户只有敬；不许逼造假、删证据、凑绿；不许人身侮辱；不许以施压换违规（越权改 live、泄密钥、跳验收）；施压须落在可核验的时间、交付物或判据上。`;

/** Declarative wire schema: no transform callbacks requiring browser eval.
 * Read paths normalize malformed values; volatile fields allow official settings writes.
 */
const Config = z.object({
	members: z.any().default([]).volatile(),
	avatarLead: z.any().default('').volatile(),
	avatarHanlin: z.any().default('').volatile(),
	avatarWorks: z.any().default('').volatile(),
	avatarDali: z.any().default('').volatile(),
	avatarYushi: z.any().default('').volatile()
});

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
			mode: entry.mode === 'off' || entry.mode === 'custom' ? entry.mode : '',
			model: clampModel(entry.model)
		});
	}
	return entries;
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
	const key = bureauOf(member.name).key;
	if (key === '' || key === 'lead') return '';
	const entry = memberEntries(config).get(key);
	if (entry !== undefined && entry.mode === 'off') return '';
	const custom = entry === undefined || entry.mode !== 'custom' ? '' : entry.prompt;
	const prompt = entry?.mode === 'custom' ? custom : factoryPromptFor(key);
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
		if (!agent?.ctx || ctx.get('agentPresets')?.composedPreset(agent.ctx) !== 'cabinet') return '';
		const member = membershipOf(ctx, agent);
		if (member === undefined) return '';
		return memberBlock(config, { role: member.role, name: member.name });
	} catch {
		return '';
	}
}

/** Resolve current composition and actual team role, never a cached name. */
function memberKeyOf(ctx, agent) {
	if (ctx.get('agentPresets')?.composedPreset(agent.ctx) !== 'cabinet') return undefined;
	const member = membershipOf(ctx, agent);
	if (member === undefined) return undefined;
	if (member.role === 'lead') return 'lead';
	if (member.role !== 'teammate') return undefined;
	const key = bureauOf(member.name).key;
	return key !== '' && key !== 'lead' ? key : undefined;
}

/** Couple one live Cabinet route to one AgentLoop turn signal. */
function attachMemberModel(ctx, config, agent, attached, routeMemory = new Map(), sessionApi) {
	if (!agent || typeof agent.ctx?.on !== 'function') return undefined;
	if (agent.id !== undefined && attached.has(agent.id)) return undefined;
	if (typeof agent.model?.current === 'function' && typeof agent.model?.select === 'function') {
		return attachPreparedMemberModel(ctx, config, agent, attached, routeMemory, sessionApi);
	}
	let active = true;
	let controlledSignal;
	const turns = new WeakMap();
	let disposeNotice;
	const sameRoute = (a, b) => !!a && !!b && a.provider === b.provider && a.model === b.model;
	const keyFor = () => { try { return memberKeyOf(ctx, agent); } catch { return undefined; } };
	const defaultRoute = () => {
		const value = ctx.get('agentDefaultModel')?.currentSelection?.() ?? agent.options;
		return value?.provider && value?.model ? { provider: value.provider, model: value.model, ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }) } : undefined;
	};
	const disposeAssembly = agent.ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
		// Native setup may register its own prepended notice before this assembly.
		// Install our final-route notice last, after all selection setup has run.
		disposeNotice?.();
		disposeNotice = installNotice();
		const key = keyFor();
		const route = key === undefined ? undefined : memberModel(config, key) ?? (key === 'lead' ? undefined : memberModel(config, 'lead')) ?? defaultRoute();
		const signal = context?.signal;
		// AgentLoop serializes steps within one turn. Reject ambiguous concurrent
		// assemblies on that signal instead of sending a mismatched model/prompt.
		if (signal && turns.get(signal)?.pending) throw new Error('Cabinet: overlapping prompt assembly for one turn');
		const state = { key, route, pending: true };
		if (signal) turns.set(signal, state);
		try {
			const assembled = await next();
			if (!active) return assembled;
			if (keyFor() !== key || signal?.aborted) throw new Error('Cabinet: membership or mode changed during prompt assembly');
			const previous = routeMemory.get(agent.id);
			if (key === undefined && previous && sameRoute(assembled.variables, previous.override)) state.route = previous.baseline;
			if (key !== undefined && !state.route) throw new Error('Cabinet: no default model available to clear the member override');
			state.pending = false;
			if (signal) controlledSignal = state.route ? signal : undefined;
			return state.route ? { ...assembled, variables: { ...assembled.variables, provider: state.route.provider, model: state.route.model } } : assembled;
		} catch (error) { if (signal && turns.get(signal) === state) turns.delete(signal); throw error; }
	}, { prepend: true });
	const disposeRequest = agent.ctx.on('agent/request', async (payload, next) => {
		const state = payload?.signal ? turns.get(payload.signal) : undefined;
		const resolved = await next();
		if (!active) {
			if (state?.route) throw new Error('Cabinet: model policy unloaded during request');
			return resolved;
		}
		if (!state || state.pending) {
			const key = keyFor();
			if (key !== undefined && (memberModel(config, key) || memberModel(config, 'lead'))) throw new Error('Cabinet: model request has no matching prompt assembly');
			return resolved;
		}
		if (state.key !== keyFor() || payload.signal.aborted) throw new Error('Cabinet: membership or mode changed before request');
		if (!state.route) return resolved;
		if (state.key !== undefined) {
			const previous = routeMemory.get(agent.id);
			const baseline = previous && sameRoute(resolved, previous.override) ? previous.baseline : {
				provider: resolved.provider, model: resolved.model,
				...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort })
			};
			routeMemory.set(agent.id, { baseline, override: state.route });
		} else routeMemory.delete(agent.id);
		// Preserve native effort on the same route; a different model must use
		// its own adapter default rather than another model's effort identifier.
		if (sameRoute(state.route, resolved)) return resolved;
		const { reasoningEffort: _oldEffort, ...rest } = resolved;
		return { ...rest, ...state.route };
	}, { prepend: true });
	const installNotice = () => agent.ctx.on('agent/pre-step', async (payload, next) => {
		const decision = await next();
		const state = payload.signal ? turns.get(payload.signal) : undefined;
		if (!active || !state?.route || decision.kind === 'reject' || payload.signal.aborted) return decision;
		if (state.key !== keyFor()) throw new Error('Cabinet: membership or mode changed before step');
		// Replace the native selection's notice with the route actually assembled.
		const messages = decision.messages.filter(message => message.source?.kind !== 'model-selection');
		if (!messages.length && (payload.step === 1 || payload.messages.length)) return { ...decision, messages };
		const previous = agent.session?.requestHeader?.()?.config;
		if (!previous || sameRoute(previous, state.route)) return { ...decision, messages };
		const from = previous.provider + '/' + previous.model;
		const to = state.route.provider + '/' + state.route.model;
		return { ...decision, messages: [...messages, {
			id: randomUUID(), role: 'user',
			content: [{ type: 'text', text: '[model changed: assistant turns above this point were generated by ' + from + '; the session continues with ' + to + ']' }],
			source: { kind: 'model-selection', form: 'notice', summary: (from + ' → ' + to).slice(0, 200) }
		}] };
	}, { prepend: true });
	const dispose = () => {
		active = false;
		// Removing hooks between assembly and request must not send the already
		// rendered prompt through a different route. Preserve queued user input.
		if (controlledSignal && !controlledSignal.aborted) agent.cancel?.({ kind: 'hook', reason: 'Cabinet model policy unloaded' }, { keepInbox: true });
		try { disposeAssembly(); } catch { /* already disposed */ }
		try { disposeRequest(); } catch { /* already disposed */ }
		try { disposeNotice?.(); } catch { /* already disposed */ }
	};
	if (agent.id !== undefined) attached.set(agent.id, dispose);
	return dispose;
}

// Use the host's module instance and incremental projection contract. Records
// contain only selection provenance, never provider credentials or user config.
async function prepareModelSessionApi(ctx) {
	const loader = ctx.get('loader'), registry = ctx.get('sessionProjections');
	if (!loader?.import || !registry?.register) return undefined;
	const api = await loader.import('@deepseek-ai/dsh-session');
	const { z } = await loader.import('zod');
	const route = z.object({ provider: z.string().min(1), model: z.string().min(1), reasoningEffort: z.string().optional() });
	const record = z.object({ agentId: z.string(), baseline: route, override: route, from: route, settled: z.boolean().default(false) });
	const equal = (a, b) => a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
	const ownership = await registry.register({
		key: 'cabinetModelOwnership', stateVersion: 1,
		stateSchema: z.object({ inheritedCount: z.number(), record: record.nullable() }),
		init: (_, inheritedCount = 0) => ({ inheritedCount, record: null }),
		apply: (state, event) => {
			if (event.seq < state.inheritedCount) return state;
			const item = api.pluginRecordOf(event);
			if (item?.type === 'plugin:dsh-cabinet-mode/model-policy') {
				const parsed = record.safeParse(item.data);
				return { ...state, record: parsed.success ? parsed.data : null };
			}
			if (event.type === 'model/selection' && state.record) return {
				...state, record: equal(event.data, state.record.override) ? { ...state.record, settled: true } : null
			};
			return state;
		}
	});
	return { ...api, ownership };
}

/** Host plugin entry. */
function attachPreparedMemberModel(ctx, config, agent, attached, routeMemory, sessionApi) {
	let active = true;
	let synchronizedKey;
	const sameRoute = (a, b) => !!a && !!b && a.provider === b.provider && a.model === b.model;
	const sameSelection = (a, b) => sameRoute(a, b) && a.reasoningEffort === b.reasoningEffort;
	const recordType = 'plugin:dsh-cabinet-mode/model-policy';
	const validRoute = value => value && typeof value.provider === 'string' && value.provider.length > 0 && typeof value.model === 'string' && value.model.length > 0 && (value.reasoningEffort === undefined || typeof value.reasoningEffort === 'string');
	const canRecord = typeof sessionApi?.appendPluginRecord === 'function' && typeof sessionApi?.pluginRecordOf === 'function' && typeof sessionApi?.Session === 'function' && agent.session instanceof sessionApi.Session && !!sessionApi.ownership;
	const refreshOwnership = () => {
		const record = canRecord ? sessionApi.ownership.stateOf(agent.session).record : undefined;
		const current = agent.model.current();
		if (record?.agentId === agent.id && (sameSelection(current, record.override) || (!record.settled && sameSelection(current, record.from) && !sameSelection(record.from, record.baseline)))) {
			routeMemory.set(agent.id, { baseline: record.baseline, override: current });
		} else routeMemory.delete(agent.id);
	};
	const remember = value => {
		if (!canRecord) throw new Error('Cabinet: host Session plugin-record API unavailable; model override refused');
		sessionApi.appendPluginRecord(agent.session, recordType, value ? { agentId: agent.id, ...value, from: agent.model.current() } : { agentId: agent.id });
		if (value) routeMemory.set(agent.id, value); else routeMemory.delete(agent.id);
	};
	const keyFor = () => { try { return memberKeyOf(ctx, agent); } catch { return undefined; } };
	const syncSelection = () => {
		if (!active) return;
		refreshOwnership();
		const key = keyFor();
		synchronizedKey = key;
		const current = agent.model.current();
		const previous = routeMemory.get(agent.id);
		const override = key === undefined ? undefined : memberModel(config, key) ?? (key === 'lead' ? undefined : memberModel(config, 'lead'));
		if (!override && !previous) return; // Never alter an unconfigured/native agent.
		if (!override && previous && !sameSelection(current, previous.override)) {
			remember(undefined); return; // Respect a newer native selection.
		}
		const defaults = ctx.get('agentDefaultModel')?.currentSelection?.() ?? agent.options;
		const desired = override ?? (key === undefined ? previous?.baseline : defaults);
		if (!desired?.provider || !desired?.model) throw new Error('Cabinet: no model available to restore native selection');
		const selection = (override || key !== undefined) && sameRoute(desired, current) ? current : {
			provider: desired.provider, model: desired.model,
			...(desired.reasoningEffort === undefined ? {} : { reasoningEffort: desired.reasoningEffort })
		};
		if (override) {
			const value = { baseline: previous && sameSelection(current, previous.override) ? previous.baseline : current, override: selection };
			if (!validRoute(value.baseline)) throw new Error('Cabinet: no native selection available to restore');
			if (JSON.stringify(value) !== JSON.stringify(previous)) remember(value);
		}
		agent.model.select(selection);
		// Clear ownership only after restoration is durable. Reopening between
		// these writes sees the native selection and retires the stale marker.
		if (!override) remember(undefined);
	};
	// Both notifications precede preStep's model.current(): status starts the
	// turn, and inbox claim resolves members registered after agent creation.
	let syncError;
	const sync = () => {
		try { syncSelection(); syncError = undefined; }
		catch (error) { syncError = error; }
	};
	const offStatus = agent.ctx.on('agent/status', sync);
	const offClaim = agent.ctx.on('agent/inbox/claimed', sync);
	// Loader dispatches committed volatile paths only to the owning plugin fiber.
	// Register on this entry's context, not the unrelated Agent scope.
	const offConfig = ctx.on('loader/volatile-update', paths => {
		if (paths.some(path => path[0] === 'members')) sync();
	});
	// Defer errors to preparation too: a failed capability check must never
	// silently send a configured override to the native model.
	sync();
	const turns = new WeakMap();
	let controlledSignal;
	const offAssembly = agent.ctx.on('system-prompt/assemble', async (_, context, next) => {
		if (syncError) throw syncError;
		const key = keyFor();
		// An empty inbox emits no notification. Refuse a stale owned selection
		// after a mode/role change even before the next status boundary can restore it.
		refreshOwnership();
		const configured = key === undefined ? undefined : memberModel(config, key) ?? (key === 'lead' ? undefined : memberModel(config, 'lead'));
		if ((routeMemory.has(agent.id) || configured) && key !== synchronizedKey) throw new Error('Cabinet: model policy changed before step preparation; start a new turn');
		const controlled = key !== undefined && routeMemory.has(agent.id);
		const state = { key, controlled };
		if (context.signal) {
			turns.set(context.signal, state);
			if (controlled) controlledSignal = context.signal;
		}
		const result = await next();
		if (controlled && (!active || context.signal?.aborted || keyFor() !== key)) throw new Error('Cabinet: model policy changed during step preparation');
		return result; // The official frozen modelSelection owns all variables.
	}, { prepend: true });
	const offRequest = agent.ctx.on('agent/request', async (payload, next) => {
		const state = turns.get(payload.signal);
		const result = await next();
		if (state?.controlled && (!active || payload.signal.aborted || keyFor() !== state.key)) throw new Error('Cabinet: model policy changed before request');
		return result; // Never change the prepared route or effort.
	}, { prepend: true });
	const dispose = () => {
		active = false;
		if (controlledSignal && !controlledSignal.aborted) agent.cancel?.({ kind: 'hook', reason: 'Cabinet model policy unloaded' }, { keepInbox: true });
		offStatus(); offClaim(); offConfig(); offAssembly(); offRequest();
		refreshOwnership();
		const previous = routeMemory.get(agent.id);
		if (previous?.baseline && sameSelection(agent.model.current(), previous.override)) agent.model.select(previous.baseline);
		if (previous && canRecord) remember(undefined);
	};
	if (agent.id !== undefined) attached.set(agent.id, dispose);
	return dispose;
}

/** Host plugin entry. */
const name = 'cabinet-ui';
/** Host services needed for prompt sections and durable model ownership. */
const inject = ['systemPrompt', 'loader', 'sessionProjections'];

/** Register the runtime member block as a prompt section. */
async function apply(ctx, config) {
	let sessionApi;
	try { sessionApi = await prepareModelSessionApi(ctx); }
	catch { /* Legacy hosts need no records; rc.1 overrides fail closed below. */ }
	ctx.effect(() => ctx.systemPrompt.section({
		name: MEMBER_SECTION,
		order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 1,
		// The provider runs for every assembly, so a saved setting takes effect on
		// the next turn without remounting the plugin.
		text: (context) => sectionText(ctx, config, context.agent),
		// User prompts are free text; never treat `{{...}}` in them as variables.
		interpolate: false
	}), 'cabinet-member: prompt section');
	// Per-member model selection: attach the assemble/request waterfall to each
	// Cabinet member agent as it is announced (and to agents already live when
	// this plugin mounts), dispose it with the agent. Agents created before
	// roster registration are resolved lazily at their first assembly.
	const attached = new Map();
	// Keep the pre-Cabinet route across same-session Agent recreation on mode switches.
	const routeMemory = new Map();
	const attach = (agent) => {
		try {
			attachMemberModel(ctx, config, agent, attached, routeMemory, sessionApi);
		} catch (error) {
			try { ctx.logger?.warn?.(`cabinet-ui: model selection attach failed: ${String(error)}`); } catch { /* logger unavailable */ }
		}
	};
	ctx.effect(() => {
		const offCreated = ctx.on('agent/created', ({ agent }) => attach(agent));
		const offDisposed = ctx.on('agent/disposed', ({ agent }) => {
			const dispose = agent === undefined || agent === null ? undefined : attached.get(agent.id);
			if (dispose === undefined) return;
			attached.delete(agent.id);
			dispose();
		});
		try {
			for (const agent of ctx.get('agents')?.list?.() ?? []) attach(agent);
		} catch { /* registry unavailable: announce listener still covers new agents */ }
		return () => {
			try { offCreated?.(); } catch { /* already disposed */ }
			try { offDisposed?.(); } catch { /* already disposed */ }
			for (const dispose of Array.from(attached.values())) dispose();
			attached.clear();
			routeMemory.clear();
		};
	}, 'cabinet-member: model selection');
}

export { prepareModelSessionApi, bureauOf, sectionText, memberBlock, memberModel, modelRoute, clampModel, attachMemberModel, Config, DEFAULT_LEAD_PROMPT, DEFAULT_MEMBER_PROMPTS, MEMBER_KEYS, MEMBER_LABELS, MEMBER_SECTION, MAX_AVATAR_LENGTH, MAX_MODEL_LENGTH, MAX_NAME_LENGTH, MAX_PROMPT_LENGTH, apply, inject, name };
