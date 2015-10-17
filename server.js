var express = require('express');
var serveStatic = require('serve-static');

var app = express();

app.use(serveStatic('public', {'index': ['index.html', 'index.htm']}));

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Jukebox server running at http://%s:%s', host, port);
});