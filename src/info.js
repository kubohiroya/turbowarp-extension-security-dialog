import {TextDecoder} from './encoding.js';

const parseExtensionMetadata = source => {
    const metadata = {};
    const fields = {
        name: 'name',
        description: 'description',
        author: 'author',
        by: 'author',
        version: 'version',
        license: 'license',
        repository: 'repository',
        source: 'repository',
        banner: 'banner',
        thumbnail: 'banner',
        image: 'banner',
        unsandboxed: 'unsandboxed'
    };
    // Read declarative header comments only; never evaluate getInfo() or extension code.
    const header = source.slice(0, 16384).match(/^\s*(?:(?:\/\/[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/)\s*)*/)[0];
    for (const line of header.split('\n')) {
        const match = /^\s*(?:\/\/|\/\*|\*)\s*([\w -]+):\s*(.*?)\s*(?:\*\/)?$/.exec(line);
        if (match && fields[match[1].toLowerCase()]) {
            metadata[fields[match[1].toLowerCase()]] = match[2].slice(0, 1000);
        }
    }
    return metadata;
};

const decodeExtensionDataURL = url => {
    const comma = url.indexOf(',');
    if (comma < 0) throw new Error('Invalid extension data URL');
    const content = url.slice(comma + 1);
    if (/;base64$/i.test(url.slice(0, comma))) {
        const binary = atob(content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(content);
};

const loadExtensionInfo = async (url, signal) => {
    let source;
    if (url.startsWith('data:')) {
        // Yield before decoding embedded bundles so the list is mounted first.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (signal.aborted) throw new Error('Extension metadata request aborted');
        source = decodeExtensionDataURL(url);
    } else {
        const response = await fetch(url, {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
        if (!response.ok) throw new Error(`Extension source HTTP ${response.status}`);
        source = await response.text();
    }
    return {source, metadata: parseExtensionMetadata(source)};
};

const getGitHubRepository = value => {
    try {
        const url = new URL(value);
        let parts = url.pathname.split('/').filter(Boolean);
        if (url.hostname === 'cdn.jsdelivr.net' && parts[0] === 'gh') parts = parts.slice(1);
        else if (!['github.com', 'raw.githubusercontent.com'].includes(url.hostname)) return null;
        const owner = parts[0];
        const repo = (parts[1] || '').split('@')[0].replace(/\.git$/, '');
        if (!/^[\w-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
        return `${owner}/${repo}`;
    } catch (e) {
        return null;
    }
};

const getPreviewCandidates = (entry, metadata = {}, fallback) => {
    const candidates = [];
    for (const value of [entry.banner, metadata.banner]) {
        if (!value) continue;
        try {
            const url = new URL(value, entry.url);
            if (['https:', 'http:'].includes(url.protocol) || /^data:image\//.test(url.href)) {
                candidates.push(url.href);
            }
        } catch (e) {
            // A malformed image URL must not prevent a permission decision.
        }
    }
    const repository = getGitHubRepository(metadata.repository) || getGitHubRepository(entry.url);
    if (repository) candidates.push(`https://opengraph.githubassets.com/extension-security/${repository}`);
    candidates.push(fallback);
    return [...new Set(candidates)];
};

export {parseExtensionMetadata, decodeExtensionDataURL, loadExtensionInfo, getGitHubRepository, getPreviewCandidates};
