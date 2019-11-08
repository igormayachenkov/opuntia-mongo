# opuntia-mongo. Store your data in MongoDB.
A plugin for 'opuntia' framework for using the it with MongoDB
Overrides opuntia.Server class.
Contains three modules: auth, users, info
Used collection names (hardcoded now): `users`, `sessions`, `counters`, `logs`

## Module Auth - Autorization
Implements opuntia auth interface (method async checkAuthorized(r)).
That allows use it as parameter in opuntia router.
Exports a router to with some endpoints (`login`, `logout`, `info`) too handle authorization requests.
Settings:
* LOCAL_ID_LENGTH - localCounter length in bits. Default 20. 0 - do not generate id_seed 
* TOKEN_LENGTH - auth token length in bytes. Default 16.
* COOKIE_NAME - cookie for token name
## Module Users - User List
Allows to handle a common user list located in `users` collection.
Settings:
* MIN_PASSWORD_LENGTH - default 6
* ENCRYPT_PASSWORD - default true
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

---
# Usage Example
```javascript
const opuntiaMongo = require("opuntia-mongo");
let auth  = opuntiaMongo.auth;
let info  = opuntiaMongo.info;
let users = opuntiaMongo.users;
// Modify settings
auth.settings.TOKEN_LENGTH    = 8;
auth.settings.LOCAL_ID_LENGTH = 2;
users.settings.MIN_PASSWORD_LENGTH = 4;

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


