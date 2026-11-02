import {initialDecisions, requiresReview} from './decisions.js';

const CANCELLED = 'EXTENSION_SECURITY_CANCELLED';

/** The person said no, which is an answer, not a fault. Hosts tell it apart to avoid an error UI. */
export const isExtensionSecurityCancelled = error => Boolean(error) && error.code === CANCELLED;

const cancellation = () => Object.assign(
    new Error('Extension loading cancelled by the person'), {code: CANCELLED});

const sandboxModeFor = execution => (execution === 'unsandboxed' ? 'unsandboxed' : 'iframe');

/**
 * Put every extension question before the person once, before any extension code runs.
 *
 * The VM loads extensions one at a time and asks about each as it goes, which turns opening a
 * project into a queue of prompts and starts the first extension before the person has seen the
 * last. This wraps the VM's own hook so the whole project is collected, asked about together,
 * and only then loaded.
 *
 * It loads nothing but ordinary custom extensions itself. A Plus extension belongs to the Loader,
 * which fetches and verifies it; those rows arrive through `collectEntries` and leave through
 * `applyDecisions`, so this module never needs the Loader's types or its code.
 * @param {object} vm The VM to wrap. Its own methods are restored when the returned function runs.
 * @param {Function} review Puts the rows to the person; resolves with decisions, or null for no.
 * @param {object} defaultURLs The VM's own table of addresses for extensions it knows by ID.
 * @param {object} storage Where the opener's decisions are remembered, from createDecisionStorage.
 * @param {object} options Host hooks: collectEntries, applyDecisions and identify.
 * @returns {Function} Restores the VM's own methods.
 */
export function installBatchExtensionLoader(vm, review, defaultURLs = {}, storage = null, {
    collectEntries, applyDecisions, identify
} = {}) {
    const manager = vm && vm.extensionManager;
    const security = manager && manager.securityManager;
    if (!manager || !security || typeof vm._loadExtensions !== 'function') {
        throw new Error('A VM with an extension manager and security manager is required');
    }
    const originalLoad = vm._loadExtensions;
    const originalMode = security.getSandboxMode;
    const originalURLs = manager.getExtensionURLs;
    const originalClear = vm.clear;
    const originalProjectLoad = vm.loadProject;

    // Modes last only for the batch that chose them: a later load must ask again, not inherit.
    const modes = new Map();
    const refusedURLs = new Map();
    let disposed = false;
    let queue = Promise.resolve();
    let projects = Promise.resolve();
    let project = null;

    const getSandboxMode = function (url) {
        return modes.has(url) ? modes.get(url) : originalMode.call(security, url);
    };
    // A refused extension keeps its address so saving the project does not quietly drop it.
    const getExtensionURLs = function () {
        return Object.assign(Object.fromEntries(refusedURLs), originalURLs.call(manager));
    };
    const clear = function (...args) {
        refusedURLs.clear();
        return originalClear.apply(vm, args);
    };

    const legacyRows = (ids, urls) => {
        const byURL = new Map();
        const builtins = [];
        for (const id of ids) {
            if (manager.isExtensionLoaded(id)) continue;
            if (manager.isBuiltinExtension(id)) {
                builtins.push(id);
                continue;
            }
            const url = urls.get(id) ||
                (Object.prototype.hasOwnProperty.call(defaultURLs, id) && defaultURLs[id]);
            if (!url) throw new Error(`Unknown extension: ${id}`);
            if (!byURL.has(url)) {
                byURL.set(url, {key: url, ids: [], source: {kind: 'legacy', url}});
            }
            byURL.get(url).ids.push(id);
        }
        return {rows: [...byURL.values()], builtins};
    };

    const decide = async entries => {
        const recorded = project && project.key && storage ?
            await storage.read(project.key) : new Map();
        const starting = initialDecisions(entries, 'open', {
            recorded, fallbackLoading: storage ? storage.fallbackLoading : 'cached'
        });
        // With nothing but trusted rows there is no question to put, so opening is not stopped
        // to report one. The defaults already say what trusted means.
        if (!requiresReview(entries)) return starting;
        const answer = await review(entries, starting);
        if (answer === null || answer === undefined) return null;
        for (const entry of entries) {
            const decision = answer.get(entry.key);
            if (!decision || !['deny', 'sandboxed', 'unsandboxed'].includes(decision.execution)) {
                throw new Error(`No decision for ${entry.key}`);
            }
        }
        return answer;
    };

    const load = async (ids, urls) => {
        if (disposed) throw cancellation();
        const {rows, builtins} = legacyRows(ids, urls);
        const supplied = collectEntries && project ?
            await collectEntries(project.input) : [];
        const entries = [...supplied, ...rows];
        if (entries.length === 0) {
            for (const id of builtins) manager.loadExtensionIdSync(id);
            return;
        }
        const decisions = await decide(entries);
        if (disposed || decisions === null) throw cancellation();
        if (project) decisions.forEach((decision, key) => project.decisions.set(key, decision));
        // The host wires the Loader's trust and caching from the same answer, before anything runs.
        if (applyDecisions) applyDecisions(decisions, entries);

        for (const id of builtins) manager.loadExtensionIdSync(id);
        const loading = [];
        try {
            for (const row of rows) {
                const {execution} = decisions.get(row.key);
                if (execution === 'deny') {
                    for (const id of row.ids) refusedURLs.set(id, row.source.url);
                    continue;
                }
                modes.set(row.source.url, sandboxModeFor(execution));
                loading.push(Promise.resolve().then(() => manager.loadExtensionURL(row.source.url)));
            }
            // Drain failures as well as successes before the batch's modes are released.
            const results = await Promise.allSettled(loading);
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
        } finally {
            modes.clear();
        }
    };

    const loadExtensions = function (ids, urls = new Map()) {
        const pending = queue.then(() => load(ids, urls));
        queue = pending.catch(() => {});
        return pending;
    };

    const loadProject = function (...args) {
        const pending = projects.then(async () => {
            if (disposed) throw cancellation();
            const context = {input: args[0], key: null, decisions: new Map()};
            try {
                if (identify) context.key = await identify(args[0]);
            } catch (error) {
                // Deciding still works when a project cannot be identified; only memory is lost.
            }
            project = context;
            try {
                return await originalProjectLoad.apply(vm, args);
            } finally {
                project = null;
                if (storage && context.key && context.decisions.size) {
                    // A storage failure must not turn a project that opened into one that failed.
                    await storage.write(context.key, context.decisions).catch(() => false);
                }
            }
        });
        projects = pending.catch(() => {});
        return pending;
    };

    security.getSandboxMode = getSandboxMode;
    manager.getExtensionURLs = getExtensionURLs;
    vm.clear = clear;
    vm._loadExtensions = loadExtensions;
    vm.loadProject = loadProject;

    return () => {
        disposed = true;
        if (vm._loadExtensions === loadExtensions) vm._loadExtensions = originalLoad;
        if (security.getSandboxMode === getSandboxMode) security.getSandboxMode = originalMode;
        if (manager.getExtensionURLs === getExtensionURLs) manager.getExtensionURLs = originalURLs;
        if (vm.clear === clear) vm.clear = originalClear;
        if (vm.loadProject === loadProject) vm.loadProject = originalProjectLoad;
    };
}
