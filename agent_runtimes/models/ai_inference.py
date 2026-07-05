# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for AI Inference service for chat completions, text completions, and AI model management."""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    """Chat message model for AI conversations."""

    role: str = Field(..., description="Message role (user, assistant, system, tool)")
    content: Optional[str] = Field(None, description="Message content")
    name: Optional[str] = Field(None, description="Message name (for tool calls)")
    tool_calls: Optional[List[Dict[str, Any]]] = Field(
        None, description="Tool calls for assistant messages"
    )
    tool_call_id: Optional[str] = Field(
        None, description="Tool call ID for tool result messages"
    )


class ChatRequest(BaseModel):
    """Chat completion request model."""

    model: Optional[str] = Field(
        default="openai-gpt-4", description="AI model identifier"
    )
    messages: List[ChatMessage] = Field(
        ..., min_length=1, description="Conversation messages"
    )
    temperature: Optional[float] = Field(
        default=0.7, ge=0.0, le=2.0, description="Response randomness"
    )
    max_tokens: Optional[int] = Field(
        default=1024, ge=1, description="Maximum response tokens"
    )
    stream: Optional[bool] = Field(
        default=False, description="Enable streaming response"
    )

    # Tool/Function calling support
    tools: Optional[List[Dict[str, Any]]] = Field(
        None, description="Available tools for the model"
    )
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(
        None, description="Tool selection preference"
    )
    functions: Optional[List[Dict[str, Any]]] = Field(
        None, description="Available functions (legacy)"
    )
    function_call: Optional[Union[str, Dict[str, Any]]] = Field(
        None, description="Function call preference (legacy)"
    )
    parallel_tool_calls: Optional[bool] = Field(
        None, description="Allow parallel tool calls"
    )

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not v:
            raise ValueError("Messages list cannot be empty")
        return v


class CompletionRequest(BaseModel):
    """Text completion request model."""

    model: Optional[str] = Field(
        default="text-model", description="AI model identifier"
    )
    prompt: str = Field(..., description="Input prompt for completion")
    temperature: Optional[float] = Field(
        default=0.7, ge=0.0, le=2.0, description="Response randomness"
    )
    max_tokens: Optional[int] = Field(
        default=1024, ge=1, description="Maximum response tokens"
    )
    stop: Optional[List[str]] = Field(None, description="Stop sequences")
    stream: Optional[bool] = Field(
        default=False, description="Enable streaming response"
    )


class ChatResponseData(BaseModel):
    """Chat completion response data model."""

    response: Optional[str] = Field(None, description="Generated response text")
    message: Optional[Dict[str, Any]] = Field(
        None, description="Full message object for tool calls"
    )
    choices: Optional[List[Dict[str, Any]]] = Field(
        None, description="Full choices for complex responses"
    )
    model: Optional[str] = Field(None, description="Model used for generation")
    usage: Optional[Dict[str, Any]] = Field(None, description="Token usage information")


class CompletionResponseData(BaseModel):
    """Text completion response data model."""

    response: str = Field(..., description="Generated completion text")
    model: Optional[str] = Field(None, description="Model used for generation")
    usage: Optional[Dict[str, Any]] = Field(None, description="Token usage information")


class ModelsResponseData(BaseModel):
    """Available models response data model."""

    models: List[str] = Field(..., description="List of available model identifiers")
    aliases: Dict[str, str] = Field(
        default_factory=dict, description="Model aliases mapping"
    )
    categories: Optional[Dict[str, List[str]]] = Field(
        None, description="Models grouped by category"
    )


class HealthResponseData(BaseModel):
    """Health check response data model."""

    status: str = Field(..., description="Service health status")
    service: str = Field(..., description="Service name")
    version: Optional[str] = Field(None, description="Service version")
    timestamp: Optional[str] = Field(None, description="Health check timestamp")


# Embedding models
class EmbeddingRequest(BaseModel):
    """Embedding request model."""

    model: Optional[str] = Field(
        default="text-embedding-ada-002", description="Embedding model identifier"
    )
    input: Union[str, List[str]] = Field(..., description="Text input(s) to embed")
    encoding_format: Optional[str] = Field(
        default="float", description="Embedding encoding format"
    )
    dimensions: Optional[int] = Field(
        None, description="Number of dimensions to return"
    )


class EmbeddingData(BaseModel):
    """Single embedding data model."""

    object: str = Field(default="embedding", description="Object type")
    embedding: List[float] = Field(..., description="Embedding vector")
    index: int = Field(..., description="Input index")


class EmbeddingResponseData(BaseModel):
    """Embedding response data model."""

    object: str = Field(default="list", description="Object type")
    data: List[EmbeddingData] = Field(..., description="Embedding results")
    model: str = Field(..., description="Model used for embeddings")
    usage: Optional[Dict[str, Any]] = Field(None, description="Token usage information")
