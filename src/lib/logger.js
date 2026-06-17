const MAX_LOGS = 300
const logs = []

export function log(...args) {
  const line = args
    .map(a => {
      if (a instanceof Error) return `${a.name}: ${a.message}`
      if (typeof a === 'object') return JSON.stringify(a)
      return String(a)
    })
    .join(' ')
  const entry = `[${new Date().toISOString().split('T')[1].slice(0, -1)}] ${line}`
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.shift()
  // eslint-disable-next-line no-console
  console.log(...args)
}

export function getLogs() {
  return logs.slice()
}

export function clearLogs() {
  logs.length = 0
}
