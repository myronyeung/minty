function route(handle, pathname, response, request) {
	console.log("About to route a request for " + pathname);

	// index.js defines all the objects (which are functions) inside the handle object.
	// requestHandlers.js holds the definitions for these functions.
	if (typeof handle[pathname] === 'function') {
		handle[pathname](response, request);
	} else {
		console.log("No request handler found for " + pathname);

		response.writeHead(404, {
			"Content-Type": "text/html"
		});
		response.write("<h2>404 Not found</h2>");
		response.write("<p>Please check your path again.</p>");

		response.end();
	}
}
exports.route = route;