import { EventEmitter } from 'events';

export const getPostsEndpointListener = (eventEmitter: EventEmitter) => {
    eventEmitter.on('respondedToGetPosts', (data) => {
        console.log(`Responded to getPosts. Time: ${data.time}, latestUUID: ${data.requestInfo}`)
    });
}
