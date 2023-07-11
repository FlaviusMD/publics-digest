"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialiseAllEventListeners = void 0;
const getPostsEndpointServiceListener_1 = require("../services/getPostsEndpointServiceListener");
const initialiseAllEventListeners = async (eventEmitter) => {
    (0, getPostsEndpointServiceListener_1.getPostsEndpointServiceListener)(eventEmitter);
};
exports.initialiseAllEventListeners = initialiseAllEventListeners;
