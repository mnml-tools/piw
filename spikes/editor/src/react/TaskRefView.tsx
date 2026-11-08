import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'

import { normalizeTaskId, TaskRef } from '../task-ref'
import { useTaskRef, useTaskRefContext } from './task-ref-store'

/**
 * Renders a reference to a REAL task. Reads only `node.attrs.taskId`; title and
 * status come from the TaskRefStore, so renaming/completing the task anywhere
 * updates every document and sticky note without touching document JSON.
 */
export function TaskRefView({ node, selected }: ReactNodeViewProps) {
  const taskId = normalizeTaskId(node.attrs['taskId'])
  const task = useTaskRef(taskId)
  const { onToggle, onOpen, labels } = useTaskRefContext()

  let body
  if (task === undefined) {
    body = <span className="task-ref__state">{labels.loading}</span>
  } else if (task === null) {
    body = <span className="task-ref__state task-ref__state--missing">{labels.missing}</span>
  } else {
    const done = task.status === 'done'
    body = (
      <>
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={labels.toggle(task)}
          className="task-ref__check"
          onClick={() => onToggle?.(task.id)}
        />
        <button type="button" className="task-ref__title" onClick={() => onOpen?.(task.id)}>
          {task.title}
        </button>
      </>
    )
  }

  return (
    <NodeViewWrapper
      as="span"
      className="task-ref"
      data-task-ref={taskId ?? ''}
      data-status={task ? task.status : undefined}
      data-selected={selected ? '' : undefined}
      contentEditable={false}
    >
      {body}
    </NodeViewWrapper>
  )
}

/** Same schema as the headless TaskRef (name, attrs, Markdown) + React NodeView. */
export const TaskRefWithReactView = TaskRef.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TaskRefView, { as: 'span' })
  },
})
