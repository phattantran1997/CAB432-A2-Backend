# Use the Node.js base image
FROM node:18

# Install ffmpeg (which includes ffprobe)
RUN apt-get update && apt-get install -y ffmpeg

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port that your application runs on
EXPOSE 3000

# Start your application
CMD ["npm", "start"]