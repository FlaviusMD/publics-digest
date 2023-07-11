// TODO Consider adding rate limiting when gitting the Arweave API
const Arweave = require("arweave");
import { PrismaClient } from '@prisma/client';
import axios from "axios";
import { S3 } from 'aws-sdk';
import sanitizeHtml from 'sanitize-html';
import { marked } from "marked";
import { v4 as uuidv4 } from "uuid";

const s3 = new S3();
const prisma = new PrismaClient();
const arweave = Arweave.init({
	host: 'arweave.net',
	port: 443,
	protocol: 'https'
});

const S3_BUCKET_NAME = "publicsdigestposts" // TODO Save in env variable
const GRAPHQL_ARWEAVE_ENDPOINT = "https://arweave-search.goldsky.com/graphql"; // TODO Save in env variable to easily switch between official endpoint and goldsky in case of failure.
const PUBLICATION_NAME = "MirrorXYZ";
const TAGS = [{ name: "App-Name", values: ["MirrorXYZ"] }];

export default async function lambdaSyncMirrorPosts(defaultTrx?: string): Promise<void> {
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

	// If content is NOT encrypted, save it
	// Otherwise continue normal execution to find and save all non-encrypted posts.
	if (contentInfo) {
		// Get authors for Post metadata
		let graphQlTagsArray = arweaveGraphQlData[0].node.tags;
		let contributor = graphQlTagsArray.filter((tag: { name: string }) => tag?.name === 'Contributor')[0]?.value;
		contentInfo.metadata = {
			authors: contributor
		};

		console.dir(contentInfo);

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

			// Skip this transaction if it is encrypted
			if (!contentInfo) continue;

			contentInfo.trxHash = transaction.node.id;
			contentInfo.cursor = transaction.cursor;
			// Get authors for Post metadata
			let graphQlTagsArray = transaction.node.tags;
			let contributor = graphQlTagsArray.filter((tag: { name: string }) => tag?.name === 'Contributor')[0]?.value;
			contentInfo.metadata = {
				authors: contributor
			};
			let postURL = await saveHTMLtoS3(contentInfo.fullContent, contentInfo.trxHash);
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

	// If the content is encrypted, skip it.
	// Encrypted Trx do NOT have spaces.
	if (!arweaveContent.content.body.includes(" ")) return null;

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
	const processedStaticHTML = processStaticHTML(arweaveContent.content.body);

	const contentInfo = {
		publishedAt: formattedDate,
		title: title,
		contentSnippet: processedPostContent,
		fullContent: processedStaticHTML
	};

	return contentInfo;
}

// This version does NOT allow images (img tags are removed)
function processStaticHTML(staticHTML: string): String {
	const processedContentBody = staticHTML.replace(/\n/g, "<br>");
	const contentStaticHTMLDirty: string = marked.parse(processedContentBody, { headerIds: false, mangle: false })
	const contentStaticHTMLClean: string = sanitizeHtml(contentStaticHTMLDirty, {
		allowedTags: sanitizeHtml.defaults.allowedTags.filter(tag => tag !== 'img'),
	});

	return contentStaticHTMLClean;
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
				uuid: uuidv4(),
				publishedAt: data.publishedAt,
				trxHash: data.trxHash,
				title: data.title,
				contentSnippet: data.contentSnippet,
				fullContentS3URL: data.fullContentS3URL,
				cursor: data.cursor,
				publicationName: publication.name,
				metadata: data.metadata
			}
		})
	} catch (error) {
		console.error(`Unable to save Post (cursor: ${data.cursor}, trxHash: ${data.trxHash}) data to DB: ${error}`);
		throw error;
	}

	console.info(`Post ${data.trxHash} has been saved to DB.`);
}