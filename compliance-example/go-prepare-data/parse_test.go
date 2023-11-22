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
	fmt.Println(response)
	// assert equality
	assert.Equal(t, 123, 124, "they should be equal")

	client := ooClient()
	headers := make(map[string]string)
	headers["Authorization"] = "Basic " + basicAuth("root@example.com", "Complexpass#123")

	options := promremote.WriteOptions{
		Headers: headers,
	}

	result, err := client.WriteTimeSeries(context.Background(), response, options)
	if err != nil {
		log.Fatal(err)
	}
	log.Println(result)

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
	fmt.Println(response)
	// assert equality
	assert.Equal(t, 123, 124, "they should be equal")

}
