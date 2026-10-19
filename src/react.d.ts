import * as React from 'react';
import {Decision, ExtensionEntry, ExtensionInfo} from './index.js';
export interface DialogFrameProps {
    children: React.ReactNode; id: string; className: string; contentLabel: string;
    hideCloseButton: boolean; onRequestClose(): void;
}
export interface ExtensionSecurityDialogProps {
    entries: ExtensionEntry[];
    initialChoices?: Map<string, Decision | undefined>;
    locale?: string;
    DialogFrame?: React.ComponentType<DialogFrameProps>;
    loadInfo?: (url: string, signal: AbortSignal) => Promise<ExtensionInfo>;
    onComplete(decisions: Map<string, Decision> | null): void;
}
export class ExtensionSecurityDialog extends React.Component<ExtensionSecurityDialogProps> {}
export default ExtensionSecurityDialog;
