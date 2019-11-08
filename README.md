# opuntia-mongo. Store your data in MongoDB.
A plugin for 'opuntia' framework for using the it with MongoDB
Overrides Server class.
Contains three modules: auth, users, info
## Module Auth - Autorization
Implements opuntia auth interface (method async checkAuthorized(r)).
That allows use it as parameter in opuntia router.
Exports a router to with some endpoints (`login`, `logout`, `info`) too handle authorization requests.
Parameters:
* LOCAL_ID_LENGTH - localCounter length in bits. Default 20. 0 - do not generate id_seed 
* TOKEN_LENGTH - auth token length in bytes. Default 16.
* COOKIE_NAME - cookie for token name


## Module Users - User List
Allows to handle a common user list located in `users` collection.
## Module Info - Database Info
Exports some methods to get an information about the database. Mostly for development.
## On-the-Client ID Generation
### Requirements: 
* ID should be numeric for data volume minimization
* ID could be generated on the client without the backend connection
* ID can't exceed 53 bit number because of JavaScript features (ECMA Section 8.5 - Numbers)
### Solution:
**globalCounter(53-n bit) : localCounter(n bit)**
The backend keeps a global counter (auto-increment sequence). Each successful login generates and sends to the client an id_seed = globalCounter<<n. The client generates ID like: id_seed + localCounter (where localCounter is a local auto-increment sequence). 
## Settings
There are settings values, common for all modules:
* collection names (default values: `users`, `sessions`, `counters`, `logs`)

---
# Usage Example
```javascript
const opuntiaMongo = require("opuntia-mongo");
let auth  = new opuntiaMongo.Auth();
let users = new opuntiaMongo.Users();
let info  = new opuntiaMongo.Info();
// Modify settings
opuntiaMongo.settings.collectionNames.users = "clients";

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


