	// Load the http module to create an http server.
	var http = require('http'),
		fs = require("fs"),
		mustache = require("mustache");

	// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
	var demoData = [{ // dummy data to display
		"name": "Steve Balmer",
		"company": "Microsoft",
		"systems": [{
			"os": "Windows XP"
		}, {
			"os": "Vista"
		}, {
			"os": "Windows 7"
		}, {
			"os": "Windows 8"
		}]
	}, {
		"name": "Steve Jobs",
		"company": "Apple",
		"systems": [{
			"os": "OSX Lion"
		}, {
			"os": "OSX Leopard"
		}, {
			"os": "IOS"
		}]
	}, {
		"name": "Mark Z.",
		"company": "Facebook"
	}];

	var jiraData = [{
		"info": {
			"key": "ULIVE-123",
			"description": "Optimize performance"
		},
		"subtasks": [{
			"owner": "Bryan Morton",
			"estimate": "24h"
		}, {
			"owner": "Olive Oil",
			"estimate": "4h"
		}, {
			"owner": "Bryan Morton",
			"estimate": "1h"
		}]
	}, {
		"info": {
			"key": "ULIVE-456",
			"description": "Improve A11Y"
		},
		"subtasks": [{
			"owner": "Kiefer Luminosity",
			"estimate": "32h"
		}, {
			"owner": "Dov Wrench",
			"estimate": "1h"
		}]
	}];


	// Configure our HTTP server to respond with Hello World to all requests.
	var server = http.createServer(function(request, response) {
		response.writeHead(200, {
			//"Content-Type": "text/plain"
			"Content-Type": "text/html"
		});

		// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
		// Wrap the data in a global object... (mustache starts from an object then parses)
		var rData = {
			records: demoData,
			myTest: jiraData
		}; 
		var page = fs.readFileSync("experiments/experiment.html", "utf8"); // bring in the HTML file
		var html = mustache.to_html(page, rData); // replace all of the data

		//response.end("Hello World\n");
		response.end(html);
	});

	// Listen on port 8000, IP defaults to 127.0.0.1
	server.listen(8000);

	// Put a friendly message on the terminal
	console.log("Server running at http://127.0.0.1:8000/");