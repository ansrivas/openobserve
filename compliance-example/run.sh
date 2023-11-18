#!/bin/bash

tmux new -d -s session-openobserve && \
tmux new -d -s session-prometheus && \
tmux new -d -s session-compliance

tmux ls

# setup openobserve config
cp /opt/compliance/config/env /opt/compliance/.env

tmux send-keys -t session-openobserve "wget https://github.com/openobserve/openobserve/releases/download/v0.7.0/openobserve-v0.7.0-linux-amd64-musl.tar.gz && \
tar xvzf openobserve-v0.7.0-linux-amd64-musl.tar.gz && \
chmod +x ./openobserve && \
./openobserve"  ENTER


cp /opt/compliance/config/prometheus-config.yaml /opt/compliance/prometheus-config.yaml

tmux send-keys -t session-prometheus "wget https://github.com/prometheus/prometheus/releases/download/v2.48.0/prometheus-2.48.0.linux-amd64.tar.gz && \
tar xvzf prometheus-2.48.0.linux-amd64.tar.gz && \
chmod +x prometheus-2.48.0.linux-amd64/prometheus && \
./prometheus-2.48.0.linux-amd64/prometheus --config.file=prometheus-config.yaml" ENTER


## Sleep for 1800s so that some data is generated
sleep 180

cp /opt/compliance/config/compliance-openserver-config.yaml /opt/compliance/compliance-openserver-config.yaml
cp /opt/compliance/config/promql-test-queries.yml /opt/compliance/promql-test-queries.yml

tmux send-keys -t session-compliance "/opt/compliance/promql-compliance-tester -config-file ./compliance-openserver-config.yaml -config-file ./promql-test-queries.yml > output 2 >&1;
curl -X POST -F "file=@output" http://some-server:3000/upload" ENTER

sleep 100