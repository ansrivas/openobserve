## Running Openobserve promql compliance tests, self contained process

docker build --no-cache -t openobserve/promqlcompliance:latest -f Dockerfile . && docker run --network=host -e OPENOBSERVE_VERSION=0.7.0 -e PROMETHEUS_VERSION=2.48.0  --rm -it openobserve/promqlcompliance:latest
