const httpsURL = value => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Expected an HTTPS URL');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected an HTTPS URL');
    return url.href;
};

const authorURL = value => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Expected an HTTP or HTTPS author URL');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Expected an HTTP or HTTPS author URL');
    }
    return url.href;
};

const npmPackageName = value => {
    if (typeof value !== 'string') throw new Error('Invalid npm package name');
    const name = value.trim();
    if (name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) ||
        ['node_modules', 'favicon.ico'].includes(name)) {
        throw new Error('Invalid npm package name');
    }
    return name;
};

/** Resolve runtime extension dependencies without executing extension code. */
export const resolveExtensionSelection = (entries, explicitIds = [], loadedIds = []) => {
    const byId = new Map();
    for (const entry of entries) {
        if (!entry || typeof entry.id !== 'string' || !entry.id || byId.has(entry.id)) {
            throw new Error(`Duplicate or missing extension ID: ${entry && entry.id}`);
        }
        if (entry.dependencies !== undefined && (!Array.isArray(entry.dependencies) ||
            entry.dependencies.some(id => typeof id !== 'string' || !id))) {
            throw new Error(`Invalid extension dependencies: ${entry.id}`);
        }
        byId.set(entry.id, entry);
    }
    const selected = new Set();
    const required = new Set();
    const requiredBy = new Map();
    const visiting = new Set();
    const ordered = [];
    const visit = id => {
        const entry = byId.get(id);
        if (!entry) throw new Error(`Missing extension dependency: ${id}`);
        if (visiting.has(id)) throw new Error(`Cyclic extension dependency: ${id}`);
        if (selected.has(id)) return;
        visiting.add(id);
        for (const dependency of entry.dependencies || []) {
            required.add(dependency);
            visit(dependency);
        }
        visiting.delete(id);
        selected.add(id);
        ordered.push(entry);
    };
    const roots = [...explicitIds].filter(id => byId.has(id));
    for (const id of roots) visit(id);
    for (const root of roots) {
        const seen = new Set();
        const describeDependencies = id => {
            for (const dependency of byId.get(id).dependencies || []) {
                if (seen.has(dependency)) continue;
                seen.add(dependency);
                if (!requiredBy.has(dependency)) requiredBy.set(dependency, new Set());
                requiredBy.get(dependency).add(root);
                describeDependencies(dependency);
            }
        };
        describeDependencies(root);
    }
    const loaded = new Set(loadedIds);
    return {selected, required, requiredBy, loaded, ordered: ordered.filter(entry => !loaded.has(entry.id))};
};

/** Validate the Pages JSON contract before it reaches the selection UI or VM. */
export const parseExtensionCatalog = data => {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.extensions)) {
        throw new Error('Unsupported extension catalog');
    }
    const categories = new Map();
    if (data.categories !== undefined) {
        if (!Array.isArray(data.categories)) throw new Error('Invalid extension catalog categories');
        data.categories.forEach((category, order) => {
            if (!category || typeof category.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(category.id) ||
                typeof category.title !== 'string' || !category.title.trim() ||
                (category.titleJa !== undefined && (typeof category.titleJa !== 'string' || !category.titleJa.trim()))) {
                throw new Error('Invalid extension catalog category');
            }
            if (categories.has(category.id)) throw new Error(`Duplicate extension category: ${category.id}`);
            categories.set(category.id, {id: category.id, title: category.title, order,
                ...(category.titleJa !== undefined ? {titleJa: category.titleJa} : {})});
        });
    }
    const urls = new Set();
    const entries = data.extensions.map(item => {
        if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(item.id) || typeof item.name !== 'string' ||
            !item.name.trim() || typeof item.version !== 'string' || !item.version ||
            !Array.isArray(item.dependencies) || item.dependencies.some(id =>
                typeof id !== 'string' || !/^[a-zA-Z0-9]+$/.test(id))) {
            throw new Error('Invalid extension catalog entry');
        }
        const url = httpsURL(item.url);
        if (urls.has(url)) throw new Error(`Duplicate extension URL: ${url}`);
        urls.add(url);
        const metadata = {name: item.name, id: item.id, version: item.version};
        for (const field of ['description', 'author', 'license', 'updatedAt', 'unsandboxed']) {
            if (typeof item[field] === 'string') metadata[field] = item[field];
        }
        if (item.descriptions && typeof item.descriptions === 'object') {
            metadata.descriptions = Object.fromEntries(Object.entries(item.descriptions)
                .filter(([locale, text]) => /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(locale) && typeof text === 'string'));
        }
        if (item.banner) metadata.banner = httpsURL(item.banner);
        if (item.repository) metadata.repository = httpsURL(item.repository);
        if (item.docsURL !== undefined) metadata.docsURL = httpsURL(item.docsURL);
        if (item.authorURL !== undefined) metadata.authorURL = authorURL(item.authorURL);
        if (item.package !== undefined) metadata.package = npmPackageName(item.package);
        const entry = {id: item.id, ids: [item.id], url, dependencies: [...new Set(item.dependencies)], metadata};
        if (item.category !== undefined) {
            if (typeof item.category !== 'string' || !categories.has(item.category)) {
                throw new Error(`Missing extension category: ${item.category}`);
            }
            entry.category = categories.get(item.category);
        }
        return entry;
    });
    resolveExtensionSelection(entries, entries.map(entry => entry.id));
    return entries;
};

export const loadExtensionCatalog = async (url, signal) => {
    const response = await fetch(httpsURL(url), {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error(`Extension catalog HTTP ${response.status}`);
    return parseExtensionCatalog(await response.json());
};
