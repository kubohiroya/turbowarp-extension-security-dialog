import * as React from 'react';
import {Decision, ExtensionEntry, ExtensionInfo, SelectableExtension} from './index.js';
export type DistributionMode = 'embedded' | 'remote';
export type ExecutionMode = 'sandboxed' | 'unsandboxed';
export type InitialExtensionValues<T> = ReadonlyMap<string, T | undefined> | Readonly<Record<string, T | undefined>>;
export interface ExtensionDistributionSettings<T extends ExtensionEntry = ExtensionEntry> {
    /** Includes selected dependencies and already-loaded entries; keyed maps use catalog IDs. */
    entries: T[];
    distributions: Map<string, DistributionMode>;
    /** Execution choices remain keyed by URL for compatibility with the security review API. */
    choices: Map<string, Decision>;
}
export interface DialogFrameProps {
    children: React.ReactNode; id: string; className: string; contentLabel: string;
    hideCloseButton: boolean; onRequestClose(): void;
}
export interface ExtensionSecurityDialogProps {
    entries: ExtensionEntry[];
    initialChoices?: InitialExtensionValues<Decision>;
    enableDistribution?: boolean;
    initialDistributions?: InitialExtensionValues<DistributionMode>;
    locale?: string;
    context?: 'project' | 'catalog';
    DialogFrame?: React.ComponentType<DialogFrameProps>;
    loadInfo?: (url: string, signal: AbortSignal) => Promise<ExtensionInfo>;
    onComplete(decisions: Map<string, Decision> | null, settings?: ExtensionDistributionSettings): void;
}
export class ExtensionSecurityDialog extends React.Component<ExtensionSecurityDialogProps> {}
export default ExtensionSecurityDialog;

export interface ExtensionSelectionListProps {
    entries: SelectableExtension[]; loadedIds?: string[]; locale?: string; filterQuery?: string; busy?: boolean;
    /** Selection checkboxes exclude packages; execution choices never contain deny. */
    initialChoices?: InitialExtensionValues<ExecutionMode>;
    enableDistribution?: boolean;
    initialDistributions?: InitialExtensionValues<DistributionMode>;
    loadInfo?: (url: string, signal: AbortSignal) => Promise<ExtensionInfo>;
    onComplete(entries: SelectableExtension[], settings?: ExtensionDistributionSettings<SelectableExtension>): void;
    onCancel(): void;
}
export class ExtensionSelectionList extends React.Component<ExtensionSelectionListProps> {}
