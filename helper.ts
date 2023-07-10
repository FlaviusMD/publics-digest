// TODO Make sure cursor for each entry is unique.
// TODO Make sure that arweaveContent contains the data we need to save our objects to db
const Arweave = require("arweave");
import { PrismaClient } from '@prisma/client'
import axios from "axios"

const GRAPHQL_ARWEAVE_ENDPOINT = "https://arweave-search.goldsky.com/graphql";
const PUBLICATION_NAME = "MirrorXYZ";
const TAGS = [{ name: "App-Name", values: ["MirrorXYZ"] }];
const prisma = new PrismaClient();
const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
});


export default async function lambdaSyncMirrorPosts(defaultCursor?: string): Promise<void> {
    let syncDbUntilCursor: String;

    if (!defaultCursor) {
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
            console.info("Default cursor NOT specified. NO DB entry found. Terminating process gracefully...")
            return;
        }

        syncDbUntilCursor = latestDBPost.cursor;
    } else {
        syncDbUntilCursor = defaultCursor;
    }

    console.info(`Latest DB cursor is: ${syncDbUntilCursor}`);

    // We need to get the latest Arweave Data first to have the cursor from which we
    // start syncing our DB, until the syncDbUntilCursor.
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
    // Get authors for Post metadata
    let graphQlTagsArray = arweaveGraphQlData[0].node.tags;
    let contributor = graphQlTagsArray.filter((tag: { name: string }) => tag?.name === 'Contributor')[0]?.value;
    contentInfo.metadata = {
        authors: contributor
    };

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
            if (transaction.cursor === syncDbUntilCursor) {
                dbSynced = true;
                break;
            }

            // Update latest Cursor to this transaction
            latestArweaveCursor = transaction.cursor;
            console.log(`-------------------- LATEST ARWEAVE CURSOR IS: ${latestArweaveCursor} --------------------`);

            contentInfo = await getProcessedArweaveContent(transaction.node.id);
            contentInfo.trxHash = transaction.node.id;
            contentInfo.cursor = transaction.cursor;
            // Get authors for Post metadata
            graphQlTagsArray = transaction.node.tags;
            contributor = graphQlTagsArray.filter((tag: { name: string }) => tag?.name === 'Contributor')[0]?.value;
            contentInfo.metadata = {
                authors: contributor
            };

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

        let latestArweaveData: any;
        try {
            latestArweaveData = await axios.post(GRAPHQL_ARWEAVE_ENDPOINT, {
                query: arweaveQuery,
                variables: {
                    tags: TAGS
                }
            });

            return latestArweaveData.data.data.transactions.edges;
        } catch (error: any) {
            console.error(error.response.data);
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
						tags {
							name
							value
						}
					}
				}
			}
		}`

        let latestArweaveData: any;
        try {
            latestArweaveData = await axios.post(GRAPHQL_ARWEAVE_ENDPOINT, {
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
    const unixTimestamp = parseInt(arweaveContent.content.timestamp); // Unix timestamp in seconds
    const date = new Date(unixTimestamp * 1000); // Convert Unix timestamp to milliseconds
    const formattedDate = new Date(date.toUTCString());

    // Get processed content snippet
    const rawArweavePostContent = arweaveContent.content.body.substring(0, 400);
    const processedPostContent = rawArweavePostContent.replace(/\n/g, '').substring(0, 300);

    // Get title
    const title = arweaveContent.content.title;

    // Get processed content body.
    const processedContentBody = arweaveContent.content.body.replace(/\n\n/g, "\n");

    const contentInfo = {
        publishedAt: formattedDate,
        title: title,
        contentSnippet: processedPostContent,
        fullContent: processedContentBody
    };

    return contentInfo;
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
        const saveArweavePost = await prisma.post.create({
            data: {
                publishedAt: data.publishedAt,
                trxHash: data.trxHash,
                title: data.title,
                contentSnippet: data.contentSnippet,
                fullContent: data.fullContent,
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



lambdaSyncMirrorPosts();