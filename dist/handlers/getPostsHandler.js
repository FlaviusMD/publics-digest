"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostsHandler = void 0;
const getPostsHandler = async (req, res, prisma) => {
    const latestUUID = req.query.latestUUID;
    let posts = [];
    console.log(`Latest UUID is: ${latestUUID}`);
    try {
        // Find the post with the latestUUID
        const latestPost = latestUUID ? await prisma.post.findUnique({
            where: { uuid: latestUUID },
        }) : null;
        if (latestUUID && !latestPost) {
            return res.status(404).json({
                message: 'Post not found',
                error: `No post found with the provided UUID: ${latestUUID}`
            });
        }
        const postsPromise = await prisma.post.findMany({
            where: latestPost ? {
                publishedAt: {
                    lt: latestPost.publishedAt
                }
            } : {},
            orderBy: {
                publishedAt: 'desc'
            },
            take: 50,
            select: {
                uuid: true,
                title: true,
                contentSnippet: true,
                publicationName: true,
                publishedAt: true,
                trxHash: true
            }
        });
        // Process the data for the response
        for (let post of postsPromise) {
            posts.push({
                uuid: post.uuid,
                title: post.title,
                contentSnippet: post.contentSnippet,
                publishedAt: post.publishedAt.toUTCString(),
                publicationName: post.publicationName,
                trxHash: post.trxHash
            });
        }
        return res.status(200).json(posts);
    }
    catch (error) {
        console.error(`Error upon trying to retrieve page of Posts ${error}`);
        return res.status(500).json({
            message: 'Could not retrieve posts',
            error: error.message
        });
    }
};
exports.getPostsHandler = getPostsHandler;
