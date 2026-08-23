FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-script-deva \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .
ENV NODE_ENV=production
ENV ENABLE_PDF_OCR=true
EXPOSE 3000
CMD ["npm", "start"]
