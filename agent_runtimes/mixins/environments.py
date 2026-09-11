# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Datalayer environments: the platform's catalogue, and the registry of user environments.

``GET /environments`` lists the platform's environments and the user
environments the caller may use. The registry beside it (PLAN_ENV.md, section
9, served by Runtimes since E1-01) creates environments, their versions,
builds and artifacts, and serves build logs. A version's specification, its
states and its capability reports are the canonical models of
``code_sandboxes.environments`` (D-14), as the TypeScript client's types are
generated from their JSON Schema.

A conditional write names the record it replaces with ``if_match``, the
``etag`` every record carries. A keyed create is replayed with the same
``idempotency_key``. ``correlation_id`` travels as ``X-Correlation-Id``, and a
refusal answers with it: a refusal raises :class:`EnvironmentsRequestError`, a
``RuntimeError`` carrying the status and the section 10 body.
"""

from __future__ import annotations

import codecs
import json
import re
import time
from collections.abc import Iterable, Iterator, Mapping, Sequence
from typing import Any, Optional, Union
from urllib.parse import quote

import requests
from code_sandboxes.environments.errors import ERROR_CODES, ErrorCode
from code_sandboxes.environments.spec import Environment, parse_environment

from agent_runtimes.models.environment import (
    EnvironmentArtifactRecord,
    EnvironmentBuildLogChunk,
    EnvironmentBuildLogPage,
    EnvironmentBuildRecord,
    EnvironmentRecord,
    EnvironmentsPage,
    EnvironmentValidationReport,
    EnvironmentVersionRecord,
)

#: Where the Runtimes API is, under the runtimes URL.
RUNTIMES_API_PATH = "/api/runtimes/v1"

#: The event a followed log ends with, once the build is terminal and every
#: chunk is sent.
BUILD_LOG_END_EVENT = "end"

#: What ends a line of a Server-Sent Events stream: CRLF, LF or CR, and nothing else.
_EVENT_STREAM_LINE_END = re.compile(r"\r\n|\r|\n")

#: How much of a followed log is read at a time. A chunked response hands over
#: each piece as it arrives, without waiting for this many bytes.
_EVENT_STREAM_READ_BYTES = 512

#: A specification: the canonical model, or a document or YAML/JSON text of one.
SpecDocument = Union[Environment, Mapping[str, Any], str]


class EnvironmentsRequestError(RuntimeError):
    """
    A refusal of the environments API: its HTTP status and its section 10 body.

    Parameters
    ----------
    message : str
        The service's message, or what went wrong when it gave none.
    status : Optional[int]
        The HTTP status, when the service answered.
    body : Optional[Mapping[str, Any]]
        The refusal's body: ``code``, ``message``, ``correlationId``, and the
        ``field`` and ``detail`` when there are some.
    """

    def __init__(
        self,
        message: str,
        *,
        status: Optional[int] = None,
        body: Optional[Mapping[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.body: dict[str, Any] = dict(body or {})
        self.code: Optional[str] = self.body.get("code")
        self.correlation_id: Optional[str] = self.body.get("correlationId")
        self.field: Optional[str] = self.body.get("field")
        self.detail: Any = self.body.get("detail")

    @property
    def error_code(self) -> Optional[ErrorCode]:
        """
        The code of the section 10 taxonomy the refusal names.

        Returns
        -------
        Optional[ErrorCode]
            The code, or None for a request's own code, such as
            ``DL_ENV_NOT_FOUND``, and for a refusal that names none.
        """
        return ERROR_CODES.get(self.code or "")


def _refusal(error: RuntimeError) -> EnvironmentsRequestError:
    """The refusal ``_fetch`` raised, with the status and body of its response."""
    response = getattr(error.__cause__, "response", None)
    status = getattr(response, "status_code", None)
    body: Any = None
    if response is not None:
        try:
            body = response.json()
        except ValueError:
            body = None
    if not isinstance(body, dict):
        body = {}
    detail = body.get("detail")
    message = (
        body.get("message") or (detail if isinstance(detail, str) else "") or str(error)
    )
    return EnvironmentsRequestError(str(message), status=status, body=body)


def _segment(value: str, name: str) -> str:
    """A uid as a path segment; refused when empty."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    return quote(value, safe="")


def _required(value: str, name: str) -> str:
    """A header value a route requires; refused when empty."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    return value


def _spec_document(spec: SpecDocument) -> dict[str, Any]:
    """An Environment document as the registry takes it, parsed by the canonical models first."""
    environment = parse_environment(spec)
    return environment.model_dump(by_alias=True, mode="json", exclude_none=True)


def _given(**fields: Any) -> dict[str, Any]:
    """The fields that were given: None is not sent."""
    return {name: value for name, value in fields.items() if value is not None}


def _event_stream_lines(pieces: Iterable[bytes]) -> Iterator[str]:
    """
    The lines of a Server-Sent Events stream, from its body in the pieces it arrives in.

    The stream is UTF-8 whatever its content type says, and a line ends at
    CRLF, LF or CR only. ``requests``' ``iter_lines`` does neither: it decodes
    with the content type's charset, ISO-8859-1 when it names none, and splits
    with ``str.splitlines``, which also ends a line at U+0085, U+2028 and
    U+2029. Runtimes writes a chunk's JSON with those unescaped, so a data line
    holding one arrived in two halves that did not parse.

    Parameters
    ----------
    pieces : Iterable[bytes]
        The body, as it arrives.

    Yields
    ------
    str
        Each complete line, without its line end. An unfinished last line is dropped.
    """
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    parts: list[str] = []
    after_carriage_return = False
    for piece in pieces:
        text = decoder.decode(piece)
        if not text:
            continue
        if after_carriage_return and text.startswith("\n"):
            # The LF of a CRLF whose CR ended the previous piece.
            text = text[1:]
        after_carriage_return = text.endswith("\r")
        start = 0
        for line_end in _EVENT_STREAM_LINE_END.finditer(text):
            parts.append(text[start : line_end.start()])
            yield "".join(parts)
            parts = []
            start = line_end.end()
        parts.append(text[start:])


def _server_sent_events(lines: Iterable[Union[str, bytes]]) -> Iterator[dict[str, str]]:
    """The events of a Server-Sent Events stream, as ``{id, event, data}``."""
    event, identifier = "message", ""
    data: list[str] = []
    for raw in lines:
        line = (raw.decode("utf-8") if isinstance(raw, bytes) else raw).rstrip("\r")
        if not line:
            if data or event != "message":
                yield {"id": identifier, "event": event, "data": "\n".join(data)}
            event, identifier, data = "message", "", []
            continue
        if line.startswith(":"):
            continue
        name, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if name == "id":
            identifier = value
        elif name == "event":
            event = value
        elif name == "data":
            data.append(value)


class EnvironmentsListMixin:
    """Mixin class that provides the environments listing and the registry of user environments."""

    def _environments_request(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        params: Optional[Mapping[str, Any]] = None,
        if_match: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> Any:
        """
        Call one route of the Runtimes API.

        Parameters
        ----------
        method : str
            The HTTP method.
        path : str
            The route, under ``/api/runtimes/v1``.
        body : Any
            The JSON body, when there is one.
        params : Optional[Mapping[str, Any]]
            The query; None values are not sent.
        if_match : Optional[str]
            Sent as ``If-Match``.
        idempotency_key : Optional[str]
            Sent as ``Idempotency-Key``.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        Any
            The JSON answer, or None for a 204.

        Raises
        ------
        EnvironmentsRequestError
            When the service refuses.
        """
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if if_match:
            headers["If-Match"] = if_match
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id
        kwargs: dict[str, Any] = {"method": method, "headers": headers}
        if body is not None:
            kwargs["json"] = body
        query = _given(**dict(params or {}))
        if query:
            kwargs["params"] = query
        url = f"{self.urls.runtimes_url}{RUNTIMES_API_PATH}{path}"
        try:
            response = self._fetch(url, **kwargs)
        except RuntimeError as error:
            raise _refusal(error) from error
        if response.status_code == 204:
            return None
        return response.json()

    def _list_environments(
        self,
        *,
        owner: Optional[str] = None,
        origin: Optional[str] = None,
        variant: Optional[str] = None,
        q: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> dict[str, Any]:
        """
        List available environments.

        Parameters
        ----------
        owner : Optional[str]
            Only one owner's: an account uid, or a platform entry's owner such
            as ``datalayer``.
        origin : Optional[str]
            Only ``platform`` or only ``user`` environments.
        variant : Optional[str]
            Only the environments offered on this variant.
        q : Optional[str]
            Only the environments whose name or title holds this.
        cursor : Optional[str]
            The previous page's ``nextCursor``.
        limit : Optional[int]
            How many user environments a page holds.

        Returns
        -------
        dict[str, Any]
            One page: ``environments``, and ``nextCursor`` when there is
            another; ``success`` False and a ``message`` when the request failed.
        """
        query = _given(
            owner=owner, origin=origin, variant=variant, q=q, cursor=cursor, limit=limit
        )
        try:
            response = self._fetch(
                "{}/api/runtimes/v1/environments".format(self.urls.runtimes_url),
                **({"params": query} if query else {}),
            )
            return response.json()
        except RuntimeError as e:
            return {"success": False, "message": str(e)}

    # -- environments --------------------------------------------------------

    def create_environment(
        self,
        name: str,
        *,
        title: Optional[str] = None,
        description: Optional[str] = None,
        visibility: Optional[str] = None,
        owner_type: Optional[str] = None,
        owner_uid: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentRecord:
        """
        Create a user environment, for the caller's account or an organization it owns.

        Parameters
        ----------
        name : str
            A DNS-1123 label, unique per owner.
        title : Optional[str]
            The title; the name by default.
        description : Optional[str]
            The description.
        visibility : Optional[str]
            ``private`` by default, or ``organization`` for an organization's.
        owner_type : Optional[str]
            ``user`` by default, or ``organization``.
        owner_uid : Optional[str]
            The organization's uid, for an organization's environment.
        idempotency_key : Optional[str]
            A replay with the same key answers the environment first created.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentRecord
            The environment.
        """
        body = _given(
            name=name,
            title=title,
            description=description,
            visibility=visibility,
            ownerType=owner_type,
            ownerUid=owner_uid,
        )
        answer = self._environments_request(
            "POST",
            "/environments",
            body=body,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return EnvironmentRecord.model_validate(answer)

    def get_environment(
        self, environment_uid: str, *, correlation_id: Optional[str] = None
    ) -> EnvironmentRecord:
        """
        Get a user environment.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentRecord
            The environment.
        """
        answer = self._environments_request(
            "GET",
            f"/environments/{_segment(environment_uid, 'environment_uid')}",
            correlation_id=correlation_id,
        )
        return EnvironmentRecord.model_validate(answer)

    def update_environment(
        self,
        environment_uid: str,
        *,
        if_match: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        visibility: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentRecord:
        """
        Change an environment's title, description or visibility.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        if_match : str
            The ``etag`` of the environment read; a stale one is refused with 412.
        title : Optional[str]
            The new title.
        description : Optional[str]
            The new description.
        visibility : Optional[str]
            The new visibility.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentRecord
            The environment changed.
        """
        answer = self._environments_request(
            "PATCH",
            f"/environments/{_segment(environment_uid, 'environment_uid')}",
            body=_given(title=title, description=description, visibility=visibility),
            if_match=_required(if_match, "if_match"),
            correlation_id=correlation_id,
        )
        return EnvironmentRecord.model_validate(answer)

    def delete_environment(
        self,
        environment_uid: str,
        *,
        if_match: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        """
        Delete an environment, softly.

        Refused with 409 while a version is promoted or an artifact is referenced.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        if_match : Optional[str]
            The ``etag`` of the environment read.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.
        """
        self._environments_request(
            "DELETE",
            f"/environments/{_segment(environment_uid, 'environment_uid')}",
            if_match=if_match,
            correlation_id=correlation_id,
        )

    def archive_environment(
        self,
        environment_uid: str,
        *,
        if_match: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentRecord:
        """
        Archive an environment: kept and readable, no longer offered for launches.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        if_match : Optional[str]
            The ``etag`` of the environment read.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentRecord
            The environment archived.
        """
        answer = self._environments_request(
            "POST",
            f"/environments/{_segment(environment_uid, 'environment_uid')}/archive",
            if_match=if_match,
            correlation_id=correlation_id,
        )
        return EnvironmentRecord.model_validate(answer)

    def promote_environment_version(
        self,
        environment_uid: str,
        version_uid: Optional[str],
        *,
        if_match: str,
        acknowledge_unavailable_variants: Optional[Sequence[str]] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentRecord:
        """
        Promote a version, or none; a rollback is the same call with an older version.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        version_uid : Optional[str]
            The version to promote, or None to promote none.
        if_match : str
            The ``etag`` of the environment read; a stale one is refused with 412.
        acknowledge_unavailable_variants : Optional[Sequence[str]]
            The unavailable variants of a partially ready version.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentRecord
            The environment, naming its promoted version.
        """
        body: dict[str, Any] = {"versionUid": version_uid}
        if acknowledge_unavailable_variants is not None:
            body["acknowledgeUnavailableVariants"] = list(
                acknowledge_unavailable_variants
            )
        answer = self._environments_request(
            "PUT",
            f"/environments/{_segment(environment_uid, 'environment_uid')}/promoted-version",
            body=body,
            if_match=_required(if_match, "if_match"),
            correlation_id=correlation_id,
        )
        return EnvironmentRecord.model_validate(answer)

    # -- versions ------------------------------------------------------------

    def create_environment_version(
        self,
        environment_uid: str,
        spec: SpecDocument,
        *,
        label: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentVersionRecord:
        """
        Create a draft version of an environment from a specification.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        spec : SpecDocument
            The specification: an ``Environment``, or a document or YAML/JSON
            text of one, parsed by the canonical models before it is sent.
        label : Optional[str]
            The version's label.
        idempotency_key : Optional[str]
            A replay with the same key answers the version first created.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentVersionRecord
            The draft.
        """
        answer = self._environments_request(
            "POST",
            f"/environments/{_segment(environment_uid, 'environment_uid')}/versions",
            body={"spec": _spec_document(spec), **_given(label=label)},
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return EnvironmentVersionRecord.model_validate(answer)

    def list_environment_versions(
        self,
        environment_uid: str,
        *,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentsPage[EnvironmentVersionRecord]:
        """
        List an environment's versions, newest first.

        Parameters
        ----------
        environment_uid : str
            The environment's uid.
        cursor : Optional[str]
            The previous page's ``next_cursor``.
        limit : Optional[int]
            How many versions a page holds.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentsPage[EnvironmentVersionRecord]
            One page of versions.
        """
        answer = self._environments_request(
            "GET",
            f"/environments/{_segment(environment_uid, 'environment_uid')}/versions",
            params={"cursor": cursor, "limit": limit},
            correlation_id=correlation_id,
        )
        return EnvironmentsPage[EnvironmentVersionRecord](
            items=answer.get("versions") or [], next_cursor=answer.get("nextCursor")
        )

    def get_environment_version(
        self, version_uid: str, *, correlation_id: Optional[str] = None
    ) -> EnvironmentVersionRecord:
        """
        Get a version, with its specification and its status.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentVersionRecord
            The version.
        """
        answer = self._environments_request(
            "GET",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}",
            correlation_id=correlation_id,
        )
        return EnvironmentVersionRecord.model_validate(answer)

    def update_environment_version(
        self,
        version_uid: str,
        *,
        if_match: str,
        spec: Optional[SpecDocument] = None,
        label: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentVersionRecord:
        """
        Edit a draft's specification or label.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        if_match : str
            The ``etag`` of the version read; a stale one is refused with 412.
        spec : Optional[SpecDocument]
            The new specification.
        label : Optional[str]
            The new label.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentVersionRecord
            The draft changed.
        """
        body = _given(label=label)
        if spec is not None:
            body["spec"] = _spec_document(spec)
        answer = self._environments_request(
            "PATCH",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}",
            body=body,
            if_match=_required(if_match, "if_match"),
            correlation_id=correlation_id,
        )
        return EnvironmentVersionRecord.model_validate(answer)

    def validate_environment_version(
        self,
        version_uid: str,
        *,
        variants: Optional[Sequence[str]] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentValidationReport:
        """
        Validate a version: a dry run answering a capability report per variant.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        variants : Optional[Sequence[str]]
            The variants to report on; the version's own by default.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentValidationReport
            The report.
        """
        answer = self._environments_request(
            "POST",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/validate",
            body=_given(variants=list(variants) if variants is not None else None),
            correlation_id=correlation_id,
        )
        return EnvironmentValidationReport.model_validate(answer)

    def resolve_environment_version(
        self, version_uid: str, *, correlation_id: Optional[str] = None
    ) -> Any:
        """
        Resolve a version into its lock.

        The service answers 501 until PLAN_ENV.md E1-04 builds the resolver.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        Any
            The service's answer.
        """
        return self._environments_request(
            "POST",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/resolve",
            correlation_id=correlation_id,
        )

    def trial_environment_version(
        self, version_uid: str, *, correlation_id: Optional[str] = None
    ) -> Any:
        """
        Launch a trial sandbox of a version before it is promoted.

        The service answers 501 until PLAN_ENV.md E1-14 builds trials.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        Any
            The service's answer.
        """
        return self._environments_request(
            "POST",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/trial",
            correlation_id=correlation_id,
        )

    def deprecate_environment_version(
        self,
        version_uid: str,
        *,
        if_match: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentVersionRecord:
        """
        Deprecate a version: no new launches, and running sandboxes keep it.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        if_match : Optional[str]
            The ``etag`` of the version read.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentVersionRecord
            The version deprecated.
        """
        answer = self._environments_request(
            "POST",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/deprecate",
            if_match=if_match,
            correlation_id=correlation_id,
        )
        return EnvironmentVersionRecord.model_validate(answer)

    # -- builds and artifacts ------------------------------------------------

    def create_environment_builds(
        self,
        version_uid: str,
        *,
        variants: Optional[Sequence[str]] = None,
        required_variants: Optional[Sequence[str]] = None,
        regions: Optional[Sequence[str]] = None,
        force: Optional[bool] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> list[EnvironmentBuildRecord]:
        """
        Queue a build per variant and region.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        variants : Optional[Sequence[str]]
            The variants to build; the version's own by default.
        required_variants : Optional[Sequence[str]]
            A subset of ``variants``.
        regions : Optional[Sequence[str]]
            The regions; the spec's, else ``r1``, by default.
        force : Optional[bool]
            Build even when a cached artifact would do.
        idempotency_key : Optional[str]
            A replay with the same key answers the builds first queued.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``, and stored on each build.

        Returns
        -------
        list[EnvironmentBuildRecord]
            The builds queued.
        """
        body = _given(
            variants=list(variants) if variants is not None else None,
            requiredVariants=list(required_variants)
            if required_variants is not None
            else None,
            regions=list(regions) if regions is not None else None,
            force=force,
        )
        answer = self._environments_request(
            "POST",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/builds",
            body=body,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return [
            EnvironmentBuildRecord.model_validate(item)
            for item in answer.get("builds") or []
        ]

    def list_environment_builds(
        self,
        version_uid: str,
        *,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentsPage[EnvironmentBuildRecord]:
        """
        List a version's builds, newest first.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        cursor : Optional[str]
            The previous page's ``next_cursor``.
        limit : Optional[int]
            How many builds a page holds.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentsPage[EnvironmentBuildRecord]
            One page of builds.
        """
        answer = self._environments_request(
            "GET",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/builds",
            params={"cursor": cursor, "limit": limit},
            correlation_id=correlation_id,
        )
        return EnvironmentsPage[EnvironmentBuildRecord](
            items=answer.get("builds") or [], next_cursor=answer.get("nextCursor")
        )

    def list_environment_artifacts(
        self,
        version_uid: str,
        *,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentsPage[EnvironmentArtifactRecord]:
        """
        List a version's artifacts, one per variant and region.

        Parameters
        ----------
        version_uid : str
            The version's uid.
        cursor : Optional[str]
            The previous page's ``next_cursor``.
        limit : Optional[int]
            How many artifacts a page holds.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentsPage[EnvironmentArtifactRecord]
            One page of artifacts.
        """
        answer = self._environments_request(
            "GET",
            f"/environment-versions/{_segment(version_uid, 'version_uid')}/artifacts",
            params={"cursor": cursor, "limit": limit},
            correlation_id=correlation_id,
        )
        return EnvironmentsPage[EnvironmentArtifactRecord](
            items=answer.get("artifacts") or [], next_cursor=answer.get("nextCursor")
        )

    def get_environment_build(
        self, build_uid: str, *, correlation_id: Optional[str] = None
    ) -> EnvironmentBuildRecord:
        """
        Get a build.

        Parameters
        ----------
        build_uid : str
            The build's uid.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentBuildRecord
            The build.
        """
        answer = self._environments_request(
            "GET",
            f"/environment-builds/{_segment(build_uid, 'build_uid')}",
            correlation_id=correlation_id,
        )
        return EnvironmentBuildRecord.model_validate(answer)

    def read_environment_build_logs(
        self,
        build_uid: str,
        *,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentBuildLogPage:
        """
        Read a build's stored log chunks after a cursor: the polling side of D-15.

        Parameters
        ----------
        build_uid : str
            The build's uid.
        cursor : Optional[str]
            The sequence of the last chunk read.
        limit : Optional[int]
            How many chunks a page holds.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentBuildLogPage
            The chunks, the next cursor, and whether the log is complete.
        """
        answer = self._environments_request(
            "GET",
            f"/environment-builds/{_segment(build_uid, 'build_uid')}/logs",
            params={"cursor": cursor, "limit": limit},
            correlation_id=correlation_id,
        )
        return EnvironmentBuildLogPage.model_validate(answer)

    def follow_environment_build_logs(
        self,
        build_uid: str,
        *,
        last_event_id: Optional[str] = None,
        max_reconnects: int = 5,
        reconnect_delay: float = 1.0,
    ) -> Iterator[EnvironmentBuildLogChunk]:
        """
        Yield each chunk of a build's log as it is written, until the build is terminal.

        The stream is Server-Sent Events (D-15, E1-16): each chunk an event
        whose id is its sequence, then ``end`` once the build is terminal and
        every chunk is sent. A dropped connection is resumed with
        ``Last-Event-ID``, so no chunk is repeated; after ``max_reconnects``
        drops in a row with no chunk between them, it gives up. A refusal is
        not retried: it raises :class:`EnvironmentsRequestError`, such as the
        404 a caller who may not read the build is answered before the stream
        opens.

        Parameters
        ----------
        build_uid : str
            The build's uid.
        last_event_id : Optional[str]
            The id of the last event already received, to resume after it.
        max_reconnects : int
            How many drops in a row, with no chunk between them, before giving up.
        reconnect_delay : float
            How long to wait before reconnecting, in seconds.

        Yields
        ------
        EnvironmentBuildLogChunk
            Each chunk once, in sequence.

        Raises
        ------
        EnvironmentsRequestError
            When the service refuses to stream the log.
        RuntimeError
            When the stream drops ``max_reconnects`` times in a row.
        """
        url = (
            f"{self.urls.runtimes_url}{RUNTIMES_API_PATH}"
            f"/environment-builds/{_segment(build_uid, 'build_uid')}/logs"
        )
        drops = 0
        while True:
            headers = {"Accept": "text/event-stream"}
            if last_event_id:
                headers["Last-Event-ID"] = last_event_id
            ended = False
            response: Any = None
            try:
                response = self._fetch(
                    url,
                    method="GET",
                    headers=headers,
                    params={"follow": "true"},
                    stream=True,
                )
            except RuntimeError as error:
                raise _refusal(error) from error
            except requests.exceptions.RequestException:
                response = None
            if response is not None:
                try:
                    for event in _server_sent_events(
                        _event_stream_lines(
                            response.iter_content(chunk_size=_EVENT_STREAM_READ_BYTES)
                        )
                    ):
                        if event["event"] == BUILD_LOG_END_EVENT:
                            ended = True
                            break
                        if not event["data"]:
                            continue
                        chunk = EnvironmentBuildLogChunk.model_validate(
                            json.loads(event["data"])
                        )
                        last_event_id = event["id"] or str(chunk.sequence)
                        drops = 0
                        yield chunk
                except requests.exceptions.RequestException:
                    pass
                finally:
                    close = getattr(response, "close", None)
                    if callable(close):
                        close()
            if ended:
                return
            drops += 1
            if drops > max_reconnects:
                raise RuntimeError(
                    f"The log of build {build_uid} dropped {drops} times "
                    "with no chunk in between"
                )
            time.sleep(reconnect_delay)

    def cancel_environment_build(
        self,
        build_uid: str,
        *,
        if_match: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> EnvironmentBuildRecord:
        """
        Cancel a build that has not ended.

        Parameters
        ----------
        build_uid : str
            The build's uid.
        if_match : Optional[str]
            The ``etag`` of the build read.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``.

        Returns
        -------
        EnvironmentBuildRecord
            The build cancelled.
        """
        answer = self._environments_request(
            "POST",
            f"/environment-builds/{_segment(build_uid, 'build_uid')}/cancel",
            if_match=if_match,
            correlation_id=correlation_id,
        )
        return EnvironmentBuildRecord.model_validate(answer)

    def retry_environment_build(
        self, build_uid: str, *, correlation_id: Optional[str] = None
    ) -> EnvironmentBuildRecord:
        """
        Queue the next attempt of a failed or cancelled build, once however often it is asked for.

        Parameters
        ----------
        build_uid : str
            The build's uid.
        correlation_id : Optional[str]
            Sent as ``X-Correlation-Id``, and stored on the attempt.

        Returns
        -------
        EnvironmentBuildRecord
            The attempt queued.
        """
        answer = self._environments_request(
            "POST",
            f"/environment-builds/{_segment(build_uid, 'build_uid')}/retry",
            correlation_id=correlation_id,
        )
        return EnvironmentBuildRecord.model_validate(answer)


class EnvironmentsMixin(EnvironmentsListMixin):
    """
    Mixin class that provides environment listing functionality.
    """
