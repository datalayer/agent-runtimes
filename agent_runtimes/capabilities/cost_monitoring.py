# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Cost monitoring capability for pydantic-ai lifecycle hooks."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability

from agent_runtimes.context.costs import get_cost_store

try:
    from datalayer_core.otel.emitter import OTelEmitter
except Exception:  # pragma: no cover - optional dependency at runtime
    OTelEmitter = None  # type: ignore[assignment,unused-ignore]


logger = logging.getLogger(__name__)


@dataclass
class CostMonitoringCapability(AbstractCapability[Any]):
    """Track per-run and cumulative costs with traceability + OTEL emission."""

    agent_id: str
    model_name: str | None = None
    per_run_budget_usd: float | None = None
    cumulative_budget_usd: float | None = None
    service_name: str = "agent-runtimes"
    enabled: bool = True

    _price_per_input: float | None = field(default=None, init=False, repr=False)
    _price_per_output: float | None = field(default=None, init=False, repr=False)
    _prices_resolved: bool = field(default=False, init=False, repr=False)
    _emitters: dict[str, Any] = field(default_factory=dict, init=False, repr=False)

    def _get_emitter(self) -> Any:
        if not self.enabled or OTelEmitter is None:
            return None
        # OTEL storage requires datalayer.user_uid; resolve it from request JWT.
        from ..context.identities import get_request_user_jwt
        from ..observability.prompt_turn_metrics import decode_user_uid

        user_jwt = get_request_user_jwt()
        user_uid = decode_user_uid(user_jwt) if user_jwt else None
        if not user_uid:
            logger.debug(
                "CostMonitoringCapability: no user_uid from request JWT, skipping OTEL emission"
            )
            return None

        emitter = self._emitters.get(user_uid)
        if emitter is None:
            emitter = OTelEmitter(
                service_name=self.service_name, user_uid=user_uid, token=user_jwt
            )
            self._emitters[user_uid] = emitter
        return emitter

    def _resolve_prices(self, model_id: Any = None) -> None:
        # Keep retrying until prices are actually resolved; model catalogs can
        # lag and may become available later in a long-lived runtime.
        if (
            self._prices_resolved
            and self._price_per_input is not None
            and self._price_per_output is not None
        ):
            return

        model_name = str(model_id) if model_id is not None else (self.model_name or "")
        if not model_name:
            self._prices_resolved = True
            return

        def _model_ref_candidates(name: str) -> list[str]:
            ref = name
            if ":" in ref:
                _, ref = ref.split(":", 1)

            # Normalize Bedrock regional/global prefixes for model matching.
            for prefix in (
                "global.",
                "regional.",
                "us.",
                "eu.",
                "apac.",
                "au.",
                "jp.",
                "us-gov.",
            ):
                if ref.startswith(prefix):
                    ref = ref[len(prefix) :]
                    break

            # genai-prices tends to match Anthropic entries by claude-* aliases.
            if ref.startswith("anthropic."):
                ref = ref[len("anthropic.") :]

            candidates: list[str] = [ref]

            # Bedrock IDs often include provider suffixes like -v1:0.
            if ":" in ref:
                candidates.append(ref.split(":", 1)[0])

            base_ref = candidates[-1]

            # Keep family alias fallback for dated model ids:
            # claude-sonnet-4-5-20250929 -> claude-sonnet-4-5
            # claude-3-5-haiku-20241022 -> claude-3-5-haiku
            if base_ref.startswith("claude"):
                parts = base_ref.split("-")
                if parts and parts[-1].isdigit() and len(parts[-1]) == 8:
                    candidates.append("-".join(parts[:-1]))

            # Some catalogs use anthropic-prefixed aliases.
            for candidate in list(candidates):
                if not candidate.startswith("anthropic."):
                    candidates.append(f"anthropic.{candidate}")

            # Preserve order while removing duplicates.
            deduped: list[str] = []
            seen: set[str] = set()
            for candidate in candidates:
                c = candidate.strip()
                if not c or c in seen:
                    continue
                seen.add(c)
                deduped.append(c)
            return deduped

        try:  # pragma: no cover - depends on optional runtime dependency
            from genai_prices import calc_price
            from genai_prices.types import Usage

            def _mtok_to_per_token(value: Any) -> float | None:
                # genai-prices can return numeric mtok values OR tiered price
                # objects (e.g., TieredPrices with a `base` field).
                if value is None:
                    return None

                numeric: float | None = None
                if isinstance(value, (int, float, Decimal)):
                    numeric = float(value)
                elif hasattr(value, "base"):
                    base = getattr(value, "base", None)
                    if isinstance(base, (int, float, Decimal)):
                        numeric = float(base)

                if numeric is None:
                    return None
                return numeric / 1_000_000.0

            def _safe_calc_price(model_ref: str) -> Any | None:
                try:
                    return calc_price(
                        Usage(input_tokens=1, output_tokens=1),
                        model_ref,
                    )
                except Exception:
                    return None

            for model_ref in _model_ref_candidates(model_name):
                price_calc = _safe_calc_price(model_ref)
                if price_calc is None:
                    continue

                model_price = price_calc.model_price
                input_mtok = getattr(model_price, "input_mtok", None)
                output_mtok = getattr(model_price, "output_mtok", None)
                resolved_input = _mtok_to_per_token(input_mtok)
                resolved_output = _mtok_to_per_token(output_mtok)
                if resolved_input is not None and resolved_output is not None:
                    self._price_per_input = resolved_input
                    self._price_per_output = resolved_output
                    break
        except Exception:
            # Backward compatibility with older genai-prices API.
            try:
                from genai_prices import get_model_prices

                def _safe_get_model_prices(model_ref: str) -> Any | None:
                    try:
                        return get_model_prices(model_ref)
                    except Exception:
                        return None

                for model_ref in _model_ref_candidates(model_name):
                    prices = _safe_get_model_prices(model_ref)
                    if prices:
                        self._price_per_input = prices.get("input", 0.0)
                        self._price_per_output = prices.get("output", 0.0)
                        break
            except Exception:
                pass

        self._prices_resolved = (
            self._price_per_input is not None and self._price_per_output is not None
        )

    def _calculate_run_cost(self, input_tokens: int, output_tokens: int) -> float:
        if self._price_per_input is None or self._price_per_output is None:
            return 0.0
        return (
            float(input_tokens) * self._price_per_input
            + float(output_tokens) * self._price_per_output
        )

    async def before_run(self, ctx: RunContext[Any]) -> None:
        if not self.enabled:
            return

        if not self._prices_resolved:
            self._resolve_prices(getattr(ctx.model, "model_id", None))

        # Keep budgets in sync in the shared store.
        store = get_cost_store()
        store.register_agent(
            self.agent_id,
            per_run_budget_usd=self.per_run_budget_usd,
            cumulative_budget_usd=self.cumulative_budget_usd,
        )

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        if not self.enabled:
            return result

        usage = ctx.usage
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        run_cost_usd = self._calculate_run_cost(input_tokens, output_tokens)
        model = str(
            getattr(ctx.model, "model_id", None) or self.model_name or "unknown"
        )

        store = get_cost_store()
        tracked = store.record_run(
            agent_id=self.agent_id,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            run_cost_usd=run_cost_usd,
            price_per_input_token=self._price_per_input,
            price_per_output_token=self._price_per_output,
            pricing_resolved=(
                self._price_per_input is not None and self._price_per_output is not None
            ),
        )

        emitter = self._get_emitter()
        if emitter is not None:
            attrs = {
                "agent.id": self.agent_id,
                "agent.model": model,
                "gen_ai.usage.input_tokens": input_tokens,
                "gen_ai.usage.output_tokens": output_tokens,
                "gen_ai.usage.total_tokens": input_tokens + output_tokens,
                "gen_ai.usage.cost_usd": run_cost_usd,
                "agent.cost.cumulative_usd": tracked.cumulative_cost_usd,
            }

            emitter.add_counter("agent_runtimes.capability.cost.run.count", 1, attrs)
            emitter.add_counter(
                "agent_runtimes.capability.cost.run.usd", run_cost_usd, attrs
            )
            emitter.add_histogram(
                "agent_runtimes.capability.cost.cumulative.usd",
                tracked.cumulative_cost_usd,
                attrs,
            )

            with emitter.span("agent_runtimes.capability.cost.run", attributes=attrs):
                pass

        return result
