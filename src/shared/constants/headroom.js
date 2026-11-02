export const HEADROOM_VERSION = "0.42.0";
export const HEADROOM_PORT = 8787;
export const HEADROOM_CONTAINER_NAME = "headroom";
export const HEADROOM_IMAGE = "ghcr.io/konaimav2/headroom:0.42.0";
export const HEADROOM_COMPRESSORS = ["smart_crusher", "search", "log", "tabular", "config", "html"];
export const HEADROOM_SAMPLE_LINES = 40;

export function buildHeadroomDockerfile() {
  const compressors = HEADROOM_COMPRESSORS.join(",");
  return `FROM python:3.12-slim
RUN pip install "headroom-ai[proxy]==${HEADROOM_VERSION}"
ENV HEADROOM_ALLOW_UNAUTHENTICATED_BIND=1
EXPOSE ${HEADROOM_PORT}
CMD ["headroom", "proxy", "--host", "0.0.0.0", "--port", "${HEADROOM_PORT}", "--compressor", "${compressors}", "--no-subscription-tracking"]`;
}

export function buildHeadroomRunCommand() {
  const compressors = HEADROOM_COMPRESSORS.join(",");
  return `docker run -d --name ${HEADROOM_CONTAINER_NAME} -e HEADROOM_ALLOW_UNAUTHENTICATED_BIND=1 -p 127.0.0.1:${HEADROOM_PORT}:${HEADROOM_PORT} ${HEADROOM_IMAGE} headroom proxy --host 0.0.0.0 --port ${HEADROOM_PORT} --compressor ${compressors} --no-subscription-tracking`;
}

export function headroomSampleMessages(linesCount = HEADROOM_SAMPLE_LINES) {
  const lines = [];
  for (let i = 1; i <= linesCount; i++) {
    const pad = String(i).padStart(2, "0");
    const level = i % 5 === 0 ? "ERROR" : i % 3 === 0 ? "WARN" : "INFO";
    lines.push(`2026-10-06T12:00:${pad}.000Z [${level}] worker-service: task_${i} status=processed duration_ms=${10 + i * 2}`);
  }
  return [
    {
      role: "user",
      content: lines.join("\n"),
    },
  ];
}
