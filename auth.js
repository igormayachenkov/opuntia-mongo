"use strict"

//--------------------------------------------------------------------
// AUTHENTICATION SYSTEM IMPLEMENTATION
//    r.server must be opuntia-mongo.Server
//    r._database must be set

const cookie = require('cookie');
const crypto = require('crypto');
const counters = require("./counters.js");
const opuntia = require('opuntia');
const ApiError = opuntia.error.ApiError;


// Collection names
const USERS 	= "users";
const SESSIONS 	= "sessions";
const COUNTERS 	= "counters";

//----------------------------------------------------------------------------
// SETTINGS
var settings={
	TOKEN_LENGTH	  : 16, // generated token length in bytes
	LOCAL_ID_LENGTH   : 20, // localCounter length in bits. 0 - do not generate id_seed 
	COOKIE_NAME       : 'session', 	// cookie for token name
	COOKIE_VALID_TIME : 31536000000// 365 days
};

//---------------------------------------------------------
// ENCRYPT PASSWORD
// rules: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf
var encryptPassword = function(password,salt){
	if(!salt) salt = crypto.randomBytes(16).toString('hex');
	return {
		salt: 	salt,
		hash: 	crypto.scryptSync(password, salt, 64).toString('hex')
	}
}

//---------------------------------------------------------
// MAIN AUTH VERIFICATION FUNCTION
// To be called by opuntia framework
var checkAuthorized = async function(r){

	// Read token from cookie
	var token = null;
	if(r.request.headers.cookie) {
		//token = cookie.parse(r.request.headers.cookie)[settings.COOKIE_NAME];
		token = cookie.parse(r.request.headers.cookie)[settings.COOKIE_NAME];
		// var cookies = r.request.headers.cookie.split(';');
		// for(var i=0; i<cookies.length; i++){
		// 	var cookie = cookies[i];
		// 	if(cookie.indexOf(settings.COOKIE_NAME+"=")>=0){
		// 		token = cookie.slice(cookie.indexOf("=")+1);
		// 		break;
		// 	}
		// }
	}

	// VERIFY SESSION & DO NEXT WORK
	if(!token) throw new ApiError(401, "Unauthorized"); // No token in cookies or token is null
	// Find a session by the token
	if(!r._database) throw new ApiError( 500, "database is undefined");
	let result = await r._database.collection(SESSIONS).findOneAndUpdate(
		{session:token}, // query
		{$set:{access:new Date().getTime()}}, // update
		{ 
			projection:{_id:0},
			returnOriginal: false // means returnNewDocument: true (see mongo driver doc)
		}); 
	let session = result.value;
	if(!session) throw new ApiError(401, "token not found"); 
	
	// SUCCESS: Add session to the route info
	r.session = session;
}

//----------------------------------------------------------------------------
// LOGIN
var login = async function(r){
	// Verify data
	if(!r.data) 	 	 throw "the request data is empty";
	if(!r.data.login) 	 throw "login is undefined";
	if(!r.data.password) throw "password is undefined";
	r.data.login 	= r.data.login.trim();
	r.data.password = r.data.password.trim();

	// Find the user by login
	let user = await r._database.collection(USERS).findOne(
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
		var encrypted = encryptPassword(r.data.password, user.password.salt);
		if(user.password.hash !== encrypted.hash)
			throw "Authorization failed";
	}
	
	// CREATE SESSION 
	// Prepare data,
	//var token = r.server.randomValueBase64(12);// Create random token
	let token = crypto.randomBytes(settings.TOKEN_LENGTH).toString('hex');// Create random token
	var ts = new Date().getTime();
	var session = {
		session:		token, 
		user_id:		user.id, 
		group:			user.group, 
		time: 			ts,
		access:			ts
	};
	// Generate id_seed
	if(settings.LOCAL_ID_LENGTH){
		let counter = await counters.getNextValue(r._database.collection(COUNTERS), "id_seed");
		session.id_seed = counter<<settings.LOCAL_ID_LENGTH;
	}
	// save additional user info			//if(r.data.device_id) session.device_id = r.data.device_id;
	for(var key in r.data){
		if(key=="login") continue;
		if(key=="password") continue;
		if(session[key]) continue; // do not overwrite the session keys
		// Copy data
		session[key] = r.data[key]; 
	}
	// Insert document
	await r._database.collection(SESSIONS).insertOne(session);

	// Set cookie
	var dExp = new Date(ts + settings.COOKIE_VALID_TIME);
	r.response.setHeader("Set-Cookie", settings.COOKIE_NAME+"="+token+"; Path="+getCookiePath(r)+"; Expires="+dExp.toString()+";");//Date format https://tools.ietf.org/html/rfc7231#section-7.1.1.2
	//r.response.setHeader("Set-Cookie", settings.COOKIE_NAME+"="+token+";Path=/;Expires="+dExp.toString()+";");//Date format https://tools.ietf.org/html/rfc7231#section-7.1.1.2

	delete user.login;
	delete user.password;
	var output = {
		session:		token,
		user:			user
	}
	if(session.id_seed)
		output.id_seed = session.id_seed;

	// Send RESULT
	r.server.endWithSuccess(r, output);
}

//----------------------------------------------------------------------------
// LOGOUT 
var logout = async function(r){
	// Verify data
	if(!r.session.session) throw "session is undefined";

	// Modify database - make the session expired
	await r._database.collection(SESSIONS).updateOne(
		{session:r.session.session},
		{$set:{logout:new Date().getTime()}}
	);
		
	// Clear cookie
	r.response.setHeader("Set-Cookie", settings.COOKIE_NAME+"=empty;path="+getCookiePath(r)+";Max-Age=0;");

	// Send result
	r.server.endWithSuccess(r, {message:"logged out by user"});
}

//----------------------------------------------------------------------------
// GET INFO ABOUT THE LOGGED IN USER
var info = async function(r){
	let user = await r._database.collection(USERS).findOne(
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

// EXPORT
exports.settings = settings;
exports.checkAuthorized = checkAuthorized;
exports.encryptPassword = encryptPassword;
exports.router =	{
	logout: {
		h_get:{
			title: "Logout",
			action: logout
		}
	},
	info: {
		h_get:{
			title: "Get information about logged in user",
			action: info
		}
	},
	login: {
		h_post:{
			title: "Authenticate with login/password",
			testBody: {login:"root", password:"root"},
			requestBodyType: "json",
			skipAuth:true, 
			action: login 
		}
	}
}
