FROM node:12-slim as builder

RUN apt update && apt install cpio -y

COPY package.json yarn.lock* ./
RUN yarn install --no-optional

COPY . .
RUN yarn && yarn cache clean --force

COPY localhost.env .env
RUN NODE_ENV=production yarn build

FROM node:12-alpine

WORKDIR /app
COPY --from=builder package.json tsconfig.json .env yarn.lock ./
COPY --from=builder build/ ./build
COPY --from=builder node_modules/ ./node_modules

RUN yarn add concurrently
RUN yarn add pm2 -G

EXPOSE 3001
EXPOSE 3011

ENTRYPOINT [ "yarn", "pm2", "start", "--no-daemon" ]
CMD [ "yarn init-offchain && yarn start" ]
