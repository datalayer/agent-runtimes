# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Display functions for Datalayer environments.

``display_environments`` renders the listing of ``datalayer envs ls``. The rest
serves the registry commands of PLAN_ENV.md E1-20: the three output formats,
the tables of an environment, its versions with their promotion records,
builds, validation reports and trial runtimes, a refusal with its section 10
code and what it names, and the comparison of two versions' locks.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Iterable, Mapping, Optional, Sequence

import typer
import yaml
from code_sandboxes.environments.errors import EnvironmentsError
from code_sandboxes.environments.spec import Environment
from pydantic import BaseModel
from rich.console import Console
from rich.table import Table
from rich.text import Text

from agent_runtimes.mixins.environments import EnvironmentsRequestError
from agent_runtimes.models.environment import (
    EnvironmentBuildLogChunk,
    EnvironmentBuildRecord,
    EnvironmentPromotionRecord,
    EnvironmentRecord,
    EnvironmentTrial,
    EnvironmentValidationReport,
    EnvironmentVersionRecord,
)


def _description_to_text(description: str) -> str:
    """Convert HTML/Markdown-like descriptions into readable plain text."""
    text = (description or "").strip()
    if not text:
        return "(no description)"

    normalized = text
    normalized = re.sub(r"<\s*/\s*p\s*>", "\n\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\s*p\s*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\s*b\s*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\s*/\s*b\s*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<[^>]+>", "", normalized)
    # Strip lightweight markdown markers that look noisy in CLI tables.
    normalized = re.sub(r"\*\*(.*?)\*\*", r"\1", normalized)
    normalized = re.sub(r"__(.*?)__", r"\1", normalized)
    normalized = re.sub(r"`([^`]*)`", r"\1", normalized)
    normalized = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", normalized)
    normalized = re.sub(r"^\s*#{1,6}\s*", "", normalized, flags=re.MULTILINE)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = normalized.strip() or "(no description)"
    return normalized


def _truncate(value: str, width: int) -> str:
    if width <= 0:
        return ""
    if len(value) <= width:
        return value
    if width == 1:
        return "…"
    return value[: width - 1] + "…"


def _wrap_lines(text: str, width: int) -> list[str]:
    """Wrap plain text into lines bounded by width, preserving explicit breaks."""
    if width <= 1:
        return [text[:width]] if text else [""]

    wrapped: list[str] = []
    for raw_line in text.splitlines() or [""]:
        line = raw_line.strip()
        if not line:
            wrapped.append("")
            continue

        remaining = line
        while len(remaining) > width:
            cut = remaining.rfind(" ", 0, width + 1)
            if cut <= 0:
                cut = width
            wrapped.append(remaining[:cut].rstrip())
            remaining = remaining[cut:].lstrip()
        wrapped.append(remaining)

    lines = wrapped
    if not lines:
        return [""]
    return lines


def _pad_cell(value: str, width: int, align_right: bool = False) -> str:
    text = _truncate(value, width)
    return text.rjust(width) if align_right else text.ljust(width)


def display_environments(environments: list[dict[str, Any]]) -> None:
    """Display environments with a full-width detail line per environment."""
    console = Console()

    headers = ("ID", "Credits/Second", "Name", "Language", "Resources")
    rows: list[tuple[str, str, str, str, str, str]] = []
    for env in environments:
        env_id = str(env.get("name") or "")
        cost = "{:.4g}".format(float(env.get("burning_rate") or 0.0))
        name = str(env.get("title") or "")
        language = str(env.get("language") or "")
        resources = json.dumps(env.get("resources") or {}, ensure_ascii=False)
        desc_text = _description_to_text(str(env.get("description") or ""))
        rows.append((env_id, cost, name, language, resources, desc_text))

    terminal_width = max(80, console.width)
    inner_target = terminal_width - 2

    # Preferred widths; later adjusted to fit exactly within terminal width.
    id_width = (
        max(len(headers[0]), *(len(r[0]) for r in rows)) if rows else len(headers[0])
    )
    cost_width = (
        max(len(headers[1]), *(len(r[1]) for r in rows)) if rows else len(headers[1])
    )
    name_width = (
        max(len(headers[2]), *(len(r[2]) for r in rows)) if rows else len(headers[2])
    )
    lang_width = (
        max(len(headers[3]), *(len(r[3]) for r in rows)) if rows else len(headers[3])
    )

    id_width = max(12, min(id_width, 28))
    cost_width = max(6, min(cost_width, 16))
    name_width = max(18, min(name_width, 32))
    lang_width = max(8, min(lang_width, 16))

    # Resources column gets remaining space.
    used_without_resources = (
        (id_width + 2)
        + (cost_width + 2)
        + (name_width + 2)
        + (lang_width + 2)
        + 4  # column separators between 5 columns
        + 2  # left/right padding of border interior
    )
    resources_width = max(20, inner_target - used_without_resources)

    # If terminal is very narrow, squeeze fixed columns further.
    if (
        resources_width == 20
        and used_without_resources + resources_width > inner_target
    ):
        overflow = (used_without_resources + resources_width) - inner_target
        # Reduce name first, then id, then lang within minimums.
        shrink_name = min(max(0, name_width - 12), overflow)
        name_width -= shrink_name
        overflow -= shrink_name
        if overflow > 0:
            shrink_id = min(max(0, id_width - 10), overflow)
            id_width -= shrink_id
            overflow -= shrink_id
        if overflow > 0:
            shrink_lang = min(max(0, lang_width - 6), overflow)
            lang_width -= shrink_lang

    # Recompute resources width with final fixed widths.
    used_without_resources = (
        (id_width + 2) + (cost_width + 2) + (name_width + 2) + (lang_width + 2) + 4 + 2
    )
    resources_width = max(12, inner_target - used_without_resources)

    c1 = id_width + 2
    c2 = cost_width + 2
    c3 = name_width + 2
    c4 = lang_width + 2
    c5 = resources_width + 2
    inner_total = c1 + c2 + c3 + c4 + c5 + 4

    console.print("Environments".center(inner_total + 2), style="bold")

    console.print(
        "┏"
        + "━" * c1
        + "┳"
        + "━" * c2
        + "┳"
        + "━" * c3
        + "┳"
        + "━" * c4
        + "┳"
        + "━" * c5
        + "┓"
    )
    console.print(
        "┃ "
        + _pad_cell(headers[0], id_width)
        + " ┃ "
        + _pad_cell(headers[1], cost_width, align_right=True)
        + " ┃ "
        + _pad_cell(headers[2], name_width)
        + " ┃ "
        + _pad_cell(headers[3], lang_width)
        + " ┃ "
        + _pad_cell(headers[4], resources_width)
        + " ┃"
    )
    console.print(
        "┡"
        + "━" * c1
        + "╇"
        + "━" * c2
        + "╇"
        + "━" * c3
        + "╇"
        + "━" * c4
        + "╇"
        + "━" * c5
        + "┩"
    )

    for index, (env_id, cost, name, language, resources, desc_text) in enumerate(rows):
        span_width = inner_total - 2
        for line in _wrap_lines(desc_text, span_width):
            console.print("│ " + _pad_cell(line, span_width))

        # Thin line between full-width detail line and the summary line.
        console.print("├" + "─" * inner_total + "┤")

        console.print(
            "│ "
            + _pad_cell(env_id, id_width)
            + " │ "
            + _pad_cell(cost, cost_width, align_right=True)
            + " │ "
            + _pad_cell(name, name_width)
            + " │ "
            + _pad_cell(language, lang_width)
            + " │ "
            + _pad_cell(resources, resources_width)
            + " │"
        )

        if index < len(rows) - 1:
            console.print("├" + "─" * inner_total + "┤")

    console.print("└" + "─" * inner_total + "┘")


# -- The registry commands (PLAN_ENV.md, E1-20) -----------------------------------


class OutputFormat(str, Enum):
    """How a command prints what it read."""

    TABLE = "table"
    JSON = "json"
    YAML = "yaml"


def as_data(value: Any) -> Any:
    """A record, or a list or mapping of records, as JSON data: camelCase, as the registry answers."""
    if isinstance(value, BaseModel):
        return value.model_dump(by_alias=True, mode="json")
    if isinstance(value, Mapping):
        return {str(key): as_data(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [as_data(item) for item in value]
    return value


def _dump_yaml(value: Any, **options: Any) -> str:
    return yaml.safe_dump(
        value, sort_keys=False, allow_unicode=True, **options
    ).rstrip()


def emit(value: Any, output: OutputFormat) -> bool:
    """
    Print JSON or YAML, when that is the format asked for.

    Parameters
    ----------
    value : Any
        Records, or data holding records.
    output : OutputFormat
        The format asked for.

    Returns
    -------
    bool
        Whether it was printed; False for a table, which the caller renders.
    """
    if output is OutputFormat.JSON:
        typer.echo(json.dumps(as_data(value), indent=2, ensure_ascii=False))
        return True
    if output is OutputFormat.YAML:
        typer.echo(_dump_yaml(as_data(value)))
        return True
    return False


def emit_record(value: Any, output: OutputFormat) -> None:
    """One record of a stream: a JSON line, or a YAML document."""
    if output is OutputFormat.YAML:
        typer.echo(_dump_yaml(as_data(value), explicit_start=True))
        return
    typer.echo(json.dumps(as_data(value), separators=(",", ":"), ensure_ascii=False))


def refusal_body(error: BaseException) -> dict[str, Any]:
    """
    What a refusal says: its code and message, and the status, field, detail and correlation id it has.

    Parameters
    ----------
    error : BaseException
        The service's refusal, a spec the canonical models refused, or what
        else stopped the command.

    Returns
    -------
    dict[str, Any]
        The refusal, without the fields it does not have.
    """
    if isinstance(error, EnvironmentsRequestError):
        body: dict[str, Any] = {
            "status": error.status,
            "code": error.code,
            "message": str(error),
            "field": error.field,
            "correlationId": error.correlation_id,
            # A 501's detail is its message.
            "detail": None if isinstance(error.detail, str) else error.detail,
        }
    elif isinstance(error, EnvironmentsError):
        body = {"code": error.code.code, "message": error.message}
        body["detail"] = error.detail
    else:
        body = {"message": str(error) or type(error).__name__}
    return {name: value for name, value in body.items() if value not in (None, "", {})}


def display_refusal(
    error: BaseException, output: OutputFormat = OutputFormat.TABLE
) -> None:
    """
    Print a refusal on stderr: its code and message, what it names, then its field and correlation id.

    What it names: each finding of a refused spec; each runtime still running
    an environment a deletion was refused for; a refused promotion's
    unavailable variants, and what was acknowledged instead (E1-15). In JSON
    or YAML, the refusal is printed under ``error`` in that format.

    Parameters
    ----------
    error : BaseException
        What refused the command.
    output : OutputFormat
        The format the command was asked for.
    """
    body = refusal_body(error)
    if output is OutputFormat.JSON:
        typer.echo(json.dumps({"error": body}, indent=2, ensure_ascii=False), err=True)
        return
    if output is OutputFormat.YAML:
        typer.echo(_dump_yaml({"error": body}), err=True)
        return
    code = body.get("code") or (f"HTTP {body['status']}" if "status" in body else "")
    message = str(body.get("message", ""))
    typer.secho(f"{code}: {message}" if code else message, err=True, fg="red")
    field_name = body.get("field")
    if field_name and not message.startswith(f"{field_name}:"):
        typer.echo(f"  field: {field_name}", err=True)
    detail = body.get("detail")
    detail = detail if isinstance(detail, Mapping) else {}
    findings = detail.get("findings")
    if isinstance(findings, list) and len(findings) > 1:
        for finding in findings:
            if isinstance(finding, Mapping):
                typer.echo(
                    f"  - {finding.get('field')}: {finding.get('message')}", err=True
                )
    runtimes = detail.get("runtimes")
    for runtime in runtimes if isinstance(runtimes, list) else []:
        if isinstance(runtime, Mapping):
            digest = str(runtime.get("digest") or "")
            typer.echo(
                f"  runtime {runtime.get('runtimeUid')} runs version {runtime.get('versionUid')}"
                + (f" ({_short_digest(digest)})" if digest else ""),
                err=True,
            )
    unavailable = detail.get("unavailableVariants")
    if isinstance(unavailable, list):
        typer.echo(f"  unavailable variants: {_names(unavailable)}", err=True)
        acknowledged = detail.get("acknowledgedUnavailableVariants")
        if isinstance(acknowledged, list):
            typer.echo(f"  acknowledged: {_names(acknowledged)}", err=True)
    if body.get("correlationId"):
        typer.echo(f"  correlation id: {body['correlationId']}", err=True)


def _print(renderable: Any) -> None:
    Console().print(renderable)


def _state(value: Any) -> str:
    return str(value.value if isinstance(value, Enum) else value)


def _short_digest(digest: str) -> str:
    algorithm, _, hexadecimal = digest.partition(":")
    return f"{algorithm}:{hexadecimal[:12]}" if hexadecimal else digest


def _names(values: Iterable[Any]) -> str:
    return ", ".join(str(value) for value in values) or "none"


def _fields_table(title: str, rows: Iterable[tuple[str, Any]]) -> Table:
    """A record as a table of its fields; a field with no value is left out."""
    table = Table(title=title, show_header=False)
    table.add_column("Field", style="bold", no_wrap=True)
    table.add_column("Value", overflow="fold")
    for name, value in rows:
        if value is None or value == "":
            continue
        table.add_row(name, Text(str(value)))
    return table


def _variants(version: EnvironmentVersionRecord) -> str:
    optional = [f"{name} (optional)" for name in version.optional_variants]
    return ", ".join([*version.required_variants, *optional])


def display_environment(environment: EnvironmentRecord) -> None:
    """Display an environment's fields."""
    _print(
        _fields_table(
            "Environment",
            [
                ("UID", environment.uid),
                ("Name", environment.name),
                ("Title", environment.title),
                ("Description", environment.description),
                ("Origin", environment.origin),
                ("Owner", f"{environment.owner_type} {environment.owner_uid}"),
                ("Visibility", environment.visibility),
                ("Promoted version", environment.promoted_version_uid or "none"),
                ("Created", environment.created_at),
                ("Updated", environment.updated_at),
                ("Archived", environment.archived_at),
            ],
        )
    )


def display_environment_version(
    version: EnvironmentVersionRecord, *, with_spec: bool = True
) -> None:
    """
    Display a version's fields, its promotion record when it has one, and its spec as YAML.

    Parameters
    ----------
    version : EnvironmentVersionRecord
        The version.
    with_spec : bool
        Whether the spec follows the fields.
    """
    _print(
        _fields_table(
            f"Version {version.version}",
            [
                ("UID", version.uid),
                ("Environment", version.environment_uid),
                ("Version", version.version),
                ("Label", version.label),
                ("Status", _state(version.status)),
                ("Variants", _variants(version)),
                ("Spec digest", version.spec_digest),
                ("Lock", version.lock_digest or "not resolved yet"),
                ("Failure", version.failure_code),
                ("Created", version.created_at),
                ("Promoted", version.promoted_at),
                ("Deprecated", version.deprecated_at),
            ],
        )
    )
    if version.promotion is not None:
        display_promotion(version.promotion)
    if with_spec:
        typer.echo(
            _dump_yaml(
                version.spec.model_dump(by_alias=True, mode="json", exclude_none=True)
            )
        )


def _policy_decision(decision: Optional[Mapping[str, Any]]) -> str:
    """A policy decision in words: its outcome, or that none was made."""
    if decision is None:
        return "none made"
    outcome = decision.get("outcome")
    return str(outcome) if outcome else json.dumps(decision, sort_keys=True)


def display_promotion(promotion: EnvironmentPromotionRecord) -> None:
    """Display a version's promotion record: who and when, the variants lacked and acknowledged, each policy decision."""
    _print(
        _fields_table(
            "Promotion",
            [
                ("Promoted", promotion.promoted_at),
                ("Promoted by", promotion.promoted_by),
                ("Unavailable variants", _names(promotion.unavailable_variants)),
                ("Acknowledged", _names(promotion.acknowledged_unavailable_variants)),
                (
                    "Policy decision",
                    "made" if promotion.policy_decision_made else "none made",
                ),
            ],
        )
    )
    if not promotion.policy_decisions:
        return
    table = Table(title="Policy decisions at promotion")
    for column in ("Variant", "Region", "Artifact", "Reference", "Decision"):
        table.add_column(
            column,
            no_wrap=column in ("Variant", "Region", "Artifact"),
            overflow="fold",
        )
    for item in promotion.policy_decisions:
        table.add_row(
            Text(item.variant),
            Text(item.region),
            Text(item.artifact_uid),
            Text(item.immutable_reference or "-"),
            Text(_policy_decision(item.policy_decision)),
        )
    _print(table)


def _promotion_summary(version: EnvironmentVersionRecord) -> str:
    """A version's promotion record in a cell: when, by whom, and what was acknowledged."""
    promotion = version.promotion
    if promotion is None:
        return "-"
    summary = f"{promotion.promoted_at} by {promotion.promoted_by}"
    if promotion.acknowledged_unavailable_variants:
        summary += f", acknowledging {_names(promotion.acknowledged_unavailable_variants)}"
    return summary


def display_environment_versions(
    versions: Sequence[EnvironmentVersionRecord],
    promoted_version_uid: Optional[str] = None,
) -> None:
    """Display versions, newest first, the promoted one marked, each with its last promotion."""
    table = Table(title="Versions")
    for column in (
        "Version",
        "UID",
        "Label",
        "Status",
        "Variants",
        "Lock",
        "Created",
        "Last promotion",
    ):
        table.add_column(column, no_wrap=column in ("Version", "UID"))
    for version in versions:
        number = str(version.version)
        if promoted_version_uid and version.uid == promoted_version_uid:
            number += " (promoted)"
        table.add_row(
            *(
                Text(cell)
                for cell in (
                    number,
                    version.uid,
                    version.label,
                    _state(version.status),
                    _variants(version),
                    _short_digest(version.lock_digest) or "-",
                    version.created_at or "",
                    _promotion_summary(version),
                )
            )
        )
    _print(table)


def validation_report_data(report: EnvironmentValidationReport) -> dict[str, Any]:
    """A validation report as data, each variant's ``supported`` written out as the service answers it."""
    data: dict[str, Any] = as_data(report)
    data["reports"] = [
        {**variant.model_dump(mode="json"), "supported": variant.supported}
        for variant in report.reports
    ]
    return data


def display_validation_report(report: EnvironmentValidationReport) -> None:
    """Display whether each variant can build the version, and why not."""
    verdict = "supported" if report.supported else "not supported"
    table = Table(title=f"Validation of {report.version_uid}: {verdict}")
    table.add_column("Variant", no_wrap=True)
    table.add_column("Supported", no_wrap=True)
    table.add_column("Findings", overflow="fold")
    for variant in report.reports:
        findings = "\n".join(
            f"{finding.code}: "
            + (f"{finding.field}: " if finding.field else "")
            + finding.message
            for finding in variant.findings
        )
        table.add_row(
            Text(variant.variant),
            "yes" if variant.supported else "no",
            Text(findings or "-"),
        )
    _print(table)


def display_environment_builds(
    builds: Sequence[EnvironmentBuildRecord], title: str = "Builds"
) -> None:
    """Display builds: one per variant and region."""
    table = Table(title=title)
    for column in (
        "Build",
        "Variant",
        "Region",
        "Attempt",
        "Status",
        "Cache hit",
        "Error",
    ):
        table.add_column(column, no_wrap=column != "Error")
    for build in builds:
        error = ": ".join(
            part for part in (build.error_code, build.error_detail) if part
        )
        table.add_row(
            *(
                Text(cell)
                for cell in (
                    build.uid,
                    build.variant,
                    build.region,
                    str(build.attempt),
                    build.status,
                    "yes" if build.cache_hit else "no",
                    error or "-",
                )
            )
        )
    _print(table)


def build_outcome(build: EnvironmentBuildRecord) -> str:
    """How a build ended, in words: its status, and its error when it has one."""
    where = f"Build {build.uid} ({build.variant}, {build.region})"
    if build.status not in ("succeeded", "failed", "cancelled"):
        return f"{where} is {build.status}, not ended"
    words = f"{where} ended {build.status}"
    error = " ".join(part for part in (build.error_code, build.error_detail) if part)
    return f"{words}: {error}" if error else words


def write_log_chunk(chunk: EnvironmentBuildLogChunk) -> None:
    """Write a chunk of a build's log as it was written."""
    typer.echo(chunk.text, nl=False)


def display_trial(trial: EnvironmentTrial) -> None:
    """Display the runtime a trial launched: its name, and the version and artifact it runs (E1-14)."""
    runtime = trial.runtime
    environment = runtime.environment
    artifact = environment.artifact
    version = environment.version_uid
    if environment.version is not None:
        version = f"{environment.version} ({environment.version_uid})"
    _print(
        _fields_table(
            "Trial",
            [
                ("Runtime", runtime.runtime_name),
                ("UID", runtime.uid),
                ("Given name", runtime.given_name),
                ("Environment", environment.uid or environment.name),
                ("Version", version),
                ("Variant", artifact and f"{artifact.variant} on {artifact.region}"),
                ("Artifact", artifact and artifact.uid),
                ("Reference", artifact and artifact.immutable_reference),
                ("Contract", environment.contract_version),
                ("Size class", artifact and artifact.size_class),
                ("Credits/second", runtime.burning_rate),
                ("Expires", runtime.expired_at),
            ],
        )
    )


def display_answer(title: str, value: Any) -> None:
    """Display an answer the models do not type yet, such as ``resolve``'s."""
    if isinstance(value, Mapping):
        _print(
            _fields_table(
                title,
                (
                    (
                        str(name),
                        json.dumps(item) if isinstance(item, (Mapping, list)) else item,
                    )
                    for name, item in value.items()
                ),
            )
        )
    elif value is not None:
        typer.echo(str(value))


# -- Comparing two versions' locks ---------------------------------------------------

#: The kinds of change a lock comparison lists, in the order they are shown.
LOCK_DIFF_KINDS: tuple[str, ...] = (
    "added",
    "removed",
    "upgraded",
    "downgraded",
    "changed",
)

_HASH_OPTION = re.compile(r"\s--hash[=\s]\S+")
_COMMENT = re.compile(r"(?:^|\s)#")


@dataclass(frozen=True)
class PackageChange:
    """A top-level package, with the version each lock pins; None where it is absent or not pinned."""

    name: str
    before: Optional[str] = None
    after: Optional[str] = None


@dataclass(frozen=True)
class LockDiff:
    """How the top-level packages changed from one version's lock to another's."""

    added: list[PackageChange] = field(default_factory=list)
    removed: list[PackageChange] = field(default_factory=list)
    upgraded: list[PackageChange] = field(default_factory=list)
    downgraded: list[PackageChange] = field(default_factory=list)
    #: In both, pinned to versions that cannot be ordered.
    changed: list[PackageChange] = field(default_factory=list)

    @property
    def empty(self) -> bool:
        """Whether no top-level package changed."""
        return not any(getattr(self, kind) for kind in LOCK_DIFF_KINDS)

    def to_data(self) -> dict[str, list[dict[str, Optional[str]]]]:
        """The changes as JSON data, by kind."""
        return {
            kind: [asdict(change) for change in getattr(self, kind)]
            for kind in LOCK_DIFF_KINDS
        }


def locked_versions(lock_text: str) -> dict[str, str]:
    """
    The version a lock pins for each package, by normalized name.

    A lock is what ``uv pip compile --generate-hashes`` writes (section 5): a
    ``name==version`` requirement per package, its hashes on continuation
    lines, and ``# via`` comments. An option, or a line that pins no single
    version, is left out.

    Parameters
    ----------
    lock_text : str
        The lock.

    Returns
    -------
    dict[str, str]
        Each package's pinned version.
    """
    from packaging.requirements import InvalidRequirement, Requirement
    from packaging.utils import canonicalize_name

    lines: list[str] = []
    pending = ""
    for raw in lock_text.splitlines():
        line = raw.rstrip()
        if line.endswith("\\"):
            pending += line[:-1] + " "
            continue
        lines.append(pending + line)
        pending = ""
    if pending:
        lines.append(pending)

    versions: dict[str, str] = {}
    for line in lines:
        text = _COMMENT.split(line, maxsplit=1)[0]
        text = _HASH_OPTION.sub(" ", " " + text).strip()
        if not text or text.startswith("-"):
            continue
        try:
            requirement = Requirement(text)
        except InvalidRequirement:
            continue
        specifiers = list(requirement.specifier)
        if (
            len(specifiers) == 1
            and specifiers[0].operator in ("==", "===")
            and not specifiers[0].version.endswith(".*")
        ):
            versions[canonicalize_name(requirement.name)] = specifiers[0].version
    return versions


def top_level_packages(
    environment: Environment, lock_text: Optional[str] = None
) -> dict[str, Optional[str]]:
    """
    The spec's top-level Python packages, by normalized name, each with the version the lock pins.

    Parameters
    ----------
    environment : Environment
        The version's spec: its ``packages.python.dependencies`` are the top-level packages.
    lock_text : Optional[str]
        The version's lock; without it, no version is known.

    Returns
    -------
    dict[str, Optional[str]]
        Each top-level package, with its locked version or None.
    """
    from packaging.requirements import InvalidRequirement, Requirement
    from packaging.utils import canonicalize_name

    locked = locked_versions(lock_text) if lock_text else {}
    packages: dict[str, Optional[str]] = {}
    for dependency in environment.spec.packages.python.dependencies:
        try:
            name = canonicalize_name(Requirement(dependency).name)
        except InvalidRequirement:
            continue
        packages[name] = locked.get(name)
    return packages


def diff_packages(
    before: Mapping[str, Optional[str]], after: Mapping[str, Optional[str]]
) -> LockDiff:
    """
    Compare two sets of top-level packages: added, removed, upgraded, downgraded.

    Parameters
    ----------
    before : Mapping[str, Optional[str]]
        The packages compared from, with their locked versions.
    after : Mapping[str, Optional[str]]
        The packages compared to.

    Returns
    -------
    LockDiff
        The changes, each list by package name.
    """
    from packaging.version import InvalidVersion, Version

    diff = LockDiff()
    for name in sorted(set(before) | set(after)):
        old, new = before.get(name), after.get(name)
        change = PackageChange(name, old, new)
        if name not in before:
            diff.added.append(change)
        elif name not in after:
            diff.removed.append(change)
        elif old != new:
            try:
                older, newer = Version(old or ""), Version(new or "")
            except InvalidVersion:
                diff.changed.append(change)
                continue
            if newer > older:
                diff.upgraded.append(change)
            elif newer < older:
                diff.downgraded.append(change)
    return diff


def version_lock_text(version: EnvironmentVersionRecord) -> Optional[str]:
    """
    The text of a version's lock, when its answer carries it.

    E1-01's version answer names its lock by ``lockDigest`` only. The lock is a
    document of its own, ``{digest, format, content}`` (D-3), which no route
    serves before E1-04. It is read from the answer's ``lock``, as that
    document or as the text itself.

    Parameters
    ----------
    version : EnvironmentVersionRecord
        The version, as read.

    Returns
    -------
    Optional[str]
        The lock's text, or None.
    """
    lock = (version.model_extra or {}).get("lock")
    if isinstance(lock, str):
        return lock
    if isinstance(lock, Mapping) and isinstance(lock.get("content"), str):
        return str(lock["content"])
    return None


def compare_version_locks(
    before: EnvironmentVersionRecord, after: EnvironmentVersionRecord
) -> tuple[Optional[LockDiff], list[str]]:
    """
    Compare the top-level packages of two versions' locks.

    Parameters
    ----------
    before : EnvironmentVersionRecord
        The version compared from.
    after : EnvironmentVersionRecord
        The version compared to.

    Returns
    -------
    tuple[Optional[LockDiff], list[str]]
        The changes, or None when they cannot be known, and why not.
    """
    sides = (before, after)
    unresolved = [
        f"Version {version.version} ({version.uid}) has no lock yet."
        for version in sides
        if not version.lock_digest
    ]
    if unresolved:
        return None, unresolved
    texts = [version_lock_text(version) for version in sides]
    if before.lock_digest == after.lock_digest:
        # One lock: no package moved, and only the spec can add or remove one.
        texts = [texts[0] or texts[1]] * 2
    else:
        unserved = [
            f"Version {version.version} ({version.uid}) has the lock "
            f"{version.lock_digest}, whose content the service does not answer yet."
            for version, text in zip(sides, texts)
            if text is None
        ]
        if unserved:
            return None, unserved
    return (
        diff_packages(
            top_level_packages(before.spec, texts[0]),
            top_level_packages(after.spec, texts[1]),
        ),
        [],
    )


def version_lock_summary(version: EnvironmentVersionRecord) -> dict[str, Any]:
    """Which version a lock comparison names, and its lock's digest."""
    return {
        "uid": version.uid,
        "environmentUid": version.environment_uid,
        "version": version.version,
        "lockDigest": version.lock_digest,
    }


def display_lock_diff(
    before: EnvironmentVersionRecord,
    after: EnvironmentVersionRecord,
    diff: Optional[LockDiff],
    notes: Sequence[str],
) -> None:
    """Display how the top-level packages changed from one version to another, or why that is not known."""
    for note in notes:
        typer.echo(note)
    if diff is None:
        return
    if diff.empty:
        typer.echo(
            "No top-level package was added, removed, upgraded or downgraded "
            f"from version {before.version} to version {after.version}."
        )
        return
    table = Table(
        title=f"Top-level packages, version {before.version} → version {after.version}"
    )
    for column in ("Change", "Package", "From", "To"):
        table.add_column(column, no_wrap=True)
    for kind in LOCK_DIFF_KINDS:
        for change in getattr(diff, kind):
            table.add_row(
                kind,
                Text(change.name),
                Text(change.before or "-"),
                Text(change.after or "-"),
            )
    _print(table)
