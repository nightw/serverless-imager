# Using the smaller sized image as a base
FROM node:8.9.4-alpine

WORKDIR app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install --only=production

# Bundle app source without node-modules (node-modules is in the .dockerignore file)
COPY . .

EXPOSE 8080
CMD [ "npm", "start" ]
