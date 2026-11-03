/**
 * dsh-task-groups — browser half.
 *
 * Replaces the `sidebar.workspaces` browsing region with two additions on top
 * of the shipped session list:
 *
 *   1. user-defined groups ("分组") that sessions can be dragged into, plus a
 *      "项目" view that restores the native Workspace grouping;
 *   2. an activity bell that lists running / waiting / unread sessions first
 *      and lets the reader clear the read ones back into the ordinary list.
 *
 * The entry registers at a lower priority than ui-workspace's browser: if this
 * bundle fails, slot supervision abdicates it and the shipped browser returns.
 *
 * Group definitions and session→group assignments live in the Host state file
 * (lib/index.js), never in localStorage: the Web origin carries a per-launch
 * port, the file does not.
 */
window.__ModuleLoader__.load({
  id: 'dsh-task-groups',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
    const h = React.createElement
    const ReactDOM = (() => {
      try {
        return require('react-dom')
      } catch {
        return undefined
      }
    })()
    const portalTo = (node) => (typeof ReactDOM?.createPortal === 'function' ? ReactDOM.createPortal(node, document.body) : node)

    const P = require('@deepseek-ai/dsh-client-ui-primitives')
    const {
      Menu,
      StateDot,
      Tooltip,
      Toast,
      IconChevronRightOutlineRegular,
      IconEllipsisOutlineRegular,
      IconPlusOutlineRegular,
      IconSearchOutlineRegular,
      IconCloseOutlineRegular,
      IconCheckOutlineRegular,
      IconFolderOpenRegular,
      IconFolderCloseRegular,
      IconPinOutlineRegular,
      IconPinFillRegular,
    } = P

    /** Host state route (lib/index.js). */
    const STATE_URL = '/dsh-task-groups/state'

    /** Swatch order follows the picker the user referenced; gray is the muted option. */
    const GROUP_COLORS = [
      { id: 'gray', value: '#b6b9c2', label: '灰色' },
      { id: 'red', value: '#ee7a7a', label: '红色' },
      { id: 'orange', value: '#f0a05a', label: '橙色' },
      { id: 'yellow', value: '#e6c14b', label: '黄色' },
      { id: 'green', value: '#46c79a', label: '绿色' },
      { id: 'blue', value: '#4aa8e8', label: '蓝色' },
      { id: 'purple', value: '#9b7ff0', label: '紫色' },
      { id: 'pink', value: '#e878b0', label: '粉色' },
    ]

    const EMPTY_STATE = { version: 1, groups: [], assignments: {}, sessionOrder: [], prefs: { view: 'groups', activity: false } }

    /**
     * Groups share one flat list with ungrouped tasks. A group's `order` is a
     * composite: floor(order / SLOT_UNIT) = how many ungrouped rows precede the
     * card, order % SLOT_UNIT = rank among groups in the same slot.
     */
    const SLOT_UNIT = 1000

    /** Module-level host context; one browser region per page. */
    let rootCtx = null

    // ---------------------------------------------------------------------
    // persisted store
    // ---------------------------------------------------------------------

    function normalizeState(raw) {
      const groups = Array.isArray(raw?.groups)
        ? raw.groups
            .filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string')
            .map((group, index) => ({
              id: group.id,
              name: group.name,
              color: GROUP_COLORS.some((entry) => entry.id === group.color) ? group.color : 'gray',
              collapsed: group.collapsed === true,
              /**
               * Composite position: floor(order / SLOT_UNIT) is how many
               * ungrouped tasks render above the card; order % SLOT_UNIT ranks
               * groups that share a slot. Encoding both in `order` keeps older
               * Host builds (which drop unknown fields) from losing placement.
               */
              order: Number.isFinite(group.order) ? Number(group.order) : index,
            }))
        : []
      const known = new Set(groups.map((group) => group.id))
      const assignments = {}
      const source = raw?.assignments && typeof raw.assignments === 'object' ? raw.assignments : {}
      for (const [sessionId, groupId] of Object.entries(source)) {
        if (typeof groupId === 'string' && known.has(groupId)) assignments[sessionId] = groupId
      }
      return {
        version: 1,
        groups,
        assignments,
        sessionOrder: Array.isArray(raw?.sessionOrder)
          ? raw.sessionOrder.filter((id) => typeof id === 'string' && id !== '').slice(0, 5000)
          : [],
        prefs: {
          view: raw?.prefs?.view === 'projects' ? 'projects' : 'groups',
          activity: raw?.prefs?.activity === true,
        },
      }
    }

    function createStore() {
      let state = EMPTY_STATE
      let loaded = false
      let timer = null
      let disposed = false
      const listeners = new Set()

      const emit = () => {
        for (const listener of listeners) listener()
      }

      const persist = () => {
        timer = null
        if (disposed) return
        try {
          void fetch(STATE_URL, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ state }),
          }).then(
            (response) => {
              if (!response.ok) console.warn('[dsh-task-groups] save rejected', response.status)
            },
            (error) => console.warn('[dsh-task-groups] save failed', error),
          )
        } catch (error) {
          console.warn('[dsh-task-groups] save failed', error)
        }
      }

      const schedule = () => {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(persist, 350)
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        get() {
          return state
        },
        loaded() {
          return loaded
        },
        update(updater) {
          const next = typeof updater === 'function' ? updater(state) : updater
          if (next === state) return
          state = next
          emit()
          schedule()
        },
        async load() {
          try {
            const response = await fetch(`${STATE_URL}?t=${Date.now()}`, { cache: 'no-store' })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const body = await response.json()
            if (body?.ok && body.state) store.update(normalizeState(body.state))
          } catch (error) {
            console.warn('[dsh-task-groups] could not read the saved groups', error)
          } finally {
            loaded = true
            emit()
          }
        },
        flush() {
          if (timer !== null) persist()
        },
        dispose() {
          disposed = true
          if (timer !== null) clearTimeout(timer)
          timer = null
        },
      }
    }

    const store = createStore()

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    const cx = (...parts) => parts.filter(Boolean).join(' ')

    const colorOf = (group) => (GROUP_COLORS.find((entry) => entry.id === group?.color) ?? GROUP_COLORS[0]).value

    function relativeLabel(ms) {
      if (!Number.isFinite(ms)) return ''
      const diff = Math.max(0, Date.now() - ms)
      const minute = 60_000
      const hour = 60 * minute
      const day = 24 * hour
      if (diff < minute) return '刚刚'
      if (diff < hour) return `${Math.floor(diff / minute)}分钟`
      if (diff < day) return `${Math.floor(diff / hour)}小时`
      if (diff < 30 * day) return `${Math.floor(diff / day)}天`
      if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}个月`
      return `${Math.floor(diff / (365 * day))}年`
    }

    const statusOf = (map, id) => map?.get?.(id)

    function BellIcon({ size = 16, filled = false }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M8 2.4c-1.95 0-3.5 1.55-3.5 3.5v2.15c0 .78-.3 1.52-.85 2.07l-.5.5c-.42.42-.12 1.13.47 1.13h8.76c.59 0 .89-.71.47-1.13l-.5-.5a2.93 2.93 0 0 1-.85-2.07V5.9c0-1.95-1.55-3.5-3.5-3.5Z',
          fill: filled ? 'currentColor' : 'none',
          fillOpacity: filled ? 0.1 : 0,
        }),
        h('path', { d: 'M6.7 13.1a1.45 1.45 0 0 0 2.6 0' }),
      )
    }

    /** Broom: sweeps read conversations out of the activity list. */
    function BroomIcon({ size = 15 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M13 2.8 9 6.8' }),
        h('path', { d: 'M9 6.8 5.6 12.2' }),
        h('path', { d: 'M9 6.8 10.9 12.2' }),
        h('path', { d: 'M6.3 10.4c1.7-.35 3.2-.35 4.6 0' }),
        h('path', { d: 'M5.5 12.2c2 .45 4.1.45 6 0' }),
      )
    }

    /** Archive box: the row's hover action and the group's archive command. */
    function ArchiveIcon({ size = 15 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M2.6 3.2h10.8v2.6H2.6z' }),
        h('path', { d: 'M3.6 5.8v7h8.8v-7' }),
        h('path', { d: 'M6.4 8.6h3.2' }),
      )
    }

    /** Circled plus used by the per-group "new task" affordances. */
    function IconPlusCircle({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          'aria-hidden': 'true',
        },
        h('circle', { cx: 8, cy: 8, r: 5.7 }),
        h('path', { d: 'M8 5.4v5.2M5.4 8h5.2' }),
      )
    }

    function HashIcon({ color, size = 16, filled = false }) {
      return h(
        'span',
        {
          className: cx('dtg-hash', filled && 'is-filled'),
          style: {
            '--dtg-color': color,
            width: size,
            height: size,
            lineHeight: `${size}px`,
            fontSize: Math.max(9, Math.round(size * 0.72)),
            borderRadius: filled ? '50%' : Math.max(4, Math.round(size * 0.3)),
          },
          'aria-hidden': 'true',
        },
        '#',
      )
    }

    /**
     * Two-segment switch. Deliberately not the shipped `SegmentedControl`: its
     * single sliding pill is positioned from the track width, and inside this
     * narrow, sometimes-throttled sidebar it can be caught between tracks. A
     * per-button raised fill renders in one paint and cannot sit between tabs.
     */
    function ViewToggle({ value, onChange, disabled }) {
      const options = [
        { value: 'groups', label: '分组' },
        { value: 'projects', label: '项目' },
      ]
      return h(
        'div',
        { className: 'dtg-toggle', role: 'tablist', 'aria-label': '任务分类方式' },
        h('span', { className: cx('dtg-toggle-thumb', value === 'projects' && 'is-right'), 'aria-hidden': 'true' }),
        options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              role: 'tab',
              'aria-selected': option.value === value,
              className: cx('dtg-toggle-btn', option.value === value && 'is-active'),
              disabled,
              onClick: () => {
                if (option.value !== value) onChange(option.value)
              },
            },
            option.label,
          ),
        ),
      )
    }

    function IconButton({ label, active, onClick, children, className }) {
      return h(
        Tooltip,
        { label, side: 'bottom', portal: true },
        h(
          'button',
          {
            type: 'button',
            className: cx('dtg-icon-btn', active && 'is-active', className),
            'aria-label': label,
            'aria-pressed': active === undefined ? undefined : active,
            onClick,
          },
          children,
        ),
      )
    }

    // ---------------------------------------------------------------------
    // current conversation (selection highlight)
    // ---------------------------------------------------------------------

    function readCurrentSession() {
      try {
        return document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
      } catch {
        return ''
      }
    }

    function useCurrentSessionId() {
      const [current, setCurrent] = useState(readCurrentSession)
      useEffect(() => {
        let alive = true
        const sync = () => {
          if (!alive) return
          const next = readCurrentSession()
          setCurrent((previous) => (previous === next ? previous : next))
        }
        sync()
        const observer = new MutationObserver(sync)
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-conversation-session'],
        })
        return () => {
          alive = false
          observer.disconnect()
        }
      }, [])
      return current
    }

    // ---------------------------------------------------------------------
    // root
    // ---------------------------------------------------------------------

    function Browser(props) {
      const { wide, expandSidebar, useSessions, useWorkspaces, useSessionStatus } = props
      const state = useSyncExternalStore(store.subscribe, store.get, store.get)
      const stateRef = useRef(state)
      stateRef.current = state
      const loaded = useSyncExternalStore(store.subscribe, store.loaded, store.loaded)
      const currentSession = useCurrentSessionId()

      const sessionState = useSessions((value) => value)
      const workspaceState = useWorkspaces((value) => value)
      const statusMap = useSessionStatus((value) => value)

      const [search, setSearch] = useState(null)
      const searchInputRef = useRef(null)
      const [editingGroup, setEditingGroup] = useState(null)
      const [confirmingGroup, setConfirmingGroup] = useState(null)
      const [menuOpen, setMenuOpen] = useState(false)
      const [groupMenu, setGroupMenu] = useState(null)
      const [groupActions, setGroupActions] = useState(null)
      const [confirmingArchive, setConfirmingArchive] = useState(null)
      const [sessionMenu, setSessionMenu] = useState(null)
      const [toast, setToast] = useState(null)
      const [renamingSession, setRenamingSession] = useState(null)
      const [manualUnread, setManualUnread] = useState(() => new Set())
      const manualUnreadRef = useRef(manualUnread)
      manualUnreadRef.current = manualUnread
      const [keptUnread, setKeptUnread] = useState(() => new Set())
      const [dragging, setDragging] = useState(null)
      const [dropTarget, setDropTarget] = useState(undefined)
      const [ghost, setGhost] = useState(null)
      const [sessionGhost, setSessionGhost] = useState(null)
      const [sessionLine, setSessionLine] = useState(null)
      const sessionGhostElRef = useRef(null)
      const sessionDragRef = useRef(null)
      const sortedRef = useRef([])
      const [dropLine, setDropLine] = useState(null)
      const groupsRef = useRef([])
      const groupElsRef = useRef(new Map())
      const ungroupedRef = useRef([])
      const ungroupedElsRef = useRef(new Map())
      const listRef = useRef(null)
      const ghostElRef = useRef(null)
      const dragRef = useRef(null)
      const dropTargetRef = useRef(null)
      const suppressClickRef = useRef(false)
      const [readAt, setReadAt] = useState({})
      const [collapsedProjects, setCollapsedProjects] = useState({})
      const [projectLimits, setProjectLimits] = useState({})

      useEffect(() => {
        void store.load()
        return () => store.flush()
      }, [])

      // Refresh relative times once a minute; without it a row's "5分钟" would
      // stay frozen until the next session/status change.
      const [, setClock] = useState(0)
      useEffect(() => {
        const timer = setInterval(() => setClock((value) => value + 1), 60_000)
        return () => clearInterval(timer)
      }, [])

      useEffect(() => {
        if (search !== null) {
          const timer = setTimeout(() => searchInputRef.current?.focus(), 0)
          return () => clearTimeout(timer)
        }
        return undefined
      }, [search !== null])

      const notify = useCallback((text) => setToast({ text, key: Date.now() }), [])

      // ----- derived ------------------------------------------------------

      const archived = useMemo(() => new Set(workspaceState.archivedSessionIds), [workspaceState.archivedSessionIds])
      const pinnedIndex = useMemo(() => {
        const map = new Map()
        workspaceState.pinnedSessionIds.forEach((id, index) => map.set(id, index))
        return map
      }, [workspaceState.pinnedSessionIds])

      const sessions = useMemo(() => {
        const rows = []
        for (const id of sessionState.ids) {
          const summary = sessionState.byId[id]
          if (!summary || summary.origin === 'subagent') continue
          if (archived.has(id)) continue
          if (summary.blank && id !== currentSession) continue
          rows.push(summary)
        }
        return rows
      }, [sessionState.ids, sessionState.byId, archived, currentSession])

      const workspaceOf = useMemo(() => {
        const map = new Map()
        for (const item of workspaceState.items) {
          for (const sessionId of item.sessionIds) map.set(sessionId, item)
        }
        return map
      }, [workspaceState.items])

      const groups = useMemo(
        () => [...state.groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
        [state.groups],
      )
      const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
      groupsRef.current = groups

      const sorted = useMemo(() => {
        const compare = (a, b) => {
          const pa = pinnedIndex.has(a.id) ? pinnedIndex.get(a.id) : Number.POSITIVE_INFINITY
          const pb = pinnedIndex.has(b.id) ? pinnedIndex.get(b.id) : Number.POSITIVE_INFINITY
          if (pa !== pb) return pa - pb
          return b.updatedAt - a.updatedAt
        }
        const base = [...sessions].sort(compare)
        const order = state.sessionOrder ?? []
        if (order.length === 0) return base
        // Manual order wins inside each pin band; pinned sessions still lead.
        const position = new Map(order.map((id, index) => [id, index]))
        return base
          .map((session, index) => ({ session, index }))
          .sort((a, b) => {
            const pa = pinnedIndex.has(a.session.id) ? pinnedIndex.get(a.session.id) : Number.POSITIVE_INFINITY
            const pb = pinnedIndex.has(b.session.id) ? pinnedIndex.get(b.session.id) : Number.POSITIVE_INFINITY
            if (pa !== pb) return pa - pb
            const oa = position.has(a.session.id) ? position.get(a.session.id) : -1
            const ob = position.has(b.session.id) ? position.get(b.session.id) : -1
            if (oa !== ob) return oa - ob
            return a.index - b.index
          })
          .map((entry) => entry.session)
      }, [sessions, pinnedIndex, state.sessionOrder])

      sortedRef.current = sorted

      const byGroup = useMemo(() => {
        const buckets = new Map(groups.map((group) => [group.id, []]))
        const ungrouped = []
        for (const session of sorted) {
          const bucket = buckets.get(state.assignments[session.id])
          if (bucket) bucket.push(session)
          else ungrouped.push(session)
        }
        return { buckets, ungrouped }
      }, [sorted, groups, state.assignments])

      const projectRows = useMemo(() => {
        const buckets = []
        const seen = new Set()
        for (const item of workspaceState.items) {
          const rows = []
          for (const session of sorted) {
            if (workspaceOf.get(session.id)?.workspaceId !== item.workspaceId) continue
            rows.push(session)
            seen.add(session.id)
          }
          buckets.push({ workspace: item, rows })
        }
        return { buckets, ungrouped: sorted.filter((session) => !seen.has(session.id)) }
      }, [sorted, workspaceState.items, workspaceOf])

      /**
       * Native sidebar behaviour: an open Workspace shows its first five
       * Sessions, raising the window just enough to cover the last running /
       * waiting / unread / selected one in the first 50. "显示更多" adds five;
       * "显示更少" returns to this baseline.
       */
      const projectWatermark = useCallback(
        (rows) => {
          let lastActive = -1
          rows.forEach((session, index) => {
            if (index >= 50) return
            const status = statusOf(statusMap, session.id)
            if (status?.running || status?.pendingInteraction || status?.completionUnread || session.id === currentSession) {
              lastActive = index
            }
          })
          return Math.max(5, lastActive + 1)
        },
        [statusMap, currentSession],
      )

      const projectLimit = (key, rows) => projectLimits[key] ?? projectWatermark(rows)

      const showMoreProjects = useCallback(
        (key, rows) => {
          setProjectLimits((previous) => ({
            ...previous,
            [key]: (previous[key] ?? projectWatermark(rows)) + 5,
          }))
        },
        [projectWatermark],
      )

      const showLessProjects = useCallback(
        (key, rows) => {
          setProjectLimits((previous) => ({ ...previous, [key]: projectWatermark(rows) }))
        },
        [projectWatermark],
      )

      const isPriority = useCallback(
        (session) => {
          const status = statusOf(statusMap, session.id)
          return Boolean(status?.running || status?.pendingInteraction || status?.completionUnread)
        },
        [statusMap],
      )

      const dismissed = useCallback(
        (session) => {
          const at = readAt[session.id]
          if (at === undefined) return false
          const status = statusOf(statusMap, session.id)
          if (status?.running || status?.pendingInteraction) return false
          return session.updatedAt <= at
        },
        [readAt, statusMap],
      )

      // Unread conversations stay in 优先级 after being opened; only the broom
      // (清除已读) sweeps them into 其他.
      useEffect(() => {
        const unreadIds = sorted
          .filter((session) => statusOf(statusMap, session.id)?.completionUnread)
          .map((session) => session.id)
        if (unreadIds.length === 0) return
        setKeptUnread((previous) => {
          let changed = false
          const next = new Set(previous)
          for (const id of unreadIds) {
            if (!next.has(id)) {
              next.add(id)
              changed = true
            }
          }
          return changed ? next : previous
        })
      }, [sorted, statusMap])

      const priority = useMemo(
        () =>
          sorted.filter(
            (session) =>
              (isPriority(session) || manualUnread.has(session.id) || keptUnread.has(session.id)) && !dismissed(session),
          ),
        [sorted, isPriority, dismissed, manualUnread, keptUnread],
      )
      const rest = useMemo(() => {
        const inPriority = new Set(priority.map((session) => session.id))
        return sorted.filter((session) => !inPriority.has(session.id))
      }, [sorted, priority])

      const query = (search ?? '').trim().toLowerCase()
      const searchResults = useMemo(() => {
        if (query === '') return []
        return sorted.filter((session) => {
          const group = groupById.get(state.assignments[session.id])
          const workspace = workspaceOf.get(session.id)
          return [session.displayTitle, group?.name, workspace?.title]
            .filter(Boolean)
            .some((text) => String(text).toLowerCase().includes(query))
        })
      }, [query, sorted, groupById, state.assignments, workspaceOf])

      // ----- mutations ----------------------------------------------------

      const update = store.update

      const assign = useCallback(
        (sessionId, groupId) => {
          update((previous) => {
            const assignments = { ...previous.assignments }
            if (groupId) assignments[sessionId] = groupId
            else delete assignments[sessionId]
            return { ...previous, assignments }
          })
          if (groupId) {
            const group = state.groups.find((entry) => entry.id === groupId)
            if (group?.collapsed) {
              update((previous) => ({
                ...previous,
                groups: previous.groups.map((entry) => (entry.id === groupId ? { ...entry, collapsed: false } : entry)),
              }))
            }
          }
        },
        [update, state.groups],
      )

      const setPrefs = useCallback(
        (patch) => update((previous) => ({ ...previous, prefs: { ...previous.prefs, ...patch } })),
        [update],
      )

      const openSession = useCallback(
        (sessionId) => {
          try {
            rootCtx.uiWorkspace.openSession(sessionId)
            // Opening marks it read, but a previously unread conversation stays
            // in 优先级 until the broom sweeps it into 其他.
            if (manualUnreadRef.current.has(sessionId)) {
              setManualUnread((previous) => {
                if (!previous.has(sessionId)) return previous
                const next = new Set(previous)
                next.delete(sessionId)
                return next
              })
              setKeptUnread((previous) => (previous.has(sessionId) ? previous : new Set(previous).add(sessionId)))
            }
          } catch (error) {
            console.warn('[dsh-task-groups] open failed', error)
            notify('无法打开这个任务')
          }
        },
        [notify],
      )

      /** Rename a Session through the Host; the title projection updates itself. */
      const renameSessionTo = useCallback(
        async (sessionId, title) => {
          const trimmed = String(title ?? '').trim()
          if (trimmed === '') return false
          try {
            // The public `sessions` service has no rename; the Host contract is
            // exposed on the remote session channel (the catalog wraps it).
            const channel = rootCtx.remote?.session
            if (typeof channel?.rename === 'function') {
              const result = await channel.rename({ sessionId, title: trimmed })
              if (result && result.ok === false) throw new Error(result.error?.message ?? 'rename failed')
              return true
            }
            if (typeof rootCtx.sessions?.rename === 'function') {
              const result = await rootCtx.sessions.rename(sessionId, trimmed)
              if (result && result.ok === false) throw new Error(result.error?.message ?? 'rename failed')
              return true
            }
            throw new Error('rename is not available')
          } catch (error) {
            console.warn('[dsh-task-groups] rename failed', error)
            const detail = error?.rpcError?.message ?? error?.message ?? ''
            notify(detail ? `重命名失败：${String(detail).slice(0, 40)}` : '重命名失败')
            return false
          }
        },
        [notify],
      )

      /** Fork at the last completed turn, then open the child conversation. */
      const forkSession = useCallback(
        async (sessionId) => {
          try {
            if (typeof rootCtx.sessions?.fork === 'function') {
              const childId = await rootCtx.sessions.fork({ sessionId, increaseTitle: true })
              if (typeof childId === 'string' && childId !== '') {
                openSession(childId)
                return
              }
            }
            const result = await rootCtx.remote?.session?.fork({ sessionId })
            if (result && result.ok === false) throw new Error(result.error?.message ?? 'fork failed')
            const childId = result?.value?.sessionId
            if (typeof childId === 'string' && childId !== '') openSession(childId)
          } catch (error) {
            console.warn('[dsh-task-groups] fork failed', error)
            notify('分支失败')
          }
        },
        [notify, openSession],
      )

      const copyText = useCallback(
        async (text) => {
          try {
            const clipboard = typeof window !== 'undefined' ? window.navigator?.clipboard : undefined
            if (!clipboard?.writeText) throw new Error('clipboard unavailable')
            await clipboard.writeText(text)
            notify('已复制')
            return true
          } catch {
            try {
              const area = document.createElement('textarea')
              area.value = text
              area.style.position = 'fixed'
              area.style.top = '-1000px'
              area.style.opacity = '0'
              document.body.append(area)
              area.select()
              const ok = document.execCommand('copy')
              area.remove()
              if (ok) {
                notify('已复制')
                return true
              }
            } catch {}
            notify('复制失败')
            return false
          }
        },
        [notify],
      )

      const archiveSession = useCallback(
        async (sessionId) => {
          try {
            await rootCtx.uiWorkspace.archiveSession(sessionId)
          } catch (error) {
            notify(error?.rpcError?.code === 'workspace/session-active' ? '任务还在运行，无法归档' : '归档失败')
          }
        },
        [notify],
      )

      const togglePin = useCallback(
        async (sessionId, pinned) => {
          try {
            if (pinned) await rootCtx.uiWorkspace.unpinSession(sessionId)
            else await rootCtx.uiWorkspace.pinSession(sessionId)
          } catch {
            notify('置顶失败')
          }
        },
        [notify],
      )

      /**
       * Start a New Session in the current (or first known) Workspace and put
       * it in this group. `startSession` returns nothing, so watch the on-screen
       * conversation id until it changes to the fresh blank, then assign it;
       * a reused blank keeps its id, so fall back to it only when it is blank.
       */
      const startTaskInGroup = useCallback(
        (groupId) => {
          const workspaceId = workspaceOf.get(currentSession)?.workspaceId ?? workspaceState.items[0]?.workspaceId
          const before = readCurrentSession()
          try {
            rootCtx.uiWorkspace.startSession(workspaceId)
          } catch (error) {
            console.warn('[dsh-task-groups] new task failed', error)
            notify('新建任务失败')
            return
          }
          const startedAt = Date.now()
          const timer = setInterval(() => {
            const now = readCurrentSession()
            if (now && now !== before) {
              clearInterval(timer)
              assign(now, groupId)
              return
            }
            if (Date.now() - startedAt < 3000) return
            clearInterval(timer)
            const fallback = now || before
            if (fallback && sessionState.byId[fallback]?.blank) assign(fallback, groupId)
          }, 120)
        },
        [workspaceOf, currentSession, workspaceState.items, assign, notify, sessionState.byId],
      )

      const createGroup = useCallback(
        (name) => {
          const trimmed = name.trim()
          if (trimmed === '') return false
          update((previous) => {
            const id = `g${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
            const palette = GROUP_COLORS.filter((entry) => entry.id !== 'gray')
            const color = palette[previous.groups.length % palette.length].id
            // New groups land right below the existing ones, not at slot 0.
            const maxOrder = previous.groups.reduce((max, group) => Math.max(max, Number(group.order) || 0), -1)
            return {
              ...previous,
              groups: [...previous.groups, { id, name: trimmed, color, collapsed: false, order: maxOrder + 1 }],
            }
          })
          return true
        },
        [update],
      )

      const renameGroup = useCallback(
        (groupId, name) => {
          const trimmed = name.trim()
          if (trimmed === '') return
          update((previous) => ({
            ...previous,
            groups: previous.groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group)),
          }))
        },
        [update],
      )

      const patchGroup = useCallback(
        (groupId, patch) =>
          update((previous) => ({
            ...previous,
            groups: previous.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
          })),
        [update],
      )

      const deleteGroup = useCallback(
        (groupId) =>
          update((previous) => {
            const assignments = {}
            for (const [sessionId, value] of Object.entries(previous.assignments)) {
              if (value !== groupId) assignments[sessionId] = value
            }
            return {
              ...previous,
              groups: previous.groups.filter((group) => group.id !== groupId),
              assignments,
            }
          }),
        [update],
      )

      /**
       * Move a dragged group to `targetOrder` (composite), then renumber every
       * group as slot*SLOT_UNIT + rank so the file stays integral and tidy.
       */
      const placeGroup = useCallback(
        (dragId, targetOrder) =>
          update((previous) => {
            if (!previous.groups.some((group) => group.id === dragId)) return previous
            const next = previous.groups.map((group) => (group.id === dragId ? { ...group, order: targetOrder } : group))
            const sorted = [...next].sort((a, b) => a.order - b.order)
            const counters = new Map()
            const normalized = sorted.map((group) => {
              const slot = Math.max(0, Math.floor(group.order / SLOT_UNIT))
              const rank = counters.get(slot) ?? 0
              counters.set(slot, rank + 1)
              return { ...group, order: slot * SLOT_UNIT + rank }
            })
            return { ...previous, groups: normalized }
          }),
        [update],
      )

      /** Arm a pointer drag; it only becomes a drag after 4px of movement. */
      const beginGroupDrag = useCallback((event, id) => {
        dragRef.current = { id, startX: event.clientX, startY: event.clientY, el: event.currentTarget }
      }, [])

      // Pointer-driven group dragging: HTML5 DnD can only show the browser's
      // translucent ghost, while the reference lifts the whole group card and
      // opens a gap where it will land. Window listeners keep tracking outside
      // the narrow column.
      useEffect(() => {
        const finish = () => {
          const drag = dragRef.current
          dragRef.current = null
          document.body.classList.remove('dtg-group-dragging')
          if (drag?.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(drag.raf)
          if (drag?.active && dropTargetRef.current) {
            placeGroup(drag.id, dropTargetRef.current.order)
          }
          if (drag?.active) setTimeout(() => { suppressClickRef.current = false }, 0)
          else suppressClickRef.current = false
          dropTargetRef.current = null
          setDropLine(null)
          setGhost(null)
        }
        const onMove = (event) => {
          const drag = dragRef.current
          if (!drag) return
          if (!drag.active) {
            if (Math.abs(event.clientX - drag.startX) < 4 && Math.abs(event.clientY - drag.startY) < 4) return
            const rect = drag.el.getBoundingClientRect()
            drag.active = true
            drag.width = rect.width
            drag.height = rect.height
            // Keep the card under the grab point (no jump on pickup); the drop
            // line follows the card's centre, so what you see is where it lands.
            drag.offsetX = drag.startX - rect.left
            drag.offsetY = drag.startY - rect.top
            suppressClickRef.current = true
            document.body.classList.add('dtg-group-dragging')
            setGhost({
              id: drag.id,
              left: Math.round(event.clientX - drag.offsetX),
              top: Math.round(event.clientY - drag.offsetY),
              width: drag.width,
            })
          }

          const listEl = listRef.current
          const listBox = listEl ? listEl.getBoundingClientRect() : null
          if (listEl && listBox) {
            const edge = 40
            if (event.clientY < listBox.top + edge) listEl.scrollTop -= 14
            else if (event.clientY > listBox.bottom - edge) listEl.scrollTop += 14
          }

          const ungrouped = ungroupedRef.current
          const others = groupsRef.current.filter((group) => group.id !== drag.id)
          const slotOf = (group) =>
            Math.max(0, Math.min(ungrouped.length, Math.floor((group.order ?? 0) / SLOT_UNIT)))
          const groupsAt = (slot) => others.filter((group) => slotOf(group) === slot)

          // Top-level rows in render order: each slot emits its group cards,
          // then that slot's session row.
          const items = []
          for (let index = 0; index <= ungrouped.length; index += 1) {
            for (const group of groupsAt(index)) items.push({ kind: 'group', group, el: groupElsRef.current.get(group.id) })
            if (index < ungrouped.length) {
              items.push({ kind: 'session', session: ungrouped[index], el: ungroupedElsRef.current.get(ungrouped[index].id) })
            }
          }

          let insertAt = items.length
          // The lifted card's top edge is what the user lines up with a gap, so
          // compare tops (with a small tolerance) rather than midpoints.
          const anchorTop = event.clientY - drag.offsetY
          for (let index = 0; index < items.length; index += 1) {
            const el = items[index].el
            if (!el) continue
            const rect = el.getBoundingClientRect()
            if (rect.height === 0) continue
            if (anchorTop < rect.top + 6) {
              insertAt = index
              break
            }
          }
          // Hovering the very top of the list always means "put it first", even
          // if the card was grabbed near its bottom edge.
          if (listBox && event.clientY < listBox.top + 28) insertAt = 0

          const above = insertAt > 0 ? items[insertAt - 1] : null
          let targetOrder
          if (above?.kind === 'session') {
            const slot = items.slice(0, insertAt).filter((item) => item.kind === 'session').length
            const peers = groupsAt(slot)
            targetOrder = peers.length ? Math.max(...peers.map((group) => group.order)) + 0.5 : slot * SLOT_UNIT
          } else if (above?.kind === 'group') {
            targetOrder = above.group.order + 0.5
          } else {
            // Inserting above the first row must land in slot 0. Using the
            // minimum of all groups was wrong when every other group lived in a
            // later slot (it produced that slot instead of the very top).
            targetOrder = Math.min(0, ...others.map((group) => group.order)) - 0.5
          }

          dropTargetRef.current = { order: targetOrder }
          setDropLine(insertAt)

          // The ghost is positioned outside React on every frame: a state
          // update per pointermove made the drag stutter on large lists.
          drag.left = Math.round(event.clientX - drag.offsetX)
          drag.top = Math.round(event.clientY - drag.offsetY)
          if (!drag.raf) {
            const apply = () => {
              drag.raf = 0
              const node = ghostElRef.current
              if (!node) return
              node.style.left = `${drag.left}px`
              node.style.top = `${drag.top}px`
            }
            if (typeof requestAnimationFrame === 'function') drag.raf = requestAnimationFrame(apply)
            else apply()
          }
        }
        window.addEventListener('pointermove', onMove, { passive: true })
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        window.addEventListener('blur', finish)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          window.removeEventListener('blur', finish)
          document.body.classList.remove('dtg-group-dragging')
        }
      }, [placeGroup])

      // Pointer-driven session dragging: same feel as group dragging — a
      // floating card follows the cursor, a line shows the gap it will land in,
      // and dropping sets both the manual order and the group.
      const beginSessionDrag = useCallback(
        (event, sessionId) => {
          if (event.button !== 0 && event.button !== -1) return
          if (event.target.closest('button, input, [data-no-drag]')) return
          if (state.prefs.activity || search !== null) return
          if (state.prefs.view !== 'groups' && state.prefs.view !== 'projects') return
          sessionDragRef.current = {
            id: sessionId,
            startX: event.clientX,
            startY: event.clientY,
            el: event.currentTarget,
          }
        },
        [state.prefs.view, state.prefs.activity, search],
      )

      useEffect(() => {
        let listEl = null

        // Single source of truth for "where would this land": used by pointer
        // moves, by list scrolling while the pointer stands still, and once more
        // at release so the drop always matches what is under the cursor.
        const applyTarget = (clientX, clientY) => {
          const drag = sessionDragRef.current
          if (!drag?.active) return null

          if (listEl) {
            const box = listEl.getBoundingClientRect()
            if (clientY < box.top + 40) listEl.scrollTop -= 12
            else if (clientY > box.bottom - 40) listEl.scrollTop += 12
          }

          const rows = [...document.querySelectorAll('[data-session-id]')]
            .map((element) => ({
              el: element,
              id: element.getAttribute('data-session-id'),
              rect: element.getBoundingClientRect(),
            }))
            .filter((row) => row.id !== drag.id && row.rect.height > 0)
            .sort((a, b) => a.rect.top - b.rect.top)

          let at = rows.length
          for (let index = 0; index < rows.length; index += 1) {
            if (clientY < rows[index].rect.top + rows[index].rect.height / 2) {
              at = index
              break
            }
          }

          let groupId = null
          let card = null
          try {
            const hit = document.elementFromPoint?.(clientX, clientY)
            card = hit?.closest?.('[data-group-id]') ?? null
            groupId = card?.getAttribute('data-group-id') ?? null
          } catch {}

          // Inside a group card the insertion point must stay inside that card
          // and follow the row under the pointer, so the line never jumps to a
          // row of the next group.
          let gapY = null
          if (card) {
            const inCard = rows.filter((row) => card.contains(row.el))
            const cardRect = card.getBoundingClientRect()
            const lastInCard = inCard[inCard.length - 1] ?? null
            const hitRow = inCard.find((row) => clientY >= row.rect.top && clientY <= row.rect.bottom) ?? null
            if (hitRow) {
              const lowerHalf = clientY > hitRow.rect.top + hitRow.rect.height / 2
              at = rows.indexOf(hitRow) + (lowerHalf ? 1 : 0)
              gapY = lowerHalf ? Math.min(hitRow.rect.bottom + 1, cardRect.bottom - 2) : hitRow.rect.top
            } else if (lastInCard && clientY > lastInCard.rect.bottom) {
              at = rows.indexOf(lastInCard) + 1
              gapY = Math.min(lastInCard.rect.bottom + 1, cardRect.bottom - 2)
            } else if (inCard.length > 0) {
              at = rows.indexOf(inCard[0])
              gapY = inCard[0].rect.top
            } else {
              // Empty card: insert where the card sits, i.e. right before the
              // first row that follows it in the list.
              const following = rows.findIndex((row) => row.rect.top > cardRect.top)
              at = following === -1 ? rows.length : following
              gapY = cardRect.bottom - 2
            }
          }

          const below = rows[at] ?? null
          const above = at > 0 ? rows[at - 1] : null
          const ref = below ?? above
          if (gapY === null) gapY = below ? below.rect.top : above ? above.rect.bottom : 0

          // A hit outside every group card means "leave the group", but that is
          // only true when the pointer really is in the blank area: a pointer
          // that lands in the gap between two cards should keep the group the
          // insertion point belongs to.
          const firstTop = rows[0]?.rect.top ?? null
          const lastBottom = rows[rows.length - 1]?.rect.bottom ?? null
          const insideList =
            firstTop !== null && lastBottom !== null && clientY >= firstTop - 8 && clientY <= lastBottom + 8
          if (groupId === null && ref && insideList) {
            const gapGroup =
              ref.el.closest('[data-group-id]')?.getAttribute('data-group-id') ?? null
            if (gapGroup !== null) groupId = gapGroup
          }

          // Rebuild the manual order from what is actually on screen, then keep
          // rows hidden behind collapsed groups at the end.
          const visible = rows.map((row) => row.id)
          const next = [...visible.slice(0, at), drag.id, ...visible.slice(at)]
          const seen = new Set(next)
          for (const session of sortedRef.current) {
            if (seen.has(session.id)) continue
            seen.add(session.id)
            next.push(session.id)
          }
          drag.result = { order: next, groupId }
          drag.x = clientX
          drag.y = clientY

          setSessionLine({
            y: Math.round(gapY),
            groupId,
            left: Math.round(ref?.rect.left ?? 8),
            width: Math.round(ref?.rect.width ?? 214),
          })
          return drag.result
        }

        const finish = () => {
          const drag = sessionDragRef.current
          if (!drag) return
          if (drag.active && typeof drag.x === 'number' && typeof drag.y === 'number') {
            // Re-resolve at the release point; a scroll may have moved the list
            // after the last pointermove.
            applyTarget(drag.x, drag.y)
          }
          sessionDragRef.current = null
          document.body.classList.remove('dtg-group-dragging')
          if (drag.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(drag.raf)
          if (drag.active && drag.result) {
            // Projects view only reorders; group membership changes in 分组.
            if (stateRef.current.prefs.view === 'groups') {
              const groupId = drag.result.groupId ?? null
              const currentGroup = stateRef.current.assignments[drag.id] ?? null
              if (groupId !== currentGroup) assign(drag.id, groupId)
            }
            update((previous) => ({ ...previous, sessionOrder: drag.result.order }))
          }
          if (drag.active) setTimeout(() => { suppressClickRef.current = false }, 0)
          setSessionGhost(null)
          setSessionLine(null)
        }

        const onScroll = () => {
          const drag = sessionDragRef.current
          if (drag?.active && typeof drag.x === 'number' && typeof drag.y === 'number') {
            applyTarget(drag.x, drag.y)
          }
        }

        const onMove = (event) => {
          const drag = sessionDragRef.current
          if (!drag) return
          if (!drag.active) {
            if (Math.abs(event.clientX - drag.startX) < 4 && Math.abs(event.clientY - drag.startY) < 4) return
            const rect = drag.el.getBoundingClientRect()
            drag.active = true
            drag.width = rect.width
            drag.offsetX = drag.startX - rect.left
            drag.offsetY = drag.startY - rect.top
            drag.height = rect.height
            suppressClickRef.current = true
            document.body.classList.add('dtg-group-dragging')
            setSessionGhost({
              id: drag.id,
              left: Math.round(event.clientX - drag.offsetX),
              top: Math.round(event.clientY - drag.offsetY),
              width: drag.width,
            })
          }

          applyTarget(event.clientX, event.clientY)

          drag.left = Math.round(event.clientX - drag.offsetX)
          drag.top = Math.round(event.clientY - drag.offsetY)
          if (!drag.raf) {
            const apply = () => {
              drag.raf = 0
              const node = sessionGhostElRef.current
              if (!node) return
              node.style.left = `${drag.left}px`
              node.style.top = `${drag.top}px`
            }
            if (typeof requestAnimationFrame === 'function') drag.raf = requestAnimationFrame(apply)
            else apply()
          }
        }

        listEl = listRef.current
        if (listEl) listEl.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('pointermove', onMove, { passive: true })
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        window.addEventListener('blur', finish)
        return () => {
          if (listEl) listEl.removeEventListener('scroll', onScroll)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          window.removeEventListener('blur', finish)
          document.body.classList.remove('dtg-group-dragging')
        }
      }, [assign, update])

      const collapseAll = useCallback(
        (collapsed) =>
          update((previous) => ({ ...previous, groups: previous.groups.map((group) => ({ ...group, collapsed })) })),
        [update],
      )

      const markRead = useCallback((ids) => {
        const now = Date.now()
        setReadAt((previous) => {
          const next = { ...previous }
          for (const id of ids) next[id] = now
          return next
        })
      }, [])

      /** Group ⋯ → 全部标为已读: clear unread markers for every row in a group. */
      const markGroupRead = useCallback(
        (groupId) => {
          const ids = (byGroup.buckets.get(groupId) ?? []).map((session) => session.id)
          if (ids.length === 0) return
          markRead(ids)
          setManualUnread((previous) => {
            let changed = false
            const next = new Set(previous)
            for (const id of ids) changed = next.delete(id) || changed
            return changed ? next : previous
          })
        },
        [byGroup, markRead],
      )

      /** Group ⋯ → 归档聊天: archive every finished conversation in the group. */
      const archiveGroup = useCallback(
        async (groupId) => {
          const rows = byGroup.buckets.get(groupId) ?? []
          let archived = 0
          for (const session of rows) {
            const status = statusOf(statusMap, session.id)
            if (status?.running || status?.pendingInteraction) continue
            try {
              await rootCtx.uiWorkspace.archiveSession(session.id)
              archived += 1
            } catch {}
          }
          if (archived === 0) notify('这个分组没有可归档的对话')
        },
        [byGroup, statusMap, notify],
      )

      const clearableCount = priority.filter((session) => {
        const status = statusOf(statusMap, session.id)
        return !status?.running && !status?.pendingInteraction
      }).length

      const clearRead = useCallback(() => {
        const ids = priority
          .filter((session) => {
            const status = statusOf(statusMap, session.id)
            return !status?.running && !status?.pendingInteraction
          })
          .map((session) => session.id)
        if (ids.length === 0) {
          notify('没有可清除的已读对话')
          return
        }
        markRead(ids)
        setKeptUnread((previous) => {
          let changed = false
          const next = new Set(previous)
          for (const id of ids) changed = next.delete(id) || changed
          return changed ? next : previous
        })
        setManualUnread((previous) => {
          let changed = false
          const next = new Set(previous)
          for (const id of ids) changed = next.delete(id) || changed
          return changed ? next : previous
        })
      }, [priority, statusMap, markRead, notify])

      /** 标记为已读 from the row menu: clears the dot and the kept priority. */
      const markSessionRead = useCallback(
        (sessionId) => {
          markRead([sessionId])
          setManualUnread((previous) => {
            if (!previous.has(sessionId)) return previous
            const next = new Set(previous)
            next.delete(sessionId)
            return next
          })
          setKeptUnread((previous) => {
            if (!previous.has(sessionId)) return previous
            const next = new Set(previous)
            next.delete(sessionId)
            return next
          })
        },
        [markRead],
      )

      // ----- drag & drop --------------------------------------------------

      const dropProps = (dropId) => ({
        onDragOver: (event) => {
          if (dragging === null) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          if (dropTarget !== dropId) setDropTarget(dropId)
        },
        onDragLeave: (event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return
          setDropTarget((previous) => (previous === dropId ? undefined : previous))
        },
        onDrop: (event) => {
          event.preventDefault()
          event.stopPropagation()
          const sessionId = dragging ?? event.dataTransfer.getData('text/plain')
          setDragging(null)
          setDropTarget(undefined)
          if (!sessionId) return
          assign(sessionId, dropId === 'ungrouped' ? null : dropId)
        },
      })

      const rowApi = {
        ctx: { currentSession, statusMap, groupById, workspaceOf, state, pinnedIndex },
        groups,
        menuId: sessionMenu,
        renaming: renamingSession,
        manualUnread,
        onOpen: openSession,
        onMenu: setSessionMenu,
        onCloseMenu: () => setSessionMenu(null),
        onAssign: assign,
        onPin: togglePin,
        onArchive: archiveSession,
        onStartRename: (sessionId, currentTitle) => setRenamingSession({ id: sessionId, title: currentTitle }),
        onRename: async (sessionId, title) => {
          const trimmed = String(title ?? '').trim()
          const current = renamingSession?.title ?? ''
          // Clicking elsewhere with no change simply closes the editor.
          setRenamingSession((previous) => (previous?.id === sessionId ? null : previous))
          if (trimmed === '' || trimmed === current) return
          await renameSessionTo(sessionId, title)
        },
        onCancelRename: () => setRenamingSession(null),
        onMarkUnread: (sessionId, unread) => {
          if (unread) {
            setManualUnread((previous) => new Set(previous).add(sessionId))
            return
          }
          markSessionRead(sessionId)
        },
        onFork: forkSession,
        onCopy: copyText,
        onRowPointerDown: beginSessionDrag,
        draggedRef: suppressClickRef,
      }

      // ----- rail ---------------------------------------------------------

      if (!wide) {
        return h(
          'div',
          { className: 'dtg-root dtg-rail' },
          h(
            IconButton,
            {
              label: priority.length > 0 ? `查看活动（${priority.length}）` : '查看活动',
              active: state.prefs.activity,
              onClick: () => setPrefs({ activity: !state.prefs.activity }),
            },
            h(BellIcon, { filled: priority.length > 0 }),
            priority.length > 0 ? h('span', { className: 'dtg-bell-dot' }) : null,
          ),
          h(IconButton, { label: '展开任务列表', onClick: () => expandSidebar() }, h(HashIcon, { color: 'currentColor', size: 18 })),
        )
      }

      // ----- header -------------------------------------------------------

      const bellButton = (active) =>
        h(
          IconButton,
          {
            label: active ? '收起活动，返回任务列表' : priority.length > 0 ? `查看活动（${priority.length} 个进行中或未读）` : '查看活动',
            active,
            className: 'dtg-bell-btn',
            onClick: () => setPrefs({ activity: !active }),
          },
          h(BellIcon, { filled: priority.length > 0 }),
          priority.length > 0 ? h('span', { className: 'dtg-bell-dot' }) : null,
        )

      const header = state.prefs.activity
        ? h(
            'div',
            { className: 'dtg-header' },
            h('span', { className: 'dtg-header-title dtg-activity-title' }, '活动'),
            h('span', { className: 'dtg-spacer' }),
            bellButton(true),
            h(
              Tooltip,
              { label: '清除已读', side: 'bottom', portal: true },
              h(
                'button',
                {
                  type: 'button',
                  className: cx('dtg-icon-btn', clearableCount === 0 && 'is-disabled'),
                  'aria-label': '清除已读',
                  disabled: clearableCount === 0,
                  onClick: clearRead,
                },
                h(BroomIcon, { size: 15 }),
              ),
            ),
          )
        : h(
            'div',
            { className: 'dtg-header' },
            h(ViewToggle, {
              value: state.prefs.view,
              onChange: (value) => setPrefs({ view: value }),
              disabled: search !== null,
            }),
            h('span', { className: 'dtg-spacer' }),
            bellButton(false),
            h(Menu, {
              open: menuOpen,
              onClose: () => setMenuOpen(false),
              align: 'end',
              side: 'bottom',
              portal: true,
              anchor: h(
                'button',
                {
                  type: 'button',
                  className: cx('dtg-icon-btn', menuOpen && 'is-active'),
                  'aria-label': '任务列表选项',
                  onClick: () => setMenuOpen((value) => !value),
                },
                h(IconEllipsisOutlineRegular, { size: 16 }),
              ),
              items: [
                { id: 'search', label: '搜索任务', icon: h(IconSearchOutlineRegular, { size: 16 }) },
                { id: 'new-group', label: '新建分组', icon: h(IconPlusOutlineRegular, { size: 16 }) },
                { type: 'separator', id: 'sep-1' },
                { id: 'collapse', label: '全部折叠' },
                { id: 'expand', label: '全部展开' },
                { type: 'separator', id: 'sep-2' },
                { id: 'view-groups', label: '按分组查看', disabled: state.prefs.view === 'groups' },
                { id: 'view-projects', label: '按项目查看', disabled: state.prefs.view === 'projects' },
              ],
              onSelect: (id) => {
                setMenuOpen(false)
                if (id === 'search') setSearch('')
                else if (id === 'new-group') setEditingGroup({ id: null, name: '' })
                else if (id === 'collapse') collapseAll(true)
                else if (id === 'expand') collapseAll(false)
                else if (id === 'view-groups') setPrefs({ view: 'groups' })
                else if (id === 'view-projects') setPrefs({ view: 'projects' })
              },
            }),
          )

      const searchRow =
        search === null
          ? null
          : h(
              'div',
              { className: 'dtg-search-row' },
              h(IconSearchOutlineRegular, { size: 16, className: 'dtg-search-icon' }),
              h('input', {
                ref: searchInputRef,
                className: 'dtg-search-input',
                value: search,
                placeholder: '搜索任务、分组或项目',
                'aria-label': '搜索任务',
                onChange: (event) => setSearch(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') setSearch(null)
                },
              }),
              h(
                'button',
                { type: 'button', className: 'dtg-icon-btn dtg-icon-btn-sm', 'aria-label': '关闭搜索', onClick: () => setSearch(null) },
                h(IconCloseOutlineRegular, { size: 14 }),
              ),
            )

      // ----- body ---------------------------------------------------------

      let body
      if (!loaded || sessionState.phase !== 'ready') {
        body = h(
          'div',
          { key: 'empty', className: 'dtg-list' },
          h('div', { className: 'dtg-skeleton' }),
          h('div', { className: 'dtg-skeleton dtg-skeleton-short' }),
          h('div', { className: 'dtg-skeleton' }),
          h('div', { className: 'dtg-skeleton dtg-skeleton-short' }),
        )
      } else if (query !== '') {
        body = h(
          'div',
          { key: 'search', className: 'dtg-list', role: 'tree', 'aria-label': '搜索结果' },
          searchResults.length === 0
            ? h('div', { className: 'dtg-empty' }, `没有找到“${search?.trim()}”`)
            : searchResults.map((session) =>
                h(SessionRow, {
                  key: session.id,
                  session,
                  api: rowApi,
                  hint: groupById.get(state.assignments[session.id])?.name ?? workspaceOf.get(session.id)?.title ?? '',
                }),
              ),
        )
      } else if (state.prefs.activity) {
        body = h(
          'div',
          { key: 'activity', className: 'dtg-list', role: 'tree', 'aria-label': '活动' },
          h(
            'div',
            { className: 'dtg-section-label' },
            '优先级',
            h('span', { className: 'dtg-spacer' }),
            h('span', { className: 'dtg-count' }, String(priority.length)),
          ),
          priority.length === 0
            ? h('div', { className: 'dtg-empty dtg-empty-sm' }, '当前没有正在进行的对话')
            : priority.map((session) =>
                h(SessionRow, {
                  key: session.id,
                  session,
                  api: rowApi,
                  priority: true,
                }),
              ),
          h(
            'div',
            { className: 'dtg-section-label' },
            '其他',
            h('span', { className: 'dtg-spacer' }),
            h('span', { className: 'dtg-count' }, String(rest.length)),
          ),
          rest.map((session) => h(SessionRow, { key: session.id, session, api: rowApi })),
        )
      } else if (state.prefs.view === 'projects') {
        body = h(
          'div',
          { key: 'projects', className: 'dtg-list', role: 'tree', 'aria-label': '项目' },
          projectRows.buckets.map(({ workspace, rows }) =>
            h(ProjectSection, {
              key: workspace.workspaceId,
              workspace,
              rows,
              api: rowApi,
              collapsed: Boolean(collapsedProjects[workspace.workspaceId]),
              onToggle: () => setCollapsedProjects((previous) => ({ ...previous, [workspace.workspaceId]: !previous[workspace.workspaceId] })),
              onCreate: () => rootCtx.uiWorkspace.startSession(workspace.workspaceId),
              limit: projectLimit(workspace.workspaceId, rows),
              expanded: projectLimits[workspace.workspaceId] !== undefined,
              onShowMore: () => showMoreProjects(workspace.workspaceId, rows),
              onShowLess: () => showLessProjects(workspace.workspaceId, rows),
            }),
          ),
          projectRows.ungrouped.length > 0
            ? h(ProjectSection, {
                key: '__ungrouped',
                workspace: null,
                rows: projectRows.ungrouped,
                api: rowApi,
                collapsed: Boolean(collapsedProjects.__ungrouped),
                onToggle: () => setCollapsedProjects((previous) => ({ ...previous, __ungrouped: !previous.__ungrouped })),
                limit: projectLimit('__ungrouped', projectRows.ungrouped),
                expanded: projectLimits.__ungrouped !== undefined,
                onShowMore: () => showMoreProjects('__ungrouped', projectRows.ungrouped),
                onShowLess: () => showLessProjects('__ungrouped', projectRows.ungrouped),
              })
            : null,
          projectRows.buckets.length === 0 && projectRows.ungrouped.length === 0
            ? h('div', { className: 'dtg-empty' }, '还没有任务')
            : null,
        )
      } else {
        // One flat list: ungrouped tasks and group cards interleaved. A group's
        // `slot` counts how many ungrouped rows render above its card, so it can
        // sit anywhere — including between two ungrouped tasks. There is no
        // "未分组" header; ungrouped tasks are simply rows without a group.
        const visibleGroups = ghost ? groups.filter((group) => group.id !== ghost.id) : groups
        const ungroupedRows = byGroup.ungrouped
        ungroupedRef.current = ungroupedRows
        const visibleSessionIds = new Set(ungroupedRows.map((session) => session.id))
        for (const id of [...ungroupedElsRef.current.keys()]) {
          if (!visibleSessionIds.has(id)) ungroupedElsRef.current.delete(id)
        }

        const groupsBySlot = new Map()
        for (const group of visibleGroups) {
          const slot = Math.max(0, Math.min(ungroupedRows.length, Math.floor((group.order ?? 0) / SLOT_UNIT)))
          if (!groupsBySlot.has(slot)) groupsBySlot.set(slot, [])
          groupsBySlot.get(slot).push(group)
        }

        const renderGroup = (group) =>
          h(GroupSection, {
            key: group.id,
            group,
            rows: byGroup.buckets.get(group.id) ?? [],
            api: rowApi,
            editing: editingGroup?.id === group.id ? editingGroup : null,
            confirming: confirmingGroup === group.id,
            menuOpen: groupMenu === group.id,
            actionsOpen: groupActions === group.id,
            onActionsOpen: () => setGroupActions(group.id),
            onActionsClose: () => setGroupActions(null),
            onMarkAllRead: () => markGroupRead(group.id),
            onArchiveAll: () => { void archiveGroup(group.id) },
            archiveConfirm: confirmingArchive === group.id,
            onArchiveRequest: () => setConfirmingArchive(group.id),
            onArchiveCancel: () => setConfirmingArchive(null),
            onArchiveConfirm: () => {
              setConfirmingArchive(null)
              void archiveGroup(group.id)
            },
            onNewGroup: () => setEditingGroup({ id: null, name: '' }),
            isDrop: dropTarget === group.id,
            dropProps: dropProps(group.id),
            onToggle: () => patchGroup(group.id, { collapsed: !group.collapsed }),
            onMenuOpen: () => setGroupMenu(group.id),
            onMenuClose: () => setGroupMenu(null),
            onRename: (name) => {
              renameGroup(group.id, name)
              setEditingGroup(null)
            },
            onEditCancel: () => setEditingGroup(null),
            onStartRename: () => setEditingGroup({ id: group.id, name: group.name }),
            onDelete: () => {
              deleteGroup(group.id)
              setConfirmingGroup(null)
            },
            onConfirmCancel: () => setConfirmingGroup(null),
            onRequestDelete: () => setConfirmingGroup(group.id),
            onColor: (color) => patchGroup(group.id, { color }),
            onNewTask: () => startTaskInGroup(group.id),
            dragging: ghost?.id === group.id,
            suppressClickRef,
            dragRefStart: beginGroupDrag,
            registerEl: (element) => {
              if (element) groupElsRef.current.set(group.id, element)
              else groupElsRef.current.delete(group.id)
            },
          })

        const renderSession = (session) =>
          h(SessionRow, {
            key: session.id,
            session,
            api: rowApi,
            rowRef: (element) => {
              if (element) ungroupedElsRef.current.set(session.id, element)
              else ungroupedElsRef.current.delete(session.id)
            },
          })

        const rows = []
        // The "new group" affordance sits right below the last group rather than
        // at the very bottom of the list.
        let newGroupAt = 0
        for (let index = 0; index <= ungroupedRows.length; index += 1) {
          for (const group of groupsBySlot.get(index) ?? []) {
            rows.push(renderGroup(group))
            newGroupAt = rows.length
          }
          if (index < ungroupedRows.length) rows.push(renderSession(ungroupedRows[index]))
        }
        // Only while creating: a name field appears below the last group. The
        // resting list has no permanent "new group" button.
        if (editingGroup && editingGroup.id === null) {
          rows.splice(
            newGroupAt,
            0,
            h(GroupEditor, {
              key: 'new-group',
              initial: '',
              label: '新分组名称',
              onSubmit: (name) => {
                if (createGroup(name)) setEditingGroup(null)
              },
              onCancel: () => setEditingGroup(null),
            }),
          )
        }
        if (dropLine !== null) {
          // The editor shifts every row after it, so offset the insertion line.
          const shifted = editingGroup && editingGroup.id === null && newGroupAt <= dropLine ? 1 : 0
          const at = dropLine + shifted
          rows.splice(Math.max(0, Math.min(rows.length, at)), 0, h('div', {
            key: 'drop-line',
            className: 'dtg-drop-line',
            'aria-hidden': 'true',
          }))
        }

        body = h(
          'div',
          {
            key: 'groups',
            ref: listRef,
            className: 'dtg-list',
            role: 'tree',
            'aria-label': '分组',
            // Dropping a session on the list background moves it out of its group.
            onDragOver: (event) => {
              if (dragging === null) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (dropTarget !== 'ungrouped') setDropTarget('ungrouped')
            },
            onDragLeave: (event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              setDropTarget((previous) => (previous === 'ungrouped' ? undefined : previous))
            },
            onDrop: (event) => {
              event.preventDefault()
              const sessionId = dragging ?? event.dataTransfer.getData('text/plain')
              setDragging(null)
              setDropTarget(undefined)
              if (sessionId) assign(sessionId, null)
            },
          },
          rows,
          groups.length === 0 && ungroupedRows.length === 0 ? h('div', { className: 'dtg-empty' }, '还没有任务') : null,
        )
      }

      const ghostGroup = ghost ? groupById.get(ghost.id) : null
      const ghostNode =
        ghost && ghostGroup
          ? portalTo(
              h(
                'div',
                {
                  ref: ghostElRef,
                  className: 'dtg-group-head dtg-group-card dtg-group-ghost',
                  style: { left: ghost.left, top: ghost.top, width: ghost.width, '--dtg-group-color': colorOf(ghostGroup) },
                  'aria-hidden': 'true',
                },
                h('span', { className: cx('dtg-chevron', !ghostGroup.collapsed && 'is-open') }, h(IconChevronRightOutlineRegular, { size: 14 })),
                h(HashIcon, { color: colorOf(ghostGroup) }),
                h('span', { className: 'dtg-group-name' }, ghostGroup.name),
                h('span', { className: 'dtg-count' }, String((byGroup.buckets.get(ghostGroup.id) ?? []).length)),
              ),
            )
          : null

      const sessionGhostSession = sessionGhost ? sortedRef.current.find((session) => session.id === sessionGhost.id) : null
      const sessionGhostNode =
        sessionGhost && sessionGhostSession
          ? portalTo(
              h(
                'div',
                {
                  ref: sessionGhostElRef,
                  className: 'dtg-session-ghost',
                  style: { left: sessionGhost.left, top: sessionGhost.top, width: sessionGhost.width },
                  'aria-hidden': 'true',
                },
                h('span', { className: 'dtg-session-ghost-title' }, sessionGhostSession.displayTitle || '新会话'),
              ),
            )
          : null
      const sessionLineNode = sessionLine
        ? portalTo(
            h('div', {
              className: 'dtg-session-line',
              style: { top: sessionLine.y, left: sessionLine.left, width: sessionLine.width },
              'aria-hidden': 'true',
            }),
          )
        : null

      return h(
        'div',
        { className: 'dtg-root', 'data-dtg-root': '' },
        header,
        searchRow,
        body,
        ghostNode,
        sessionGhostNode,
        sessionLineNode,
        toast ? h(Toast, { key: toast.key, text: toast.text, onDone: () => setToast(null) }) : null,
      )
    }

    // ---------------------------------------------------------------------
    // session row
    // ---------------------------------------------------------------------

    function SessionRow({ session, api, priority, trailing, hint, rowRef }) {
      const { ctx, groups } = api
      const committedRef = useRef(false)
      const renamingId = api.renaming?.id ?? null
      useEffect(() => {
        committedRef.current = false
      }, [renamingId])
      const status = statusOf(ctx.statusMap, session.id)
      const selected = ctx.currentSession === session.id
      const pinned = ctx.pinnedIndex.has(session.id)
      const groupId = ctx.state.assignments[session.id]
      const group = groupId ? ctx.groupById.get(groupId) : undefined
      const menuOpen = api.menuId === session.id
      const manualUnread = Boolean(api.manualUnread?.has(session.id))

      let meta = relativeLabel(session.updatedAt)
      let metaClass = ''
      if (status?.pendingInteraction) {
        meta = '待确认'
        metaClass = 'is-warn'
      } else if (status?.running) {
        meta = ''
        metaClass = 'is-live'
      } else if (status?.completionUnread || manualUnread) {
        // Unread shows a blue dot instead of the word.
        meta = ''
        metaClass = 'is-unread'
      }
      const unread = Boolean(status?.completionUnread) || manualUnread

      const dotState = status?.pendingInteraction
        ? 'warning'
        : status?.completionUnread
          ? 'done'
          : manualUnread
            ? 'done'
            : null

      // Submenu parents carry a trailing chevron; the primitive only marks them
      // with aria-haspopup, which is invisible.
      const submenuLabel = (text) =>
        h(
          'span',
          { className: 'dtg-submenu-label' },
          h('span', null, text),
          h(IconChevronRightOutlineRegular, { size: 12, className: 'dtg-submenu-caret' }),
        )

      const items = [
        { id: 'open', label: '打开任务' },
        { type: 'separator', id: 'sep-open' },
        { id: 'rename', label: '重命名' },
        {
          id: 'pin',
          label: pinned ? '取消置顶' : '置顶',
        },
        { id: 'mark-unread', label: manualUnread ? '标记为已读' : '标记为未读' },
        { id: 'fork', label: '分支' },
        { type: 'separator', id: 'sep-copy' },
        {
          id: 'copy',
          label: submenuLabel('复制'),
          submenu: [
            { id: 'copy-cwd', label: '复制工作目录', disabled: !ctx.workspaceOf.get(session.id)?.path },
            { id: 'copy-id', label: '复制会话 ID' },
          ],
        },
        {
          id: 'move',
          label: submenuLabel('移动到分组'),
          submenu: [
            ...groups.map((entry) => ({
              id: `move:${entry.id}`,
              label: entry.name,
              icon: h(HashIcon, { color: colorOf(entry), size: 14 }),
            })),
            { id: 'move:', label: '移出分组', disabled: !groupId },
          ],
        },
        { type: 'separator', id: 'sep-archive' },
        { id: 'archive', label: status?.running ? '运行中，无法归档' : '归档', disabled: Boolean(status?.running) },
      ]

      const onSelect = (id) => {
        api.onCloseMenu()
        if (id === 'open') api.onOpen(session.id)
        else if (id === 'rename') api.onStartRename(session.id, title)
        else if (id === 'pin') api.onPin(session.id, pinned)
        else if (id === 'mark-unread') api.onMarkUnread(session.id, !manualUnread)
        else if (id === 'fork') api.onFork(session.id)
        else if (id === 'copy-cwd') api.onCopy(ctx.workspaceOf.get(session.id)?.path ?? '')
        else if (id === 'copy-id') api.onCopy(session.id)
        else if (id === 'archive') api.onArchive(session.id)
        else if (id.startsWith('move:')) api.onAssign(session.id, id.slice(5) || null)
      }

      const title = session.blank ? '新会话' : session.displayTitle || '未命名'
      const workspaceTitle = ctx.workspaceOf.get(session.id)?.title ?? ''

      if (api.renaming && api.renaming.id === session.id) {
        const commitRename = (event) => {
          if (committedRef.current) return
          committedRef.current = true
          api.onRename(session.id, event.currentTarget.value)
        }
        return h(
          'div',
          { ref: rowRef, className: 'dtg-row dtg-renaming' },
          h('input', {
            className: 'dtg-rename-input',
            defaultValue: api.renaming.title,
            autoFocus: true,
            'aria-label': '重命名任务',
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename(event)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                committedRef.current = true
                api.onCancelRename()
              }
            },
            onBlur: commitRename,
          }),
        )
      }

      return h(
        'div',
        {
          ref: rowRef,
          className: cx('dtg-row', 'dtg-sessionRow', selected && 'is-selected', menuOpen && 'is-menu-open'),
          role: 'treeitem',
          'aria-selected': selected,
          'aria-label': title,
          title: [group ? `#${group.name}` : '', hint || workspaceTitle, title].filter(Boolean).join(' · '),
          tabIndex: -1,
          'data-session-id': session.id,
          draggable: false,
          onDragStart: (event) => event.preventDefault(),
          onClick: () => {
            if (api.draggedRef?.current) return
            api.onOpen(session.id)
          },
          onContextMenu: (event) => {
            event.preventDefault()
            event.stopPropagation()
            api.onMenu(session.id)
          },
          onPointerDown: (event) => api.onRowPointerDown(event, session.id),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              api.onOpen(session.id)
            }
          },
        },
        h('span', { className: 'dtg-dot-slot' }, dotState ? h(StateDot, { state: dotState, size: dotState === 'ongoing' ? 12 : 8 }) : null),
        h('span', { className: 'dtg-title' }, title),
        hint ? h('span', { className: 'dtg-hint' }, hint) : null,
        h(
          'span',
          { className: 'dtg-indicators' },
          pinned ? h('span', { className: 'dtg-pin' }, h(IconPinFillRegular, { size: 14 })) : null,
          status?.running
            ? h('span', { className: 'dtg-unread-slot' }, h(StateDot, { state: 'ongoing', size: 12 }))
            : unread
              ? h('span', { className: 'dtg-unread-slot' }, h('span', { className: 'dtg-unread-dot', title: '未读' }))
              : h('span', { className: cx('dtg-meta', metaClass) }, meta),
        ),
        h(
          'span',
          { className: 'dtg-row-actions', onClick: (event) => event.stopPropagation() },
          h(
            Tooltip,
            { label: pinned ? '取消置顶' : '置顶', side: 'bottom', portal: true },
            h(
              'button',
              {
                type: 'button',
                className: 'dtg-action',
                'aria-label': pinned ? '取消置顶' : '置顶',
                onClick: (event) => {
                  event.stopPropagation()
                  api.onPin(session.id, pinned)
                },
              },
              pinned ? h(IconPinFillRegular, { size: 14 }) : h(IconPinOutlineRegular, { size: 14 }),
            ),
          ),
          h(
            Tooltip,
            { label: status?.running ? '运行中，无法归档' : '归档', side: 'bottom', portal: true },
            h(
              'button',
              {
                type: 'button',
                className: 'dtg-action',
                'aria-label': '归档',
                disabled: Boolean(status?.running),
                onClick: (event) => {
                  event.stopPropagation()
                  api.onArchive(session.id)
                },
              },
              h(ArchiveIcon, { size: 14 }),
            ),
          ),
          h(Menu, {
            open: menuOpen,
            onClose: api.onCloseMenu,
            align: 'end',
            side: 'bottom',
            portal: true,
            listClassName: 'dtg-menu-wide',
            anchor: h('span', { className: 'dtg-row-menu-anchor', 'aria-hidden': 'true' }),
            items,
            onSelect,
          }),
          trailing ?? null,
        ),
      )
    }

    // ---------------------------------------------------------------------
    // sections
    // ---------------------------------------------------------------------

    function GroupSection({
      group,
      rows,
      api,
      editing,
      confirming,
      menuOpen,
      isDrop,
      dropProps,
      onToggle,
      onMenuOpen,
      onMenuClose,
      actionsOpen,
      onActionsOpen,
      onActionsClose,
      onMarkAllRead,
      onArchiveAll,
      archiveConfirm,
      onArchiveRequest,
      onArchiveCancel,
      onArchiveConfirm,
      onNewGroup,
      onRename,
      onEditCancel,
      onStartRename,
      onDelete,
      onConfirmCancel,
      onRequestDelete,
      onColor,
      onNewTask,
      dragging,
      suppressClickRef,
      registerEl,
      dragRefStart,
    }) {
      const color = colorOf(group)
      const lastClickRef = useRef(0)
      const dragBlocked = () => Boolean(suppressClickRef?.current)
      const head = confirming
        ? h(
            'div',
            { className: 'dtg-confirm' },
            h('span', { className: 'dtg-confirm-text' }, `删除“${group.name}”？`),
            h('button', { type: 'button', className: 'dtg-confirm-danger', onClick: onDelete }, '删除'),
            h('button', { type: 'button', className: 'dtg-confirm-cancel', onClick: onConfirmCancel }, '取消'),
          )
        : editing
          ? h(GroupEditor, { initial: editing.name, label: '分组名称', onSubmit: onRename, onCancel: onEditCancel })
          : h(
              'div',
              {
                ref: registerEl,
                className: cx('dtg-group-head', 'dtg-group-card', dragging && 'is-dragging', menuOpen && 'is-menu-open', actionsOpen && 'is-menu-open'),
                onContextMenu: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onActionsOpen()
                },
                onClick: (event) => {
                  if (dragBlocked()) {
                    event.stopPropagation()
                    event.preventDefault()
                    return
                  }
                  // A short (250ms) manual double-click window: the OS default
                  // is ~500ms, which turned two ordinary expand/collapse clicks
                  // into a rename.
                  const now = Date.now()
                  if (now - lastClickRef.current <= 250) {
                    lastClickRef.current = 0
                    event.stopPropagation()
                    onStartRename()
                    return
                  }
                  lastClickRef.current = now
                  onToggle()
                },
                role: 'treeitem',
                'aria-expanded': !group.collapsed,
                tabIndex: -1,
                title: `${group.name}（拖动排序，双击重命名）`,
                style: { '--dtg-group-color': color },
                onPointerDown: (event) => {
                  if (event.button !== 0 && event.button !== -1) return
                  if (event.target.closest('[data-no-drag]')) return
                  dragRefStart(event, group.id)
                },
              },
              h(Menu, {
                open: menuOpen,
                onClose: onMenuClose,
                align: 'start',
                side: 'bottom',
                portal: true,
                selectedId: `color:${group.color}`,
                anchor: h(
                  Tooltip,
                  { label: '分组颜色 / 重命名 / 删除', side: 'bottom', portal: true },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dtg-group-color',
                      'aria-label': '分组颜色',
                      'data-no-drag': '',
                      onPointerDown: (event) => event.stopPropagation(),
                      onClick: (event) => {
                        event.stopPropagation()
                        onMenuOpen()
                      },
                    },
                    h(HashIcon, { color, filled: true, size: 22 }),
                  ),
                ),
                items: [
                  { type: 'label', id: 'color-label', text: '分组颜色' },
                  ...GROUP_COLORS.map((entry) => ({
                    id: `color:${entry.id}`,
                    label: entry.label,
                    icon: h('span', { className: 'dtg-swatch', style: { background: entry.value } }),
                  })),
                  { type: 'separator', id: 'sep-group-1' },
                  { id: 'rename', label: '重命名' },
                  { id: 'delete', label: '删除分组', danger: true },
                ],
                onSelect: (id) => {
                  onMenuClose()
                  if (id.startsWith('color:')) onColor(id.slice(6))
                  else if (id === 'rename') onStartRename()
                  else if (id === 'delete') onRequestDelete()
                },
              }),
              h('span', { className: 'dtg-group-name' }, group.name),
              h('span', { className: cx('dtg-chevron', !group.collapsed && 'is-open') }, h(IconChevronRightOutlineRegular, { size: 14 })),
              h('span', { className: 'dtg-spacer' }),
              h('span', { className: 'dtg-count' }, String(rows.length)),
              h(
                Tooltip,
                { label: '在此分组新建任务', side: 'bottom', portal: true },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dtg-group-add',
                    'aria-label': '在分组中新建任务',
                    'data-no-drag': '',
                    onPointerDown: (event) => event.stopPropagation(),
                    onClick: (event) => {
                      event.stopPropagation()
                      onNewTask()
                    },
                  },
                  h(IconPlusCircle, { size: 16 }),
                ),
              ),
              h(Menu, {
                open: actionsOpen,
                onClose: onActionsClose,
                align: 'end',
                side: 'bottom',
                portal: true,
                listClassName: 'dtg-menu-wide',
                anchor: h(
                  Tooltip,
                  { label: '分组操作', side: 'bottom', portal: true },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dtg-action',
                      'aria-label': '分组操作',
                      'data-no-drag': '',
                      onPointerDown: (event) => event.stopPropagation(),
                      onClick: (event) => {
                        event.stopPropagation()
                        onActionsOpen()
                      },
                    },
                    h(IconEllipsisOutlineRegular, { size: 14 }),
                  ),
                ),
                items: [
                  { id: 'edit', label: '编辑' },
                  { type: 'separator', id: 'sep-ga1' },
                  { id: 'read-all', label: '全部标为已读', disabled: rows.length === 0 },
                  { id: 'archive-all', label: '归档聊天', disabled: rows.length === 0 },
                  { type: 'separator', id: 'sep-ga2' },
                  { id: 'new-group', label: '新建分组' },
                  { id: 'delete', label: '删除分组', danger: true },
                ],
                onSelect: (id) => {
                  onActionsClose()
                  if (id === 'edit') onStartRename()
                  else if (id === 'read-all') onMarkAllRead()
                  else if (id === 'archive-all') onArchiveRequest()
                  else if (id === 'new-group') onNewGroup()
                  else if (id === 'delete') onRequestDelete()
                },
              }),
            )

      return h(
        'div',
        {
          className: cx('dtg-section', isDrop && 'is-drop'),
          'data-group-id': group.id,
          ...dropProps,
        },
        head,
        group.collapsed
          ? null
          : archiveConfirm
            ? h(
                'div',
                { key: 'body', className: 'dtg-group-body' },
                h(
                  'div',
                  { className: 'dtg-confirm dtg-confirm-inline' },
                  h('span', { className: 'dtg-confirm-text' }, `归档“${group.name}”里的已完成对话？`),
                  h('button', { type: 'button', className: 'dtg-confirm-danger', onClick: onArchiveConfirm }, '归档'),
                  h('button', { type: 'button', className: 'dtg-confirm-cancel', onClick: onArchiveCancel }, '取消'),
                ),
              )
            : h(
              'div',
              {
                key: 'body',
                className: cx('dtg-group-body', rows.length === 0 && 'is-empty'),
                style: { '--dtg-group-color': color },
              },
              rows.length === 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: cx('dtg-group-drop', isDrop && 'is-active'),
                      onClick: (event) => {
                        event.stopPropagation()
                        onNewTask()
                      },
                    },
                    h(IconPlusCircle, { size: 14 }),
                    h('span', null, '新建任务，或拖拽到这里。'),
                  )
                : rows.map((session) => h(SessionRow, { key: session.id, session, api })),
            ),
      )
    }

    function ProjectSection({ workspace, rows, api, collapsed, onToggle, onCreate, limit, expanded, onShowMore, onShowLess }) {
      const visible = rows.slice(0, limit)
      const hidden = rows.length - visible.length
      return h(
        'div',
        { className: 'dtg-section' },
        h(
          'div',
          {
            className: 'dtg-group-head',
            onClick: onToggle,
            role: 'treeitem',
            'aria-expanded': !collapsed,
            tabIndex: -1,
          },
          h('span', { className: cx('dtg-chevron', !collapsed && 'is-open') }, h(IconChevronRightOutlineRegular, { size: 14 })),
          h('span', { className: 'dtg-folder' }, collapsed ? h(IconFolderCloseRegular, { size: 15 }) : h(IconFolderOpenRegular, { size: 15 })),
          h('span', { className: 'dtg-group-name' }, workspace ? workspace.title || workspace.path : '未分组'),
          h('span', { className: 'dtg-count' }, String(rows.length)),
          onCreate
            ? h(
                'span',
                { className: 'dtg-row-actions', onClick: (event) => event.stopPropagation() },
                h(
                  Tooltip,
                  { label: '在此项目新建任务', side: 'bottom', portal: true },
                  h(
                    'button',
                    { type: 'button', className: 'dtg-action', 'aria-label': '在此项目新建任务', onClick: onCreate },
                    h(IconPlusOutlineRegular, { size: 14 }),
                  ),
                ),
              )
            : null,
        ),
        collapsed
          ? null
          : rows.length === 0
            ? h('div', { className: 'dtg-group-empty' }, '还没有任务')
            : [
                ...visible.map((session) => h(SessionRow, { key: session.id, session, api })),
                hidden > 0
                  ? h(
                      'button',
                      { key: 'more', type: 'button', className: 'dtg-more', onClick: onShowMore },
                      `显示更多（还有 ${hidden} 个）`,
                    )
                  : expanded
                    ? h('button', { key: 'less', type: 'button', className: 'dtg-more', onClick: onShowLess }, '显示更少')
                    : null,
              ],
      )
    }

    // ---------------------------------------------------------------------
    // inline group editor
    // ---------------------------------------------------------------------

    function GroupEditor({ initial, label, onSubmit, onCancel }) {
      const [value, setValue] = useState(initial)
      const ref = useRef(null)
      useEffect(() => {
        ref.current?.focus()
        ref.current?.select()
      }, [])
      return h(
        'div',
        { className: 'dtg-editor' },
        h(HashIcon, { color: '#8b8d98' }),
        h('input', {
          ref,
          className: 'dtg-editor-input',
          value,
          placeholder: label,
          'aria-label': label,
          onChange: (event) => setValue(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit(value)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          },
        }),
        h(
          Tooltip,
          { label: '确定', side: 'bottom', portal: true },
          h('button', { type: 'button', className: 'dtg-action', 'aria-label': '确定', onClick: () => onSubmit(value) }, h(IconCheckOutlineRegular, { size: 14 })),
        ),
        h(
          Tooltip,
          { label: '取消', side: 'bottom', portal: true },
          h('button', { type: 'button', className: 'dtg-action', 'aria-label': '取消', onClick: onCancel }, h(IconCloseOutlineRegular, { size: 14 })),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // styles
    // ---------------------------------------------------------------------

    const CSS = `
.dtg-root{display:flex;flex-direction:column;flex:1;min-height:0;box-sizing:border-box;padding-right:var(--dsh-sidebar-inline-padding,8px)}
.dtg-root.dtg-rail{padding-right:0;align-items:center;gap:8px;padding-top:4px}
.dtg-header{display:flex;align-items:center;gap:4px;height:36px;flex:none;margin:2px -4px 4px 0;padding-left:4px;border-radius:var(--dsw-radius-md);overflow:hidden}
.dtg-header-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);font-weight:500;padding-left:2px}
.dtg-toggle{display:inline-flex;align-items:center;gap:2px;padding:3px;flex:1;min-width:0;max-width:132px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);box-sizing:border-box;position:relative}
.dtg-toggle-thumb{position:absolute;top:3px;left:3px;width:calc(50% - 1px);height:calc(100% - 6px);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.08));transform:translateX(0);transition:transform .24s cubic-bezier(.22,.61,.36,1);pointer-events:none}
.dtg-toggle-thumb.is-right{transform:translateX(calc(100% + 2px))}
.dtg-toggle-btn{position:relative;z-index:1;flex:1;min-width:0;height:24px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer;transition:color .2s var(--ds-ease-in-out,ease)}
.dtg-toggle-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dtg-toggle-btn.is-active{background:transparent;color:var(--dsw-alias-label-primary);box-shadow:none}
.dtg-toggle-btn:disabled{opacity:.4;cursor:default}
.dtg-toggle-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-spacer{flex:1;min-width:0}
.dtg-icon-btn{width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);cursor:pointer;position:relative;font:inherit}
.dtg-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-icon-btn:disabled,.dtg-icon-btn.is-disabled{opacity:.35;cursor:default;pointer-events:none}
.dtg-icon-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-icon-btn.is-active{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dtg-icon-btn-sm{width:24px;height:24px}
.dtg-text-btn{display:inline-flex;align-items:center;gap:3px;border:0;background:transparent;padding:2px 4px;border-radius:var(--dsw-radius-xs,4px);color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;white-space:nowrap}
.dtg-text-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dtg-text-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-header-note{padding-right:6px}
.dtg-bell-dot{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3f7fdd);box-shadow:0 0 0 2px var(--dsw-specific-sidebar-fill,transparent);pointer-events:none}
.dtg-icon-btn.dtg-bell-btn.is-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 14%,transparent);color:var(--dsw-alias-state-business-primary,#3f7fdd)}
.dtg-icon-btn.dtg-bell-btn.is-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 22%,transparent)}
.dtg-bell-btn.is-active .dtg-bell-dot{box-shadow:none}
.dtg-activity-title{padding-left:6px}
.dtg-flip{transform:rotate(180deg)}
.dtg-search-row{display:flex;align-items:center;gap:4px;height:30px;flex:none;margin:0 -4px 4px 0;padding:0 2px 0 6px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-caption)}
.dtg-search-icon{flex:none;color:var(--dsw-alias-label-tertiary)}
.dtg-search-input{flex:1;min-width:0;border:0;background:transparent;outline:none;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary)}
.dtg-search-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.dtg-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 0 20px;scrollbar-gutter:stable;display:flex;flex-direction:column;animation:dtg-list-in .18s var(--ds-ease-out,ease)}
@keyframes dtg-list-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dtg-row{transition:background-color .13s ease}
.dtg-menu-wide{min-width:212px}
.dtg-menu-wide .submenu{min-width:184px}
.dtg-submenu-label{display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%}
.dtg-submenu-caret{flex:none;color:var(--dsw-alias-label-tertiary);opacity:.8}
.dtg-renaming{padding:2px 4px 2px 22px}
.dtg-rename-input{width:100%;height:28px;box-sizing:border-box;padding:0 8px 0 20px;border:1px solid var(--dsw-alias-state-business-primary,#3f7fdd);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;outline:none}
.dtg-icon-btn,.dtg-group-add,.dtg-group-color,.dtg-newgroup,.dtg-action,.dtg-text-btn,.dtg-more,.dtg-confirm-danger,.dtg-confirm-cancel{transition:background-color .14s ease,color .14s ease,opacity .14s ease}
.dtg-drop-line{height:2px;margin:-1px 8px;border-radius:1px;background:var(--dsw-alias-state-business-primary,#3f7fdd);opacity:.95;flex:none;pointer-events:none;animation:dtg-line-in .14s ease}
.dtg-drop-hint{display:flex;align-items:center;justify-content:center;margin:6px 6px 2px;height:28px;flex:none;border:1px dashed var(--dsw-alias-border-l4,rgba(0,0,0,.16));border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-tertiary);font-size:11px}
@keyframes dtg-line-in{from{opacity:0;transform:scaleX(.6)}to{opacity:.95;transform:none}}
.dtg-section{position:relative;border-radius:var(--dsw-radius-md);flex:none}
.dtg-section+.dtg-section{margin-top:4px}
.dtg-section.is-drop{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 35%,transparent)}
.dtg-group-head{display:flex;align-items:center;gap:6px;height:30px;padding:0 4px 0 2px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none;font:inherit;flex:none}
.dtg-group-head:hover,.dtg-group-head.is-menu-open{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-group-card{height:34px;width:100%;box-sizing:border-box;gap:4px;margin:2px 0;padding:0 4px 0 2px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:none;cursor:grab}
.dtg-group-card:hover,.dtg-group-card.is-menu-open{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-group-card .dtg-group-name{flex:0 1 auto;font-weight:600}
.dtg-group-card .dtg-count{min-width:0;height:auto;padding:0;background:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dtg-group-color{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;margin:0;border-radius:6px;cursor:pointer;flex:none}
.dtg-group-color:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-group-color:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-group-add{width:22px;height:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;border-radius:6px;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dtg-group-add:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dtg-group-add:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-group-body{margin-left:6px;padding-left:0;border-left:2px solid color-mix(in srgb,var(--dtg-group-color,#8b8d98) 55%,transparent)}
.dtg-group-body.is-empty{border-left-color:color-mix(in srgb,var(--dtg-group-color,#8b8d98) 32%,transparent)}
.dtg-group-drop{display:flex;align-items:center;gap:6px;box-sizing:border-box;width:max(200px,calc(100% - 130px));margin:2px 0 6px 4px;padding:0 10px;height:30px;border:1px dashed var(--dsw-alias-border-l4,rgba(0,0,0,.16));border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:16px;text-align:left;white-space:nowrap;overflow:hidden;cursor:pointer}
.dtg-group-drop:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.26))}
.dtg-group-drop.is-active{border-color:var(--dsw-alias-state-business-primary,#3f7fdd);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 7%,transparent);color:var(--dsw-alias-state-business-primary,#3f7fdd)}
.dtg-more{display:flex;align-items:center;height:26px;margin:0 8px 2px 22px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;text-align:left;flex:none}
.dtg-more:hover{color:var(--dsw-alias-label-secondary)}
.dtg-group-card.is-dragging{opacity:.35;box-shadow:none}
.dtg-group-ghost{position:fixed;z-index:2147483000;margin:0;pointer-events:none;background:var(--dsw-alias-bg-layer-1,#fff);border:0.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08));border-radius:var(--dsw-radius-lg,10px);box-shadow:0 12px 30px rgba(0,0,0,.20),0 2px 6px rgba(0,0,0,.10);cursor:grabbing;animation:dtg-ghost-in .13s ease;will-change:left,top}
.dtg-session-ghost{position:fixed;z-index:2147483001;display:flex;align-items:center;height:32px;padding:0 12px;box-sizing:border-box;border-radius:var(--dsw-radius-sm);border:0.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08));background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 10px 26px rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.12);color:var(--dsw-alias-label-primary);font-size:14px;pointer-events:none;overflow:hidden;white-space:nowrap;animation:dtg-ghost-in .12s ease;will-change:left,top}
.dtg-session-ghost-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dtg-session-line{position:fixed;z-index:2147483002;height:2px;border-radius:1px;background:var(--dsw-alias-state-business-primary,#3f7fdd);pointer-events:none;box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 20%,transparent);animation:dtg-line-in .12s ease}
@keyframes dtg-ghost-in{from{opacity:.5;transform:scale(.985)}to{opacity:1;transform:none}}
body.dtg-group-dragging,body.dtg-group-dragging *{cursor:grabbing!important}
.dtg-group-head:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-chevron{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);transition:transform .15s var(--ds-ease-in-out,ease)}
.dtg-chevron.is-open{transform:rotate(90deg)}
.dtg-hash{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;border-radius:5px;background:color-mix(in srgb,var(--dtg-color,currentColor) 15%,transparent);color:var(--dtg-color,currentColor);font-size:12px;font-weight:700;letter-spacing:0}
.dtg-hash.is-filled{background:var(--dtg-color,currentColor);color:#fff}
.dtg-folder{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
.dtg-group-name{flex:1;min-width:0;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dtg-count{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dtg-row{display:flex;align-items:center;gap:6px;height:32px;padding:0 4px 0 22px;border-radius:var(--dsw-radius-sm);cursor:pointer;color:var(--dsw-alias-label-primary);font-size:14px;position:relative;flex:none;user-select:none;-webkit-user-select:none}
.dtg-row:hover,.dtg-row.is-selected,.dtg-row.is-menu-open{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-row:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-dot-slot{width:14px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center}
.dtg-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:20px}
.dtg-hint{flex:none;max-width:38%;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dtg-indicators{display:inline-flex;align-items:center;gap:2px;flex:none}
.dtg-pin{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--dsw-alias-label-caption)}
.dtg-unread-slot{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;flex:none}
.dtg-meta{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dtg-meta.is-live{color:var(--dsw-alias-state-business-primary,#3f7fdd)}
.dtg-meta.is-warn{color:var(--dsw-alias-state-warning-primary,#c27c0e)}
.dtg-unread-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3f7fdd);vertical-align:middle}
.dtg-row-actions{display:none;flex:none;align-items:center;gap:2px}
.dtg-row:hover .dtg-row-actions,.dtg-row.is-menu-open .dtg-row-actions,.dtg-row.is-selected .dtg-row-actions,.dtg-group-head:hover .dtg-row-actions,.dtg-group-head.is-menu-open .dtg-row-actions{display:inline-flex}
.dtg-row:hover .dtg-meta,.dtg-row.is-menu-open .dtg-meta{display:none}
.dtg-row:hover .dtg-pin,.dtg-row.is-menu-open .dtg-pin,.dtg-row.is-selected .dtg-pin{display:none}
.dtg-row:hover .dtg-unread-slot,.dtg-row.is-menu-open .dtg-unread-slot,.dtg-row.is-selected .dtg-unread-slot{display:none}
.dtg-row-actions{animation:dtg-actions-in .12s ease}
@keyframes dtg-actions-in{from{opacity:0}to{opacity:1}}
.dtg-row:hover .dtg-hint,.dtg-row.is-menu-open .dtg-hint{display:none}
.dtg-action{width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;border-radius:var(--dsw-radius-xs,4px);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit}
.dtg-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dtg-action:disabled{opacity:.3;cursor:default;pointer-events:none}
.dtg-row-menu-anchor{display:inline-block;width:0;height:1px}
.dtg-action:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dtg-group-empty{padding:2px 8px 6px 24px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dtg-section-label{display:flex;align-items:center;gap:6px;padding:10px 6px 4px;font-size:12.5px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-tertiary);letter-spacing:.01em}
.dtg-empty{padding:28px 12px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dtg-empty-sm{padding:10px 8px;text-align:left}
.dtg-newgroup{display:flex;align-items:center;gap:6px;height:30px;margin-top:4px;padding:0 4px 0 6px;border:0;background:transparent;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;text-align:left;flex:none}
.dtg-newgroup:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dtg-editor{display:flex;align-items:center;gap:4px;height:32px;padding:0 4px}
.dtg-editor-input{flex:1;min-width:0;height:24px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-elevated-fill,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 6px;outline:none}
.dtg-editor-input:focus{border-color:var(--dsw-alias-state-business-primary)}
.dtg-confirm{display:flex;align-items:center;gap:6px;height:34px;padding:0 4px 0 8px;border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 10%,transparent)}
.dtg-confirm-inline{margin:4px 0 6px 6px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3f7fdd) 8%,transparent)}
.dtg-confirm-inline .dtg-confirm-danger{color:var(--dsw-alias-state-business-primary,#3f7fdd)}
.dtg-confirm-text{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dtg-confirm-danger,.dtg-confirm-cancel{border:0;background:transparent;font:inherit;font-size:12px;padding:2px 4px;border-radius:var(--dsw-radius-xs,4px);cursor:pointer}
.dtg-confirm-danger{color:var(--dsw-alias-state-error-primary,#d9534f);font-weight:600}
.dtg-confirm-cancel{color:var(--dsw-alias-label-tertiary)}
.dtg-confirm-danger:hover,.dtg-confirm-cancel:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dtg-swatch{display:inline-block;width:10px;height:10px;border-radius:50%}
.dtg-skeleton{height:26px;margin:4px 6px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-skeleton,rgba(0,0,0,.06));animation:dtg-pulse 1.8s ease-in-out infinite}
.dtg-skeleton-short{width:60%}
@keyframes dtg-pulse{0%{opacity:1}50%{opacity:.55}100%{opacity:1}}
@media (prefers-reduced-motion:reduce){.dtg-skeleton{animation:none}.dtg-chevron{transition:none}}
`

    // ---------------------------------------------------------------------
    // apply
    // ---------------------------------------------------------------------

    function apply(ctx) {
      rootCtx = ctx

      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-task-groups'
      style.textContent = CSS
      document.head.append(style)
      ctx.effect(() => () => style.remove(), 'dsh-task-groups: styles')

      ctx.effect(() => () => store.dispose(), 'dsh-task-groups: store')

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.workspaces', () =>
            ctx.slots.register(
              {
                name: 'sidebar.workspaces',
                id: 'task-groups.browser',
                priority: -1,
              },
              Browser,
            ),
          ),
        'dsh-task-groups: sidebar browser',
      )

      const flush = () => store.flush()
      window.addEventListener('beforeunload', flush)
      ctx.effect(() => () => window.removeEventListener('beforeunload', flush), 'dsh-task-groups: unload flush')
    }

    exports.apply = apply
    exports.inject = ['slots', 'uiWorkspace', 'sessions', 'workspaces', 'remote', 'remote.session']
    return module.exports
  },
})
