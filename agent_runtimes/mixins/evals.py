# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Evals management mixin for Datalayer Core."""

from __future__ import annotations

import os
from typing import Any, Optional


class EvalsMixin:
    """Mixin for managing evals, experiments, runs, and live monitoring."""

    def _evals_request(
        self,
        path: str,
        *,
        method: str,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
        params: Optional[dict[str, Any]] = None,
        json_body: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        query: dict[str, Any] = dict(params or {})
        resolved_account_uid = (
            billing_entity_uid
            or account_uid
            or os.environ.get("DATALAYER_ACCOUNT_UID")
            or os.environ.get("DATALAYER_BILLING_ENTITY_UID")
        )
        if resolved_account_uid:
            query["account_uid"] = resolved_account_uid
        response = self._fetch(
            f"{self.urls.ai_agents_url}/api/ai-agents/v1/evals{path}",
            method=method,
            params=query,
            json=json_body,
        )
        return response.json()

    def evals_list_evals(
        self,
        *,
        kind: Optional[str] = None,
        run_environment: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if kind:
            params["kind"] = kind
        if run_environment:
            params["run_environment"] = run_environment
        if q:
            params["q"] = q
        return self._evals_request(
            "/evalsets",
            method="GET",
            params=params,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_create_eval(
        self,
        *,
        name: str,
        description: str = "",
        run_environment: str = "sdk",
        kind: str = "batch",
        schema: Optional[dict[str, Any]] = None,
        evalset_evaluators: Optional[list[dict[str, Any]]] = None,
        report_evaluators: Optional[list[dict[str, Any]]] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        cases: Optional[list[dict[str, Any]]] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        body = {
            "name": name,
            "description": description,
            "run_environment": run_environment,
            "kind": kind,
            "schema": schema or {},
            "evalset_evaluators": evalset_evaluators or [],
            "report_evaluators": report_evaluators or [],
            "tags": tags or [],
            "metadata": metadata or {},
            "cases": cases or [],
        }
        return self._evals_request(
            "/evalsets",
            method="POST",
            json_body=body,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_create_eval_from_spec(
        self,
        *,
        spec: dict[str, Any],
        name: Optional[str] = None,
        description: Optional[str] = None,
        run_environment: Optional[str] = None,
        kind: Optional[str] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        # One derivation of the body for every caller (the schema module is
        # what the CLI, the action and the service's import share); the
        # overrides given here replace the spec's own values.
        from agent_runtimes.evals.spec_schema import evalset_payload_from_spec

        payload = evalset_payload_from_spec(spec)
        if name is not None:
            payload["name"] = str(name).strip()
        if description is not None:
            payload["description"] = str(description)
        if run_environment is not None:
            payload["run_environment"] = str(run_environment)
        if kind is not None:
            payload["kind"] = str(kind)
        if not payload["name"]:
            raise ValueError("spec.name is required when name is not provided")

        return self.evals_create_eval(
            **payload,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_import_eval(
        self,
        *,
        spec: dict[str, Any],
        run_environment: Optional[str] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        """Import an ``*.evalset.json`` spec through the service's own import
        route — the one the wizard uses — so the derivation from the spec
        happens once, server-side. The answer carries the evalset and the
        ``unsupported_evaluators`` the platform dropped."""
        body: dict[str, Any] = {"spec": spec}
        if run_environment:
            body["run_environment"] = str(run_environment)
        return self._evals_request(
            "/evalsets/import",
            method="POST",
            json_body=body,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_export_eval(
        self,
        evalset_id: str,
        *,
        format: str = "json",
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        """The evalset as a spec (``json``) or as a pydantic-evals dataset."""
        return self._evals_request(
            f"/evalsets/{evalset_id}/export",
            method="GET",
            params={"format": format},
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_list_subjects(
        self,
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        """What an experiment can run: the subject kinds, which execute, and
        the models AI Inference offers (BENCHMARK.md, B2-11)."""
        return self._evals_request(
            "/subjects",
            method="GET",
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_delete_eval(
        self,
        evalset_id: str,
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            f"/evalsets/{evalset_id}",
            method="DELETE",
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_set_eval_public(
        self,
        evalset_id: str,
        *,
        is_public: bool,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            f"/evalsets/{evalset_id}/public",
            method="PATCH",
            json_body={"is_public": bool(is_public)},
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_get_public_eval(
        self,
        evalset_id: str,
    ) -> dict[str, Any]:
        response = self._fetch(
            f"{self.urls.ai_agents_url}/api/ai-agents/v1/evals/public/evalsets/{evalset_id}",
            method="GET",
        )
        return response.json()

    def evals_list_experiments(
        self,
        *,
        evalset_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if evalset_id:
            params["evalset_id"] = evalset_id
        if status:
            params["status"] = status
        return self._evals_request(
            "/experiments",
            method="GET",
            params=params,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_create_experiment(
        self,
        *,
        name: str,
        evalset_id: Optional[str] = None,
        description: str = "",
        status: str = "draft",
        config: Optional[dict[str, Any]] = None,
        summary: Optional[dict[str, Any]] = None,
        tags: Optional[list[str]] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        body = {
            "name": name,
            "evalset_id": evalset_id,
            "description": description,
            "status": status,
            "config": config or {},
            "summary": summary or {},
            "tags": tags or [],
        }
        return self._evals_request(
            "/experiments",
            method="POST",
            json_body=body,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_delete_experiment(
        self,
        experiment_id: str,
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            f"/experiments/{experiment_id}",
            method="DELETE",
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_list_runs(
        self,
        experiment_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            f"/experiments/{experiment_id}/runs",
            method="GET",
            params={"limit": limit, "offset": offset},
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_create_run(
        self,
        experiment_id: str,
        *,
        status: str = "queued",
        started_at: Optional[str] = None,
        ended_at: Optional[str] = None,
        metrics: Optional[dict[str, Any]] = None,
        summary: Optional[dict[str, Any]] = None,
        report: Optional[dict[str, Any]] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "status": status,
            "metrics": metrics or {},
            "summary": summary or {},
            "report": report or {},
        }
        if started_at:
            body["started_at"] = started_at
        if ended_at:
            body["ended_at"] = ended_at
        return self._evals_request(
            f"/experiments/{experiment_id}/runs",
            method="POST",
            json_body=body,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_get_run(
        self,
        run_id: str,
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            f"/runs/{run_id}",
            method="GET",
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_compare_runs(
        self,
        run_ids: list[str],
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            "/runs/compare",
            method="POST",
            json_body={"run_ids": run_ids},
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_create_live_event(
        self,
        *,
        target_id: str,
        target_type: str = "agent",
        evaluator_name: Optional[str] = None,
        metric_name: Optional[str] = None,
        value_num: Optional[float] = None,
        label: Optional[str] = None,
        passed: Optional[bool] = None,
        attributes: Optional[dict[str, Any]] = None,
        created_at: Optional[str] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "target_id": target_id,
            "target_type": target_type,
            "attributes": attributes or {},
        }
        if evaluator_name is not None:
            body["evaluator_name"] = evaluator_name
        if metric_name is not None:
            body["metric_name"] = metric_name
        if value_num is not None:
            body["value_num"] = value_num
        if label is not None:
            body["label"] = label
        if passed is not None:
            body["passed"] = passed
        if created_at is not None:
            body["created_at"] = created_at
        return self._evals_request(
            "/live/events",
            method="POST",
            json_body=body,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_list_live_targets(
        self,
        *,
        window: str = "24h",
        limit: int = 50,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            "/live/targets",
            method="GET",
            params={"window": window, "limit": limit},
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_list_live_events(
        self,
        *,
        target_id: str,
        target_type: str = "agent",
        window: str = "24h",
        evaluator_name: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "target_id": target_id,
            "target_type": target_type,
            "window": window,
            "limit": limit,
            "offset": offset,
        }
        if evaluator_name:
            params["evaluator_name"] = evaluator_name
        return self._evals_request(
            "/live/events",
            method="GET",
            params=params,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    # --- Launches (BENCHMARK.md, B2-03, B2-07, B2-15) ---

    def _launch_body(
        self,
        *,
        experiment_ids: list[str],
        run_mode: str,
        config: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "experiment_ids": [
                str(item) for item in experiment_ids if str(item or "").strip()
            ],
            "run_mode": str(run_mode or "batch"),
            "config": dict(config or {}),
        }

    def evals_validate_launch(
        self,
        evalset_id: str,
        *,
        experiment_ids: list[str],
        run_mode: str = "batch",
        config: Optional[dict[str, Any]] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        """The plan of a launch before it is made: estimated duration and
        cost, the compute, and the problems that would stop it. Nothing is
        created."""
        return self._evals_request(
            f"/evalsets/{evalset_id}/launches/validate",
            method="POST",
            json_body=self._launch_body(
                experiment_ids=experiment_ids, run_mode=run_mode, config=config
            ),
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_create_launch(
        self,
        evalset_id: str,
        *,
        experiment_ids: list[str],
        run_mode: str = "batch",
        config: Optional[dict[str, Any]] = None,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        """One submission of a benchmark across its experiments: one queued
        run per experiment, executed by the platform. ``config`` carries
        ``concurrency``, ``environment``, ``time_reservation`` (minutes),
        ``request_timeout_seconds``, ``budget`` (credits) and ``retention``."""
        return self._evals_request(
            f"/evalsets/{evalset_id}/launches",
            method="POST",
            json_body=self._launch_body(
                experiment_ids=experiment_ids, run_mode=run_mode, config=config
            ),
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_list_launches(
        self,
        *,
        evalset_id: Optional[str] = None,
        status: Optional[str] = None,
        include_archived: bool = False,
        limit: int = 50,
        offset: int = 0,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "limit": limit,
            "offset": offset,
            "include_archived": include_archived,
        }
        if evalset_id:
            params["evalset_id"] = evalset_id
        if status:
            params["status"] = status
        return self._evals_request(
            "/launches",
            method="GET",
            params=params,
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_get_launch(
        self,
        launch_id: str,
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        """The launch and its runs."""
        return self._evals_request(
            f"/launches/{launch_id}",
            method="GET",
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )

    def evals_cancel_launch(
        self,
        launch_id: str,
        *,
        billing_entity_uid: Optional[str] = None,
        account_uid: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._evals_request(
            f"/launches/{launch_id}/cancel",
            method="POST",
            billing_entity_uid=billing_entity_uid,
            account_uid=account_uid,
        )
