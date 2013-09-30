// Lots of help reorganizing my server main, server, router, and request handler files came from The Node Beginner Book.
// Source: http://www.nodebeginner.org/

var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");

var handle = {}
handle["/"] = requestHandlers.start;
handle["/start"] = requestHandlers.start;
handle["/show"] = requestHandlers.show;

server.start(router.route, handle);