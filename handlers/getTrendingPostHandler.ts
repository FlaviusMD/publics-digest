import { Response } from 'express';
import { Post, PrismaClient } from '@prisma/client';

interface IPostData {
    trxHash: string,
    publicationName: string,
    title: string
}

export const getTrendingPostHandler = async (res: Response, prisma: PrismaClient): Promise<Response> => {
    let postsData: IPostData[] = [];

    try {
        const latestTrendingPostEntry = await prisma.trendingPost.findFirstOrThrow({
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                posts: true
            }
        });

        const posts: Post[] = latestTrendingPostEntry.posts;

        for (let post of posts) {
            postsData.push({
                trxHash: post.trxHash,
                publicationName: post.publicationName,
                title: post.title
            })
        }

        return res.status(200).json({ posts: postsData });
    } catch (error: any) {
        console.error(`Unable to respond with the latest TrendingPosts. 
        HTTP Code: ${500},
        Error object: ${error}`)

        return res.status(500).json({
            message: "Unable to retrieve the latest TrendingPosts",
            error: error.message
        })
    }
}