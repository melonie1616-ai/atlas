require('dotenv').config();
const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

console.log("--- Starting Server ---");
console.log("Checking environment variables...");
if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) {
    console.error("FATAL ERROR: Cosmos DB credentials are missing from .env!");
    process.exit(1);
} else {
    console.log("Credentials found. Initializing Cosmos Client...");
}

const client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
});

const databaseId = "AtlasDB";
const containerId = "AtlasContainer";
const container = client.database(databaseId).container(containerId);

// Ensure DB and Container exist
async function initDb() {
    try {
        console.log("Connecting to Cosmos DB...");
        const { database } = await client.databases.createIfNotExists({ id: databaseId });
        console.log(`Database '${databaseId}' verified.`);
        
        await database.containers.createIfNotExists({ id: containerId, partitionKey: "/id" });
        console.log(`Container '${containerId}' verified. Cosmos DB is fully Ready.`);
    } catch (error) {
        console.error("FATAL ERROR during Cosmos DB initialization:", error.message);
    }
}
initDb();

// 1. Get Application State
app.get('/api/data', async (req, res) => {
    console.log(`[GET /api/data] Request received from ${req.ip}`);
    try {
        const { resource } = await container.item("master_state", "master_state").read();
        if (resource && resource.data) {
            console.log("[GET /api/data] Success: Found existing data.");
            res.json(resource.data);
        } else {
            console.log("[GET /api/data] Success: Item 'master_state' is empty or missing 'data' field. Returning null.");
            res.json(null);
        }
    } catch (e) {
        console.error("[GET /api/data] ERROR reading from Cosmos:", e.message);
        res.json(null); // Safely fail
    }
});

// 2. Save Application State
app.post('/api/data', async (req, res) => {
    console.log(`[POST /api/data] Save request received. Payload size: ${JSON.stringify(req.body).length} bytes`);
    try {
        await container.items.upsert({
            id: "master_state",
            data: req.body,
            updatedAt: new Date().toISOString()
        });
        console.log("[POST /api/data] Successfully saved to Cosmos DB.");
        res.sendStatus(200);
    } catch (e) {
        console.error("[POST /api/data] ERROR saving to Cosmos:", e.message);
        res.status(500).send(e.message);
    }
});

// 3. Simple Presence (Heartbeat)
let onlineUsers = {};
app.post('/api/presence', (req, res) => {
    const { name } = req.body;
    if (name) onlineUsers[name] = Date.now();
    res.json(Object.keys(onlineUsers).filter(k => Date.now() - onlineUsers[k] < 40000));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ATLAS running on http://localhost:${PORT}`));