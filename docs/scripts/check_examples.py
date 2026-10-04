# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Check that the documentation's examples name calls that exist.

A page cannot describe a call that no longer exists (LOOP G-10). For every
written page under ``docs/docs`` (the generated API references are left out),
this reads the code blocks and checks:

- each name imported from ``@datalayer/agent-runtimes`` or one of its
  ``lib/...`` modules is exported by that module in ``src/`` (following
  ``export ... from`` and ``export * from``);
- each name imported from ``agent_runtimes...`` in a Python block is defined,
  imported or a submodule of that module in ``agent_runtimes/``;
- each relative link to another page (``./x.mdx``, ``../chat/presence``)
  points at a page that exists.

Run from the repository's root: ``python docs/scripts/check_examples.py``.
It reads files only, imports nothing, and exits 1 when a page drifted,
naming each problem. Drift already known is listed in ``known_drift.txt``.
"""

from __future__ import annotations

import ast
import re
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "docs"
SRC = ROOT / "src"
PY = ROOT / "agent_runtimes"
GENERATED = ("typescript_api", "python_api")
KNOWN = Path(__file__).with_name("known_drift.txt")

FENCE = re.compile(r"^```(\w*)[^\n]*\n(.*?)^```", re.S | re.M)
TS_IMPORT = re.compile(
    r"import\s+(?:type\s+)?(?P<what>[\w$]+|\{[^}]*\}|[\w$]+\s*,\s*\{[^}]*\})\s+"
    r"from\s+['\"](?P<module>@datalayer/agent-runtimes(?:/lib/[\w/.-]+)?)['\"]",
    re.S,
)
PY_IMPORT = re.compile(
    r"^\s*from\s+(?P<module>agent_runtimes(?:\.\w+)*)\s+import\s+"
    r"(?P<names>\([^)]*\)|[^\n]+)",
    re.M,
)
LINK = re.compile(r"\]\((?P<target>\.{1,2}/[^)#\s]+)(?:#[^)\s]*)?\)")


def ts_file(module: str) -> Path | None:
    """The source file a package path is built from."""
    rel = module.removeprefix("@datalayer/agent-runtimes").removeprefix("/lib/")
    base = SRC / rel if rel else SRC / "index"
    for candidate in (
        base.with_suffix(".ts"),
        base.with_suffix(".tsx"),
        base / "index.ts",
        base / "index.tsx",
    ):
        if candidate.is_file():
            return candidate
    return None


def relative_ts(origin: Path, spec: str) -> Path | None:
    base = (origin.parent / spec).resolve()
    for candidate in (
        Path(f"{base}.ts"),
        Path(f"{base}.tsx"),
        base / "index.ts",
        base / "index.tsx",
        Path(str(base).removesuffix(".js") + ".ts"),
        Path(str(base).removesuffix(".js") + ".tsx"),
    ):
        if candidate.is_file():
            return candidate
    return None


DECL = re.compile(
    r"^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?"
    r"(?:const|let|var|function\*?|class|type|interface|enum)\s+([\w$]+)",
    re.M,
)
LIST = re.compile(
    r"^export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*['\"]([^'\"]+)['\"])?", re.M
)
STAR = re.compile(
    r"^export\s+\*\s+(?:as\s+([\w$]+)\s+)?from\s*['\"]([^'\"]+)['\"]", re.M
)


@lru_cache(maxsize=None)
def ts_exports(path: Path) -> frozenset[str]:
    text = path.read_text(encoding="utf8")
    names = set(DECL.findall(text))
    if re.search(r"^export\s+default\b", text, re.M):
        names.add("default")
    for body, _ in LIST.findall(text):
        for item in body.split(","):
            item = re.sub(r"^\s*type\s+", "", item.strip())
            if item:
                names.add(item.split(" as ")[-1].strip())
    for alias, spec in STAR.findall(text):
        if alias:
            names.add(alias)
            continue
        target = relative_ts(path, spec) if spec.startswith(".") else None
        if target is not None:
            names |= ts_exports(target) - {"default"}
    return frozenset(names)


def ts_names(what: str) -> list[str]:
    names: list[str] = []
    default, _, braces = what.partition("{") if "{" in what else (what, "", "")
    default = default.strip().rstrip(",").strip()
    if default:
        names.append("default")
    for item in braces.rstrip("}").split(","):
        item = re.sub(r"^\s*type\s+", "", item.strip())
        if item:
            names.append(item.split(" as ")[0].strip())
    return names


def py_module(module: str) -> Path | None:
    base = ROOT.joinpath(*module.split("."))
    for candidate in (base.with_suffix(".py"), base / "__init__.py"):
        if candidate.is_file():
            return candidate
    return None


@lru_cache(maxsize=None)
def py_names(path: Path) -> frozenset[str]:
    tree = ast.parse(path.read_text(encoding="utf8"))
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                names |= {n.id for n in ast.walk(target) if isinstance(n, ast.Name)}
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names |= {(a.asname or a.name).split(".")[0] for a in node.names}
        elif isinstance(node, (ast.If, ast.Try)):
            # Names defined under a guard (TYPE_CHECKING, an optional import).
            for sub in ast.walk(node):
                if isinstance(sub, (ast.Import, ast.ImportFrom)):
                    names |= {(a.asname or a.name).split(".")[0] for a in sub.names}
                elif isinstance(sub, (ast.FunctionDef, ast.ClassDef)):
                    names.add(sub.name)
    return frozenset(names)


def page_exists(origin: Path, target: str) -> bool:
    base = (origin.parent / target).resolve()
    if any(part in GENERATED for part in base.parts):
        return True  # Generated in CI before the build, and checked by it.
    candidates = [
        base,
        Path(f"{base}.md"),
        Path(f"{base}.mdx"),
        base / "index.md",
        base / "index.mdx",
    ]
    return any(c.is_file() for c in candidates)


def check(page: Path) -> list[str]:
    text = page.read_text(encoding="utf8")
    problems: list[str] = []
    for lang, code in FENCE.findall(text):
        if lang in ("ts", "tsx", "typescript", "js", "jsx", "javascript"):
            for match in TS_IMPORT.finditer(code):
                module = match["module"]
                source = ts_file(module)
                if source is None:
                    problems.append(f"{module}: no such module in src/")
                    continue
                exported = ts_exports(source)
                for name in ts_names(match["what"]):
                    if name not in exported:
                        problems.append(f"{module}: does not export {name}")
        elif lang in ("py", "python"):
            for match in PY_IMPORT.finditer(code):
                module = match["module"]
                source = py_module(module)
                if source is None:
                    problems.append(f"{module}: no such module")
                    continue
                names = re.sub(r"#[^\n]*", "", match["names"])
                for item in names.strip().strip("()").split(","):
                    name = item.split(" as ")[0].strip()
                    if not name or name == "*":
                        continue
                    if (
                        name not in py_names(source)
                        and py_module(f"{module}.{name}") is None
                    ):
                        problems.append(f"{module}: has no {name}")
    prose = FENCE.sub("", text)
    for match in LINK.finditer(prose):
        if not page_exists(page, match["target"]):
            problems.append(f"link to {match['target']}: no such page")
    return problems


def main() -> int:
    pages = [
        p
        for p in sorted(DOCS.rglob("*.md*"))
        if p.suffix in (".md", ".mdx") and not any(g in p.parts for g in GENERATED)
    ]
    known = {
        line.strip()
        for line in KNOWN.read_text(encoding="utf8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    found = {
        f"{page.relative_to(ROOT)}: {problem}"
        for page in pages
        for problem in check(page)
    }
    new = sorted(found - known)
    gone = sorted(known - found)
    for line in new:
        print(line)
    for line in gone:
        print(f"no longer drifts, remove it from {KNOWN.name}: {line}")
    print(
        f"{len(pages)} pages checked: {len(new)} new problem(s), "
        f"{len(found & known)} known in {KNOWN.name}."
    )
    return 1 if new or gone else 0


if __name__ == "__main__":
    sys.exit(main())
