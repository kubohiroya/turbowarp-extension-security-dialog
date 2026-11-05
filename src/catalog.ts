import type {ExtensionMetadata} from './review-types.js';
export interface CatalogCategory {
    id: string; title: string; titleJa?: string; order: number;
}

export interface CatalogEntry {
    key: string; id: string; ids: string[]; url: string; sha256?: string;
    dependencies: readonly string[]; metadata: ExtensionMetadata; category?: CatalogCategory;
}

import {contactURL} from './display-urls.js';

const ID = /^[A-Za-z0-9]+$/;

function fail(message: string): never {
    throw new Error(message);
}

const object = (value: unknown, what: string): Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${what} must be an object`);
    return value as Record<string, unknown>;
};

const string = (value: unknown, what: string, limit = 2048): string => {
    if (typeof value !== 'string' || value.length === 0 || value.length > limit) fail(`${what} must be text`);
    return value;
};

/**
 * Only an absolute HTTPS address with nothing hidden in it.
 *
 * Credentials belong to whoever wrote the catalog, not to the person opening it, and a fragment
 * cannot change which bytes arrive but can make two rows look like one. Both are refused rather
 * than stripped, so a catalog that carries them is reported instead of quietly rewritten.
 * @param {unknown} value The address to check.
 * @param {string} what What to call it if it is wrong.
 * @param {boolean} allowHTTP True only for a creator's own page, which runs no code here.
 * @returns {string} The address, unchanged.
 */
export const reviewURL = (value: unknown, what = 'URL', allowHTTP = false) => {
    const text = string(value, what);
    let url;
    try {
        url = new URL(text);
    } catch (error) {
        fail(`${what} must be an absolute URL`);
    }
    const schemes = allowHTTP ? ['https:', 'http:'] : ['https:'];
    if (!schemes.includes(url.protocol) || url.username || url.password || url.hash) {
        fail(`${what} must be ${allowHTTP ? 'HTTP(S)' : 'HTTPS'} without credentials or a fragment`);
    }
    return text;
};

const metadataOf = (value: unknown): ExtensionMetadata => {
    const source = object(value, 'metadata');
    const result: ExtensionMetadata = {};
    for (const key of ['name', 'id', 'description', 'author', 'version', 'license', 'package',
        'banner', 'unsandboxed', 'updatedAt'] as const) {
        if (source[key] !== undefined) result[key] = string(source[key], key, 4096);
    }
    for (const key of ['repository', 'docsURL'] as const) {
        if (source[key] !== undefined) result[key] = reviewURL(source[key], key);
    }
    // A contact is shown, never fetched or used to load code.
    if (source.authorURL !== undefined) result.authorURL = contactURL(source.authorURL);
    if (source.descriptions !== undefined) {
        const descriptions = object(source.descriptions, 'descriptions');
        result.descriptions = {};
        for (const [tag, text] of Object.entries(descriptions)) {
            if (!(/^[a-z]{2}(-[A-Za-z0-9]+)*$/).test(tag)) fail('descriptions keys must be language tags');
            result.descriptions[tag] = string(text, 'description', 4096);
        }
    }
    return result;
};

const categoriesOf = (value: unknown) => {
    const list = value === undefined ? [] : value;
    if (!Array.isArray(list)) fail('categories must be a list');
    const byId = new Map<string, CatalogCategory>();
    list.forEach((item, order) => {
        const category = object(item, 'category');
        const id = string(category.id, 'category id', 128);
        if (byId.has(id)) fail(`Duplicate category ${id}`);
        const resolved: CatalogCategory = {id, title: string(category.title, 'category title', 256), order};
        if (category.titleJa !== undefined) resolved.titleJa = string(category.titleJa, 'category titleJa', 256);
        byId.set(id, Object.freeze(resolved));
    });
    return byId;
};

/**
 * Read a dashboard catalog into rows, refusing anything the review screen could not show safely.
 *
 * Every refusal here is a catalog that would mislead: two rows claiming one ID, a dependency on
 * something absent, a cycle no order can satisfy, an address that is not plainly HTTPS. The
 * screen never has to ask whether what it was handed makes sense.
 * @param {unknown} data The parsed catalog document.
 * @returns {Array<object>} Frozen entries in catalog order, each with its resolved category.
 */
export function parseExtensionCatalog(data: unknown): CatalogEntry[] {
    const document = object(data, 'catalog');
    if (document.schemaVersion !== undefined && document.schemaVersion !== 1) {
        fail(`Unsupported catalog schema ${document.schemaVersion}`);
    }
    const categories = categoriesOf(document.categories);
    const list = document.extensions;
    if (!Array.isArray(list)) fail('catalog extensions must be a list');
    const byId = new Map<string, CatalogEntry>();
    const urls = new Set<string>();
    const entries = list.map(item => {
        const source = object(item, 'extension');
        const id = string(source.id, 'extension id', 128);
        if (!ID.test(id)) fail(`Invalid extension id ${id}`);
        if (byId.has(id)) fail(`Duplicate extension ${id}`);
        const url = reviewURL(source.url, `${id} url`);
        if (urls.has(url)) fail(`Duplicate extension URL ${url}`);
        urls.add(url);
        const dependencies = source.dependencies === undefined ? [] : source.dependencies;
        if (!Array.isArray(dependencies)) fail(`${id} dependencies must be a list`);
        const entry: CatalogEntry = {
            key: id,
            id,
            ids: [id],
            url,
            dependencies: Object.freeze(dependencies.map(value => string(value, 'dependency', 128))),
            // The dashboard catalog states name, description, creator and banner beside the URL.
            // A nested `metadata` object, the older shape, still wins where it says something.
            metadata: Object.freeze(metadataOf({...source, ...(source.metadata === undefined ?
                {} : object(source.metadata, 'metadata'))}))
        };
        if (source.sha256 !== undefined) {
            entry.sha256 = string(source.sha256, 'sha256', 64);
            if (!(/^[0-9a-f]{64}$/).test(entry.sha256)) fail(`Invalid sha256 for ${id}`);
        }
        if (source.category !== undefined) {
            const category = string(source.category, 'category', 128);
            if (!categories.has(category)) fail(`Unknown category ${category}`);
            entry.category = categories.get(category);
        }
        byId.set(id, entry);
        return entry;
    });
    for (const entry of entries) {
        for (const dependency of entry.dependencies) {
            if (!byId.has(dependency)) fail(`${entry.id} depends on missing ${dependency}`);
        }
    }
    // A cycle has no load order, so refuse the catalog rather than pick one arbitrarily.
    const state = new Map<string, "open" | "done">();
    const walk = (id: string): void => {
        const mark = state.get(id);
        if (mark === 'done') return;
        if (mark === 'open') fail(`Dependency cycle at ${id}`);
        state.set(id, 'open');
        for (const dependency of byId.get(id)!.dependencies) walk(dependency);
        state.set(id, 'done');
    };
    for (const entry of entries) walk(entry.id);
    return entries.map(entry => Object.freeze(entry));
}

/**
 * Fetch and read a catalog without sending anything about the person along.
 * @param {string} url The catalog address.
 * @param {AbortSignal} [signal] The caller's own deadline or cancellation.
 * @returns {Promise<Array<object>>} The parsed entries.
 */
export async function loadExtensionCatalog(url: string, signal?: AbortSignal) {
    const address = reviewURL(url, 'catalog URL');
    const response = await fetch(address, {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) fail(`Catalog request failed (HTTP ${response.status})`);
    return parseExtensionCatalog(await response.json());
}
