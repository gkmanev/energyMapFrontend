# Build step 1(installing node modules and preparing compiled build)

# Use an official Node.js image as the base image
FROM node:14 as builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the Vue.js application
RUN npm run build


# Build step 2(Deploying build on NGINX)
FROM nginx:1.17

# Update package lists and install necessary packages
RUN apt-get update -y && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Clean up default Nginx HTML content
RUN rm -rf /usr/share/nginx/html/*

# Copy configuration and built files from the builder stage
COPY --from=builder /usr/src/app/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
