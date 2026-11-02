/**
 * dsh-task-groups — host half.
 *
 * Owns one small persisted state file (`$DSH_HOME/task-groups/state.json`) and
 * exposes it to the browser half over two same-origin routes:
 *
 *   GET  /dsh-task-groups/state   -> { ok, state }
 *   PUT  /dsh-task-groups/state   <- { state }  -> { ok, savedAt }
 *   GET  /dsh-task-groups/health  -> { ok, path }
 *
 * The file is the source of truth: group definitions and session→group
 * assignments must survive a page reload, a port change, and a Host restart,
 * so they cannot live in the browser's localStorage.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Stable Cordis plugin name. */
export const name = 'task-groups'

/** The Web carrier is the only service this plugin needs. */
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-task-groups'
const BODY_LIMIT = 512 * 1024
const MAX_GROUPS = 200
const MAX_NAME = 80
const MAX_ASSIGNMENTS = 5000

/** Absolute path of the persisted state file. */
export function stateFile() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'task-groups', 'state.json')
}

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

/** Keep only the fields the browser owns; drop anything else. */
function normalizeState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('state must be an object')
  if (raw.version !== 1) throw badRequest('unsupported state version')

  const groupsIn = Array.isArray(raw.groups) ? raw.groups : []
  if (groupsIn.length > MAX_GROUPS) throw badRequest('too many groups')
  const seen = new Set()
  const groups = []
  for (const group of groupsIn) {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) throw badRequest('group must be an object')
    const id = typeof group.id === 'string' ? group.id.trim() : ''
    if (id === '' || id.length > 64 || seen.has(id)) throw badRequest('invalid group id')
    seen.add(id)
    const rawName = typeof group.name === 'string' ? group.name.trim() : ''
    if (rawName === '') throw badRequest('group name is required')
    groups.push({
      id,
      name: rawName.slice(0, MAX_NAME),
      color: typeof group.color === 'string' ? group.color.slice(0, 24) : 'gray',
      collapsed: group.collapsed === true,
      order: Number.isFinite(group.order) ? Number(group.order) : groups.length,
    })
  }

  const assignmentsIn = raw.assignments && typeof raw.assignments === 'object' && !Array.isArray(raw.assignments) ? raw.assignments : {}
  const entries = Object.entries(assignmentsIn)
  if (entries.length > MAX_ASSIGNMENTS) throw badRequest('too many assignments')
  const assignments = {}
  for (const [sessionId, groupId] of entries) {
    if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 128) continue
    if (typeof groupId !== 'string' || !seen.has(groupId)) continue
    assignments[sessionId] = groupId
  }

  const prefsIn = raw.prefs && typeof raw.prefs === 'object' && !Array.isArray(raw.prefs) ? raw.prefs : {}
  const prefs = {
    view: prefsIn.view === 'projects' ? 'projects' : 'groups',
    activity: prefsIn.activity === true,
  }

  const orderIn = Array.isArray(raw.sessionOrder) ? raw.sessionOrder : []
  if (orderIn.length > MAX_ASSIGNMENTS) throw badRequest('too many ordered sessions')
  const sessionOrder = []
  for (const id of orderIn) {
    if (typeof id !== 'string' || id === '' || id.length > 128) continue
    sessionOrder.push(id)
  }

  return { version: 1, groups, assignments, sessionOrder, prefs }
}

async function readState() {
  try {
    const text = await readFile(stateFile(), 'utf8')
    return normalizeState(JSON.parse(text))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    if (error.status === 400) {
      // A hand-edited/corrupt file must not brick the panel: fall back to empty.
      console.warn('[dsh-task-groups] ignoring unreadable state file:', error.message)
      return null
    }
    throw error
  }
}

async function writeState(raw) {
  const state = normalizeState(raw)
  const file = stateFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temp, file)
  return state
}

function sendJson(res, status, value) {
  if (res.destroyed || res.writableEnded) return
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw badRequest('request body too large')
    chunks.push(chunk)
  }
  if (size === 0) throw badRequest('request body is required')
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw badRequest('request body must be JSON')
  }
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const rest = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+|\/+$/gu, '')

  if (rest === 'health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, path: stateFile() })
    return
  }
  if (rest !== 'state') {
    sendJson(res, 404, { ok: false, error: 'not found' })
    return
  }
  if (req.method === 'GET') {
    // A fresh profile has no file yet: hand back an empty, fully-shaped state.
    sendJson(res, 200, { ok: true, state: (await readState()) ?? normalizeState({ version: 1 }) })
    return
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readJson(req)
    const state = await writeState(body?.state)
    sendJson(res, 200, { ok: true, savedAt: Date.now(), groups: state.groups.length })
    return
  }
  sendJson(res, 405, { ok: false, error: 'method not allowed' })
}

/**
 * Register the state route for the lifetime of this plugin fiber.
 * @param ctx - Host context carrying `webServer`.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req, res) => {
          try {
            await handle(req, res)
          } catch (error) {
            sendJson(res, error.status ?? 500, { ok: false, error: error.message ?? String(error) })
          }
        },
      }),
    'dsh-task-groups: state route',
  )
}
