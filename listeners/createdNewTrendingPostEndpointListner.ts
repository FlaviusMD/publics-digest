import { EventEmitter } from 'events';

export const createdNewTrendingPostEndpointListner = (eventEmitter: EventEmitter) => {
    eventEmitter.on('createdNewTrendingPost', (data) => {
        console.info(`Created new TrendingPost. Time: ${data.time}`)
    });
}