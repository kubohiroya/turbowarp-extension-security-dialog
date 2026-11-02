import {reviewURL} from './catalog.js';

const BLOCK = /\/\*\*([\s\S]*?)\*\//;
const FIELD = /^[ \t]*\*?[ \t]*@([A-Za-z][A-Za-z0-9]*)[ \t]+(.*)$/;
const LIMIT = 4096;

const trimmed = value => value.replace(/\s+$/, '');

/**
 * Read an extension's own description of itself out of its leading comment block.
 *
 * The bytes are never evaluated: this is a parse of the text, so a source that lies only lies
 * about itself. Whatever it claims — a name, an author, a version — is a claim, never a check;
 * the screen presents these as the extension's own words and verifies none of them.
 * @param {string} source The extension's JavaScript, as text.
 * @returns {object} The fields it declared, with addresses checked for shape only.
 */
export function parseExtensionMetadata(source) {
    if (typeof source !== 'string') return {};
    const block = BLOCK.exec(source.slice(0, 64 * 1024));
    if (block === null) return {};
    const metadata = {};
    const descriptions = {};
    for (const line of block[1].split('\n')) {
        const field = FIELD.exec(line);
        if (field === null) continue;
        const [, name, raw] = field;
        const value = trimmed(raw);
        if (value.length === 0 || value.length > LIMIT) continue;
        if (name === 'description') {
            // `@description ja ...` is the same field said in another language.
            const localized = /^([a-z]{2}(?:-[A-Za-z0-9]+)*)[ \t]+(.+)$/.exec(value);
            if (localized === null) metadata.description = value;
            else descriptions[localized[1].toLowerCase()] = trimmed(localized[2]);
            continue;
        }
        if (['repository', 'docsURL', 'authorURL'].includes(name)) {
            try {
                // A creator's own page is shown, never fetched, so it may be plain HTTP.
                metadata[name] = reviewURL(value, name, name === 'authorURL');
            } catch (error) {
                // A malformed address is dropped rather than shown as if it were one.
            }
            continue;
        }
        if (['name', 'id', 'author', 'version', 'license', 'banner', 'package', 'unsandboxed']
            .includes(name)) {
            metadata[name] = value;
        }
    }
    if (Object.keys(descriptions).length > 0) metadata.descriptions = descriptions;
    return metadata;
}

/**
 * The description to show, preferring the reader's own language over the default one.
 * @param {object} metadata The extension's declared fields.
 * @param {string} locale The reader's locale.
 * @returns {string} The best description available, or an empty string.
 */
export function getExtensionDescription(metadata, locale = 'en') {
    const declared = metadata && metadata.descriptions;
    if (!declared) return (metadata && metadata.description) || '';
    const tag = String(locale || 'en').toLowerCase();
    const language = tag.split('-')[0];
    return declared[tag] || declared[language] ||
        (metadata.description || declared.en || '');
}

/**
 * Whether the extension says it cannot work inside the sandbox.
 *
 * This is the extension's own claim about itself, not a permission. The screen uses it to warn
 * that choosing the sandbox will probably break the extension, never to grant anything.
 * @param {object} metadata The extension's declared fields.
 * @returns {string} One of required, optional, not-needed or unknown.
 */
export function unsandboxedRequirement(metadata) {
    const declared = metadata && typeof metadata.unsandboxed === 'string' ?
        metadata.unsandboxed.trim().toLowerCase() : '';
    if (['required', 'true', 'yes'].includes(declared)) return 'required';
    if (['optional', 'maybe'].includes(declared)) return 'optional';
    if (['false', 'no', 'not-needed', 'none'].includes(declared)) return 'not-needed';
    return 'unknown';
}

/**
 * Fetch an extension's source so its own description can be read, without running it.
 * @param {string} url The extension's address.
 * @param {AbortSignal} [signal] The caller's own deadline or cancellation.
 * @returns {Promise<object>} The source text and the fields it declared.
 */
export async function loadExtensionInfo(url, signal) {
    const address = reviewURL(url, 'extension URL');
    const response = await fetch(address, {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error(`Extension request failed (HTTP ${response.status})`);
    const source = await response.text();
    return {source, metadata: parseExtensionMetadata(source)};
}
