import { EventEmitter } from 'events';

export const getPostsEndpointListener = (eventEmitter: EventEmitter) => {
    eventEmitter.on('respondedToGetPosts', (data) => {
        console.info(`Responded to getPosts. Time: ${data.time}, latestUUID: ${data.requestInfo}`)
    });
}
