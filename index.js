
var _ = require('underscore');
var async = require('async');
var influx  = require('influx');

var charm = require('charm')();

charm.pipe(process.stdout);
charm.on('^C', function () {
  charm.down(2).column(0).foreground('white');
  process.exit();
});

var overallItemsCount=0;
var overallItemsIndex=0;

var timeStarted;

var keyPressed = '';


var collectionsInProgres  = {};
var collectionsIndex = 0;
var collectionsCount = 0;

var configuration =
{
  influxserver : {
    user        : 'root',
    password    : 'root',
    hostname    : 'localhost',
    port        : 8086
  },
  influxdb : {
    user        : 'dbuser',
    password    : '',
    hostname    : 'localhost',
    port        : 8086,
    database    : 'default'

  },
  logging         : true,
  limit           : 2,
  insertlimit     : 1000,
  itemsPerSeries  : 1000000,
  writeTimeout    : 100,
  seriesCount     : 100

};

var influxServer, influxDB;
var logBuffer = [];

var drawInterval = false;


var Influxbench = function(options)
{

  if (options.influxdb)
  {
    _.extend(configuration.influxdb,options.influxdb);
  }

  if (options.influxserver)
  {
    _.extend(configuration.influxserver,options.influxserver);
  }

  if (options.limit)
  {
    configuration.limit = options.limit;
  }
  if (options.logging)
  {
    configuration.logging = options.logging;
  }
  if (options.insertlimit)
  {
    configuration.insertlimit = options.insertlimit;
  }
  if (options.seriesCount)
  {
    configuration.seriesCount = options.seriesCount;
  }

  if (options.itemsPerSeries)
  {
    configuration.itemsPerSeries = options.itemsPerSeries;
  }
};

Influxbench.prototype.connect = function (cb)
{

  influxServer = influx(
      {
        host : configuration.influxserver.hostname,
        port : configuration.influxserver.port,
        username : configuration.influxserver.user,
        password : configuration.influxserver.password,
        database: configuration.influxserver.database
      }
  );

  influxDB = influx({
        host : configuration.influxdb.hostname,
        port : configuration.influxdb.port,
        username : configuration.influxdb.user,
        password : configuration.influxdb.password,
        database: configuration.influxdb.database

      }
  );
  influxDB.setRequestTimeout(null);
  influxServer.setRequestTimeout(null);
  cb();

};


Influxbench.prototype.updateCollection = function(seriesName,values)
{
  _.extend(collectionsInProgres[seriesName],values);
};


Influxbench.prototype.formatTime = function(time)
{
  var seconds = time / 1000;
  var minutes = seconds / 60;
  var hours = Math.floor(minutes / 60);

  minutes = Math.floor(minutes - hours*60);

  return hours+' hours '+minutes+' minutes';


};


Influxbench.prototype.draw = function()
{
  charm.reset();

  if (!configuration.logging)
  {
    return;
  }
  charm.foreground('white');
  charm.write('--=[log]=---------------------------\n');
  _.each(logBuffer,function(line)
  {
    charm.column(0);
    charm.write(line);
    charm.down();
  });
  charm.down(15-logBuffer.length);
  charm.column(0);

  var currentTime = new Date();
  var timeDiff = currentTime-timeStarted;

  var progress = 100 / overallItemsCount * overallItemsIndex;

  var estimatedTime = this.formatTime(timeDiff / progress * (100-progress));
  var elapsedTime = this.formatTime(timeDiff);

  var availableServers = influxDB.getHostsAvailable();
  var disabledServers = influxDB.getHostsDisabled();

  charm.write('Available Servers: ').foreground('green').write(availableServers.length.toString());
  charm.foreground('white').write(' / ');
  charm.write('Disabled Servers: ').foreground('red').write(disabledServers.length.toString());
  charm.foreground('white');
  charm.down();
  charm.column(0);
  charm.write('Insertimit: '+configuration.insertlimit+' ').write('writeTimeout: '+configuration.writeTimeout);
  charm.down();
  charm.column(0);

  charm.write('Overall progress ').foreground('green').write(Math.round(progress)+'%');
  charm.foreground('white').write('('+overallItemsIndex+'/'+overallItemsCount+')');
  charm.down();
  charm.column(0);
  charm.foreground('white').write('estimated time left: '+estimatedTime).write(' / elapsed: '+elapsedTime);
  charm.down();
  charm.column(0);
  charm.write('--=[current collections]=---------------------------\n');
  _.each(collectionsInProgres,function(col,name)
  {
    charm.column(0);
    charm.write(name);
    charm.column(30);
    charm.write(col.state);

    charm.column(45);
    charm.foreground('green');
    charm.write(Math.round(col.progress)+'%');
    charm.foreground('white');
    charm.column(50);
    var ips = Math.round(col.ips).toString();
    if (0 !== ips)
    {
      charm.foreground('blue').write(ips).write(' inserts/sec');
      charm.foreground('white');
    }
    charm.down();
  });
  charm.column(0);

};

Influxbench.prototype.log = function ()
{
  if (configuration.logging) {
    var date = new Date();
    var line = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds();
    line += ': '+_.values(arguments).join(' ');
    logBuffer.push(line);
    while (12 < logBuffer.length)
    {
      logBuffer.shift();
    }
  }
};

Influxbench.prototype.writePoints = function(seriesName,callbackSeries)
{
  var self = this;
  var startDump = new Date();
  var rowsSkipped = 0;
  var startMigration;

  var itemCount = configuration.itemsPerSeries;

  self.log('starting collection',seriesName,'containing',itemCount,'items');


  var jobCount = Math.ceil(itemCount/configuration.insertlimit);
  var insertJobs = [];
  for (var i=0; i<jobCount;++i)
  {
    insertJobs.push(i*configuration.insertlimit);
  }


  var overallIndex = 0;


  async.eachSeries(insertJobs,function(mongoOffset,callbackFind)
  {
    startDump = new Date();

    var index = 0;
    var lastIndex = 0;
    var buffer = [];
    self.updateCollection(seriesName,{state : 'reading',item:overallIndex});

    async.whilst(
        function () { return index < configuration.insertlimit && overallIndex < itemCount; },
        function (cb) {
          self.updateCollection(seriesName,{state : 'generating data'});

          var timestamp = new Date('2013/01/01 00:00:00').getTime();
          for (i=0; i < configuration.insertlimit;++i)
          {
            buffer.push({
              time        : timestamp,
              value_one   : Math.random(),
              value_two   : Math.random(),
              value_three : Math.random(),
              value_four  : Math.random(),
              value_five  : Math.random(),
              value_six   : Math.random(),
              value_seven : 'fancy string'
            });
            timestamp+= 30 * 1000;
          }
          index += configuration.insertlimit;
          overallIndex += configuration.insertlimit;
          process.nextTick(cb);
        },
        function (err) {
          self.log('generating data for',seriesName,buffer.length,'rows, took',(new Date()-startDump),'ms');
          startMigration = new Date();
          influxDB.writePoints(seriesName, buffer , {pool : false}, function(err) {

            if (err)
            {
              return callbackFind(err);
            }
            else {
              overallItemsIndex += buffer.length;
              buffer = null;
              var inserts = index-lastIndex;
              lastIndex=index;
              var diff = (new Date()-startMigration) / 1000;
              var ips = Math.round(inserts/ diff);
              startMigration = new Date();
              var progress = 100 / itemCount * (overallIndex);
              self.updateCollection(seriesName,{state : 'inserting',progress : progress,ips: ips,item:overallIndex});
              return setTimeout(callbackFind,configuration.writeTimeout);
//                        return callbackFind();
            }
          });

          // 5 seconds have passed
        }
    );
  },function(err)
  {
    if (err)
    {
      self.log('error migrating collection',seriesName);

    } else {
      var successRate = 100 / itemCount * (itemCount-rowsSkipped);
      self.log('collection',seriesName,'done, skipped',rowsSkipped,'rows, successrate:',successRate,'%');
    }
    collectionsInProgres[seriesName] = null;
    delete(collectionsInProgres[seriesName]);
    callbackSeries(err);
  });
};


Influxbench.prototype.bench = function(callback)
{

  var self = this;



  var stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  stdin.on('data', function(key){
    keyPressed = key;

    if ('w' === key) configuration.insertlimit += 100;
    if ('s' === key) configuration.insertlimit -= 100;

    if ('e' == key) configuration.writeTimeout += 10;
    if ('d' == key) configuration.writeTimeout -= 10;

    if (key == '\u0003') { process.exit(); }    // ctrl-c
  });
  drawInterval = setInterval(self.draw.bind(self),500);
  collectionsIndex = 0;


  var seriesCatalog = [];
  for (var i=1;i<=configuration.seriesCount;++i)
  {
    seriesCatalog.push('series_'+i);
  }
  overallItemsCount = configuration.seriesCount * configuration.itemsPerSeries;


  timeStarted = new Date();
  async.eachLimit(seriesCatalog,configuration.limit,function( seriesName, callbackSeries )
  {
    collectionsIndex++;
    self.log('next collection: ',seriesName);

    collectionsInProgres[seriesName] = {
      state       : '',
      progress    : 0,
      ips         : 0,
      item        : 0
    };
    console.log('collection',seriesName);
    self.writePoints(seriesName,callbackSeries);
  },callback);

};

module.exports = Influxbench;