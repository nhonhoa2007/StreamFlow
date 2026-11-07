# Sơ đồ StreamFlow

- [Kiến trúc hệ thống](./streamflow-kien-truc.html) · [PNG sáng](./streamflow-kien-truc.png) · [PNG tối](./streamflow-kien-truc-dark.png)
- [Luồng hoạt động](./streamflow-hoat-dong.html) · [PNG sáng](./streamflow-hoat-dong.png) · [PNG tối](./streamflow-hoat-dong-dark.png)

Hai file HTML tự chứa, mở trực tiếp trong trình duyệt. PNG được chụp từ chính HTML bằng Chromium.

## Phạm vi và những điểm cần lưu ý

- Sơ đồ kiến trúc tổng hợp các thành phần trong repo. `compose.stage-b.yaml` chỉ chạy NGINX, hai API replica, media worker, PostgreSQL, Redis và MinIO. Web và cặp event relay / analytics consumer không nằm trong Compose Stage B; chúng có mã nguồn riêng và hai worker phân tích có manifest Kubernetes.
- Web client ở chế độ phát triển gọi API tại `localhost:3000`. Đường từ Web qua NGINX trên sơ đồ thể hiện cấu hình Stage B, không phải luồng mặc định của web dev.
- Upload của admin dùng presigned PUT tới object storage rồi API kiểm tra bằng `HeadObject`. Lệnh transcode là một thao tác riêng, chưa tự chạy sau khi hoàn tất upload.
- Media worker nhận `sourceObjectKey` từ BullMQ rồi đưa thẳng cho `ffprobe` / FFmpeg như một đường dẫn file cục bộ. Chưa có bước tải source từ S3/MinIO/R2. Đầu ra HLS được ghi trên đĩa cục bộ, còn metadata trỏ đến object key trong storage; chưa có bước upload HLS/thumbnail lên đó. Vì vậy nhánh phát HLS từ một upload mới có thể thất bại.
- Luồng analytics dùng playback session + outbox trong một giao dịch PostgreSQL, event relay đẩy Kafka, analytics consumer ghi projection có chống xử lý trùng.

## Nguồn đối chiếu

- `backend/apps/api/src/upload/upload.service.ts`
- `backend/apps/api/src/queue/queue.service.ts`
- `backend/apps/media-worker/src/worker.ts`
- `backend/apps/media-worker/src/transcode-pipeline.ts`
- `backend/apps/api/src/playback/playback.service.ts`
- `backend/apps/event-relay/src/relay.ts`
- `backend/apps/analytics-consumer/src/consumer.ts`
- `infra/compose/compose.stage-b.yaml`
- `infra/kubernetes/workers-deployment.yaml`

Các nút công nghệ dùng logo từ svgl, bộ `gilbarbara/logos`, favicon BullMQ trên `bullmq.io` và logo MinIO trên `dl.min.io`. Pictogram cho người dùng và các bước trừu tượng lấy từ Tabler Icons (MIT). Sơ đồ dựng bằng skill `stack-diagram`.
