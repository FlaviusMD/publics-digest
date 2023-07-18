// TODO Consider adding rate limiting when gitting the Arweave API
// Right now, we are not deleting all updated contents from S3. We are simply adding new entries. In saveDataToDB() function, delete all entry to S3.
// Consider transforming metadata DB field into authors field and using that to search for DB saved content that has been updated in Arweave in the mean time.
// Right now, we are updating content with the same title and previous 12 hours time. Not ideal as lots of posts can have the same title.
// https://github.com/wooorm/franc

/**
 * Should be ran every 3 mins as it has to perform loads of computations.
 */
const Arweave = require("arweave");
import { PrismaClient } from '@prisma/client';
import axios from "axios";
import { S3 } from 'aws-sdk';
import sanitizeHtml from 'sanitize-html';
import { v4 as uuidv4 } from 'uuid';

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
const MOST_COMMON_ENGLISH_WORDS = new Set([
    'the', 'be', 'of', 'and', 'a', 'to', 'in', 'he', 'have', 'it', 'that', 'for', 'they', 'I', 'with', 'as', 'not', 'on', 'she', 'at', 'by', 'this', 'we', 'you', 'do', 'but', 'from', 'or', 'which', 'one', 'would', 'all', 'will', 'there', 'say', 'who', 'make', 'when', 'can', 'more', 'if', 'no', 'man', 'out', 'other', 'so', 'what', 'time', 'up', 'go', 'about', 'than', 'into', 'could', 'state', 'only', 'new', 'year', 'some', 'take', 'come', 'these', 'know', 'see', 'use', 'get', 'like', 'then', 'first', 'any', 'work', 'now', 'may', 'such', 'give', 'over', 'think', 'most', 'even', 'find', 'day', 'also', 'after', 'way', 'many', 'must', 'look', 'before', 'great', 'back', 'through', 'long', 'where', 'much', 'should', 'well', 'people', 'down', 'own', 'just', 'because', 'good', 'each', 'those', 'feel', 'seem', 'how', 'high', 'too', 'place', 'little', 'world', 'very', 'still', 'nation', 'hand', 'old', 'life', 'tell', 'write', 'become', 'here', 'show', 'house', 'both', 'between', 'need', 'mean', 'call', 'develop', 'under', 'last', 'right', 'move', 'thing', 'general', 'school', 'never', 'same', 'another', 'begin', 'while', 'number', 'part', 'turn', 'real', 'leave', 'might', 'want', 'point', 'form', 'off', 'child', 'few', 'small', 'since', 'against', 'ask', 'late', 'home', 'interest', 'large', 'person', 'end', 'open', 'public', 'follow', 'during', 'present', 'without', 'again', 'hold', 'govern', 'around', 'possible', 'head', 'consider', 'word', 'program', 'problem', 'however', 'lead', 'system', 'set', 'order', 'eye', 'plan', 'run', 'keep', 'face', 'fact', 'group', 'play', 'stand', 'increase', 'early', 'course', 'change', 'help', 'line'
]);
// Increse MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS if you want the language filtering to be more strict.
const MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS = 7;

interface EventBridgeEvent {
    detail?: {
        defaultTrx: string;
    };
}

const index = async (event: EventBridgeEvent): Promise<void> => {
    // Create Publication if it doesn't exist.
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

    const defaultTrx = event.detail?.defaultTrx;
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

    // If content passes our minimum crypteria to be displayed, save it.
    // Otherwise continue normal execution to find and save all non-encrypted posts.
    if (contentInfo) {
        contentInfo.trxHash = latestArweaveTrxHash;
        contentInfo.cursor = latestArweaveCursor;
        // Save Post static HTML to S3 and get URL. 
        let postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
        contentInfo.fullContentS3URL = postURL;

        // If we can't save the latest arweave post, we stop to ensure avoiding an infinite loop
        // caused by the unreliable data retrieved from these outside sources we use. 
        try {
            await saveToDB(contentInfo);
        } catch (error) {
            console.log(`Not able to save latest arweave post to DB. Terminating the process gracefully... ERROR ${error}`);
            return;
        }
    }

    let dbSynced = false;
    while (!dbSynced) {
        let arweaveTrxBatch = await getArweaveGraphQlData(latestArweaveCursor);
        console.log(`-------------------- New Arweave Batch Of Transactions --------------------`);


        for (const transaction of arweaveTrxBatch) {
            // Break loop if we reached the latest DB transaction.
            if (transaction.node.id === syncDbUntilTrx) {
                dbSynced = true;
                break;
            }

            // Update latest Cursor to this transaction
            latestArweaveCursor = transaction.cursor;

            contentInfo = await getProcessedArweaveContent(transaction.node.id);

            // Skip this transaction if it doesn't meet out minimum criteria.
            if (!contentInfo) continue;

            contentInfo.trxHash = transaction.node.id;
            contentInfo.cursor = transaction.cursor;
            let postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
            contentInfo.fullContentS3URL = postURL;

            try {
                await saveToDB(contentInfo);
            } catch (error) {
                // Decided to terminate the process to avoid infinite loops.
                // These loops appear as the data we are retrieving is unreliable.
                console.log(`Not able to save latest arweave post to DB. Terminating the process gracefully... ERROR: ${error}`);
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

async function getProcessedArweaveContent(latestArweaveTrxHash: string): Promise<Record<string, any> | null> {
    let arweaveContent;
    try {
        const arweaveContentString = await arweave.transactions.getData(latestArweaveTrxHash, { decode: true, string: true })
        arweaveContent = JSON.parse(arweaveContentString);
    } catch (error) {
        console.error(`Unable to retrieve content data from Arweave SDK for TrxHash: ${latestArweaveTrxHash}: ${error}`)
        throw error;
    }

    // If the content is encrypted, skip it. Encrypted Trx do NOT have spaces.
    if (!arweaveContent.markdown.includes(" ")) {
        console.info(`Trx ${latestArweaveTrxHash} NOT saved because it is encrypted`);
        return null;
    }
    // If content is NOT longer than 300 chars, it's not worth displaying.
    if (arweaveContent.markdown.length < 300) {
        console.info(`Trx ${latestArweaveTrxHash} NOT saved because content is shorter than 300 chars`);
        return null;
    }

    // Get Published Time
    const unixTimestamp = arweaveContent.publishedAt; // Unix timestamp in seconds
    const date = new Date(unixTimestamp); // Convert Unix timestamp to milliseconds
    const formattedDate = new Date(date.toUTCString());

    // Get processed content snippet
    const rawArweavePostContent = processStaticHTML(arweaveContent.staticHtml.substring(0, 5000), true);
    const processedPostContent = rawArweavePostContent.replace(/<[^>]+>/g, '').substring(0, 597) + '...';
    // If content is NOT english, skip it.
    if (!checkEnglishLanguage(processedPostContent, MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS)) {
        console.info(`Trx ${latestArweaveTrxHash} NOT saved because language is NOT english`);
        return null;
    }

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

/**
 * Checks if a given text contains a minimum number of UNIQUE English words.
 * @param textToCheck The text to check for English language.
 * @param minimum_number_qunique_english_words The minimum number of unique English words required in the text.
 * @returns A boolean indicating whether the text contains the minimum number of unique English words.
 */
function checkEnglishLanguage(textToCheck: string, minimum_number_qunique_english_words: number): boolean {
    let counter = 0;
    const wordsInText = textToCheck.split(/\W+/);
    // const mostCommonEnglishWordsReplicated: Set<String> = MOST_COMMON_ENGLISH_WORDS;

    for (const word of wordsInText) {
        if (counter === minimum_number_qunique_english_words) return true;

        if (MOST_COMMON_ENGLISH_WORDS.has(word.toLowerCase())) {
            counter++;
        }

        // if (mostCommonEnglishWordsReplicated.has(word.toLowerCase())) {
        //     mostCommonEnglishWordsReplicated.delete(word.toLowerCase());
        //     counter++;
        // }
    }

    return false;
}

function processStaticHTML(staticHTML: string, removeLinks: boolean = false): String {
    let sanitizedHTML: string;

    // sanitize and remove links
    if (removeLinks) {
        sanitizedHTML = sanitizeHtml(staticHTML, {
            allowedTags: sanitizeHtml.defaults.allowedTags.filter(tag => tag !== 'link' && tag !== 'a' && tag !== 'img')
        });
    } else {
        // general sanitization
        sanitizedHTML = sanitizeHtml(staticHTML, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'a']),
            allowedAttributes: {
                'a': ['href', 'name', 'target'],
                'img': ['src', 'alt']
            }
        });
    }

    return sanitizedHTML;
}

async function saveToDB(data: Record<string, any>): Promise<void> {
    const twelveHoursSincePosted = new Date((new Date(data.publishedAt.getTime() - 12 * 60 * 60 * 1000)).toUTCString());

    try {
        const post = await prisma.post.findFirst({
            where: {
                title: data.title,
                publishedAt: {
                    gte: twelveHoursSincePosted
                }
            }
        });

        if (post) {
            await prisma.post.update({
                where: {
                    uuid: post.uuid
                },
                data: {
                    publishedAt: data.publishedAt,
                    trxHash: data.trxHash,
                    contentSnippet: data.contentSnippet,
                    fullContentS3URL: data.fullContentS3URL,
                    cursor: data.cursor,
                    metadata: data.metadata
                }
            });
        } else {
            await prisma.post.create({
                data: {
                    uuid: uuidv4(),
                    publishedAt: data.publishedAt,
                    trxHash: data.trxHash,
                    title: data.title,
                    contentSnippet: data.contentSnippet,
                    fullContentS3URL: data.fullContentS3URL,
                    cursor: data.cursor,
                    publicationName: PUBLICATION_NAME,
                    metadata: data.metadata
                }
            })
        }
    } catch (error) {
        console.error(`Unable to save Post (cursor: ${data.cursor}, trxHash: ${data.trxHash}) data to DB: ${error}`);
        throw error;
    }

    console.info(`Post ${data.trxHash} has been saved to DB.`);
}

module.exports = {
    handler: index
};