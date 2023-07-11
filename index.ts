/* 
    1) ✅ Implement Event Store
    2) ✅ Use express to listen for requests
    3) ✅ Unvail the /getPosts?page=<latest_uuid> endpoint
    4) ✅ Return json response containing the next 50 posts (prisma Postgres) after the given uuid, DESC
    5) ✅ If no uuid given, return the latest 50 posts, DESC
    6) ✅ Response contains: [{uuid, title, contentSnippet, publication, publishedAt}], from the prisma object.
    7) Dockerise it and docker compose it together with Postgres @15.2
*/
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
