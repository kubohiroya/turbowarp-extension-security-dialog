// SPDX-License-Identifier: MPL-2.0
import {createCatalogMatcher, inlineCodeDigest} from './catalog-match.js';
import type {PreviewCatalog} from './catalog-preview.js';
import type {ReviewEntry} from './review-types.js';

/** Bind declarations to the exact catalog address/digest, never to a project's package-name claim. */
export function createCatalogResourceResolver(catalog?: PreviewCatalog) {
    const match = createCatalogMatcher(catalog);
    return async (entry: ReviewEntry, signal: AbortSignal) => {
        const source = entry.source;
        const inline = 'url' in source && source.url.startsWith('data:');
        const digest = inline ? await inlineCodeDigest(source.url) : undefined;
        if (inline && !digest) return;
        return (await match(entry, signal, digest)).item?.metadata.resourceDeclaration;
    };
}
