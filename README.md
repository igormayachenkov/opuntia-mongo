# opuntia-mongo. Store your data in MongoDB.
A plugin for 'opuntia' framework for using the it with MongoDB
Contains three modules: auth, users info
## Module Auth - Autorization
Implements opuntia auth interface (method checkAuthorized(r,next)).
That allows use it as parameter in opuntia router.
Exports a router to with some endpoints (`login`, `logout`, `info`) too handle authorization requests.
## Module Users - User List
Allows to handle a common user list located in a MongoDB collection.

## Module Info - Database Info
Exports some methods to get an information about the database. Mostly for development.

# Usage Example
```javascript
const opuntiaMongo = require("opuntia-mongo");
let auth  = new opuntiaMongo.Auth();
let users = new opuntiaMongo.Users();
let info  = new opuntiaMongo.Info();
let router = {
    // Private part
    portal: {	
        // Parameters
        ...
		_database:	mongo.db("portal"), // mongo - connected MongoDB client
        _auth: auth,
        // Branches
        auth:  auth.router, // handle requests /portal
		users: users.router,
		info:  info.router,
        ...
    }
}
new opuntiaMongo.Server(router).server.listen();
```
A working example is in 'test' folder of the project repository


