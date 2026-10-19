# CI-only overlay. Never push, tag stable, or deploy this prototype.
# Reuses exact rc3 application/model/package bytes; it does not rebuild them.
FROM ghcr.io/oxygengs/kima-hub@sha256:7ff9b5a0f5d53466ddea71c028e8283ae9753c560ba6cde233445918085a8843
USER root
RUN groupadd --system kimabackend \
    && useradd --system --gid kimabackend --create-home --home-dir /home/kimabackend --shell /usr/sbin/nologin kimabackend \
    && groupadd --system kimaaudio \
    && useradd --system --gid kimaaudio --create-home --home-dir /home/kimaaudio --shell /usr/sbin/nologin kimaaudio \
    && mkdir -p /app/nonroot-hf /home/kimaaudio/.cache/numba \
    && cp -a /root/.cache/huggingface/hub /app/nonroot-hf/hub \
    && chown -R root:root /app/nonroot-hf \
    && chmod -R a+rX,go-w /app/nonroot-hf \
    && chown -R kimaaudio:kimaaudio /home/kimaaudio \
    && chmod 750 /home/kimaaudio /home/kimabackend
# Copy only existing public offline cache files, not secrets or /root ownership.
ENV KIMA_NONROOT_EXPERIMENT=1 \
    HF_HOME=/app/nonroot-hf \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    CLAP_ROBERTA_TOKENIZER_JSON=/app/nonroot-hf/hub/models--roberta-base/snapshots/e2da8e2f811d1448a5b465c236feacd80ffbac7b/tokenizer.json \
    NUMBA_CACHE_DIR=/home/kimaaudio/.cache/numba
COPY nonroot.py /app/nonroot-experiment.py
RUN chmod 644 /app/nonroot-experiment.py \
    && python3 /app/nonroot-experiment.py patch-start \
    && gosu kimaaudio test -r "$CLAP_ROBERTA_TOKENIZER_JSON" \
    && gosu kimaaudio test -w "$NUMBA_CACHE_DIR"
LABEL org.oxygengs.experiment="nonroot-services-ci-only-not-release"
# Inherit rc3 tini/start.sh. Root is retained for bootstrap and supervisor;
# only the actual backend/analyzer service processes drop privileges.
