/**
 * Host-half reuse smoke test: loads lib/index.js exactly as the Host would,
 * registers the state route on a fake ctx, and exercises the HTTP contract in
 * an isolated DSH_HOME. Run: node tools/smoke-host.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'

const tempHome = await mkdtemp(join(process.cwd(), '.tmp-smoke-'))
process.env.DSH_HOME = tempHome

const mod = await import('../lib/index.js')
assert.equal(mod.name, 'task-groups')
assert.deepEqual(mod.inject, ['webServer'])

let handler = null
const ctx = {
  effect: (fn) => {
    fn()
  },
  webServer: {
    register(options) {
      handler = options.handler
      return () => {}
    },
  },
}
mod.apply(ctx)
assert.ok(handler, 'apply() should register the state route')
assert.ok(mod.stateFile().startsWith(tempHome), 'stateFile should live under DSH_HOME')

const call = async (method, url, body) => {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      yield* chunks
    },
  }
  const res = {
    status: 0,
    body: '',
    destroyed: false,
    writableEnded: false,
    writeHead(status) {
      this.status = status
    },
    end(payload) {
      this.body = String(payload)
      this.writableEnded = true
    },
  }
  await handler(req, res)
  return { status: res.status, json: JSON.parse(res.body) }
}

let response = await call('GET', '/dsh-task-groups/health')
assert.equal(response.status, 200)
assert.equal(response.json.ok, true)
assert.ok(response.json.path.includes('task-groups'), 'health should report the state path')

response = await call('GET', '/dsh-task-groups/state')
if (response.status !== 200) console.error('DBG state GET', response)
assert.equal(response.status, 200)
assert.deepEqual(response.json.state.groups, [])
assert.deepEqual(response.json.state.sessionOrder, [])

const state = {
  version: 1,
  groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, order: 0 }],
  assignments: { s1: 'g1' },
  sessionOrder: ['s1', 's2'],
  prefs: { view: 'groups', activity: false },
}
response = await call('PUT', '/dsh-task-groups/state', { state })
assert.equal(response.status, 200)
assert.equal(response.json.ok, true)

response = await call('GET', '/dsh-task-groups/state')
assert.equal(response.status, 200)
assert.equal(response.json.state.groups.length, 1)
assert.equal(response.json.state.groups[0].name, '研究')
assert.deepEqual(response.json.state.assignments, { s1: 'g1' })
assert.deepEqual(response.json.state.sessionOrder, ['s1', 's2'], 'manual order must round-trip')

// Unnamed group -> 400; unknown fields dropped.
response = await call('PUT', '/dsh-task-groups/state', { state: { groups: [{ id: 'x' }] } })
assert.equal(response.status, 400)

response = await call('PUT', '/dsh-task-groups/state', {
  state: { version: 1, groups: [], assignments: { s1: 'ghost' }, sessionOrder: [1, 'ok'], junk: true },
})
assert.equal(response.status, 200)
response = await call('GET', '/dsh-task-groups/state')
assert.deepEqual(response.json.state.assignments, {}, 'assignments to unknown groups are dropped')
assert.deepEqual(response.json.state.sessionOrder, ['ok'], 'non-string order ids are dropped')

response = await call('GET', '/dsh-task-groups/missing')
assert.equal(response.status, 404)

await rm(tempHome, { recursive: true, force: true })
console.log('PASS: host half loads, registers and persists state in a fresh DSH_HOME')
