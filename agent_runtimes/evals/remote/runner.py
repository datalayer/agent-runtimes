# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Reusable evalset execution runner.

This module hosts the end-to-end "execute an evalset spec against one or more
agentspecs" workflow so that examples, the GitHub Action, and any other
integration can launch real eval runs without re-implementing the orchestration
(create evalset -> launch cloud runtime(s) -> run each case through the agent ->
grade outputs -> persist runs -> teardown runtimes).
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from agent_runtimes.client import AgentClient
from agent_runtimes.client.agent_client import (
    LocalAgentRuntime,
    ensure_local_agent,
    run_local_agent_chat,
    start_local_agent_runtime,
    wait_for_local_runtime,
)
from agent_runtimes.evals.common import (
    compose_case_prompt,
    extract_case_usage,
    extract_text,
    merge_run_usage,
)
from agent_runtimes.evals.remote.evals import (
    load_evalset_spec,
    now_iso,
    timestamp_slug,
    write_eval_reports,
)
from agent_runtimes.evals.remote.evaluators import evaluate_evalset
from agent_runtimes.utils.agent_utils import teardown_agent_execution_resources

DEFAULT_ENVIRONMENT_NAME = "ai-agents-env"
DEFAULT_AGENT_NAME = "default"
DEFAULT_LOCAL_AGENT_BASE_URL = "http://localhost:8765"
# Default per-request timeout (seconds) for a single agent chat call. Bounding
# each call guarantees a hung agent cannot block the run forever: the call is
# aborted, the case is marked failed, execution continues, and the enclosing
# runner always tears down its cloud runtimes before returning.
DEFAULT_REQUEST_TIMEOUT_SECONDS = 180
DEFAULT_CONCURRENCY = 4
DEFAULT_TIME_RESERVATION_MINUTES = 60.0
DEFAULT_WATCH_TIMEOUT_SECONDS = 3600
DEFAULT_POLL_INTERVAL_SECONDS = 5.0
#: How long a launch may stay `queued` — nothing started, no task counted —
#: before the watch gives up on it. A run takes an hour; being *taken* takes
#: seconds, and a launch still queued after this long has no executor behind
#: it. Waiting the full watch timeout for that is what read as a hang.
DEFAULT_QUEUED_TIMEOUT_SECONDS = 180
#: How often the watch says it is still waiting when nothing has changed.
DEFAULT_HEARTBEAT_SECONDS = 30.0

#: A launch that will not move on its own: over, or `blocked` — waiting on
#: credits, compute or an approval a person has to provide (B2-06).
LAUNCH_SETTLED_STATUSES = frozenset({"completed", "failed", "cancelled", "blocked"})


def is_settled_launch_status(value: Any) -> bool:
    return str(value or "").strip().lower() in LAUNCH_SETTLED_STATUSES


def ui_base_url() -> str:
    """Where the product is, for the addresses the runner prints."""
    return str(os.environ.get("DATALAYER_UI_URL") or "https://datalayer.app").strip().rstrip("/")


def launch_url(launch_id: str) -> str:
    """The launch's page: its runs, and the live report of each."""
    return f"{ui_base_url()}/runs/{launch_id}"


def benchmark_url(evalset_id: str) -> str:
    """The benchmark's page, which is what the product calls an evalset."""
    return f"{ui_base_url()}/benchmarks/{evalset_id}"


def resolve_evalset(
    client: AgentClient,
    spec_or_id: str | Path | dict[str, Any],
    *,
    run_environment: str = "sdk",
    name: Optional[str] = None,
    billing_entity_uid: Optional[str] = None,
    account_uid: Optional[str] = None,
    log: Optional[Callable[[str], None]] = print,
) -> dict[str, Any]:
    """An evalset on the platform: imported from a spec (a file path or the
    loaded dict) through the service's import route — the one the wizard
    uses — or found by id.

    Returns ``{evalset_id, evalset, imported, unsupported_evaluators}``. The
    evaluators the platform cannot run are dropped by the import and named
    here, so a benchmark never claims a grade it will not compute (B0-11).
    """
    spec: Optional[dict[str, Any]] = None
    if isinstance(spec_or_id, dict):
        spec = dict(spec_or_id)
    else:
        path = Path(str(spec_or_id))
        if path.is_file():
            spec = load_evalset_spec(path, require_cases=True)
    if spec is None:
        evalset_id = str(spec_or_id).strip()
        if not evalset_id:
            raise ValueError("Provide an evalset spec file or an evalset id.")
        return {
            "evalset_id": evalset_id,
            "evalset": None,
            "imported": False,
            "unsupported_evaluators": [],
        }
    if name:
        spec["name"] = str(name)
    payload = client.evals_import_eval(
        spec=spec,
        run_environment=run_environment,
        billing_entity_uid=billing_entity_uid,
        account_uid=account_uid,
    )
    evalset = payload.get("evalset") if isinstance(payload.get("evalset"), dict) else {}
    evalset_id = str(evalset.get("id") or "").strip()
    if not evalset_id:
        raise RuntimeError(
            f"Unable to import the evalset: {payload.get('message') or payload}"
        )
    unsupported = [str(item) for item in (payload.get("unsupported_evaluators") or [])]
    if log is not None:
        log(
            f"Imported evalset: {evalset_id} ({evalset.get('name') or spec.get('name') or ''})"
        )
        if unsupported:
            log("Dropped evaluators the platform cannot run: " + ", ".join(unsupported))
    return {
        "evalset_id": evalset_id,
        "evalset": evalset,
        "imported": True,
        "unsupported_evaluators": unsupported,
    }


def subject_of_experiment(experiment: dict[str, Any]) -> dict[str, str]:
    """The kind and ref an experiment runs, from its record or its config."""
    subject = (
        experiment.get("subject") if isinstance(experiment.get("subject"), dict) else {}
    )
    config = (
        experiment.get("config") if isinstance(experiment.get("config"), dict) else {}
    )
    if not subject and isinstance(config.get("subject"), dict):
        subject = config["subject"]
    if not subject and config.get("agent_spec_id"):
        subject = {"kind": "agentspec", "ref": str(config.get("agent_spec_id"))}
    return {
        "kind": str(subject.get("kind") or ""),
        "ref": str(subject.get("ref") or subject.get("model") or ""),
    }


def ensure_experiments(
    client: AgentClient,
    *,
    evalset_id: str,
    subjects: list[dict[str, Any]],
    run_mode: str = "batch",
    launch_source: str = "datalayer-core",
    billing_entity_uid: Optional[str] = None,
    account_uid: Optional[str] = None,
    log: Optional[Callable[[str], None]] = print,
) -> list[str]:
    """One experiment per subject on the evalset: the existing one that runs
    that subject, else a new one (B2-11). Experiments are the durable objects
    runs compare across, so a second launch of the same agent lands on the
    same experiment rather than a fresh one."""
    listing = client.evals_list_experiments(
        evalset_id=evalset_id,
        limit=200,
        billing_entity_uid=billing_entity_uid,
        account_uid=account_uid,
    )
    existing = [
        item for item in (listing.get("experiments") or []) if isinstance(item, dict)
    ]
    experiment_ids: list[str] = []
    for subject in subjects:
        wanted = {
            "kind": str(subject.get("kind") or ""),
            "ref": str(subject.get("ref") or ""),
        }
        if not wanted["kind"] or not wanted["ref"]:
            raise ValueError(f"A subject needs a kind and a ref: {subject!r}")
        found = next(
            (
                item
                for item in existing
                if subject_of_experiment(item) == wanted and not item.get("archived")
            ),
            None,
        )
        if found is not None:
            experiment_ids.append(str(found["id"]))
            continue
        config: dict[str, Any] = {
            "run_mode": run_mode,
            "execution_target": "cloud",
            "subject": dict(subject),
        }
        if wanted["kind"] == "agentspec":
            config["agent_spec_id"] = wanted["ref"]
        payload = client.evals_create_experiment(
            name=wanted["ref"],
            evalset_id=evalset_id,
            description=f"{wanted['kind']} {wanted['ref']}",
            status="draft",
            config=config,
            summary={
                "launch_source": launch_source,
                "agent_spec_id": wanted["ref"] if wanted["kind"] == "agentspec" else "",
            },
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )
        experiment_id = str((payload.get("experiment") or {}).get("id") or "")
        if not experiment_id:
            raise RuntimeError(
                f"Unable to create the experiment for {wanted['kind']} {wanted['ref']}: {payload.get('message') or payload}"
            )
        if log is not None:
            log(
                f"Created experiment {experiment_id} for {wanted['kind']} {wanted['ref']}"
            )
        experiment_ids.append(experiment_id)
    return experiment_ids


def launch_config(
    *,
    concurrency: int = DEFAULT_CONCURRENCY,
    environment: str = DEFAULT_ENVIRONMENT_NAME,
    time_reservation: float = DEFAULT_TIME_RESERVATION_MINUTES,
    request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    budget: Optional[float] = None,
    retention: str = "snapshots",
    git: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """The launch's configuration, the keys the service reads (B2-03, B2-06).

    `git` is where the launch came from when CI made it (BENCHMARK.md,
    B6-02): the commit, the ref, the pull request, the action run and the
    repository. Kept on the launch, indexed by the service, shown on the
    launch's page and in the report's methodology. Empty values are dropped,
    so a launch made by hand carries no `git` at all.
    """
    config: dict[str, Any] = {
        "concurrency": max(1, int(concurrency)),
        "environment": str(environment or DEFAULT_ENVIRONMENT_NAME),
        "time_reservation": float(time_reservation),
        "request_timeout_seconds": max(1, int(request_timeout_seconds)),
        "retention": str(retention or "snapshots"),
    }
    if budget is not None:
        config["budget"] = float(budget)
    context = {key: str(value) for key, value in (git or {}).items() if value not in (None, "")}
    if context:
        config["git"] = context
    return config


def submit_launch(
    client: AgentClient,
    *,
    evalset_id: str,
    experiment_ids: list[str],
    run_mode: str = "batch",
    config: Optional[dict[str, Any]] = None,
    billing_entity_uid: Optional[str] = None,
    account_uid: Optional[str] = None,
) -> dict[str, Any]:
    """Submit the launch; the answer carries the launch and its queued runs.

    A deployment on which nothing executes launches is refused here: a run
    that would sit `queued` forever is not a run.
    """
    payload = client.evals_create_launch(
        evalset_id,
        experiment_ids=experiment_ids,
        run_mode=run_mode,
        config=config or launch_config(),
        billing_entity_uid=billing_entity_uid,
        account_uid=account_uid,
    )
    launch = payload.get("launch") if isinstance(payload.get("launch"), dict) else {}
    if not launch.get("id"):
        raise RuntimeError(
            f"Unable to create the launch: {payload.get('message') or payload}"
        )
    if payload.get("executes") is False:
        raise RuntimeError(
            "Nothing is executing this launch: either ai-agents is not configured with the "
            "durable service, or the durable service did not take the runs. "
            f"The launch {launch['id']} is recorded and will stay queued: {launch_url(launch['id'])}"
        )
    return payload


def launch_outcome_lines(payload: dict[str, Any]) -> list[str]:
    """What to say about a settled launch, beyond its status: one line per
    run that did not complete, with why (BENCHMARK.md, 25.13).

    "Launch 1 failed" alone sent people to the page to learn that every run
    was refused at its first step; the run's failure cause is in the answer
    already, so it is said here.
    """
    launch = payload.get("launch") if isinstance(payload.get("launch"), dict) else {}
    lines: list[str] = []
    reason = str(launch.get("blocked_reason") or "")
    if reason:
        lines.append(f"Blocked: {reason}")
    for run in payload.get("runs") or []:
        if not isinstance(run, dict):
            continue
        status = str(run.get("status") or "")
        if status in {"completed", "running", "queued"}:
            continue
        summary = run.get("summary") if isinstance(run.get("summary"), dict) else {}
        cause = summary.get("failure_cause") if isinstance(summary.get("failure_cause"), dict) else {}
        subject = str(summary.get("agent_spec_id") or (summary.get("subject") or {}).get("model") or run.get("experiment_id") or "")
        where = f" ({summary.get('agent_spec_id') and 'agentspec ' or 'experiment '}{subject})" if subject else ""
        why = ""
        if cause:
            why = f": {cause.get('stage') or 'failure'} — {cause.get('message') or ''}".rstrip(" —")
        # A blocked run says why on itself: `no_compute` when no sandbox of
        # its pool came up, `budget_reached` when it stopped taking tasks.
        blocked = str(run.get("blocked_reason") or summary.get("blocked_reason") or "")
        if not why and blocked:
            why = f": {blocked}"
        lines.append(f"  run {run.get('id')}{where} {status}{why}")
    return lines


def watch_launch(
    client: AgentClient,
    launch_id: str,
    *,
    timeout_seconds: int = DEFAULT_WATCH_TIMEOUT_SECONDS,
    interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    queued_timeout_seconds: int = DEFAULT_QUEUED_TIMEOUT_SECONDS,
    heartbeat_seconds: float = DEFAULT_HEARTBEAT_SECONDS,
    billing_entity_uid: Optional[str] = None,
    account_uid: Optional[str] = None,
    log: Optional[Callable[[str], None]] = print,
) -> dict[str, Any]:
    """Follow the launch until it is settled; the last answer read.

    A line per change of status, with the tasks done over the total and the
    credits consumed so far; `blocked` ends the watch as `failed` does, since
    neither moves without a person.

    Two things it refuses to do silently. While nothing changes it says so
    every ``heartbeat_seconds``, with how long it has been waiting, because
    a watch that prints nothing for an hour is indistinguishable from a hang.
    And a launch still ``queued`` after ``queued_timeout_seconds`` — no run
    started, no task counted — is given up on with the reason named: being
    taken by the executor is a matter of seconds, and a launch nobody takes
    will not be taken by waiting longer.
    """
    started = time.time()
    last_line = ""
    last_said = started
    while True:
        payload = client.evals_get_launch(
            launch_id, billing_entity_uid=billing_entity_uid, account_uid=account_uid
        )
        launch = (
            payload.get("launch") if isinstance(payload.get("launch"), dict) else {}
        )
        status = str(launch.get("status") or "unknown").lower()
        progress = (
            launch.get("progress") if isinstance(launch.get("progress"), dict) else {}
        )
        waited = int(time.time() - started)
        total = int(progress.get("total_cases") or 0)
        # Taken means a task has started, finished or failed. The total is
        # known from the benchmark at creation and says nothing about that.
        taken = any(
            int(progress.get(key) or 0)
            for key in ("running_cases", "completed_cases", "failed_cases")
        )
        untaken = status == "queued" and not taken
        if untaken:
            detail = f"tasks=0/{total}, waiting for the executor to take it"
        else:
            detail = (
                f"tasks={progress.get('completed_cases', 0)}/{total} "
                f"failed={progress.get('failed_cases', 0)} "
                f"credits={float(progress.get('cost_credits') or 0.0):.2f}"
            )
        line = f"{status} {detail}"
        name = launch.get("number") or launch_id
        if line != last_line:
            if log is not None:
                log(f"Launch {name}: {line} (t+{waited}s)")
            last_line = line
            last_said = time.time()
        elif log is not None and time.time() - last_said >= heartbeat_seconds:
            log(f"Launch {name}: still {status}, {waited}s so far")
            last_said = time.time()
        if is_settled_launch_status(status):
            return payload
        if untaken and waited >= queued_timeout_seconds:
            raise RuntimeError(
                f"The launch {launch_id} is still queued after {waited}s: nothing has taken it. "
                "The durable service behind ai-agents is not running the workflow. "
                f"The launch stays recorded at {launch_url(launch_id)} and will run when it is."
            )
        if time.time() - started >= timeout_seconds:
            raise TimeoutError(
                f"the launch {launch_id} is still {status} after {timeout_seconds}s"
            )
        time.sleep(interval_seconds)


def execute_evalset_spec(
    client: AgentClient,
    *,
    spec: dict[str, Any],
    agentspec_ids: list[str],
    run_evalset: bool = True,
    create_report: bool = False,
    run_limit: int = 1,
    run_environment: str = "sdk",
    environment_name: str = DEFAULT_ENVIRONMENT_NAME,
    billing_entity_uid: Optional[str] = None,
    account_uid: Optional[str] = None,
    credits_limit: Optional[float] = None,
    evalset_name: Optional[str] = None,
    backend_run_environment: str = "sdk",
    launch_source: str = "datalayer-core",
    agent_name: str = DEFAULT_AGENT_NAME,
    execution_target: str = "cloud",
    local_agent_base_url: str = DEFAULT_LOCAL_AGENT_BASE_URL,
    auto_start_local_agent_runtime: bool = False,
    local_agent_log_level: str = "info",
    request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    concurrency: int = DEFAULT_CONCURRENCY,
    time_reservation_minutes: float = DEFAULT_TIME_RESERVATION_MINUTES,
    watch_timeout_seconds: int = DEFAULT_WATCH_TIMEOUT_SECONDS,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    git: Optional[dict[str, Any]] = None,
    log: Optional[Callable[[str], None]] = print,
) -> dict[str, Any]:
    """Execute an evalset spec against one or more agentspecs and persist runs.

    Imports the evalset from ``spec`` (through the service's import route),
    then, ``run_limit`` times, either submits a **launch** the platform
    executes on a pool of ``concurrency`` sandboxes per agentspec and watches
    it to its end (``execution_target='cloud'``, BENCHMARK.md B2-03 and
    B2-15), or runs every case through a local ``agent-runtimes`` server,
    grades the outputs with the evals API and stores one run record per
    execution (``execution_target='local'``). Local execution resources are
    always torn down before returning, including on error.

    Parameters
    ----------
    client : AgentClient
        An authenticated client.
    spec : dict[str, Any]
        Evalset spec (as loaded by :func:`load_evalset_spec`).
    agentspec_ids : list[str]
        Agentspec ids to execute. One experiment is created per id (plus one
        cloud runtime per id when ``execution_target='cloud'``).
    run_evalset : bool
        Whether to execute the evalset after creating it. Defaults to ``True``.
        When ``False``, this function only creates the evalset and returns.
    create_report : bool
        Whether to generate markdown/CSV reports via
        :func:`write_eval_reports` before returning. Defaults to ``False``.
    run_limit : int
        Number of runs to create per experiment (minimum 1).
    run_environment : str
        Run-environment label stored on run summaries (for example ``sdk``).
    environment_name : str
        Runtime environment to launch cloud agents in (cloud only).
    billing_entity_uid : Optional[str]
        Optional billing entity UID context.
    account_uid : Optional[str]
        Optional account UID context.
    credits_limit : float, optional
        Credits a cloud launch may spend; it ends ``blocked`` when reached
        (B2-06). No cap when omitted.
    evalset_name : Optional[str]
        Optional explicit evalset name. Defaults to a timestamped name derived
        from the spec name.
    backend_run_environment : str
        ``run_environment`` value persisted on the created evalset.
    launch_source : str
        ``launch_source`` recorded on experiments and runs.
    agent_name : str
        Agent route/name used when contacting the runtime.
    execution_target : str
        ``cloud`` (default) launches one cloud runtime per agentspec; ``local``
        executes against a local ``agent-runtimes`` server.
    local_agent_base_url : str
        Base URL of the local ``agent-runtimes`` server (local only). Ignored
        when ``auto_start_local_agent_runtime`` starts a new server.
    auto_start_local_agent_runtime : bool
        When ``execution_target='local'``, start a local ``agent-runtimes``
        server process automatically and terminate it during cleanup. The
        runner first attempts to reuse ``local_agent_base_url`` and will
        auto-start a local runtime only if that server is unreachable.
    local_agent_log_level : str
        Log level for an auto-started local ``agent-runtimes`` server.
    request_timeout_seconds : int
        Per-request timeout (seconds) for a single agent chat call. When an
        agent does not respond within this window the call is aborted, the case
        is recorded as failed, and execution continues with the next case. This
        avoids one hung request blocking all remaining cases/experiments/runs.
        Defaults to ``180`` (3 minutes per call).
    log : Optional[Callable[[str], None]]
        Optional logging callback (defaults to ``print``; pass ``None`` to
        silence progress output).

    Returns
    -------
    dict[str, Any]
        ``{"evalset_id", "evalset_name", "experiment_ids", "run_ids", "view_url"}``
        plus optional report paths when ``create_report=True``.

    Raises
    ------
    ValueError
        If ``agentspec_ids`` is empty, the spec has no cases, or
        ``execution_target`` is not ``cloud``/``local``.
    RuntimeError
        If the platform returns an unexpected create response or a cloud
        runtime is missing its ingress/pod.
    """

    def _emit(message: str) -> None:
        if log is not None:
            log(message)

    target = str(execution_target or "").strip().lower()
    if target not in {"cloud", "local"}:
        raise ValueError(
            f"execution_target must be 'cloud' or 'local', got {execution_target!r}."
        )

    normalized_specs: list[str] = []
    for value in agentspec_ids:
        spec_id = str(value or "").strip()
        if spec_id and spec_id not in normalized_specs:
            normalized_specs.append(spec_id)
    if not normalized_specs:
        raise ValueError("agentspec_ids must contain at least one agentspec id.")

    cases = [item for item in (spec.get("cases") or []) if isinstance(item, dict)]
    if not cases:
        raise ValueError("Evalset spec has no cases; cannot execute real runs.")

    metadata_raw = spec.get("metadata")
    metadata = metadata_raw if isinstance(metadata_raw, dict) else {}
    run_mode = str(spec.get("kind") or "batch").strip().lower() or "batch"
    if run_mode not in {"batch", "interactive"}:
        raise ValueError(
            f"Evalset spec kind must be 'batch' or 'interactive', got {run_mode!r}."
        )
    prompt_preamble = str(metadata.get("prompt_preamble") or "").strip()

    run_limit = max(1, int(run_limit))

    case_request_timeout = max(1, int(request_timeout_seconds))

    resolved_name = str(
        evalset_name
        or f"{str(spec.get('name') or 'evalset')}-{run_environment}-{timestamp_slug(now_iso())}"
    )
    resolved = resolve_evalset(
        client,
        {**spec, "kind": run_mode},
        run_environment=backend_run_environment,
        name=resolved_name,
        billing_entity_uid=billing_entity_uid,
        account_uid=account_uid,
        log=_emit,
    )
    evalset_id = str(resolved["evalset_id"])

    view_url = benchmark_url(evalset_id)

    result: dict[str, Any] = {
        "evalset_id": evalset_id,
        "evalset_name": resolved_name,
        "experiment_ids": [],
        "run_ids": [],
        "view_url": view_url,
    }

    if not bool(run_evalset):
        _emit(f"Skipped eval execution for evalset: {evalset_id}")
        if bool(create_report):
            reports = write_eval_reports(
                client,
                evalset_id,
                billing_entity_uid=billing_entity_uid,
                account_uid=account_uid,
            )
            result["report_markdown_path"] = str(reports.get("markdown_path") or "")
            if reports.get("csv_path") is not None:
                result["report_csv_path"] = str(reports.get("csv_path") or "")
        return result

    experiment_ids: list[str] = []
    run_ids: list[str] = []

    if target == "cloud":
        # A cloud run is a launch (B2-03, B2-15): the platform executes it on
        # a pool of sandboxes as the person and grades it; this process
        # submits and watches. The runtimes this branch used to create and
        # the per-case loop it used to drive are the durable workflow's now.
        experiment_ids = ensure_experiments(
            client,
            evalset_id=evalset_id,
            subjects=[
                {"kind": "agentspec", "ref": spec_id} for spec_id in normalized_specs
            ],
            run_mode=run_mode,
            launch_source=launch_source,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
            log=_emit,
        )
        config = launch_config(
            concurrency=concurrency,
            environment=environment_name,
            time_reservation=time_reservation_minutes,
            request_timeout_seconds=case_request_timeout,
            budget=credits_limit,
            git=git,
        )
        launch_ids: list[str] = []
        launch_statuses: dict[str, str] = {}
        for run_index in range(run_limit):
            submitted = submit_launch(
                client,
                evalset_id=evalset_id,
                experiment_ids=experiment_ids,
                run_mode=run_mode,
                config=config,
                billing_entity_uid=billing_entity_uid,
                account_uid=account_uid,
            )
            launch = submitted["launch"]
            launch_id = str(launch["id"])
            launch_ids.append(launch_id)
            _emit(
                f"Launch {launch.get('number') or launch_id} submitted ({run_index + 1}/{run_limit}): {launch_url(launch_id)}"
            )
            watched = watch_launch(
                client,
                launch_id,
                timeout_seconds=watch_timeout_seconds,
                interval_seconds=poll_interval_seconds,
                billing_entity_uid=billing_entity_uid,
                account_uid=account_uid,
                log=_emit,
            )
            final = (
                watched.get("launch") if isinstance(watched.get("launch"), dict) else {}
            )
            status = str(final.get("status") or "unknown")
            launch_statuses[launch_id] = status
            run_ids.extend(
                str(run.get("id"))
                for run in (watched.get("runs") or [])
                if isinstance(run, dict) and run.get("id")
            )
            _emit(f"Launch {launch.get('number') or launch_id} {status}")
            for line in launch_outcome_lines(watched):
                _emit(line)
        result["experiment_ids"] = experiment_ids
        result["run_ids"] = run_ids
        result["launch_ids"] = launch_ids
        result["launch_statuses"] = launch_statuses
        result["view_url"] = launch_url(launch_ids[-1]) if launch_ids else view_url
        if bool(create_report):
            reports = write_eval_reports(
                client,
                evalset_id,
                billing_entity_uid=billing_entity_uid,
                account_uid=account_uid,
            )
            result["report_markdown_path"] = str(reports.get("markdown_path") or "")
            if reports.get("csv_path") is not None:
                result["report_csv_path"] = str(reports.get("csv_path") or "")
        return result

    local_runtime: Optional[LocalAgentRuntime] = None
    local_base_url = str(local_agent_base_url or DEFAULT_LOCAL_AGENT_BASE_URL)
    token = str(client._get_api_key() or "")
    try:
        if target == "local":
            local_host = urlparse(local_base_url).hostname or "127.0.0.1"
            should_start_local_runtime = bool(auto_start_local_agent_runtime)
            if not should_start_local_runtime:
                try:
                    wait_for_local_runtime(local_base_url, timeout_seconds=2)
                except Exception:
                    should_start_local_runtime = True
                    _emit(
                        "No local agent-runtimes server reachable at "
                        f"{local_base_url}; starting one automatically."
                    )
            if should_start_local_runtime:
                local_runtime = start_local_agent_runtime(
                    agent_spec_id=normalized_specs[0],
                    agent_name=agent_name,
                    host=local_host,
                    log_level=local_agent_log_level,
                    disable_tool_approvals=True,
                )
                local_base_url = local_runtime.base_url
                _emit(f"Started local agent-runtimes server at {local_base_url}")

        for spec_id in normalized_specs:
            experiment_payload = client.evals_create_experiment(
                name=f"evals-{spec_id}-{timestamp_slug(now_iso())}",
                evalset_id=evalset_id,
                description="Eval execution via datalayer-core runner.",
                status="running",
                config={
                    "run_mode": run_mode,
                    "execution_target": target,
                    "agent_spec_id": spec_id,
                    "environment_name": environment_name,
                },
                summary={
                    "launch_source": launch_source,
                    "run_environment": run_environment,
                    "agent_spec_id": spec_id,
                },
                billing_entity_uid=billing_entity_uid,
                account_uid=account_uid,
            )
            experiment_id = str(
                (experiment_payload.get("experiment") or {}).get("id") or ""
            )
            if not experiment_id:
                raise RuntimeError(f"Unable to create experiment: {experiment_payload}")
            experiment_ids.append(experiment_id)

            ensure_local_agent(
                base_url=local_base_url,
                agent_name=agent_name,
                token=token,
                agent_spec_id=spec_id,
                disable_tool_approvals=True,
            )
            _emit(
                f"Using local agent execution at {local_base_url.rstrip('/')} "
                f"(agent: {agent_name}, agentspec: {spec_id})."
            )

            for run_index in range(run_limit):
                outputs: list[dict[str, Any]] = []
                full_outputs: list[dict[str, Any]] = []
                case_statuses: list[str] = []
                case_prompts: list[Any] = []
                aggregated_usage: dict[str, Any] = {}
                failed_cases = 0
                failure_causes: list[dict[str, Any]] = []

                for case in cases:
                    prompt = compose_case_prompt(case, preamble=prompt_preamble)
                    case_prompts.append(prompt)
                    chat_result = run_local_agent_chat(
                        base_url=local_base_url,
                        agent_name=agent_name,
                        token=token,
                        prompt=prompt,
                        timeout=case_request_timeout,
                    )
                    status = (
                        str(chat_result.get("status") or "completed").strip().lower()
                    )
                    case_statuses.append(status)
                    output_payload = chat_result.get("output") or {}
                    outputs.append({"text": extract_text(output_payload)})
                    full_outputs.append(
                        output_payload
                        if isinstance(output_payload, dict)
                        else {"text": extract_text(output_payload)}
                    )
                    if status in {"failed", "error"}:
                        failed_cases += 1
                        failure = chat_result.get("failure_cause")
                        if isinstance(failure, dict):
                            failure_causes.append(failure)

                    case_usage = extract_case_usage(chat_result)
                    aggregated_usage = merge_run_usage(aggregated_usage, case_usage)

                metrics = evaluate_evalset(spec, outputs, statuses=case_statuses)
                # Persist per-case prompts/outputs onto the graded case results so
                # the report can render the actual agent interaction instead of
                # "(per-case output not captured for this run)".
                case_results = metrics.get("case_results")
                if isinstance(case_results, list):
                    for idx, case_result in enumerate(case_results):
                        if not isinstance(case_result, dict):
                            continue
                        if idx < len(case_prompts):
                            case_result["prompt"] = case_prompts[idx]
                        if idx < len(full_outputs):
                            case_result["output"] = full_outputs[idx]

                interaction = [
                    {
                        "case": str(cases[idx].get("name") or f"case-{idx + 1}"),
                        "status": case_statuses[idx]
                        if idx < len(case_statuses)
                        else None,
                        "prompt": case_prompts[idx]
                        if idx < len(case_prompts)
                        else None,
                        "output": full_outputs[idx]
                        if idx < len(full_outputs)
                        else None,
                    }
                    for idx in range(len(cases))
                ]

                run_status = "failed" if failed_cases > 0 else "completed"
                summary: dict[str, Any] = {
                    "launch_source": launch_source,
                    "run_mode": run_mode,
                    "run_environment": run_environment,
                    "execution_target": target,
                    "agent_spec_id": spec_id,
                    "case_failures": failed_cases,
                    "run_index": run_index + 1,
                    "agent_prompt": [item["prompt"] for item in interaction],
                    "agent_output": [item["output"] for item in interaction],
                }
                summary["local_agent_base_url"] = local_base_url
                summary["local_agent_id"] = agent_name
                if failure_causes:
                    summary["failure_cause"] = failure_causes[0]
                report: dict[str, Any] = {
                    "note": f"real agent execution via datalayer-core runner ({run_mode})",
                    "interaction": interaction,
                    "failure_causes": failure_causes,
                }
                if aggregated_usage:
                    metrics = {
                        **metrics,
                        "pydantic_ai_usage": aggregated_usage,
                    }
                    summary["usage"] = {"pydantic_ai_usage": aggregated_usage}
                    report["usage"] = {"pydantic_ai_usage": aggregated_usage}
                report["local_agent_base_url"] = local_base_url
                report["local_agent_id"] = agent_name

                run_payload = client.evals_create_run(
                    experiment_id,
                    status=run_status,
                    metrics=metrics,
                    summary=summary,
                    report=report,
                    billing_entity_uid=billing_entity_uid,
                    account_uid=account_uid,
                )
                run_id = str((run_payload.get("run") or {}).get("id") or "")
                if not run_id:
                    raise RuntimeError(f"Unable to create run: {run_payload}")
                run_ids.append(run_id)
                _emit(
                    f"Created run {run_index + 1}/{run_limit} for agentspec="
                    f"{spec_id} experiment={experiment_id}: {run_id}"
                )

        _emit(f"Executed evalset: {evalset_id}")
        result["experiment_ids"] = experiment_ids
        result["run_ids"] = run_ids
        if bool(create_report):
            reports = write_eval_reports(
                client,
                evalset_id,
                billing_entity_uid=billing_entity_uid,
                account_uid=account_uid,
            )
            result["report_markdown_path"] = str(reports.get("markdown_path") or "")
            if reports.get("csv_path") is not None:
                result["report_csv_path"] = str(reports.get("csv_path") or "")
        return result
    finally:
        cleanup = teardown_agent_execution_resources(
            client,
            execution_target="local",
            local_base_url=local_base_url,
            local_agent_name=agent_name,
            token=token,
            local_runtime=local_runtime,
        )
        if cleanup.get("local_agent_deleted"):
            _emit(f"Terminated local agent registration: {agent_name}")
        if cleanup.get("local_runtime_terminated"):
            _emit("Stopped auto-started local agent-runtimes server.")
