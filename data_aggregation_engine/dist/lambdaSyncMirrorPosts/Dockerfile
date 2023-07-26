# Based on OS/Arch: Linux, x86-64
# When building for Linux, x86-64: docker build --platform linux/amd64 -t data-aggregation-mirror:1.0 .
FROM public.ecr.aws/lambda/nodejs:18.2023.07.19.03-x86_64

WORKDIR ${LAMBDA_TASK_ROOT}

COPY ./ ./

# ENV will be assigned at creation-time through terraform.
# Uncomment for local development.
# ENV POSTGRES_USER=flavius
# ENV POSTGRES_PASSWORD=password
# ENV POSTGRES_DB=digest
# ENV DATABASE_URL=postgresql://flavius:password@postgres:5432/digest?schema=public

RUN npm ci --omit=dev
RUN npx prisma generate

CMD ["index.handler"]