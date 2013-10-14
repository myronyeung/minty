
var querystring = require("querystring"),
	fs = require("fs"),
	util = require("util"),
	mustache = require("mustache"),
	helpers = require("./helpers");


function start(response, request, authentication) {
	console.log("Request handler 'start' was called.");

	// Thank you stackoverflow.com for a quick workaround for viewing objects with circular references: use util.inspect in Node.js.
	//console.log("response: " + util.inspect(response));

	//console.log("testFunction: " + testFunction().test);

	// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
	// Wrap the data in a global object... (mustache starts from an object then parses)
	var rData = {
		"finalData": {"foo": "bar"}
	};

	var page = fs.readFileSync("index.html", "utf8"), // bring in the HTML file
		html = mustache.to_html(page, rData); // replace all of the data

	response.writeHead(200, {
		"Content-Type": "text/html"
	});
	response.write(html);
	response.end();
}


function show(response) {
	console.log("Request handler 'show' was called.");
	fs.readFile("/tmp/test.png", "binary", function(error, file) {
		if (error) {
			response.writeHead(500, {
				"Content-Type": "text/plain"
			});
			response.write(error + "\n");
			response.end();
		} else {
			response.writeHead(200, {
				"Content-Type": "image/png"
			});
			response.write(file, "binary");
			response.end();
		}
	});
}


function error(response) {
	console.log("No request handler found, aka page not found.");

	response.writeHead(404, {
		"Content-Type": "text/html"
	});
	response.write("<h2>404 Not found</h2>");
	response.write("<p>Please check your path again.</p>");

	response.end();
}


exports.start = start;
exports.show = show;
exports.error = error;
