# @kubohiroya/turbowarp-extension-security-dialog

One screen that asks how a project's extensions may run, and the wiring that puts it in front of
a person before any extension code starts.

Licensed under [MPL-2.0](LICENSE). It carries no "Incompatible With Secondary Licenses" notice, so
it can be combined into a larger work distributed under GPL-3.0 — which is how the TurboWarp-Plus
Editor ships it.

## The problem it solves

A VM loads extensions one at a time and asks about each as it goes. Opening a project becomes a
queue of prompts, and the first extension starts before the person has seen the last one. Adding
an extension asks twice: once to pick it, once to allow it.

This package collects the whole project, puts one question, and only then loads anything.

## Entry points

| Import | What it is |
| --- | --- |
| `.` | Reading a catalog, reading an extension's own description, closing a selection over its dependencies, remembering what the opener chose, wording |
| `./react` | `ExtensionReview`, the screen |
| `./turbowarp` | `installBatchExtensionLoader`, which wraps a VM so the question comes first |
| `./styles.css`, `./webpack4.css` | The screen's styles; the second has class names wrapped in `:global()` for a CSS-modules build |

## The screen

```jsx
import {ExtensionReview} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import '@kubohiroya/turbowarp-extension-security-dialog/styles.css';

<ExtensionReview
    mode="open"            // or "add"
    entries={entries}
    locale="ja"
    DialogFrame={HostModal} // used only when opening
    loadInfo={loadExtensionInfo}
    onComplete={decisions => {/* a Map, or null when the person said no */}}
/>
```

Adding and opening differ in what is on the list and what can be chosen, not in how the question
is put, so they are the same component.

| | `add` | `open` |
| --- | --- | --- |
| What is listed | Catalog entries; dependencies are selected for you | Every extension the project uses |
| Picking | Tick to choose | None: the project already names them |
| How it runs | In the sandbox, or without it | Do not run, in the sandbox, or without it |
| Where it loads from | Keep a copy, fetch each time, or in the project | Keep a copy or fetch each time; embedded bytes have nowhere else to come from |
| All at once | Both choices | Both choices |

### What it will not do

**Nothing starts outside the sandbox unless the catalog vouches for it.** An extension that says
it needs to be outside does not thereby place itself outside: the claim is the extension's own,
shown as a claim, and the screen still starts it in the sandbox. Choosing the sandbox anyway is
allowed and warned about, never blocked.

**A trusted row is stated, not asked about.** An extension the catalog lists is treated like the
host's own gallery: it runs without the sandbox and offers no execution choice. A project with
nothing but trusted rows is not worth stopping, so `requiresReview` says to skip the screen.

**A remembered answer is honoured only where it is still one of the choices.** A project that
moved from a reference to embedded bytes, or a row that has since become trusted, does not carry
a stale answer into a screen that no longer offers it.

## Wiring a VM

```js
import {installBatchExtensionLoader} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';
import {createDecisionStorage} from '@kubohiroya/turbowarp-extension-security-dialog';

const uninstall = installBatchExtensionLoader(vm, review, defaultURLs, createDecisionStorage(), {
    collectEntries: async project => /* rows the host owns, e.g. from a Plus manifest */ [],
    applyDecisions: decisions => /* drive the Loader's trust and caching from the same answer */ {},
    identify: async project => /* how this host names a project */ null
});
```

It loads nothing but ordinary custom extensions itself. Rows a host collects belong to whatever
fetched and verified them — the Loader, in the TurboWarp-Plus Editor — so they arrive through
`collectEntries` and leave through `applyDecisions`. This package never needs the Loader's types
or its code, and the dependency points one way: it defines the port, hosts implement it.

Saying no resolves `onComplete` with `null`, and the load rejects with an error that
`isExtensionSecurityCancelled` recognises, so a host can tell a refusal from a fault.

## What is remembered, and where

| What | Where | Who decides |
| --- | --- | --- |
| Reference or embedded bytes | The project | Whoever added the extension |
| How it runs, when added | The project | Whoever added it |
| How it runs, when opened | This browser, per project | Whoever opens it |
| Keep a copy or fetch each time | This browser, per project | Whoever opens it |
| Preview pictures | This browser | Nobody; always kept |

Every read answers with something usable even when storage is unavailable — a private window, a
browser with site data blocked — so a screen built on this never fails to open.

## What it never claims

A name, an author, a version, a licence: all of these are the extension's own words, parsed out
of its leading comment, and the screen labels them as unverified. Nothing here evaluates an
extension. A preview picture is decoration and is checked against nothing; whatever verifies the
code does so elsewhere, and a row says so when it failed.

## Development

```sh
pnpm install
pnpm run check   # build, 36 tests, and a packing dry run
```

React and React DOM are peer dependencies, so the host supplies them. There are no runtime
dependencies.

## License

[MPL-2.0](LICENSE). See [NOTICE.md](./NOTICE.md) for what is and is not covered.
