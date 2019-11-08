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
var insertAction = function(r){
	var user = r.data;
	// Verify data
	if(!user){r.server.endWithError(r,"data is undefined"); return;}
	if(!user.login || !user.password){r.server.endWithError(r,"user must contain 'login' and 'password' fields"); return;}
	if(user.password.length<settings.MIN_PASSWORD_LENGTH){r.server.endWithError(r,"Too short password. Min password length is "+settings.MIN_PASSWORD_LENGTH); return;}
	// Check unique login
	user.login = user.login.toLowerCase();
	r._database.collection(USERS).findOne( {login: user.login},{}, function(err, dublicate){
		if(err){r.server.endWithError(r,"findOne error "+err);	return;	}
		if(dublicate){r.server.endWithError(r,"User with the same login '"+dublicate.login+"' already exists");	return;	}
//		throw "the error";

		// Search MAX ID
		var max = 0;
		var cursor = r._database.collection(USERS).find({}, {_id:0, id:1});//, {_id:0});
		cursor.forEach(function(u) {
			if(u.id>max) max=u.id;
		}, function(err) {
			if(err){r.server.endWithError(r,"find error "+err);	return;	}

			// Ecrypt the password
			if(settings.ENCRYPT_PASSWORD){
				try{
					user.password = auth.encryptPassword(user.password);
				}catch(err){
					r.server.endWithError(r,"encryptPassword error: "+err); return;					
				}
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
			r._database.collection(USERS).insertOne(user, function(err,result) {
				if(err)	{r.server.endWithError(r,"Database error in users.insertOne() "+err); return;}
				// return created user without password
				delete user.password;
				delete user._id;
				r.server.endWithSuccess(r, user);		
			});
		});
	});
}

//------------------------------------------------------------
// MODIFY - UPDATE FIELDS
var modifyAction = function(r){
	var user = r.data;
	// Verify data
	if(!user){r.server.endWithError(r,"data is undefined"); return;}
	if(!user.id){r.server.endWithError(r,"user must contain 'id' field"); return;}
	// Verify $unset
	if(r.data.$unset && ("id" in r.data.$unset || "login" in r.data.$unset || "password" in r.data.$unset)){r.server.endWithError(r,"id,login,password can't be unset"); return;}

	// Encrypt password if present
	if(user.$set && user.$set.password){
		try{
			user.$set.password = auth.encryptPassword(user.$set.password);
		}catch(err){
			r.server.endWithError(r,"encryptPassword error: "+err); return;					
		}
	}

	// Check unique login if need
	if(user.$set && user.$set.login){
		user.$set.login = user.$set.login.toLowerCase();
		r._database.collection(USERS).findOne( {login: user.login},{}, function(err, dublicate){
			if(err){r.server.endWithError(r,"findOne error "+err);	return;	}
			if(dublicate){r.server.endWithError(r,"User with the same login already exists");	return;	}
			// Update
			r.server.document_modify(USERS,r);
		});
	}else{
		// Update
		r.server.document_modify(USERS,r);
	}
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







































