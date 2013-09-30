var http = require("http");
var url = require("url");

function start(route, handle) {
	function onRequest(request, response) {
		var pathname = url.parse(request.url).pathname;
		console.log("Request for " + pathname + " received.");
		route(handle, pathname, response, request);
	}

	// Listen on port 8000, IP defaults to 127.0.0.1
	http.createServer(onRequest).listen(8000);
	console.log("Minty has started.");
}

exports.start = start;