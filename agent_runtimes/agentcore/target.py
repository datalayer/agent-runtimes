# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agentcore`` runtime target (AC-10): an agentspec on AgentCore Runtime.

One container image serves every agentspec; a deployment is that image made
an AgentCore agent runtime with the agentspec's id in its environment
(``AGENT_SPEC_ID``, and ``AGENT_RUNTIMES_TARGET=agentcore`` so the runtime
knows where it runs and which identity provider it uses), speaking AG-UI
(``protocolConfiguration.serverProtocol = AGUI``), optionally behind a JWT
authorizer that trusts an OIDC issuer (Datalayer IAM, ID-02).

The calls, as botocore names them:

- ``bedrock-agentcore-control``: ``create_agent_runtime``, then once it is
  ``READY`` ``update_agent_runtime`` (deploy: the runtime told its own ARN
  and URL, its authorizer given the ARN as audience), ``get_agent_runtime``
  (status), ``delete_agent_runtime`` (destroy);
- ``bedrock-agentcore``: ``invoke_agent_runtime`` (a turn; the answer read
  as ``text/event-stream``), ``stop_runtime_session`` (stop).

The person's own AWS credentials are used, as boto3 finds them; nothing here
holds a Datalayer account.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Dict,
    Mapping,
    Optional,
    Sequence,
)
from urllib.parse import quote

from agent_runtimes.agentcore.a2a import RUNTIME_URL_VARIABLE
from agent_runtimes.agentcore.exchange import IAM_URL_VARIABLE, RUNTIME_ARN_VARIABLE
from agent_runtimes.agentcore.session_ids import session_uid_to_agentcore
from agent_runtimes.agentcore.settings import SPEC_VARIABLE, TARGET, TARGET_VARIABLE
from agent_runtimes.plugins.points import Deployment, TargetCapabilities

#: The target's id, as ``runtime.target`` knows it (``serve --target``'s name).
AGENTCORE_TARGET_ID = TARGET

#: The environment variable that tells a runtime where it runs.
TARGET_ENV = TARGET_VARIABLE
#: The environment variable that names the agentspec a runtime serves.
SPEC_ENV = SPEC_VARIABLE

#: The endpoint every agent runtime has.
DEFAULT_ENDPOINT = "DEFAULT"

#: AgentCore's rule for an agent runtime's name.
RUNTIME_NAME = re.compile(r"[a-zA-Z][a-zA-Z0-9_]{0,47}")

#: Where an OIDC issuer's discovery document is; AgentCore asks for it.
#: The header AgentCore names an invocation's session in.
SESSION_HEADER = "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"

DISCOVERY_SUFFIX = "/.well-known/openid-configuration"

#: Where Datalayer IAM publishes its discovery document, under its base URL.
IAM_DISCOVERY_PATH = "/api/iam/v1/oauth" + DISCOVERY_SUFFIX


def iam_url_of(discovery_url: str) -> str:
    """IAM's base URL when ``discovery_url`` is Datalayer IAM's discovery document, else ``""``."""
    url = discovery_url.strip()
    return url[: -len(IAM_DISCOVERY_PATH)] if url.endswith(IAM_DISCOVERY_PATH) else ""


#: The variables a deployment sets itself once AgentCore names the runtime.
RUNTIME_ENV = (RUNTIME_ARN_VARIABLE, RUNTIME_URL_VARIABLE)

#: How long a created runtime is waited for before it is told its ARN.
READY_TIMEOUT_SECONDS = 600.0
#: How often it is asked meanwhile.
READY_POLL_SECONDS = 5.0


def runtime_url_of(arn: str, region: str) -> str:
    """Return the address callers reach an agent runtime at (its invocations).

    Parameters
    ----------
    arn : str
        The agent runtime's ARN.
    region : str
        The region it runs in.

    Returns
    -------
    str
        ``https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<arn>/invocations/``,
        the ARN escaped.
    """
    return (
        f"https://bedrock-agentcore.{region}.amazonaws.com/runtimes/"
        f"{quote(arn, safe='')}/invocations/"
    )


class AgentCoreError(RuntimeError):
    """What AgentCore answered that cannot be used, in a sentence."""


@dataclass(frozen=True)
class JwtAuthorizer:
    """The JWT authorizer of an agent runtime (``customJWTAuthorizer``)."""

    #: The issuer's discovery URL, ending in ``/.well-known/openid-configuration``.
    discovery_url: str
    #: The ``aud`` values accepted.
    allowed_audience: Sequence[str] = ()
    #: The ``client_id`` values accepted.
    allowed_clients: Sequence[str] = ()
    #: Claims that must equal a value (``org_uid`` → the organization).
    custom_claims: Mapping[str, str] = field(default_factory=dict)

    def configuration(self) -> Dict[str, Any]:
        if not self.discovery_url.endswith(DISCOVERY_SUFFIX):
            raise ValueError(
                f"The JWT authorizer's discovery URL {self.discovery_url!r} must end in "
                f"{DISCOVERY_SUFFIX}: AgentCore reads the issuer from it."
            )
        if not self.allowed_audience and not self.allowed_clients:
            raise ValueError(
                "The JWT authorizer names no audience and no client: "
                "it would accept any token its issuer signs."
            )
        authorizer: Dict[str, Any] = {"discoveryUrl": self.discovery_url}
        if self.allowed_audience:
            authorizer["allowedAudience"] = list(self.allowed_audience)
        if self.allowed_clients:
            authorizer["allowedClients"] = list(self.allowed_clients)
        if self.custom_claims:
            authorizer["customClaims"] = [
                {
                    "inboundTokenClaimName": name,
                    "inboundTokenClaimValueType": "STRING",
                    "authorizingClaimMatchValue": {
                        "claimMatchValue": {"matchValueString": value},
                        "claimMatchOperator": "EQUALS",
                    },
                }
                for name, value in self.custom_claims.items()
            ]
        return {"customJWTAuthorizer": authorizer}


@dataclass(frozen=True)
class AgentCoreDeploySettings:
    """What a deployment to AgentCore is made with."""

    #: The agent-runtimes image in ECR (``<account>.dkr.ecr.<region>.amazonaws.com/…``).
    image_uri: str
    #: The execution role the agent runtime assumes.
    role_arn: str
    #: The region it runs in.
    region: str
    #: The agent runtime's name; derived from the agentspec's id when empty.
    name: str = ""
    description: str = ""
    authorizer: Optional[JwtAuthorizer] = None
    #: More environment variables (never ``AGENT_SPEC_ID`` nor ``AGENT_RUNTIMES_TARGET``).
    environment: Mapping[str, str] = field(default_factory=dict)
    #: ``PUBLIC`` (a VPC is not configured here).
    network_mode: str = "PUBLIC"
    #: The endpoint sessions are invoked on.
    endpoint: str = DEFAULT_ENDPOINT
    #: Makes a retried create idempotent, when given.
    client_token: str = ""


def spec_id_of(spec: Any) -> str:
    """The agentspec's id: a string, a mapping's ``id``, an object's ``id``."""
    if isinstance(spec, str):
        spec_id = spec
    elif isinstance(spec, Mapping):
        spec_id = str(spec.get("id") or "")
    else:
        spec_id = str(getattr(spec, "id", "") or "")
    spec_id = spec_id.strip()
    if not spec_id:
        raise ValueError("The agentspec has no id: nothing names what to deploy.")
    return spec_id


def runtime_name_for(spec_id: str) -> str:
    """An agent runtime name for an agentspec: ``datalayer_<id>``, AgentCore's rule kept."""
    return ("datalayer_" + re.sub(r"[^a-zA-Z0-9_]", "_", spec_id))[:48]


def _client(service: str, region: str) -> Any:
    import boto3

    return boto3.client(service, region_name=region)


class AgentCoreTarget:
    """The ``agentcore`` runtime target.

    Clients are made per call from the region of the deployment (the person's
    own credentials, as boto3 finds them), or are the ones given (a test).
    """

    id = AGENTCORE_TARGET_ID
    capabilities = TargetCapabilities(
        resume=True, pause=False, a2a=False, gpu=False, customer_account=True
    )

    def __init__(
        self,
        control_client: Any = None,
        data_client: Any = None,
        *,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
        ready_timeout: float = READY_TIMEOUT_SECONDS,
        poll_seconds: float = READY_POLL_SECONDS,
    ) -> None:
        self._control_client = control_client
        self._data_client = data_client
        self._sleep = sleep
        self._clock = clock
        self._ready_timeout = ready_timeout
        self._poll_seconds = poll_seconds

    def _control(self, region: str) -> Any:
        return self._control_client or _client("bedrock-agentcore-control", region)

    def _data(self, region: str) -> Any:
        return self._data_client or _client("bedrock-agentcore", region)

    def create_request(
        self, spec: Any, settings: AgentCoreDeploySettings
    ) -> Dict[str, Any]:
        """The ``create_agent_runtime`` parameters for an agentspec."""
        spec_id = spec_id_of(spec)
        for what, value in (
            ("image URI", settings.image_uri),
            ("execution role ARN", settings.role_arn),
            ("region", settings.region),
        ):
            if not value.strip():
                raise ValueError(f"No {what}: a deployment to AgentCore needs one.")
        name = settings.name or runtime_name_for(spec_id)
        if not RUNTIME_NAME.fullmatch(name):
            raise ValueError(
                f"{name!r} is not an agent runtime name: a letter, then up to 47 "
                "letters, digits or underscores."
            )
        overridden = sorted(
            {SPEC_ENV, TARGET_ENV, *RUNTIME_ENV} & set(settings.environment)
        )
        if overridden:
            raise ValueError(
                f"{', '.join(overridden)} is set by the deployment itself, never by its settings."
            )
        request: Dict[str, Any] = {
            "agentRuntimeName": name,
            "agentRuntimeArtifact": {
                "containerConfiguration": {"containerUri": settings.image_uri}
            },
            "roleArn": settings.role_arn,
            "networkConfiguration": {"networkMode": settings.network_mode},
            "protocolConfiguration": {"serverProtocol": "AGUI"},
            "environmentVariables": {
                **dict(settings.environment),
                SPEC_ENV: spec_id,
                TARGET_ENV: AGENTCORE_TARGET_ID,
            },
        }
        if settings.description:
            request["description"] = settings.description
        if settings.authorizer is not None:
            request["authorizerConfiguration"] = settings.authorizer.configuration()
            # Each invocation's bearer is exchanged at IAM inside the runtime
            # once it knows its own ARN: it must also know where IAM is, or it
            # refuses to start (10 November 2026: a deploy from `loop` failed so).
            # AgentCore passes no header through unless it is allowlisted: the
            # bearer it validated is what the runtime exchanges at IAM
            # (10 November 2026: without it every invocation answered 401).
            request["requestHeaderConfiguration"] = {
                "requestHeaderAllowlist": ["Authorization"]
            }
            iam = iam_url_of(settings.authorizer.discovery_url)
            if iam and IAM_URL_VARIABLE not in request["environmentVariables"]:
                request["environmentVariables"][IAM_URL_VARIABLE] = iam
        if settings.client_token:
            request["clientToken"] = settings.client_token
        return request

    def update_request(
        self, request: Mapping[str, Any], runtime_id: str, arn: str, region: str
    ) -> Dict[str, Any]:
        """Return the ``update_agent_runtime`` parameters that tell a runtime who it is.

        AgentCore names the runtime only once it is created: the update sends
        the create's configuration again (the artifact and the role are
        required), with ``AGENTCORE_RUNTIME_ARN`` and ``AGENTCORE_RUNTIME_URL``
        in the environment and the ARN among the authorizer's audiences, so a
        token made for another runtime is refused.
        """
        update: Dict[str, Any] = {
            key: value
            for key, value in request.items()
            if key not in ("agentRuntimeName", "clientToken")
        }
        update["agentRuntimeId"] = runtime_id
        authorizer = (request.get("authorizerConfiguration") or {}).get(
            "customJWTAuthorizer"
        )
        update["environmentVariables"] = {
            **dict(request["environmentVariables"]),
            RUNTIME_URL_VARIABLE: runtime_url_of(arn, region),
        }
        if authorizer is not None:
            # Its ARN turns on the exchange of each invocation's bearer at IAM:
            # only a runtime behind Datalayer's JWT authorizer has one. A SigV4
            # runtime has no Datalayer token to exchange, and starts without.
            update["environmentVariables"][RUNTIME_ARN_VARIABLE] = arn
        if authorizer is not None:
            audience = list(authorizer.get("allowedAudience") or [])
            if arn not in audience:
                audience.append(arn)
            update["authorizerConfiguration"] = {
                "customJWTAuthorizer": {**authorizer, "allowedAudience": audience}
            }
        return update

    async def _ready(self, client: Any, runtime_id: str) -> None:
        """Wait until a created runtime is ``READY``; refuse when it failed or never is."""
        deadline = self._clock() + self._ready_timeout
        while True:
            answer = await asyncio.to_thread(
                client.get_agent_runtime, agentRuntimeId=runtime_id
            )
            status = answer["status"]
            if status == "READY":
                return
            if status != "CREATING":
                raise AgentCoreError(
                    f"The agent runtime {runtime_id} is {status}, not READY: "
                    f"{answer.get('failureReason') or 'AgentCore gave no reason'}."
                )
            if self._clock() >= deadline:
                raise AgentCoreError(
                    f"The agent runtime {runtime_id} was not READY within "
                    f"{int(self._ready_timeout)} seconds: it is not told its ARN."
                )
            await self._sleep(self._poll_seconds)

    async def deploy(self, spec: Any, settings: AgentCoreDeploySettings) -> Deployment:
        """Make the agentspec an agent runtime that knows its own ARN.

        ``create_agent_runtime``; once the runtime is ``READY``,
        ``update_agent_runtime`` with its ARN and URL in the environment and
        the ARN as its authorizer's audience.
        """
        if not isinstance(settings, AgentCoreDeploySettings):
            raise TypeError(
                "The agentcore target is deployed with AgentCoreDeploySettings."
            )
        request = self.create_request(spec, settings)
        client = self._control(settings.region)
        created = await asyncio.to_thread(client.create_agent_runtime, **request)
        runtime_id = created["agentRuntimeId"]
        arn = created["agentRuntimeArn"]
        await self._ready(client, runtime_id)
        updated = await asyncio.to_thread(
            client.update_agent_runtime,
            **self.update_request(request, runtime_id, arn, settings.region),
        )
        workload = updated.get("workloadIdentityDetails") or created.get(
            "workloadIdentityDetails"
        )
        return Deployment(
            target=self.id,
            agent_spec_id=request["environmentVariables"][SPEC_ENV],
            id=runtime_id,
            arn=arn,
            version=updated["agentRuntimeVersion"],
            status=updated["status"],
            endpoint=settings.endpoint,
            workload_identity=(workload or {}).get("workloadIdentityArn", ""),
            region=settings.region,
        )

    async def status(self, deployment: Deployment) -> Dict[str, Any]:
        """``get_agent_runtime``: the agent runtime as AgentCore says it now."""
        client = self._control(deployment.region)
        answer = await asyncio.to_thread(
            client.get_agent_runtime, agentRuntimeId=deployment.id
        )
        deployment.status = answer["status"]
        deployment.version = answer["agentRuntimeVersion"]
        workload = (answer.get("workloadIdentityDetails") or {}).get(
            "workloadIdentityArn", ""
        )
        if workload:
            deployment.workload_identity = workload
        return {
            "id": answer["agentRuntimeId"],
            "arn": answer["agentRuntimeArn"],
            "name": answer["agentRuntimeName"],
            "version": answer["agentRuntimeVersion"],
            "status": answer["status"],
            "failure_reason": answer.get("failureReason", ""),
            "workload_identity": deployment.workload_identity,
        }

    async def invoke(
        self,
        deployment: Deployment,
        session_uid: str,
        run_input: Mapping[str, Any],
        bearer: str = "",
    ) -> AsyncIterator[Dict[str, Any]]:
        """One turn of a session; its AG-UI events.

        With ``bearer``, over HTTPS with that token, as a runtime behind a JWT
        authorizer takes it (Datalayer's: a token IAM signed for this runtime);
        otherwise ``invoke_agent_runtime``, signed with the caller's AWS
        credentials (SigV4), which such a runtime refuses.
        """
        if not deployment.arn:
            raise ValueError(
                f"The deployment {deployment.id!r} has no agent runtime ARN: it is invoked by it."
            )
        runtime_session_id = session_uid_to_agentcore(session_uid)
        if bearer:
            async for event in self._invoke_with_bearer(
                deployment, runtime_session_id, run_input, bearer
            ):
                yield event
            return
        client = self._data(deployment.region)
        try:
            answer = await asyncio.to_thread(
                client.invoke_agent_runtime,
                agentRuntimeArn=deployment.arn,
                qualifier=deployment.endpoint or DEFAULT_ENDPOINT,
                runtimeSessionId=runtime_session_id,
                payload=json.dumps(dict(run_input)).encode("utf-8"),
                contentType="application/json",
                accept="text/event-stream",
            )
        except Exception as error:  # botocore's ClientError, without importing it here
            message = str(
                getattr(error, "response", {}).get("Error", {}).get("Message") or error
            )
            if "authorization method mismatch" in message.lower():
                raise AgentCoreError(
                    f"The agent runtime {deployment.id} takes a bearer token, not AWS "
                    "credentials: invoke it with one its JWT authorizer accepts (--bearer)."
                ) from error
            raise
        content_type = str(answer.get("contentType") or "")
        body = answer["response"]
        if content_type.startswith("application/json"):
            yield json.loads(await asyncio.to_thread(body.read))
            return
        if not content_type.startswith("text/event-stream"):
            raise AgentCoreError(
                f"AgentCore answered {content_type or 'no content type'}: "
                "an AG-UI deployment streams text/event-stream."
            )
        lines = body.iter_lines()
        data: list[str] = []
        while True:
            line = await asyncio.to_thread(next, lines, None)
            if line is None:
                break
            text = line.decode("utf-8") if isinstance(line, bytes) else str(line)
            if not text:
                if data:
                    yield _event("\n".join(data))
                    data = []
                continue
            if text.startswith("data:"):
                data.append(text[5:].lstrip(" "))
        if data:
            yield _event("\n".join(data))

    async def _invoke_with_bearer(
        self,
        deployment: Deployment,
        runtime_session_id: str,
        run_input: Mapping[str, Any],
        bearer: str,
    ) -> AsyncIterator[Dict[str, Any]]:
        """The turn over HTTPS with a bearer token: AgentCore's invocations route, its SSE read."""
        import httpx  # noqa: PLC0415

        url = (
            f"https://bedrock-agentcore.{deployment.region}.amazonaws.com/runtimes/"
            f"{quote(deployment.arn or '', safe='')}/invocations"
        )
        headers = {
            "Authorization": f"Bearer {bearer}",
            SESSION_HEADER: runtime_session_id,
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(900.0, connect=30.0)
        ) as client:
            async with client.stream(
                "POST",
                url,
                params={"qualifier": deployment.endpoint or DEFAULT_ENDPOINT},
                headers=headers,
                json=dict(run_input),
            ) as response:
                if response.status_code != 200:
                    said = (await response.aread()).decode("utf-8", errors="replace")[
                        :300
                    ]
                    raise AgentCoreError(
                        f"AgentCore refused the invocation ({response.status_code}): {said}"
                    )
                data: list[str] = []
                async for text in response.aiter_lines():
                    if not text:
                        if data:
                            yield _event("\n".join(data))
                            data = []
                        continue
                    if text.startswith("data:"):
                        data.append(text[5:].lstrip(" "))
                if data:
                    yield _event("\n".join(data))

    async def stop(self, deployment: Deployment, session_uid: str) -> None:
        """``stop_runtime_session``: one session's microVM stopped."""
        runtime_session_id = session_uid_to_agentcore(session_uid)
        client = self._data(deployment.region)
        await asyncio.to_thread(
            client.stop_runtime_session,
            runtimeSessionId=runtime_session_id,
            agentRuntimeArn=deployment.arn,
            qualifier=deployment.endpoint or DEFAULT_ENDPOINT,
        )

    async def destroy(self, deployment: Deployment) -> None:
        """``delete_agent_runtime``: the agent runtime removed."""
        client = self._control(deployment.region)
        answer = await asyncio.to_thread(
            client.delete_agent_runtime, agentRuntimeId=deployment.id
        )
        deployment.status = answer["status"]


def _event(data: str) -> Dict[str, Any]:
    try:
        event = json.loads(data)
    except ValueError:
        raise AgentCoreError(
            f"AgentCore streamed an event that is not JSON: {data[:200]!r}."
        ) from None
    if not isinstance(event, dict):
        raise AgentCoreError(
            f"AgentCore streamed an event that is not an object: {data[:200]!r}."
        )
    return event


#: The contribution.
AGENTCORE_TARGET = AgentCoreTarget()


__all__ = [
    "AGENTCORE_TARGET",
    "AGENTCORE_TARGET_ID",
    "DEFAULT_ENDPOINT",
    "SPEC_ENV",
    "TARGET_ENV",
    "AgentCoreError",
    "AgentCoreDeploySettings",
    "AgentCoreTarget",
    "JwtAuthorizer",
    "runtime_name_for",
    "spec_id_of",
]
