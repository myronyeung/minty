// Lots of help reorganizing my server main, server, router, and request handler files came from The Node Beginner Book.
// Source: http://www.nodebeginner.org/

// index.js defines all the objects (which are functions) inside the handle object.

var server = require("./server"),
	router = require("./router"),
	async = require("async"),
	requestHandlers = require("./requestHandlers"),
	helpers = require("./helpers"),
	authentication = {
		"jiraHost": "MISSING!",
		"myAuth": "MISSING!"
	};


async.series([
	function(callback) {
		authenticate(callback);
	}
],
// Callback
function(err, results) {
	authentication.jiraHost = results[0].jiraHost;
	authentication.myAuth = results[0].myAuth;

	console.log("Authentication: " + authentication.jiraHost + ", " + authentication.myAuth);

	var handle = {};
	handle["/"] = requestHandlers.start;
	handle["/index.html"] = requestHandlers.start;
	handle["/start"] = requestHandlers.start;
	handle["/show"] = requestHandlers.show;
	handle["/error"] = requestHandlers.error;

	server.start(router.route, handle, authentication);
});
