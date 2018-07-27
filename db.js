var mongodb = require('mongodb');
var ObjectID = require('mongodb').ObjectID;
//////////CREATE CLASS//////////
var MongoClient = mongodb.MongoClient;
var dbm = Db.prototype;
//////////CONSTRUCTOR//////////
function Db(url, db, callback) {
	g_object = this;
	g_object.db_url = url;
	g_object.db_name = db;
	MongoClient.connect(g_object.db_url, {useNewUrlParser: true}, function (err, database) {
		if (err) {
			callback({status: "ERR", msg: "ERR_CONNECT_DATABASE"});
			console.log("error while connecting: "+err);
		} else {
			const dbs = database.db(g_object.db_name);
			g_object.db = dbs;
			callback({status: "OK"});
		}
	});
}
/////dbmS/////
dbm.getObjectId = function(id){
	return new ObjectID(id);
};
dbm.find = function(table, data, callback) {
	var g_object = this;
    g_object.db.collection(table).find(data).toArray(function (err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_SEARCH_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
	});
};
dbm.limitFind = function(table, data, size, callback) {
	var g_object = this;
    g_object.db.collection(table).find(data).limit(size).toArray(function (err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_SEARCH_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
	});
};
dbm.sortFind = function(table, find_data, sort_data, size, callback) {
	var g_object = this;
     g_object.db.collection(table).find(find_data).sort(sort_data).limit(size).toArray(function (err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_SORT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
	});
};
dbm.groupSum = function (table, field, match_data, callback){
	var g_object = this;
	g_object.db.collection(table).aggregate([{$match: match_data}, {$group: {_id: null, sum: {$sum: "$"+field}}}]).toArray(function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_GROUP_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
   });
};
dbm.groupCount = function (table, field, match_data, callback){
	var g_object = this;
	g_object.db.collection(table).aggregate([{$match: match_data}, {$group: {_id: "$"+field, count: {$sum: 1}}}]).toArray(function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_GROUP_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
   });
};
dbm.getMax = function (table, field, match_data, callback){
	var g_object = this;
	//db.things.aggregate([ {$project:{ id: "$userId", count: {$size:{"$ifNull":["$Product",[]]} } }}, {$sort : {count : -1}}, { $limit : 1 } ])
	g_object.db.collection(table).aggregate([{$match: match_data}, {$group: {_id: "$"+field, count: {$sum: 1}}}, {$sort: {count: -1}}, {$limit: 1}]).toArray(function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_GROUP_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
   });
}
dbm.count = function (table, match_data, callback){
	var g_object = this;
	g_object.db.collection(table).find(match_data).count(function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_COUNT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
	});
};
dbm.insert = function (table, data, callback){
	var g_object = this;
	g_object.db.collection(table).insertOne(data, function (err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_INSERT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
	});
};
dbm.insertMany = function (table, data, callback){
	var g_object = this;
	g_object.db.collection(table).insertMany(data, function (err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_INSERT_TABLE", table: table});
			console.log(err);
		} else if (typeof callback == "function") callback(r);
	});
};
dbm.update = function (table, find_data, new_data, callback){
	var g_object = this;
	g_object.db.collection(table).updateOne(find_data, {$set: new_data}, function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_UPDATE_TABLE", table: table});
			console.log(err);
		} else {
			if (r.result.ok != 1) callback({status: "ERR", msg: "ERR_UPDATE_TABLE", table: table});
			else if (typeof callback == "function") callback(r);
		}
	});
};
dbm.updateMany = function (table, find_data, new_data, callback){
	var g_object = this;
	g_object.db.collection(table).updateMany(find_data, {$set: new_data}, function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_UPDATE_TABLE", table: table});
			console.log(err);
		} else {
			if (r.result.ok != 1) callback({status: "ERR", msg: "ERR_UPDATE_TABLE", table: table});
			else if (typeof callback == "function") callback(r);
		}
	});
};
dbm.remove = function (table, data, callback){
	var g_object = this;
	g_object.db.collection(table).remove(data, function(err, r) {
		if (err) {
			if (typeof callback == "function") callback({status: "ERR", msg: "ERR_DELETE_TABLE", table: table});
			console.log(err);
		} else {
			if (r.result.ok != 1) callback({status: "ERR", msg: "ERR_DELETE_TABLE", table: table});
			else if (typeof callback == "function") callback(r);
		}
	});
};

//Export the db
module.exports = Db;
