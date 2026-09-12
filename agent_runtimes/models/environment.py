# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Environment models for Datalayer.

Provides data structures for environment management in Datalayer environments:
the entries of the environments listing, and the records of the registry of
user environments (PLAN_ENV.md, section 9). A version's specification, its
states and its capability reports are the canonical models of
``code_sandboxes.environments`` (D-14). A trial answers the runtime it
launched, snake_case as ``POST /runtimes`` answers one (E1-14).
"""

from typing import Any, Dict, Generic, List, Optional, TypeVar, Union

from code_sandboxes.environments.builders import CapabilityReport
from code_sandboxes.environments.lifecycle import VersionState
from code_sandboxes.environments.spec import Environment
from datalayer_core.utils.types import CreditsPerSecond
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

RecordT = TypeVar("RecordT")


class PromotedEnvironmentVersion(BaseModel):
    """The version a user environment's launches resolve to, as the listing names it."""

    uid: str = Field(..., description="Uid of the promoted version")
    version: Optional[int] = Field(default=None, description="Number of the version")
    status: Optional[VersionState] = Field(
        default=None, description="Where the version stands"
    )


class EnvironmentModel(BaseModel):
    """
    Pydantic model representing a Datalayer environment.

    Provides information about available computing environments
    including resources, packages, and configuration details.
    """

    name: str = Field(..., description="Name of the environment")
    title: str = Field(..., description="Title of the environment")
    burning_rate: CreditsPerSecond = Field(
        ..., description="The cost of running the environment per hour"
    )
    language: str = Field(..., description="Programming language for the environment")
    owner: str = Field(..., description="Owner of the environment")
    visibility: str = Field(..., description="Environment visibility (public/private)")
    uid: Optional[str] = Field(
        default=None,
        description="Registry uid of a user environment; None for a platform entry",
    )
    origin: Optional[str] = Field(
        default=None,
        description="`user` for a registry environment; None for a platform entry",
    )
    promoted_version: Optional[PromotedEnvironmentVersion] = Field(
        default=None,
        description="The version launches of a user environment resolve to",
    )
    variants: Optional[List[str]] = Field(
        default=None,
        description="The variants a user environment's promoted version builds for",
    )
    available_variants: Optional[List[str]] = Field(
        default=None,
        description=(
            "The variants a sandbox of the promoted version can start on: "
            "those of `variants` that have a built artifact (E1-19)"
        ),
    )
    size_class: Optional[str] = Field(
        default=None,
        description=(
            "The size class the promoted version names, which prices it (D-4); "
            "None for a platform entry, which carries its own rate"
        ),
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None, description="Additional metadata for the environment"
    )

    def __repr__(self) -> str:
        return f"EnvironmentModel(name='{self.name}', title='{self.title}')"


# -- The registry (PLAN_ENV.md, section 9) ---------------------------------------


class _RegistryRecord(BaseModel):
    """A registry answer: camelCase on the wire, and a field the service adds is kept."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="allow"
    )


class EnvironmentRecord(_RegistryRecord):
    """A user environment, as the registry answers it."""

    uid: str
    name: str
    title: str = ""
    description: str = ""
    origin: str = "user"
    owner_type: str
    owner_uid: str
    visibility: str
    promoted_version_uid: Optional[str] = None
    created_by: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    archived_at: Optional[str] = None
    deleted_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentPromotionPolicyDecision(_RegistryRecord):
    """One artifact a promotion put in service, with the policy decision it carried (E1-08, E1-15)."""

    artifact_uid: str
    variant: str
    region: str = ""
    immutable_reference: str = ""
    #: The artifact's scan summary, as E1-08 decides it; None when no decision was made.
    policy_decision: Optional[Dict[str, Any]] = None


class EnvironmentPromotionRecord(_RegistryRecord):
    """The promotion that last made a version its environment's promoted one (E1-15, D-11)."""

    promoted_at: str
    #: The uid of who promoted it.
    promoted_by: str
    #: The version's optional variants with no artifact a sandbox starts from; none for a ready version.
    unavailable_variants: List[str] = Field(default_factory=list)
    #: What the promotion acknowledged: exactly ``unavailable_variants``.
    acknowledged_unavailable_variants: List[str] = Field(default_factory=list)
    #: Whether any artifact carried a policy decision; False until E1-08 makes them.
    policy_decision_made: bool = False
    policy_decisions: List[EnvironmentPromotionPolicyDecision] = Field(
        default_factory=list
    )


class EnvironmentLiveRuntime(_RegistryRecord):
    """A runtime still running one of an environment's artifacts, as a refused deletion names it (E1-15)."""

    runtime_uid: str
    version_uid: str = ""
    #: The digest of the artifact it runs.
    digest: str = ""


class EnvironmentVersionRecord(_RegistryRecord):
    """A version of an environment: its specification, and where it stands."""

    uid: str
    environment_uid: str
    owner_uid: str
    version: int
    label: str = ""
    spec: Environment
    spec_schema_version: str = ""
    spec_digest: str = ""
    contract_version: str = ""
    source_type: str = ""
    source_format: str = ""
    source_archive_ref: str = ""
    source_archive_digest: str = ""
    lock_digest: str = ""
    resolved_bases: Dict[str, str] = Field(default_factory=dict)
    status: VersionState
    required_variants: List[str] = Field(default_factory=list)
    optional_variants: List[str] = Field(default_factory=list)
    validation_summary: Dict[str, Any] = Field(default_factory=dict)
    failure_code: str = ""
    created_by: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    promoted_at: Optional[str] = None
    deprecated_at: Optional[str] = None
    #: The promotion that last made this version the promoted one, kept after a
    #: later one is promoted; None for a version never promoted, and from a
    #: Runtimes before E1-15.
    promotion: Optional[EnvironmentPromotionRecord] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentBuildRecord(_RegistryRecord):
    """One build of one version, on one variant and region."""

    uid: str
    environment_uid: str
    version_uid: str
    owner_uid: str
    variant: str
    region: str
    attempt: int = 1
    idempotency_key: str = ""
    #: ``queued`` when created; ``succeeded``, ``failed`` and ``cancelled`` end it.
    status: str
    error_code: str = ""
    error_detail: str = ""
    cache_hit: bool = False
    correlation_id: str = ""
    requested_by: str = ""
    cancelled_by: str = ""
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    updated_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentArtifactRecord(_RegistryRecord):
    """The artifact of one version, on one variant and region."""

    uid: str
    environment_uid: str
    version_uid: str
    owner_uid: str
    variant: str
    region: str
    spec_digest: str = ""
    lock_digest: str = ""
    base_digest: str = ""
    provider_account: str = ""
    provider_namespace: str = ""
    provider_artifact_id: str = ""
    #: What a launch uses: an OCI digest, a template build, a snapshot id, an image id.
    immutable_reference: str = ""
    mutable_alias: str = ""
    status: str = ""
    architecture: str = ""
    contract_version: str = ""
    runtime_metadata: Dict[str, Any] = Field(default_factory=dict)
    size_bytes: int = 0
    sbom_ref: str = ""
    scan_summary: Dict[str, Any] = Field(default_factory=dict)
    provenance_ref: str = ""
    signature_ref: str = ""
    reference_count: int = 0
    last_used_at: Optional[str] = None
    retention_state: str = ""
    provider_verified_at: Optional[str] = None
    build_started_at: Optional[str] = None
    build_finished_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentBuildLogChunk(_RegistryRecord):
    """One chunk of a build's log, redacted before it was written (D-15)."""

    #: Dense from 0.
    sequence: int
    text: str
    size: int = 0
    created_at: Optional[str] = None


class EnvironmentBuildLogPage(_RegistryRecord):
    """A build's log chunks after a cursor, and whether the log is complete."""

    chunks: List[EnvironmentBuildLogChunk] = Field(default_factory=list)
    #: The sequence of the last chunk read, or the cursor given when nothing new was written.
    next_cursor: Optional[str] = None
    complete: bool = False


class EnvironmentValidationReport(_RegistryRecord):
    """What validating a version answers: a capability report per variant."""

    version_uid: str
    spec_digest: str = ""
    supported: bool
    reports: List[CapabilityReport] = Field(default_factory=list)

    @field_validator("reports", mode="before")
    @classmethod
    def _reports_without_supported(cls, value: Any) -> Any:
        """Drop each report's ``supported``, which ``CapabilityReport`` works out from its findings."""
        if not isinstance(value, list):
            return value
        return [
            {name: item for name, item in report.items() if name != "supported"}
            if isinstance(report, dict)
            else report
            for report in value
        ]


# -- A trial's runtime (E1-14) ---------------------------------------------------------


class _RuntimeAnswer(BaseModel):
    """A runtime answer: snake_case, as ``POST /runtimes`` writes it, and a field the service adds is kept."""

    model_config = ConfigDict(extra="allow")


class LaunchedEnvironmentArtifact(_RuntimeAnswer):
    """The artifact a runtime was started from, as its answer names it (section 7.6, E1-11)."""

    uid: str = ""
    variant: str = ""
    region: str = ""
    #: What the sandbox started from: an OCI reference pinned by its digest.
    immutable_reference: str = ""
    digest: str = ""
    contract_version: str = ""
    size_class: str = ""


class LaunchedEnvironment(_RuntimeAnswer):
    """A runtime's environment: its name, and for a user environment the version and artifact launched (E1-11)."""

    name: str = ""
    title: str = ""
    uid: Optional[str] = None
    version_uid: Optional[str] = None
    version: Optional[int] = None
    contract_version: str = ""
    artifact: Optional[LaunchedEnvironmentArtifact] = None


class LaunchedRuntime(_RuntimeAnswer):
    """A runtime as ``POST /runtimes`` answers it: the fields a trial reads, and the Operator's others kept."""

    uid: Optional[str] = None
    runtime_name: str = ""
    given_name: str = ""
    environment: LaunchedEnvironment = Field(default_factory=LaunchedEnvironment)
    burning_rate: Optional[float] = None
    started_at: Optional[Union[str, float]] = None
    expired_at: Optional[Union[str, float]] = None
    #: Why no runtime was started, when the answer's ``success`` is False.
    reason: Optional[str] = None


class EnvironmentTrial(_RuntimeAnswer):
    """
    What trying a version answers (E1-14): ``POST /runtimes``' answer, for the version pinned.

    The runtime's environment names the version tried and the artifact it
    started from. ``success`` is False, and the runtime carries a ``reason``,
    when the Operator started none.
    """

    success: bool
    message: str = ""
    runtime: LaunchedRuntime = Field(default_factory=LaunchedRuntime)


class EnvironmentsPage(BaseModel, Generic[RecordT]):
    """One page of a registry listing, and the cursor of the next one."""

    items: List[RecordT] = Field(default_factory=list)
    #: None once the listing is read.
    next_cursor: Optional[str] = None
