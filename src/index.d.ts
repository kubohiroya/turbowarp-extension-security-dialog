export * from './review-types.js';
import type {
    ExtensionMetadata, ReviewDecision, ReviewEntry, LoadingMode, ExecutionDecision
} from './review-types.js';

export interface CatalogCategory {
    id: string; title: string; titleJa?: string; order: number;
}
export interface CatalogEntry {
    key: string; id: string; ids: string[]; url: string; sha256?: string;
    dependencies: readonly string[]; metadata: ExtensionMetadata; category?: CatalogCategory;
}
export function reviewURL(value: unknown, what?: string, allowHTTP?: boolean): string;
export function parseExtensionCatalog(data: unknown): CatalogEntry[];
export function loadExtensionCatalog(url: string, signal?: AbortSignal): Promise<CatalogEntry[]>;

export function parseExtensionMetadata(source: string): ExtensionMetadata;
export function getExtensionDescription(metadata: ExtensionMetadata, locale?: string): string;
export function unsandboxedRequirement(metadata: ExtensionMetadata): 'required' | 'optional' | 'not-needed' | 'unknown';
export function decodeExtensionDataURL(url: string): string;
export function loadExtensionInfo(url: string, signal?: AbortSignal): Promise<{source: string; metadata: ExtensionMetadata}>;

export type SelectionState = 'loaded' | 'selected' | 'dependency' | 'unselected';
export interface ExtensionSelection {
    selected: Set<string>; explicit: Set<string>; required: Set<string>;
    requiredBy: Map<string, Set<string>>; loaded: Set<string>;
    ordered: Array<{id: string}>; stateOf(id: string): SelectionState;
}
export function resolveExtensionSelection(
    entries: Array<{id: string; dependencies?: readonly string[]}>,
    chosen?: Iterable<string>, loaded?: Iterable<string>
): ExtensionSelection;

export interface DecisionStorage {
    readonly fallbackLoading: LoadingMode;
    read(project: string): Promise<Map<string, ReviewDecision>>;
    write(project: string, decisions: Map<string, ReviewDecision>): Promise<boolean>;
    forget(project: string): Promise<boolean>;
}
export function createDecisionStorage(options?: {fallbackLoading?: LoadingMode}): DecisionStorage;
export interface PreviewCache {
    read(url: string): Promise<Blob | null>;
    write(url: string, blob: Blob): Promise<boolean>;
}
export function createPreviewCache(): PreviewCache;

export type ReviewMode = 'add' | 'open';
export function isTrusted(entry: ReviewEntry): boolean;
export const loadingModes: readonly LoadingMode[];
export function loadingChoices(entry: ReviewEntry): LoadingMode[];
export function executionChoices(entry: ReviewEntry, mode: ReviewMode): ExecutionDecision[];
export function defaultDecision(entry: ReviewEntry, mode: ReviewMode, fallbackLoading?: LoadingMode): ReviewDecision;
export function initialDecisions(entries: ReviewEntry[], mode: ReviewMode,
    options?: {recorded?: ReadonlyMap<string, ReviewDecision>; fallbackLoading?: LoadingMode}
): Map<string, ReviewDecision>;
export function requiresReview(entries: ReviewEntry[]): boolean;
export function contradictsDeclaration(entry: ReviewEntry, decision: ReviewDecision): boolean;

export interface ExtensionWaitDialog {
    show(info: {url?: string; attempt?: number; attempts?: number}): void;
    hide(): void;
    dispose(): void;
}
export function createExtensionWaitDialog(
    document: Document, locale?: string, options?: {delayMs?: number}
): ExtensionWaitDialog;

export const messages: Record<string, Record<string, string>>;
export function formatMessage(locale: string, key: string, values?: Record<string, string | number>): string;
