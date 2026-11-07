# Plugin market index

## Add this source in DSH

Enable **Custom plugin market** under Plugins > Experimental plugins, then open
**Discover > Index sources** and paste this exact raw JSON URL:

```text
https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json
```

Do not paste a GitHub `tree` or `blob` page URL. Those return a web page rather
than the format-1 index and DSH reports `$.format must be 1`. Remove that invalid
source and add the raw URL above. The same rule applies to other markets.

请复制上面的 raw JSON 地址到「发现 → 索引源」。不要填写本页的 GitHub
网页地址；遇到 `$.format must be 1` 时，移除错误源并重新添加上述地址。

Generated from the npm registry by `scripts/market-index.mjs` for `dsh-cabinet-mode`.
Do not edit this branch by hand: the release workflow force-pushes it after every
tagged publish, and maintainers can refresh it with the `Market index` workflow.
