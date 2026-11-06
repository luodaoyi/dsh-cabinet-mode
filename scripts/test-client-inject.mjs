import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// The web boot overlay only ever prints `dsh-cabinet-mode: failed`; the reason
// (`cannot get property "remote" without inject`) never reaches it, so one
// undeclared service access silently takes the whole browser boot down. This
// test replays apply() against a context that mirrors cordis's guard: looking
// up a service the entry did not declare throws, and a ctx.inject([...]) scope
// exposes only the dependencies it listed. The original 0.3.1 crash failed
// exactly this way, and no other check in verify.mjs could see it.

let client;
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const exportPoint = 'return { inject, apply };';
assert.equal(source.split(exportPoint).length, 2, 'client.js export point moved');

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useRef: () => ({ current: null }),
  useState: (initial) => [initial, () => {}],
  useCallback: (callback) => callback,
  useMemo: (factory) => factory(),
  useEffect: () => {},
  useLayoutEffect: () => {},
  memo: (component) => component,
  forwardRef: (render) => render,
  Fragment: 'fragment',
};

runInNewContext(source, {
  window: { __ModuleLoader__: { load: ({ factory }) => {
    client = factory((name) => { assert.equal(name, 'react'); return React; });
  } } },
  console,
});

assert.ok(client && typeof client.apply === 'function', 'client module did not load');
assert.ok(Array.isArray(client.inject) && client.inject.length > 0, 'client entry declares no services');
assert.equal(new Set(client.inject).size, client.inject.length, 'duplicate service in inject');

/** Context methods cordis puts on every context; never a service lookup. */
const CONTEXT_METHODS = new Set([
  'effect', 'on', 'once', 'emit', 'parallel', 'serial', 'bail', 'waterfall',
  'inject', 'get', 'set', 'provide', 'accessor', 'mixin', 'plugin',
]);

/**
 * A declared service: any property chain and call works. Callbacks are not
 * replayed here — a slot hands this stub a React component, not a callback —
 * so nested access is checked where cordis itself runs code: effect bodies and
 * ctx.inject(...) scopes.
 */
function service(name) {
  return new Proxy(function () {}, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) return () => `[service ${name}]`;
      if (property === 'toString') return () => `[service ${name}]`;
      if (typeof property === 'symbol' || property === 'then') return undefined;
      return service(`${name}.${String(property)}`);
    },
    apply() {
      return service(`${name}()`);
    },
  });
}

/** A context whose service lookups fail the way cordis fails an undeclared access. */
function makeContext(declared) {
  const allowed = new Set(declared);
  const context = new Proxy({}, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      if (property === 'effect') {
        // Cordis runs the effect body during activation; a throw here fails the entry.
        return (callback, label) => { callback(); return () => {}; };
      }
      if (property === 'on' || property === 'once') return () => () => {};
      if (property === 'get') {
        return (name) => { assert.equal(typeof name, 'string', 'ctx.get(name) takes a service name'); return undefined; };
      }
      if (property === 'inject') {
        return (dependencies, callback, label) => {
          assert.ok(Array.isArray(dependencies) && dependencies.every((entry) => typeof entry === 'string'),
            `ctx.inject: ${label || 'unnamed'} needs string dependencies`);
          const scope = makeContext([...allowed, ...dependencies]);
          if (typeof callback === 'function') callback(scope.context);
          return () => {};
        };
      }
      if (CONTEXT_METHODS.has(property)) return () => {};
      if (allowed.has(property)) return service(property);
      throw new Error(`cannot get property "${String(property)}" without inject`);
    },
    has(_target, property) {
      return typeof property !== 'symbol' && (CONTEXT_METHODS.has(property) || allowed.has(property));
    },
    set() { return true; },
  });
  return { context };
}

// The shipped entry activates without touching a service it never declared.
const shipped = makeContext(client.inject);
client.apply(shipped.context);

// Strictness proof: with nothing declared the first service lookup throws, so
// an undeclared `ctx.remote` — the bug that broke the boot — cannot pass here.
const bare = makeContext([]);
assert.throws(() => client.apply(bare.context), /without inject/,
  'harness must reject undeclared service access');

console.log('test-client-inject: ok');
