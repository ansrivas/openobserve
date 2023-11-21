package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/m3db/prometheus_remote_client_golang/promremote"
	"github.com/tidwall/gjson"
	// promb "github.com/prometheus/prometheus/prompb"
	// protojson "google.golang.org/protobuf/encoding/protojson"
)

func basicAuth(username, password string) string {
	auth := username + ":" + password
	return base64.StdEncoding.EncodeToString([]byte(auth))
}

func main() {

	// Ensure that we metrics from 3 sources
	// Create two clients
	// Push to both OO and Prometheus
	// Save this data in some format ( binary or what-so-ever)
	// Given path to this data ( sorted by timestamp or so??) Start ingesting data now - 30 minutes
	// and keep adding 5s for each row
	payload := CreatePayload("http://demo.promlabs.com:10000/metrics")
	// fmt.Println(string(payload))
	// payload := CreatePayload("http://demo.promlabs.com:10001/metrics")
	// payload := CreatePayload("http://demo.promlabs.com:10002/metrics")

	fmt.Println(string(payload))
	now := time.Now()
	result := gjson.ParseBytes(payload)

	var timeSeriesList []promremote.TimeSeries

	result.ForEach(func(key, value gjson.Result) bool {
		name := value.Get("name").String()
		typeOf := value.Get("type").String()

		var labels []promremote.Label

		metricType := strings.ToLower(typeOf)
		switch metricType {
		case "gauge":
			labels = append(labels, promremote.Label{Name: "__name__", Value: name})
			ts := promremote.TimeSeries{}
			datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
			ts.Labels = labels
			ts.Datapoint = datapoint
			timeSeriesList = append(timeSeriesList, ts)
		case "counter":
			labels = append(labels, promremote.Label{Name: "__name__", Value: name})
			ts := promremote.TimeSeries{}
			datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
			ts.Labels = labels
			ts.Datapoint = datapoint
			timeSeriesList = append(timeSeriesList, ts)
		}

		return true // keep iterating
	})
	// return
	// create config and client
	cfg := promremote.NewConfig(
		promremote.WriteURLOption("http://localhost:5080/api/default/prometheus/api/v1/write"),
		// promremote.WriteURLOption("http://localhost:9090/api/v1/write"),
		promremote.HTTPClientTimeoutOption(60*time.Second),
	)

	client, err := promremote.NewClient(cfg)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to construct client: %v", err))
	}

	// timeSeriesList = []promremote.TimeSeries{
	// 	promremote.TimeSeries{
	// 		Labels: []promremote.Label{
	// 			{
	// 				Name:  "__name__",
	// 				Value: "foo_bar",
	// 			},
	// 			{
	// 				Name:  "biz",
	// 				Value: "baz",
	// 			},
	// 		},
	// 		Datapoint: promremote.Datapoint{
	// 			Timestamp: time.Now(),
	// 			Value:     1415.92,
	// 		},
	// 	},
	// 	promremote.TimeSeries{
	// 		Labels: []promremote.Label{
	// 			{
	// 				Name:  "__name__",
	// 				Value: "foo_bar2",
	// 			},
	// 			{
	// 				Name:  "biz",
	// 				Value: "baz",
	// 			},
	// 		},
	// 		Datapoint: promremote.Datapoint{
	// 			Timestamp: time.Now(),
	// 			Value:     1415.91,
	// 		},
	// 	},
	// }

	headers := make(map[string]string)
	headers["Authorization"] = "Basic " + basicAuth("root@example.com", "Complexpass#123")

	options := promremote.WriteOptions{
		Headers: headers,
	}

	ctx := context.Background()
	result2, err := client.WriteTimeSeries(ctx, timeSeriesList, options)
	if err != nil {
		log.Fatal(err)
	}
	log.Println(result2)
}
