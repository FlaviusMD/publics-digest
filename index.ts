import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { initialiseAllEventListeners } from './listeners/index';
import { PrismaClient } from '@prisma/client';
import { getPostsHandler } from './handlers/getPostsHandler';
import { getTrendingPostHandler } from './handlers/getTrendingPostHandler';
import { createTrendingPostHandler } from './handlers/createTrendingPostHandler';

const PORT = 3000;
const app = express();
// Prisma prefers having one global instance for long running processes.
const prisma = new PrismaClient();
const eventEmitter = new EventEmitter();

const initialiseListners = async () => {
    try {
        await initialiseAllEventListeners(eventEmitter);
    } catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
}

initialiseListners();

app.use(cors());

app.get('/getPosts', async (req, res) => {
    await getPostsHandler(req, res, prisma);

    const now = new Date().toUTCString();
    eventEmitter.emit('respondedToGetPosts', { time: now, requestInfo: req.query?.latestUUID });
});

app.get('/posts/trending', async (req, res) => {
    await getTrendingPostHandler(res, prisma);

    const now = new Date().toUTCString();
    eventEmitter.emit('respondedToGetTrendingPost', { time: now });
});

app.post('/posts/trending', async (req, res) => {
    await createTrendingPostHandler(req, res, prisma);

    const now = new Date().toUTCString();
    eventEmitter.emit('createdNewTrendingPost', { time: now })
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
