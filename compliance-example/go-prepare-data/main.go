package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
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

func ReadPayload(now time.Time, instance, job string) [][]promremote.TimeSeries {
	var lines [][]promremote.TimeSeries

	file, err := os.Open("file1.json")
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	thirtyMinutesAgo := now.Add(-30 * time.Minute)

	scanner := bufio.NewScanner(file)
	addFiveSeconds := 5 * time.Second
	// optionally, resize scanner's capacity for lines over 64K, see next example
	for scanner.Scan() {
		newNow := thirtyMinutesAgo.Add(addFiveSeconds)
		timeseries := parseAndReturn(scanner.Bytes(), newNow, instance, job)
		lines = append(lines, timeseries)
		addFiveSeconds = addFiveSeconds + 5*time.Second
	}

	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
	return lines
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
				value.Get("metrics.#.labels").ForEach(func(key, v gjson.Result) bool {
					var labels []promremote.Label
					labels = append(labels, promremote.Label{Name: "__name__", Value: name})
					labels = append(labels, promremote.Label{Name: "instance", Value: instance})
					labels = append(labels, promremote.Label{Name: "job", Value: job})

					v.ForEach(func(labelName, labelValue gjson.Result) bool {
						labels = append(labels, promremote.Label{Name: labelName.String(), Value: labelValue.String()})
						return true
					})
					ts := promremote.TimeSeries{}
					datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
					ts.Labels = labels
					ts.Datapoint = datapoint
					timeSeriesList = append(timeSeriesList, ts)
					return true
				})
			} else {
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
					return true
				})
			}

		case "counter":
			labelsExist := len(value.Get("metrics.#.labels").Array()) != 0
			if labelsExist {
				value.Get("metrics.#.labels").ForEach(func(key, v gjson.Result) bool {
					var labels []promremote.Label
					labels = append(labels, promremote.Label{Name: "__name__", Value: name})
					labels = append(labels, promremote.Label{Name: "instance", Value: instance})
					labels = append(labels, promremote.Label{Name: "job", Value: job})

					v.ForEach(func(labelName, labelValue gjson.Result) bool {
						labels = append(labels, promremote.Label{Name: labelName.String(), Value: labelValue.String()})
						return true
					})
					ts := promremote.TimeSeries{}
					datapoint := promremote.Datapoint{Timestamp: now, Value: value.Get("metrics.0.value").Float()}
					ts.Labels = labels
					ts.Datapoint = datapoint
					timeSeriesList = append(timeSeriesList, ts)
					return true
				})
			} else {
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
					return true
				})
			}
		case "summary":

			quantiles := value.Get("metrics.#.quantiles")
			quantiles.ForEach(func(key, value gjson.Result) bool {
				// countKey := fmt.Sprintf("metrics.%s.count", key.String())
				// sumKey := fmt.Sprintf("metrics.%s.sum", key.String())

				count := value.Get("metrics.0.count").Float()
				sum := value.Get("metrics.0.sum").Float()
				fmt.Println("count - >", count)
				fmt.Println("sum - >", sum)

				fmt.Println("key - >", key)
				fmt.Println("value - >", value)
				return true
			})
			// quantilesExist := len(value.Get("metrics.#.quantiles").Array()) != 0
			// if quantilesExist {
			// 	quantiles := value.Get("metrics.#.quantiles")
			// 	fmt.Println("quantiles - >", quantiles)
			// 	quantiles.ForEach(func(key, qvalues gjson.Result) bool {
			// 		qvalues.ForEach(func(labelName, labelValue gjson.Result) bool {
			// 			fmt.Println("labelName - >", labelName)
			// 			fmt.Println("labelValue - >", labelValue)
			// 			return true
			// 		})
			// 		return true
			// 	})
			// }

			// // Ensure sum and count are also populated
			// fmt.Println("cpint value ", value.Get("metrics.#.count"))
			// fmt.Println("cpint sum ", value.Get("metrics.#.sum"))

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

	// /// Create payload start
	// for i := 0; i < 1000; i++ {
	// 	CreatePayload("http://demo.promlabs.com:10000/metrics")
	// 	CreatePayload("http://demo.promlabs.com:10001/metrics")
	// 	CreatePayload("http://demo.promlabs.com:10002/metrics")
	// 	time.Sleep(time.Millisecond * 500)
	// 	fmt.Println("Done writing - iteration #", i)
	// }
	// return
	// /// Create payload end

	now := time.Now()
	// payload1 := CreatePayload("http://demo.promlabs.com:10000/metrics")
	// payload2 := CreatePayload("http://demo.promlabs.com:10001/metrics")
	// payload3 := CreatePayload("http://demo.promlabs.com:10002/metrics")

	// fmt.Println(string(payload1))

	// timeSeriesList1 := parseAndReturn(payload1, now, "demo.promlabs.com:10000", "job")
	// timeSeriesList2 := parseAndReturn(payload2, now, "demo.promlabs.com:10001", "job")
	// timeSeriesList3 := parseAndReturn(payload3, now, "demo.promlabs.com:10002", "job")
	// timeserieses := [][]promremote.TimeSeries{timeSeriesList1, timeSeriesList2, timeSeriesList3}
	// // return
	// // create config and client
	// cfg := promremote.NewConfig(
	// 	promremote.WriteURLOption("http://localhost:5080/api/default/prometheus/api/v1/write"),
	// 	// promremote.WriteURLOption("http://localhost:9090/api/v1/write"),
	// 	promremote.HTTPClientTimeoutOption(60*time.Second),
	// )

	// client, err := promremote.NewClient(cfg)
	// if err != nil {
	// 	log.Fatal(fmt.Errorf("unable to construct client: %v", err))
	// }

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

	client := ooClient()
	headers := make(map[string]string)
	headers["Authorization"] = "Basic " + basicAuth("root@example.com", "Complexpass#123")

	options := promremote.WriteOptions{
		Headers: headers,
	}
	staticPayloads1 := ReadPayload(now, "demo.promlabs.com:10000", "job")
	for _, payload := range staticPayloads1 {
		result, err := client.WriteTimeSeries(context.Background(), payload, options)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(result)
	}

	staticPayloads2 := ReadPayload(now, "demo.promlabs.com:10001", "job")
	for _, payload := range staticPayloads2 {
		result, err := client.WriteTimeSeries(context.Background(), payload, options)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(result)
	}
	staticPayloads3 := ReadPayload(now, "demo.promlabs.com:10002", "job")
	for _, payload := range staticPayloads3 {
		result, err := client.WriteTimeSeries(context.Background(), payload, options)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(result)
	}
	// for _, timeSeriesList := range timeserieses {
	// 	result, err := client.WriteTimeSeries(context.Background(), timeSeriesList, options)
	// 	if err != nil {
	// 		log.Fatal(err)
	// 	}
	// 	log.Println(result)
	// }
	// ctx := context.Background()
	// result2, err := client.WriteTimeSeries(ctx, timeSeriesList, options)
	// if err != nil {
	// 	log.Fatal(err)
	// }
	// log.Println(result2)
}

func ooClient() promremote.Client {
	client := createClientInner("http://localhost:5080/api/default/prometheus/api/v1/write")
	return client
}

func createClientInner(url string) promremote.Client {
	// payloads1 := ReadPayload(now, "demo.promlabs.com:10000", "job")
	cfg := promremote.NewConfig(
		promremote.WriteURLOption("http://localhost:5080/api/default/prometheus/api/v1/write"),
		// promremote.WriteURLOption("http://localhost:9090/api/v1/write"),
		promremote.HTTPClientTimeoutOption(60*time.Second),
	)

	client, err := promremote.NewClient(cfg)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to construct client: %v", err))
	}
	return client
}
