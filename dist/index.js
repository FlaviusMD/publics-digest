"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const events_1 = require("events");
const index_1 = require("./listeners/index");
const client_1 = require("@prisma/client");
const getPostsHandler_1 = require("./handlers/getPostsHandler");
const getTrendingPostHandler_1 = require("./handlers/getTrendingPostHandler");
const createTrendingPostHandler_1 = require("./handlers/createTrendingPostHandler");
const PORT = 3000;
const app = (0, express_1.default)();
// Prisma prefers having one global instance for long running processes.
const prisma = new client_1.PrismaClient();
const eventEmitter = new events_1.EventEmitter();
const initialiseListners = async () => {
    try {
        await (0, index_1.initialiseAllEventListeners)(eventEmitter);
    }
    catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
};
initialiseListners();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/getPosts', async (req, res) => {
    await (0, getPostsHandler_1.getPostsHandler)(req, res, prisma);
    const now = new Date().toUTCString();
    eventEmitter.emit('respondedToGetPosts', { time: now, requestInfo: req.query?.latestUUID });
});
app.get('/posts/trending', async (req, res) => {
    await (0, getTrendingPostHandler_1.getTrendingPostHandler)(res, prisma);
    const now = new Date().toUTCString();
    eventEmitter.emit('respondedToGetTrendingPost', { time: now });
});
app.post('/posts/trending', async (req, res) => {
    await (0, createTrendingPostHandler_1.createTrendingPostHandler)(req, res, prisma);
    const now = new Date().toUTCString();
    eventEmitter.emit('createdNewTrendingPost', { time: now });
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
