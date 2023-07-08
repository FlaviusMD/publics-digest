# Good to know
1) Locally using PostgreSQL@15.3. This is the latest version supported by RDS. (Use 15.2 for Aurora Global Serverless)
2) Minimum version of nodeJS we can work with is 18+, as the arweave npm package requires it.

###
###
###

# Table Data

| Post     | Mirror      | Paragraph |
|----------|-------------|----------|
| publishedAt     |    getData()["content"]["timestamp"]    | getData()["publishedAt"] |
| trxHash     |   graphql_response["data"]["transactions"]["edges"]["node"]["id"]     | ✅ | 
| title | getData()["content"]["title"] | getData()["title"] |
| contentSnippet | getData()["content"]["body"] -- Keep 300 characters -- remove \n | getData()["markdown"] -- Keep 300 characters -- remove \n |
| fullContent | getData()["content"]["body"] | getData()["markdown"] |
| cursor     |    graphql_response["data"]["transactions"]["edges"]["cursor"]    | ✅ |
| metadata | On the GraphQL object. Loop through the return tags in search of "Contributor" | getData()["authors"] |

###
###
| Publication     | Mirror  | Paragraph |
|----------|-------------|----------|
| name     |   name retrived from lambda function call params     | ✅ |
