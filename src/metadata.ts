import type {ExtensionMetadata} from './review-types.js';
import {reviewURL} from './catalog.js';
import {contactURL} from './display-urls.js';

const BLOCK = /\/\*\*([\s\S]*?)\*\//;
const FIELD = /^[ \t]*\*?[ \t]*@([A-Za-z][A-Za-z0-9]*)[ \t]+(.*)$/;
const LIMIT = 4096;

const trimmed = (value: string) => value.replace(/\s+$/, '');

/**
 * Read the text of a `data:` URL, base64 or percent-encoded.
 *
 * This decodes; it never evaluates. What comes back is a string to be parsed like any other
 * source, and a URL that is not one fails here rather than further in.
 * @param {string} url The data URL.
 * @returns {string} The text it carries.
 */
export function decodeExtensionDataURL(url: string) {
    const comma = url.indexOf(',');
    if (comma < 0) throw new Error('Not a data URL');
    const content = url.slice(comma + 1);
    if (!(/;base64$/i).test(url.slice(0, comma))) return decodeURIComponent(content);
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
}

/**
 * Read an extension's own description of itself out of its leading comment block.
 *
 * The bytes are never evaluated: this is a parse of the text, so a source that lies only lies
 * about itself. Whatever it claims — a name, an author, a version — is a claim, never a check;
 * the screen presents these as the extension's own words and verifies none of them.
 * @param {string} source The extension's JavaScript, as text.
 * @returns {object} The fields it declared, with addresses checked for shape only.
 */
export function parseExtensionMetadata(source: string): ExtensionMetadata {
    if (typeof source !== 'string') return {};
    const text = source.slice(0, 64 * 1024);
    const metadata: ExtensionMetadata = {};
    const descriptions: Record<string, string> = {};
    const record = (name: string, raw: string, locale?: string) => {
        const value = trimmed(raw);
        if (value.length === 0 || value.length > LIMIT) return;
        if (name === 'description') {
            if (locale) descriptions[locale.toLowerCase()] = value;
            else metadata.description = value;
            return;
        }
        if (name === 'repository' || name === 'docsURL' || name === 'authorURL') {
            try {
                // A creator's contact is shown, never fetched or used to load code.
                metadata[name] = name === 'authorURL' ? contactURL(value) : reviewURL(value, name);
            } catch (error) {
                // A malformed address is dropped rather than shown as if it were one.
            }
            return;
        }
        if (['name', 'id', 'author', 'version', 'license', 'banner', 'package', 'unsandboxed']
            .includes(name)) {
            metadata[name as Exclude<keyof ExtensionMetadata, 'descriptions'>] = value;
        }
    };
    // The run of `//` lines TurboWarp's own extensions and its gallery open with comes first, so
    // that the documented block, where there is one, is what a field finally says.
    for (const [name, raw, locale] of headerFields(text)) record(name, raw, locale);
    const block = BLOCK.exec(text);
    if (block !== null) {
        for (const line of block[1].split('\n')) {
            const field = FIELD.exec(line);
            if (field === null) continue;
            const [, name, raw] = field;
            // `@description ja ...` is the same field said in another language.
            const localized = name === 'description' ? /^([a-z]{2}(?:-[A-Za-z0-9]+)*)[ \t]+(.+)$/.exec(trimmed(raw)) : null;
            if (localized === null) record(name, raw);
            else record(name, localized[2], localized[1]);
        }
    }
    if (Object.keys(descriptions).length > 0) metadata.descriptions = descriptions;
    return metadata;
}

/** What a TurboWarp header calls each field, by the name this package gives it. */
const HEADER_FIELDS: Readonly<Record<string, string>> = Object.freeze({
    name: 'name', id: 'id', description: 'description', by: 'author', author: 'author',
    version: 'version', license: 'license', unsandboxed: 'unsandboxed',
    repository: 'repository', source: 'repository', 'docs url': 'docsURL', docsurl: 'docsURL',
    'author url': 'authorURL', authorurl: 'authorURL', banner: 'banner', package: 'package'
});

/**
 * The fields of the `// Name: ...` header TurboWarp's extensions open with.
 *
 * Only the leading run of comment lines is a header; a comment further down is the code's own.
 * A bundle lists its members after `Bundled extensions:`, and what it says about them is theirs,
 * not this extension's, so reading stops there. Each field keeps the first value it is given.
 * @param {string} text The start of the extension's source.
 * @returns {Array<Array<string>>} `[name, value, locale?]` for each field, in order.
 */
function headerFields(text: string) {
    const fields: Array<[name: string, value: string, locale?: string]> = [];
    const seen = new Set();
    for (const line of text.split('\n')) {
        const comment = /^[ \t]*\/\/(.*)$/.exec(line);
        if (comment === null) {
            if (line.trim() === '') continue;
            break;
        }
        const body = comment[1];
        if (/^\s*Bundled extensions:\s*$/i.test(body)) break;
        const field = /^ ?([A-Za-z][A-Za-z -]*?)(?:\[([a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)\])?:[ \t]*(.*)$/.exec(body);
        if (field === null) continue;
        const name = HEADER_FIELDS[field[1].trim().toLowerCase()];
        const key = `${name}:${field[2] || ''}`;
        if (!name || seen.has(key)) continue;
        seen.add(key);
        fields.push(field[2] ? [name, field[3], field[2]] : [name, field[3]]);
    }
    return fields;
}

/**
 * The description to show, preferring the reader's own language over the default one.
 * @param {object} metadata The extension's declared fields.
 * @param {string} locale The reader's locale.
 * @returns {string} The best description available, or an empty string.
 */
export function getExtensionDescription(metadata: ExtensionMetadata, locale = 'en') {
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
export function unsandboxedRequirement(metadata: ExtensionMetadata) {
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
export async function loadExtensionInfo(url: string, signal?: AbortSignal) {
    // A project may carry an extension as a data: URL so stock TurboWarp can open it too. The
    // bytes are already in hand, so there is nothing to fetch and no address to check; refusing
    // the scheme would leave the person approving a row whose own description sits right there.
    if (String(url).startsWith('data:')) {
        // Decoding a bundle is not free, so let the list mount before doing it.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (signal && signal.aborted) throw new Error('Extension metadata request aborted');
        const source = decodeExtensionDataURL(url);
        return {source, metadata: parseExtensionMetadata(source)};
    }
    const address = reviewURL(url, 'extension URL');
    const response = await fetch(address, {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error(`Extension request failed (HTTP ${response.status})`);
    const source = await response.text();
    return {source, metadata: parseExtensionMetadata(source)};
}
