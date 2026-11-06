import type {LoadingMode, ReviewDecision} from './review-types.js';

export interface DecisionStorage {
    readonly fallbackLoading: LoadingMode;
    read(project: string): Promise<Map<string, ReviewDecision>>;
    write(project: string, decisions: Map<string, ReviewDecision>): Promise<boolean>;
    forget(project: string): Promise<boolean>;
}

export interface PreviewCache {
    read(url: string): Promise<Blob | null>;
    write(url: string, blob: Blob): Promise<boolean>;
}

const NAME = 'twextsec';
const VERSION = 1;
const DECISIONS = 'decisions';
const PREVIEWS = 'previews';

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('This browser has no IndexedDB'));
        return;
    }
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DECISIONS)) db.createObjectStore(DECISIONS);
        if (!db.objectStoreNames.contains(PREVIEWS)) db.createObjectStore(PREVIEWS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const run = async (store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<unknown> => {
    const db = await open();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(store, mode);
            const request = work(transaction.objectStore(store));
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve(request ? request.result : undefined);
        });
    } finally {
        db.close();
    }
};

/**
 * What the person opening a project chose last time, kept in their own browser.
 *
 * These are the opener's decisions, not the author's: whether a `remote-cacheable` extension
 * actually leaves its copy in this browser, and how far each one is allowed to run. They never
 * travel with the project, because they are about this browser and this person's trust, not about
 * the work.
 *
 * Every read answers with something usable even when storage is unavailable — a private window, a
 * browser with site data blocked — so a screen built on this never fails to open.
 * @param {string} [fallbackLoading] Which form a row with no recorded choice prefers.
 * @returns {object} Reading and writing ends for one project's decisions.
 */
export function createDecisionStorage({fallbackLoading = 'remote-cacheable'}: {fallbackLoading?: LoadingMode} = {}): DecisionStorage {
    return Object.freeze({
        fallbackLoading,
        /**
         * Read one project's recorded decisions.
         * @param {string} project The project's own identifier.
         * @returns {Promise<Map>} Decisions by row key; empty when nothing is recorded.
         */
        async read(project: string) {
            try {
                const stored = await run(DECISIONS, 'readonly', store => store.get(String(project)));
                if (!stored || typeof stored !== 'object') return new Map();
                return new Map(Object.entries(stored).filter((entry): entry is [string, ReviewDecision] => {
                    const value: unknown = entry[1];
                    return Boolean(value && typeof value === 'object' &&
                        'execution' in value && typeof value.execution === 'string');
                }));
            } catch (error) {
                return new Map();
            }
        },
        /**
         * Record one project's decisions, replacing what was there.
         * @param {string} project The project's own identifier.
         * @param {Map} decisions Decisions by row key.
         * @returns {Promise<boolean>} Whether the browser kept them.
         */
        async write(project: string, decisions: Map<string, ReviewDecision>) {
            try {
                const plain = Object.fromEntries([...decisions].map(([key, value]) => [key, {
                    execution: value.execution,
                    ...(value.loading === undefined ? {} : {loading: value.loading})
                }]));
                await run(DECISIONS, 'readwrite', store => store.put(plain, String(project)));
                return true;
            } catch (error) {
                return false;
            }
        },
        /**
         * Forget one project's decisions.
         * @param {string} project The project's own identifier.
         * @returns {Promise<boolean>} Whether the browser forgot them.
         */
        async forget(project: string) {
            try {
                await run(DECISIONS, 'readwrite', store => store.delete(String(project)));
                return true;
            } catch (error) {
                return false;
            }
        }
    });
}

/**
 * The preview images the screen shows, kept so the second look costs nothing.
 *
 * A banner is decoration: it is fetched once, kept by its address, and served from the browser
 * afterwards. Nothing here is verified against a digest, so a preview is never evidence about
 * the code — it is a picture beside a row, and the row's own checks are elsewhere.
 * @returns {object} Reading and writing ends for the preview cache.
 */
export function createPreviewCache(): PreviewCache {
    return Object.freeze({
        /**
         * Read a cached preview.
         * @param {string} url The image's address.
         * @returns {Promise<Blob|null>} The image, or null when it is not kept.
         */
        async read(url: string) {
            try {
                const stored = await run(PREVIEWS, 'readonly', store => store.get(String(url)));
                return stored instanceof Blob ? stored : null;
            } catch (error) {
                return null;
            }
        },
        /**
         * Keep a preview for next time.
         * @param {string} url The image's address.
         * @param {Blob} blob The image.
         * @returns {Promise<boolean>} Whether the browser kept it.
         */
        async write(url: string, blob: Blob) {
            try {
                if (!(blob instanceof Blob)) return false;
                await run(PREVIEWS, 'readwrite', store => store.put(blob, String(url)));
                return true;
            } catch (error) {
                return false;
            }
        }
    });
}
