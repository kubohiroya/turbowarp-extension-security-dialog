const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolveExtensionSelection, formatMessage} = require('../dist/index.cjs');

const entries = [
    {id: 'base', dependencies: []},
    {id: 'middle', dependencies: ['base']},
    {id: 'app', dependencies: ['middle']},
    {id: 'other', dependencies: ['base']},
    {id: 'alone', dependencies: []}
];

test('choosing one row pulls in what it needs, in an order that loads', () => {
    const selection = resolveExtensionSelection(entries, ['app']);
    assert.deepEqual([...selection.selected].sort(), ['app', 'base', 'middle']);
    assert.deepEqual(selection.ordered.map(item => item.id), ['base', 'middle', 'app']);
    assert.deepEqual([...selection.explicit], ['app']);
    assert.deepEqual([...selection.required].sort(), ['base', 'middle']);
});

test('a row names every chosen row that required it, so a stuck tick is explainable', () => {
    const selection = resolveExtensionSelection(entries, ['app', 'other']);
    assert.deepEqual([...selection.requiredBy.get('base')].sort(), ['app', 'other']);
    assert.equal(selection.requiredBy.has('app'), false);
    assert.equal(selection.stateOf('app'), 'selected');
    assert.equal(selection.stateOf('base'), 'dependency');
    assert.equal(selection.stateOf('alone'), 'unselected');
});

test('what is already running is reported as such, and unknown ids are ignored', () => {
    const selection = resolveExtensionSelection(entries, ['app', 'ghost'], ['base', 'ghost']);
    assert.equal(selection.stateOf('base'), 'loaded');
    assert.equal(selection.selected.has('ghost'), false);
    assert.equal(selection.loaded.has('ghost'), false);
});

test('wording follows the reader and names the rows that required a dependency', () => {
    assert.equal(formatMessage('ja-JP', 'state-dependency', {names: 'app'}), '🔗 app が必要としています');
    assert.equal(formatMessage('en', 'state-dependency', {names: 'app'}), '🔗 Needed by app');
    // A gap shows as the key, which a reader can report, rather than as blank space.
    assert.equal(formatMessage('ja', 'nothingHere'), 'nothingHere');
});
