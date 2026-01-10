# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for chat functionality."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Chat request from frontend."""

    model: Optional[str] = Field(None, description="Model to use for this request")
    builtin_tools: List[str] = Field(
        default_factory=list, description="Enabled builtin tools"
    )
    messages: List[Dict[str, Any]] = Field(
        default_factory=list, description="Conversation messages"
    )
