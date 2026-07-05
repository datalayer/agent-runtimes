# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Unit tests for agent-runtimes exec example file generators."""

from agent_runtimes.commands.exec import (
    _create_example_notebook_file,
    _create_example_python_file,
)


def test_create_example_python_file() -> None:
    path = _create_example_python_file()
    try:
        assert path.exists()
        assert path.suffix == ".py"
        content = path.read_text(encoding="utf-8")
        assert "Python example: building sample sales dataframe" in content
        assert "summary = (" in content
    finally:
        path.unlink(missing_ok=True)


def test_create_example_notebook_file() -> None:
    path = _create_example_notebook_file()
    try:
        assert path.exists()
        assert path.suffix == ".ipynb"
        content = path.read_text(encoding="utf-8")
        assert "Notebook example: pandas setup complete" in content
        assert "Revenue summary by region:" in content
        assert '"cells"' in content
    finally:
        path.unlink(missing_ok=True)