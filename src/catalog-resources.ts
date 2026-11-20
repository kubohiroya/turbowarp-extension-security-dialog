// SPDX-License-Identifier: MPL-2.0
import {parseExtensionCatalog} from './catalog.js';
import {decodeExtensionDataURL} from './metadata.js';
import type {PreviewCatalog} from './catalog-preview.js';
import type {ReviewEntry} from './review-types.js';

/** Bind declarations to the exact catalog address/digest, never to a project's package-name claim. */
export function createCatalogResourceResolver(catalog?: PreviewCatalog) {
    let pending: Promise<ReturnType<typeof parseExtensionCatalog>> | undefined;
    return async (entry: ReviewEntry, signal: AbortSignal) => {
        if (!catalog || signal.aborted) return;
        pending ??= catalog.read(signal).then(read => read.catalog ? parseExtensionCatalog(read.catalog) : [])
            .catch(() => { pending = undefined; return []; });
        const entries = await pending;
        if (signal.aborted) return;
        const source = entry.source;
        let digest = 'sha256' in source ? source.sha256 : undefined;
        const inline = 'url' in source && source.url.startsWith('data:');
        if (inline) {
            try {
                const bytes = new TextEncoder().encode(decodeExtensionDataURL(source.url));
                const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
                digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
            } catch { return; }
        }
        if (signal.aborted) return;
        const item = entries.find(item => entry.ids.includes(item.id) && (
            'url' in source && !inline ? item.url === source.url &&
                (digest === undefined || item.sha256 === digest) :
                digest !== undefined && item.sha256 === digest
        ));
        return item?.metadata.resourceDeclaration;
    };
}
