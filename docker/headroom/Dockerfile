FROM python:3.12-slim

ARG HEADROOM_VERSION=0.42.0

RUN pip install --no-cache-dir "headroom-ai[proxy]==${HEADROOM_VERSION}"

ENV HEADROOM_ALLOW_UNAUTHENTICATED_BIND=1
EXPOSE 8787

CMD ["headroom", "proxy", "--host", "0.0.0.0", "--port", "8787", "--compressor", "smart_crusher,search,log,tabular,config,html", "--no-subscription-tracking"]
