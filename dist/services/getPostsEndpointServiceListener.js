"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostsEndpointServiceListener = void 0;
const getPostsEndpointServiceListener = (eventEmitter) => {
    eventEmitter.on('respondedToGetPosts', async (data) => {
        console.log(`Responded to getPosts. Time: ${data.time}, latestUUID: ${data.requestInfo}`);
    });
};
exports.getPostsEndpointServiceListener = getPostsEndpointServiceListener;
