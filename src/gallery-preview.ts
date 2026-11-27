// SPDX-License-Identifier: MPL-2.0
const origin = 'https://extensions.turbowarp.org/';
const catalogURL = `${origin}generated-metadata/extensions-v0.json`;

function galleryURL(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return;
    try {
        const url = new URL(value, origin);
        if (url.origin === new URL(origin).origin && !url.username && !url.password && !url.search && !url.hash) {
            return url.href;
        }
    } catch { /* Optional display metadata must not prevent review. */ }
}

/** One catalog read per review, matched by the code's full URL rather than a claimed ID. */
export function createGalleryPreviewResolver() {
    let pending: Promise<Map<string, string>> | undefined;
    return async (url: string, signal: AbortSignal): Promise<string | undefined> => {
        // Do not request the catalog for embedded code, another host, or a modified URL.
        if (!url.startsWith(origin) || galleryURL(url) !== url || signal.aborted) return;
        if (!pending) {
            pending = (async () => {
                const controller = new AbortController();
                const abort = () => controller.abort();
                signal.addEventListener('abort', abort, {once: true});
                const timer = setTimeout(abort, 4000);
                try {
                    const response = await fetch(catalogURL, {
                        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
                    });
                    if (!response.ok) return new Map<string, string>();
                    const data = await response.json();
                    const pictures = new Map<string, string>();
                    const seen = new Set<string>();
                    for (const item of Array.isArray(data?.extensions) ? data.extensions : []) {
                        if (!item || typeof item.slug !== 'string') continue;
                        const source = galleryURL(`${origin}${item.slug}.js`);
                        const image = galleryURL(item.image);
                        if (!source) continue;
                        if (seen.has(source)) {
                            pictures.delete(source);
                            continue;
                        }
                        seen.add(source);
                        if (image) pictures.set(source, image);
                    }
                    return pictures;
                } catch {
                    return new Map<string, string>();
                } finally {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', abort);
                }
            })();
        }
        const pictures = await pending;
        return signal.aborted ? undefined : pictures.get(url);
    };
}
