// SPDX-License-Identifier: MPL-2.0
import {parseExtensionCatalog} from './catalog.js';
import type {ReviewEntry} from './review-types.js';

export interface PreviewCatalog {
    read(signal: AbortSignal): Promise<{catalog?: unknown; icons?: Record<string, string>}>;
}

/** The catalog already chooses the declared banner or the package's block SVG. */
export function createCatalogPreviewResolver(catalog?: PreviewCatalog) {
    let pending: Promise<{entries: ReturnType<typeof parseExtensionCatalog>; icons: Record<string, string>}> | undefined;
    return async (entry: ReviewEntry, signal: AbortSignal): Promise<string | undefined> => {
        if (!catalog || !entry.state?.plusFamily || signal.aborted) return;
        pending ??= catalog.read(signal).then(read => ({
            entries: read.catalog ? parseExtensionCatalog(read.catalog) : [], icons: read.icons || {}
        })).catch(() => ({entries: [], icons: {}}));
        const {entries, icons} = await pending;
        if (signal.aborted) return;
        const source = entry.source;
        const item = entries.find(item => entry.ids.includes(item.id) && (
            'url' in source && !source.url.startsWith('data:') ? item.url === source.url &&
                (!('sha256' in source) || source.sha256 === item.sha256) :
                'sha256' in source && source.sha256 === item.sha256
        ));
        return item && (icons[item.id] || item.metadata.banner);
    };
}
