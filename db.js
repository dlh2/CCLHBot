var mongodb = require('mongodb');
//////////CREATE CLASS//////////
var MongoClient = mongodb.MongoClient;
var dbm = Db.prototype;
//////////CONSTRUCTOR//////////
function Db(url, callback) {
	var g_object = this;
	MongoClient.connect(url, function (err, db) {
		if (err) callback({status: "ERR", msg: "ERR_CONNECT_DATABASE"});
		else {
			g_object.db = db;
			callback({status: "OK"});
		}
	});
}
/////dbmS/////
dbm.find = function(table, data, callback) {
	var g_object = this;
    g_object.db.collection(table).find(data).toArray(function (err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_SEARCH_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.limitFind = function(table, data, size, callback) {
	var g_object = this;
    g_object.db.collection(table).find(data).limit(size).toArray(function (err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_SEARCH_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.sortFind = function(table, find_data, sort_data, size, callback) {
	var g_object = this;
     g_object.db.collection(table).find(find_data).sort(sort_data).limit(size).toArray(function (err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_SORT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.sumax = function (table, field, match_data, callback){
	var g_object = this;
	g_object.db.collection(table).aggregate([{$match: match_data}, {$group: {_id: null, sum: {$sum: "$"+field}}}]).toArray(function(err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_GROUP_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
   });
};
dbm.count = function (table, match_data, callback){
	var g_object = this;
	g_object.db.collection(table).find(match_data).count(function(err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_COUNT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.insert = function (table, data, callback){
	var g_object = this;
	g_object.db.collection(table).insertOne(data, function (err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_INSERT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.insertMany = function (table, data, callback){
	var g_object = this;
	g_object.db.collection(table).insertMany(data, function (err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_INSERT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.update = function (table, find_data, new_data, callback){
	var g_object = this;
	g_object.db.collection(table).updateOne(find_data, {$set: new_data}, function(err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_UPDATE_TABLE", table: table});
			console.log(err);
		} else {
			if (r.result.ok != 1) callback({status: "ERR", msg: "ERR_UPDATE_TABLE", table: table});
			else if (typeof callback != "undefined") callback(r);
		}
	});
};
dbm.remove = function (table, data, callback){
	var g_object = this;
	g_object.db.collection(table).remove(data, function(err, r) {
		if (err) {
			if (typeof callback != "undefined") callback({status: "ERR", msg: "ERR_DELETE_TABLE", table: table});
			console.log(err);
		} else {
			if (r.result.ok != 1) callback({status: "ERR", msg: "ERR_DELETE_TABLE", table: table});
			else if (typeof callback != "undefined") callback(r);
		}
	});
};

//Export the db
module.exports = Db;