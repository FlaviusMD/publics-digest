# Based on OS/Arch: Linux, x86-64, ARM 64
FROM public.ecr.aws/lambda/nodejs:18.2023.07.13.16

WORKDIR /app

COPY ./ ./

ENV POSTGRES_USER=flavius
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=digest
ENV DATABASE_URL=postgresql://flavius:password@postgres:5432/digest?schema=public

RUN npm ci --omit=dev
RUN npx prisma generate

CMD ["index.handler"]