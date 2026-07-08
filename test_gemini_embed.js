// test_gemini_embed.js
// Tests Gemini embeddings loading the env vars from .env.local

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

async function test() {
    console.log("Checking GEMINI_API_KEY configuration...");
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    console.log("GEMINI_API_KEY configured:", apiKey ? "YES (starts with " + apiKey.substring(0, 5) + "...)" : "NO");

    try {
        const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
        const embeddings = new GoogleGenerativeAIEmbeddings({
            model: process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
            apiKey,
            taskType: "RETRIEVAL_DOCUMENT",
        });

        console.log("Generating embeddings for test text...");
        const res = await embeddings.embedDocuments(["Hello world", "This is a test of Gemini embeddings"]);
        console.log("Embedding successful!");
        console.log("Vector count:", res.length);
        console.log("Vector dimension:", res[0].length);
    } catch (err) {
        console.error("Embedding failed:", err);
    }
}

test();
