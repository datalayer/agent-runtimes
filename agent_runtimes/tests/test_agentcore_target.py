# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `agentcore` runtime target (AC-10) and `loop agentcore` (AC-11),
against stubbed boto3 clients: every call's parameters asserted.
"""

from __future__ import annotations

import asyncio
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import pytest

boto3 = pytest.importorskip("boto3")
from botocore.exceptions import UnknownServiceError  # noqa: E402
from botocore.response import StreamingBody  # noqa: E402
from botocore.stub import Stubber  # noqa: E402

try:
    boto3.client("bedrock-agentcore-control", region_name="us-east-1")
    boto3.client("bedrock-agentcore", region_name="us-east-1")
except UnknownServiceError:  # pragma: no cover - an older botocore
    pytest.skip("botocore has no AgentCore service model", allow_module_level=True)

from typer.testing import CliRunner  # noqa: E402

from agent_runtimes.agentcore.session_ids import PADDING  # noqa: E402
from agent_runtimes.agentcore.target import (  # noqa: E402
    AgentCoreDeploySettings,
    AgentCoreError,
    AgentCoreTarget,
    JwtAuthorizer,
    runtime_name_for,
)
from agent_runtimes.commands import agentcore as agentcore_cli  # noqa: E402
from agent_runtimes.plugins.points import Deployment  # noqa: E402

REGION = "us-east-1"
ARN = "arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/datalayer_crawler-AbCdEf1234"
RUNTIME_ID = "datalayer_crawler-AbCdEf1234"
IMAGE = "111122223333.dkr.ecr.us-east-1.amazonaws.com/agent-runtimes:1.5.128"
ROLE = "arn:aws:iam::111122223333:role/AgentCoreRuntime"
WORKLOAD = "arn:aws:bedrock-agentcore:us-east-1:111122223333:workload-identity-directory/default/workload-identity/datalayer_crawler"
SESSION = "0123456789abcdef0123456789abcdef"
NOW = datetime(2026, 11, 9, tzinfo=timezone.utc)


def _client(service: str) -> Any:
    return boto3.client(
        service,
        region_name=REGION,
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


@pytest.fixture()
def control() -> Iterator[tuple[Any, Stubber]]:
    client = _client("bedrock-agentcore-control")
    with Stubber(client) as stub:
        yield client, stub
        stub.assert_no_pending_responses()


@pytest.fixture()
def data() -> Iterator[tuple[Any, Stubber]]:
    client = _client("bedrock-agentcore")
    with Stubber(client) as stub:
        yield client, stub
        stub.assert_no_pending_responses()


def _deployment() -> Deployment:
    return Deployment(
        target="agentcore",
        agent_spec_id="crawler",
        id=RUNTIME_ID,
        arn=ARN,
        version="1",
        status="READY",
        endpoint="DEFAULT",
        region=REGION,
    )


def _settings(**changes: Any) -> AgentCoreDeploySettings:
    values: dict[str, Any] = {"image_uri": IMAGE, "role_arn": ROLE, "region": REGION}
    values.update(changes)
    return AgentCoreDeploySettings(**values)


def _created() -> dict[str, Any]:
    return {
        "agentRuntimeArn": ARN,
        "agentRuntimeId": RUNTIME_ID,
        "agentRuntimeVersion": "1",
        "createdAt": NOW,
        "status": "CREATING",
        "workloadIdentityDetails": {"workloadIdentityArn": WORKLOAD},
    }


def _got(status: str, name: str = "datalayer_crawler", **more: Any) -> dict[str, Any]:
    return {
        "agentRuntimeArn": ARN,
        "agentRuntimeName": name,
        "agentRuntimeId": RUNTIME_ID,
        "agentRuntimeVersion": "1",
        "createdAt": NOW,
        "lastUpdatedAt": NOW,
        "roleArn": ROLE,
        "status": status,
        "lifecycleConfiguration": {},
        **more,
    }


def _updated() -> dict[str, Any]:
    return {
        "agentRuntimeArn": ARN,
        "agentRuntimeId": RUNTIME_ID,
        "agentRuntimeVersion": "2",
        "createdAt": NOW,
        "lastUpdatedAt": NOW,
        "status": "UPDATING",
    }


RUNTIME_URL = (
    "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/"
    "arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A111122223333%3Aruntime%2F"
    "datalayer_crawler-AbCdEf1234/invocations/"
)


def _sse(*events: dict[str, Any]) -> StreamingBody:
    raw = "".join(f"data: {json.dumps(event)}\n\n" for event in events).encode()
    return StreamingBody(io.BytesIO(raw), len(raw))


def _authorizer(audience: list[str] | None) -> dict[str, Any]:
    authorizer: dict[str, Any] = {
        "discoveryUrl": "https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration",
    }
    if audience is not None:
        authorizer["allowedAudience"] = audience
    authorizer["allowedClients"] = ["datalayer-platform"]
    authorizer["customClaims"] = [
        {
            "inboundTokenClaimName": "org_uid",
            "inboundTokenClaimValueType": "STRING",
            "authorizingClaimMatchValue": {
                "claimMatchValue": {"matchValueString": "org-1"},
                "claimMatchOperator": "EQUALS",
            },
        }
    ]
    return {"customJWTAuthorizer": authorizer}


def test_deploy_creates_an_agui_runtime_then_tells_it_its_arn_and_audience(
    control,
) -> None:
    client, stub = control
    created_with = {
        "agentRuntimeArtifact": {"containerConfiguration": {"containerUri": IMAGE}},
        "roleArn": ROLE,
        "networkConfiguration": {"networkMode": "PUBLIC"},
        "protocolConfiguration": {"serverProtocol": "AGUI"},
        "description": "The Crawler",
    }
    stub.add_response(
        "create_agent_runtime",
        _created(),
        {
            "agentRuntimeName": "datalayer_crawler",
            **created_with,
            "environmentVariables": {
                "LOG_LEVEL": "INFO",
                "AGENT_SPEC_ID": "crawler",
                "AGENT_RUNTIMES_TARGET": "agentcore",
                # Told where IAM is, read from the authorizer's discovery URL.
                "DATALAYER_IAM_URL": "https://prod1.datalayer.run",
            },
            "authorizerConfiguration": _authorizer(None),
            "clientToken": "deploy-crawler-0000000000000000000000",
        },
    )
    stub.add_response(
        "get_agent_runtime", _got("CREATING"), {"agentRuntimeId": RUNTIME_ID}
    )
    stub.add_response(
        "get_agent_runtime", _got("READY"), {"agentRuntimeId": RUNTIME_ID}
    )
    stub.add_response(
        "update_agent_runtime",
        _updated(),
        {
            "agentRuntimeId": RUNTIME_ID,
            **created_with,
            "environmentVariables": {
                "LOG_LEVEL": "INFO",
                "AGENT_SPEC_ID": "crawler",
                "AGENT_RUNTIMES_TARGET": "agentcore",
                "DATALAYER_IAM_URL": "https://prod1.datalayer.run",
                "AGENTCORE_RUNTIME_URL": RUNTIME_URL,
                "AGENTCORE_RUNTIME_ARN": ARN,
            },
            "authorizerConfiguration": _authorizer([ARN]),
        },
    )
    settings = _settings(
        description="The Crawler",
        environment={"LOG_LEVEL": "INFO"},
        authorizer=JwtAuthorizer(
            discovery_url="https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration",
            allowed_clients=("datalayer-platform",),
            custom_claims={"org_uid": "org-1"},
        ),
        client_token="deploy-crawler-0000000000000000000000",
    )
    slept: list[float] = []

    async def sleep(seconds: float) -> None:
        slept.append(seconds)

    deployment = asyncio.run(
        AgentCoreTarget(control_client=client, sleep=sleep).deploy(
            {"id": "crawler"}, settings
        )
    )
    assert slept == [5.0]
    assert deployment == Deployment(
        target="agentcore",
        agent_spec_id="crawler",
        id=RUNTIME_ID,
        arn=ARN,
        version="2",
        status="UPDATING",
        endpoint="DEFAULT",
        workload_identity=WORKLOAD,
        region=REGION,
    )


def test_deploy_refuses_a_runtime_that_failed_or_is_never_ready(control) -> None:
    client, stub = control
    stub.add_response("create_agent_runtime", _created())
    stub.add_response(
        "get_agent_runtime",
        _got("CREATE_FAILED", failureReason="the image is not arm64"),
        {"agentRuntimeId": RUNTIME_ID},
    )
    with pytest.raises(
        AgentCoreError, match="CREATE_FAILED, not READY: the image is not arm64"
    ):
        asyncio.run(
            AgentCoreTarget(control_client=client).deploy("crawler", _settings())
        )

    now = [0.0]

    async def sleep(seconds: float) -> None:
        now[0] += seconds

    stub.add_response("create_agent_runtime", _created())
    for _ in range(3):
        stub.add_response(
            "get_agent_runtime", _got("CREATING"), {"agentRuntimeId": RUNTIME_ID}
        )
    target = AgentCoreTarget(
        control_client=client, sleep=sleep, clock=lambda: now[0], ready_timeout=10
    )
    with pytest.raises(AgentCoreError, match="was not READY within 10 seconds"):
        asyncio.run(target.deploy("crawler", _settings()))


def test_deploy_refuses_what_agentcore_would_and_what_the_deployment_sets_itself() -> (
    None
):
    target = AgentCoreTarget()
    with pytest.raises(
        ValueError, match="AGENT_SPEC_ID is set by the deployment itself"
    ):
        target.create_request(
            "crawler", _settings(environment={"AGENT_SPEC_ID": "other"})
        )
    with pytest.raises(
        ValueError, match="AGENTCORE_RUNTIME_ARN is set by the deployment itself"
    ):
        target.create_request(
            "crawler", _settings(environment={"AGENTCORE_RUNTIME_ARN": ARN})
        )
    with pytest.raises(ValueError, match="is not an agent runtime name"):
        target.create_request("crawler", _settings(name="9-lives"))
    with pytest.raises(ValueError, match="No execution role ARN"):
        target.create_request("crawler", _settings(role_arn=" "))
    with pytest.raises(ValueError, match="has no id"):
        target.create_request({"name": "no id"}, _settings())
    with pytest.raises(
        ValueError, match="must end in /.well-known/openid-configuration"
    ):
        target.create_request(
            "crawler",
            _settings(
                authorizer=JwtAuthorizer("https://iam.example", allowed_clients=("c",))
            ),
        )
    with pytest.raises(ValueError, match="names no audience and no client"):
        target.create_request(
            "crawler",
            _settings(
                authorizer=JwtAuthorizer(
                    "https://iam.example/.well-known/openid-configuration"
                )
            ),
        )
    with pytest.raises(TypeError, match="AgentCoreDeploySettings"):
        asyncio.run(target.deploy("crawler", {"image_uri": IMAGE}))
    assert (
        runtime_name_for("openrouter:anthropic/claude-x")
        == "datalayer_openrouter_anthropic_claude_x"
    )
    assert len(runtime_name_for("x" * 80)) == 48


def test_status_reads_the_runtime(control) -> None:
    client, stub = control
    stub.add_response(
        "get_agent_runtime",
        {
            "agentRuntimeArn": ARN,
            "agentRuntimeName": "datalayer_crawler",
            "agentRuntimeId": RUNTIME_ID,
            "agentRuntimeVersion": "2",
            "createdAt": NOW,
            "lastUpdatedAt": NOW,
            "roleArn": ROLE,
            "status": "READY",
            "lifecycleConfiguration": {},
            "workloadIdentityDetails": {"workloadIdentityArn": WORKLOAD},
        },
        {"agentRuntimeId": RUNTIME_ID},
    )
    deployment = _deployment()
    said = asyncio.run(AgentCoreTarget(control_client=client).status(deployment))
    assert said == {
        "id": RUNTIME_ID,
        "arn": ARN,
        "name": "datalayer_crawler",
        "version": "2",
        "status": "READY",
        "failure_reason": "",
        "workload_identity": WORKLOAD,
    }
    assert deployment.version == "2" and deployment.workload_identity == WORKLOAD


def _collect(
    target: AgentCoreTarget, run_input: dict[str, Any]
) -> list[dict[str, Any]]:
    async def run() -> list[dict[str, Any]]:
        return [
            event async for event in target.invoke(_deployment(), SESSION, run_input)
        ]

    return asyncio.run(run())


def test_invoke_sends_the_run_on_the_session_and_reads_the_event_stream(data) -> None:
    client, stub = data
    run_input = {
        "threadId": SESSION,
        "messages": [{"id": "m", "role": "user", "content": "hi"}],
    }
    events = [
        {"type": "RUN_STARTED", "threadId": SESSION, "runId": "r"},
        {"type": "TEXT_MESSAGE_CONTENT", "messageId": "a", "delta": "Hello"},
        {"type": "RUN_FINISHED", "threadId": SESSION, "runId": "r"},
    ]
    stub.add_response(
        "invoke_agent_runtime",
        {"contentType": "text/event-stream", "response": _sse(*events)},
        {
            "agentRuntimeArn": ARN,
            "qualifier": "DEFAULT",
            "runtimeSessionId": PADDING + SESSION,
            "payload": json.dumps(run_input).encode(),
            "contentType": "application/json",
            "accept": "text/event-stream",
        },
    )
    assert _collect(AgentCoreTarget(data_client=client), run_input) == events


def test_invoke_reads_a_json_answer_and_refuses_what_is_neither(data) -> None:
    client, stub = data
    body = b'{"answer": "done"}'
    params = {
        "agentRuntimeArn": ARN,
        "qualifier": "DEFAULT",
        "runtimeSessionId": PADDING + SESSION,
        "payload": b"{}",
        "contentType": "application/json",
        "accept": "text/event-stream",
    }
    stub.add_response(
        "invoke_agent_runtime",
        {
            "contentType": "application/json",
            "response": StreamingBody(io.BytesIO(body), len(body)),
        },
        params,
    )
    stub.add_response(
        "invoke_agent_runtime",
        {"contentType": "text/plain", "response": StreamingBody(io.BytesIO(b"x"), 1)},
        params,
    )
    stub.add_response(
        "invoke_agent_runtime",
        {
            "contentType": "text/event-stream",
            "response": StreamingBody(io.BytesIO(b"data: nope\n\n"), 12),
        },
        params,
    )
    target = AgentCoreTarget(data_client=client)
    assert _collect(target, {}) == [{"answer": "done"}]
    with pytest.raises(AgentCoreError, match="answered text/plain"):
        _collect(target, {})
    with pytest.raises(AgentCoreError, match="not JSON"):
        _collect(target, {})


def test_invoke_refuses_a_session_uid_that_is_not_one() -> None:
    events = AgentCoreTarget(data_client=object()).invoke(_deployment(), "bad uid!", {})
    with pytest.raises(ValueError, match="is not a session uid"):
        asyncio.run(events.__anext__())


def test_stop_and_destroy(control, data) -> None:
    control_client, control_stub = control
    data_client, data_stub = data
    data_stub.add_response(
        "stop_runtime_session",
        {"runtimeSessionId": PADDING + SESSION, "statusCode": 200},
        {
            "runtimeSessionId": PADDING + SESSION,
            "agentRuntimeArn": ARN,
            "qualifier": "DEFAULT",
        },
    )
    control_stub.add_response(
        "delete_agent_runtime",
        {"status": "DELETING", "agentRuntimeId": RUNTIME_ID},
        {"agentRuntimeId": RUNTIME_ID},
    )
    target = AgentCoreTarget(control_client=control_client, data_client=data_client)
    deployment = _deployment()
    asyncio.run(target.stop(deployment, SESSION))
    asyncio.run(target.destroy(deployment))
    assert deployment.status == "DELETING"


# --- loop agentcore -------------------------------------------------------------


@pytest.fixture()
def cli(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, control, data):
    control_client, control_stub = control
    data_client, data_stub = data
    monkeypatch.setenv(agentcore_cli.STATE_ENV, str(tmp_path / "agentcore.json"))
    monkeypatch.setattr(
        agentcore_cli,
        "_target",
        lambda: AgentCoreTarget(control_client=control_client, data_client=data_client),
    )
    return CliRunner(), control_stub, data_stub, tmp_path / "agentcore.json"


def test_loop_agentcore_deploy_status_invoke_sessions_destroy(cli) -> None:
    from agent_runtimes.__main__ import app

    runner, control_stub, data_stub, state = cli
    spec = "example-simple"
    control_stub.add_response(
        "create_agent_runtime",
        _created(),
        {
            "agentRuntimeName": "datalayer_example_simple",
            "agentRuntimeArtifact": {"containerConfiguration": {"containerUri": IMAGE}},
            "roleArn": ROLE,
            "networkConfiguration": {"networkMode": "PUBLIC"},
            "protocolConfiguration": {"serverProtocol": "AGUI"},
            "environmentVariables": {
                "AGENT_SPEC_ID": spec,
                "AGENT_RUNTIMES_TARGET": "agentcore",
            },
        },
    )
    control_stub.add_response(
        "get_agent_runtime",
        _got("READY", "datalayer_example_simple"),
        {"agentRuntimeId": RUNTIME_ID},
    )
    control_stub.add_response(
        "update_agent_runtime",
        _updated(),
        {
            "agentRuntimeId": RUNTIME_ID,
            "agentRuntimeArtifact": {"containerConfiguration": {"containerUri": IMAGE}},
            "roleArn": ROLE,
            "networkConfiguration": {"networkMode": "PUBLIC"},
            "protocolConfiguration": {"serverProtocol": "AGUI"},
            "environmentVariables": {
                "AGENT_SPEC_ID": spec,
                "AGENT_RUNTIMES_TARGET": "agentcore",
                # No authorizer, no Datalayer token to exchange: no ARN.
                "AGENTCORE_RUNTIME_URL": RUNTIME_URL,
            },
        },
    )
    deployed = runner.invoke(
        app,
        [
            "agentcore",
            "deploy",
            spec,
            "--image",
            IMAGE,
            "--role-arn",
            ROLE,
            "--region",
            REGION,
        ],
    )
    assert deployed.exit_code == 0, deployed.output
    assert f"example-simple deployed as {ARN} (UPDATING)." in deployed.output
    assert (
        json.loads(state.read_text())["deployments"][spec]["deployment"]["arn"] == ARN
    )

    again = runner.invoke(
        app,
        [
            "agentcore",
            "deploy",
            spec,
            "--image",
            IMAGE,
            "--role-arn",
            ROLE,
            "--region",
            REGION,
        ],
    )
    assert again.exit_code == 1 and "already deployed" in again.output

    control_stub.add_response(
        "get_agent_runtime",
        {
            "agentRuntimeArn": ARN,
            "agentRuntimeName": "datalayer_example_simple",
            "agentRuntimeId": RUNTIME_ID,
            "agentRuntimeVersion": "1",
            "createdAt": NOW,
            "lastUpdatedAt": NOW,
            "roleArn": ROLE,
            "status": "READY",
            "lifecycleConfiguration": {},
        },
        {"agentRuntimeId": RUNTIME_ID},
    )
    status = runner.invoke(app, ["agentcore", "status", spec])
    assert status.exit_code == 0, status.output
    assert f"example-simple: READY — {ARN} (version 1)" in status.output

    from botocore.stub import ANY

    data_stub.add_response(
        "invoke_agent_runtime",
        {
            "contentType": "text/event-stream",
            "response": _sse(
                {"type": "RUN_STARTED"},
                {"type": "TEXT_MESSAGE_CONTENT", "delta": "Hello"},
                {"type": "RUN_FINISHED"},
            ),
        },
        {
            "agentRuntimeArn": ARN,
            "qualifier": "DEFAULT",
            "runtimeSessionId": PADDING + SESSION,
            "payload": ANY,
            "contentType": "application/json",
            "accept": "text/event-stream",
        },
    )
    invoked = runner.invoke(
        app, ["agentcore", "invoke", spec, "hi", "--session", SESSION]
    )
    assert invoked.exit_code == 0, invoked.output
    assert "Hello" in invoked.output and f"Session {SESSION}." in invoked.output

    listed = runner.invoke(app, ["agentcore", "sessions", spec])
    assert listed.exit_code == 0 and SESSION in listed.output

    data_stub.add_response(
        "stop_runtime_session",
        {"runtimeSessionId": PADDING + SESSION},
        {
            "runtimeSessionId": PADDING + SESSION,
            "agentRuntimeArn": ARN,
            "qualifier": "DEFAULT",
        },
    )
    stopped = runner.invoke(app, ["agentcore", "sessions", spec, "--stop", SESSION])
    assert stopped.exit_code == 0 and f"Session {SESSION} stopped." in stopped.output
    unknown = runner.invoke(app, ["agentcore", "sessions", spec, "--stop", "f" * 32])
    assert unknown.exit_code == 1 and "is not a session invoked" in unknown.output

    control_stub.add_response(
        "delete_agent_runtime", {"status": "DELETING"}, {"agentRuntimeId": RUNTIME_ID}
    )
    destroyed = runner.invoke(app, ["agentcore", "destroy", spec])
    assert (
        destroyed.exit_code == 0
        and f"example-simple: {ARN} DELETING." in destroyed.output
    )
    assert json.loads(state.read_text())["deployments"] == {}
    gone = runner.invoke(app, ["agentcore", "status", spec])
    assert (
        gone.exit_code == 1 and "is not deployed to AgentCore from here" in gone.output
    )


def test_loop_agentcore_refuses_an_unknown_agentspec_and_a_lone_audience(cli) -> None:
    from agent_runtimes.__main__ import app

    runner, _, _, _ = cli
    base = ["--image", IMAGE, "--role-arn", ROLE, "--region", REGION]
    unknown = runner.invoke(app, ["agentcore", "deploy", "no-such-agentspec", *base])
    assert (
        unknown.exit_code == 1
        and "is not an agentspec of the catalogue" in unknown.output
    )
    lone = runner.invoke(
        app, ["agentcore", "deploy", "example-simple", *base, "--audience", ARN]
    )
    assert lone.exit_code == 1 and "give its --discovery-url" in lone.output


def test_iam_url_of_reads_only_datalayer_iams_discovery_document() -> None:
    from agent_runtimes.agentcore.target import iam_url_of

    assert (
        iam_url_of(
            "https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration"
        )
        == "https://prod1.datalayer.run"
    )
    assert (
        iam_url_of("https://login.example.com/.well-known/openid-configuration") == ""
    )
