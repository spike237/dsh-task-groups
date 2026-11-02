/**
 * Headless render check for the browser half.
 *
 * Loads lib/client.js in jsdom with React and a minimal stand-in for
 * @deepseek-ai/dsh-client-ui-primitives, applies the plugin to a fake Cordis
 * context, renders the `sidebar.workspaces` component with fake Session /
 * Workspace / status hooks, and exercises the group + project + activity views.
 *
 * Run: node test/render.test.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const mark = (entry) => {
  if (process.env.DTG_DEBUG !== '1') return
  try {
    appendFileSync(join(here, 'probe.log'), `${entry}\n`)
  } catch {
    /* ignore */
  }
}
mark('start')
const watchdog = setTimeout(() => {
  mark('TIMEOUT')
  console.error('TIMEOUT: render did not settle')
  process.exit(3)
}, 20000)

// React/jsdom come from a local DSH plugin checkout used during development
// (override with DSH_DEV_CHECKOUT pointing at its package.json).
const requireFrom = createRequire(process.env.DSH_DEV_CHECKOUT ?? 'D:/develop/spike/dsh-more-details/package.json')
const React = requireFrom('react')
const { useEffect, useState } = React
const ReactDOM = requireFrom('react-dom')
const { createRoot } = requireFrom('react-dom/client')
const { act } = requireFrom('react-dom/test-utils')
const { JSDOM } = requireFrom('jsdom')
mark('modules-loaded')

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const h = React.createElement

// --- fake primitives -------------------------------------------------------

function Menu({ open, anchor, items = [], children, onSelect }) {
  const [submenu, setSubmenu] = useState(null)
  useEffect(() => {
    if (!open) setSubmenu(null)
  }, [open])
  const row = (item, nested) =>
    h(
      'button',
      {
        key: item.id,
        role: 'menuitem',
        disabled: item.disabled,
        'aria-haspopup': nested ? undefined : item.submenu?.length ? 'menu' : undefined,
        onClick: (event) => {
          event.stopPropagation()
          if (item.submenu?.length) {
            setSubmenu((previous) => (previous === item.id ? null : item.id))
            return
          }
          onSelect?.(item.id)
        },
      },
      item.label,
    )
  return h(
    'span',
    null,
    anchor,
    open
      ? h(
          'div',
          { role: 'menu' },
          items.map((item) => {
            if (item.type === 'separator') return h('hr', { key: item.id })
            if (item.type === 'label') return h('div', { key: item.id, className: 'menu-label' }, item.text)
            if (item.submenu?.length) {
              return h(
                'div',
                { key: item.id },
                row(item, false),
                submenu === item.id
                  ? h('div', { role: 'menu' }, item.submenu.map((sub) => row(sub, true)))
                  : null,
              )
            }
            return row(item, false)
          }),
          children,
        )
      : null,
  )
}

const icon = (name) => (props = {}) => h('span', { 'data-icon': name, className: props.className })
const primitives = {
  Menu,
  StateDot: ({ state }) => h('span', { 'data-dot': state }),
  Tooltip: ({ children }) => children,
  Toast: () => null,
  IconChevronRightOutlineRegular: icon('chevron'),
  IconEllipsisOutlineRegular: icon('ellipsis'),
  IconPlusOutlineRegular: icon('plus'),
  IconSearchOutlineRegular: icon('search'),
  IconCloseOutlineRegular: icon('close'),
  IconCheckOutlineRegular: icon('check'),
  IconFolderOpenRegular: icon('folder-open'),
  IconFolderCloseRegular: icon('folder-close'),
  IconPinOutlineRegular: icon('pin'),
  IconPinFillRegular: icon('pin-fill'),
}

// --- fixture ---------------------------------------------------------------

const now = Date.now()
const minutes = (n) => now - n * 60_000

const sessions = {
  phase: 'ready',
  ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
  byId: {
    s1: { id: 's1', displayTitle: '整理 API 文档', updatedAt: minutes(3), running: true, blank: false },
    s2: { id: 's2', displayTitle: '秋招投递清单', updatedAt: minutes(90), running: false, blank: false },
    s3: { id: 's3', displayTitle: '论文实验对比', updatedAt: minutes(300), running: false, blank: false },
    s4: { id: 's4', displayTitle: '子代理任务', updatedAt: minutes(10), running: false, blank: false, origin: 'subagent' },
    s5: { id: 's5', displayTitle: '任务五', updatedAt: minutes(400), running: false, blank: false },
    s6: { id: 's6', displayTitle: '任务六', updatedAt: minutes(500), running: false, blank: false },
    s7: { id: 's7', displayTitle: '任务七', updatedAt: minutes(600), running: false, blank: false },
    s8: { id: 's8', displayTitle: '任务八', updatedAt: minutes(700), running: false, blank: false },
    s9: { id: 's9', displayTitle: '任务九', updatedAt: minutes(800), running: false, blank: false },
    s10: { id: 's10', displayTitle: '任务十', updatedAt: minutes(900), running: false, blank: false },
  },
  projectionsBySession: {},
}

const workspaces = {
  items: [
    {
      workspaceId: 'w1',
      path: 'D:\\develop\\spike',
      title: 'spike',
      sessionIds: ['s1', 's2', 's3', 's5', 's6', 's7', 's8', 's9', 's10'],
      createdAt: '',
      updatedAt: '',
    },
  ],
  archivedSessionIds: [],
  pinnedSessionIds: ['s2'],
  state: 'idle',
  phase: 'ready',
  error: null,
}

const statusMap = new Map([
  ['s1', { running: true, pendingInteraction: undefined, completionUnread: false }],
  ['s2', { running: false, pendingInteraction: undefined, completionUnread: true }],
  ['s3', { running: false, pendingInteraction: undefined, completionUnread: false }],
])

const hostState = {
  version: 1,
  groups: [
    { id: 'g1', name: 'api', color: 'blue', collapsed: false, order: 0 },
    // order 1000 => slot 1: its card renders between the first and second
    // ungrouped rows (composite order: slot * 1000 + rank).
    { id: 'g2', name: '论文组', color: 'green', collapsed: false, order: 1000 },
  ],
  assignments: { s1: 'g1' },
  prefs: { view: 'groups', activity: false },
}

const savedStates = []
dom.window.fetch = async (_url, init) => {
  if ((init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ ok: true, state: hostState }) }
  try {
    savedStates.push(JSON.parse(init?.body ?? '{}').state)
  } catch {
    /* ignore */
  }
  return { ok: true, json: async () => ({ ok: true, savedAt: Date.now() }) }
}
globalThis.fetch = dom.window.fetch

// --- load the bundle -------------------------------------------------------

const source = readFileSync(join(root, 'lib/client.js'), 'utf8')
dom.window.__ModuleLoader__ = {
  load({ factory }) {
    globalThis.__capturedFactory = factory
  },
}
mark('before-eval')
dom.window.eval(source)
mark('after-eval')

const factory = globalThis.__capturedFactory
if (typeof factory !== 'function') throw new Error('bundle did not register a factory')

const mod = factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected require: ${name}`)
})
if (typeof mod.apply !== 'function') throw new Error('bundle did not export apply()')

// --- fake Cordis context ---------------------------------------------------

const calls = []
let capturedOptions = null
let capturedComponent = null
const ctx = {
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  slots: {
    inject(_name, run) {
      return run()
    },
    register(options, component) {
      capturedOptions = options
      capturedComponent = component
      return () => {}
    },
  },
  uiWorkspace: {
    openSession: (id) => calls.push(['open', id]),
    archiveSession: async (id) => calls.push(['archive', id]),
    pinSession: async (id) => calls.push(['pin', id]),
    unpinSession: async (id) => calls.push(['unpin', id]),
    startSession: (id) => calls.push(['start', id]),
  },
  sessions: {
    rename: async (id, title) => {
      calls.push(['rename', id, title])
      return { ok: true, value: { title } }
    },
    fork: async ({ sessionId }) => {
      calls.push(['fork', sessionId])
      return 'child-fork'
    },
  },
}
const clipboard = []
Object.defineProperty(dom.window.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { clipboard.push(text) } },
})

mark('before-apply')
mod.apply(ctx)
mark('after-apply')

if (!capturedOptions || capturedOptions.name !== 'sidebar.workspaces') throw new Error('did not register into sidebar.workspaces')
if (capturedOptions.priority !== -1) throw new Error('expected priority -1 to shadow the shipped browser')

const useSessions = (selector) => selector(sessions)
const useWorkspaces = (selector) => selector(workspaces)
const useSessionStatus = (selector) => selector(statusMap)

const container = document.getElementById('root')
const reactRoot = createRoot(container)
mark('before-render')
await act(async () => {
  reactRoot.render(h(capturedComponent, { wide: true, expandSidebar() {}, useSessions, useWorkspaces, useSessionStatus }))
})
mark('rendered')
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 40))
})
mark('settled')

const text = () => container.textContent
const fail = (message) => {
  console.error('FAIL:', message)
  console.error('--- DOM text ---')
  console.error(text())
  process.exit(1)
}
const click = async (node) => {
  await act(async () => {
    node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
}
const tab = (label) => [...container.querySelectorAll('[role="tab"]')].find((node) => node.textContent.trim() === label)

if (!text().includes('api')) fail('group "api" missing')
if (!text().includes('整理 API 文档')) fail('grouped session missing')
if (!text().includes('秋招投递清单')) fail('ungrouped session missing')
if (text().includes('子代理任务')) fail('subagent session should be hidden')
// A group with slot 1 must sit between the first and second ungrouped rows,
// with no "未分组" header anywhere.
const orderedText = text()
if (!(orderedText.indexOf('秋招投递清单') < orderedText.indexOf('论文组'))) fail('slot-1 group should render after the first ungrouped row')
if (!(orderedText.indexOf('论文组') < orderedText.indexOf('论文实验对比'))) fail('slot-1 group should render before the second ungrouped row')
if (orderedText.includes('未分组')) fail('the group view should not render a 未分组 header')
// Grouped rows sit under a coloured guide line; only an empty group shows the
// dashed "新建任务，或拖拽到这里。" affordance.
const bodies = [...container.querySelectorAll('.dtg-group-body')]
if (bodies.length !== 2) fail(`each group should render a body guide, got ${bodies.length}`)
const emptyBody = bodies.find((node) => node.classList.contains('is-empty'))
if (!emptyBody) fail('the empty group should mark its body as empty')
if (!emptyBody.textContent.includes('新建任务')) fail('an empty group should show the dashed add box')
if (container.querySelectorAll('.dtg-group-drop').length !== 1) fail('only the empty group should show the dashed add box')
if (!container.querySelector('[data-dot="ongoing"]')) fail('running rows should show the spinner')
if (!container.querySelector('.dtg-unread-dot')) fail('unread dot missing')

const groupHeader = [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('api'))
if (!groupHeader) fail('group header missing')
if (!groupHeader.textContent.includes('1')) fail('group count should be 1')

// Row menu -> move an ungrouped session into the group (via the submenu).
const rowNodes = () => [...container.querySelectorAll('.dtg-row')]
if (rowNodes().length !== 9) fail(`expected 9 session rows, got ${rowNodes().length}`)
const menuItems = () => [...container.querySelectorAll('[role="menuitem"]')]
const openRowMenu = async (index) => {
  await act(async () => {
    rowNodes()[index].dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  })
  return menuItems()
}
// Hover actions replace the ⋯ trigger: pin + archive per row.
if (container.querySelectorAll('button[aria-label="置顶"]').length === 0) fail('rows are missing the pin hover action')
if (container.querySelectorAll('button[aria-label="归档"]').length === 0) fail('rows are missing the archive hover action')
const pinButton = container.querySelector('button[aria-label="置顶"]')
const pinId = pinButton.closest('[data-session-id]').getAttribute('data-session-id')
await click(pinButton)
if (!calls.some((entry) => entry[0] === 'pin' && entry[1] === pinId)) fail('hover pin should call uiWorkspace.pinSession')
await openRowMenu(2)
const moveParent = menuItems().find((node) => node.textContent.trim() === '移动到分组')
if (!moveParent) fail('row menu is missing the move section')
await click(moveParent)
const moveToApi = menuItems().find((node) => node.textContent.trim() === 'api')
if (!moveToApi) fail('move submenu is missing the group row')
await click(moveToApi)
const movedHeader = [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('api'))
if (!movedHeader || !movedHeader.textContent.includes('2')) fail('moving a session should raise the group count to 2')
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 450))
})
if (!savedStates.some((state) => state.assignments.s3 === 'g1')) fail('the move was not persisted through PUT /state')

// New row actions: rename, fork, copy (submenu), mark unread.
const rowMenuAt = async (index) => openRowMenu(index)
await rowMenuAt(0)
if (!text().includes('重命名') || !text().includes('分支')) fail('row menu is missing rename/fork')
const copyParent = menuItems().find((node) => node.textContent.trim() === '复制')
if (!copyParent) fail('row menu is missing the copy submenu')
await click(copyParent)
if (!menuItems().some((node) => node.textContent.trim() === '复制工作目录')) fail('copy submenu is missing 复制工作目录')
if (!menuItems().some((node) => node.textContent.trim() === '复制会话 ID')) fail('copy submenu is missing 复制会话 ID')
const forkRow = menuItems().find((node) => node.textContent.trim() === '分支')
await click(forkRow)
if (!calls.some((entry) => entry[0] === 'fork')) fail('fork should call sessions.fork')
if (!calls.some((entry) => entry[0] === 'open' && entry[1] === 'child-fork')) fail('fork should open the child session')
await rowMenuAt(0)
await click(menuItems().find((node) => node.textContent.trim() === '复制'))
const copyCwdRow = menuItems().find((node) => node.textContent.trim() === '复制工作目录')
await click(copyCwdRow)
if (!clipboard.includes('D:\\develop\\spike')) fail(`copy cwd should copy the workspace path, got ${JSON.stringify(clipboard)}`)
await rowMenuAt(0)
const renameRow = [...container.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent.trim() === '重命名')
await click(renameRow)
const rowRenameInput = container.querySelector('input[aria-label="重命名任务"]')
if (!rowRenameInput) fail('rename should replace the row with an input')
await act(async () => {
  rowRenameInput.value = '新名字'
  rowRenameInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
if (!calls.some((entry) => entry[0] === 'rename' && entry[2] === '新名字')) fail('rename should call sessions.rename')
// Submitting without a change closes the editor without touching the Host.
await rowMenuAt(0)
await click(menuItems().find((node) => node.textContent.trim() === '重命名'))
const untouchedRename = container.querySelector('input[aria-label="重命名任务"]')
const renameCallsBefore = calls.filter((entry) => entry[0] === 'rename').length
await act(async () => {
  untouchedRename.value = untouchedRename.defaultValue
  untouchedRename.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
if (container.querySelector('input[aria-label="重命名任务"]')) fail('an unchanged rename should close the editor')
if (calls.filter((entry) => entry[0] === 'rename').length !== renameCallsBefore) fail('an unchanged rename should not call the host')
const idleRow = () => rowNodes().find((node) => node.textContent.includes('论文实验对比'))
const idleIndex = () => rowNodes().indexOf(idleRow())
await rowMenuAt(idleIndex())
const unreadRow = [...container.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent.trim() === '标记为未读')
await click(unreadRow)
if (!idleRow().querySelector('.dtg-unread-dot')) fail('mark unread should surface a blue dot')
// The same item flips to 标记为已读 and clears the dot.
await rowMenuAt(idleIndex())
const readRow = [...container.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent.trim() === '标记为已读')
if (!readRow) fail('an unread row should offer 标记为已读')
await click(readRow)
if (idleRow().querySelector('.dtg-unread-dot')) fail('标记为已读 should clear the blue dot')

// Right-clicking a row opens exactly the same menu as the ⋯ button.
const firstRow = [...container.querySelectorAll('.dtg-row')][1]
await act(async () => {
  firstRow.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
})
if (!text().includes('移动到分组')) fail('right click should open the session menu')
await act(async () => {
  document.body.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
})

// Group menu -> color swatch.
const groupMenus = [...container.querySelectorAll('button[aria-label="分组颜色"]')]
if (groupMenus.length !== 2) fail(`expected 2 group menus, got ${groupMenus.length}`)
await click(groupMenus[1])
const redRow = [...container.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent.trim() === '红色')
if (!redRow) fail('color swatch row missing from the group menu')
await click(redRow)
const paperHeader = () => [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('论文组'))
if (!paperHeader()) fail('second group header missing')
if (paperHeader().style.getPropertyValue('--dtg-group-color') !== '#ee7a7a') fail('picking a color should repaint the group header')

// Group reorder by pointer drag.
const apiHeader = () => [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('api'))
const rect = (top) => () => ({ top, bottom: top + 38, height: 38, left: 0, right: 200, width: 200, x: 0, y: top })
apiHeader().getBoundingClientRect = rect(0)
paperHeader().getBoundingClientRect = rect(42)
await act(async () => {
  paperHeader().dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 50 }))
})
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: -10 }))
})
const duringDrag = [...container.querySelectorAll('.dtg-group-head')].map((node) => node.textContent)
if (duringDrag.some((value) => value.includes('论文组'))) fail('the dragged group should leave the list while dragging')
if (!document.querySelector('.dtg-group-ghost')) fail('the floating drag card should be mounted')
if (!container.querySelector('.dtg-drop-line')) fail('dragging should show an insertion line between rows')
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }))
})
const settledNames = [...container.querySelectorAll('.dtg-group-head')]
  .map((node) => node.textContent)
  .filter((value) => value.includes('api') || value.includes('论文组'))
if (!settledNames[0]?.includes('论文组')) fail(`drop should commit the new order, got ${JSON.stringify(settledNames)}`)
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 450))
})
const lastSaved = savedStates[savedStates.length - 1]
const savedOrder = [...lastSaved.groups].sort((a, b) => a.order - b.order).map((group) => group.name)
if (savedOrder[0] !== '论文组') fail(`reorder was not persisted, got ${JSON.stringify(savedOrder)}`)
if (lastSaved.groups.find((group) => group.id === 'g2').color !== 'red') fail('color choice was not persisted')

// Group ⋯ menu: 编辑 / 全部标为已读 / 归档聊天 / 新建分组 / 删除分组.
const groupActionButtons = [...container.querySelectorAll('button[aria-label="分组操作"]')]
if (groupActionButtons.length !== 2) fail(`expected one ⋯ per group, got ${groupActionButtons.length}`)
await click(groupActionButtons[1])
for (const label of ['编辑', '全部标为已读', '归档聊天', '新建分组', '删除分组']) {
  if (!menuItems().some((node) => node.textContent.trim() === label)) fail(`group menu is missing ${label}`)
}
await click(menuItems().find((node) => node.textContent.trim() === '编辑'))
const groupRename = container.querySelector('input[aria-label="分组名称"]')
if (!groupRename) fail('group 编辑 should open the rename editor')
await act(async () => {
  groupRename.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
})
// Right-clicking a group header opens the same menu as its ⋯.
await act(async () => {
  paperHeader().dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
})
if (!menuItems().some((node) => node.textContent.trim() === '编辑')) fail('right click on a group should open its menu')
await act(async () => {
  document.body.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
})
// 新建分组 only shows a name field while creating; cancelling removes it.
await click(groupActionButtons[1])
await click(menuItems().find((node) => node.textContent.trim() === '新建分组'))
const newGroupInput = container.querySelector('input[aria-label="新分组名称"]')
if (!newGroupInput) fail('新建分组 should reveal the name field')
await act(async () => {
  newGroupInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
})
if (container.querySelector('input[aria-label="新分组名称"]')) fail('cancelling should remove the new-group field')

// 归档聊天 asks for confirmation before archiving (api has rows).
const apiHeadNode = () => [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('api'))
if (apiHeadNode().getAttribute('aria-expanded') === 'false') {
  await click(apiHeadNode())
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)) })
}
const apiActions = () => apiHeadNode().querySelector('button[aria-label="分组操作"]')
await click(apiActions())
await click(menuItems().find((node) => node.textContent.trim() === '归档聊天'))
if (!text().includes('已完成对话？')) fail('归档聊天 should ask for confirmation')
const archiveCancel = [...container.querySelectorAll('.dtg-confirm-inline button')].find(
  (node) => node.textContent.trim() === '取消',
)
await click(archiveCancel)
if (text().includes('已完成对话？')) fail('cancelling should close the archive confirmation')

// Drop a group between two ungrouped rows: api lands after 秋招投递清单 and
// before 任务五 (s3 is inside api itself, so it is not an ungrouped row).
const apiCard = () => [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('api'))
const rowOf = (textValue) => [...container.querySelectorAll('.dtg-row')].find((node) => node.textContent.includes(textValue))
paperHeader().getBoundingClientRect = rect(0)
rowOf('秋招投递清单').getBoundingClientRect = rect(40)
rowOf('任务五').getBoundingClientRect = rect(80)
await act(async () => {
  apiCard().dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 8 }))
})
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 70 }))
})
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }))
})
const interleaved = text()
if (!(interleaved.indexOf('论文组') < interleaved.indexOf('秋招投递清单'))) fail('the other group should stay above')
if (!(interleaved.indexOf('秋招投递清单') < interleaved.indexOf('api'))) fail('api should land after 秋招投递清单')
if (!(interleaved.indexOf('api') < interleaved.indexOf('任务五'))) fail('api should land before 任务五')
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 450))
})
const interleavedSaved = savedStates[savedStates.length - 1]
if (interleavedSaved.groups.find((group) => group.id === 'g1').order !== 1000) {
  fail('an interleaved position should persist as slot * 1000 in the order field')
}

// Dropping above the very first row must reach slot 0, so a group can always be
// dragged back to the top of the list.
paperHeader().getBoundingClientRect = rect(0)
await act(async () => {
  apiCard().dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 8 }))
})
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: -60 }))
})
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }))
})
if (!(text().indexOf('api') < text().indexOf('论文组'))) fail('dropping above the first row should move the group to the top')
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 450))
})
const topSaved = savedStates[savedStates.length - 1]
if (topSaved.groups.find((group) => group.id === 'g1').order !== 0) {
  fail('a top drop should persist as order 0')
}
if (topSaved.groups.find((group) => group.id === 'g2').order >= 1000) {
  fail('the other group should stay in slot 0 after a top drop')
}

// Pointer-dragging a task to the top: it reorders and leaves its group (the
// pointer is over the list background, so the target group is null).
rowNodes().forEach((node, index) => {
  node.getBoundingClientRect = rect(index * 40)
})
const draggedRow = rowNodes()[0]
await act(async () => {
  draggedRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 8 }))
})
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: -20 }))
})
if (!document.querySelector('.dtg-session-ghost')) fail('a dragged task should float a card')
if (!document.querySelector('.dtg-session-line')) fail('a dragged task should show an insertion line')
await act(async () => {
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }))
})
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 450))
})
const afterDragOut = savedStates[savedStates.length - 1]
const draggedId = draggedRow.getAttribute('data-session-id')
if (afterDragOut.assignments[draggedId] !== undefined) fail('dragging a task to the top should ungroup it')
if (afterDragOut.sessionOrder?.[0] !== draggedId) fail('a dragged task should head the manual order')

// Projects view keeps the native five-row window and grows by five.
await click(tab('项目'))
const projectRows = () => [...container.querySelectorAll('.dtg-row')]
if (projectRows().length !== 5) fail(`projects view should start with 5 rows, got ${projectRows().length}`)
const more = [...container.querySelectorAll('button')].find((node) => node.textContent.startsWith('显示更多'))
if (!more) fail('projects view is missing 显示更多')
await click(more)
if (projectRows().length !== 9) fail(`显示更多 should reveal the remaining rows, got ${projectRows().length}`)
const less = [...container.querySelectorAll('button')].find((node) => node.textContent.trim() === '显示更少')
if (!less) fail('projects view is missing 显示更少 after expansion')
await click(less)
if (projectRows().length !== 5) fail(`显示更少 should restore the watermark, got ${projectRows().length}`)
await click(tab('分组'))

// Double-click window: two deliberate clicks toggle twice; a fast pair renames.
const apiHead = () => [...container.querySelectorAll('.dtg-group-head')].find((node) => node.textContent.includes('api'))
const fireClick = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await act(async () => { fireClick(apiHead()) })
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)) })
await act(async () => { fireClick(apiHead()) })
if (container.querySelector('input[aria-label="分组名称"]')) fail('two slow clicks must toggle, not rename')
await act(async () => {
  fireClick(apiHead())
  fireClick(apiHead())
})
const renameInput = container.querySelector('input[aria-label="分组名称"]')
if (!renameInput) fail('a fast double click should open the rename editor')
await act(async () => {
  renameInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
})
if (container.querySelector('input[aria-label="分组名称"]')) fail('Escape should close the rename editor')

// Per-group "new task": starts a session and files it once the blank takes over.
const addButtons = [...container.querySelectorAll('button[aria-label="在分组中新建任务"]')]
if (addButtons.length !== 2) fail(`expected one add button per group, got ${addButtons.length}`)
await click(addButtons[0])
if (!calls.some((entry) => entry[0] === 'start')) fail('the group add button did not start a session')
const currentMarker = document.createElement('div')
currentMarker.setAttribute('data-conversation-session', 'session-new')
document.body.append(currentMarker)
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 400))
})
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 450))
})
const afterNewTask = savedStates[savedStates.length - 1]
if (afterNewTask?.assignments['session-new'] === undefined) fail('the new session was not filed into the group')

// Activity view: bell -> priority + others, then clear the read one.
const bell = [...container.querySelectorAll('button')].find((node) => (node.getAttribute('aria-label') ?? '').startsWith('查看活动'))
if (!bell) fail('activity bell missing')
await click(bell)
mark('activity')

if (!text().includes('活动')) fail('activity header missing')
if (!text().includes('优先级')) fail('priority section missing')
if (!text().includes('其他')) fail('other section missing')

const clear = [...container.querySelectorAll('button')].find((node) => (node.getAttribute('aria-label') ?? '') === '清除已读')
if (!clear) fail('clear-read broom button missing')
if (clear.disabled) fail('clear-read should be enabled while there is something to clear')
await click(clear)
mark('cleared')
const priorityLabel = [...container.querySelectorAll('.dtg-section-label')].find((node) => node.textContent.includes('优先级'))
if (priorityLabel && !priorityLabel.textContent.includes('1')) fail('clearing read should leave only the running session in priority')

console.log('PASS: groups, move, color, drag, project watermark, new-task and activity all render correctly')
clearTimeout(watchdog)
process.exit(0)
