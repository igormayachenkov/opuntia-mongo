"use strict"
const MongoClient = require('mongodb').MongoClient;
const opuntia = require("../../opuntia/");
const opuntiaMongo = require("../");

//-------------------------------------------------------------------------------------------------
// CONNECT TO MONGO
const mongoURL = 'mongodb://localhost:27017';
MongoClient.connect(mongoURL, function(err, mongo) {
	if(err){console.log("Can't connect to MongoDB server "+mongoURL+"\n"+err);return;}
	console.log("Connected successfully to MongoDB server "+mongoURL);

	// SET GLOBALS !!!
//	global.config = config;
//	global.mongo  = mongo;


	//-------------------------------------------------------------------------------------------------
	// CREATE & CONFIG API SERVER
	/*
	class MyInfo extends opuntiaMongo.Info{
		getDatabaseInfo(r){
			console.log('My database info');
			super.getDatabaseInfo(r);
		}
	}
	let info = new MyInfo();
	*/
	
	let auth  = opuntiaMongo.auth;
	let info  = opuntiaMongo.info;
	let users = opuntiaMongo.users;
	auth.settings.TOKEN_LENGTH    = 8;
	auth.settings.LOCAL_ID_LENGTH = 2;
	users.settings.MIN_PASSWORD_LENGTH = 4;

	var router = {
		$title: "The router example",
		h_get:{
			title:"Info",
			descr:"Public information about the API-server",
			action: function(r){r.server.endWithSuccess(r, {message:"API server base info"});}
		},
		// The router
		router: {
			$title: "Rourer",
			$descr: "The endpoint to load the router for documentation tool",
			h_get : opuntiaMongo.Server.getRouterHandler()
		},
		// HTML server
		doc: 	{
			$title: "Documentation HTML-server",
			$descr: "To load static content",
			_files:	opuntia.getLocalPath()+'/doc/',
			_default:'index.html',
			h_get: 	opuntia.files.get
		},
		// WEB API server
		books: {	
			$title: "Books",
			$descr: "The sample WEB API server",
			_database:	mongo.db("books"),
			_auth:		auth,
			h_get:{
				title:"Info",
				descr:"Public information about Books",
				skipAuth:true, 
				action: function(r){r.server.endWithSuccess(r, {message:"Books API public description"});}
			},
			auth:  auth.router,
			info:  info.router,
			users: users.router
		}
	};

	// CREATE & START API SERVER
	var server = new opuntiaMongo.Server(router,{
		PROTOCOL   	: 'http:',
		PORT       	: 8080
	});
	server.listen(function(){
		// START STATIC WEB SERVER
		var testUrl   = "http://localhost:"+server.config.PORT+"/doc/index.html";
		console.log("Open the next URL for test:\n"+testUrl);
	});

  }
);





