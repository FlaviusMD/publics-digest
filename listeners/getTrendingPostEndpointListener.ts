import { EventEmitter } from 'events';

export const getTrendingPostEndpointListner = (eventEmitter: EventEmitter) => {
    eventEmitter.on('respondedToGetTrendingPost', (data) => {
        console.info(`Responded to getTrendingPosts. Time: ${data.time}`)
    });
}