package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSomething(t *testing.T) {

	payload := `[{
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
	response := parseAndReturn([]byte(payload))
	assert.Equal(t, 1, response[0].Labels, "they should be equal")
	// assert equality
	assert.Equal(t, 123, 123, "they should be equal")

}
