# Making a new release of datalayer

## Automated release (tags)

A pushed tag `vX.Y.Z` publishes `agent-runtimes` to PyPI and `@datalayer/agent-runtimes` to npm, through [`.github/workflows/release.yml`](.github/workflows/release.yml). No token is stored: both registries trust that workflow (trusted publishing, OIDC).

1. Bump the version to `X.Y.Z` in `package.json`. The Python version is the same number: `hatch-nodejs-version` reads it from `package.json` and writes `agent_runtimes/_version.py` (`__version__ = VERSION = 'X.Y.Z'`) at build time, so after a local build both say `X.Y.Z`. The file is generated and not committed.
2. Merge the bump to `main`.
3. Tag the merged commit on `main` and push the tag:

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

What the workflow does:

- **build**: checks that the tag matches `package.json`; installs with `npm install --workspaces --include-workspace-root`; builds with `npm run build`, which writes `lib/` for npm and the Vite app in `dist/` for the wheel; packs `@datalayer/agent-runtimes` with `npm pack`; builds the sdist and the wheel with `python -m build`. The hatch build hook copies `dist/` into `agent_runtimes/static/dist`, so the wheel serves the frontend. The build job then checks that the generated `_version.py` matches the tag and that the wheel contains `agent_runtimes/static/dist/index.html`, and uploads both packages as artifacts.
- **pypi**: publishes the sdist and the wheel with `pypa/gh-action-pypi-publish`, in the `pypi` environment, with `id-token: write`.
- **npm**: in the `npm` environment, with `id-token: write`, upgrades npm to the latest version (trusted publishing needs npm 11.5.1 or later), then runs `npm publish <tarball> --access public --provenance`.

The pypi and npm jobs run independently: if one fails, the other still publishes. Re-running the failed job publishes the same artifacts.

One-time setup, done once per registry:

- **PyPI**: on <https://pypi.org/manage/project/agent-runtimes/settings/publishing/>, add a GitHub trusted publisher with owner `datalayer`, repository `agent-runtimes`, workflow `release.yml` and environment `pypi`. The `pypi` environment already exists in the repository settings.
- **npm**: on the `@datalayer/agent-runtimes` package settings on npmjs.com, under *Trusted Publisher*, add GitHub Actions with organization `datalayer`, repository `agent-runtimes`, workflow `release.yml` and environment `npm`. The `npm` environment already exists in the repository settings.

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

To create a Python source package (`.tar.gz`) and the binary package (`.whl`) in the `dist/` directory, do:

```bash
python -m build
```

> `python setup.py sdist bdist_wheel` is deprecated and will not work for this package.

Then to upload the package to PyPI, do:

```bash
twine upload dist/*
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
