import React from 'react';
import {formatMessage} from './messages.js';
import styles from './style-names.js';

/** Group supplied categories without fetching or inferring metadata for project entries. */
const PackageSections = ({items, entries, locale, idPrefix, renderItem}) => {
    if (!entries.some(entry => entry.category)) return items.map(renderItem);
    const sections = new Map();
    for (const item of items) {
        const category = item.entry.category;
        const key = category ? category.id : null;
        if (!sections.has(key)) sections.set(key, {category, items: []});
        sections.get(key).items.push(item);
    }
    const order = category => category && Number.isFinite(category.order) ? category.order : Infinity;
    const ordered = [...sections.values()].sort((a, b) => order(a.category) - order(b.category));
    const japanese = String(locale).toLowerCase().startsWith('ja');
    return ordered.map(({category, items: sectionItems}, index) => (
        <section key={category ? category.id : ''} aria-labelledby={`${idPrefix}-category-${index}`}>
            <h2 className={styles.categoryHeading} id={`${idPrefix}-category-${index}`}>
                {category ? japanese && category.titleJa ? category.titleJa : category.title :
                    formatMessage(locale, 'otherCategory')}
            </h2>
            {sectionItems.map(renderItem)}
        </section>
    ));
};

export default PackageSections;
