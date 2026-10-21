# Making a new release of datalayer

## Automated release (tags)

A pushed tag `vX.Y.Z` publishes `agent-runtimes` to PyPI and `@datalayer/agent-runtimes` to npm, through [`.github/workflows/release.yaml`](.github/workflows/release.yaml). No token is stored: both registries trust that workflow (trusted publishing, OIDC).

1. Bump the version to `X.Y.Z` in `package.json`. The Python version is the same number: `hatch-nodejs-version` reads it from `package.json` and writes `agent_runtimes/_version.py` (`__version__ = VERSION = 'X.Y.Z'`) at build time, so after a local build both say `X.Y.Z`. The file is generated and not committed.
2. Add the release's entry to `CHANGELOG.md`, commit both on the working branch (`feat/app-avatar` today), and push it.
3. Tag the pushed head of that branch and push the tag. Releases are cut from the branch, not from `main`; the tag must carry the `v` (`release.yaml` triggers on `v*` only, and a bare tag publishes nothing):

   ```bash
   git pull --rebase && git push
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

4. Check the published packages: `npm view @datalayer/agent-runtimes@X.Y.Z version` and `pip index versions agent-runtimes`. A service that pins the release (Slack's and Discord's `config.agentRuntimesVersion`) moves to it only once its tarball is on npm.

What the workflow does:

- **build**: checks that the tag matches `package.json`; installs with `npm install --workspaces --include-workspace-root`; builds with `npm run build`, which writes `lib/` for npm and the Vite app in `dist/` for the wheel; builds the `<datalayer-app>` embed with `npm run build:embed` into `dist-embed/` (the script `datalayer-app.js`, the module `datalayer-app-main.js`, its lazy `chunks/`, `assets/` and `datalayer-app.css`), which prints every file's size and fails when the initial load is over its gzip budget (`vite.embed.config.ts`), and which the npm package carries; runs the portable entries' tests (`src/__tests__/portable.unit.test.ts`, `src/portable/__tests__`, `src/portable/hosts/__tests__`); checks with `npm run check:pack` that every relative import of `lib/` names a file the tarball carries, written whole as Node's ESM loader needs it (`npm run build` writes them so, `scripts/fully-specify-lib.mjs`), and that no two of its paths differ only in case (one would overwrite the other on macOS and Windows); packs `@datalayer/agent-runtimes` with `npm pack` and checks the embed bundle, `lib/portable/hosts/index.js`, `lib/portable/hosts/contracts.json` and `lib/portable/semantic-events.json` are in the tarball; builds the sdist and the wheel side by side from the checkout with `python -m build --sdist --wheel`. The hatch build hook copies `dist/` into `agent_runtimes/static/dist` for the wheel, leaving out what no browser fetches (`NEVER_FETCHED` in `hatch_build.py`: onnxruntime-web's WASM, which the voice loads from the speech models' CDN, and the font formats listed after woff2), so the wheel serves the frontend; the sdist carries the Python package and what building it reads, no frontend, so a wheel is not built from it. PyPI holds the project to a total size, so the frontend goes up once per release. The build job then checks that the generated `_version.py` matches the tag, that the wheel contains the pages, that the sdist carries no `static/dist`, and the two sizes (sdist under 10 MB, wheel under 30 MB), and uploads both packages as artifacts.
- **pypi**: publishes the sdist and the wheel with `pypa/gh-action-pypi-publish`, in the `pypi` environment, with `id-token: write`.
- **npm**: in the `npm` environment, with `id-token: write`, upgrades npm to the latest version (trusted publishing needs npm 11.5.1 or later), then runs `npm publish <tarball> --access public --provenance`.

The pypi and npm jobs run independently: if one fails, the other still publishes. Re-running the failed job publishes the same artifacts.

One-time setup, done once per registry:

- **PyPI**: on <https://pypi.org/manage/project/agent-runtimes/settings/publishing/>, add a GitHub trusted publisher with owner `datalayer`, repository `agent-runtimes`, workflow `release.yaml` and environment `pypi`. The `pypi` environment already exists in the repository settings.
- **npm**: on the `@datalayer/agent-runtimes` package settings on npmjs.com, under *Trusted Publisher*, add GitHub Actions with organization `datalayer`, repository `agent-runtimes`, workflow `release.yaml` and environment `npm`. The `npm` environment already exists in the repository settings.

The manual instructions below still work, for example for a release cut from a machine.

The extension can be published to `PyPI` and `npm` manually or using the [Jupyter Releaser](https://github.com/jupyter-server/jupyter_releaser).

## Manual release

### Python package

This extension can be distributed as Python
packages. All of the Python
packaging instructions in the `pyproject.toml` file to wrap your extension in a
Python package. Before generating a package, we first need to install `build`.

```bash
pip install build twine hatch
```

Bump the version using `hatch`. By default this will create a tag.
See the docs on [hatch-nodejs-version](https://github.com/agoose77/hatch-nodejs-version#semver) for details.

```bash
hatch version <new-version>
```

To create a Python source package (`.tar.gz`) and the binary package (`.whl`), after `npm run build`, do:

```bash
python -m build --sdist --wheel --outdir dist-py
```

Both are built from the checkout: the sdist carries no frontend, and a wheel built from it is refused.

> `python setup.py sdist bdist_wheel` is deprecated and will not work for this package.

Then to upload the package to PyPI, do:

```bash
twine upload dist-py/*
```

## Automated releases with the Jupyter Releaser

The extension repository should already be compatible with the Jupyter Releaser.

Check out the [workflow documentation](https://github.com/jupyter-server/jupyter_releaser#typical-workflow) for more information.

Here is a summary of the steps to cut a new release:

- Fork the [`jupyter-releaser` repo](https://github.com/jupyter-server/jupyter_releaser)
- Add `ADMIN_GITHUB_TOKEN`, `PYPI_TOKEN` and `NPM_TOKEN` to the Github Secrets in the fork
- Go to the Actions panel
- Run the "Draft Changelog" workflow
- Merge the Changelog PR
- Run the "Draft Release" workflow
- Run the "Publish Release" workflow

## Publishing to `conda-forge`

If the package is not on conda forge yet, check the documentation to learn how to add it: https://conda-forge.org/docs/maintainer/adding_pkgs.html

Otherwise a bot should pick up the new version publish to PyPI, and open a new PR on the feedstock repository automatically.
