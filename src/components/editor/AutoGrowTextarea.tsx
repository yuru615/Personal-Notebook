import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent, TextareaHTMLAttributes } from 'react'

interface AutoGrowTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
}

export function AutoGrowTextarea({
  minRows = 1,
  value,
  style,
  onChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isComposingRef = useRef(false)
  const [draftValue, setDraftValue] = useState(() => String(value ?? ''))

  useEffect(() => {
    if (!isComposingRef.current) {
      setDraftValue(String(value ?? ''))
    }
  }, [value])

  useLayoutEffect(() => {
    const element = textareaRef.current

    if (!element) {
      return
    }

    element.style.height = '0px'

    const computedLineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight)
    const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 24
    const minHeight = lineHeight * minRows + 6

    element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
  }, [draftValue, minRows])

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraftValue(event.target.value)

    const isNativeComposing =
      'isComposing' in event.nativeEvent && event.nativeEvent.isComposing === true

    if (isComposingRef.current || isNativeComposing) {
      return
    }

    onChange?.(event)
  }

  function handleCompositionStart(event: CompositionEvent<HTMLTextAreaElement>) {
    isComposingRef.current = true
    onCompositionStart?.(event)
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    isComposingRef.current = false
    setDraftValue(event.currentTarget.value)
    onCompositionEnd?.(event)
  }

  return (
    <textarea
      ref={textareaRef}
      rows={minRows}
      value={draftValue}
      style={{
        overflow: 'hidden',
        resize: 'none',
        ...style,
      }}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      {...props}
    />
  )
}
