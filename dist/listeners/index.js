"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialiseAllEventListeners = void 0;
const getPostsEndpointListener_1 = require("./getPostsEndpointListener");
const unhandledRejectionListener_1 = require("./unhandledRejectionListener");
const initialiseAllEventListeners = async (eventEmitter) => {
    (0, getPostsEndpointListener_1.getPostsEndpointListener)(eventEmitter);
    (0, unhandledRejectionListener_1.unhandledRejectionListener)();
};
exports.initialiseAllEventListeners = initialiseAllEventListeners;
