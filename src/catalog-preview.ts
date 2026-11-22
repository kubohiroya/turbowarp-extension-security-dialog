// SPDX-License-Identifier: MPL-2.0
import {createCatalogMatcher} from './catalog-match.js';
import type {ReviewEntry} from './review-types.js';

export interface PreviewCatalog {
    read(signal: AbortSignal): Promise<{catalog?: unknown; icons?: Record<string, string>}>;
}

/** The catalog already chooses the declared banner or the package's block SVG. */
export function createCatalogPreviewResolver(catalog?: PreviewCatalog) {
    const match = createCatalogMatcher(catalog);
    return async (entry: ReviewEntry, signal: AbortSignal): Promise<string | undefined> => {
        if (!catalog || !entry.state?.plusFamily || signal.aborted) return;
        const {item, icons} = await match(entry, signal);
        if (signal.aborted) return;
        return item && (icons[item.id] || item.metadata.banner);
    };
}
