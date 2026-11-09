# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agentcore`` runtime target (AC-10): an agentspec on AgentCore Runtime.

One container image serves every agentspec; a deployment is that image made
an AgentCore agent runtime with the agentspec's id in its environment
(``AGENT_SPEC_ID``, and ``AGENT_RUNTIMES_TARGET=agentcore`` so the runtime
knows where it runs and which identity provider it uses), speaking AG-UI
(``protocolConfiguration.serverProtocol = AGUI``), optionally behind a JWT
authorizer that trusts an OIDC issuer (Datalayer IAM, AWS_IDENTITY ID-02).

The calls, as botocore names them:

- ``bedrock-agentcore-control``: ``create_agent_runtime`` (deploy),
  ``get_agent_runtime`` (status), ``delete_agent_runtime`` (destroy);
- ``bedrock-agentcore``: ``invoke_agent_runtime`` (a turn; the answer read
  as ``text/event-stream``), ``stop_runtime_session`` (stop).

The person's own AWS credentials are used, as boto3 finds them; nothing here
holds a Datalayer account.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, Mapping, Optional, Sequence

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
DISCOVERY_SUFFIX = "/.well-known/openid-configuration"


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

    def __init__(self, control_client: Any = None, data_client: Any = None) -> None:
        self._control_client = control_client
        self._data_client = data_client

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
        overridden = sorted({SPEC_ENV, TARGET_ENV} & set(settings.environment))
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
        if settings.client_token:
            request["clientToken"] = settings.client_token
        return request

    async def deploy(self, spec: Any, settings: AgentCoreDeploySettings) -> Deployment:
        """``create_agent_runtime``: the agentspec made an agent runtime."""
        if not isinstance(settings, AgentCoreDeploySettings):
            raise TypeError(
                "The agentcore target is deployed with AgentCoreDeploySettings."
            )
        request = self.create_request(spec, settings)
        client = self._control(settings.region)
        answer = await asyncio.to_thread(client.create_agent_runtime, **request)
        return Deployment(
            target=self.id,
            agent_spec_id=request["environmentVariables"][SPEC_ENV],
            id=answer["agentRuntimeId"],
            arn=answer["agentRuntimeArn"],
            version=answer["agentRuntimeVersion"],
            status=answer["status"],
            endpoint=settings.endpoint,
            workload_identity=(answer.get("workloadIdentityDetails") or {}).get(
                "workloadIdentityArn", ""
            ),
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
        self, deployment: Deployment, session_uid: str, run_input: Mapping[str, Any]
    ) -> AsyncIterator[Dict[str, Any]]:
        """``invoke_agent_runtime``: one turn of a session; its AG-UI events."""
        if not deployment.arn:
            raise ValueError(
                f"The deployment {deployment.id!r} has no agent runtime ARN: it is invoked by it."
            )
        runtime_session_id = session_uid_to_agentcore(session_uid)
        client = self._data(deployment.region)
        answer = await asyncio.to_thread(
            client.invoke_agent_runtime,
            agentRuntimeArn=deployment.arn,
            qualifier=deployment.endpoint or DEFAULT_ENDPOINT,
            runtimeSessionId=runtime_session_id,
            payload=json.dumps(dict(run_input)).encode("utf-8"),
            contentType="application/json",
            accept="text/event-stream",
        )
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
