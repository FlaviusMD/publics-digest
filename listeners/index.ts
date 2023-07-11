import { EventEmitter } from 'events';
import { getPostsEndpointServiceListener } from '../services/getPostsEndpointServiceListener';

export const initialiseAllEventListeners = async (eventEmitter: EventEmitter) => {
    getPostsEndpointServiceListener(eventEmitter);
}
