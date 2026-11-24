# BI report production release — 24 November 2026

Firebase published the BI frontend at 19:12 Myanmar time. The release covers appointment and payment workbooks, customer profile links, company and branch selection, Branch Performance, and the Dashboard and Daily Report accounting queries.

| Component | Production record |
| --- | --- |
| Frontend source | `zayar/GT-Dashboard` on `main`, commit `cb057ea742757c5e0cc59a8eb3dd41a172176004` |
| API source | `mmdatafocus/gt.apicore` on `master`, commit `162ffc8834b9a9543b8d0624bd659bb2e3a5e985` |
| Firebase Hosting | Project `aesthetics-441d8`, site `gtportal1`, live version `d743b8aa7a310691`, release `1795524131992000` |
| Previous Hosting version | `8be267985f0045c7` |
| Previous Cloud Run revision | `greattime-api-core-00494-wk6` in `pitistartup/us-central1` |
| Direct API deployment | `greattime-api-core-bi-1124-6ea76dc`, image digest `sha256:3a847ddc3c57beaf2b4789bd3a5fa54eb5c7408e94c6b79424ff48eebcf73bf0` |
| Subsequent serving revision | `greattime-api-core-00496-h5t`, image digest `sha256:49419f2921e1329052aeeb68db2d48957238a83025036d1f9ce99f63133362bf` |

The direct release added the BI modules to the previous serving image. On the preview and live endpoints, all 444 existing query signatures and 457 mutation signatures matched the previous deployment. Both new queries appeared and anonymous access to branch results was denied.

The public Branch Performance route served the release HTML. Its JavaScript asset `/assets/index-xf3iqSVj.js` matched SHA-256 `06afe4bd98edfd33e4fba0310c7c073f6beaf7473b96dc7b4edb5aaf43e6afe9`. A signed-in production session loaded one authorized branch. Multiple branches, restricted assignments and mixed currencies were exercised with fixtures.

The frontend production build and all 142 frontend tests passed. APICORE type checking and the report integration tests passed. The existing frontend strict type check still reports 57 baseline diagnostics.

A later production revision became active after the frontend was published. The final-image check compared all 5,921 compiled JavaScript modules with the verified direct release. The only differing module was the resolver registration file. The BI resolver and SQL service were byte-identical. The final serving image passed the MySQL 8 checks for company and branch scope, duplicate invoice numbers, Myanmar day boundaries, dashboard reconciliation and anonymous access. The signed-in Branch Performance page loaded again after the revision change.

[Production report](https://bi.greattime.app/branch-performance) · [Direct release build](https://console.cloud.google.com/cloud-build/builds;region=us-central1/9727d380-f477-4286-9c88-c94631de8e79?project=pitistartup) · [Final serving image verification](https://console.cloud.google.com/cloud-build/builds;region=us-central1/23a71da6-1732-4981-857c-0d2aae480eab?project=pitistartup)
