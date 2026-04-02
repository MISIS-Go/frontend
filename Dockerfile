FROM denoland/deno:2.6.10

WORKDIR /app

COPY frontend ./frontend

WORKDIR /app/frontend

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "server.ts"]
