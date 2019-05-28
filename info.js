"use strict"

//--------------------------------------------------------------------
// THE DATABASE INFORMATION
// r.database must be set

module.exports = class {


	//--------------------------------------------------------------------
	// DATABASE
	// method get
	getDatabaseInfo(r){
		try{
			var info = {};
			// Get collections
			r.database.collections(function(err, collections) {
				if(err){
					r.server.endWithError(r,"db.collections error: "+err);
				}else{
					info.collections = [];
					// collections
					for(var key in collections){
						var col = collections[key];
						info.collections.push({name:col.collectionName});
					}
					// sizes
					loadCollectionCount(r, info, 0);
				}
			});
		}catch(e){
			r.server.endWithError(r,"Error:"+e.message);
		}
	}

	//----------------------------------------------------------------------------
	// FIND DATA IN COLLECTION
	// suggested method: POST
	postFindInCollection(r){
		// Get collection
		var collection 	= (r.data&&r.data.collection) ? r.data.collection : null;
		// Get query & projection
		var query 		= (r.data&&r.data.query) ? r.data.query : {};
		var projection 	= (r.data&&r.data.projection) ? r.data.projection : {_id:0};

		try{
			var cursor = r.database.collection(collection).find(query, projection);//, {_id:0});
			var list = [];
			cursor.forEach(function(doc) {
				list.push(doc);
			}, function(err) {
				r.server.endWithSuccess(r, list);
			});
		}catch(e){
			common.endWithError(r,e.message);
		}
	}

	
	//----------------------------------------------------------------------------
	constructor(){	
		// STANDARD ROUTER
		this.router =	{
			database:{
				h_get : {
					title:"Database info",
					descr:"Get information about active database: table list, rec number, etc",
					action: this.getDatabaseInfo
				}
			},
			find:{
				h_post : {
					title:"Select rows from a collection",
					descr:"Parameters:<br/>collection - collection name<br/>query<br/>projection",
					testBody: {collection:"users", query:{id:1}, projection:{_id:0}},
					requestBodyType: "json",
					action: this.postFindInCollection
				}
			}
		};
	}
}

var loadCollectionCount = function(r, info, i){
	// end request if finished
	if(i==info.collections.length){
		r.server.endWithSuccess(r, info);
		return;
	}
	var name=info.collections[i].name;
	//console.log(name+' start');
	r.database.collection(name).stats(function(err,s){				
		if(!err){
			var c = info.collections[i];
			c.count 	= s.count;
			c.size 		= s.size;
			c.avgObjSize= s.avgObjSize;
			//c.stats = s; // all stats info
		}
		i++;
		//console.log(name+' finish i:'+i);
		loadCollectionCount(r, info, i);
	});
		
}

