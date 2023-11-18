FROM fedora:39

RUN dnf update -y && dnf install -y tmux wget && mkdir -p /opt/compliance/config

ADD ./config/ /opt/compliance/config
COPY run.sh /opt/compliance/run.sh
COPY promql-compliance-tester /opt/compliance/promql-compliance-tester

WORKDIR /opt/compliance

ENTRYPOINT [ "/opt/compliance/run.sh" ]
