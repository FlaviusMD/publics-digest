// TODO Make sure cursor for each entry is unique.
// TODO Make sure that arweaveContent contains the data we need to save our objects to db
const Arweave = require("arweave");
import { PrismaClient } from '@prisma/client';
import axios from "axios";
import { S3 } from 'aws-sdk';
import sanitizeHtml from 'sanitize-html';

const s3 = new S3();
const prisma = new PrismaClient();
const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
});

// TODO Save in env variable
const S3_BUCKET_NAME = "publicsdigestposts"
// TODO Save in env variable to easily switch between official endpoint and goldsky in case of failure.
const GRAPHQL_ARWEAVE_ENDPOINT = 'https://arweave-search.goldsky.com/graphql';
const PUBLICATION_NAME = "Paragraph";
const TAGS = [{ name: "AppName", values: ["Paragraph"] }];


export default async function lambdaSyncParagraphPosts(defaultTrx?: string): Promise<void> {
    let syncDbUntilTrx: string;

    if (!defaultTrx) {
        const latestDBPost = await prisma.post.findFirst({
            where: {
                publication: {
                    name: PUBLICATION_NAME
                }
            },
            orderBy: {
                publishedAt: 'desc'
            }
        });

        // If there isn't a DB entry and defaultCursur param has not been given,
        // stop function execution to avoid infinite loop.
        if (!latestDBPost) {
            console.info("Default Trx NOT specified. NO DB entry found. Terminating process gracefully...")
            return;
        }

        syncDbUntilTrx = latestDBPost.trxHash;
    } else {
        syncDbUntilTrx = defaultTrx;
    }

    console.info(`Latest DB trxHash is: ${syncDbUntilTrx}`);

    // We need to get the latest Arweave Data first to have the cursor from which we
    // start syncing our DB, until the syncDbUntilTrx.
    const arweaveGraphQlData: any = await getArweaveGraphQlData();

    let latestArweaveCursor: string = arweaveGraphQlData[0].cursor;
    const latestArweaveTrxHash: string = arweaveGraphQlData[0].node.id;

    // Make sure we haven't been given an entry that's already in the DB
    // This avoids an infinite loop.
    const isEntryAlreadyInDB = await prisma.post.findUnique({
        where: {
            trxHash: latestArweaveTrxHash,
        },
    });

    if (isEntryAlreadyInDB) {
        console.log(`DB already up to date for ${PUBLICATION_NAME} publication.`)
        return;
    }

    // Gather data to be saved in DB
    let contentInfo = await getProcessedArweaveContent(latestArweaveTrxHash);
    contentInfo.trxHash = latestArweaveTrxHash;
    contentInfo.cursor = latestArweaveCursor;
    // Save Post static HTML to S3 and get URL. 
    let postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
    contentInfo.fullContentS3URL = postURL;

    // If we can't save the latest arweave post, we stop to ensure avoiding an infinite loop
    // caused by the unreliable data retrieved from these outside sources we use. 
    try {
        await saveToDB(contentInfo);
    } catch {
        console.log("Not able to save latest arweave post to DB. Terminating the process gracefully...");
        return;
    }

    let dbSynced = false;
    while (!dbSynced) {
        let arweaveTrxBatch = await getArweaveGraphQlData(latestArweaveCursor);

        for (const transaction of arweaveTrxBatch) {
            // Break loop if we reached the latest DB transaction.
            if (transaction.node.id === syncDbUntilTrx) {
                dbSynced = true;
                break;
            }

            // Update latest Cursor to this transaction
            latestArweaveCursor = transaction.cursor;
            console.log(`-------------------- LATEST ARWEAVE CURSOR IS: ${latestArweaveCursor} --------------------`);

            contentInfo = await getProcessedArweaveContent(transaction.node.id);
            contentInfo.trxHash = transaction.node.id;
            contentInfo.cursor = transaction.cursor;
            postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
            contentInfo.fullContentS3URL = postURL;

            try {
                await saveToDB(contentInfo);
            } catch {
                // Decided to terminate the process to avoid infinite loops.
                // These loops appear as the data we are retrieving is unreliable.
                console.log("Not able to save latest arweave post to DB. Terminating the process gracefully...");
                return;
            }
        }
    }

    console.info(`DB synced to Arweave for ${PUBLICATION_NAME}`);
}


async function saveHTMLtoS3(fullContent: string, trxHash: string): Promise<string> {
    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: trxHash,
        Body: fullContent,
    };

    try {
        await s3.upload(params).promise();
    } catch (error) {
        console.error(`Could NOT save Post ${trxHash} to S3: ${error}`);
        throw error;
    }

    return `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${trxHash}`;
}

async function getArweaveGraphQlData(latestCursor?: string): Promise<Array<Record<string, any>>> {
    if (!latestCursor) {
        const arweaveQuery = `
		query($tags: [TagFilter!]) {
			transactions(tags: $tags, first: 1, sort:HEIGHT_DESC) {
				edges {
					cursor
					node {
						id
						tags {
							name
							value
						}
					}
				}
			}
		}`;

        try {
            const latestArweaveData = await axios.post(GRAPHQL_ARWEAVE_ENDPOINT, {
                query: arweaveQuery,
                variables: {
                    tags: TAGS
                }
            });

            return latestArweaveData.data.data.transactions.edges;
        } catch (error: any) {
            console.error(`The hashes of Arweave Posts could NOT be retrieved ${error.response.data}`);
            throw error;
        }
    } else {
        const arweaveQuery = `
		query($tags: [TagFilter!], $cursor: String!) {
			transactions(tags: $tags, first: 10, after: $cursor, sort:HEIGHT_DESC) {
				edges {
					cursor
					node {
						id
					}
				}
			}
		}`

        try {
            const latestArweaveData = await axios.post(GRAPHQL_ARWEAVE_ENDPOINT, {
                query: arweaveQuery,
                variables: {
                    tags: TAGS,
                    cursor: latestCursor
                }
            });

            return latestArweaveData.data.data.transactions.edges;
        } catch (error: any) {
            console.error(`The hashes of Arweave Posts could NOT be retrieved ${error.response.data}`);
            throw error;
        }
    }
}

async function getProcessedArweaveContent(latestArweaveTrxHash: string): Promise<Record<string, any>> {
    let arweaveContent;
    try {
        const arweaveContentString = await arweave.transactions.getData(latestArweaveTrxHash, { decode: true, string: true })
        arweaveContent = JSON.parse(arweaveContentString);
    } catch (error) {
        console.error(`Unable to retrieve content data from Arweave SDK for TrxHash: ${latestArweaveTrxHash}: ${error}`)
        throw error;
    }

    // Get Published Time
    const unixTimestamp = arweaveContent.publishedAt; // Unix timestamp in seconds
    const date = new Date(unixTimestamp); // Convert Unix timestamp to milliseconds
    const formattedDate = new Date(date.toUTCString());

    // Get processed content snippet
    const rawArweavePostContent = arweaveContent.markdown.substring(0, 400);
    const processedPostContent = rawArweavePostContent.replace(/\n/g, ' ').substring(0, 300);

    // Get title
    const title = arweaveContent.title;

    // Get processed content body.
    // Taking the static HTML from the getData() response and cleaning it.
    const processedContentBody = processStaticHTML(arweaveContent.staticHtml);

    // Get authors for Post metadata
    const authors = arweaveContent.authors;

    const contentInfo = {
        publishedAt: formattedDate,
        title: title,
        contentSnippet: processedPostContent,
        fullContent: processedContentBody,
        metadata: {
            authors: authors
        }
    };

    return contentInfo;
}

// This version does NOT allow images (img tags are removed)
function processStaticHTML(staticHTML: string): String {
    const sanitizedHTML = sanitizeHtml(staticHTML, {
        allowedTags: sanitizeHtml.defaults.allowedTags.filter(tag => tag !== 'img'),
    });

    return sanitizedHTML;
}

async function saveToDB(data: Record<string, any>): Promise<void> {
    let publication = await prisma.publication.findUnique({
        where: {
            name: PUBLICATION_NAME
        }
    })

    if (!publication) {
        try {
            publication = await prisma.publication.create({
                data: {
                    name: PUBLICATION_NAME
                }
            });
        } catch (error) {
            console.error(`Publication ${PUBLICATION_NAME} could NOT be created`);
            throw error;
        }
    }

    try {
        await prisma.post.create({
            data: {
                publishedAt: data.publishedAt,
                trxHash: data.trxHash,
                title: data.title,
                contentSnippet: data.contentSnippet,
                fullContentS3URL: data.fullContentS3URL,
                cursor: data.cursor,
                publicationId: publication.id,
                metadata: data.metadata
            }
        })
    } catch (error) {
        console.error(`Unable to save Post (cursor: ${data.cursor}, trxHash: ${data.trxHash}) data to DB: ${error}`);
        throw error;
    }

    console.info(`Post ${data.trxHash} has been saved to DB.`);
}