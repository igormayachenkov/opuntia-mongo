"use strict"
const opuntia   = require("../opuntia/");
const crypto    = require('crypto');

const TIME_BASE = 1451595600000;// const for ID calculation
const LOGS = "logs";

module.exports = class extends opuntia.Server {
	// Override: Log the request result
	logResult(r, error){
        let logdata = super.logResult(r, error);
		// Log to the database if exists 
		if(r._database){
			r._database.collection(LOGS).insertOne(logdata);
		}
  }

	//------------------------------------------------------------
	// UPDATE/INSERT WHOLE DOCUMENT
	// The document is cheated offline on the client
	// So ID must be fefined and be GUID
	document_update(collection, r, then){
		var doc = r.data;
		if(!doc){r.server.endWithError(r,"data is undefined"); return;}
		// Verify doc id
		if(!doc.id){r.server.endWithError(r,"id is undefined");return;}
		// Set modified stamps
		doc._mt = new Date().getTime();		
		doc._mu = r.session.user_id;		
		// Update/insert
		r._database.collection(collection).updateOne( { id : doc.id }, doc, { upsert : true }, function(err,commandResult) {
			if(err)	{r.server.endWithError(r,"Database error in collection.updateOne() "+err); return;}
			// Go next or send OK
			if(then){
				then();
			}else{
				var result = commandResult.result; // !!! see CommandResult
				result._mt = doc._mt;
				r.server.endWithSuccess(r, result);
			}
		});
	}

	// MODIFY - UPDATE DOCUMENT FIELDS (not insert)
	// data format: {id:xxx, $set:{}, $unset:{})
	document_modify(collection, r){
		if(!r.data){r.server.endWithError(r,"data is undefined"); return;}
		if(!r.data.$set && !r.data.$unset){r.server.endWithError(r,"empty request: $set or $unset must be defined"); return;}
		// Verify $unset
		if(r.data.$unset){
			if("id" in r.data.$unset){r.server.endWithError(r,"'id' field can't be unset"); return;}
			for(var key in r.data.$unset){
				if(key.charAt(0)=='_' && key.length==3){r.server.endWithError(r,"the internal server fields '_xx' can't be unset"); return;}
			}
		}
		// Verify and remove doc id
		var id = r.data.id;
		if(!id){r.server.endWithError(r,"id is undefined");return;}
		delete r.data.id;
		// Set modified stamps
		if(!r.data.$set) r.data.$set = {}
		r.data.$set._mt = new Date().getTime();		
		r.data.$set._mu = r.session.user_id;		
		// Update selected fields
		r._database.collection(collection).updateOne({id:id}, r.data, { upsert : false }, function(err,commandResult) {
			if(err)	{r.server.endWithError(r,"Database error in collection.updateOne() "+err); return;}
			// Check if id not found
			var result = commandResult.result; // !!! see CommandResult
			if(result.nModified==0){r.server.endWithError(r,"The document with id='"+id+"' is not found"); return;}
			// Send OK
			result._mt = r.data.$set._mt;
			r.server.endWithSuccess(r, result);
		});
	}

	// REMOVE DOCUMENT (just set _removed flag)
	// doc.id must exist 
	document_remove(collection, r){
		if(!r.data){r.server.endWithError(r,"data is undefined"); return;}
		// Fill modification fields
		r.data = {
			id		: r.data.id, // To prevent other fields modification		
			$set:{_removed: true}
		};
		// Update fields
		r.server.document_modify(collection,r);
	}

	// RESTORE DOCUMENT (just clear _removed flag)
	// doc.id must exist 
	document_restore(collection, r){
		if(!r.data){r.server.endWithError(r,"data is undefined"); return;}
		// Fill modification request
		r.data = {
			id		: r.data.id, // To prevent other fields modification		
			$unset:{_removed: null}
		};
		// Update fields
		r.server.document_modify(collection,r);
    }
    
	////////////////////////////////////////////////////////////////////////////////////////////////
	// GUID GENERATOR
	generateGUID(r){
		//	return String.format("%02X-%08X",
		//			User.instance().getUserID(),
		//			(System.currentTimeMillis()-TIME_BASE)/100 );
		var guid = r.session.user_id.toString(16) +
			"-" +
			(new Date().getTime()-TIME_BASE/100).toString(16);
		console.log("generateGUID "+guid);
		return guid;
	}

	// RANDOM GENERATORS
	// https://blog.tompawlak.org/generate-random-values-nodejs-javascript
	randomValueHex(len) {
		return crypto.randomBytes(Math.ceil(len/2))
			.toString('hex') // convert to hexadecimal format
			.slice(0,len);   // return required number of characters
	}
	randomValueBase64(len) {
		return crypto.randomBytes(Math.ceil(len * 3 / 4))
			.toString('base64')   // convert to base64 format
			.slice(0, len)        // return required number of characters
			.replace(/\+/g, '0')  // replace '+' with '0'
			.replace(/\//g, '0'); // replace '/' with '0'
	}


}