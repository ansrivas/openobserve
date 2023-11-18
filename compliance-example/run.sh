#!/bin/bash

# OPENOBSERVE_VERSION=0.7.0
# PROMETHEUS_VERSION=2.48.0

tmux new -d -s session-openobserve && \
tmux new -d -s session-prometheus
tmux ls

# setup openobserve config
cp /opt/compliance/config/env /opt/compliance/.env

tmux send-keys -t session-openobserve "wget https://github.com/openobserve/openobserve/releases/download/v${OPENOBSERVE_VERSION}/openobserve-v${OPENOBSERVE_VERSION}-linux-amd64-musl.tar.gz && \
tar xvzf openobserve-v${OPENOBSERVE_VERSION}-linux-amd64-musl.tar.gz && \
chmod +x ./openobserve && \
./openobserve"  ENTER


cp /opt/compliance/config/prometheus-config.yaml /opt/compliance/prometheus-config.yaml

tmux send-keys -t session-prometheus "wget https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz && \
tar xvzf prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz && \
chmod +x prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus && \
./prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus --config.file=prometheus-config.yaml" ENTER


## Sleep for 1800s so that some data is generated
sleep 3600

cp /opt/compliance/config/compliance-openserver-config.yaml /opt/compliance/compliance-openserver-config.yaml
cp /opt/compliance/config/promql-test-queries.yml /opt/compliance/promql-test-queries.yml

/opt/compliance/promql-compliance-tester -config-file ./compliance-openserver-config.yaml -config-file ./promql-test-queries.yml > output 2>&1
sleep 15 # wait for 15s to flush the output
curl -X POST -F "file=@output" http://localhost:3000/upload
