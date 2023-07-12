"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostsEndpointListener = void 0;
const getPostsEndpointListener = (eventEmitter) => {
    eventEmitter.on('respondedToGetPosts', (data) => {
        console.log(`Responded to getPosts. Time: ${data.time}, latestUUID: ${data.requestInfo}`);
    });
};
exports.getPostsEndpointListener = getPostsEndpointListener;
