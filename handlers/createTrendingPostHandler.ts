import { Request, Response } from 'express';
import { Post, PrismaClient } from '@prisma/client';
import Joi from 'joi';
import { v4 as uuidv4 } from "uuid";

interface IRequestBody {
    trxHashes: string[]
};

const requestBodySchema = Joi.object({
    trxHashes: Joi.array().items(Joi.string()).required()
});

export const createTrendingPostHandler = async (req: Request, res: Response, prisma: PrismaClient): Promise<Response> => {
    const body: IRequestBody = JSON.parse(req.body || '{}');
    const validationResult = requestBodySchema.validate(body);

    if (validationResult.error) {
        console.error(`Request Body for creating TrendingPost is incorrect: Error: ${validationResult.error}`);

        return res.status(400).json({
            message: "Request Body for creating TrendingPost is incorrect",
            error: validationResult.error
        })
    }

    const requestBody: IRequestBody = validationResult.value;
    let postsOfTrendingPost: Post[] = [];

    for (let trxHash of requestBody.trxHashes) {
        try {
            const post = await prisma.post.findFirstOrThrow({
                where: {
                    trxHash: trxHash
                }
            })

            postsOfTrendingPost.push(post);
        } catch (error: any) {
            console.error(`No Post with given trxHash was found. 
            trxHash: ${trxHash},
            error: ${error.message}`)
        }
    }

    try {
        await prisma.trendingPost.create({
            data: {
                uuid: uuidv4(),
                createdAt: new Date().toUTCString(),
                posts: {
                    connect: postsOfTrendingPost.map(post => ({ id: post.id }))
                }
            }
        })
    } catch (error: any) {
        console.error(`Unable to create new TrendingPost. DateTime: ${new Date().toUTCString()}`)

        return res.status(500).json({
            message: "Unable to create a new TrendingPost entry",
            error: error.message
        })
    }

    return res.status(200).json({ message: "TrendingPost created!" })
}