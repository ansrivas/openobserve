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

func parseAndReturn(payload []byte, now time.Time, instance, job string) []promremote.TimeSeries {

	result := gjson.ParseBytes(payload)

	var timeSeriesList []promremote.TimeSeries

	result.ForEach(func(key, value gjson.Result) bool {
		name := value.Get("name").String()
		typeOf := value.Get("type").String()

		metricType := strings.ToLower(typeOf)
		switch metricType {
		case "gauge":

			labelsExist := len(value.Get("metrics.#.labels").Array()) != 0
			if labelsExist {
				// fmt.Println("labels found for ", name, value)

				value.Get("metrics.#.labels").ForEach(func(key, v gjson.Result) bool {
					var labels []promremote.Label
					labels = append(labels, promremote.Label{Name: "__name__", Value: name})
					labels = append(labels, promremote.Label{Name: "instance", Value: instance})
					labels = append(labels, promremote.Label{Name: "job", Value: job})

					// index := key.Int()
					// fmt.Println("index ", index)
					// valueOfLabel := fmt.Sprintf("metrics.%d.value", index)
					// fmt.Println(name, "key->", key, "value->", v.Get("@keys"), "valueget->", value.Get(valueOfLabel))
					v.ForEach(func(labelName, labelValue gjson.Result) bool {
						labels = append(labels, promremote.Label{Name: labelName.String(), Value: labelValue.String()})

						// fmt.Println("labelName->", labelName, "labelValue->", labelValue)
						return true
					})
					ts := promremote.TimeSeries{}
					datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
					ts.Labels = labels
					ts.Datapoint = datapoint
					// fmt.Println(ts)
					timeSeriesList = append(timeSeriesList, ts)
					return true
				})
			} else {
				// fmt.Println("No labels found for ", name)
				value.Get("metrics.#").ForEach(func(key, v gjson.Result) bool {
					var labels []promremote.Label
					labels = append(labels, promremote.Label{Name: "__name__", Value: name})
					labels = append(labels, promremote.Label{Name: "instance", Value: instance})
					labels = append(labels, promremote.Label{Name: "job", Value: job})

					ts := promremote.TimeSeries{}
					datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
					ts.Datapoint = datapoint
					ts.Labels = labels
					timeSeriesList = append(timeSeriesList, ts)
					// fmt.Println(name, key, v, value.Get("metrics.0.value").Float())
					return true
				})
			}

		// case "counter":
		// 	var labels []promremote.Label
		// 	labels = append(labels, promremote.Label{Name: "__name__", Value: name})
		// 	labels = append(labels, promremote.Label{Name: "__name__", Value: name})
		// 	ts := promremote.TimeSeries{}
		// 	datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
		// 	ts.Labels = labels
		// 	ts.Datapoint = datapoint
		// 	timeSeriesList = append(timeSeriesList, ts)
		default:
		}

		return true // keep iterating
	})
	return timeSeriesList
}

func main() {

	// Ensure that we metrics from 3 sources
	// Create two clients
	// Push to both OO and Prometheus
	// Save this data in some format ( binary or what-so-ever)
	// Given path to this data ( sorted by timestamp or so??) Start ingesting data now - 30 minutes
	// and keep adding 5s for each row
	payload1 := CreatePayload("http://demo.promlabs.com:10000/metrics")
	payload2 := CreatePayload("http://demo.promlabs.com:10001/metrics")
	payload3 := CreatePayload("http://demo.promlabs.com:10002/metrics")
	fmt.Println(string(payload1))

	now := time.Now()

	timeSeriesList1 := parseAndReturn(payload1, now, "demo.promlabs.com:10000", "job")
	timeSeriesList2 := parseAndReturn(payload2, now, "demo.promlabs.com:10001", "job")
	timeSeriesList3 := parseAndReturn(payload3, now, "demo.promlabs.com:10002", "job")
	timeserieses := [][]promremote.TimeSeries{timeSeriesList1, timeSeriesList2, timeSeriesList3}
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

	for _, timeSeriesList := range timeserieses {
		result, err := client.WriteTimeSeries(context.Background(), timeSeriesList, options)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(result)
	}
	// ctx := context.Background()
	// result2, err := client.WriteTimeSeries(ctx, timeSeriesList, options)
	// if err != nil {
	// 	log.Fatal(err)
	// }
	// log.Println(result2)
}
