import { EventEmitter } from 'events';
import { getPostsEndpointListener } from './getPostsEndpointListener';
import { unhandledRejectionListener } from './unhandledRejectionListener';

export const initialiseAllEventListeners = async (eventEmitter: EventEmitter) => {
    getPostsEndpointListener(eventEmitter);
    unhandledRejectionListener();
}
