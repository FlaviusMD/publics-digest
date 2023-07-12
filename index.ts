import express from 'express';
import { EventEmitter } from 'events';
import { initialiseAllEventListeners } from './listeners/index';
import { PrismaClient } from '@prisma/client';
import { getPostsHandler } from './handlers/getPostsHandler';

const PORT = 3000;
const app = express();

const prisma = new PrismaClient();
const eventEmitter = new EventEmitter();

const startServer = async () => {
    try {
        await initialiseAllEventListeners(eventEmitter);

        app.get('/getPosts', (req, res) => {
            // Set the CORS headers to allow all origins
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            getPostsHandler(req, res, prisma);

            const now = new Date().toUTCString();
            eventEmitter.emit('respondedToGetPosts', { time: now, requestInfo: req.query?.latestUUID });
        });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
}

startServer();
