# Development image for the local Docker workflow (see docker-compose.yml).
# This is NOT a production image — production deploys to Vercel.
FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1

# bash drives the seed/entrypoint scripts; openssl is handy for generating
# secrets; sharp (image processing) needs the runtime libs already in the base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

# Install dependencies first so this layer is cached unless the manifest changes.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Source is bind-mounted at runtime for HMR; copy it too so the image can run
# standalone (e.g. `docker run`) without a mount.
COPY . .

EXPOSE 3000
ENTRYPOINT ["bash", "docker/entrypoint.sh"]
