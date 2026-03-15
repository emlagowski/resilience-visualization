import { useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  SelectionMode,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useFlowStore } from '../../store/flow-store'
import { ServiceNode } from './ServiceNode'
import { ConnectionEdge } from './ConnectionEdge'
import { ContextMenu } from './ContextMenu'
import { EdgeContextMenu } from './EdgeContextMenu'

const nodeTypes: NodeTypes = {
  service: ServiceNode,
}

const edgeTypes: EdgeTypes = {
  default: ConnectionEdge,
}

interface CtxMenu {
  nodeId: string
  x: number
  y: number
}

interface EdgeCtxMenu {
  edgeId: string
  x: number
  y: number
}

export function FlowCanvas() {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)
  const duplicateNode = useFlowStore((s) => s.duplicateNode)
  const updateNodePosition = useFlowStore((s) => s.updateNodePosition)

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [edgeCtxMenu, setEdgeCtxMenu] = useState<EdgeCtxMenu | null>(null)

  // Option/Alt + drag → duplicate: track origin position when alt drag starts
  const altDrag = useRef<{ nodeId: string; startPos: { x: number; y: number } } | null>(null)

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setCtxMenu(null)
    setEdgeCtxMenu(null)
  }, [setSelectedNode])

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setEdgeCtxMenu(null)
      setCtxMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
      setSelectedNode(node.id)
    },
    [setSelectedNode],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      setCtxMenu(null)
      setEdgeCtxMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY })
    },
    [],
  )

  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.altKey) {
        altDrag.current = { nodeId: node.id, startPos: { ...node.position } }
      }
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (altDrag.current && altDrag.current.nodeId === node.id) {
        const origin = altDrag.current.startPos
        // Create a duplicate at the position the user dragged to
        duplicateNode(node.id, { ...node.position })
        // Snap the original back to where it started
        updateNodePosition(node.id, origin)
        altDrag.current = null
      }
    },
    [duplicateNode, updateNodePosition],
  )

  return (
    <div className="flex-1 h-full relative" style={{ touchAction: 'none' }}>
      <ReactFlow
        nodes={nodes as any}
        edges={edges}
        onNodesChange={onNodesChange as any}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeDragStart={onNodeDragStart as any}
        onNodeDragStop={onNodeDragStop as any}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'default' }}
        className="bg-gray-950"
        zoomOnPinch={true}
        // Pan with middle or right mouse button so left-drag can do rubber-band selection
        panOnDrag={[1, 2]}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={['Backspace', 'Delete']}
        preventScrolling={true}
        minZoom={0.05}
        maxZoom={4}
      >
        <Controls className="!bg-gray-800 !border-gray-600 !shadow-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-600 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-700" />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
      </ReactFlow>

      {ctxMenu && (
        <ContextMenu
          nodeId={ctxMenu.nodeId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {edgeCtxMenu && (
        <EdgeContextMenu
          edgeId={edgeCtxMenu.edgeId}
          x={edgeCtxMenu.x}
          y={edgeCtxMenu.y}
          onClose={() => setEdgeCtxMenu(null)}
        />
      )}

      {/* Hint */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-700 pointer-events-none select-none hidden md:block">
        Right-click node/edge for menu · Shift+click or drag to multi-select · Alt+drag to duplicate
      </div>
    </div>
  )
}
