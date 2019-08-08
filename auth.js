"use strict"

//--------------------------------------------------------------------
// AUTHENTICATION SYSTEM IMPLEMENTATION
//    r.server must be opuntia-mongo.Server
//    r._database must be set

var cookie = require('cookie');
var crypto = require('crypto');

var SESSION_VALID_TIME = 31536000000;// 365 days

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
	
		// Read session value from cookie
		var sessionValue = null;
		if(r.request.headers.cookie) {
			//sessionValue = cookie.parse(r.request.headers.cookie)[COOKIE_NAME];
			sessionValue = cookie.parse(r.request.headers.cookie)[COOKIE_NAME];
			/*var cookies = r.request.headers.cookie.split(';');
			for(var i=0; i<cookies.length; i++){
				var cookie = cookies[i];
				if(cookie.indexOf(COOKIE_NAME+"=")>=0){
					sessionValue = cookie.slice(cookie.indexOf("=")+1);
					break;
				}
			}*/
		}
	
		//console.log("--- sessionValue: "+sessionValue);
	
		// VERIFY SESSION & DO NEXT WORK
		if(!sessionValue) {r.server.endUnauthorized(r, "No session in cookies or session is null");return;}
		// Find in sessions table
		if(!r._database) {r.server.endWithErrorCode(r, 500, "database is undefined");return;}
		r._database.collection("sessions").findOne({session:sessionValue}, {_id:0}, function(err,session) {
			if(err)		{r.server.endWithError(r, "findOne error: "+err);return;}
			if(!session){r.server.endUnauthorized(r, "session not found");return;} 
			
			// Verify if the session expired
	//		var ts = new Date().getTime();
	//		if(session.expires < ts) {r.server.endUnauthorized(r, "session expired");return;	}// 401 - Unautorized
			
			// Log the user's last access time
			//r._database.collection("sessions").updateOne({session:session.session},{$set:{last:ts}});
			
			r.session = session;
		
			// DO NEXT
			next();
		});
	}

	//----------------------------------------------------------------------------
	// LOGOUT 
	logoutAction(r){
		// Verify data
		if(!r.session.session){
			r.server.endWithError(r,"session is undefined");
			return;
		}

		// Modify database - make the session expired
		r._database.collection("sessions").updateOne({session:r.session.session},{$set:{expires:new Date().getTime()}}, function(err,result) {
			if(err)	{r.server.endWithError(r,"Database error in collection.updateOne() "+err); return;}
			
			// Clear cookie
			r.response.setHeader("Set-Cookie", COOKIE_NAME+"=empty;path="+getCookiePath(r)+";Max-Age=0;");

			// Send result
			r.server.endWithSuccess(r, {message:"logged out by user"});
		});
	}

	//----------------------------------------------------------------------------
	// GET INFO ABOUT THE LOGGED IN USER
	infoAction(r){
		r._database.collection("users").findOne(
			{id: r.session.user_id},
			{_id:0, login:0, password:0}, 
			function(err, user){
				if(err){r.server.endWithError(r,"findOne error "+err);	return;	}
				if(!user)return r.server.endWithErrorCode(r, 401, "user id not found, the session is invalid");
				if(user.password) delete user.password;//ensure that password is not visible
				// return user's data
				var ts = new Date().getTime();
				r.server.endWithSuccess(r, {
					expires_after:	r.session.expires - ts,
					user: 			user
				});
			}
		);
	}

	//----------------------------------------------------------------------------
	// LOGIN
	loginAction(r){
		// Verify data
		if(!r.data) 	 	 return r.server.endWithError(r,"the request data is empty");
		if(!r.data.login) 	 return r.server.endWithError(r,"login is undefined");
		if(!r.data.password) return	r.server.endWithError(r,"password is undefined");
		r.data.login 	= r.data.login.trim();
		r.data.password = r.data.password.trim();

		// Modify database
		r._database.collection("users").findOne(
			//{login:	rq.data.login.toLowerCase()}, 
			{login:    { $regex: new RegExp("^" + r.data.login.toLowerCase(), "i") }},// case insennsitive login
			{_id:0}, 
			function(err, user){
				if(err){r.server.endWithError(r,"findOne error "+err);	return;	}

				// Verify if found
				if(!user){
					r.server.endWithError(r,"Authorization failed"); // login not found
					return;
				}

				// VERIFY PASSWORD
				if(!user.password.hash){
					// Old variant with open text passwords
					if(user.password!==r.data.password){
						r.server.endWithError(r,"Authorization failed");
						return;
					}
				}else{
					// Hashed password
					console.log("Hashed!");
					try{
						var encrypted = Auth.encryptPassword(r.data.password, user.password.salt);
						if(user.password.hash !== encrypted.hash){
							r.server.endWithError(r,"Authorization failed");
							return;
						}
					}catch(err){
						r.server.endWithError(r,"Authorization error: "+err);
						return;
					}
				}
				
				// CREATE SESSION 
				// Prepare data,
				//var sessionValue = r.server.randomValueBase64(12);// Create random session value
				var sessionValue = crypto.randomBytes(16).toString('hex');// Create random session value
				var ts = new Date().getTime();
				var session = {
					session:		sessionValue, 
					user_id:		user.id, 
					group:			user.group, 
					time: 			ts,
					expires: 		ts + SESSION_VALID_TIME
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
				r._database.collection("sessions").insertOne(session, function(err,result) {
					if(err)	{r.server.endWithError(r,"Database error in collection.insertOne() "+err); return;}
					// Set cookie
					var dExp = new Date(session.expires);
					r.response.setHeader("Set-Cookie", COOKIE_NAME+"="+sessionValue+"; Path="+getCookiePath(r)+"; Expires="+dExp.toString()+";");//Date format https://tools.ietf.org/html/rfc7231#section-7.1.1.2
					//r.response.setHeader("Set-Cookie", COOKIE_NAME+"="+sessionValue+";Path=/;Expires="+dExp.toString()+";");//Date format https://tools.ietf.org/html/rfc7231#section-7.1.1.2
					// Send OK
					delete user.login;
					delete user.password;
					r.server.endWithSuccess(r, 
						{
							session:		sessionValue,
							expires_after:	session.expires - ts,					
							user:			user
						}
					);
				});
			}
		);
	}
	

	//----------------------------------------------------------------------------
	constructor(){	
		// STANDARD ROUTER
		this.router =	{
			logout: {
				h_get:{
					title: "Logout",
					action: this.logoutAction
				}
			},
			info: {
				h_get:{
					title: "Get information about logged in user",
					action: this.infoAction
				}
			},
			login: {
				h_post:{
					title: "Authenticate with login/password",
					testBody: {login:"root", password:"root"},
					requestBodyType: "json",
					skipAuth:true, 
					action: this.loginAction 
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
