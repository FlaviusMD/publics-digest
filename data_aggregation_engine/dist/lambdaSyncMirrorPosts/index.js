"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// TODO Consider adding rate limiting when gitting the Arweave API
const Arweave = require("arweave");
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const aws_sdk_1 = require("aws-sdk");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const marked_1 = require("marked");
const uuid_1 = require("uuid");
const s3 = new aws_sdk_1.S3();
const prisma = new client_1.PrismaClient();
const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
});
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "publicsdigestposts";
const GRAPHQL_ARWEAVE_ENDPOINT = process.env.GRAPHQL_ARWEAVE_ENDPOINT || "https://arweave-search.goldsky.com/graphql";
const PUBLICATION_NAME = "MirrorXYZ";
const TAGS = [{ name: "App-Name", values: ["MirrorXYZ"] }];
const MOST_COMMON_ENGLISH_WORDS = new Set([
    'the', 'be', 'of', 'and', 'a', 'to', 'in', 'he', 'have', 'it', 'that', 'for', 'they', 'I', 'with', 'as', 'not', 'on', 'she', 'at', 'by', 'this', 'we', 'you', 'do', 'but', 'from', 'or', 'which', 'one', 'would', 'all', 'will', 'there', 'say', 'who', 'make', 'when', 'can', 'more', 'if', 'no', 'man', 'out', 'other', 'so', 'what', 'time', 'up', 'go', 'about', 'than', 'into', 'could', 'state', 'only', 'new', 'year', 'some', 'take', 'come', 'these', 'know', 'see', 'use', 'get', 'like', 'then', 'first', 'any', 'work', 'now', 'may', 'such', 'give', 'over', 'think', 'most', 'even', 'find', 'day', 'also', 'after', 'way', 'many', 'must', 'look', 'before', 'great', 'back', 'through', 'long', 'where', 'much', 'should', 'well', 'people', 'down', 'own', 'just', 'because', 'good', 'each', 'those', 'feel', 'seem', 'how', 'high', 'too', 'place', 'little', 'world', 'very', 'still', 'nation', 'hand', 'old', 'life', 'tell', 'write', 'become', 'here', 'show', 'house', 'both', 'between', 'need', 'mean', 'call', 'develop', 'under', 'last', 'right', 'move', 'thing', 'general', 'school', 'never', 'same', 'another', 'begin', 'while', 'number', 'part', 'turn', 'real', 'leave', 'might', 'want', 'point', 'form', 'off', 'child', 'few', 'small', 'since', 'against', 'ask', 'late', 'home', 'interest', 'large', 'person', 'end', 'open', 'public', 'follow', 'during', 'present', 'without', 'again', 'hold', 'govern', 'around', 'possible', 'head', 'consider', 'word', 'program', 'problem', 'however', 'lead', 'system', 'set', 'order', 'eye', 'plan', 'run', 'keep', 'face', 'fact', 'group', 'play', 'stand', 'increase', 'early', 'course', 'change', 'help', 'line'
]);
// Increse MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS if you want the language filtering to be more strict.
const MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS = process.env.MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS || "7";
const index = async (event) => {
    // Create Publication if it doesn't exist.
    let publication = await prisma.publication.findUnique({
        where: {
            name: PUBLICATION_NAME
        }
    });
    if (!publication) {
        try {
            publication = await prisma.publication.create({
                data: {
                    name: PUBLICATION_NAME
                }
            });
        }
        catch (error) {
            // If the publication doesn't exist, then there can't exist Posts attachet to it.
            console.error(`Publication ${PUBLICATION_NAME} could NOT be created`);
            throw error;
        }
    }
    const defaultTrx = event.detail?.defaultTrx;
    let syncDbUntilTrx;
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
            console.info("Default Trx NOT specified. NO DB entry found. Terminating process gracefully...");
            return;
        }
        syncDbUntilTrx = latestDBPost.trxHash;
    }
    else {
        syncDbUntilTrx = defaultTrx;
    }
    console.info(`Latest DB trxHash is: ${syncDbUntilTrx}`);
    // We need to get the latest Arweave Data first to have the cursor from which we
    // start syncing our DB, until the syncDbUntilCursor.
    const arweaveGraphQlData = await getArweaveGraphQlData();
    let latestArweaveCursor = arweaveGraphQlData[0].cursor;
    const latestArweaveTrxHash = arweaveGraphQlData[0].node.id;
    // Make sure we haven't been given an entry that's already in the DB
    // This avoids an infinite loop.
    const isEntryAlreadyInDB = await prisma.post.findUnique({
        where: {
            trxHash: latestArweaveTrxHash,
        },
    });
    if (isEntryAlreadyInDB) {
        console.log(`DB already up to date for ${PUBLICATION_NAME} publication.`);
        return;
    }
    // Gather data to be saved in DB
    let contentInfo = await getProcessedArweaveContent(latestArweaveTrxHash);
    // If content passes our minimum crypteria to be displayed, save it.
    if (contentInfo) {
        // Get authors for Post metadata
        let graphQlTagsArray = arweaveGraphQlData[0].node.tags;
        let contributor = graphQlTagsArray.filter((tag) => tag?.name === 'Contributor')[0]?.value;
        contentInfo.metadata = {
            authors: contributor
        };
        contentInfo.trxHash = latestArweaveTrxHash;
        contentInfo.cursor = latestArweaveCursor;
        // Save Post static HTML to S3 and get URL. 
        let postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
        contentInfo.fullContentS3URL = postURL;
        // Even if one Trx is problematic and we can't save it, we still try to save the rest.
        try {
            await saveToDB(contentInfo);
        }
        catch (error) {
            console.log(`Not able to save latest arweave post to DB. Trying to save the rest of the transactions... ERROR: ${error}`);
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
            if (!contentInfo)
                continue;
            contentInfo.trxHash = transaction.node.id;
            contentInfo.cursor = transaction.cursor;
            // Get authors for Post metadata
            let graphQlTagsArray = transaction.node.tags;
            let contributor = graphQlTagsArray.filter((tag) => tag?.name === 'Contributor')[0]?.value;
            contentInfo.metadata = {
                authors: contributor
            };
            let postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
            contentInfo.fullContentS3URL = postURL;
            try {
                await saveToDB(contentInfo);
            }
            catch (error) {
                // Even if one Trx is problematic and we can't save it, we still try to save the rest.
                console.log(`Not able to save latest arweave post to DB. Trying to save the rest of the transactions... ERROR: ${error}`);
            }
        }
    }
    console.info(`DB synced to Arweave for ${PUBLICATION_NAME}`);
};
async function saveHTMLtoS3(fullContent, trxHash) {
    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: trxHash,
        Body: fullContent,
    };
    try {
        await s3.upload(params).promise();
    }
    catch (error) {
        console.error(`Could NOT save Post ${trxHash} to S3: ${error}`);
        throw error;
    }
    return `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${trxHash}`;
}
async function getArweaveGraphQlData(latestCursor) {
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
            const latestArweaveData = await axios_1.default.post(GRAPHQL_ARWEAVE_ENDPOINT, {
                query: arweaveQuery,
                variables: {
                    tags: TAGS
                }
            });
            return latestArweaveData.data.data.transactions.edges;
        }
        catch (error) {
            console.error(error.response.data);
            throw error;
        }
    }
    else {
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
		}`;
        try {
            const latestArweaveData = await axios_1.default.post(GRAPHQL_ARWEAVE_ENDPOINT, {
                query: arweaveQuery,
                variables: {
                    tags: TAGS,
                    cursor: latestCursor
                }
            });
            return latestArweaveData.data.data.transactions.edges;
        }
        catch (error) {
            console.error(`The hashes of Arweave Posts could NOT be retrieved ${error.response.data}`);
            throw error;
        }
    }
}
async function getProcessedArweaveContent(latestArweaveTrxHash) {
    let arweaveContent;
    try {
        const arweaveContentString = await arweave.transactions.getData(latestArweaveTrxHash, { decode: true, string: true });
        arweaveContent = JSON.parse(arweaveContentString);
    }
    catch (error) {
        console.error(`Unable to retrieve content data from Arweave SDK for TrxHash: ${latestArweaveTrxHash}: ${error}`);
        throw error;
    }
    // If the content is encrypted, skip it.
    // Encrypted Trx do NOT have spaces.
    if (!arweaveContent.content.body.includes(" ")) {
        console.info(`Trx ${latestArweaveTrxHash} NOT saved because it is encrypted`);
        return null;
    }
    // If content is NOT longer than 300 chars, it's not worth displaying.
    if (arweaveContent.content.body.length < 300) {
        console.info(`Trx ${latestArweaveTrxHash} NOT saved because content is shorter than 300 chars`);
        return null;
    }
    // Get Published Time
    const unixTimestamp = parseInt(arweaveContent.content.timestamp); // Unix timestamp in seconds
    const date = new Date(unixTimestamp * 1000); // Convert Unix timestamp to milliseconds
    const formattedDate = new Date(date.toUTCString());
    // Turn Dirty Markdown into Dirty HTML
    const dirtyHTML = markdownToHTML(arweaveContent.content.body);
    // const contentSnippet = processedPostContent.substring(0, 600);
    const htmlForContentSnippet = processStaticHTML(dirtyHTML.substring(0, 5000), true);
    const contentSnippet = htmlForContentSnippet.replace(/<[^>]+>/g, '').substring(0, 597) + '...';
    // If content is NOT english, skip it.
    if (!checkEnglishLanguage(contentSnippet, parseInt(MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS))) {
        console.info(`Trx ${latestArweaveTrxHash} NOT saved because language is NOT english`);
        return null;
    }
    // Get title
    const title = arweaveContent.content.title;
    // Get processed content body.
    const processedStaticHTML = processStaticHTML(dirtyHTML);
    const contentInfo = {
        publishedAt: formattedDate,
        title: title,
        contentSnippet: contentSnippet,
        fullContent: processedStaticHTML,
        trxHash: latestArweaveTrxHash
    };
    return contentInfo;
}
function markdownToHTML(markdownText) {
    // if setting the headers to false is causing issues, install:
    // https://www.npmjs.com/package/marked-mangle
    // https://www.npmjs.com/package/marked-gfm-heading-id
    return marked_1.marked.parse(markdownText, { headerIds: false, mangle: false });
}
/**
 * Checks if a given text contains a minimum number of UNIQUE English words.
 * @param textToCheck The text to check for English language.
 * @param minimum_number_qunique_english_words The minimum number of unique English words required in the text.
 * @returns A boolean indicating whether the text contains the minimum number of unique English words.
 */
function checkEnglishLanguage(textToCheck, minimum_number_qunique_english_words) {
    let counter = 0;
    const wordsInText = textToCheck.split(/\W+/);
    // const mostCommonEnglishWordsReplicated: Set<String> = MOST_COMMON_ENGLISH_WORDS;
    for (const word of wordsInText) {
        if (counter === minimum_number_qunique_english_words)
            return true;
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
function processStaticHTML(staticHTML, removeLinks = false) {
    let sanitizedHTML;
    // sanitize and remove links
    if (removeLinks) {
        sanitizedHTML = (0, sanitize_html_1.default)(staticHTML, {
            allowedTags: sanitize_html_1.default.defaults.allowedTags.filter(tag => tag !== 'link' && tag !== 'a' && tag !== 'img')
        });
    }
    else {
        // general sanitization
        sanitizedHTML = (0, sanitize_html_1.default)(staticHTML, {
            allowedTags: sanitize_html_1.default.defaults.allowedTags.concat(['img', 'a']),
            allowedAttributes: {
                'a': ['href', 'name', 'target'],
                'img': ['src', 'alt']
            }
        });
    }
    return sanitizedHTML;
}
async function saveToDB(data) {
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
        }
        else {
            await prisma.post.create({
                data: {
                    uuid: (0, uuid_1.v4)(),
                    publishedAt: data.publishedAt,
                    trxHash: data.trxHash,
                    title: data.title,
                    contentSnippet: data.contentSnippet,
                    fullContentS3URL: data.fullContentS3URL,
                    cursor: data.cursor,
                    publicationName: PUBLICATION_NAME,
                    metadata: data.metadata
                }
            });
        }
    }
    catch (error) {
        console.error(`Unable to save Post (cursor: ${data.cursor}, trxHash: ${data.trxHash}) data to DB: ${error}`);
        throw error;
    }
    console.info(`Post ${data.trxHash} has been saved to DB.`);
}
module.exports = {
    handler: index
};
