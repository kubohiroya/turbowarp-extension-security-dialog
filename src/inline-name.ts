import {parse} from 'acorn';
import type {Expression, FunctionExpression, PrivateIdentifier} from 'acorn';
import {simple} from 'acorn-walk';

const propertyName = (key: Expression | PrivateIdentifier) => key.type === 'Identifier' ? key.name :
    key.type === 'Literal' ? key.value : undefined;

/**
 * Read a single extension's literal getInfo name from source without calling it.
 * Keep the parse bounded for untrusted bundles and leave dynamic or ambiguous names to the ID.
 */
export function readInlineExtensionName(source: string, ids: readonly string[]): string | undefined {
    if (ids.length !== 1 || !source || source.length > 1024 * 1024 || !source.includes('getInfo')) return;
    const names = new Set<string | undefined>();
    const readMethod = (method: FunctionExpression) => {
        if (method.async || method.generator || method.body.type !== 'BlockStatement') return;
        const [statement] = method.body.body;
        if (method.body.body.length !== 1 || statement.type !== 'ReturnStatement' ||
            statement.argument?.type !== 'ObjectExpression') return;

        const fields = new Map<'id' | 'name', unknown>();
        for (const property of statement.argument.properties) {
            // A spread or computed property could override either field.
            if (property.type !== 'Property' || property.computed) return;
            const key = propertyName(property.key);
            if (key === 'id' || key === 'name') {
                fields.set(key, property.kind === 'init' && property.value.type === 'Literal' ?
                    property.value.value : undefined);
            }
        }
        if (fields.get('id') !== ids[0]) return;
        const name = fields.get('name');
        names.add(typeof name === 'string' && name.length <= 4096 ? name.trim() || undefined : undefined);
    };

    try {
        simple(parse(source, {ecmaVersion: 'latest'}), {
            MethodDefinition(node) {
                if (!node.static && !node.computed && node.kind === 'method' &&
                    propertyName(node.key) === 'getInfo' && node.value.type === 'FunctionExpression') {
                    readMethod(node.value);
                }
            },
            Property(node) {
                if (!node.computed && node.kind === 'init' &&
                    propertyName(node.key) === 'getInfo' && node.value.type === 'FunctionExpression') {
                    readMethod(node.value);
                }
            }
        });
    } catch {
        // Syntax the parser cannot read, or cannot walk, has no statically known name.
        return;
    }
    if (names.size === 1) return names.values().next().value;
}
