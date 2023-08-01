import { EventEmitter } from 'events';

export const createdNewTrendingPostEndpointListner = (eventEmitter: EventEmitter) => {
    eventEmitter.on('createdNewTrendingPost', (data) => {
        console.info(`Created TrendingPost endpoint called. Time: ${data.time}`)
    });
}