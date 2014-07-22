
var Influxbench = require('./../index.js');

var influxbench = new Influxbench({

  influxdb : {
    user        : 'username',
    password    : 'password',
    hostname    : 'localhost',
    database    : 'database'
  },
  // number of 'parallel' running inserts
  limit         : 5,
  // number for series to generate
  seriesCount   : 100,

  //number for items to insert per series
  itemsPerSeries  : 1000000,

  //number of items to insert per request
  insertlimit : 1000
});

influxbench.connect(function(err)
{
  if (err)
  {
    throw err;
  } else {
    console.log('connected');
    influxbench.bench(function(err)
    {
      if (err)
      {
        throw err;
      } else {
        console.log('done');
        process.exit();
      }
    });
  }
});
