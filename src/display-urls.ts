import type {ExtensionMetadata} from './review-types.js';

/** Display-only links never supply code to the extension loader. */
export const displayURL = (value: unknown, allowMail = false) => {
    if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f]/.test(value)) return null;
    try {
        const url = new URL(value);
        if (url.username || url.password) return null;
        if (url.protocol === 'http:' || url.protocol === 'https:') return value;
        if (allowMail && url.protocol === 'mailto:' &&
            /^[^\s@]+@[^\s@]+$/.test(decodeURIComponent(url.pathname))) return value;
    } catch (error) {
        // Incomplete or malformed text remains plain text.
    }
    return null;
};

/** Keep the contact field's existing URL contract, also accepting email links. */
export const contactURL = (value: unknown) => {
    const address = displayURL(value, true);
    if (!address || address.length > 2048 || new URL(address).hash) {
        throw new Error('authorURL must be HTTP(S) or mailto without credentials or a fragment');
    }
    return address;
};

/** This catalog's GitHub releases use v-prefixed package versions, including prereleases. */
export const releaseURL = (metadata: ExtensionMetadata) => {
    const address = displayURL(metadata.repository);
    const version = metadata.version;
    if (!address || !version ||
        !/^v?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) return null;
    const repository = new URL(address);
    if (repository.origin !== 'https://github.com' || repository.search || repository.hash) return null;
    const path = /^\/([\w.-]+)\/([\w.-]+?)\/?$/.exec(repository.pathname);
    if (!path) return null;
    const tag = version.replace(/^v/, '');
    return `https://github.com/${path[1]}/${path[2].replace(/\.git$/, '')}/releases/tag/${encodeURIComponent(`v${tag}`)}`;
};
