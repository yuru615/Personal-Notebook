import type { RefObject } from 'react'
import type { BlockType } from '../../domain/types'
import type { FloatingMenuPlacement } from './floatingMenu'

const options: Array<{
  type: BlockType
  label: string
  description: string
  icon: string
  group: 'text' | 'list' | 'page_data'
}> = [
  {
    type: 'heading_1',
    label: '标题 1',
    description: '最大标题，用于页面重点',
    icon: 'H1',
    group: 'text',
  },
  {
    type: 'heading_2',
    label: '标题 2',
    description: '中号标题，用于分组内容',
    icon: 'H2',
    group: 'text',
  },
  {
    type: 'heading_3',
    label: '标题 3',
    description: '小号标题，用于细分结构',
    icon: 'H3',
    group: 'text',
  },
  {
    type: 'paragraph',
    label: '文本',
    description: '普通正文，适合连续记录',
    icon: 'Aa',
    group: 'text',
  },
  {
    type: 'todo',
    label: '待办列表',
    description: '可勾选的任务项',
    icon: '☐',
    group: 'list',
  },
  {
    type: 'bulleted_list',
    label: '无序列表',
    description: '每行一个无序条目',
    icon: '•',
    group: 'list',
  },
  {
    type: 'numbered_list',
    label: '有序列表',
    description: '自动按顺序排列条目',
    icon: '1.',
    group: 'list',
  },
  {
    type: 'child_page',
    label: '子页面',
    description: '在当前页下创建新的子页面',
    icon: '↗',
    group: 'page_data',
  },
  {
    type: 'code',
    label: '代码块',
    description: '保留格式，适合代码或片段',
    icon: '</>',
    group: 'page_data',
  },
  {
    type: 'table',
    label: '简单表格',
    description: '适合简单的多行多列表格',
    icon: '▦',
    group: 'page_data',
  },
  {
    type: 'whiteboard',
    label: '白板',
    description: '插入一个可点击进入的白板卡片',
    icon: '◫',
    group: 'page_data',
  },
  {
    type: 'mindmap',
    label: '鎬濈淮瀵煎浘',
    description: '鎻掑叆涓€涓彲鐐瑰嚮杩涘叆鐨勬€濈淮瀵煎浘鍏ュ彛',
    icon: '◎',
    group: 'page_data',
  },
]

const groups: Array<{
  id: 'text' | 'list' | 'page_data'
  label: string
}> = [
  { id: 'text', label: '文本' },
  { id: 'list', label: '列表' },
  { id: 'page_data', label: '页面与数据' },
]

interface SlashMenuProps {
  query: string
  menuRef?: RefObject<HTMLDivElement | null>
  placement?: FloatingMenuPlacement
  maxHeight?: number
  onPick: (type: BlockType) => void
}

export function SlashMenu({
  query,
  menuRef,
  placement = 'bottom',
  maxHeight,
  onPick,
}: SlashMenuProps) {
  const keyword = query.replace('/', '').trim()
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      options: options.filter(
        (option) =>
          option.group === group.id &&
          (keyword.length === 0 ||
            option.label.includes(keyword) ||
            option.description.includes(keyword)),
      ),
    }))
    .filter((group) => group.options.length > 0)

  return (
    <div
      ref={menuRef}
      className={`slash-menu ${placement === 'top' ? 'floating-menu-top' : 'floating-menu-bottom'}`}
      style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
    >
      {filteredGroups.length > 0 ? (
        <>
          <div className="slash-menu-header">
            <div className="slash-menu-title">基础块</div>
            <div className="slash-menu-subtitle">输入关键词可以快速筛选</div>
          </div>
          {filteredGroups.map((group) => (
            <section key={group.id} className="slash-menu-section">
              <div className="slash-menu-section-label">{group.label}</div>
              <div className="slash-menu-section-options">
                {group.options.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    className="slash-option"
                    aria-label={option.label}
                    onClick={() => onPick(option.type)}
                  >
                    <span className="slash-option-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span className="slash-option-body">
                      <span className="slash-option-title">{option.label}</span>
                      <span className="slash-option-description">{option.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        <div className="slash-menu-empty">没有匹配的块类型</div>
      )}
    </div>
  )
}
