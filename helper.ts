/*
            1) "[{name:"AppName", values:["Paragraph"]}]"
*/

const Arweave = require('arweave');
import axios from "axios";

// https://arweave.net/graphql
const GRAPHQL_ARWEAVE_ENDPOINT = "https://arweave-search.goldsky.com/graphql";
const TAGS = [{ name: "App-Name", values: ["MirrorXYZ"] }];
const LATEST_ARWEAVE_ENTRY_QUERY = `
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

const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
});

const latestArweaveCursor = "eyJzZWFyY2hfYWZ0ZXIiOlsxMjE1MjUxLCJGZncxM0ZYYWlOei10WXMwbmNYNy1tcmJzQVBLWXNLYl9xLWN4UFpBalVVIl0sImluZGV4IjowfQ==";

async function main() {
    let arweaveTrxBatch = await getArweaveGraphQlData(latestArweaveCursor);

    for (const transaction of arweaveTrxBatch) {
        console.log(transaction)
    }
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

main();