import sanitizeHtml from 'sanitize-html';

let dirty = `<p>As the testnet phase of the Router Chain unfolds, our team has been working to optimize the architecture for seamless
cross-chain workflows. These efforts have resulted in a series of significant updates that have (a) improved our
throughput, (b) optimized our costs, and © made our offering more developer-friendly. This blog will explore the new
<a target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\" class=\"dont-break-out af lz\"
    href=\"https://routerprotocol.com/router-chain-whitepaper.pdf\"><u>Whitepaper</u></a>, which incorporates the
recent architectural update.</p>
<h1 style=\"text-align: start\"><strong>The Recent Architectural Update</strong></h1>
<p style=\"text-align: start\">To understand the new update, let’s briefly recap the Router Chain’s flow; it has three
major flows — Inbound, Outbound, and CrossTalk, each with a different function call and different modules for
handling their execution.</p>
<p style=\"text-align: start\">The Inbound flow handles the transmission of requests from other chains to the Router
chain, whereas the Outbound flow forwards requests from the Router chain to other chains.</p>
<p style=\"text-align: start\">Router empowers applications to exert greater control over their business logic through
middleware contracts positioned between the Inbound and Outbound flow. The third flow, the CrossTalk workflow, is
enabled by our CrossTalk module, an easy-to-integrate smart contract library that allows developers to build
cross-chain applications without any custom bridging logic.</p>
<p style=\"text-align: start\">However, during our internal testnet, we made further improvements and standardized the
function parameters. We merged the Inbound, Crosstalk, and Outbound into a unified flow on the implementation side.
This resulted in reduced size of the Gateway contract and much lower gas costs while interacting with it. Now,
developers can simply pass their request information using a single function. The Router Chain will decode it as
metadata and data information, transforming the request for the destination chain. This enhanced compatibility
allows us to add support for new types of chains much more easily.</p>
<p style=\"text-align: start\">Initially, the integration of Ethermint resulted in an increased block time (from 3
seconds to 30 seconds). As part of this update, we have made changes in the Ethermint implementation to bring back
the block time to under 3 seconds. To further optimize our block time, we have also tweaked our re-execution logic
for pending transactions. Earlier, we used to retry all the pending transactions in a block at the end of that block
itself, which used to result in higher block times. Now, we maintain the pending transactions in a separate block
queue, which is executed after every X blocks (where X is a configurable parameter currently set to 300).</p>
<p style=\"text-align: start\">In addition to the aforementioned changes, we have introduced batching for the
orchestrator, which has allowed for an increased TPS (transactions per second) for cross-chain requests. Now,
instead of forwarding every cross-chain request from a chain as it comes, we wait for either 100 requests from that
chain or Y seconds (whichever happens first), batch all the requests and then forward the batched request to the
Router chain. Note that Y is a chain-specific configurable parameter currently set to 20.</p>
<figure float=\"none\" data-type=\"figure\" class=\"img-center\" style=\"max-width: null;\"><img
    src=\"https://storage.googleapis.com/papyrus_images/ad6c4a813d07398477420534e8feedc1.png\" class=\"image-node
    embed\">
<figcaption htmlattributes=\"[object Object]\" class=\"\">Quick Comparison</figcaption>
</figure>
<h1 style=\"text-align: start\"><strong>About Router Protocol</strong></h1>
<p style=\"text-align: start\">Router Protocol is a pioneering cross-chain solution that enables secure and efficient
communication between blockchain networks. The L1 Router Chain uses Tendermint’s BFT consensus to address
interoperability challenges while enhancing security and scalability through decentralization. The Chain enables
cross-chain meta transactions, stateful bridging, transaction batching, and batch atomicity, providing a modular
framework for building cross-chain dApps in web3. The use cases range from cross-chain NFTs, cross-chain governance,
and cross-chain stablecoins to cross-chain oracles and cross-chain marketplaces and many more</p>
<p style=\"text-align: start\">Read our Whitepaper here — <a target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\"
    class=\"dont-break-out dont-break-out\"
    href=\"https://routerprotocol.com/router-chain-whitepaper.pdf\"><u>https://routerprotocol.com/router-chain-whitepaper.pdf</u></a>
</p>
<p style=\"text-align: start\">Stay tuned for more updates, and keep us close at hand by following us on your preferred
social media platform!</p>
<p style=\"text-align: start\"><a target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\" class=\"dont-break-out af
    lz\" href=\"https://routerprotocol.com/\"><u>Website</u></a> | <a target=\"_blank\" rel=\"noopener noreferrer
    nofollow ugc\" class=\"dont-break-out af lz\" href=\"https://twitter.com/routerprotocol\"><u>Twitter</u></a> |
<a target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\" class=\"dont-break-out af lz\"
    href=\"https://t.me/routerprotocol\"><u>Telegram</u></a> | <a target=\"_blank\" rel=\"noopener noreferrer
    nofollow ugc\" class=\"dont-break-out af lz\" href=\"https://t.me/router_ann\"><u>Telegram announcements</u></a>
| <a target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\" class=\"dont-break-out af lz\"
    href=\"https://discord.gg/yjM2fUUHvN\"><u>Discord</u></a></p>`;

let clean = sanitizeHtml(dirty, {
    allowedTags: sanitizeHtml.defaults.allowedTags.filter(tag => tag !== 'img'),
});

console.log(clean);
