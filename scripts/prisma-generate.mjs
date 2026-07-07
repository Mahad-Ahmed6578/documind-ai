import { spawnSync } from 'node:child_process'

const schemaPath =
  process.env.PRISMA_SCHEMA ??
  (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('file:')
    ? 'prisma/schema.postgresql.prisma'
    : 'prisma/schema.prisma')

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(executable, ['prisma', 'generate', '--schema', schemaPath], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
