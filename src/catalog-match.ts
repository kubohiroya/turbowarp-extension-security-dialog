// SPDX-License-Identifier: MPL-2.0
import {parseExtensionCatalog} from './catalog.js';
import type {CatalogEntry} from './catalog.js';
import type {PreviewCatalog} from './catalog-preview.js';
import type {ReviewEntry} from './review-types.js';

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * The bytes a `data:` URL hands the VM, base64 or percent-encoded.
 *
 * Base64 is read as raw bytes rather than as text, so the digest is of exactly what loads, whatever
 * its encoding. Percent-encoded text is its UTF-8, which is what the browser fetches for it.
 * @param {string} url The data URL.
 * @returns {Uint8Array} Its bytes.
 */
const dataURLBytes = (url: string): Uint8Array<ArrayBuffer> => {
    const comma = url.indexOf(',');
    if (!url.startsWith('data:') || comma < 0) throw new Error('Not a data URL');
    const content = url.slice(comma + 1);
    if (!(/;base64$/i).test(url.slice(0, comma))) return new TextEncoder().encode(decodeURIComponent(content));
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
};

/**
 * The SHA-256 of the code a project carries in a `data:` address, or nothing for any other address.
 *
 * A project written for standard TurboWarp holds a Plus extension this way, with no address to
 * check. The digest is what a catalog can vouch for instead, the same way it vouches for the
 * embedded forms of a Plus manifest.
 * @param {string} [url] The extension's address.
 * @returns {Promise<string|undefined>} Lowercase hex, or undefined when there is nothing to digest.
 */
export const inlineCodeDigest = async (url: string | undefined): Promise<string | undefined> => {
    if (typeof url !== 'string' || !url.startsWith('data:')) return;
    try {
        return hex(await globalThis.crypto.subtle.digest('SHA-256', dataURLBytes(url)));
    } catch {
        return;
    }
};

/**
 * The catalog row for exactly this code: the same ID, and the same address or the same digest.
 *
 * An address is matched only when it is a real one; a `data:` address carries the bytes, so only
 * its digest can say which catalog row it is. A claimed ID alone never matches.
 * @param {Array<object>} entries The parsed catalog.
 * @param {object} entry The review row.
 * @param {string} [digest] The row's digest, when the caller worked it out.
 * @returns {object|undefined} The catalog row.
 */
export const findCatalogEntry = (entries: readonly CatalogEntry[], entry: ReviewEntry, digest?: string) => {
    const source = entry.source;
    const sha256 = digest ?? ('sha256' in source ? source.sha256 : undefined);
    const inline = 'url' in source && source.url.startsWith('data:');
    const matches = (build: {url: string; sha256?: string}) =>
        'url' in source && !inline ? build.url === source.url && (sha256 === undefined || build.sha256 === sha256) :
            sha256 !== undefined && build.sha256 === sha256;
    for (const item of entries) {
        if (!entry.ids.includes(item.id)) continue;
        if (matches(item)) return item;
        // A listed variant is the same extension at its own address: the row is that build.
        const variant = item.variants?.find(matches);
        if (variant) return Object.freeze({...item, url: variant.url, sha256: variant.sha256});
    }
    return undefined;
};

/**
 * Every SHA-256 a catalog vouches for, the main build of each extension and its variants alike.
 * @param {Array<object>} entries The parsed catalog.
 * @returns {Set<string>} Lowercase hex digests.
 */
export const catalogDigests = (entries: readonly CatalogEntry[]) => new Set(entries.flatMap(item => [
    ...(item.sha256 ? [item.sha256] : []), ...(item.variants ?? []).map(variant => variant.sha256)
]));

export interface CatalogMatch {
    item?: CatalogEntry;
    icons: Record<string, string>;
}

/**
 * Read a host's catalog at most once, and find rows in it.
 * @param {object} [catalog] The host's catalog port.
 * @returns {Function} The catalog row for a review row, with the host's curated icons; the row is
 *     undefined without a usable catalog or a match.
 */
export function createCatalogMatcher(catalog?: PreviewCatalog) {
    let pending: Promise<{entries: CatalogEntry[]; icons: Record<string, string>}> | undefined;
    return async (entry: ReviewEntry, signal: AbortSignal, digest?: string): Promise<CatalogMatch> => {
        if (!catalog || signal.aborted) return {icons: {}};
        pending ??= catalog.read(signal).then(read => ({
            entries: read.catalog ? parseExtensionCatalog(read.catalog) : [], icons: read.icons || {}
        })).catch(() => { pending = undefined; return {entries: [], icons: {}}; });
        const {entries, icons} = await pending;
        if (signal.aborted) return {icons};
        return {item: findCatalogEntry(entries, entry, digest), icons};
    };
}
