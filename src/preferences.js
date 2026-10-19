import JSZip from '@turbowarp/jszip';
import {TextEncoder} from './encoding.js';

/* global globalThis */

const DATABASE = 'tw-extension-security';
const STORE = 'project-preferences';
const validMode = mode => ['deny', 'sandboxed', 'unsandboxed'].includes(mode);

const fingerprint = async text => {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
};

const projectFingerprint = async input => {
    let project;
    if (typeof input === 'string') project = JSON.parse(input);
    else if (input && typeof input === 'object' && !(input instanceof ArrayBuffer) && !ArrayBuffer.isView(input)) {
        project = input;
    } else {
        const zip = await JSZip.loadAsync(input);
        const file = zip.file('project.json');
        if (!file) return null;
        project = JSON.parse(await file.async('string'));
    }
    // Ignore editor/build metadata and JSON key order, but keep all project content
    // and extension URLs. Different files with the same name must not share defaults.
    const content = {...project};
    delete content.meta;
    delete content.projectVersion;
    const canonical = JSON.stringify(content, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.fromEntries(Object.keys(value).sort()
                .map(name => [name, value[name]]));
        }
        return value;
    });
    return fingerprint(canonical);
};

const openDatabase = () => new Promise(resolve => {
    let settled = false;
    const timer = {};
    const finish = value => {
        if (settled) {
            if (value) value.close();
            return;
        }
        settled = true;
        clearTimeout(timer.timeout);
        resolve(value);
    };
    timer.timeout = setTimeout(() => finish(null), 1500);
    try {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            finish(request.result);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
    } catch (error) {
        finish(null);
    }
});

const readPreferences = async key => {
    const db = await openDatabase();
    if (!db) return {};
    return new Promise(resolve => {
        let result = {};
        try {
            const transaction = db.transaction(STORE, 'readonly');
            const request = transaction.objectStore(STORE).get(key);
            request.onsuccess = () => {
                if (request.result && request.result.version === 1 && request.result.choices) {
                    result = Object.fromEntries(Object.entries(request.result.choices)
                        .filter(([hash, mode]) => /^[a-f0-9]{64}$/.test(hash) && validMode(mode)));
                }
            };
            transaction.oncomplete = () => {
                db.close(); resolve(result);
            };
            transaction.onerror = transaction.onabort = () => {
                db.close(); resolve({});
            };
        } catch (error) {
            db.close();
            resolve({});
        }
    });
};

const writePreferences = async (key, choices) => {
    const db = await openDatabase();
    if (!db) return false;
    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE, 'readwrite');
            transaction.objectStore(STORE).put({version: 1, choices}, key);
            transaction.oncomplete = () => {
                db.close(); resolve(true);
            };
            transaction.onerror = transaction.onabort = () => {
                db.close(); resolve(false);
            };
        } catch (error) {
            db.close();
            resolve(false);
        }
    });
};

const restoreChoices = async (entries, saved) => new Map(await Promise.all(entries.map(async entry =>
    [entry.url, saved[await fingerprint(entry.url)]])));

const encodeChoices = async decisions => Object.fromEntries(await Promise.all(
    Array.from(decisions, async ([url, mode]) => [await fingerprint(url), mode])
));

const preferences = {projectFingerprint, readPreferences, writePreferences, restoreChoices, encodeChoices};
export {fingerprint, projectFingerprint, readPreferences, writePreferences, restoreChoices, encodeChoices};
export default preferences;
