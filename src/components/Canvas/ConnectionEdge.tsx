import { memo } from 'react'
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { useSimulationStore } from '../../store/simulation-store'
import type { FlowEdgeData } from '../../types'

function RequestDot({
  path,
  progress,
  status,
}: {
  path: string
  progress: number
  status: string
}) {
  const color =
    status === 'error' || status === 'timeout'
      ? '#ef4444'
      : status === 'rejected' || status === 'circuit_open'
        ? '#f59e0b'
        : '#10b981'

  return (
    <circle r="4" fill={color} opacity={0.9}>
      <animateMotion dur="0.01s" fill="freeze" keyPoints={`${progress};${progress}`} keyTimes="0;1">
        <mpath href={`#${path}`} />
      </animateMotion>
    </circle>
  )
}

/** X marker drawn at the midpoint of the bezier path */
function FailedMarker({ midX, midY }: { midX: number; midY: number }) {
  const size = 7
  return (
    <g transform={`translate(${midX}, ${midY})`}>
      <circle r={size + 2} fill="#1e293b" stroke="#ef4444" strokeWidth={1.5} />
      <line x1={-size * 0.6} y1={-size * 0.6} x2={size * 0.6} y2={size * 0.6} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
      <line x1={size * 0.6} y1={-size * 0.6} x2={-size * 0.6} y2={size * 0.6} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
    </g>
  )
}

export const ConnectionEdge = memo(function ConnectionEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props
  const requests = useSimulationStore((s) => s.requests)
  const edgeData = data as FlowEdgeData | undefined
  const failed = edgeData?.failed === true

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2

  const edgeRequests = failed ? [] : requests.filter((r) => r.edgeId === id)

  const strokeColor = failed ? '#ef4444' : selected ? '#60a5fa' : '#475569'
  const strokeWidth = selected ? 2.5 : 2

  return (
    <>
      <defs>
        <path id={`path-${id}`} d={edgePath} />
      </defs>
      {selected && (
        <BaseEdge
          id={`${id}-selection`}
          path={edgePath}
          style={{ stroke: failed ? '#ef4444' : '#60a5fa', strokeWidth: 6, opacity: 0.4, strokeLinecap: 'round' }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: failed ? '6 4' : undefined,
          opacity: failed ? 0.7 : 1,
        }}
      />
      {failed && <FailedMarker midX={midX} midY={midY} />}
      {edgeRequests.map((req) => (
        <RequestDot
          key={req.id}
          path={`path-${id}`}
          progress={req.progress}
          status={req.status}
        />
      ))}
    </>
  )
})
