# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Trace storage for agent-runtimes observability.

Provides:
- SQLite-based trace storage
- Trace querying and filtering
- Automatic cleanup of old traces
"""

import json
import logging
import sqlite3
import threading
from abc import ABC, abstractmethod
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Generator, Sequence

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class TraceSpan(BaseModel):
    """Represents a single trace span."""
    
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    name: str
    kind: str = "internal"
    start_time: str
    end_time: str | None = None
    status: str = "unset"
    attributes: dict[str, Any] = Field(default_factory=dict)
    events: list[dict[str, Any]] = Field(default_factory=list)
    
    # Agent-specific fields
    agent_id: str | None = None
    session_id: str | None = None
    tool_name: str | None = None


class TraceQuery(BaseModel):
    """Query parameters for trace search."""
    
    trace_id: str | None = None
    agent_id: str | None = None
    session_id: str | None = None
    tool_name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    status: str | None = None
    limit: int = 100
    offset: int = 0


class TraceStorage(ABC):
    """Abstract base class for trace storage."""
    
    @abstractmethod
    def store_span(self, span: TraceSpan) -> None:
        """Store a trace span."""
        pass
    
    @abstractmethod
    def get_span(self, trace_id: str, span_id: str) -> TraceSpan | None:
        """Get a specific span by trace and span ID."""
        pass
    
    @abstractmethod
    def query_spans(self, query: TraceQuery) -> list[TraceSpan]:
        """Query spans based on criteria."""
        pass
    
    @abstractmethod
    def get_trace(self, trace_id: str) -> list[TraceSpan]:
        """Get all spans for a trace."""
        pass
    
    @abstractmethod
    def delete_trace(self, trace_id: str) -> bool:
        """Delete a trace and all its spans."""
        pass
    
    @abstractmethod
    def cleanup_old_traces(self, retention_days: int) -> int:
        """Delete traces older than retention period. Returns count deleted."""
        pass


class SQLiteTraceStorage(TraceStorage):
    """SQLite-based trace storage implementation."""
    
    def __init__(
        self,
        db_path: str | Path,
        max_traces: int = 10000,
    ):
        """
        Initialize SQLite trace storage.
        
        Args:
            db_path: Path to the SQLite database file.
            max_traces: Maximum number of traces to retain.
        """
        self.db_path = Path(db_path)
        self.max_traces = max_traces
        self._local = threading.local()
        
        # Ensure directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize database
        self._init_db()
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, "conn"):
            self._local.conn = sqlite3.connect(
                str(self.db_path),
                check_same_thread=False,
            )
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn
    
    @contextmanager
    def _cursor(self) -> Generator[sqlite3.Cursor, None, None]:
        """Get a database cursor with automatic commit/rollback."""
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def _init_db(self) -> None:
        """Initialize database schema."""
        with self._cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS spans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trace_id TEXT NOT NULL,
                    span_id TEXT NOT NULL,
                    parent_span_id TEXT,
                    name TEXT NOT NULL,
                    kind TEXT DEFAULT 'internal',
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    status TEXT DEFAULT 'unset',
                    attributes TEXT DEFAULT '{}',
                    events TEXT DEFAULT '[]',
                    agent_id TEXT,
                    session_id TEXT,
                    tool_name TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(trace_id, span_id)
                )
            """)
            
            # Create indexes
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_spans_trace_id
                ON spans(trace_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_spans_agent_id
                ON spans(agent_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_spans_session_id
                ON spans(session_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_spans_start_time
                ON spans(start_time)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_spans_tool_name
                ON spans(tool_name)
            """)
    
    def store_span(self, span: TraceSpan) -> None:
        """Store a trace span."""
        with self._cursor() as cursor:
            cursor.execute("""
                INSERT OR REPLACE INTO spans (
                    trace_id, span_id, parent_span_id, name, kind,
                    start_time, end_time, status, attributes, events,
                    agent_id, session_id, tool_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                span.trace_id,
                span.span_id,
                span.parent_span_id,
                span.name,
                span.kind,
                span.start_time,
                span.end_time,
                span.status,
                json.dumps(span.attributes),
                json.dumps(span.events),
                span.agent_id,
                span.session_id,
                span.tool_name,
            ))
        
        # Trigger cleanup if needed
        self._maybe_cleanup()
    
    def get_span(self, trace_id: str, span_id: str) -> TraceSpan | None:
        """Get a specific span by trace and span ID."""
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT * FROM spans
                WHERE trace_id = ? AND span_id = ?
            """, (trace_id, span_id))
            
            row = cursor.fetchone()
            if row:
                return self._row_to_span(row)
            return None
    
    def query_spans(self, query: TraceQuery) -> list[TraceSpan]:
        """Query spans based on criteria."""
        conditions = []
        params = []
        
        if query.trace_id:
            conditions.append("trace_id = ?")
            params.append(query.trace_id)
        
        if query.agent_id:
            conditions.append("agent_id = ?")
            params.append(query.agent_id)
        
        if query.session_id:
            conditions.append("session_id = ?")
            params.append(query.session_id)
        
        if query.tool_name:
            conditions.append("tool_name = ?")
            params.append(query.tool_name)
        
        if query.start_time:
            conditions.append("start_time >= ?")
            params.append(query.start_time)
        
        if query.end_time:
            conditions.append("start_time <= ?")
            params.append(query.end_time)
        
        if query.status:
            conditions.append("status = ?")
            params.append(query.status)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        sql = f"""
            SELECT * FROM spans
            WHERE {where_clause}
            ORDER BY start_time DESC
            LIMIT ? OFFSET ?
        """
        params.extend([query.limit, query.offset])
        
        with self._cursor() as cursor:
            cursor.execute(sql, params)
            return [self._row_to_span(row) for row in cursor.fetchall()]
    
    def get_trace(self, trace_id: str) -> list[TraceSpan]:
        """Get all spans for a trace."""
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT * FROM spans
                WHERE trace_id = ?
                ORDER BY start_time ASC
            """, (trace_id,))
            
            return [self._row_to_span(row) for row in cursor.fetchall()]
    
    def delete_trace(self, trace_id: str) -> bool:
        """Delete a trace and all its spans."""
        with self._cursor() as cursor:
            cursor.execute("""
                DELETE FROM spans WHERE trace_id = ?
            """, (trace_id,))
            
            return cursor.rowcount > 0
    
    def cleanup_old_traces(self, retention_days: int) -> int:
        """Delete traces older than retention period."""
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=retention_days)
        ).isoformat()
        
        with self._cursor() as cursor:
            # Get trace IDs to delete
            cursor.execute("""
                SELECT DISTINCT trace_id FROM spans
                WHERE start_time < ?
            """, (cutoff,))
            
            trace_ids = [row["trace_id"] for row in cursor.fetchall()]
            
            if trace_ids:
                placeholders = ",".join("?" * len(trace_ids))
                cursor.execute(f"""
                    DELETE FROM spans WHERE trace_id IN ({placeholders})
                """, trace_ids)
                
                return cursor.rowcount
            
            return 0
    
    def _maybe_cleanup(self) -> None:
        """Cleanup if we exceed max traces."""
        with self._cursor() as cursor:
            cursor.execute("SELECT COUNT(DISTINCT trace_id) FROM spans")
            count = cursor.fetchone()[0]
            
            if count > self.max_traces:
                # Delete oldest traces
                excess = count - self.max_traces
                cursor.execute("""
                    DELETE FROM spans WHERE trace_id IN (
                        SELECT DISTINCT trace_id FROM spans
                        ORDER BY start_time ASC
                        LIMIT ?
                    )
                """, (excess,))
                logger.info(f"Cleaned up {cursor.rowcount} old spans")
    
    def _row_to_span(self, row: sqlite3.Row) -> TraceSpan:
        """Convert a database row to a TraceSpan."""
        return TraceSpan(
            trace_id=row["trace_id"],
            span_id=row["span_id"],
            parent_span_id=row["parent_span_id"],
            name=row["name"],
            kind=row["kind"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            status=row["status"],
            attributes=json.loads(row["attributes"]),
            events=json.loads(row["events"]),
            agent_id=row["agent_id"],
            session_id=row["session_id"],
            tool_name=row["tool_name"],
        )
    
    def get_stats(self) -> dict[str, Any]:
        """Get storage statistics."""
        with self._cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM spans")
            total_spans = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(DISTINCT trace_id) FROM spans")
            total_traces = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(DISTINCT agent_id) FROM spans WHERE agent_id IS NOT NULL")
            unique_agents = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT MIN(start_time) as oldest, MAX(start_time) as newest
                FROM spans
            """)
            row = cursor.fetchone()
            
            return {
                "total_spans": total_spans,
                "total_traces": total_traces,
                "unique_agents": unique_agents,
                "oldest_trace": row["oldest"],
                "newest_trace": row["newest"],
                "database_path": str(self.db_path),
            }


class SQLiteSpanExporter:
    """OpenTelemetry SpanExporter that writes to SQLite storage."""
    
    def __init__(
        self,
        db_path: str | Path,
        max_traces: int = 10000,
    ):
        """
        Initialize the SQLite span exporter.
        
        Args:
            db_path: Path to the SQLite database file.
            max_traces: Maximum number of traces to retain.
        """
        self.storage = SQLiteTraceStorage(db_path, max_traces)
    
    def export(self, spans: Sequence[Any]) -> Any:
        """Export spans to SQLite storage."""
        try:
            from opentelemetry.sdk.trace.export import SpanExportResult
            
            for span in spans:
                trace_span = self._convert_span(span)
                self.storage.store_span(trace_span)
            
            return SpanExportResult.SUCCESS
            
        except Exception as e:
            logger.error(f"Failed to export spans: {e}")
            try:
                from opentelemetry.sdk.trace.export import SpanExportResult
                return SpanExportResult.FAILURE
            except ImportError:
                return None
    
    def shutdown(self) -> None:
        """Shutdown the exporter."""
        pass
    
    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """Force flush any pending spans."""
        return True
    
    def _convert_span(self, otel_span: Any) -> TraceSpan:
        """Convert an OpenTelemetry span to our TraceSpan model."""
        # Extract attributes
        attributes = {}
        if hasattr(otel_span, "attributes") and otel_span.attributes:
            for key, value in otel_span.attributes.items():
                attributes[key] = value
        
        # Extract events
        events = []
        if hasattr(otel_span, "events") and otel_span.events:
            for event in otel_span.events:
                events.append({
                    "name": event.name,
                    "timestamp": event.timestamp,
                    "attributes": dict(event.attributes) if event.attributes else {},
                })
        
        # Get status
        status = "unset"
        if hasattr(otel_span, "status"):
            status = otel_span.status.status_code.name.lower()
        
        return TraceSpan(
            trace_id=format(otel_span.context.trace_id, "032x"),
            span_id=format(otel_span.context.span_id, "016x"),
            parent_span_id=(
                format(otel_span.parent.span_id, "016x")
                if otel_span.parent else None
            ),
            name=otel_span.name,
            kind=otel_span.kind.name.lower() if hasattr(otel_span.kind, "name") else "internal",
            start_time=datetime.fromtimestamp(
                otel_span.start_time / 1e9, tz=timezone.utc
            ).isoformat(),
            end_time=(
                datetime.fromtimestamp(
                    otel_span.end_time / 1e9, tz=timezone.utc
                ).isoformat()
                if otel_span.end_time else None
            ),
            status=status,
            attributes=attributes,
            events=events,
            agent_id=attributes.get("agent.id"),
            session_id=attributes.get("session.id"),
            tool_name=attributes.get("tool.name"),
        )
