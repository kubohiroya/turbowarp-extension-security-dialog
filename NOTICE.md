# Attribution

## This package

The code in `src/` and the original icons in `assets/` are covered by
[LICENSE](./LICENSE) (MPL-2.0). No file here carries the "Incompatible With Secondary Licenses"
notice, so this code can be combined into a larger work distributed under GPL-3.0 — which is how
the TurboWarp-Plus Editor ships it.

`assets/common.svg` is the fallback icon shown when an extension has no preview of its own. It is
original to this package: a jigsaw piece outline with a serif T, drawn for it and derived from no
other work. `scripts/build.ts` embeds it into `dist` as a base64 data URI, so it travels in the
published package.

`assets/trusted.svg` is the mark beside an extension the host trusts: the TurboWarp Plus mark (the
hat block with a warp swirl and a plus sign, drawn by the same author for the TurboWarp-Plus Editor)
with a green check over it. It is embedded into `dist` the same way.

## JavaScript parsing

The review bundles Acorn and Acorn Walk to read extension names without executing the source.
Both are distributed under the MIT license below.

Acorn copyright (C) 2012-2022 by various contributors (see [AUTHORS](https://github.com/acornjs/acorn/blob/master/acorn/AUTHORS)).
Acorn Walk copyright (C) 2012-2020 by various contributors (see [AUTHORS](https://github.com/acornjs/acorn/blob/master/acorn-walk/AUTHORS)).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Build provenance

Published archives include `dist/build-info.json` with this package's name, version and full Git
revision. `sourceState: "commit"` identifies a build from committed inputs; `"working-tree"` marks
a local build with changes to those inputs. `"git-archive"` identifies npm preparing a fixed GitHub
archive without `.git`; the installer supplies its locked full SHA in `TWEXTSEC_SOURCE_REVISION`
and verifies that pin against the installed build info. A missing or malformed SHA fails the build.
This file records provenance, without changing the
licenses described here.

## Screenshots kept in this repository

`assets/screenshots/` holds historical captures and current captures of the public Editor. They are
**not published**: `files` in `package.json` does not include `assets`, so they stay in the
repository and never reach npm.

They are also **not covered by this package's licence**. The captured interface, icons and banners
keep their own rights holders and their own terms. Their origin, the Editor revisions they were
taken from and their hashes are recorded in the JSON files beside them.

`assets/screenshots/all-required-open-{en,ja}-20261103.png` show the public TurboWarp-Plus-Editor on
3 November 2026 with the sole required execution mode preselected, before OK and before any extension runs.
The source distributions are Camera Source 0.19.4, Asset Cache 0.3.2 and Bubble 0.13.5. The images are
unmodified browser captures; source integrity, Editor revisions, image hashes and checks are recorded in
`assets/screenshots/all-required-open-20261103.json`. The captured interface and extension graphics retain
their respective rights holders and applicable licenses.

`assets/screenshots/public-review-{add,open}-{en,ja}-20261106.png` show the public Editor on
6 November 2026 with security dialog 0.8.5. The add screenshots use the live TurboWarp Plus
catalog. The open screenshots use the published bundles listed above, embedded in an SB3.
See `assets/screenshots/public-review-20261106.json` for deployment revisions, source integrity,
image hashes and interaction checks.
