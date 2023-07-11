"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
    1) ✅ Implement Event Store
    2) ✅ Use express to listen for requests
    3) ✅ Unvail the /getPosts?page=<latest_uuid> endpoint
    4) ✅ Return json response containing the next 50 posts (prisma Postgres) after the given uuid, DESC
    5) ✅ If no uuid given, return the latest 50 posts, DESC
    6) ✅ Response contains: [{uuid, title, contentSnippet, publication, publishedAt}], from the prisma object.
    7) Dockerise it and docker compose it together with Postgres @15.2
*/
const express_1 = __importDefault(require("express"));
const events_1 = require("events");
const index_1 = require("./listeners/index");
const client_1 = require("@prisma/client");
const getPostsHandler_1 = require("./handlers/getPostsHandler");
const PORT = 3000;
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const eventEmitter = new events_1.EventEmitter();
const startServer = async () => {
    try {
        await (0, index_1.initialiseAllEventListeners)(eventEmitter);
        app.get('/getPosts', (req, res) => {
            (0, getPostsHandler_1.getPostsHandler)(req, res, prisma);
            const now = new Date().toUTCString();
            eventEmitter.emit('respondedToGetPosts', { time: now, requestInfo: req.query?.latestUUID });
        });
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
};
startServer();
