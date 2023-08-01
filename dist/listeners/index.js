"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialiseAllEventListeners = void 0;
const getPostsEndpointListener_1 = require("./getPostsEndpointListener");
const getTrendingPostEndpointListener_1 = require("./getTrendingPostEndpointListener");
const unhandledRejectionListener_1 = require("./unhandledRejectionListener");
const createdNewTrendingPostEndpointListner_1 = require("./createdNewTrendingPostEndpointListner");
const initialiseAllEventListeners = async (eventEmitter) => {
    (0, getPostsEndpointListener_1.getPostsEndpointListener)(eventEmitter);
    (0, getTrendingPostEndpointListener_1.getTrendingPostEndpointListner)(eventEmitter);
    (0, createdNewTrendingPostEndpointListner_1.createdNewTrendingPostEndpointListner)(eventEmitter);
    (0, unhandledRejectionListener_1.unhandledRejectionListener)();
};
exports.initialiseAllEventListeners = initialiseAllEventListeners;
