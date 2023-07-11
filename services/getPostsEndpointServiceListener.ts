import { EventEmitter } from 'events';

export const getPostsEndpointServiceListener = (eventEmitter: EventEmitter) => {
    eventEmitter.on('respondedToGetPosts', async (data) => {
        console.log(`Responded to getPosts. Time: ${data.time}, latestUUID: ${data.requestInfo}`)
    });
}
