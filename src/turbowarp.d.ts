import {Decision, ExtensionEntry, preferences} from './index.js';
export function isExtensionSecurityCancelled(error: unknown): boolean;
/** Compatibility adapter for TurboWarp's current instance-level loading hooks. */
export function installBatchExtensionLoader(
    vm: object,
    review: (entries: ExtensionEntry[], initialChoices: Map<string, Decision | undefined>) => Promise<Map<string, Decision> | null>,
    defaultURLs: Record<string, string>,
    storage?: typeof preferences
): () => void;
