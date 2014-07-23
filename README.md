# Influxbench

Influxbench is a little node module which generates random data and sends it to influxdb
via node-influx.
It has no real use, besides testing influxdb stability and insert performance. 


## Configuration

Option | Default | Description
------ | ------- | -----------
limit  | 2 | Sets the number of 'parallel' inserts. There's not real threading involved
insertlimit | 1000 | the number of points to generate/send per request
itemsPerSeries | 1000000 | number of items to insert per series
seriesCount | 100 | number of series to generate
writeTimeout | 100 | sets a timeout after each successful request to give influx some time to write the points


## Hidden features
While the process is running you can adjust the insertLimit and writeTimeout using your keyboard:

Keys w/s increase/decrease the insertlimit by 100

Keys e/d increase/decrease the writeTimeout by 10ms

License: MIT
Copyright: Steffen Konerow