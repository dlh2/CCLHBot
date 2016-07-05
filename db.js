var mongodb = require('mongodb');
//////////CREATE CLASS//////////
var MongoClient = mongodb.MongoClient;
var dbm = Db.prototype;
//////////CONSTRUCTOR//////////
function Db(msg, url, callback) {
	var g_object = this;
	g_object.msg = msg;
	MongoClient.connect(url, function (err, db) {
		if (err) g_object.msg(msg.chat.id, "No se ha podido conectar a la base de datos");
		else {
			g_object.db = db;
			callback();
		}
	});
}
/////dbmS/////
dbm.find = function(table, data, room_id, callback) {
	var g_object = this;
    g_object.db.collection(table).find(data).toArray(function (err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al buscar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.limitFind = function(table, data, size, room_id, callback) {
	var g_object = this;
    g_object.db.collection(table).find(data).limit(size).toArray(function (err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al buscar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.sortFind = function(table, find_data, sort_data, size, room_id, callback) {
	var g_object = this;
     g_object.db.collection(table).find(find_data).sort(sort_data).limit(size).toArray(function (err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al ordenar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback(r);
	});
};
dbm.sumax = function (table, field, match_data, room_id, callback){
	var g_object = this;
	g_object.db.collection(table).aggregate([{$match: match_data}, {$group: {_id: null, sum: {$sum: "$"+field}}}]).toArray(function(err, result) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al agrupar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback(result);
   });
};
dbm.count = function (table, match_data, room_id, callback){
	var g_object = this;
	g_object.db.collection(table).find(match_data).count(function(err, result) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al contar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback(result);
	});
};
dbm.insert = function (table, data, room_id, callback){
	var g_object = this;
	g_object.db.collection(table).insertOne(data, function (err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al insertar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback();
	});
};
dbm.insertMany = function (table, data, room_id, callback){
	var g_object = this;
	g_object.db.collection(table).insertMany(data, function (err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al insertar en la tabla '"+table+"'.");
			console.log(err);
		} else if (typeof callback != "undefined") callback();
	});
};
dbm.update = function (table, find_data, new_data, room_id, callback){
	var g_object = this;
	g_object.db.collection(table).updateOne(find_data, {$set: new_data}, function(err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al modificar la tabla '"+table+"'.");
			console.log(err);
		} else {
			if (r.result.ok != 1) g_object.sendMessage(room_id, "Se ha producido un error al modificar la tabla '"+table+"'.");
			else if (typeof callback != "undefined") callback();
		}
	});
};
dbm.remove = function (table, data, room_id, callback){
	var g_object = this;
	g_object.db.collection(table).remove(data, function(err, r) {
		if (err) {
			g_object.sendMessage(room_id, "Se ha producido un error al borrar en la tabla '"+table+"'.");
			console.log(err);
		} else {
			if (r.result.ok != 1) g_object.sendMessage(room_id, "Se ha producido un error al borrar en la tabla '"+table+"'.");
			else if (typeof callback != "undefined") callback();
		}
	});
};

//Export the db
module.exports = Db;