var http = require("http"),
	url = require("url");

function start(route, handle, authentication) {

	function onRequest(request, response) {

		var pathname = url.parse(request.url).pathname;

		console.log("Request for " + pathname + " received.");

		route(handle, pathname, response, request, authentication);

	}

	// IP defaults to 127.0.0.1
	var port = 8000;

	http.createServer(onRequest).listen(port);

	// Print friendly message to the terminal.
	console.log("Minty has started on port " + port);
}

exports.start = start;
