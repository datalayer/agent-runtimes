# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Notebook and code file utilities for Datalayer Core."""

import typing as t
from pathlib import Path
from typing import Optional


def get_cells(filepath: Path) -> t.Iterator[tuple[Optional[str], str]]:
    """
    Extract cells from a Python file or Jupyter notebook.

    Parameters
    ----------
    filepath : Path
        Path to the file to extract cells from.

    Yields
    ------
    Iterator[tuple[Optional[str], str]]
        Iterator yielding (cell_id, cell_source) tuples.
        For Python files, cell_id will be None.
        For Jupyter notebooks, cell_id will be the cell's ID.
    """
    if filepath.suffix == ".ipynb":
        from nbformat import read

        nb = read(filepath, as_version=4)
        if not nb.cells:
            return
        for cell in nb.cells:
            if cell.cell_type == "code":
                # Some notebooks do not include a cell id; keep execution robust.
                cell_id = getattr(cell, "id", None)
                if cell_id is None and isinstance(cell, dict):
                    cell_id = cell.get("id")
                yield (str(cell_id) if cell_id is not None else None), cell.source
    else:
        yield None, filepath.read_text(encoding="utf-8")
