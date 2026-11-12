# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Read an AWS account's cost recommendations and spend, with a read-only role.

Datalayer Steward for AWS reads three of AWS's own cost sources:

- **Cost Optimization Hub** — AWS's consolidated cost recommendations, each
  with AWS's estimated monthly saving;
- **AWS Compute Optimizer** — right-sizing and idle findings for EC2, Auto
  Scaling groups, EBS, Lambda, ECS on Fargate and RDS;
- **AWS Cost Explorer** — spend by service, account, region or tag, Savings
  Plans and Reserved Instance coverage and utilization, Savings Plans purchase
  recommendations and cost anomalies.

Every call is made with the account's **read role**
(``aws/steward-read-role.yaml``), assumed from the runtime's own
credentials — on AgentCore, its execution role — with the organization's
external id: ``DATALAYER_AWS_ACCOUNT_READ_ROLE_ARN`` and
``DATALAYER_AWS_ACCOUNT_EXTERNAL_ID`` name them. Neither set, nothing is read
and the tool says so in a sentence: the runtime's own role is never used to
read the account.

Only operations named ``Get…``, ``List…`` or ``Describe…`` are ever called: a
reader declared with any other operation refuses to start (`WriteRefused`),
before any credential is asked for.

Each tool answers the shape a recommendation's evidence takes: its ``source``,
the ``call`` made, when it was read (``read_at``, UTC), the ``items`` read,
how many pages and whether the list was cut at ``max_items``.

Cost Explorer bills each API request (0.01 USD at the time of writing) to the
account it reads: the tool makes one request per page.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

#: The read role the tools assume, and the external id its trust requires.
ROLE_ARN_ENV = "DATALAYER_AWS_ACCOUNT_READ_ROLE_ARN"
EXTERNAL_ID_ENV = "DATALAYER_AWS_ACCOUNT_EXTERNAL_ID"

#: The session name the account's CloudTrail shows for each read.
SESSION_NAME = "datalayer-steward"

#: How long one assumed session lasts (seconds); renewed a minute before it ends.
SESSION_SECONDS = 900

#: The operations a reader may call: those that change nothing.
READ_OPERATION = re.compile(r"^(Get|List|Describe)[A-Z]")

#: The most items one tool call answers.
MAX_ITEMS = 500

#: Cost Optimization Hub and Cost Explorer answer from us-east-1 only.
GLOBAL_REGION = "us-east-1"

#: The regions the tools read and assume the role in: AWS's commercial regions
#: enabled by default. Compute Optimizer is read in one of them, STS is asked
#: in the runtime's own; another region is refused in a sentence, because the
#: agent's firewall allows these regions' endpoints only (`egress_hosts`).
ACCOUNT_REGIONS: Tuple[str, ...] = (
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "ca-central-1",
    "sa-east-1",
    "eu-central-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-north-1",
    "ap-south-1",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-northeast-3",
    "ap-southeast-1",
    "ap-southeast-2",
)

#: The port every AWS API endpoint is called on.
HTTPS_PORT = 443


class WriteRefused(ValueError):
    """A reader declared with an operation that is not a read."""


class NotConnected(RuntimeError):
    """The read role is not configured for this runtime."""


class RegionRefused(ValueError):
    """A region the tools do not read: its endpoints are outside the agent's egress."""


def egress_hosts(regions: Sequence[str] = ACCOUNT_REGIONS) -> List[str]:
    """The ``host:443`` entries the tools reach, for the agentspec's firewall egress.

    Cost Explorer and Cost Optimization Hub in us-east-1; STS and Compute
    Optimizer in each region of ``regions``. The agentspec
    ``worker-steward-aws`` lists exactly these (and the platform's own hosts);
    a test holds the two together.
    """
    hosts = [
        f"ce.{GLOBAL_REGION}.amazonaws.com",
        f"cost-optimization-hub.{GLOBAL_REGION}.amazonaws.com",
    ]
    for region in regions:
        hosts.append(f"sts.{region}.amazonaws.com")
        hosts.append(f"compute-optimizer.{region}.amazonaws.com")
    return [f"{host}:{HTTPS_PORT}" for host in hosts]


@dataclass(frozen=True)
class Reader:
    """One AWS service, read with the operations it declares and no other."""

    source: str
    service: str
    operations: Tuple[str, ...]

    def __post_init__(self) -> None:
        not_reads = [op for op in self.operations if not READ_OPERATION.match(op)]
        if not_reads:
            raise WriteRefused(
                f"The {self.source} reader refuses to start: {', '.join(not_reads)} "
                "is not a read (only Get…, List… and Describe… operations are called)."
            )

    def allows(self, operation: str) -> bool:
        return operation in self.operations


COST_OPTIMIZATION_HUB = Reader(
    "cost-optimization-hub",
    "cost-optimization-hub",
    ("ListRecommendations",),
)

COMPUTE_OPTIMIZER = Reader(
    "compute-optimizer",
    "compute-optimizer",
    (
        "GetEC2InstanceRecommendations",
        "GetAutoScalingGroupRecommendations",
        "GetEBSVolumeRecommendations",
        "GetLambdaFunctionRecommendations",
        "GetECSServiceRecommendations",
        "GetRDSDatabaseRecommendations",
        "GetIdleRecommendations",
    ),
)

COST_EXPLORER = Reader(
    "cost-explorer",
    "ce",
    (
        "GetCostAndUsage",
        "GetSavingsPlansCoverage",
        "GetSavingsPlansUtilization",
        "GetSavingsPlansPurchaseRecommendation",
        "GetReservationCoverage",
        "GetAnomalies",
    ),
)

#: Compute Optimizer's resources: the operation and the key its items come under.
COMPUTE_OPTIMIZER_RESOURCES: Dict[str, Tuple[str, str]] = {
    "ec2": ("GetEC2InstanceRecommendations", "instanceRecommendations"),
    "asg": ("GetAutoScalingGroupRecommendations", "autoScalingGroupRecommendations"),
    "ebs": ("GetEBSVolumeRecommendations", "volumeRecommendations"),
    "lambda": ("GetLambdaFunctionRecommendations", "lambdaFunctionRecommendations"),
    "ecs": ("GetECSServiceRecommendations", "ecsServiceRecommendations"),
    "rds": ("GetRDSDatabaseRecommendations", "rdsDBRecommendations"),
    "idle": ("GetIdleRecommendations", "idleRecommendations"),
}

#: Cost Explorer's views: operation, items key, next-token names (in, out).
COST_EXPLORER_VIEWS: Dict[str, Tuple[str, str, Optional[Tuple[str, str]]]] = {
    "spend": ("GetCostAndUsage", "ResultsByTime", ("NextPageToken", "NextPageToken")),
    "savings_plans_coverage": (
        "GetSavingsPlansCoverage",
        "SavingsPlansCoverages",
        ("NextToken", "NextToken"),
    ),
    "savings_plans_utilization": (
        "GetSavingsPlansUtilization",
        "SavingsPlansUtilizationsByTime",
        None,
    ),
    "savings_plans_purchase": (
        "GetSavingsPlansPurchaseRecommendation",
        "SavingsPlansPurchaseRecommendation",
        ("NextPageToken", "NextPageToken"),
    ),
    "reservation_coverage": (
        "GetReservationCoverage",
        "CoveragesByTime",
        ("NextPageToken", "NextPageToken"),
    ),
    "anomalies": ("GetAnomalies", "Anomalies", ("NextPageToken", "NextPageToken")),
}

#: What spend may be grouped by (a tag as ``TAG:<key>``).
SPEND_GROUPS = ("SERVICE", "LINKED_ACCOUNT", "REGION", "USAGE_TYPE")


# ---------------------------------------------------------------------------
# Credentials: the read role, assumed from the runtime's own.
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_cached: Dict[str, Any] = {}


def _boto_client(service: str, region: str, **credentials: Any) -> Any:
    import boto3

    return boto3.client(service, region_name=region, **credentials)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _role() -> Tuple[str, str]:
    arn = os.environ.get(ROLE_ARN_ENV, "").strip()
    external_id = os.environ.get(EXTERNAL_ID_ENV, "").strip()
    missing = [
        name
        for name, value in ((ROLE_ARN_ENV, arn), (EXTERNAL_ID_ENV, external_id))
        if not value
    ]
    if missing:
        raise NotConnected(
            "The AWS account is not connected to this agent: "
            f"{' and '.join(missing)} {'is' if len(missing) == 1 else 'are'} not set "
            "(the read role's ARN and the organization's external id, from the "
            "read role stack's outputs)."
        )
    return arn, external_id


def _credentials() -> Dict[str, str]:
    """The read role's credentials, assumed once and renewed before they end."""
    arn, external_id = _role()
    with _lock:
        held = _cached.get(arn)
        if held and held["expires"] - 60 > time.time():
            return held["credentials"]
        sts = _boto_client("sts", _region(""))
        answer = sts.assume_role(
            RoleArn=arn,
            RoleSessionName=SESSION_NAME,
            ExternalId=external_id,
            DurationSeconds=SESSION_SECONDS,
        )
        given = answer["Credentials"]
        credentials = {
            "aws_access_key_id": given["AccessKeyId"],
            "aws_secret_access_key": given["SecretAccessKey"],
            "aws_session_token": given["SessionToken"],
        }
        expiration = given["Expiration"]
        expires = (
            expiration.timestamp()
            if isinstance(expiration, dt.datetime)
            else time.time() + SESSION_SECONDS
        )
        _cached[arn] = {"credentials": credentials, "expires": expires}
        return credentials


def forget_credentials() -> None:
    """Drop the assumed session (a test's, or after the role changed)."""
    with _lock:
        _cached.clear()


# ---------------------------------------------------------------------------
# Reading, paginated.
# ---------------------------------------------------------------------------


def _plain(value: Any) -> Any:
    """JSON-safe: datetimes as ISO text, the response metadata left out."""
    if isinstance(value, Mapping):
        return {
            str(key): _plain(item)
            for key, item in value.items()
            if key != "ResponseMetadata"
        }
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    return value


def _method_name(operation: str) -> str:
    """botocore's snake_case method for an operation (``GetEC2Instance…`` → ``get_ec2_instance…``)."""
    from botocore import xform_name

    return xform_name(operation)


def read(
    reader: Reader,
    operation: str,
    params: Mapping[str, Any],
    items_key: str,
    tokens: Optional[Tuple[str, str]],
    *,
    region: str,
    max_items: int,
    client_factory: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """Call one read operation, page by page, up to ``max_items`` items.

    Returns the evidence shape: ``{source, call, region, read_at, items,
    pages, truncated}`` (``extra``: the first page's other keys, a total or
    metadata AWS gives beside the items).
    """
    if not reader.allows(operation):
        raise WriteRefused(
            f"The {reader.source} reader does not call {operation}: it calls "
            f"{', '.join(reader.operations)} only."
        )
    credentials = _credentials()
    client = (client_factory or _boto_client)(reader.service, region, **credentials)
    method = getattr(client, _method_name(operation))
    items: List[Any] = []
    extra: Dict[str, Any] = {}
    pages = 0
    token: Optional[str] = None
    truncated = False
    read_at = _now().isoformat()
    while True:
        call = dict(params)
        if tokens and token:
            call[tokens[0]] = token
        answer = method(**call)
        pages += 1
        page = answer.get(items_key) or []
        if isinstance(page, Mapping):
            page = [page]
        items.extend(page)
        if pages == 1:
            extra = {
                key: value
                for key, value in answer.items()
                if key not in (items_key, "ResponseMetadata")
                and (not tokens or key != tokens[1])
            }
        token = answer.get(tokens[1]) if tokens else None
        if len(items) >= max_items:
            truncated = len(items) > max_items or bool(token)
            items = items[:max_items]
            break
        if not token:
            break
    return {
        "source": reader.source,
        "call": operation,
        "region": region,
        "read_at": read_at,
        "items": _plain(items),
        "pages": pages,
        "truncated": truncated,
        **({"extra": _plain(extra)} if extra else {}),
    }


def _bounded(max_items: int) -> int:
    return max(1, min(int(max_items), MAX_ITEMS))


def _region(region: str) -> str:
    """The region asked, else the runtime's, else us-east-1; one of `ACCOUNT_REGIONS` or refused."""
    chosen = (region or os.environ.get("AWS_REGION") or GLOBAL_REGION).strip()
    if chosen not in ACCOUNT_REGIONS:
        raise RegionRefused(
            f"{chosen} is not a region this agent reads: {', '.join(ACCOUNT_REGIONS)} "
            "(its firewall allows those regions' AWS endpoints only)."
        )
    return chosen


async def _answer(work: Callable[[], Dict[str, Any]]) -> Any:
    """Run a read off the event loop; a refusal or AWS's error said in a sentence."""
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        return await asyncio.to_thread(work)
    except (NotConnected, WriteRefused, RegionRefused) as refused:
        return str(refused)
    except ClientError as error:
        info = error.response.get("Error", {})
        return (
            f"AWS refused the read ({info.get('Code', 'error')}): "
            f"{str(info.get('Message', ''))[:300]}"
        )
    except BotoCoreError as error:
        return f"AWS could not be read: {str(error)[:300]}"


# ---------------------------------------------------------------------------
# The tools.
# ---------------------------------------------------------------------------


def _split(text: str) -> List[str]:
    return [piece.strip() for piece in (text or "").split(",") if piece.strip()]


async def aws_cost_optimization_hub(
    resource_types: str = "",
    action_types: str = "",
    max_items: int = 100,
) -> Any:
    """Read AWS Cost Optimization Hub's cost recommendations for the account.

    Each item is AWS's own recommendation: ``recommendationId``, the resource
    (``resourceArn``, ``resourceId``, ``accountId``, ``region``,
    ``currentResourceType``), the ``actionType`` (Rightsize, Stop, Delete,
    PurchaseSavingsPlans, PurchaseReservedInstances, MigrateToGraviton,
    Upgrade), AWS's ``estimatedMonthlySavings`` and ``estimatedMonthlyCost``
    in ``currencyCode``, ``implementationEffort``, ``restartNeeded``,
    ``rollbackPossible`` and ``lastRefreshTimestamp``. Ordered by estimated
    saving, highest first.

    Args:
        resource_types: Comma-separated resource types to keep (for example
            ``Ec2Instance,EbsVolume,RdsDbInstance``); empty for all.
        action_types: Comma-separated actions to keep (for example
            ``Rightsize,Stop,Delete``); empty for all.
        max_items: How many recommendations to read, 1 to 500 (default 100).

    Returns:
        ``{source, call, region, read_at, items, pages, truncated}``, or a
        sentence when the account is not connected or AWS refused the read.
    """
    params: Dict[str, Any] = {
        "orderBy": {"dimension": "EstimatedMonthlySavings", "order": "Desc"},
        "maxResults": 100,
    }
    filters: Dict[str, Any] = {}
    if _split(resource_types):
        filters["resourceTypes"] = _split(resource_types)
    if _split(action_types):
        filters["actionTypes"] = _split(action_types)
    if filters:
        params["filter"] = filters
    return await _answer(
        lambda: read(
            COST_OPTIMIZATION_HUB,
            "ListRecommendations",
            params,
            "items",
            ("nextToken", "nextToken"),
            region=GLOBAL_REGION,
            max_items=_bounded(max_items),
        )
    )


async def aws_compute_optimizer(
    resource: str = "ec2",
    region: str = "",
    max_items: int = 100,
) -> Any:
    """Read AWS Compute Optimizer's findings for one kind of resource in a region.

    Each item is Compute Optimizer's recommendation as AWS gives it: the
    resource's ARN, its ``finding`` (for example Overprovisioned,
    Underprovisioned, Optimized, or an idle finding), the utilization metrics
    it was judged on and its look-back period, and the recommendation options
    with their estimated monthly savings.

    Args:
        resource: ``ec2``, ``asg`` (Auto Scaling groups), ``ebs``, ``lambda``,
            ``ecs`` (ECS services on Fargate), ``rds`` or ``idle`` (idle
            resources of any kind).
        region: The AWS region to read (default: the runtime's region); one
            of AWS's commercial regions enabled by default.
        max_items: How many recommendations to read, 1 to 500 (default 100).

    Returns:
        ``{source, call, region, read_at, items, pages, truncated}``, or a
        sentence when the account is not connected or AWS refused the read.
    """
    if resource not in COMPUTE_OPTIMIZER_RESOURCES:
        return (
            f"{resource!r} is not a resource Compute Optimizer reads: "
            f"{', '.join(COMPUTE_OPTIMIZER_RESOURCES)}."
        )
    operation, items_key = COMPUTE_OPTIMIZER_RESOURCES[resource]
    try:
        where = _region(region)
    except RegionRefused as refused:
        return str(refused)
    return await _answer(
        lambda: read(
            COMPUTE_OPTIMIZER,
            operation,
            {"maxResults": 100} if resource != "lambda" else {"maxResults": 50},
            items_key,
            ("nextToken", "nextToken"),
            region=where,
            max_items=_bounded(max_items),
        )
    )


def _window(start: str, end: str, days: int) -> Tuple[str, str]:
    today = _now().date()
    end_day = dt.date.fromisoformat(end) if end else today
    start_day = (
        dt.date.fromisoformat(start) if start else end_day - dt.timedelta(days=days)
    )
    if start_day >= end_day:
        raise ValueError(
            f"The window starts on {start_day}, not before it ends on {end_day}."
        )
    return start_day.isoformat(), end_day.isoformat()


def _cost_explorer_params(
    view: str, start: str, end: str, granularity: str, group_by: str
) -> Dict[str, Any]:
    if view == "savings_plans_purchase":
        return {
            "SavingsPlansType": "COMPUTE_SP",
            "TermInYears": "ONE_YEAR",
            "PaymentOption": "NO_UPFRONT",
            "LookbackPeriodInDays": "THIRTY_DAYS",
        }
    first, last = _window(start, end, 30)
    if view == "anomalies":
        return {
            "DateInterval": {"StartDate": first, "EndDate": last},
            "MaxResults": 100,
        }
    period = {"Start": first, "End": last}
    if granularity not in ("DAILY", "MONTHLY"):
        raise ValueError(f"{granularity!r} is not a granularity: DAILY or MONTHLY.")
    params: Dict[str, Any] = {"TimePeriod": period, "Granularity": granularity}
    if view == "spend":
        params["Metrics"] = ["UnblendedCost"]
        if group_by:
            if group_by.startswith("TAG:") and len(group_by) > 4:
                params["GroupBy"] = [{"Type": "TAG", "Key": group_by[4:]}]
            elif group_by in SPEND_GROUPS:
                params["GroupBy"] = [{"Type": "DIMENSION", "Key": group_by}]
            else:
                raise ValueError(
                    f"{group_by!r} is not a grouping: {', '.join(SPEND_GROUPS)} or TAG:<key>."
                )
    return params


async def aws_cost_explorer(
    view: str = "spend",
    start: str = "",
    end: str = "",
    granularity: str = "MONTHLY",
    group_by: str = "SERVICE",
    max_items: int = 100,
) -> Any:
    """Read the account's spend and commitments from AWS Cost Explorer.

    Each page read is one Cost Explorer request, billed by AWS to the account
    (0.01 USD each at the time of writing): read what the question needs.

    Args:
        view: ``spend`` (unblended cost by ``group_by``),
            ``savings_plans_coverage``, ``savings_plans_utilization``,
            ``savings_plans_purchase`` (AWS's Compute Savings Plans purchase
            recommendation, one year, no upfront, from the last 30 days),
            ``reservation_coverage`` or ``anomalies`` (Cost Anomaly
            Detection's anomalies, with their root causes and impact).
        start: First day, ``YYYY-MM-DD`` (default: 30 days before ``end``).
        end: Day after the last, ``YYYY-MM-DD`` (default: today).
        granularity: ``MONTHLY`` or ``DAILY``.
        group_by: For ``spend``: ``SERVICE``, ``LINKED_ACCOUNT``, ``REGION``,
            ``USAGE_TYPE`` or ``TAG:<key>``; empty for the total.
        max_items: How many items to read, 1 to 500 (default 100).

    Returns:
        ``{source, call, region, read_at, items, pages, truncated, extra}``,
        or a sentence when the account is not connected, a parameter is
        wrong or AWS refused the read.
    """
    if view not in COST_EXPLORER_VIEWS:
        return (
            f"{view!r} is not a Cost Explorer view: {', '.join(COST_EXPLORER_VIEWS)}."
        )
    try:
        params = _cost_explorer_params(view, start, end, granularity, group_by)
    except ValueError as wrong:
        return str(wrong)
    operation, items_key, tokens = COST_EXPLORER_VIEWS[view]
    return await _answer(
        lambda: read(
            COST_EXPLORER,
            operation,
            params,
            items_key,
            tokens,
            region=GLOBAL_REGION,
            max_items=_bounded(max_items),
        )
    )


#: Every reader of the module, checked at import (each refuses a write).
READERS: Sequence[Reader] = (COST_OPTIMIZATION_HUB, COMPUTE_OPTIMIZER, COST_EXPLORER)

__all__ = [
    "READERS",
    "Reader",
    "WriteRefused",
    "aws_compute_optimizer",
    "aws_cost_explorer",
    "aws_cost_optimization_hub",
    "forget_credentials",
    "read",
]
