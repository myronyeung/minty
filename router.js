// index.js defines all the objects (which are functions) inside the handle object.
// requestHandlers.js holds the definitions for these functions.

function route(handle, pathname, response, request, authentication) {
	console.log("About to route a request for " + pathname);

	if (typeof handle[pathname] === "function") {
		handle[pathname](response, request, authentication);
	} else {
		// 404 Page.
		handle["/error"](response, request);
	}
}

exports.route = route;
