package main

import (
	"context"
	"fmt"
	"log"
	"testing"
	"time"

	"github.com/m3db/prometheus_remote_client_golang/promremote"
	"github.com/stretchr/testify/assert"
)

func sendToOO(payload []promremote.TimeSeries) {
	client := ooClient()
	headers := make(map[string]string)
	headers["Authorization"] = "Basic " + basicAuth("root@example.com", "Complexpass#123")

	options := promremote.WriteOptions{
		Headers: headers,
	}

	result, err := client.WriteTimeSeries(context.Background(), payload, options)
	if err != nil {
		log.Fatal(err)
	}
	log.Println(result)
}

func TestSomething(t *testing.T) {

	payload := `[
    {
    "name": "go_info",
    "help": "Information about the Go environment.",
    "type": "GAUGE",
    "metrics": [
      {
        "labels": {
          "version": "go1.21.1"
        },
        "value": "1"
      }
    ]
  },
    {
    "name": "go_memstats_alloc_bytes_total",
    "help": "Total number of bytes allocated, even if freed.",
    "type": "COUNTER",
    "metrics": [
      {
        "value": "5.851427218592e+12"
      }
    ]
  },{
    "name": "promhttp_metric_handler_requests_in_flight",
    "help": "Current number of scrapes being served.",
    "type": "GAUGE",
    "metrics": [
      {
        "value": "1"
      }
    ]
  },  
  {
    "name": "promhttp_metric_handler_requests_total",
    "help": "Total number of scrapes by HTTP status code.",
    "type": "COUNTER",
    "metrics": [
      {
        "labels": {
          "code": "200"
        },
        "value": "2.0066291e+07"
      },
      {
        "labels": {
          "code": "500"
        },
        "value": "0"
      },
      {
        "labels": {
          "code": "503"
        },
        "value": "0"
      }
    ]
  }
]
`
	now := time.Now()
	response := parseAndReturn([]byte(payload), now, "demo.1", "job")
	fmt.Println(formatTimeSeries(response))

	// assert equality
	assert.Equal(t, 123, 124, "they should be equal")

}

func TestQuantiles(t *testing.T) {

	payload := `[
    {
    "name": "go_gc_duration_seconds",
    "help": "A summary of the pause duration of garbage collection cycles.",
    "type": "SUMMARY",
    "metrics": [
      {
        "quantiles": {
          "0": "4.3739e-05",
          "0.25": "7.7115e-05",
          "0.5": "0.000103558",
          "0.75": "0.000138977",
          "1": "0.004940157"
        },
        "count": "2600367",
        "sum": "377.264188367"
      }
    ]
  }
]
`
	now := time.Now()
	response := parseAndReturn([]byte(payload), now, "demo.1", "job")
	fmt.Println(formatTimeSeries(response))

	// assert equality
	assert.Equal(t, 123, 124, "they should be equal")
	sendToOO(response)
}

func TestHistogram(t *testing.T) {

	payload := `[{
    "name": "demo_api_request_duration_seconds",
    "help": "A histogram of the API HTTP request durations in seconds.",
    "type": "HISTOGRAM",
    "metrics": [
      {
        "labels": {
          "method": "GET",
          "path": "/api/bar",
          "status": "200"
        },
        "buckets": {
          "0.0001": "0",
          "0.00015000000000000001": "0",
          "0.00022500000000000002": "0",
          "0.0003375": "0",
          "0.00050625": "0",
          "0.000759375": "0",
          "0.0011390624999999999": "0",
          "0.0017085937499999998": "0",
          "0.0025628906249999996": "0",
          "0.0038443359374999994": "0",
          "0.00576650390625": "0",
          "0.008649755859375": "342",
          "0.0129746337890625": "4860546",
          "0.01946195068359375": "108087575",
          "0.029192926025390625": "109070850",
          "0.043789389038085935": "111642306",
          "0.0656840835571289": "116584910",
          "0.09852612533569335": "116585309",
          "0.14778918800354002": "116585312",
          "0.22168378200531003": "116585312",
          "0.33252567300796504": "116585312",
          "0.49878850951194753": "116585312",
          "0.7481827642679213": "116585312",
          "1.122274146401882": "116585312",
          "1.683411219602823": "116585312"
        },
        "count": "116585312",
        "sum": "2.0490822492874267e+06"
      },
      {
        "labels": {
          "method": "GET",
          "path": "/api/bar",
          "status": "500"
        },
        "buckets": {
          "0.0001": "0",
          "0.00015000000000000001": "0",
          "0.00022500000000000002": "0",
          "0.0003375": "0",
          "0.00050625": "0",
          "0.000759375": "0",
          "0.0011390624999999999": "0",
          "0.0017085937499999998": "0",
          "0.0025628906249999996": "0",
          "0.0038443359374999994": "0",
          "0.00576650390625": "0",
          "0.008649755859375": "0",
          "0.0129746337890625": "12051",
          "0.01946195068359375": "270907",
          "0.029192926025390625": "273414",
          "0.043789389038085935": "338592",
          "0.0656840835571289": "465545",
          "0.09852612533569335": "465556",
          "0.14778918800354002": "465556",
          "0.22168378200531003": "465556",
          "0.33252567300796504": "465556",
          "0.49878850951194753": "465556",
          "0.7481827642679213": "465556",
          "1.122274146401882": "465556",
          "1.683411219602823": "465556"
        },
        "count": "465556",
        "sum": "13058.526869815803"
      }
]
`
	now := time.Now()
	response := parseAndReturn([]byte(payload), now, "demo.1", "job")
	fmt.Println(formatTimeSeries(response))
	// assert equality
	assert.Equal(t, 123, 124, "they should be equal")
	sendToOO(response)
}
