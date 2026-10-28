import * as React from 'react';
import {Decision, ExtensionEntry, ExtensionInfo, SelectableExtension} from './index.js';
export interface DialogFrameProps {
    children: React.ReactNode; id: string; className: string; contentLabel: string;
    hideCloseButton: boolean; onRequestClose(): void;
}
export interface ExtensionSecurityDialogProps {
    entries: ExtensionEntry[];
    initialChoices?: Map<string, Decision | undefined>;
    locale?: string;
    context?: 'project' | 'catalog';
    DialogFrame?: React.ComponentType<DialogFrameProps>;
    loadInfo?: (url: string, signal: AbortSignal) => Promise<ExtensionInfo>;
    onComplete(decisions: Map<string, Decision> | null): void;
}
export class ExtensionSecurityDialog extends React.Component<ExtensionSecurityDialogProps> {}
export default ExtensionSecurityDialog;

export interface ExtensionSelectionListProps {
    entries: SelectableExtension[]; loadedIds?: string[]; locale?: string; filterQuery?: string; busy?: boolean;
    loadInfo?: (url: string, signal: AbortSignal) => Promise<ExtensionInfo>;
    onComplete(entries: SelectableExtension[]): void;
    onCancel(): void;
}
export class ExtensionSelectionList extends React.Component<ExtensionSelectionListProps> {}
