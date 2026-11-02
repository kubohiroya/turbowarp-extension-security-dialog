# Attribution

## This package

Everything in `src/` and `assets/` was written for this package and is covered by
[LICENSE](./LICENSE) (MPL-2.0). No file here carries the "Incompatible With Secondary Licenses"
notice, so this code can be combined into a larger work distributed under GPL-3.0 — which is how
the TurboWarp-Plus Editor ships it.

`assets/common.svg` is the fallback icon shown when an extension has no preview of its own. It is
original to this package: a jigsaw piece outline with a serif T, drawn for it and derived from no
other work. `scripts/build.mjs` embeds it into `dist` as a base64 data URI, so it travels in the
published package.

## Screenshots kept in this repository

`assets/screenshots/` holds captures of the public Editor taken before the rewrite. They are
**not published**: `files` in `package.json` does not include `assets`, so they stay in the
repository and never reach npm.

They are also **not covered by this package's licence**. The captured interface, icons and banners
keep their own rights holders and their own terms. Their origin, the Editor revisions they were
taken from and their hashes are recorded in the JSON files beside them.
