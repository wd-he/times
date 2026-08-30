FROM node:24-alpine AS frontend-build

WORKDIR /src/frontend
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run typecheck && pnpm run build

FROM golang:1.27-alpine AS binary-build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
COPY --from=frontend-build /src/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/times .

FROM scratch AS binary

COPY --from=binary-build /out/times /times

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S times \
    && adduser -S -G times times \
    && mkdir /data \
    && chown times:times /data
WORKDIR /app
COPY --from=binary-build /out/times /app/times
ENV TIMES_ADDR=0.0.0.0:8080 \
    TIMES_DB_PATH=/data/times.db \
    TIMES_ADMIN_TOKEN_PATH=/data/admin.token \
    TIMES_LOG_PATH=/data/times.log \
    TIMES_PID_PATH=/data/times.pid
VOLUME ["/data"]
EXPOSE 8080
USER times
ENTRYPOINT ["/app/times"]
