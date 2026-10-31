# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Harbor's other sources: `dataset.toml`, Git, the registry.

Git against a real repository. The registry through a stand-in for `harbor
download`, since that needs Harbor's service. The dataset through the real
Harbor, in the real sandbox, when one is named.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from agent_runtimes.evals.adapters.base import (
    ExternalDefinition,
    LaunchGrant,
    Selection,
    SourceRef,
    blocking,
)
from agent_runtimes.evals.adapters.harbor import (
    HARBOR_VERSION,
    PYTHON_VARIABLE,
    HarborAdapter,
    _source_capabilities,
)
from agent_runtimes.evals.adapters.harbor_sources import (
    ORIGIN_FILE,
    SourceNotFetched,
    fetch_git,
    fetch_registry,
)
from agent_runtimes.evals.adapters.host import AdapterHost
from agent_runtimes.evals.adapters.sandbox import isolation_available
from agent_runtimes.evals.adapters.source import archive_digest, pack_source

FIXTURE = Path(__file__).parent / "fixtures" / "harbor"
PYTHON = os.environ.get(PYTHON_VARIABLE, "")
needs_harbor = pytest.mark.skipif(
    not (PYTHON and isolation_available()), reason="no Harbor, or no namespaces"
)


def _git(cwd: Path, *arguments: str) -> str:
    done = subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *arguments],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


@pytest.fixture
def repository(tmp_path):
    root = tmp_path / "repository"
    root.mkdir()
    _git(root, "init", "-q")
    _git(root, "config", "uploadpack.allowAnySHA1InWant", "true")
    shutil.copytree(FIXTURE / "tasks", root / "benchmarks" / "tasks")
    (root / "README.md").write_text("first\n")
    _git(root, "add", ".")
    _git(root, "commit", "-q", "-m", "first")
    first = _git(root, "rev-parse", "HEAD")
    (root / "README.md").write_text("second\n")
    _git(root, "commit", "-qam", "second")
    return root, first


class TestGit:
    def test_it_is_that_commit_and_says_so(self, repository, tmp_path):
        root, first = repository
        fetched = fetch_git(f"file://{root}", first, tmp_path / "into")
        assert (fetched / "README.md").read_text() == "first\n"
        assert not (fetched / ".git").exists()
        assert json.loads((fetched / ORIGIN_FILE).read_text()) == {
            "kind": "git",
            "url": f"file://{root}",
            "commit": first,
            "path": "",
        }

    def test_a_folder_of_it_is_what_is_packed(self, repository, tmp_path):
        root, first = repository
        fetched = fetch_git(
            f"file://{root}", first, tmp_path / "into", path="benchmarks"
        )
        assert (fetched / "tasks").is_dir() and (fetched / ORIGIN_FILE).exists()
        assert pack_source(fetched)

    @pytest.mark.parametrize("commit", ["main", "v1", "abc123"])
    def test_what_can_move_is_refused(self, commit, tmp_path):
        with pytest.raises(SourceNotFetched, match="can move"):
            fetch_git("https://example.com/r.git", commit, tmp_path / "into")

    @pytest.mark.parametrize(
        "url", ["ext::sh -c id", "/etc", "http://example.com/r.git"]
    )
    def test_only_a_real_transport_is_taken(self, url, tmp_path):
        with pytest.raises(SourceNotFetched, match="is not an https"):
            fetch_git(url, "a" * 40, tmp_path / "into")

    def test_a_folder_outside_it_is_refused(self, repository, tmp_path):
        root, first = repository
        with pytest.raises(SourceNotFetched, match="outside"):
            fetch_git(f"file://{root}", first, tmp_path / "into", path="../..")

    def test_a_commit_that_is_not_there_says_so(self, repository, tmp_path):
        root, _ = repository
        with pytest.raises(SourceNotFetched, match="Fetching"):
            fetch_git(f"file://{root}", "0" * 40, tmp_path / "into")


class TestTheRegistry:
    def _downloads(self, seen):
        def run(command, **_):
            seen.append(command)
            Path(command[command.index("--output-dir") + 1], "task").mkdir()
            return subprocess.CompletedProcess(command, 0, "", "")

        return run

    @pytest.mark.parametrize(
        "reference", ["harbor/hello@sha256:" + "a" * 64, "harbor/hello@3"]
    )
    def test_a_pinned_reference_is_fetched_and_said(self, reference, tmp_path):
        seen: list = []
        fetched = fetch_registry(
            reference, tmp_path / "into", run=self._downloads(seen)
        )
        assert seen[0][:3] == ["harbor", "download", reference]
        assert json.loads((fetched / ORIGIN_FILE).read_text()) == {
            "kind": "registry",
            "reference": reference,
        }

    @pytest.mark.parametrize(
        "reference", ["harbor/hello", "harbor/hello@latest", "hello@latest", "; rm"]
    )
    def test_what_can_move_is_refused(self, reference, tmp_path):
        with pytest.raises(SourceNotFetched, match="not pinned"):
            fetch_registry(reference, tmp_path / "into", run=self._downloads([]))

    def test_no_harbor_here_says_so(self, tmp_path):
        def missing(command, **_):
            raise FileNotFoundError(command[0])

        with pytest.raises(SourceNotFetched, match="needs `harbor`"):
            fetch_registry("harbor/hello@3", tmp_path / "into", run=missing)


DIGEST = "sha256:" + "a" * 64


class TestWhatASourceNames:
    def test_a_remote_job_says_how_to_fetch_it(self):
        [refused] = _source_capabilities({"remote": ["--git u --commit c"]})
        assert refused.code == "remote_source_not_fetched"
        assert "evals adapters inspect harbor --git u --commit c" in refused.reason

    def test_a_task_the_dataset_names_and_the_source_lacks(self):
        ref = {"name": "o/t", "digest": DIGEST, "path": "", "held_digest": ""}
        [refused] = _source_capabilities({"dataset": {"tasks": [ref]}})
        assert refused.code == "dataset_task_not_held"
        assert f"--registry o/t@{DIGEST}" in refused.reason

    def test_a_task_that_is_not_what_the_dataset_pinned(self):
        ref = {"name": "o/t", "digest": DIGEST, "path": "t", "held_digest": "sha256:b"}
        [refused] = _source_capabilities({"dataset": {"tasks": [ref]}})
        assert refused.code == "dataset_digest_differs"

    def test_it_stops_a_launch_not_only_a_preview(self):
        definition = ExternalDefinition(
            framework="harbor",
            adapter_version="1",
            framework_version=HARBOR_VERSION,
            source=SourceRef(kind="archive", reference="0" * 64),
            entry_point="tasks/t",
            configuration={
                "tasks": [{"name": "t", "path": "tasks/t", "instruction": "x"}],
                "agents": ["oracle"],
                "remote": ["--registry o/t@3"],
            },
            content_digest="0" * 64,
        )
        plan = HarborAdapter().plan(definition, grant=LaunchGrant())
        assert [i.code for i in blocking(plan.capabilities)] == [
            "remote_source_not_fetched"
        ]

    def test_a_reproduction_starts_from_where_it_came_from(self):
        definition = ExternalDefinition(
            framework="harbor",
            adapter_version="1",
            framework_version=HARBOR_VERSION,
            source=SourceRef(kind="archive", reference="0" * 64),
            entry_point="tasks/t",
            configuration={
                "tasks": [{"name": "t", "path": "tasks/t", "instruction": "x"}],
                "agents": ["oracle"],
                "origin": {"kind": "git", "url": "https://x/r.git", "commit": "c" * 40},
            },
            content_digest="0" * 64,
        )
        plan = HarborAdapter().plan(definition, grant=LaunchGrant())
        assert f"git -C source checkout {'c' * 40}" in plan.reproduction


def _packaged(root: Path, name: str) -> None:
    """Give a task of the fixture a package name, as a published one has."""
    path = root / "tasks" / name / "task.toml"
    text = path.read_text()
    path.write_text(
        text.replace(
            'version = "1.0"\n',
            f'version = "1.0"\n\n[task]\nname = "datalayer/{name}"\n',
            1,
        )
    )


def _hash(python: str, task: Path) -> str:
    code = (
        "import sys; from harbor.publisher.packager import Packager; "
        "print(Packager.compute_content_hash(__import__('pathlib').Path(sys.argv[1]))[0])"
    )
    done = subprocess.run(
        [python, "-c", code, str(task)], capture_output=True, text=True, check=True
    )
    return f"sha256:{done.stdout.strip()}"


@needs_harbor
class TestARealDataset:
    def _source(self, tmp_path, *, wrong=False, missing=False):
        root = tmp_path / "source"
        shutil.copytree(FIXTURE, root)
        _packaged(root, "greet")
        digest = (
            "sha256:" + "b" * 64 if wrong else _hash(PYTHON, root / "tasks" / "greet")
        )
        lines = [
            '[dataset]\nname = "datalayer/small"\nversion = "1.0"\n',
            f'[[tasks]]\nname = "datalayer/greet"\ndigest = "{digest}"\n',
        ]
        if missing:
            lines.append(
                f'[[tasks]]\nname = "datalayer/elsewhere"\ndigest = "{DIGEST}"\n'
            )
        (root / "dataset.toml").write_text("\n".join(lines))
        return root

    def _inspected(self, tmp_path, root):
        host = AdapterHost(tmp_path / "host")
        data = pack_source(root)
        digest = archive_digest(data)
        host.put_source(digest, data)
        return host.inspect("harbor", digest), digest

    def test_it_is_the_tasks_it_names_proved_by_their_digests(self, tmp_path):
        inspection, _ = self._inspected(tmp_path, self._source(tmp_path))
        assert inspection.name == "datalayer/small"
        assert inspection.entry_points == ["tasks/greet"]
        assert blocking(inspection.capabilities) == []

    def test_one_that_changed_is_refused(self, tmp_path):
        inspection, _ = self._inspected(tmp_path, self._source(tmp_path, wrong=True))
        assert [i.code for i in blocking(inspection.capabilities)] == [
            "dataset_digest_differs"
        ]

    def test_one_it_does_not_hold_is_refused(self, tmp_path):
        inspection, _ = self._inspected(tmp_path, self._source(tmp_path, missing=True))
        assert [i.code for i in blocking(inspection.capabilities)] == [
            "dataset_task_not_held"
        ]

    def test_a_job_naming_a_remote_task_is_refused_with_the_command(self, tmp_path):
        root = tmp_path / "source"
        shutil.copytree(FIXTURE, root)
        job = root / "job.yaml"
        job.write_text(
            job.read_text()
            + f"tasks:\n  - git_url: https://example.com/r.git\n    git_commit_id: {'c' * 40}\n    path: tasks/t\n"
        )
        inspection, _ = self._inspected(tmp_path, root)
        [refused] = blocking(inspection.capabilities)
        assert refused.code == "remote_source_not_fetched"

    def test_a_git_source_imports_and_keeps_its_origin(self, repository, tmp_path):
        root, first = repository
        fetched = fetch_git(
            f"file://{root}", first, tmp_path / "into", path="benchmarks"
        )
        shutil.copy(FIXTURE / "job.yaml", fetched)
        inspection, digest = self._inspected(tmp_path, fetched)
        imported = HarborAdapter().import_definition(
            inspection,
            selection=Selection(),
            source=SourceRef(kind="archive", reference=digest),
        )
        origin = imported.external_definition.configuration["origin"]
        assert origin["commit"] == first
        assert hashlib.sha256(pack_source(fetched)).hexdigest() == digest
