/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The editable React Flow canvas shared by the person and the agent. */

import { useEffect, useRef, useState, type JSX } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Box } from '@datalayer/primer-addons';
import {
  addUserLink,
  addUserShape,
  setUserFlow,
  type PageReactFlow,
  type ReactFlowShapeData,
} from './store';
import type { Node } from '@xyflow/react';

export default function FlowStage({
  flow,
  revision,
}: {
  flow: PageReactFlow;
  revision: number;
}): JSX.Element {
  const [nodes, setNodes] = useState(flow.nodes);
  const [edges, setEdges] = useState(flow.edges);
  const instance = useRef<ReactFlowInstance<
    Node<ReactFlowShapeData>,
    Edge
  > | null>(null);

  useEffect(() => {
    setNodes([...flow.nodes]);
    setEdges([...flow.edges]);
  }, [flow, revision]);

  const keep = (nextNodes: Node<ReactFlowShapeData>[], nextEdges: Edge[]) => {
    setNodes(nextNodes);
    setEdges(nextEdges);
    setUserFlow(nextNodes, nextEdges);
  };

  return (
    <Box
      data-page-react-flow-stage=""
      flex={1}
      minHeight={480}
      sx={{ position: 'relative' }}
      onDoubleClick={event => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !target.classList.contains('react-flow__pane')
        ) {
          return;
        }
        const point = instance.current?.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        if (!point) {
          return;
        }
        addUserShape(point);
        setNodes([...flow.nodes]);
      }}
    >
      <ReactFlow<Node<ReactFlowShapeData>, Edge>
        nodes={nodes}
        edges={edges}
        fitView
        onInit={next => {
          instance.current = next;
        }}
        onNodesChange={changes => keep(applyNodeChanges(changes, nodes), edges)}
        onEdgesChange={changes => keep(nodes, applyEdgeChanges(changes, edges))}
        onConnect={connection => {
          if (!connection.source || !connection.target) {
            return;
          }
          addUserLink(connection.source, connection.target);
          setEdges([...flow.edges]);
        }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        {nodes.length === 0 ? (
          <Panel position="top-center">
            Double-click the canvas to add a shape, or ask the agent to build
            the flow.
          </Panel>
        ) : null}
        <Background />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </Box>
  );
}
