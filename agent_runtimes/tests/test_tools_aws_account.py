# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The AWS account readers: the read role assumed with the external id, every
call a read, paginated, answered in the evidence shape; AWS stubbed, never
called.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any, Dict, List

import boto3
import pytest
from botocore.stub import ANY, Stubber

from agent_runtimes.tools import aws_account

ROLE = "arn:aws:iam::123456789012:role/datalayer-steward-read"
EXTERNAL = "org-external-id-0123456789"


@pytest.fixture(autouse=True)
def _connected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(aws_account.ROLE_ARN_ENV, ROLE)
    monkeypatch.setenv(aws_account.EXTERNAL_ID_ENV, EXTERNAL)
    monkeypatch.setenv("AWS_REGION", "eu-west-1")
    aws_account.forget_credentials()
    yield
    aws_account.forget_credentials()


class _Stubs:
    """Real botocore clients with fake credentials, each behind a Stubber."""

    def __init__(self) -> None:
        self.stubbers: Dict[str, Stubber] = {}
        self.clients: Dict[str, Any] = {}
        self.made: List[Dict[str, Any]] = []

    def client(self, service: str, region: str = "us-east-1") -> Stubber:
        if service not in self.clients:
            client = boto3.client(
                service,
                region_name=region,
                aws_access_key_id="fake",
                aws_secret_access_key="fake",
            )
            self.clients[service] = client
            self.stubbers[service] = Stubber(client)
            self.stubbers[service].activate()
        return self.stubbers[service]

    def factory(self, service: str, region: str, **credentials: Any) -> Any:
        self.made.append({"service": service, "region": region, **credentials})
        self.client(service, region)
        return self.clients[service]

    def done(self) -> None:
        for stubber in self.stubbers.values():
            stubber.assert_no_pending_responses()


@pytest.fixture
def stubs(monkeypatch: pytest.MonkeyPatch) -> _Stubs:
    stubs = _Stubs()
    stubs.client("sts").add_response(
        "assume_role",
        {
            "Credentials": {
                "AccessKeyId": "ASIAREADONLYEXAMPLE",
                "SecretAccessKey": "secret-example",
                "SessionToken": "session-token-example",
                "Expiration": dt.datetime.now(dt.timezone.utc)
                + dt.timedelta(minutes=15),
            }
        },
        {
            "RoleArn": ROLE,
            "RoleSessionName": aws_account.SESSION_NAME,
            "ExternalId": EXTERNAL,
            "DurationSeconds": aws_account.SESSION_SECONDS,
        },
    )
    monkeypatch.setattr(aws_account, "_boto_client", stubs.factory)
    return stubs


def test_every_reader_declares_reads_only() -> None:
    for reader in aws_account.READERS:
        assert reader.operations
        assert all(aws_account.READ_OPERATION.match(op) for op in reader.operations)


@pytest.mark.parametrize(
    "operation",
    [
        "CreateAnomalyMonitor",
        "DeleteRecommendation",
        "PutRecommendationPreferences",
        "UpdatePreferences",
        "Get",
    ],
)
def test_a_reader_given_a_write_refuses_to_start(operation: str) -> None:
    with pytest.raises(aws_account.WriteRefused, match="refuses to start"):
        aws_account.Reader("ce", "ce", ("GetCostAndUsage", operation))


def test_an_operation_the_reader_did_not_declare_is_not_called(stubs: _Stubs) -> None:
    with pytest.raises(aws_account.WriteRefused, match="does not call"):
        aws_account.read(
            aws_account.COST_EXPLORER,
            "GetCostForecast",
            {},
            "x",
            None,
            region="us-east-1",
            max_items=10,
        )
    # Refused before any credential was asked for.
    assert stubs.made == []


def test_not_connected_reads_nothing_and_says_so(
    monkeypatch: pytest.MonkeyPatch, stubs: _Stubs
) -> None:
    monkeypatch.delenv(aws_account.EXTERNAL_ID_ENV)
    answer = asyncio.run(aws_account.aws_cost_optimization_hub())
    assert isinstance(answer, str)
    assert "not connected" in answer and aws_account.EXTERNAL_ID_ENV in answer
    assert stubs.made == []


def test_cost_optimization_hub_paginated_with_the_read_role(stubs: _Stubs) -> None:
    hub = stubs.client("cost-optimization-hub")
    first = {
        "recommendationId": "r1",
        "accountId": "123456789012",
        "region": "eu-west-1",
        "resourceArn": "arn:aws:ec2:eu-west-1:123456789012:instance/i-1",
        "actionType": "Rightsize",
        "estimatedMonthlySavings": 42.5,
        "currencyCode": "USD",
        "lastRefreshTimestamp": dt.datetime(2026, 11, 10, tzinfo=dt.timezone.utc),
    }
    hub.add_response(
        "list_recommendations",
        {"items": [first], "nextToken": "page2"},
        {
            "orderBy": {"dimension": "EstimatedMonthlySavings", "order": "Desc"},
            "maxResults": 100,
            "filter": {"actionTypes": ["Rightsize", "Stop"]},
        },
    )
    hub.add_response(
        "list_recommendations",
        {
            "items": [
                {**first, "recommendationId": "r2", "estimatedMonthlySavings": 10.0}
            ]
        },
        {
            "orderBy": ANY,
            "maxResults": 100,
            "filter": ANY,
            "nextToken": "page2",
        },
    )
    answer = asyncio.run(
        aws_account.aws_cost_optimization_hub(action_types="Rightsize, Stop")
    )
    stubs.done()
    assert answer["source"] == "cost-optimization-hub"
    assert answer["call"] == "ListRecommendations"
    assert answer["region"] == "us-east-1" and answer["pages"] == 2
    assert [item["recommendationId"] for item in answer["items"]] == ["r1", "r2"]
    assert answer["items"][0]["lastRefreshTimestamp"] == "2026-11-10T00:00:00+00:00"
    assert answer["read_at"] and answer["truncated"] is False
    hub_client = next(
        made for made in stubs.made if made["service"] == "cost-optimization-hub"
    )
    assert hub_client["aws_access_key_id"] == "ASIAREADONLYEXAMPLE"
    assert hub_client["aws_session_token"] == "session-token-example"


def test_compute_optimizer_cut_at_max_items_says_truncated(stubs: _Stubs) -> None:
    optimizer = stubs.client("compute-optimizer", "eu-west-1")
    optimizer.add_response(
        "get_ebs_volume_recommendations",
        {
            "volumeRecommendations": [
                {
                    "volumeArn": f"arn:aws:ec2:eu-west-1:1:volume/v-{n}",
                    "finding": "NotOptimized",
                }
                for n in range(3)
            ],
            "nextToken": "more",
        },
        {"maxResults": 100},
    )
    answer = asyncio.run(aws_account.aws_compute_optimizer(resource="ebs", max_items=2))
    stubs.done()
    assert answer["call"] == "GetEBSVolumeRecommendations"
    assert answer["region"] == "eu-west-1"
    assert len(answer["items"]) == 2 and answer["truncated"] is True


def test_compute_optimizer_refuses_an_unknown_resource(stubs: _Stubs) -> None:
    answer = asyncio.run(aws_account.aws_compute_optimizer(resource="s3"))
    assert "not a resource" in answer and stubs.made == []


def test_cost_explorer_spend_by_service_and_aws_errors_in_a_sentence(
    stubs: _Stubs,
) -> None:
    ce = stubs.client("ce")
    ce.add_response(
        "get_cost_and_usage",
        {
            "ResultsByTime": [
                {
                    "TimePeriod": {"Start": "2026-10-01", "End": "2026-11-01"},
                    "Groups": [
                        {
                            "Keys": ["Amazon EC2"],
                            "Metrics": {
                                "UnblendedCost": {"Amount": "812.4", "Unit": "USD"}
                            },
                        }
                    ],
                }
            ],
            "GroupDefinitions": [{"Type": "DIMENSION", "Key": "SERVICE"}],
        },
        {
            "TimePeriod": {"Start": "2026-10-01", "End": "2026-11-01"},
            "Granularity": "MONTHLY",
            "Metrics": ["UnblendedCost"],
            "GroupBy": [{"Type": "DIMENSION", "Key": "SERVICE"}],
        },
    )
    answer = asyncio.run(
        aws_account.aws_cost_explorer(start="2026-10-01", end="2026-11-01")
    )
    assert answer["call"] == "GetCostAndUsage" and answer["pages"] == 1
    assert answer["items"][0]["Groups"][0]["Keys"] == ["Amazon EC2"]
    assert answer["extra"]["GroupDefinitions"][0]["Key"] == "SERVICE"
    ce.add_client_error(
        "get_anomalies",
        service_error_code="AccessDeniedException",
        service_message="not authorized to perform ce:GetAnomalies",
    )
    refused = asyncio.run(aws_account.aws_cost_explorer(view="anomalies"))
    stubs.done()
    assert refused.startswith("AWS refused the read (AccessDeniedException)")


@pytest.mark.parametrize(
    ("kwargs", "said"),
    [
        ({"view": "forecast"}, "not a Cost Explorer view"),
        ({"group_by": "COLOR"}, "not a grouping"),
        ({"granularity": "HOURLY"}, "not a granularity"),
        ({"start": "2026-11-02", "end": "2026-11-01"}, "not before it ends"),
    ],
)
def test_cost_explorer_refuses_a_wrong_parameter_before_reading(
    stubs: _Stubs, kwargs: Dict[str, Any], said: str
) -> None:
    answer = asyncio.run(aws_account.aws_cost_explorer(**kwargs))
    assert said in answer and stubs.made == []


def test_the_assumed_session_is_reused(stubs: _Stubs) -> None:
    ce = stubs.client("ce")
    for _ in range(2):
        ce.add_response(
            "get_savings_plans_utilization",
            {
                "SavingsPlansUtilizationsByTime": [],
                "Total": {"Utilization": {"UtilizationPercentage": "91.0"}},
            },
            None,
        )
    asyncio.run(aws_account.aws_cost_explorer(view="savings_plans_utilization"))
    asyncio.run(aws_account.aws_cost_explorer(view="savings_plans_utilization"))
    # One assume_role response was stubbed: a second would have failed.
    stubs.done()


# ---------------------------------------------------------------------------
# The agent's firewall egress: the exact hosts the tools reach.
# ---------------------------------------------------------------------------


def _spec_egress() -> List[str]:
    from agent_runtimes.specs.agents import get_agent_spec

    spec = get_agent_spec("worker-steward-aws")
    assert spec is not None and spec.policy is not None
    return list(spec.policy["shield"]["egress"])


def test_the_agentspec_names_no_wildcard_host() -> None:
    egress = _spec_egress()
    assert egress and not any("*" in entry for entry in egress), egress


def test_the_agentspec_egress_is_what_the_tools_reach() -> None:
    platform = ["r1.datalayer.run:443", "prod1.datalayer.run:443"]
    assert _spec_egress() == aws_account.egress_hosts() + platform


def test_every_endpoint_boto3_calls_is_in_the_egress() -> None:
    allowed = {entry.rsplit(":", 1)[0] for entry in aws_account.egress_hosts()}
    calls = [
        ("ce", aws_account.GLOBAL_REGION),
        ("cost-optimization-hub", aws_account.GLOBAL_REGION),
    ]
    for region in aws_account.ACCOUNT_REGIONS:
        calls += [("sts", region), ("compute-optimizer", region)]
    for service, region in calls:
        client = boto3.client(
            service,
            region_name=region,
            aws_access_key_id="fake",
            aws_secret_access_key="fake",
        )
        host = client.meta.endpoint_url.removeprefix("https://")
        assert host in allowed, (service, region, host)


def test_the_shields_firewall_takes_the_egress() -> None:
    firewall = pytest.importorskip("agent_shield.firewall.model")
    rules = firewall.FirewallRules(egress=_spec_egress())
    assert not rules.open_egress


def test_compute_optimizer_refuses_a_region_outside_the_egress(stubs: _Stubs) -> None:
    answer = asyncio.run(
        aws_account.aws_compute_optimizer(resource="ec2", region="me-central-1")
    )
    assert "not a region this agent reads" in answer and stubs.made == []


def test_the_role_is_not_assumed_from_a_region_outside_the_egress(
    monkeypatch: pytest.MonkeyPatch, stubs: _Stubs
) -> None:
    monkeypatch.setenv("AWS_REGION", "af-south-1")
    answer = asyncio.run(aws_account.aws_cost_optimization_hub())
    assert "af-south-1 is not a region this agent reads" in answer and stubs.made == []
