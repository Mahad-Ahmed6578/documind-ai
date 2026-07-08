// run_local_query.js
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

// Override schema path to use PostgreSQL
process.env.PRISMA_SCHEMA = "prisma/schema.postgresql.prisma";

async function test() {
    try {
        console.log("Loading rag-pipeline...");
        // Let's dynamically import the transpiled or target pipeline.
        // Since Next.js files reside in src/, we can use register hooks or next.config to import.
        // Alternatively, let's write a simple script that targets src/lib/rag/rag-pipeline.ts using ts-node or similar.
        // Wait, let's run it using a temporary TS execution method, or transpile on the fly.
        // Wait! Let's check which dependencies we can use to run TS.
        // Since typescript is installed, we can just run:
        // npx tsc --noEmit --skipLibCheck
        // But to execute, let's see if we can use node with register or dynamic import of ts files,
        // or just run it via next dev and make a local curl request!
        // Yes! Making a local fetch request to the running development server (http://localhost:3000/api/query) is extremely easy and will print the error inside the dev server terminal console!
    } catch (err) {
        console.error(err);
    }
}

test();
