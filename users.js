"use strict"

var auth = require('./auth');

//--------------------------------------------------------------------
// USERS HANDLING
//    r.server must be opuntia-mongo.Server
//    r._database must be set
// insert initial user script:
// use books
// db.users.insert({id:1, name:'Root User', login:'root',password:'root', _ct:0, _cu:0, _mt:0, _mu:0})

// Collection names
const USERS 	= "users";
const SESSIONS 	= "sessions";
const COUNTERS 	= "counters";

// SETTINGS
var settings={
	MIN_PASSWORD_LENGTH : 6,
	ENCRYPT_PASSWORD	: true
};


//------------------------------------------------------------
// INSERT 
// ID will be generated on the server
// r.session.user_id   must be set
var insertAction = async function(r){
	var user = r.data;
	// Verify data
	if(!user) throw "data is undefined";
	if(!user.login || !user.password) throw "user must contain 'login' and 'password' fields";
	if(user.password.length<settings.MIN_PASSWORD_LENGTH) throw "Too short password. Min password length is "+settings.MIN_PASSWORD_LENGTH;
	// Check login uniqueness
	user.login = user.login.toLowerCase();
	await checkLoginUniqueness(r, user.login);

	// Search MAX ID
	var max = 0;
	var cursor = r._database.collection(USERS).find({}, {projection:{_id:0, id:1}} );
	await cursor.forEach(function(u) {
		if(u.id>max) max=u.id;
	});

	// Ecrypt the password
	if(settings.ENCRYPT_PASSWORD){
		user.password = auth.encryptPassword(user.password);
	}

	// INSERT USER
	user.id = max+1;
	// Set modified stamps
	user._mt = new Date().getTime();		
	user._mu = r.session.user_id;		
	// Set created stamps (the same as modified here)
	user._ct = user._mt;		
	user._cu = user._mu;		
	// Insert
	await r._database.collection(USERS).insertOne(user);

	// return created user without password
	delete user.password;
	delete user._id;
	r.server.endWithSuccess(r, user);		
}

var checkLoginUniqueness = async function(r, login){
	let dublicate = await r._database.collection(USERS).findOne( {login:login} );
	if(dublicate) throw "User with the same login '"+dublicate.login+"' already exists";
}

//------------------------------------------------------------
// MODIFY - UPDATE FIELDS
var modifyAction = async function(r){
	var user = r.data;
	// Verify data
	if(!user)   throw "data is undefined";
	if(!user.id)throw "user must contain 'id' field";
	// Verify $unset
	if(r.data.$unset && ("id" in r.data.$unset || "login" in r.data.$unset || "password" in r.data.$unset))
		throw "id,login,password can't be unset";

	// Encrypt password if present
	if(user.$set && user.$set.password && settings.ENCRYPT_PASSWORD){
		user.$set.password = auth.encryptPassword(user.$set.password);
	}

	// Check unique login if need
	if(user.$set && user.$set.login){
		user.$set.login = user.$set.login.toLowerCase();
		await checkLoginUniqueness(r, user.$set.login);
	}

	// Update
	r.server.document_modify(USERS,r);
}

//------------------------------------------------------------
// REMOVE / RESTORE
var removeAction = function(r){
	r.server.document_remove(USERS,r);
}
var restoreAction = function(r){
	r.server.document_restore(USERS,r);
}

//------------------------------------------------------------
// DELETE Special function for wrongly added users
var deleteAction = function(r){
	var user = r.data;
	// Verify data
	if(!user){r.server.endWithError(r,"data is undefined"); return;}
	if(!user.id){r.server.endWithError(r,"user must contain 'id' field"); return;}
	// Ask app to check delete possibility
	//if(!app.onDeleteUser){ r.server.endWithError(r,"app.onDeleteUser must be implemented"); return;}
	//app.onDeleteUser(r,function(){
		// Delete record
		r._database.collection(USERS).deleteOne( {id: user.id}, null, function(err, result){
			if(err){r.server.endWithError(r,"deleteOne error "+err);	return;	}
			// Send OK
			r.server.endWithSuccess(r, result);
		});
	//});
}

//----------------------------------------------------------------------------
// EXPORT
exports.settings = settings;
exports.router = {
	insert : {
		h_post:{
			title: "Append a new user",
			testBody:{name:"Igor", login:"Igor", password:"igor"},
			requestBodyType: "json",
			action: insertAction
		}
	},
	modify : {
		h_post:{
			title:"Update some user's fields",
			descr:"Parameters:<br/>id - user identificator<br/>$set - used in MongoDB modify function",
			testBody: {"id":1, "$set":{"name":"Igor"}},
			requestBodyType: "json",
			action: modifyAction
		}
	},
	remove : {
		h_post:{
			title:"Remove user",
			descr:"Just set _removed flas for the user.<br/>Parameters:<br/>id - user identificator",
			testBody: {"id":1},
			requestBodyType: "json",
			action: removeAction
		}
	},
	restore : {
		h_post:{
			title:"Restore user",
			descr:"Clear _removed flas for the user.<br/>Parameters:<br/>id - user identificator",
			testBody: {"id":1},
			requestBodyType: "json",
			action: restoreAction
		}
	},
	del : {
		h_post:{
			title:"Delete user",
			descr:"Delete user record from database.<br/>Parameters:<br/>id - user identificator",
			testBody: {"id":2},
			requestBodyType: "json",
			action: deleteAction
		}
	}
};







































