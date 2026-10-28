import React from 'react';
import BannerPreview from './banner-preview.jsx';
import {getPreviewCandidates, getExtensionDescription, getGitHubRepository} from './info.js';
import {formatMessage} from './messages.js';
import styles from './style-names.js';

const commonBanner = __SECURITY_COMMON_BANNER__;

export const requiresUnsandboxed = metadata => metadata && typeof metadata.unsandboxed === 'string' &&
    metadata.unsandboxed.trim().toLowerCase() === 'required';

/** Resolve only shared image, service-link and execution fields; preserve each UI's other metadata. */
export const resolveSharedPackageMetadata = (entry, sourceMetadata = {}) => {
    const catalog = entry.metadata || {};
    const source = sourceMetadata || {};
    const metadata = {};
    for (const field of ['banner', 'repository', 'package', 'unsandboxed']) {
        metadata[field] = catalog[field] === undefined ? source[field] : catalog[field];
    }
    if (requiresUnsandboxed(catalog) || requiresUnsandboxed(source)) metadata.unsandboxed = 'required';
    return metadata;
};

export const getPackagePreviewCandidates = (entry, metadata) => getPreviewCandidates(entry, metadata, commonBanner);

const externalURL = (value, protocols = ['https:']) => {
    try {
        const url = new URL(value);
        return protocols.includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (e) {
        return null;
    }
};

const PackageIcon = ({service}) => service === 'github' ? (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.69-1.08-2.69-1.08-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 018 3.73c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.33c0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
) : (
    <svg viewBox="0 0 18 7" width="30" height="16" aria-hidden="true" focusable="false">
        <path fill="#cb3837" d="M0 0h18v6H9v1H5V6H0z" />
        <path fill="#fff" d="M1 1h4v4H4V2H3v3H1zm5 0h5v4H9v1H7V2H6zm2 1v2h1V2zm4-1h5v4h-1V2h-1v3h-1V2h-1v3h-1z" />
    </svg>
);

/** Shared description renderer with explicit presentation options for fields outside the alignment scope. */
const PackageDescription = ({entry, metadata, sharedMetadata, locale, index, previewIndex, status,
    onImageError, idPrefix, requirementId, linkCreator, showMissingMetadata, documentation, provenance, children}) => {
    const t = (key, values) => formatMessage(locale, key, values);
    const name = metadata.name || entry.ids.join(', ');
    const description = getExtensionDescription(metadata, locale);
    const candidates = getPackagePreviewCandidates(entry, sharedMetadata);
    const declared = typeof sharedMetadata.unsandboxed === 'string' ? sharedMetadata.unsandboxed.trim().toLowerCase() : '';
    const requirement = ['required', 'optional', 'not-needed'].includes(declared) ? declared : 'unknown';
    const docsURL = documentation && externalURL(metadata.docsURL);
    const authorURL = linkCreator && externalURL(metadata.authorURL, ['https:', 'http:']);
    const repositoryURL = externalURL(sharedMetadata.repository);
    const repository = repositoryURL && getGitHubRepository(repositoryURL);
    const packageName = typeof sharedMetadata.package === 'string' ? sharedMetadata.package.trim() : '';
    const validPackage = packageName.length <= 214 &&
        /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(packageName) &&
        !['node_modules', 'favicon.ico'].includes(packageName);
    const npmURL = validPackage ? `https://www.npmjs.com/package/${
        packageName.split('/').map(encodeURIComponent).join('/').replace(/^%40/, '@')}` : null;
    return (<div className={styles.metadata} data-package-description="">
        <div className={styles.previewColumn}>
            <BannerPreview
                previewId={`${idPrefix}-preview-${index}`}
                className={styles.preview}
                src={candidates[previewIndex || 0]}
                alt={t('preview', {name})}
                referrerPolicy="no-referrer"
                data-index={index}
                onError={onImageError}
            />
            {children}
        </div>
        <div className={styles.info}>
            <div className={styles.packageHeading}>
                <strong>{name}</strong>
                {metadata.version && <span className={styles.version}>{`v${metadata.version}`}</span>}
                <span className={styles.packageId}>({t('id', {id: metadata.id || entry.ids.join(', ')})})</span>
                {(repository || npmURL) && <span className={styles.packageLinks}>
                    {repository && <a className={styles.packageLink} href={`https://github.com/${repository}`}
                        aria-label={t('repositoryFor', {name})} title={t('repositoryFor', {name})}
                        target="_blank" rel="noopener noreferrer"><PackageIcon service="github" /></a>}
                    {npmURL && <a className={styles.packageLink} href={npmURL}
                        aria-label={t('npmFor', {name})} title={t('npmFor', {name})}
                        target="_blank" rel="noopener noreferrer"><PackageIcon service="npm" /></a>}
                </span>}
            </div>
            {linkCreator ? <div className={styles.secondary}>{t('creatorLabel')}{' '}
                {metadata.author && authorURL ? (
                    <a className={styles.sourceLink} href={authorURL}
                        target="_blank" rel="noopener noreferrer">{metadata.author}</a>
                ) : metadata.author || t('creatorUnknown')}
            </div> : metadata.author && <div className={styles.secondary}>{t('author', {author: metadata.author})}</div>}
            {metadata.updatedAt && <div className={styles.secondary}>{t('updated', {updated: metadata.updatedAt})}</div>}
            {description && <div>{description}</div>}
            {(showMissingMetadata || metadata.license) && <div className={styles.secondary}>
                {t('license', {license: metadata.license || t('licenseUnknown')})}</div>}
            {docsURL && <div className={styles.secondary}>
                <a className={styles.sourceLink} href={docsURL}
                    aria-label={t('documentationFor', {name})} title={t('documentationFor', {name})}
                    target="_blank" rel="noopener noreferrer">{docsURL}</a>
            </div>}
            {provenance}
            {!status && <div className={styles.secondary}>{t('pending')}</div>}
            {status === 'failed' && <div className={styles.error}>{t('failed')}</div>}
            <div className={styles.requirement} data-requirement={requirement} id={requirementId}>
                {requirement === 'required' && <span aria-hidden="true">⚠️</span>}
                {t('unsandboxedRequirement', {requirement: t(`requirement-${requirement}`)})}
            </div>
        </div>
    </div>);
};

export default PackageDescription;
