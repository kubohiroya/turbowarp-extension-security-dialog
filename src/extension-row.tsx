import type {ReactNode} from 'react';
import type {ExtensionMetadata} from './review-types.js';
import type {PreviewCache} from './storage.js';
import React from 'react';
import {formatMessage} from './messages.js';
import {getExtensionDescription} from './metadata.js';
import {ExtensionPreview} from './preview.js';
import {displayURL, releaseURL} from './display-urls.js';
import {LinkedText} from './linked-text.js';

declare const __SECURITY_COMMON_BANNER__: string;
declare const __SECURITY_TRUSTED_BADGE__: string;
// A row with no picture of its own still gets one, so the list does not read as half-filled.
const fallbackBanner = __SECURITY_COMMON_BANNER__;
const trustedBadge = __SECURITY_TRUSTED_BADGE__;

export interface ExtensionRowPick {
    /** Whether the row is chosen. */
    checked: boolean;
    /** A choice the person cannot change here, such as an extension another one needs. */
    disabled?: boolean;
    onToggle(): void;
}

export interface ExtensionRowProps {
    /** What the extension says about itself: name, description, creator, version and links. */
    metadata: ExtensionMetadata;
    /** The extension IDs; shown beside the name, or as the name when the extension has none. */
    ids?: readonly string[];
    locale?: string;
    /** Marks the row as trusted by the host. */
    trusted?: boolean;
    /** Given, the row has a checkbox, and its picture chooses the same way. */
    pick?: ExtensionRowPick;
    /** Where pictures are kept between visits; null keeps nothing. */
    previewCache?: PreviewCache | null;
    /** Extra attributes for the list item, such as `data-key`. */
    itemProps?: Record<string, string | undefined>;
    /** Shown between the heading and the picture, such as where the extension loads from. */
    details?: ReactNode;
    /** Shown after the creator, such as the host's own choices for this extension. */
    children?: ReactNode;
}

/**
 * One extension in a list: a heading with its name (and checkbox, when it can be chosen), its
 * picture, what it says it does and who made it. The review screen and any other list of
 * extensions draw the same row, so an extension looks the same wherever it is offered.
 */
export const ExtensionRow = ({metadata, ids = [], locale, trusted = false, pick, previewCache, itemProps, details,
    children}: ExtensionRowProps) => {
    const t = (key: string) => formatMessage(locale, key);
    const declaredName = metadata.name?.trim();
    const idText = ids.join(', ');
    const name = declaredName || idText || t('extensionUnknown');
    const website = displayURL(metadata.docsURL);
    const release = releaseURL(metadata);
    const badge = (
        <img
            className="twextsec-trusted"
            src={trustedBadge}
            alt={t('trusted')}
            title={t('trusted')}
        />
    );
    const preview = (
        <ExtensionPreview
            url={metadata.banner || fallbackBanner}
            fallback={!metadata.banner}
            name={name}
            cache={previewCache}
            locale={locale}
        />
    );
    return (
        <li
            className="twextsec-row"
            data-picking={pick ? 'true' : undefined}
            {...itemProps}
        >
            <div className="twextsec-head">
                {pick ? (
                    <label className="twextsec-pick">
                        <input
                            type="checkbox"
                            checked={pick.checked}
                            disabled={pick.disabled}
                            onChange={pick.onToggle}
                        />
                        <strong>{name}</strong>
                    </label>
                ) : <strong>{name}</strong>}
                {/* Without a name the heading is already the ID; saying it again adds nothing. */}
                {declaredName && idText && <span className="twextsec-id">{idText}</span>}
                {/* Trust is a mark beside the name, the way a verified account is marked, with its
                    meaning in words for anyone who cannot see it. */}
                {trusted && (website ? (
                    <a
                        className="twextsec-trusted-link"
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t('extensionPage')}: ${name}`}
                    >{badge}</a>
                ) : badge)}
                {metadata.version && (release ? (
                    <a
                        href={release}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('releaseNotes')}
                    >{t('version')} {metadata.version}</a>
                ) : <span>{t('version')} {metadata.version}</span>)}
            </div>
            {details}
            {/* When choosing, the picture is a larger target for the same choice as the checkbox,
                which stays the one control a keyboard or screen reader uses. */}
            {pick ? (
                <span
                    className="twextsec-preview-pick"
                    aria-hidden="true"
                    onClick={pick.disabled ? undefined : pick.onToggle}
                >{preview}</span>
            ) : preview}
            <p className="twextsec-about"><LinkedText text={getExtensionDescription(metadata, locale)} /></p>
            <p className="twextsec-claim">
                {t('creator')}: <LinkedText text={metadata.author || t('creatorUnknown')} />
                {metadata.authorURL && (
                    <span className="twextsec-contact"> <LinkedText text={metadata.authorURL} /></span>
                )}
            </p>
            {children}
        </li>
    );
};

export default ExtensionRow;
