# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The CloudFormation templates of Datalayer Steward for AWS, read as AWS reads them:
the read role grants no action that is not a read; the change role never
allows IAM, KMS, Organizations, account or billing actions, and sits under
a permissions boundary that denies them."""

from __future__ import annotations

import pathlib
import re
from typing import Any, Dict, Iterator, List

import pytest
from cfnlint.api import lint_file
from cfnlint.decode import cfn_yaml

AWS_DIR = pathlib.Path(__file__).resolve().parents[2] / "aws"
READ = AWS_DIR / "steward-read-role.yaml"
CHANGE = AWS_DIR / "steward-change-role.yaml"

#: An action's verb that only reads.
READ_VERB = re.compile(r"^(Get|List|Describe)")

#: AWS managed policies the read role may carry: both read only.
READ_MANAGED = {"job-function/ViewOnlyAccess", "SecurityAudit"}

#: Services the change role never allows.
NEVER_CHANGED = (
    "iam",
    "kms",
    "organizations",
    "account",
    "billing",
    "aws-portal",
    "payments",
)


def _load(path: pathlib.Path) -> Dict[str, Any]:
    return cfn_yaml.load(str(path))


def _branches(value: Any) -> Iterator[Any]:
    """A value and, through Fn::If, each of its branches; AWS::NoValue left out."""
    if isinstance(value, dict) and set(value) == {"Fn::If"}:
        _, yes, no = value["Fn::If"]
        yield from _branches(yes)
        yield from _branches(no)
    elif isinstance(value, dict) and value.get("Ref") == "AWS::NoValue":
        return
    else:
        yield value


def _statements(document: Dict[str, Any]) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []
    for statement in document["Statement"]:
        found.extend(_branches(statement))
    return found


def _actions(statement: Dict[str, Any]) -> List[str]:
    action = statement.get("Action", [])
    return [action] if isinstance(action, str) else list(action)


def _role_statements(template: Dict[str, Any], role: str) -> List[Dict[str, Any]]:
    properties = template["Resources"][role]["Properties"]
    statements: List[Dict[str, Any]] = []
    for policy in properties.get("Policies", []):
        statements.extend(_statements(policy["PolicyDocument"]))
    return statements


def _iam_resources(template: Dict[str, Any]) -> Dict[str, str]:
    return {
        name: resource["Type"]
        for name, resource in template["Resources"].items()
        if resource["Type"].startswith("AWS::IAM::")
    }


@pytest.mark.parametrize("path", [READ, CHANGE], ids=["read", "change"])
def test_each_template_is_cfn_lint_clean(path: pathlib.Path) -> None:
    assert [str(match) for match in lint_file(path)] == []


def test_the_read_role_grants_reads_only() -> None:
    template = _load(READ)
    # One role, nothing else: no user, no group, no other policy to attach.
    assert _iam_resources(template) == {"ReadRole": "AWS::IAM::Role"}
    statements = _role_statements(template, "ReadRole")
    assert statements
    for statement in statements:
        assert statement["Effect"] == "Allow"
        assert "NotAction" not in statement
        for action in _actions(statement):
            service, _, verb = action.partition(":")
            assert service and verb, action
            assert verb != "*", f"{action}: every action of a service"
            assert READ_VERB.match(verb), f"{action} is not a read"


def test_the_read_role_carries_only_aws_s_read_only_managed_policies() -> None:
    properties = _load(READ)["Resources"]["ReadRole"]["Properties"]
    managed = set()
    for arn in properties["ManagedPolicyArns"]:
        text = arn["Fn::Sub"] if isinstance(arn, dict) else arn
        managed.add(text.split(":policy/", 1)[1])
    assert managed == READ_MANAGED


@pytest.mark.parametrize("path", [READ, CHANGE], ids=["read", "change"])
def test_each_role_is_assumed_only_by_the_execution_role_with_the_external_id(
    path: pathlib.Path,
) -> None:
    template = _load(path)
    role = next(
        name
        for name, kind in _iam_resources(template).items()
        if kind == "AWS::IAM::Role"
    )
    trust = template["Resources"][role]["Properties"]["AssumeRolePolicyDocument"]
    assume = [s for s in trust["Statement"] if s["Action"] == "sts:AssumeRole"]
    assert len(assume) == 1
    assert assume[0]["Principal"] == {"AWS": {"Ref": "ExecutionRoleArn"}}
    assert assume[0]["Condition"]["StringEquals"]["sts:ExternalId"] == {
        "Ref": "ExternalId"
    }


def test_the_change_role_never_allows_iam_kms_organizations_or_billing() -> None:
    template = _load(CHANGE)
    allowed: List[str] = []
    for statement in _role_statements(template, "ChangeRole"):
        assert statement["Effect"] == "Allow"
        assert "NotAction" not in statement
        allowed.extend(_actions(statement))
    boundary = _statements(
        template["Resources"]["Boundary"]["Properties"]["PolicyDocument"]
    )
    allowed.extend(
        action
        for statement in boundary
        if statement["Effect"] == "Allow"
        for action in _actions(statement)
    )
    assert allowed
    for action in allowed:
        service, _, verb = action.partition(":")
        assert service not in NEVER_CHANGED, f"{action} is allowed"
        assert verb != "*" and action != "*", f"{action}: every action of a service"


def test_the_change_role_sits_under_a_boundary_that_denies_them() -> None:
    template = _load(CHANGE)
    role = template["Resources"]["ChangeRole"]["Properties"]
    assert role["PermissionsBoundary"] == {"Ref": "Boundary"}
    boundary = _statements(
        template["Resources"]["Boundary"]["Properties"]["PolicyDocument"]
    )
    denied = {a for s in boundary if s["Effect"] == "Deny" for a in _actions(s)}
    for service in NEVER_CHANGED:
        assert f"{service}:*" in denied
    # Every action the role allows is within the boundary's allow list.
    within = {a for s in boundary if s["Effect"] == "Allow" for a in _actions(s)}
    for statement in _role_statements(template, "ChangeRole"):
        for action in _actions(statement):
            assert action in within or (
                action.startswith("ec2:Describe") and "ec2:Describe*" in within
            ), f"{action} is outside the boundary"


def test_the_change_role_is_assumed_with_the_recommendation_s_tag() -> None:
    trust = _load(CHANGE)["Resources"]["ChangeRole"]["Properties"][
        "AssumeRolePolicyDocument"
    ]
    assume = next(s for s in trust["Statement"] if s["Action"] == "sts:AssumeRole")
    assert assume["Condition"]["Null"] == {
        "aws:RequestTag/datalayer-recommendation": "false"
    }
    tag = next(s for s in trust["Statement"] if s["Action"] == "sts:TagSession")
    assert tag["Condition"]["ForAllValues:StringEquals"]["aws:TagKeys"] == [
        "datalayer-recommendation"
    ]


def test_every_kind_of_change_is_off_unless_turned_on() -> None:
    parameters = _load(CHANGE)["Parameters"]
    kinds = [name for name in parameters if name.startswith("Allow")]
    assert len(kinds) == 6
    assert all(parameters[name]["Default"] == "false" for name in kinds)
