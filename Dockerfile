FROM node:18.16-alpine

WORKDIR /app

COPY dist/ ./

ENV POSTGRES_USER=flavius
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=digest
ENV DATABASE_URL=postgresql://flavius:password@postgres:5432/digest?schema=public

RUN npm ci --omit=dev
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "index.js"]