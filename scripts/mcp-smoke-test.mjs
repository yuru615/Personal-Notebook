const url = process.env.ZHIXI_MCP_URL
const token = process.env.ZHIXI_MCP_TOKEN

if (!url || !token) {
  throw new Error('Set ZHIXI_MCP_URL and ZHIXI_MCP_TOKEN before running this probe.')
}

let requestId = 1

async function rpc(method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
  })
  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}`)
  }
  const body = await response.text()
  const payload = body
    .split(/\r?\n/)
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim() ?? body
  const message = JSON.parse(payload)
  if (message.error) {
    throw new Error(`${method} failed: ${message.error.message}`)
  }
  return message.result
}

function toolText(result) {
  if (result?.isError) {
    throw new Error(result.content?.[0]?.text ?? 'MCP tool returned an error')
  }
  return result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? '{}')
}

await rpc('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'zhixi-mcp-smoke-test', version: '1.0.0' },
})
await rpc('notifications/initialized')
const tools = await rpc('tools/list')
const names = new Set((tools.tools ?? []).map((tool) => tool.name))
for (const name of ['search_pages', 'get_page', 'create_page', 'append_content']) {
  if (!names.has(name)) throw new Error(`Missing MCP tool: ${name}`)
}
const appendTool = (tools.tools ?? []).find((tool) => tool.name === 'append_content')
if (!appendTool?.description?.includes('createdContent')) {
  throw new Error('append_content description does not require persisted-content reconciliation.')
}

const suffix = Date.now().toString(36)
const created = toolText(await rpc('tools/call', {
  name: 'create_page',
  arguments: { title: `MCP 验收 ${suffix}` },
}))

const appended = toolText(await rpc('tools/call', {
  name: 'append_content',
  arguments: {
    pageId: created.id,
    content: [
      { type: 'markdown', markdown: '# MCP 验收\n\n这段内容由协议探针创建。' },
      { type: 'table', hasHeaderRow: true, rows: [['类型', '状态'], ['MCP', '通过']] },
      { type: 'asset', name: 'probe.png', mimeType: 'image/png', dataBase64: 'aGVsbG8=' },
      { type: 'dataTable', title: '验收数据', columns: [{ key: 'status', name: '状态', type: 'select' }], records: [{ title: '基础工具', values: { status: '通过' } }] },
      { type: 'whiteboard', title: '验收流程', nodes: [{ id: 'start', kind: 'ellipse', text: '开始' }, { id: 'done', kind: 'rect', text: '通过' }], edges: [{ from: 'start', to: 'done' }] },
      { type: 'mindmap', title: '验收导图', root: { text: 'MCP', children: [{ text: '完成' }] } },
    ],
  },
}))

const expectedTypes = ['markdown', 'table', 'asset', 'dataTable', 'whiteboard', 'mindmap']
const actualTypes = appended.createdContent?.map((item) => item.type)
if (JSON.stringify(actualTypes) !== JSON.stringify(expectedTypes)) {
  throw new Error(`Persisted content manifest mismatch: ${JSON.stringify(actualTypes)}`)
}
for (const [index, item] of appended.createdContent.entries()) {
  if (item.index !== index || !Array.isArray(item.blockIds) || item.blockIds.length === 0) {
    throw new Error(`Invalid persisted content manifest entry at index ${index}.`)
  }
}
for (const index of [2, 3, 4, 5]) {
  if (!appended.createdContent[index].objectId) {
    throw new Error(`Missing objectId for ${appended.createdContent[index].type}.`)
  }
}

const page = toolText(await rpc('tools/call', {
  name: 'get_page',
  arguments: { pageId: created.id },
}))
if (page.blocks.length !== appended.createdBlockIds.length) {
  throw new Error('Created blocks cannot be read back from the target page.')
}
const persistedBlockTypes = new Set(page.blocks.map((block) => block.type))
for (const type of ['table', 'image', 'data_table', 'whiteboard', 'mindmap']) {
  if (!persistedBlockTypes.has(type)) {
    throw new Error(`Missing persisted block type: ${type}`)
  }
}

const beforeInvalidCount = page.blocks.length
const invalidResult = await rpc('tools/call', {
  name: 'append_content',
  arguments: {
    pageId: created.id,
    content: [
      { type: 'markdown', markdown: '这段内容必须随错误批次一起回滚。' },
      {
        type: 'dataTable',
        title: '非法数据表',
        columns: [{ key: 'name', name: '名称', type: 'title' }],
        records: [],
      },
    ],
  },
})
if (!invalidResult?.isError) {
  throw new Error('Invalid atomic batch unexpectedly succeeded.')
}
const invalidError = invalidResult.structuredContent
  ?? JSON.parse(invalidResult.content?.[0]?.text ?? '{}')
if (!invalidError.message?.includes('content[1] (dataTable)')) {
  throw new Error(`Invalid batch error did not identify its content item: ${invalidError.message}`)
}
const pageAfterInvalid = toolText(await rpc('tools/call', {
  name: 'get_page',
  arguments: { pageId: created.id },
}))
if (pageAfterInvalid.blocks.length !== beforeInvalidCount) {
  throw new Error('Invalid atomic batch changed the target page.')
}

console.log(JSON.stringify({
  pageId: created.id,
  blocks: page.blocks.length,
  contentTypes: actualTypes,
  invalidBatchRolledBack: true,
  status: 'passed',
}))
