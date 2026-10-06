# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications in LOOP: the application API, and what decides their tool calls.

An application written in Python is an `Application` — its Appspec and the
code that reacts to its sessions — run by an `AppHost`; its code is handed a
`Session`, an application's session, apart from the workspace's `LoopSession`
(`agent_runtimes.loop.session`). LOOP §10, P-01 to P-03, P-06, P-14, P-15, P-18.

An application (`agent_runtimes.specs.apps`) carries rules written in a
person's words and applied to what a tool does. This package is where they are
decided.
"""

from agent_runtimes.loop.apps.agent import (
    AgentFactory,
    Answer,
    AppAgent,
    app_capabilities,
    local_agent,
)
from agent_runtimes.loop.apps.application import (
    AppHost,
    Application,
    load_application,
)
from agent_runtimes.loop.apps.enforcement import (
    AppRuleBlockedError,
    AppRulesCapability,
    Enforced,
)
from agent_runtimes.loop.apps.own import Conversation
from agent_runtimes.loop.apps.rules import (
    BEHAVIOURS,
    DEFAULT_BEHAVIOURS,
    Decision,
    behaviour_for,
    classes_of,
    condition_holds,
    decision_for,
    gives,
    is_comparable,
    is_pattern,
    is_read_only,
    matches,
    split_ref,
    strictest,
    tool_behaviours,
    tool_escalations,
)
from agent_runtimes.loop.apps.session import (
    AskTimeout,
    Channel,
    ChoiceQuestion,
    Closed,
    Delta,
    Element,
    FileQuestion,
    FormQuestion,
    InvalidAnswer,
    MemoryChannel,
    Message,
    Question,
    Removed,
    Session,
    Shown,
    Step,
    TextQuestion,
    UploadedFile,
    WindowMessage,
)
from agent_runtimes.loop.apps.utilities import cache, run_sync

__all__ = [
    "AgentFactory",
    "Answer",
    "AppAgent",
    "AppHost",
    "Application",
    "AskTimeout",
    "Channel",
    "ChoiceQuestion",
    "Closed",
    "Conversation",
    "Delta",
    "Element",
    "FileQuestion",
    "FormQuestion",
    "InvalidAnswer",
    "MemoryChannel",
    "Message",
    "Question",
    "Removed",
    "Session",
    "Shown",
    "Step",
    "TextQuestion",
    "UploadedFile",
    "WindowMessage",
    "app_capabilities",
    "cache",
    "load_application",
    "local_agent",
    "run_sync",
    "AppRuleBlockedError",
    "AppRulesCapability",
    "Enforced",
    "BEHAVIOURS",
    "DEFAULT_BEHAVIOURS",
    "Decision",
    "behaviour_for",
    "classes_of",
    "condition_holds",
    "decision_for",
    "gives",
    "is_comparable",
    "is_pattern",
    "is_read_only",
    "matches",
    "split_ref",
    "strictest",
    "tool_behaviours",
    "tool_escalations",
]
