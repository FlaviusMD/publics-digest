# when building for (x86-64)linux/amd64, which is necessary for AWS Linux AMI: docker build --platform linux/amd64 -t publics-digest-api:1.0 .  
FROM node:18.16-alpine

WORKDIR /app

COPY dist/ ./

# ENV will be assigned at creation-time through terraform.
# Uncomment for local development.
# ENV POSTGRES_USER=flavius
# ENV POSTGRES_PASSWORD=password
# ENV POSTGRES_DB=digest
# ENV DATABASE_URL=postgresql://flavius:password@postgres:5432/digest?schema=public

RUN npm ci --omit=dev
RUN chown -R node /app/node_modules
RUN chmod +x /app/index.js
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "/app/index.js"]