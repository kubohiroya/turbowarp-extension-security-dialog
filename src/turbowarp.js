import defaultPreferences from './preferences.js';

const CANCELLED = 'EXTENSION_SECURITY_CANCELLED';
const isExtensionSecurityCancelled = error => error && error.code === CANCELLED;
const cancellation = () => Object.assign(new Error('Extension loading cancelled by the user'), {code: CANCELLED});

/**
 * Compatibility boundary for the VM's existing _loadExtensions hook. Nothing is
 * installed unless the startup flag is enabled; the dependency itself is unchanged.
 * @param {object} vm VM instance
 * @param {Function} review Resolve all URL decisions before starting any extension
 * @param {object} defaultURLs The VM's default extension URL table
 * @param {object} preferences Project preference storage boundary
 * @returns {Function} Restore the original instance methods
 */
const installBatchExtensionLoader = (vm, review, defaultURLs, preferences = defaultPreferences) => {
    const manager = vm.extensionManager;
    const security = manager.securityManager;
    const originalLoad = vm._loadExtensions;
    const originalMode = security.getSandboxMode;
    const originalURLs = manager.getExtensionURLs;
    const originalClear = vm.clear;
    const originalProjectLoad = vm.loadProject;
    const modes = new Map();
    const deniedURLs = new Map();
    let disposed = false;
    let queue = Promise.resolve();
    let projectQueue = Promise.resolve();
    let projectContext = null;

    const getSandboxMode = function (url) {
        return modes.has(url) ? modes.get(url) : originalMode.call(security, url);
    };
    const getExtensionURLs = function () {
        // Preserve refused blocks' source URLs when the project is saved again.
        return Object.assign(Object.fromEntries(deniedURLs), originalURLs.call(manager));
    };
    const clear = function (...args) {
        deniedURLs.clear();
        return originalClear.apply(vm, args);
    };
    const load = async (ids, urls) => {
        if (disposed) throw cancellation();
        const entries = new Map();
        const builtins = [];
        for (const id of ids) {
            if (manager.isExtensionLoaded(id)) continue;
            if (manager.isBuiltinExtension(id)) {
                builtins.push(id);
                continue;
            }
            const url = urls.get(id) || (Object.prototype.hasOwnProperty.call(defaultURLs, id) && defaultURLs[id]);
            if (!url) throw new Error(`Unknown extension: ${id}`);
            if (!entries.has(url)) entries.set(url, {url, ids: []});
            entries.get(url).ids.push(id);
        }
        let initialChoices = new Map();
        if (projectContext && projectContext.key) {
            try {
                initialChoices = await preferences.restoreChoices([...entries.values()], projectContext.saved);
            } catch (error) {
                // Storage or crypto unavailability must not bypass permission review.
            }
        }
        const decisions = entries.size ? await review([...entries.values()], initialChoices) : new Map();
        if (disposed || decisions === null) throw cancellation();
        for (const entry of entries.values()) {
            if (!['deny', 'sandboxed', 'unsandboxed'].includes(decisions.get(entry.url))) {
                throw new Error('An extension permission decision is missing');
            }
        }
        if (projectContext) decisions.forEach((mode, url) => projectContext.decisions.set(url, mode));
        for (const id of builtins) manager.loadExtensionIdSync(id);
        const promises = [];
        try {
            for (const entry of entries.values()) {
                const mode = decisions.get(entry.url);
                if (mode === 'deny') {
                    for (const id of entry.ids) deniedURLs.set(id, entry.url);
                } else {
                    modes.set(entry.url, mode === 'sandboxed' ? 'iframe' : 'unsandboxed');
                    promises.push(Promise.resolve().then(() => manager.loadExtensionURL(entry.url)));
                }
            }
            // Drain failures as well as successes before releasing per-batch modes.
            const results = await Promise.allSettled(promises);
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
        const pending = projectQueue.then(async () => {
            if (disposed) throw cancellation();
            const context = {key: null, saved: {}, decisions: new Map()};
            try {
                context.key = await preferences.projectFingerprint(args[0]);
                if (context.key) context.saved = await preferences.readPreferences(context.key);
            } catch (error) {
                // Permission selection still works when persistence is unavailable.
            }
            projectContext = context;
            try {
                const result = await originalProjectLoad.apply(vm, args);
                if (context.key && context.decisions.size) {
                    try {
                        const encoded = await preferences.encodeChoices(context.decisions);
                        await preferences.writePreferences(context.key, encoded);
                    } catch (error) {
                        // A storage failure must not turn a successful load into an error.
                    }
                }
                return result;
            } finally {
                projectContext = null;
            }
        });
        projectQueue = pending.catch(() => {});
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
};

export {installBatchExtensionLoader, isExtensionSecurityCancelled};
