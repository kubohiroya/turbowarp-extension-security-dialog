export type Decision = 'deny' | 'sandboxed' | 'unsandboxed';
export interface ExtensionEntry { url: string; ids: string[]; banner?: string; }
export interface ExtensionMetadata {
    name?: string; id?: string; description?: string; author?: string; version?: string; updatedAt?: string;
    license?: string; repository?: string; banner?: string; unsandboxed?: string;
    descriptions?: Record<string, string>;
}
export interface ExtensionInfo { source: string; metadata: ExtensionMetadata; }
export function parseExtensionMetadata(source: string): ExtensionMetadata;
export function getExtensionDescription(metadata: ExtensionMetadata, locale?: string): string;
export function decodeExtensionDataURL(url: string): string;
export function loadExtensionInfo(url: string, signal: AbortSignal): Promise<ExtensionInfo>;
export function getGitHubRepository(value?: string): string | null;
export function getPreviewCandidates(entry: ExtensionEntry, metadata: ExtensionMetadata | undefined, fallback: string): string[];
export function fingerprint(text: string): Promise<string>;
export function projectFingerprint(input: object | string | ArrayBuffer | ArrayBufferView): Promise<string | null>;
export function readPreferences(key: string): Promise<Record<string, Decision>>;
export function writePreferences(key: string, choices: Record<string, Decision>): Promise<boolean>;
export function restoreChoices(entries: ExtensionEntry[], saved: Record<string, Decision>): Promise<Map<string, Decision | undefined>>;
export function encodeChoices(decisions: Map<string, Decision>): Promise<Record<string, Decision>>;
export const preferences: {
    projectFingerprint: typeof projectFingerprint; readPreferences: typeof readPreferences;
    writePreferences: typeof writePreferences; restoreChoices: typeof restoreChoices; encodeChoices: typeof encodeChoices;
};
export const messages: Record<string, Record<string, string>>;
export function formatMessage(locale: string, key: string, values?: Record<string, string | number>): string;

export interface SelectableExtension extends ExtensionEntry {
    id: string; dependencies: string[]; metadata: ExtensionMetadata;
}
export interface ExtensionSelection {
    selected: Set<string>; required: Set<string>; loaded: Set<string>; ordered: SelectableExtension[];
}
export function resolveExtensionSelection(entries: SelectableExtension[], explicitIds?: Iterable<string>, loadedIds?: Iterable<string>): ExtensionSelection;
export function parseExtensionCatalog(data: unknown): SelectableExtension[];
export function loadExtensionCatalog(url: string, signal?: AbortSignal): Promise<SelectableExtension[]>;
