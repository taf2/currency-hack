/*
  web service that will assist in converting currency
*/
const NODE_ENV  = process.env.NODE_ENV ? process.env.NODE_ENV : "development";
const Config    = require(__dirname + '/config')[NODE_ENV];
Config.port = (Config.port || process.env.PORT || 2337);
Config.addr = (Config.addr || process.env.ADDR || '127.0.0.1');
console.log(Config);

var URL         = require("url");
var HTTP        = require('http');
var QueryParser = require("querystring");
var HTMLParser  = require("htmlparser");
var Select      = require('soupselect').select;

var Server      = null;
var connections = [];
var IndexPage   = require('fs').readFileSync(__dirname + "/index.html");

function requestHandler(req,http_response) {
  var uri = URL.parse(req.url, true);

  if (uri.path.match(/convert.json/)) {
    connections.push(http_response.connection); // track this connection
    var currency = uri.query.currency;
    var amount   = uri.query.amount;

    // send request to http://www.google.com/finance/converter?a=1&from=AED&to=USD
    var fetchURI     = URL.parse("http://www.google.com/finance/converter?a=" + amount + "&from=" + currency + "&to=USD");
    var options = {host:fetchURI.hostname, port:fetchURI.port, path:fetchURI.path, search:fetchURI.search, agent:false, headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_4) AppleWebKit/536.11 (KHTML, like Gecko) Chrome/20.0.1132.27 Safari/536.11'
    }};
    var result = {};

    HTTP.get(options, function(res) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log("got %d", res.statusCode);
        var handler = new HTMLParser.DefaultHandler(function (error, dom) {
          result.amount = Select(dom, "#currency_converter_result .bld")[0].children[0].data;
          var response = JSON.stringify(result);
          http_response.writeHead(200, {"Content-Type": "text/json", "Content-Length": response.length});
          http_response.write(response);
          http_response.end();
        });
        var parser = new HTMLParser.Parser(handler);
        res.on('data', function (chunk) {
          parser.parseChunk(chunk);
          console.log("got chunk");
        }).on("end", function() {
          parser.done();  
        });
      } else {
        result.error = "unexpected result";
        var response = JSON.stringify(result);
        http_response.writeHead(200, {"Content-Type": "text/json", "Content-Length": response.length});
        http_response.write(response);
        http_response.end();
      }
    }).on("error", function(err) {
      result.error = err.message;
      var response = JSON.stringify(result);
      http_response.writeHead(200, {"Content-Type": "text/json", "Content-Length": response.length});
      http_response.write(response);
      http_response.end();
    });

  } else {
    http_response.writeHead(200, {"Content-Type": "text/html", "Content-Length": IndexPage.length});
    http_response.write(IndexPage);
    http_response.end();
  }
}

Server = HTTP.createServer(requestHandler);
Server.listen(Config.port, Config.addr);
Server.on("error", function(err) {
  console.error(err.message, err.stack);
});

function reapConnections() {
  console.log("conn check: %d", connections.length);
  connections = connections.filter(function(conn) {
    return !conn.destroyed;
  });
  setTimeout(reapConnections,5000);
}
setTimeout(reapConnections,5000);

process.on("uncaughtException", function(err) {
  console.error("Caught exception:", err, err.stack);
  connections.forEach(function(conn) { conn.end(); }); // force all connections to reset, something bad happened we don't know which connection, so we have to kill all connections...
  reapConnections();
  track("fetch.uncaughtException");
});

process.on("SIGQUIT", process.exit.bind(process,0));
process.on("SIGINT", process.exit.bind(process,1));
process.on("SIGTERM", process.exit.bind(process,1));
