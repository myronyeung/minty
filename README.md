minty
=====

Resource Planning extension for GreenHopper. Within a sprint, display stories/bugs with task owners and their estimates. Basically make it easier to see who is working on what without additional mouse clicks. Also includes a tool to see how adding/removing stories/bugs will affect team capacity.

1. Configuration:
Create under minty: conf/settings.json

JSON looks like this:

{
	"jiraHost" : host, // "www.atlassian.net",
	"auth": username:password // "myronyeung:jira123"
}

Sources:
Why: http://ejohn.org/blog/keeping-passwords-in-source-control/
How: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js

