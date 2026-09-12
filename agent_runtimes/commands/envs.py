# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Environment commands for Datalayer CLI.

``datalayer envs ls`` lists the environments a caller may launch. The other
commands drive the registry of user environments (PLAN_ENV.md, section 9,
E1-20): create one from a spec file, read it and its versions, edit, validate,
resolve, compare two versions' locks, build and follow the log, try, promote,
roll back, deprecate, archive and delete. Every command takes ``--output
table|json|yaml``.

An environment is named by its uid or by ``<account>/<name>`` (D-2); a version
by its uid or by ``<environment>@<number>``. A conditional write sends as
``If-Match`` the ETag of the record the command has just read, so nobody types
one. A refusal prints its section 10 code and message on stderr, and the
command exits 1.
"""

from functools import wraps
from pathlib import Path
from typing import Annotated, Any, Callable, Iterator, List, Optional, TypeVar

import click
import typer
from code_sandboxes.environments.lifecycle import VersionState, can_promote
from code_sandboxes.environments.spec import (
    Environment,
    parse_environment,
    spec_digest,
)
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console

from agent_runtimes.client import AgentClient
from agent_runtimes.displays.environments import (
    OutputFormat,
    build_outcome,
    compare_version_locks,
    display_answer,
    display_environment,
    display_environment_builds,
    display_environment_version,
    display_environment_versions,
    display_environments,
    display_lock_diff,
    display_refusal,
    display_trial,
    display_validation_report,
    emit,
    emit_record,
    validation_report_data,
    version_lock_summary,
    write_log_chunk,
)
from agent_runtimes.models.environment import (
    EnvironmentBuildRecord,
    EnvironmentVersionRecord,
)

# Create a Typer app for environment commands
app = typer.Typer(
    name="envs", help="Environment management commands", invoke_without_command=True
)

console = Console()

#: The status of a build that succeeded; ``failed`` and ``cancelled`` end one too.
BUILD_SUCCEEDED = "succeeded"

ApiKeyOption = Annotated[
    Optional[str],
    typer.Option("--api-key", help="API key (Bearer token for API requests)."),
]
IamUrlOption = Annotated[
    Optional[str], typer.Option("--iam-url", help="Datalayer IAM server URL")
]
RuntimesUrlOption = Annotated[
    Optional[str], typer.Option("--runtimes-url", help="Datalayer Runtimes server URL")
]
OutputOption = Annotated[
    OutputFormat,
    typer.Option("--output", "-o", case_sensitive=False, help="Output format."),
]
EnvironmentArgument = Annotated[
    str,
    typer.Argument(help="The environment: its uid, or <account>/<name>."),
]
VersionArgument = Annotated[
    str,
    typer.Argument(help="The version: its uid, or <environment>@<number>."),
]
AcknowledgeOption = Annotated[
    Optional[List[str]],
    typer.Option(
        "--acknowledge",
        help="An unavailable variant of a partially ready version, acknowledged; "
        "repeat for each.",
    ),
]

_Command = TypeVar("_Command", bound=Callable[..., Any])


class EnvironmentsCommandError(RuntimeError):
    """What a command refuses itself: a reference that names nothing, nothing to roll back to."""


def _make_client(
    token: Optional[str] = None,
    iam_url: Optional[str] = None,
    runtimes_url: Optional[str] = None,
) -> AgentClient:
    """Create a AgentClient with optional runtimes URL override."""
    urls = DatalayerURLs.from_environment(iam_url=iam_url, runtimes_url=runtimes_url)
    return AgentClient(urls=urls, api_key=token)


def _refusals(function: _Command) -> _Command:
    """Print what refused a command, with its section 10 code when it has one, and exit 1."""

    @wraps(function)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        try:
            return function(*args, **kwargs)
        except (click.exceptions.Exit, click.exceptions.Abort, click.ClickException):
            raise
        except Exception as error:  # noqa: BLE001
            display_refusal(error, kwargs.get("output", OutputFormat.TABLE))
            raise typer.Exit(1) from None

    return wrapped  # type: ignore[return-value]


def _environment_uid(client: AgentClient, reference: str) -> str:
    """The uid of the environment a reference names: its uid, or ``<account>/<name>`` (D-2)."""
    reference = reference.strip()
    if not reference:
        raise EnvironmentsCommandError(
            "An environment is named by its uid or by <account>/<name>"
        )
    if "/" not in reference:
        return reference
    name = reference.split("/", 1)[1]
    for entry in client.list_environments(origin="user", q=name):
        if entry.name == reference and entry.uid:
            return entry.uid
    raise EnvironmentsCommandError(f"No user environment {reference} that you may use")


def _versions(
    client: AgentClient, environment_uid: str
) -> Iterator[EnvironmentVersionRecord]:
    """Every version of an environment, newest first, page after page."""
    cursor: Optional[str] = None
    cursors_read: set[str] = set()
    while True:
        page = client.list_environment_versions(environment_uid, cursor=cursor)
        yield from page.items
        cursor = page.next_cursor
        if not cursor or cursor in cursors_read:
            return
        cursors_read.add(cursor)


def _version(client: AgentClient, reference: str) -> EnvironmentVersionRecord:
    """The version a reference names, as just read: its uid, or ``<environment>@<number>``."""
    environment, separator, number = reference.strip().rpartition("@")
    if not separator:
        return client.get_environment_version(reference.strip())
    if not environment or not number.isdigit():
        raise EnvironmentsCommandError(
            f"A version is named by its uid or by <environment>@<number>, not {reference}"
        )
    for version in _versions(client, _environment_uid(client, environment)):
        if version.version == int(number):
            return version
    raise EnvironmentsCommandError(f"{environment} has no version {number}")


def _version_uid(client: AgentClient, reference: str) -> str:
    """A version's uid; the version is read only when it is named by number."""
    if "@" in reference:
        return _version(client, reference).uid
    return reference.strip()


def _read_spec(path: Path) -> Environment:
    """The spec a file holds, YAML or JSON, parsed by the canonical models."""
    return parse_environment(path.read_text(encoding="utf-8"))


def _environment_key(name: str, organization: Optional[str]) -> str:
    """Asking again for the same owner's environment of that name answers the first (E1-01)."""
    return f"envs-create:{organization or 'self'}:{name}"


def _version_key(environment_uid: str, spec: Environment, label: Optional[str]) -> str:
    """Asking again for a version of the same spec and label answers the first (E1-01)."""
    return f"envs-version:{environment_uid}:{spec_digest(spec)}:{label or ''}"


def _follow(
    client: AgentClient, build_uids: List[str], output: OutputFormat
) -> List[EnvironmentBuildRecord]:
    """Stream each build's log until it ends, then read how each ended."""
    ended: List[EnvironmentBuildRecord] = []
    for build_uid in build_uids:
        if output is OutputFormat.TABLE and len(build_uids) > 1:
            typer.echo(f"==> build {build_uid}")
        last_text = ""
        for chunk in client.follow_environment_build_logs(build_uid):
            if output is OutputFormat.TABLE:
                write_log_chunk(chunk)
                last_text = chunk.text or last_text
            else:
                emit_record({"buildUid": build_uid, "chunk": chunk}, output)
        if last_text and not last_text.endswith("\n"):
            typer.echo()
        build = client.get_environment_build(build_uid)
        if output is not OutputFormat.TABLE:
            emit_record({"build": build}, output)
        ended.append(build)
    if output is OutputFormat.TABLE:
        display_environment_builds(ended, title="Outcome")
    return ended


def _exit_with_outcome(builds: List[EnvironmentBuildRecord]) -> None:
    """Exit 0 when every build succeeded; else name each that did not, and exit 1."""
    unsuccessful = [build for build in builds if build.status != BUILD_SUCCEEDED]
    for build in unsuccessful:
        typer.secho(build_outcome(build), err=True, fg="red")
    if unsuccessful:
        raise typer.Exit(1)


@app.callback()
def envs_callback(ctx: typer.Context) -> None:
    """Environment management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
@_refusals
def list_environments(
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """List available environments."""
    client = _make_client(
        token=token,
        iam_url=iam_url,
        runtimes_url=runtimes_url,
    )
    environments = client.list_environments()
    if emit([env.model_dump(mode="json") for env in environments], output):
        return

    # Convert to dict format for display_environments
    env_dicts: list[dict[str, Any]] = []
    for env in environments:
        env_dict: dict[str, Any] = {
            "name": env.name,
            "title": env.title,
            "burning_rate": env.burning_rate,
            "language": env.language,
            "owner": env.owner,
            "visibility": env.visibility,
        }
        for key, value in (env.metadata or {}).items():
            if key not in env_dict:
                env_dict[key] = value
        env_dicts.append(env_dict)

    display_environments(env_dicts)

    if len(env_dicts) > 0:
        console.print("\n[dim]Create an Agent with e.g.[/dim]")
        for env_dict in env_dicts:
            console.print(
                f"[dim]datalayer agents create --given-name my-agent {env_dict['name']}[/dim]"
            )
        console.print()


@app.command(name="create")
@_refusals
def create_environment(
    file: Annotated[
        Path,
        typer.Option(
            "--file",
            "-f",
            exists=True,
            dir_okay=False,
            readable=True,
            help="The Environment spec, YAML or JSON.",
        ),
    ],
    organization: Annotated[
        Optional[str],
        typer.Option(
            "--organization",
            help="The uid of an organization you own, to create the environment for it.",
        ),
    ] = None,
    visibility: Annotated[
        Optional[str],
        typer.Option("--visibility", help="private, the default, or organization."),
    ] = None,
    description: Annotated[
        Optional[str], typer.Option("--description", help="The description.")
    ] = None,
    label: Annotated[
        Optional[str], typer.Option("--label", help="The first version's label.")
    ] = None,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """
    Create an environment and its first draft version from a spec file.

    The environment is named by the spec's metadata. The same file asked for
    again answers the environment and the version it first created, and a
    changed spec becomes a new draft of that environment.
    """
    spec = _read_spec(file)
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    environment = client.create_environment(
        spec.metadata.name,
        title=spec.metadata.title,
        description=description,
        visibility=visibility,
        owner_type="organization" if organization else None,
        owner_uid=organization,
        idempotency_key=_environment_key(spec.metadata.name, organization),
    )
    version = client.create_environment_version(
        environment.uid,
        spec,
        label=label,
        idempotency_key=_version_key(environment.uid, spec, label),
    )
    if emit({"environment": environment, "version": version}, output):
        return
    display_environment(environment)
    display_environment_version(version, with_spec=False)
    typer.echo(f"Next: datalayer envs validate {version.uid}")


@app.command(name="show")
@_refusals
def show(
    reference: Annotated[
        str,
        typer.Argument(
            help="An environment, by uid or <account>/<name>; "
            "or a version, by <environment>@<number>."
        ),
    ],
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Show an environment, or one of its versions with its spec."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    if "@" in reference:
        version = _version(client, reference)
        if not emit(version, output):
            display_environment_version(version)
        return
    environment = client.get_environment(_environment_uid(client, reference))
    if not emit(environment, output):
        display_environment(environment)


@app.command(name="versions")
@_refusals
def versions(
    environment: EnvironmentArgument,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """List an environment's versions, newest first."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    record = client.get_environment(_environment_uid(client, environment))
    items = list(_versions(client, record.uid))
    if not emit(items, output):
        display_environment_versions(items, record.promoted_version_uid)


@app.command(name="edit")
@_refusals
def edit(
    reference: Annotated[
        str,
        typer.Argument(
            help="A version, edited with --file or --label; "
            "or an environment, edited with --title, --description or --visibility."
        ),
    ],
    file: Annotated[
        Optional[Path],
        typer.Option(
            "--file",
            "-f",
            exists=True,
            dir_okay=False,
            readable=True,
            help="The version's new spec, YAML or JSON.",
        ),
    ] = None,
    label: Annotated[
        Optional[str], typer.Option("--label", help="The version's new label.")
    ] = None,
    title: Annotated[
        Optional[str], typer.Option("--title", help="The environment's new title.")
    ] = None,
    description: Annotated[
        Optional[str],
        typer.Option("--description", help="The environment's new description."),
    ] = None,
    visibility: Annotated[
        Optional[str],
        typer.Option("--visibility", help="The environment's new visibility."),
    ] = None,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """
    Edit a draft version, or an environment's title, description or visibility.

    A version that has left draft never changes (section 2.1): a new spec for
    it opens a new draft version of its environment instead.
    """
    version_edit = file is not None or label is not None
    environment_edit = any(
        value is not None for value in (title, description, visibility)
    )
    if version_edit == environment_edit:
        raise click.UsageError(
            "Edit a version with --file or --label, or an environment with "
            "--title, --description or --visibility; not both, and not neither."
        )
    spec = _read_spec(file) if file is not None else None
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)

    if environment_edit:
        environment = client.get_environment(_environment_uid(client, reference))
        changed = client.update_environment(
            environment.uid,
            if_match=environment.etag,
            title=title,
            description=description,
            visibility=visibility,
        )
        if not emit(changed, output):
            display_environment(changed)
        return

    version = _version(client, reference)
    if spec is not None and version.status != VersionState.DRAFT:
        draft = client.create_environment_version(
            version.environment_uid,
            spec,
            label=label,
            idempotency_key=_version_key(version.environment_uid, spec, label),
        )
        if not emit(draft, output):
            typer.echo(
                f"Version {version.version} is {version.status.value}, which cannot "
                f"change: the edit is draft version {draft.version}."
            )
            display_environment_version(draft, with_spec=False)
        return
    updated = client.update_environment_version(
        version.uid, if_match=version.etag, spec=spec, label=label
    )
    if not emit(updated, output):
        display_environment_version(updated, with_spec=False)


@app.command(name="validate")
@_refusals
def validate(
    version: VersionArgument,
    variant: Annotated[
        Optional[List[str]],
        typer.Option(
            "--variant",
            help="A variant to report on; repeat for more. The version's own by default.",
        ),
    ] = None,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Validate a version: a dry run of whether each variant can build it. Exits 1 when one cannot."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    report = client.validate_environment_version(
        _version_uid(client, version), variants=variant or None
    )
    if not emit(validation_report_data(report), output):
        display_validation_report(report)
    if not report.supported:
        raise typer.Exit(1)


@app.command(name="resolve")
@_refusals
def resolve(
    version: VersionArgument,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Resolve a version into its lock."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    answer = client.resolve_environment_version(_version_uid(client, version))
    if not emit(answer, output):
        display_answer("Resolve", answer)


@app.command(name="diff")
@_refusals
def diff(
    before: Annotated[
        str,
        typer.Argument(
            help="The version compared from: its uid, or <environment>@<number>."
        ),
    ],
    after: Annotated[
        str,
        typer.Argument(
            help="The version compared to: its uid, or <environment>@<number>."
        ),
    ],
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """
    Compare two versions' locks: the top-level packages added, removed, upgraded and downgraded.

    A version with no lock yet is named, and nothing is compared.
    """
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    old, new = _version(client, before), _version(client, after)
    changes, notes = compare_version_locks(old, new)
    data = {
        "from": version_lock_summary(old),
        "to": version_lock_summary(new),
        "diff": changes.to_data() if changes is not None else None,
        "notes": notes,
    }
    if not emit(data, output):
        display_lock_diff(old, new, changes, notes)


@app.command(name="build")
@_refusals
def build(
    version: VersionArgument,
    variant: Annotated[
        Optional[List[str]],
        typer.Option(
            "--variant",
            help="A variant to build; repeat for more. The version's own by default.",
        ),
    ] = None,
    force: Annotated[
        bool,
        typer.Option("--force", help="Build even when a cached artifact would do."),
    ] = False,
    follow: Annotated[
        bool,
        typer.Option(
            "--follow",
            help="Stream each build's log until it ends, and exit with the outcome: "
            "0 when every build succeeded, 1 otherwise.",
        ),
    ] = False,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """
    Queue a build of a version, one per variant and region.

    With --follow and --output json or yaml, each build, each log chunk and
    each outcome is one record: a JSON line, or a YAML document.
    """
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    builds = client.create_environment_builds(
        _version_uid(client, version),
        variants=variant or None,
        force=True if force else None,
    )
    if not follow:
        if not emit(builds, output):
            display_environment_builds(builds)
        return
    if output is OutputFormat.TABLE:
        display_environment_builds(builds, title="Builds queued")
    else:
        for queued in builds:
            emit_record({"build": queued}, output)
    _exit_with_outcome(_follow(client, [queued.uid for queued in builds], output))


@app.command(name="logs")
@_refusals
def logs(
    build_uid: Annotated[str, typer.Argument(help="The build's uid.")],
    follow: Annotated[
        bool,
        typer.Option(
            "--follow",
            help="Stream the log until the build ends, and exit with the outcome: "
            "0 when it succeeded, 1 otherwise.",
        ),
    ] = False,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Print a build's log: what is stored so far, or with --follow, the stream until the build ends."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    if follow:
        _exit_with_outcome(_follow(client, [build_uid], output))
        return
    chunks = []
    cursor: Optional[str] = None
    complete = False
    while True:
        page = client.read_environment_build_logs(build_uid, cursor=cursor)
        chunks.extend(page.chunks)
        complete = page.complete
        if output is OutputFormat.TABLE:
            for chunk in page.chunks:
                write_log_chunk(chunk)
        if not page.chunks or complete or page.next_cursor in (None, cursor):
            break
        cursor = page.next_cursor
    emit({"buildUid": build_uid, "chunks": chunks, "complete": complete}, output)


@app.command(name="try")
@_refusals
def try_version(
    version: VersionArgument,
    credits_limit: Annotated[
        Optional[float],
        typer.Option(
            "--credits-limit",
            help="The most credits the trial spends. The service lowers a higher "
            "limit to its cap, which is also the limit when none is given.",
        ),
    ] = None,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """
    Launch a trial sandbox of a ready or partially ready version, before promoting it.

    Prints the runtime launched, with the version and the artifact it runs.
    Exits 1 when the service started no runtime.
    """
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    trial = client.trial_environment_version(
        _version_uid(client, version), credits_limit=credits_limit
    )
    # The answer as the service gave it: none of the defaults the model fills in.
    if not emit(trial.model_dump(mode="json", exclude_unset=True), output):
        if trial.success:
            display_trial(trial)
    if not trial.success:
        reason = trial.runtime.reason
        typer.secho(
            f"No trial runtime was started: {trial.message}"
            + (f" ({reason})" if reason else ""),
            err=True,
            fg="red",
        )
        raise typer.Exit(1)


@app.command(name="promote")
@_refusals
def promote(
    version: VersionArgument,
    acknowledge: AcknowledgeOption = None,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Promote a version: launches of its environment use it from now on."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    record = _version(client, version)
    environment = client.get_environment(record.environment_uid)
    promoted = client.promote_environment_version(
        environment.uid,
        record.uid,
        if_match=environment.etag,
        acknowledge_unavailable_variants=acknowledge or None,
    )
    if not emit(promoted, output):
        typer.echo(f"Version {record.version} of {environment.name} is promoted.")
        display_environment(promoted)


@app.command(name="rollback")
@_refusals
def rollback(
    environment: EnvironmentArgument,
    acknowledge: AcknowledgeOption = None,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Promote the newest ready version older than the promoted one. Nothing is rebuilt."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    record = client.get_environment(_environment_uid(client, environment))
    if not record.promoted_version_uid:
        raise EnvironmentsCommandError(
            f"{record.name} has no promoted version to roll back from"
        )
    history = list(_versions(client, record.uid))
    current = next(
        (item for item in history if item.uid == record.promoted_version_uid), None
    )
    if current is None:
        raise EnvironmentsCommandError(
            f"The promoted version {record.promoted_version_uid} of {record.name} "
            "is not among its versions"
        )
    older = [
        item
        for item in history
        if item.version < current.version and can_promote(item.status)
    ]
    if not older:
        raise EnvironmentsCommandError(
            f"{record.name} has no ready version older than version "
            f"{current.version} to roll back to"
        )
    target = max(older, key=lambda item: item.version)
    promoted = client.promote_environment_version(
        record.uid,
        target.uid,
        if_match=record.etag,
        acknowledge_unavailable_variants=acknowledge or None,
    )
    if not emit(promoted, output):
        typer.echo(
            f"{record.name} is rolled back from version {current.version} "
            f"to version {target.version}."
        )
        display_environment(promoted)


@app.command(name="deprecate")
@_refusals
def deprecate(
    version: VersionArgument,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Deprecate a version: no new launches, and running sandboxes keep it."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    record = _version(client, version)
    changed = client.deprecate_environment_version(record.uid, if_match=record.etag)
    if not emit(changed, output):
        display_environment_version(changed, with_spec=False)


@app.command(name="archive")
@_refusals
def archive(
    environment: EnvironmentArgument,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """Archive an environment: kept and readable, no longer offered for launches."""
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    record = client.get_environment(_environment_uid(client, environment))
    changed = client.archive_environment(record.uid, if_match=record.etag)
    if not emit(changed, output):
        display_environment(changed)


@app.command(name="rm")
@_refusals
def remove(
    environment: EnvironmentArgument,
    token: ApiKeyOption = None,
    iam_url: IamUrlOption = None,
    runtimes_url: RuntimesUrlOption = None,
    output: OutputOption = OutputFormat.TABLE,
) -> None:
    """
    Delete an environment, softly: its name stays taken.

    Refused while a version is promoted, an artifact is referenced, or a
    runtime still runs one of its artifacts, whoever launched it; the refusal
    names each runtime. Refused as well when the service cannot tell which
    runtimes run it.
    """
    client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
    record = client.get_environment(_environment_uid(client, environment))
    client.delete_environment(record.uid, if_match=record.etag)
    if not emit({"uid": record.uid, "name": record.name, "deleted": True}, output):
        typer.echo(f"{record.name} ({record.uid}) is deleted.")


# Root level commands for convenience
def envs_list(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List available environments (root command)."""
    list_environments(token=token, iam_url=iam_url, runtimes_url=runtimes_url)


def envs_ls(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List available environments (root command alias)."""
    list_environments(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
