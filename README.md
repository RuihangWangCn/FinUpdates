# FinUpdates

MVP for a daily A-share and US-stock market update site.

The prototype focuses on:

- Market breadth: advancers, decliners, unchanged names, limit-up/down counts, turnover, and index moves.
- Hot sector ranking: sector change, heat score, advancer ratio, leading stocks, lagging stocks, and related news.
- On-demand AI analysis: users click a news item to simulate a DeepSeek-style analysis that combines the news with the current market context.
- Manual AI control: AI analysis only runs after an explicit user click so API usage is not wasted.
- Market data sources: A-share index snapshots are pulled from Tencent Securities, A-share sector snapshots attempt Eastmoney, and US ETF proxy snapshots use the local Vite Stooq proxy.
- News crawler: the local Vite server can crawl Google News RSS by sector query, cache results briefly, and render them as clickable news cards.
- DeepSeek news bot: users can ask questions about the currently loaded sector news; the server only calls DeepSeek when the question form is submitted.
- Custom sector tracking: users can add a sector name and then crawl news for that sector on demand.
- Market validation: the analysis distinguishes between isolated news sentiment and whether the market has actually confirmed the message.
- Source navigation and search: news cards link out to source/search pages, and the header search opens Bing results for related news.

## Local Development

```bash
npm install
DEEPSEEK_API_KEY=your_key npm run dev
```

`DEEPSEEK_MODEL` is optional and defaults to `deepseek-chat`.

## Validation

```bash
npm run lint
npm run build
```
