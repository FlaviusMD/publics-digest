"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
            // Set the CORS headers to allow all origins
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
