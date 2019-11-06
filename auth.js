"use strict"

//--------------------------------------------------------------------
// AUTHENTICATION SYSTEM IMPLEMENTATION
//    r.server must be opuntia-mongo.Server
//    r._database must be set

var cookie = require('cookie');
var crypto = require('crypto');
var counters = require("./counters.js");

var COOKIE_VALID_TIME = 31536000000;// 365 days

var COOKIE_NAME = 'session';

module.exports = class Auth{
	setCookieName(c){COOKIE_NAME=c;}

	//---------------------------------------------------------
	// ENCRYPT PASSWORD
	// rules: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf
	static encryptPassword(password,salt){
		if(!salt) salt = crypto.randomBytes(16).toString('hex');
		return {
			salt: 	salt,
			hash: 	crypto.scryptSync(password, salt, 64).toString('hex')
		}
	}

	//---------------------------------------------------------
	// MAIN AUTH VERIFICATION FUNCTION
	// To be called from the server
	checkAuthorized(r, next){
		//console.log("checkAuthorized");
	
		// Read token from cookie
		var token = null;
		if(r.request.headers.cookie) {
			//token = cookie.parse(r.request.headers.cookie)[COOKIE_NAME];
			token = cookie.parse(r.request.headers.cookie)[COOKIE_NAME];
			/*var cookies = r.request.headers.cookie.split(';');
			for(var i=0; i<cookies.length; i++){
				var cookie = cookies[i];
				if(cookie.indexOf(COOKIE_NAME+"=")>=0){
					token = cookie.slice(cookie.indexOf("=")+1);
					break;
				}
			}*/
		}
	
		//console.log("--- token: "+token);
	
		// VERIFY SESSION & DO NEXT WORK
		if(!token) {r.server.endUnauthorized(r, "Unauthorized");return;} // No token in cookies or token is null
		// Find a session by the token
		if(!r._database) {r.server.endWithErrorCode(r, 500, "database is undefined");return;}
		r._database.collection("sessions").findOneAndUpdate(
			{session:token}, 
			{$set:{access:new Date().getTime()}},
			{ 
				projection:{_id:0},
				returnOriginal: false // means returnNewDocument: true (see mongo driver doc)
			}, 
			function(err,result) {
				if(err)		{r.server.endWithError(r, "findOne error: "+err);return;}
				let session = result.value;
				if(!session){r.server.endUnauthorized(r, "token not found");return;} 
				
				// Add session to the route info
				r.session = session;
			
				// DO NEXT
				next();
		});
	}

	//----------------------------------------------------------------------------
	// LOGIN
	async login(r){
		try{
			// Verify data
			if(!r.data) 	 	 throw "the request data is empty";
			if(!r.data.login) 	 throw "login is undefined";
			if(!r.data.password) throw "password is undefined";
			r.data.login 	= r.data.login.trim();
			r.data.password = r.data.password.trim();

			// Find the user by login
			let user = await r._database.collection("users").findOne(
				//{login:	rq.data.login.toLowerCase()}, 
				{login:    { $regex: new RegExp("^" + r.data.login.toLowerCase(), "i") }},// case insennsitive login
				{// options
					projection:{_id:0} 
				}
			);

			// Verify if found
			if(!user) throw "Authorization failed"; // login not found

			// VERIFY PASSWORD
			if(!user.password.hash){
				// Old variant with open text passwords
				if(user.password !== r.data.password)
					throw "Authorization failed";
			}else{
				// Hashed password
				var encrypted = Auth.encryptPassword(r.data.password, user.password.salt);
				if(user.password.hash !== encrypted.hash)
					throw "Authorization failed";
			}
			
			// CREATE SESSION 
			// Prepare data,
			//var token = r.server.randomValueBase64(12);// Create random session value
			let token = crypto.randomBytes(16).toString('hex');// Create random session value
			var ts = new Date().getTime();
			var session = {
				session:		token, 
				user_id:		user.id, 
				group:			user.group, 
				time: 			ts,
				access:			ts
			};
			// save additional user info			//if(r.data.device_id) session.device_id = r.data.device_id;
			for(var key in r.data){
				if(key=="login") continue;
				if(key=="password") continue;
				if(session[key]) continue; // do not overwrite the session keys
				// Copy data
				session[key] = r.data[key]; 
			}
			// Insert document
			await r._database.collection("sessions").insertOne(session);

			// Generate common id_seed
			var id_seed = await counters.getNextValue(r._database, "id_seed");

			// Set cookie
			var dExp = new Date(ts + COOKIE_VALID_TIME);
			r.response.setHeader("Set-Cookie", COOKIE_NAME+"="+token+"; Path="+getCookiePath(r)+"; Expires="+dExp.toString()+";");//Date format https://tools.ietf.org/html/rfc7231#section-7.1.1.2
			//r.response.setHeader("Set-Cookie", COOKIE_NAME+"="+token+";Path=/;Expires="+dExp.toString()+";");//Date format https://tools.ietf.org/html/rfc7231#section-7.1.1.2

			// Send OK
			delete user.login;
			delete user.password;
			r.server.endWithSuccess(r, 
				{
					session:		token,
					id_seed:		id_seed,
					user:			user
				}
			);
		}catch(err){
			r.server.endWithError(r, err.toString());
		}
	}

	//----------------------------------------------------------------------------
	// LOGOUT 
	async logout(r){
		try{
			// Verify data
			if(!r.session.session) throw "session is undefined";

			// Modify database - make the session expired
			await r._database.collection("sessions").updateOne(
				{session:r.session.session},
				{$set:{logout:new Date().getTime()}}
			);
				
			// Clear cookie
			r.response.setHeader("Set-Cookie", COOKIE_NAME+"=empty;path="+getCookiePath(r)+";Max-Age=0;");

			// Send result
			r.server.endWithSuccess(r, {message:"logged out by user"});
		}catch(err){
			r.server.endWithError(r, err.toString());
		}
	}

	//----------------------------------------------------------------------------
	// GET INFO ABOUT THE LOGGED IN USER
	async info(r){
		try{
			let user = await r._database.collection("users").findOne(
					{id: r.session.user_id},
					{projection:{_id:0, login:0, password:0}}
				); 
			if(!user) return r.server.endWithErrorCode(r, 401, "user id not found, the session is invalid");
			if(user.password) delete user.password;//ensure that password is not visible
			// return user's data
			r.server.endWithSuccess(r, {
				//expires_after:	r.session.expires - new Date().getTime(),
				user: 			user
			});
		}catch(err){
			r.server.endWithError(r, err.toString());
		}
	}

	//----------------------------------------------------------------------------
	constructor(){	
		// STANDARD ROUTER
		this.router =	{
			logout: {
				h_get:{
					title: "Logout",
					action: this.logout
				}
			},
			info: {
				h_get:{
					title: "Get information about logged in user",
					action: this.info
				}
			},
			login: {
				h_post:{
					title: "Authenticate with login/password",
					testBody: {login:"root", password:"root"},
					requestBodyType: "json",
					skipAuth:true, 
					action: this.login 
				}
			}
		}
	}
}


// Calculate auth path
// must be set:
// 		r.path
//		r.authLevel
var getCookiePath = function(r){
	var p = "";
	for(var i=0; i<r.authLevel; i++) 
		p += "/" + r.path.segments[i];
	if(i==0) p="/";
	//console.log("getCookiePath ",p);
	return p;
}
