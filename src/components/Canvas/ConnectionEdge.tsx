import { memo } from 'react'
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { useSimulationStore } from '../../store/simulation-store'

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

export const ConnectionEdge = memo(function ConnectionEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const requests = useSimulationStore((s) => s.requests)

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const edgeRequests = requests.filter((r) => r.edgeId === id)

  return (
    <>
      <defs>
        <path id={`path-${id}`} d={edgePath} />
      </defs>
      <BaseEdge id={id} path={edgePath} style={{ stroke: '#475569', strokeWidth: 2 }} />
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
