export const uiCopy = {
  sidebar: {
    ariaLabel: '侧边栏',
    search: '搜索',
    home: '首页',
    newPage: '新建页面',
    pageTree: '页面树',
    expandPage: '展开页面',
    collapsePage: '收起页面',
  },
  app: {
    loading: '正在加载...',
    pageNotFound: '页面不存在',
    renderError: '页面出了点问题，请返回侧边栏重新打开。',
  },
  page: {
    untitled: '未命名',
    addIcon: '添加图标',
    addComment: '添加评论',
    typeSlash: '输入 / 打开命令菜单',
  },
  editor: {
    childPage: '子页面',
  },
  saveStatus: {
    idle: '未保存',
    saving: '保存中...',
    saved: '已保存',
    error: '保存失败',
  },
  export: {
    json: '导出 JSON 备份',
    markdown: '导出 Markdown 页面包',
    import: '导入 JSON 备份',
    reversible: '兼容后续导入',
    importConfirm: '导入会覆盖当前本地内容，确认继续吗？',
    importError: '导入失败，请检查备份文件格式。',
  },
} as const
