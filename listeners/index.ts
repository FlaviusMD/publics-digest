import { EventEmitter } from 'events';
import { getPostsEndpointListener } from './getPostsEndpointListener';
import { getTrendingPostEndpointListner } from './getTrendingPostEndpointListener';
import { unhandledRejectionListener } from './unhandledRejectionListener';
import { createdNewTrendingPostEndpointListner } from './createdNewTrendingPostEndpointListner';

export const initialiseAllEventListeners = async (eventEmitter: EventEmitter) => {
    getPostsEndpointListener(eventEmitter);
    getTrendingPostEndpointListner(eventEmitter);
    createdNewTrendingPostEndpointListner(eventEmitter);
    unhandledRejectionListener();
}
