# FROM: chọn base image có sẵn Node 22, bản alpine nhẹ. Image này kéo từ Docker Hub.
FROM node:22-alpine

# WORKDIR: tạo và chuyển vào /app trong container, mọi lệnh sau chạy trong đó.
WORKDIR /app

# COPY: chép package.json + package-lock.json từ repo vào image. Chép trước vì
# lớp này ít đổi, Docker cache lại, build lần sau nhanh hơn.
COPY package*.json ./

# RUN: cài dependency khi build image. --omit=dev bỏ devDependencies vì chạy
# thật không cần công cụ dev.
RUN npm ci --omit=dev

# COPY: chép mã nguồn vào image. Đổi ở đây thì chỉ lớp này rebuild, không cài lại lib.
COPY src ./src
COPY db ./db
COPY scripts/migrate.mjs scripts/retention.mjs ./scripts/

# ENV: biến môi trường bên trong container, báo cho Node biết đang production.
ENV NODE_ENV=production

USER node

# CMD: lệnh chạy khi container khởi động. Dạng array tránh shell trung gian.
CMD ["node", "src/index.js"]
