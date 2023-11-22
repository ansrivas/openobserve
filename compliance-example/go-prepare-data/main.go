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

// Create a new array of labels
func createNewLabels(name, instance, job string) []promremote.Label {
	var labels []promremote.Label
	labels = append(labels, promremote.Label{Name: "__name__", Value: name})
	labels = append(labels, promremote.Label{Name: "instance", Value: instance})
	labels = append(labels, promremote.Label{Name: "job", Value: job})
	return labels
}

func basicAuth(username, password string) string {
	auth := username + ":" + password
	return base64.StdEncoding.EncodeToString([]byte(auth))
}

func ReadPayload(now time.Time, instance, job string) [][]promremote.TimeSeries {
	var lines [][]promremote.TimeSeries

	fname := FileMap[instance]
	log.Println("Reading file ", fname)
	file, err := os.Open(fname)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	thirtyMinutesAgo := now.Add(-60 * time.Minute)

	scanner := bufio.NewScanner(file)
	addFiveSeconds := 5 * time.Second
	// optionally, resize scanner's capacity for lines over 64K, see next example
	for scanner.Scan() {
		newNow := thirtyMinutesAgo.Add(addFiveSeconds)
		if newNow.After(now) {
			continue
		}

		timeseries := parseAndReturn(scanner.Bytes(), newNow, instance, job)
		lines = append(lines, timeseries)
		addFiveSeconds = addFiveSeconds + 5*time.Second
	}

	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
	return lines
}

func formatTimeSeries(timeseries []promremote.TimeSeries) string {
	var sb strings.Builder
	for _, ts := range timeseries {
		sb.WriteString("{")
		for j, label := range ts.Labels {
			sb.WriteString(label.Name)
			sb.WriteString("=")
			sb.WriteString("\"")
			sb.WriteString(label.Value)
			sb.WriteString("\"")

			if j != len(ts.Labels)-1 {
				sb.WriteString(", ")
			}
		}

		sb.WriteString("}")
		sb.WriteString(fmt.Sprintf(" %v", ts.Datapoint.Value))
		sb.WriteString("\n")
		sb.WriteString("Datapoint: ")
		sb.WriteString(fmt.Sprintf("Timestamp: %v, Value: %v", ts.Datapoint.Timestamp, ts.Datapoint.Value))
		sb.WriteString("\n")

	}
	return sb.String()
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

					labels := createNewLabels(name, instance, job)
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
					labels := createNewLabels(name, instance, job)

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
					labels := createNewLabels(name, instance, job)

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
					labels := createNewLabels(name, instance, job)

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
			quantiles.ForEach(func(qkey, qvalue gjson.Result) bool {
				baseQuantileKey := "quantile"
				countKey := fmt.Sprintf("metrics.%s.count", qkey.String())
				sumKey := fmt.Sprintf("metrics.%s.sum", qkey.String())

				qvalue.ForEach(func(qqkey, qqvalue gjson.Result) bool {
					labels := createNewLabels(name, instance, job)
					labels = append(labels, promremote.Label{Name: baseQuantileKey, Value: qqkey.String()})

					ts := promremote.TimeSeries{}
					datapoint := promremote.Datapoint{Timestamp: now, Value: qqvalue.Float()}
					ts.Datapoint = datapoint
					ts.Labels = labels
					timeSeriesList = append(timeSeriesList, ts)

					return true
				})
				count := value.Get(countKey)
				sum := value.Get(sumKey)

				sumLabel := fmt.Sprintf("%s_sum", name)
				labels_sum := createNewLabels(sumLabel, instance, job)
				ts := promremote.TimeSeries{}
				datapoint := promremote.Datapoint{Timestamp: now, Value: sum.Float()}
				ts.Datapoint = datapoint
				ts.Labels = labels_sum
				timeSeriesList = append(timeSeriesList, ts)

				countLabel := fmt.Sprintf("%s_count", name)
				labels_count := createNewLabels(countLabel, instance, job)
				ts = promremote.TimeSeries{}
				datapoint = promremote.Datapoint{Timestamp: now, Value: count.Float()}
				ts.Datapoint = datapoint
				ts.Labels = labels_count
				timeSeriesList = append(timeSeriesList, ts)

				// fmt.Println("count - >", count)
				// fmt.Println("sum - >", sum)

				// fmt.Println("qkey - >", qkey)
				// fmt.Println("qvalue - >", qvalue)
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
		case "histogram":
			eachHistogram := value.Get("metrics")
			eachHistogram.ForEach(func(hkey, hvalue gjson.Result) bool {
				newName := fmt.Sprintf("%s_bucket", name)
				labels := createNewLabels(newName, instance, job)
				hvalue.Get("labels").ForEach(func(labelKey, labelValue gjson.Result) bool {
					labels = append(labels, promremote.Label{Name: labelKey.String(), Value: labelValue.String()})
					return true
				})

				hvalue.Get("buckets").ForEach(func(bucketKey, bucketValue gjson.Result) bool {
					labelsNew := make([]promremote.Label, len(labels))
					copy(labelsNew, labels)
					labelsNew = append(labelsNew, promremote.Label{Name: "le", Value: bucketKey.String()})

					ts := promremote.TimeSeries{}
					datapoint := promremote.Datapoint{Timestamp: now, Value: bucketValue.Float()}
					ts.Datapoint = datapoint
					ts.Labels = labelsNew
					timeSeriesList = append(timeSeriesList, ts)
					return true
				})
				countKey := fmt.Sprintf("metrics.%s.count", hkey.String())
				sumKey := fmt.Sprintf("metrics.%s.sum", hkey.String())
				count := value.Get(countKey)
				sum := value.Get(sumKey)

				sumLabel := fmt.Sprintf("%s_sum", name)
				labels_sum := createNewLabels(sumLabel, instance, job)
				ts := promremote.TimeSeries{}
				datapoint := promremote.Datapoint{Timestamp: now, Value: sum.Float()}
				ts.Datapoint = datapoint
				ts.Labels = labels_sum
				timeSeriesList = append(timeSeriesList, ts)

				countLabel := fmt.Sprintf("%s_count", name)
				labels_count := createNewLabels(countLabel, instance, job)
				ts = promremote.TimeSeries{}
				datapoint = promremote.Datapoint{Timestamp: now, Value: count.Float()}
				ts.Datapoint = datapoint
				ts.Labels = labels_count
				timeSeriesList = append(timeSeriesList, ts)

				return true
			})
		default:
		}

		return true // keep iterating
	})
	return timeSeriesList
}

func publishData(payloads [][]promremote.TimeSeries) {
	ooClient := ooClient()
	promClient := prometheusClient()
	headers := make(map[string]string)
	headers["Authorization"] = "Basic " + basicAuth("root@example.com", "Complexpass#123")

	options := promremote.WriteOptions{
		Headers: headers,
	}
	for _, payload := range payloads {

		result, err := ooClient.WriteTimeSeries(context.Background(), payload, options)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(result)

		result, err = promClient.WriteTimeSeries(context.Background(), payload, options)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(result)
	}
}

func main() {

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

	staticPayloads1 := ReadPayload(now, "http://demo.promlabs.com:10000/metrics", "job")
	staticPayloads2 := ReadPayload(now, "http://demo.promlabs.com:10001/metrics", "job")
	staticPayloads3 := ReadPayload(now, "http://demo.promlabs.com:10002/metrics", "job")

	publishData(staticPayloads1)
	publishData(staticPayloads2)
	publishData(staticPayloads3)

}

func ooClient() promremote.Client {
	client := createClientInner("http://localhost:5080/api/default/prometheus/api/v1/write")
	return client
}

func prometheusClient() promremote.Client {
	client := createClientInner("http://localhost:9090/api/v1/write")
	return client
}

func createClientInner(url string) promremote.Client {
	cfg := promremote.NewConfig(
		promremote.WriteURLOption(url),
		promremote.HTTPClientTimeoutOption(60*time.Second),
	)

	client, err := promremote.NewClient(cfg)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to construct client: %v", err))
	}
	return client
}
