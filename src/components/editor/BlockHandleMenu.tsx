import type { RefObject } from 'react'
import { useEffect } from 'react'
import type { BlockBackgroundColor, BlockType, TextBlockStyle, TextColor } from '../../domain/types'
import { blockBackgroundColorValues, textColorValues } from './blockTextStyle'
import type { FloatingMenuPlacement } from './floatingMenu'

export interface BlockHandleMenuAction {
  key: string
  label: string
  danger?: boolean
  onSelect: () => void
}

interface BlockHandleMenuProps {
  menuRef?: RefObject<HTMLDivElement | null>
  placement?: FloatingMenuPlacement
  maxHeight?: number
  allowedBlockTypes?: BlockType[]
  extraActions?: BlockHandleMenuAction[]
  textStyle?: TextBlockStyle
  onChangeTextStyle?: (nextStyle: TextBlockStyle) => void
  onTurnInto: (type: BlockType) => void
  onDuplicate: () => void
  onDelete: () => void
}

const turnIntoOptions: Array<{ type: BlockType; label: string; icon: string }> = [
  { type: 'heading_1', label: '转为标题 1', icon: 'H1' },
  { type: 'heading_2', label: '转为标题 2', icon: 'H2' },
  { type: 'heading_3', label: '转为标题 3', icon: 'H3' },
  { type: 'paragraph', label: '转为文本', icon: 'Aa' },
  { type: 'todo', label: '转为待办', icon: '☐' },
  { type: 'bulleted_list', label: '转为无序列表', icon: '•' },
  { type: 'numbered_list', label: '转为有序列表', icon: '1.' },
  { type: 'code', label: '转为代码块', icon: '</>' },
  { type: 'table', label: '转为表格', icon: '▦' },
]

const textColorOptions: Array<{ value: TextColor; label: string }> = [
  { value: 'gray', label: '灰色' },
  { value: 'brown', label: '棕色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
  { value: 'pink', label: '粉色' },
  { value: 'red', label: '红色' },
]

const backgroundColorOptions: Array<{ value: BlockBackgroundColor; label: string }> =
  textColorOptions.map((option) => ({
    value: option.value,
    label: `${option.label}背景`,
  }))

export function BlockHandleMenu({
  menuRef,
  placement = 'bottom',
  maxHeight,
  allowedBlockTypes,
  extraActions = [],
  textStyle,
  onChangeTextStyle,
  onTurnInto,
  onDuplicate,
  onDelete,
}: BlockHandleMenuProps) {
  useEffect(() => {
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'

    return () => {
      root.style.overflow = previousOverflow
    }
  }, [])

  const currentTextStyle = textStyle ?? {}
  const allowedTypes = allowedBlockTypes ? new Set(allowedBlockTypes) : null
  const filteredTurnIntoOptions = allowedTypes
    ? turnIntoOptions.filter((option) => allowedTypes.has(option.type))
    : turnIntoOptions
  const showTurnIntoSection = filteredTurnIntoOptions.length > 0
  const canChangeTextStyle = textStyle !== undefined && onChangeTextStyle !== undefined
  const operationActions: BlockHandleMenuAction[] = [
    ...extraActions,
    { key: 'duplicate', label: '复制', onSelect: onDuplicate },
    { key: 'delete', label: '删除', danger: true, onSelect: onDelete },
  ]

  return (
    <div
      ref={menuRef}
      className={`block-menu ${placement === 'top' ? 'floating-menu-top' : 'floating-menu-bottom'}`}
      style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
    >
      {canChangeTextStyle ? (
        <section className="block-menu-section">
          <div className="block-menu-label">样式</div>
          <div className="block-menu-style-group">
            <div className="block-menu-style-label">文字颜色</div>
            <div className="block-menu-color-grid">
              <button
                type="button"
                className="block-menu-color-button"
                aria-label="文字颜色：默认"
                aria-pressed={currentTextStyle.textColor === undefined}
                onClick={() =>
                  onChangeTextStyle?.({
                    ...currentTextStyle,
                    textColor: undefined,
                  })
                }
              >
                <span className="block-menu-text-swatch block-menu-default-swatch" aria-hidden="true">
                  A
                </span>
                <span>默认</span>
              </button>
              {textColorOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="block-menu-color-button"
                  aria-label={`文字颜色：${option.label}`}
                  aria-pressed={currentTextStyle.textColor === option.value}
                  onClick={() =>
                    onChangeTextStyle?.({
                      ...currentTextStyle,
                      textColor: option.value,
                    })
                  }
                >
                  <span
                    className="block-menu-text-swatch"
                    style={{ color: textColorValues[option.value] }}
                    aria-hidden="true"
                  >
                    A
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="block-menu-style-group">
            <div className="block-menu-style-label">块颜色</div>
            <div className="block-menu-color-grid">
              <button
                type="button"
                className="block-menu-color-button"
                aria-label="块颜色：默认"
                aria-pressed={currentTextStyle.backgroundColor === undefined}
                onClick={() =>
                  onChangeTextStyle?.({
                    ...currentTextStyle,
                    backgroundColor: undefined,
                  })
                }
              >
                <span
                  className="block-menu-background-swatch block-menu-default-swatch"
                  aria-hidden="true"
                />
                <span>默认</span>
              </button>
              {backgroundColorOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="block-menu-color-button"
                  aria-label={`块颜色：${option.label}`}
                  aria-pressed={currentTextStyle.backgroundColor === option.value}
                  onClick={() =>
                    onChangeTextStyle?.({
                      ...currentTextStyle,
                      backgroundColor: option.value,
                    })
                  }
                >
                  <span
                    className="block-menu-background-swatch"
                    style={{ backgroundColor: blockBackgroundColorValues[option.value] }}
                    aria-hidden="true"
                  />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="block-menu-action block-menu-toggle-action"
            aria-pressed={currentTextStyle.textAlign === 'center'}
            onClick={() =>
              onChangeTextStyle?.({
                ...currentTextStyle,
                textAlign: currentTextStyle.textAlign === 'center' ? undefined : 'center',
              })
            }
          >
            <span className="block-menu-icon" aria-hidden="true">
              ≡
            </span>
            <span>文字居中</span>
          </button>
        </section>
      ) : null}
      {canChangeTextStyle && showTurnIntoSection ? <div className="block-menu-divider" /> : null}
      {showTurnIntoSection ? (
        <section className="block-menu-section">
          <div className="block-menu-label">转换为</div>
          <div className="block-menu-section-options">
            {filteredTurnIntoOptions.map((option) => (
              <button
                key={option.type}
                type="button"
                className="block-menu-action"
                onClick={() => onTurnInto(option.type)}
              >
                <span className="block-menu-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {canChangeTextStyle || showTurnIntoSection ? <div className="block-menu-divider" /> : null}
      <section className="block-menu-section">
        <div className="block-menu-label">操作</div>
        <div className="block-menu-section-options">
          {operationActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={action.danger ? 'block-menu-action block-menu-danger' : 'block-menu-action'}
              onClick={action.onSelect}
            >
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
