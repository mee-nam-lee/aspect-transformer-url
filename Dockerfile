# Stage 1: Build the frontend
FROM node:20-slim as frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend and serve
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
# Copy frontend build artifacts to backend static folder
COPY --from=frontend-build /app/frontend/dist ./backend/static

EXPOSE 8080
ENV PORT 8080

# Command to run the app
CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
