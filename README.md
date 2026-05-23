# FinUpdates

MVP for a daily A-share and US-stock market update site.

The prototype focuses on:

- Market breadth: advancers, decliners, unchanged names, limit-up/down counts, turnover, and index moves.
- Hot sector ranking: sector change, heat score, advancer ratio, leading stocks, lagging stocks, and related news.
- On-demand AI analysis: users click a news item to simulate a DeepSeek-style analysis that combines the news with the current market context.
- Market validation: the analysis distinguishes between isolated news sentiment and whether the market has actually confirmed the message.

## Local Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run build
```
