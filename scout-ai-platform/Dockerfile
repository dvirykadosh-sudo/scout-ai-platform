# שירות יחיד: האתר והשרת על אותו פורט (מתאים ל-Render, Railway, Fly.io ועוד)
FROM node:24-slim
WORKDIR /app
COPY . .
RUN node run.mjs build-prod
ENV NODE_ENV=production
ENV DB_PATH=/data/scout.db
EXPOSE 10000
ENV PORT=10000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/all.js"]
