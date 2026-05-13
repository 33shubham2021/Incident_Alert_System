FROM redis:7-alpine

# Copy custom config into container
COPY redis.conf /usr/local/etc/redis/redis.conf

# Persistence directory
RUN mkdir -p /data

EXPOSE 6379

CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
