# RefLab Deployment Notes

Vercel builds the `main` branch. The `qrcode` package is a runtime dependency used by the RefCard profile page, so production deployments must include the latest `package.json` and `package-lock.json` from `main`.
