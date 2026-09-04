
## Boot test (live, next dev :20199)
- boots clean, /api/health {ok:true}
- fallbacks create+list ✅ | quota-pools POST ✅ | prompts POST ✅
- keys credit GET+POST ✅ (creditLimit 5, rateLimit 60)
- ammail GET ✅, otps/:id 404-correct ✅, webhook 200 ✅, POST actions ✅
- codebuddy GET ✅, POST /:id 404-correct ✅
- cloudflare-ai POST 400-missing-creds ✅
- media-proxy 200 proxied ✅
- Next 16 gotcha: ctx.params is a Promise (await ctx.params)
