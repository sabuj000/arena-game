// Generates the TypeScript SDK (sdk/types.ts and sdk/client.ts) from openapi/arena.json.
// Zero dependencies. Run: node scripts/gen-sdk.mjs   (or: npm run gen:sdk)
//
// The spec still leaves a few nested shapes untyped (Match.results, Purchase.refund). Those, and the
// generic List<T>, are declared in EXTRA_TYPES below.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const spec = JSON.parse(readFileSync(join(root, 'openapi/arena.json'), 'utf8'))

// "METHOD /path" -> where the operation lives in the SDK.
const NAMES = {
  'POST /players': ['players', 'create', 'CreatePlayerParams', 'Player'],
  'GET /players': ['players', 'list', 'ListPlayersParams', 'List<Player>'],
  'GET /players/{player_id}': ['players', 'retrieve', null, 'Player'],
  'PATCH /players/{player_id}': ['players', 'update', 'UpdatePlayerParams', 'Player'],
  'DELETE /players/{player_id}': ['players', 'delete', null, 'Player'],
  'POST /matches': ['matches', 'create', 'CreateMatchParams', 'Match'],
  'GET /matches': ['matches', 'list', 'ListMatchesParams', 'List<Match>'],
  'GET /matches/{match_id}': ['matches', 'retrieve', null, 'Match'],
  'POST /matches/{match_id}/join': ['matches', 'join', 'JoinMatchParams', 'Match'],
  'POST /matches/{match_id}/start': ['matches', 'start', null, 'Match'],
  'POST /matches/{match_id}/end': ['matches', 'end', 'EndMatchParams', 'Match'],
  'POST /matches/{match_id}/cancel': ['matches', 'cancel', null, 'Match'],
  'GET /leaderboards': ['leaderboards', 'list', null, 'List<Leaderboard>'],
  'GET /leaderboards/{leaderboard_id}': ['leaderboards', 'retrieve', null, 'Leaderboard'],
  'POST /leaderboards/{leaderboard_id}/scores': ['leaderboards', 'submitScore', 'SubmitScoreParams', 'Score'],
  'GET /leaderboards/{leaderboard_id}/entries': ['leaderboards', 'entries', 'ListEntriesParams', 'List<LeaderboardEntry>'],
  'GET /leaderboards/{leaderboard_id}/players/{player_id}': ['leaderboards', 'playerEntry', null, 'LeaderboardEntry'],
  'GET /players/{player_id}/inventory': ['inventory', 'list', null, 'List<InventoryItem>'],
  'POST /players/{player_id}/inventory/grants': ['inventory', 'grant', 'GrantItemParams', 'Grant'],
  'POST /players/{player_id}/inventory/consume': ['inventory', 'consume', 'ConsumeItemParams', 'InventoryItem'],
  'GET /achievements': ['achievements', 'list', null, 'List<Achievement>'],
  'GET /players/{player_id}/achievements': ['achievements', 'listForPlayer', null, 'List<PlayerAchievement>'],
  'POST /players/{player_id}/achievements/{achievement_id}/unlock': ['achievements', 'unlock', null, 'AchievementUnlock'],
  'POST /purchases': ['purchases', 'create', 'CreatePurchaseParams', 'Purchase'],
  'GET /purchases': ['purchases', 'list', 'ListPurchasesParams', 'List<Purchase>'],
  'GET /purchases/{purchase_id}': ['purchases', 'retrieve', null, 'Purchase'],
  'POST /purchases/{purchase_id}/refund': ['purchases', 'refund', 'RefundPurchaseParams', 'Purchase'],
  'GET /players/{player_id}/entitlements': ['purchases', 'listEntitlements', null, 'List<Entitlement>'],
}

// Resource fields that can be null, or can be missing, in a response.
const NULLABLE = { Match: ['started_at', 'ended_at'], Score: ['match_id'], Grant: ['reason'], Purchase: ['grant_id', 'refund'] }
const OPTIONAL = { Player: ['deleted'] }
const OVERRIDE = { 'Match.results': 'MatchResult[]', 'Purchase.refund': 'Refund | null', 'Player.metadata': 'Record<string, string>' }

const PARAM_OVERRIDE = {
  'CreatePlayerParams.metadata': 'Record<string, string>',
  'UpdatePlayerParams.metadata': 'Record<string, string | null>',
  'EndMatchParams.results': 'MatchResult[]',
}

const EXTRA_TYPES = `export type List<T> = { object: 'list'; data: T[]; has_more: boolean; next_cursor: string | null }

export type MatchResult = { player_id: string; placement: number; score?: number }
export type Refund = { reason: string; revoked_quantity: number; refunded_at: string }
`

const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const camel = (s) => s.replace(/_(\w)/g, (_, c) => c.toUpperCase())

function tsType(schema) {
  if (schema.$ref) return schema.$ref.split('/').pop()
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  switch (schema.type) {
    case 'string': return 'string'
    case 'integer':
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'array': return `${wrap(tsType(schema.items ?? {}))}[]`
    case 'object':
      if (schema.properties) return objectLiteral(schema)
      return 'Record<string, unknown>'
    default: return 'unknown'
  }
}
const wrap = (t) => (t.includes(' | ') || t.includes('{') ? `(${t})` : t)

function describe(name, s) {
  const bits = []
  if (s.minLength !== undefined || s.maxLength !== undefined) bits.push(`${s.minLength ?? 0} to ${s.maxLength} characters`)
  if (s.minimum !== undefined || s.maximum !== undefined) bits.push(s.maximum !== undefined ? `from ${s.minimum ?? 0} to ${s.maximum}` : `at least ${s.minimum}`)
  if (s.maxProperties !== undefined) bits.push(`up to ${s.maxProperties} keys`)
  if (s.default !== undefined) bits.push(`default ${s.default}`)
  return bits.length ? `/** ${bits.join(', ')}. */\n  ` : ''
}

function objectLiteral(schema, indent = '  ', typeName = '') {
  const required = new Set(schema.required ?? [])
  const lines = Object.entries(schema.properties ?? {}).map(
    ([name, s]) =>
      `${indent}${describe(name, s)}${name}${required.has(name) ? '' : '?'}: ${PARAM_OVERRIDE[`${typeName}.${name}`] ?? tsType(s)}`,
  )
  return `{\n${lines.join('\n')}\n}`
}

// The type a 2xx response has in the spec: a $ref, or a list of $ref items.
function responseType(op) {
  const code = Object.keys(op.responses).find((c) => c.startsWith('2'))
  const schema = op.responses[code]?.content?.['application/json']?.schema
  const name = (s) => s?.$ref?.split('/').pop()
  if (name(schema)) return name(schema)
  if (schema?.properties?.object?.const === 'list' && name(schema.properties.data?.items)) return `List<${name(schema.properties.data.items)}>`
  throw new Error(`gen-sdk: response of ${op.summary} is not typed in the spec.`)
}

// ---- types.ts ----
let types = `// Generated by scripts/gen-sdk.mjs from openapi/arena.json. Do not edit by hand.\n\n`
types += EXTRA_TYPES + '\n'
for (const [name, schema] of Object.entries(spec.components.schemas)) {
  const required = new Set(schema.required ?? Object.keys(schema.properties))
  const lines = Object.entries(schema.properties).map(([prop, s]) => {
    const key = `${name}.${prop}`
    const nullable = (NULLABLE[name] ?? []).includes(prop)
    const optional = (OPTIONAL[name] ?? []).includes(prop)
    let type = OVERRIDE[key] ?? tsType(s)
    if (nullable && !type.includes('| null')) type += ' | null'
    return `  ${prop}${optional || !required.has(prop) ? '?' : ''}: ${type}`
  })
  types += `export type ${name} = {\n${lines.join('\n')}\n}\n\n`
}

// Params types, built from request bodies and query parameters.
const paramTypes = new Map()
const ops = []
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    const key = `${method.toUpperCase()} ${path}`
    const names = NAMES[key]
    if (!names) throw new Error(`gen-sdk: no SDK name for ${key}. Add it to NAMES.`)
    const [resource, fn, paramsName, returns] = names
    const declared = responseType(op)
    if (declared !== returns) throw new Error(`gen-sdk: ${key} returns ${declared} in the spec but NAMES says ${returns}.`)
    const body = op.requestBody?.content?.['application/json']?.schema
    const query = (op.parameters ?? []).filter((p) => p.in === 'query')
    if (paramsName) {
      const properties = {}
      const required = []
      for (const p of query) {
        properties[p.name] = p.schema
        if (p.required) required.push(p.name)
      }
      if (body) {
        Object.assign(properties, body.properties)
        required.push(...(body.required ?? []))
      }
      paramTypes.set(paramsName, objectLiteral({ properties, required }, '  ', paramsName))
    } else if (body || query.length) {
      throw new Error(`gen-sdk: ${key} has a body or query parameters but NAMES gives no params type`)
    }
    ops.push({ key, method, path, op, resource, fn, paramsName, returns, hasBody: Boolean(body), bodyRequired: Boolean(body?.required?.length), queryRequired: query.some((p) => p.required) })
  }
}
for (const [name, literal] of paramTypes) types += `export type ${name} = ${literal}\n\n`
types = types.trimEnd() + '\n'

// ---- client.ts ----
const byResource = new Map()
for (const o of ops) {
  if (!byResource.has(o.resource)) byResource.set(o.resource, [])
  byResource.get(o.resource).push(o)
}

function methodSource(o) {
  const pathParams = [...o.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  const args = pathParams.map((p) => `${camel(p)}: string`)
  const paramsRequired = o.hasBody ? o.bodyRequired : o.queryRequired
  if (o.paramsName) args.push(`params${paramsRequired ? '' : '?'}: ${o.paramsName}`)
  args.push('options?: RequestOptions')
  const pathExpr = '`' + o.path.replace(/\{(\w+)\}/g, (_, p) => `\${encodeURIComponent(${camel(p)})}`) + '`'
  const input = !o.paramsName ? '' : o.hasBody ? ', { body: params }' : ', { query: params }'
  const optionsArg = o.paramsName ? 'options' : 'options'
  const sendInput = o.paramsName ? input : ''
  return `  /** ${o.op.summary}. \`${o.method.toUpperCase()} /v1${o.path}\` */
  ${o.fn}(${args.join(', ')}): Promise<${o.returns}> {
    return this.http.request<${o.returns}>('${o.method.toUpperCase()}', ${pathExpr}${sendInput || (o.paramsName ? '' : ', {}')}, ${optionsArg})
  }`
}

const used = new Set()
for (const o of ops) for (const m of [o.returns, o.paramsName].filter(Boolean)) used.add(m.replace(/^List<(.+)>$/, '$1'))
used.add('List')
const importNames = [...used].sort()

let client = `// Generated by scripts/gen-sdk.mjs from openapi/arena.json. Do not edit by hand.\n\n`
client += `import { Http } from './http.ts'\nimport type { ArenaOptions, RequestOptions } from './http.ts'\n`
client += `import type { ${importNames.join(', ')} } from './types.ts'\n\n`
for (const [resource, list] of byResource) {
  client += `export class ${pascal(resource)} {\n  private readonly http: Http\n\n  constructor(http: Http) {\n    this.http = http\n  }\n\n`
  client += list.map(methodSource).join('\n\n') + '\n}\n\n'
}
client += `/** The Arena API client. Create one per API key. */\nexport class Arena {\n`
for (const resource of byResource.keys()) client += `  readonly ${resource}: ${pascal(resource)}\n`
client += `\n  constructor(options: ArenaOptions) {\n    const http = new Http(options)\n`
for (const resource of byResource.keys()) client += `    this.${resource} = new ${pascal(resource)}(http)\n`
client += `  }\n}\n`

writeFileSync(join(root, 'sdk/types.ts'), types)
writeFileSync(join(root, 'sdk/client.ts'), client)
console.log(`Generated ${ops.length} operations in ${byResource.size} resources.`)
